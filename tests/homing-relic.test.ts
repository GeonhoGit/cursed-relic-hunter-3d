import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDungeonRun, createRun, emptyInput, step } from '../src/core/simulation';
import { advanceProjectiles } from '../src/core/combat';
import { createBoss } from '../src/core/boss';
import { BODY_HEIGHT } from '../src/core/fps-geometry';
import { chooseRelic, prepareReward, rerollReward, roomReward } from '../src/core/expedition';
import { refreshShop, buyFromShop } from '../src/core/shop';
import { grantRelic } from '../src/core/relic-acquisition';
import { RELICS, RELIC_IDS } from '../src/core/relics';
import { WEAPONS } from '../src/core/weapons';
import { SaveStore, defaultSettings, validRun } from '../src/persistence/save';
import type { Bullet, Enemy, RelicId, RunState, WeaponId } from '../src/core/model';

function room(ids: RelicId[] = ['R05']) {
  const s = createRun(42); s.phase = 'combat'; s.enemies = []; s.bullets = [];
  s.expedition!.relics = [...ids]; s.expedition!.acquired = [...ids]; return s;
}
function target(s: RunState, x = 400, y = 200, kind: Enemy['kind'] = 'archer') {
  const e: Enemy = { id: s.nextId++, kind, x, y, hp: 40, maxHp: 40, angle: 0,
    mode: 'recover', timer: 0, targetX: x, targetY: y, flash: 0 };
  s.enemies.push(e); return e;
}
function shot(s: RunState, overrides: Partial<Bullet> = {}) {
  const b: Bullet = { id: s.nextId++, x: 300, y: 180, height: 23, heightVelocity: 0,
    vx: 320, vy: 0, damage: 7, life: 75, owner: 'player', hitIds: [], ...overrides };
  s.bullets.push(b); return b;
}
function turn(a: number[], b: Bullet) {
  const v = [b.vx, b.vy, b.heightVelocity ?? 0];
  const dot = a.reduce((n, x, i) => n + x * v[i], 0) / (Math.hypot(...a) * Math.hypot(...v));
  return Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
}
function acquiredRun() {
  const s = createDungeonRun(42); s.expedition!.room = 6; s.phase = 'cleared';
  const chest = s.expedition!.dungeon!.rooms[6]; chest.visited = chest.cleared = true;
  chest.reward = { room: 6, candidates: ['R05'], choice: null }; chooseRelic(s, 'R05');
  s.expedition!.room = 1; const node = s.expedition!.dungeon!.rooms[1]; node.visited = true;
  node.template = 0; delete node.structure; s.phase = 'combat'; return s;
}

describe('tracker eye homing relic', () => {
  it('adds a rare relic with the original 150u range and 60 degree per second turn limit', () => {
    expect(RELIC_IDS).toContain('R05'); expect(RELICS.R05?.rarity).toBe('rare');
    expect(RELICS.R05?.description).toContain('6m'); expect(RELICS.R05?.description).toContain('60°');
  });
  it('turns only one degree per simulation tick while keeping speed, damage, lifetime and swept motion', () => {
    const s = room(); target(s); const b = shot(s); advanceProjectiles(s);
    expect(b.vy).toBeGreaterThan(0); expect(turn([320, 0, 0], b)).toBeCloseTo(1, 8);
    expect(Math.hypot(b.vx, b.vy, b.heightVelocity!)).toBeCloseTo(320, 8);
    expect(b.damage).toBe(7); expect(b.life).toBe(74);
    expect(b.x).toBeCloseTo(300 + b.vx / 60); expect(b.y).toBeCloseTo(180 + b.vy / 60);
  });
  it('uses one shared 3D angular limit when tracking a low body diagonally', () => {
    const s = room(); target(s, 400, 200, 'rat'); const b = shot(s, { height: 34 }); advanceProjectiles(s);
    expect(b.vy).toBeGreaterThan(0); expect(b.heightVelocity).toBeLessThan(0);
    expect(turn([320, 0, 0], b)).toBeCloseTo(1, 8); expect(b.height).toBeLessThan(34);
  });
  it('reaches a nearly aligned target direction without overshooting it', () => {
    const s = room(); target(s, 400, 180.2); const b = shot(s); advanceProjectiles(s);
    expect(Math.atan2(b.vy, b.vx)).toBeCloseTo(Math.atan2(0.2, 100), 8);
  });
  it.each([150, 150.001])('tracks targets at range %s according to the inclusive limit', distance => {
    const s = room(); target(s, 300, 180 + distance); const b = shot(s); advanceProjectiles(s);
    if (distance === 150) expect(b.vy).toBeGreaterThan(0); else expect(b.vy).toBe(0);
  });
  it('uses the nearest eligible target and resolves equal distances by the lower enemy ID', () => {
    const s = room(); const low = target(s, 400, 160), high = target(s, 400, 200);
    s.enemies = [high, low]; const b = shot(s); advanceProjectiles(s); expect(b.vy).toBeLessThan(0);
    const nearest = room(); target(nearest, 400, 160); target(nearest, 360, 200);
    const n = shot(nearest); advanceProjectiles(nearest); expect(n.vy).toBeGreaterThan(0);
  });
  it('ignores a nearer enemy behind a pillar and tracks a visible one without bypassing wall collisions', () => {
    const s = room(); target(s, 230, 130); target(s, 260, 195);
    const b = shot(s, { x: 190 }); advanceProjectiles(s); expect(b.vy).toBeGreaterThan(0);
    const blocked = room(); target(blocked, 230, 130);
    const straight = shot(blocked, { x: 190 }); advanceProjectiles(blocked); expect(straight.vy).toBe(0);
    const wall = room(); target(wall, 260, 130);
    shot(wall, { x: 200, y: 130, vx: 12000 }); advanceProjectiles(wall); expect(wall.bullets).toHaveLength(0);
  });
  it.each([false, true])('excludes dead and already hit targets, including the split origin (split=%s)', split => {
    const s = room(); target(s, 340, 160).hp = 0; const hit = target(s, 350, 160);
    const origin = target(s, 360, 160); const visible = target(s, 400, 200);
    const b = shot(s, { hitIds: [hit.id, ...(split ? [] : [origin.id])],
      ...(split ? { kind: 'split', originTargetId: origin.id, damage: 2.45, life: 36 } : {}) });
    advanceProjectiles(s); expect(b.vy).toBeGreaterThan(0); expect(visible.hp).toBe(40);
  });
  it.each(['transition', 'heart-shield', 'normal'] as const)('handles boss targeting in %s state', mode => {
    const s = room(); const boss = s.boss = createBoss(s);
    Object.assign(boss, { x: 340, y: 120, mode: mode === 'transition' ? 'transition' : 'recover' });
    if (mode === 'heart-shield') Object.assign(boss, { kind: 'relicheart', pillarIndex: 0 });
    target(s, 400, 200); const b = shot(s, { height: mode === 'normal' ? BODY_HEIGHT.gatekeeper / 2 : 23 });
    advanceProjectiles(s);
    if (mode === 'normal') expect(b.vy).toBeLessThan(0); else expect(b.vy).toBeGreaterThan(0);
  });
  it('never flips instantly for an exactly opposite or vertical direction and keeps stationary bullets finite', () => {
    const behind = room(); target(behind, 200, 180); const b = shot(behind); advanceProjectiles(behind);
    expect(b.vx).toBeGreaterThan(0); expect(turn([320, 0, 0], b)).toBeCloseTo(1, 8);
    const vertical = room(); target(vertical, 300, 180); const v = shot(vertical, { height: 120, vx: 0, heightVelocity: 320 });
    advanceProjectiles(vertical); expect(v.vx).toBeGreaterThan(0); expect(turn([0, 0, 320], v)).toBeCloseTo(1, 8);
    const still = room(); target(still); const zero = shot(still, { vx: 0 }); advanceProjectiles(still);
    expect([zero.vx, zero.vy, zero.heightVelocity]).toEqual([0, 0, 0]);
  });
  it('keeps enemy and reflected projectiles straight and gives returning shots player tracking priority', () => {
    for (const overrides of [{ owner: 'enemy' as const }, { kind: 'reflected' as const, damage: 15 }]) {
      const s = room(); target(s); const b = shot(s, overrides); advanceProjectiles(s); expect(b.vy).toBe(0);
    }
    const s = room(['R05', 'R04']); target(s); const b = shot(s, { phase: 'return' });
    advanceProjectiles(s); expect(b.vx).toBeLessThan(0); expect(b.vy).toBeCloseTo(0);
  });
  it('keeps legacy 2D shots horizontal and stops guidance when the relic is lost', () => {
    const s = room(); target(s); const b = shot(s); delete b.height; delete b.heightVelocity;
    advanceProjectiles(s); expect(b.vy).toBeGreaterThan(0); expect(b.heightVelocity).toBeUndefined();
    const velocity = [b.vx, b.vy]; s.expedition!.relics = [];
    advanceProjectiles(s); expect([b.vx, b.vy]).toEqual(velocity);
  });
  it('steers a piercing shot past the enemy it already hit, then keeps natural return and player tracking', () => {
    const s = room(['R05', 'R02', 'R04']); const first = target(s, 320, 180); target(s, 390, 200);
    const b = shot(s); for (let i = 0; i < 3; i++) advanceProjectiles(s);
    expect(first.hp).toBe(33); expect(b.hitIds).toContain(first.id); expect(b.vy).toBeGreaterThan(0);
    b.life = 1; advanceProjectiles(s); expect(b.phase).toBe('return'); expect(b.hitIds).toEqual([]);
    advanceProjectiles(s); expect(b.vx).toBeLessThan(0); expect(first.hp).toBe(33);
  });
  it('corrects a slightly missed shot into a real hit without increasing its damage', () => {
    for (const homing of [false, true]) {
      const s = room(homing ? ['R05'] : []); const e = target(s); shot(s);
      for (let i = 0; i < 22; i++) advanceProjectiles(s);
      expect(e.hp).toBe(homing ? 33 : 40);
    }
  });
  it.each<WeaponId>(['W01', 'W02', 'W03', 'W04'])('guides every %s pellet without changing fire timing or increased projectile speed', weapon => {
    const s = acquiredRun(); s.weapon = weapon; s.player.x = 300; s.player.y = 180;
    grantRelic(s, 'R55'); target(s); step(s, { ...emptyInput(), fire: true, aimX: 600, aimY: 180, aimPitch: 0 });
    const w = WEAPONS[weapon]; expect(s.bullets).toHaveLength(w.pellets);
    s.bullets.forEach((b, i) => {
      const a = w.pellets === 1 ? 0 : (i / (w.pellets - 1) - 0.5) * w.spread * Math.PI / 180;
      expect(turn([Math.cos(a), Math.sin(a), 0], b)).toBeCloseTo(1, 7);
      expect(Math.hypot(b.vx, b.vy, b.heightVelocity!)).toBeCloseTo(w.speed * 1.2);
      expect(b.damage).toBe(w.damage);
    });
    expect(s.player.fireCooldown).toBe(w.interval);
  });
  it('saves curved velocity and resumes the same simulation without recording a transient target', async () => {
    const s = acquiredRun(); target(s); shot(s); s.tick++; advanceProjectiles(s);
    expect(s.bullets[0].vy).toBeGreaterThan(0); expect(validRun(s)).toBe(true);
    const store = new SaveStore('tracker-eye-curved-shot'); await store.load(); await store.save(s, defaultSettings());
    const restored = (await store.load())!.run!; expect(restored).toEqual(s);
    for (let i = 0; i < 60; i++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s); expect(validRun(restored)).toBe(true);
  });
  it('appears in real chest, reroll and shop pools, can be bought only once and does not carry into a new run', () => {
    const seen = { chest: false, reroll: false, shop: false };
    for (let seed = 1; seed <= 400; seed++) {
      const s = createDungeonRun(Math.imul(seed, 0x9e3779b1) >>> 0); s.expedition!.room = 6; s.phase = 'cleared';
      const node = s.expedition!.dungeon!.rooms[6]; node.visited = node.cleared = true;
      prepareReward(s); seen.chest ||= roomReward(s)!.candidates.includes('R05');
      rerollReward(s); seen.reroll ||= roomReward(s)!.candidates.includes('R05');
      node.reward = null; s.expedition!.room = 10; node.visited = node.cleared = false;
      const shopNode = s.expedition!.dungeon!.rooms[10]; shopNode.visited = shopNode.cleared = true; s.phase = 'explore';
      refreshShop(s); seen.shop ||= shopNode.shop!.slots.some(slot => slot.relic === 'R05');
    }
    expect(seen).toEqual({ chest: true, reroll: true, shop: true });
    const s = createDungeonRun(42); s.expedition!.room = 10; s.gold = 24;
    const node = s.expedition!.dungeon!.rooms[10]; node.visited = node.cleared = true;
    refreshShop(s); const stock = node.shop!; stock.slots[0].relic = 'R05';
    if (stock.slots[1].relic === 'R05') stock.slots[1].relic = 'R01';
    expect(buyFromShop(s, 0, stock.revision)).toBe('bought'); expect(grantRelic(s, 'R05')).toBe(false);
    expect(validRun(s)).toBe(true); expect(createDungeonRun(42).expedition!.relics).toEqual([]);
  });
});
