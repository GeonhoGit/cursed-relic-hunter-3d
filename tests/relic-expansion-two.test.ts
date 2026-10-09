import { describe, expect, it } from 'vitest';
import { createRun, createDungeonRun, emptyInput, step } from '../src/core/simulation';
import { advanceProjectiles, damageEnemy } from '../src/core/combat';
import { RELICS, RELIC_IDS } from '../src/core/relics';
import { canAcquireRelic } from '../src/core/relic-acquisition';
import { advanceOrbits, ageRelicFields, beginThornTrail, crownOnHurt, gravityHit, orbitAfterFiring, pullGravity, thornDamage } from '../src/core/relic-fields';
import { advanceRelicTimers } from '../src/core/relic-survival';
import { splitShot } from '../src/core/projectile-effects';
import { createBoss, checkBossTransition } from '../src/core/boss';
import { createHeart, checkHeartTransition } from '../src/core/heart-boss';
import { beginGrowthRun, defaultProfile, growthRelicUnlocks } from '../src/core/growth';
import { SaveStore, defaultSettings, validRun } from '../src/persistence/save';
import { chooseRelic, prepareReward, rerollReward, roomReward } from '../src/core/expedition';
import { buyFromShop, refreshShop } from '../src/core/shop';
import { applyChainPull } from '../src/core/chain-hound';
import { reviveContract } from '../src/core/curses';
import 'fake-indexeddb/auto';
import type { Bullet, Enemy, RelicId, RunState } from '../src/core/model';

const additions = ['R06', 'R10', 'R15', 'R23'] as RelicId[];
function arena(relics: RelicId[] = []) {
  const s = createRun(42); s.phase = 'combat'; s.enemies = []; s.player.x = 300; s.player.y = 180;
  s.expedition!.relics = [...relics]; s.expedition!.acquired = [...relics]; return s;
}
function enemy(s: RunState, x = 450, y = 180): Enemy {
  const e: Enemy = { id: s.nextId++, kind: 'archer', x, y, hp: 100, maxHp: 100, angle: Math.PI,
    mode: 'recover', timer: 1000, targetX: 300, targetY: 180, flash: 0 }; s.enemies.push(e); return e;
}
function firing(s: RunState, count: number) {
  for (let i = 0; i < count; i++) { s.player.fireCooldown = 0; step(s, { ...emptyInput(), fire: true }); }
}
function basicHit(s: RunState, e: Enemy, kind?: 'split' | 'reflected') {
  s.bullets.push({ id: s.nextId++, x: e.x - 13, y: e.y, vx: 320, vy: 0, damage: 10, owner: 'player', life: 75, ...(kind ? { kind } : {}) });
  advanceProjectiles(s);
}
describe('second original relic additions', () => {
  it('registers four relics with their intended grades', () => {
    expect(RELIC_IDS).toHaveLength(57); expect(additions.map(id => RELICS[id]?.rarity)).toEqual(['rare', 'epic', 'rare', 'common']);
  });
  it('keeps thorn boots locked until the next departure G02 snapshot', () => {
    const s = arena(); expect(canAcquireRelic(s, 'R15')).toBe(false);
    s.growth = { id: 'next', investment: { health: 0, attack: 0, speed: 0, movement: 0, dodge: 0 }, relicUnlocks: ['R15'] } as any;
    expect(canAcquireRelic(s, 'R15')).toBe(true);
  });
  it('adds only one half-damage orbit after four actual shotgun volleys without delaying fire', () => {
    const s = arena(['R06' as RelicId]); s.weapon = 'W02'; enemy(s, 700); firing(s, 4);
    expect(s.stats.shots).toBe(4); expect(s.bullets).toHaveLength(20); expect(s.player.fireCooldown).toBe(36);
    expect((s as any).orbitShots).toHaveLength(1); expect((s as any).orbitShots[0]).toMatchObject({ ticks: 21, damage: 1.25 });
    expect((s.player as any).orbitCount).toBe(0);
  });
  it('releases after 21 ticks in the current aim direction with fixed speed and no generation effects', () => {
    const s = arena(['R06', 'R03', 'R07', 'R08', 'R09', 'R10', 'R04'] as RelicId[]); enemy(s, 700); firing(s, 4);
    s.bullets = []; const aim = { ...emptyInput(), aimX: 300, aimY: 360, aimPitch: .2 };
    for (let i = 0; i < 20; i++) step(s, aim); expect(s.bullets).toHaveLength(0);
    step(s, aim); const b = s.bullets.find(b => (b.kind as string) === 'orbit')!;
    expect(b).toBeDefined(); expect(b.damage).toBe(3.5); expect(b.vy).toBeGreaterThan(300);
    expect(Math.hypot(b.vx, b.vy, b.heightVelocity ?? 0)).toBeCloseTo(320);
    expect(b.life).toBe(59); expect((s as any).orbitShots).toBeUndefined();
  });
  it('creates one harmless gravity well on a basic hit and independent lightning cooldown', () => {
    const s = arena(['R09', 'R10'] as RelicId[]), e = enemy(s, 320), other = enemy(s, 360); basicHit(s, e);
    expect(e.hp).toBe(90); expect(other.hp).toBe(95);
    expect((s as any).gravityWell).toMatchObject({ ticks: 90 });
    expect((s.player as any).gravityCooldown).toBe(300); expect(s.player.lightningCooldown).toBe(72);
  });
  it.each(['split', 'reflected'] as const)('does not create gravity from %s', kind => {
    const s = arena(['R10' as RelicId]), e = enemy(s, 320); basicHit(s, e, kind);
    expect((s as any).gravityWell).toBeUndefined(); expect((s.player as any).gravityCooldown).toBeUndefined();
  });
  it('records only actual dodge movement as one thorn trail with snapshotted damage', () => {
    const s = arena(['R15' as RelicId]); enemy(s, 700); s.player.weakTicks = 180;
    step(s, { ...emptyInput(), dodge: true, moveX: 1 });
    const trail = (s as any).thornTrails?.[0]; expect(trail).toBeDefined(); expect(trail.damage).toBe(3.2);
    expect(trail.points).toEqual([{ x: 300, y: 180 }, { x: 305, y: 180 }]); expect(trail.ticks).toBe(120);
    for (let i = 0; i < 15; i++) step(s, emptyInput());
    expect((s as any).thornTrails).toHaveLength(1); expect((s.player as any).thornTrailId).toBeUndefined();
  });
  it('retaliates once after surviving real damage without canceling that damage', () => {
    const s = arena(['R23' as RelicId]), close = enemy(s, 340); enemy(s, 700);
    s.bullets = [{ id: s.nextId++, x: 310, y: 180, vx: -320, vy: 0, owner: 'enemy', damage: 10, life: 75 }];
    step(s, emptyInput()); expect(s.player.hp).toBe(90); expect(close.hp).toBe(88); expect((s.player as any).thornsCooldown).toBe(60);
  });
  it('does not retaliate from an invulnerable hit or after fatal damage', () => {
    for (const hp of [100, 5]) {
      const s = arena(['R23' as RelicId]); const close = enemy(s, 340); s.player.hp = hp; s.player.invulnerable = hp === 100 ? 30 : 0;
      s.bullets = [{ id: s.nextId++, x: 310, y: 180, vx: -320, vy: 0, owner: 'enemy', damage: 10, life: 75 }];
      step(s, emptyInput()); expect(close.hp).toBe(100); expect((s.player as any).thornsCooldown).toBeUndefined();
    }
  });
});

describe('relic field limits and survival rules', () => {
  it('counts actual firings rather than held-fire simulation ticks', () => {
    const s = arena(['R06']); enemy(s, 700);
    for (let i = 0; i < 20; i++) step(s, { ...emptyInput(), fire: true });
    expect(s.stats.shots).toBe(1); expect(s.player.orbitCount).toBe(1); expect(s.orbitShots).toBeUndefined();
  });
  it('shares the 120 generated projectile budget between flying, orbiting and split shots', () => {
    const s = arena(['R06', 'R03']), e = enemy(s);
    s.bullets = Array.from({ length: 119 }, () => ({ id: s.nextId++, kind: 'orbit' as const, x: 300, y: 180, vx: 320, vy: 0, owner: 'player' as const, damage: 3.5, life: 60 }));
    s.player.orbitCount = 3; orbitAfterFiring(s, 7, s.nextId, false); expect(s.orbitShots).toHaveLength(1);
    s.player.orbitCount = 3; orbitAfterFiring(s, 7, s.nextId, false); expect(s.orbitShots).toHaveLength(1);
    const pending: RunState['bullets'] = []; splitShot(s, { ...s.bullets[0], kind: undefined }, e, pending); expect(pending).toEqual([]);
  });
  it('releases from the player instead of the opposite side of a nearby wall', () => {
    const s = arena(['R06']); s.player.x = 201; s.player.y = 128; s.player.aim = 0;
    s.orbitShots = [{ id: s.nextId++, eventId: 0, ticks: 1, damage: 3.5, angle: 0, bouncesLeft: 0 }];
    advanceOrbits(s); expect(s.bullets[0].x).toBe(201); expect(s.bullets[0].y).toBe(128);
  });
  it('prevents orbit projectiles from generating secondary hit effects or returning', () => {
    const s = arena(['R06', 'R03', 'R04', 'R07', 'R08', 'R09', 'R10', 'R11']), e = enemy(s, 320); enemy(s, 360);
    basicHit(s, e); s.bullets = []; delete s.gravityWell; delete s.player.gravityCooldown; delete s.player.lightningCooldown;
    s.bullets = [{ id: s.nextId++, kind: 'orbit', x: 307, y: 180, vx: 320, vy: 0, damage: 3.5, owner: 'player', life: 60 }];
    delete e.burnTicks; delete e.burnPulse; delete e.frost; advanceProjectiles(s);
    expect(s.bullets).toEqual([]); expect(e.burnTicks).toBeUndefined(); expect(e.frost).toBeUndefined(); expect(e.silenceTicks).toBeUndefined();
    expect(s.gravityWell).toBeUndefined(); expect(s.player.lightningCooldown).toBeUndefined();
    s.bullets = [{ id: s.nextId++, kind: 'orbit', x: 300, y: 180, vx: 320, vy: 0, damage: 3.5, owner: 'player', life: 1 }];
    advanceProjectiles(s); expect(s.bullets).toEqual([]);
  });
  it('pulls only ordinary visible unfrozen enemies without moving the boss or dealing damage', () => {
    const s = arena(['R10']), pulled = enemy(s, 350), frozen = enemy(s, 360); frozen.frost = { hits: [], freezeTicks: 36, resistTicks: 216 };
    const grace = enemy(s, 330); grace.spawnTicks = 48;
    s.boss = createBoss(s); s.boss.x = 340; s.gravityWell = { id: s.nextId++, eventId: 0, x: 300, y: 180, ticks: 90 };
    pullGravity(s); expect(pulled.x).toBeCloseTo(350 - 50 / 60); expect(pulled.hp).toBe(100);
    expect(frozen.x).toBe(360); expect(grace.x).toBe(330); expect(s.boss.x).toBe(340);
    const hidden = enemy(s, 257, 127); s.gravityWell.x = 195; s.gravityWell.y = 127; pullGravity(s); expect(hidden.x).toBe(257);
    s.gravityWell.x = 300; s.gravityWell.y = 180; s.timeStop = { ticks: 30, enemyIds: [pulled.id], bulletIds: [] };
    const x = pulled.x; pullGravity(s); expect(pulled.x).toBe(x);
  });
  it('does not renew a well or reuse a pellet/return volley after cooldown', () => {
    const s = arena(['R10']); const b = { id: s.nextId++, eventId: 1, x: 300, y: 180, vx: 320, vy: 0, damage: 7, owner: 'player' as const, life: 75 };
    const sibling: Bullet = { ...b, id: s.nextId++ }; s.bullets = [b, sibling]; gravityHit(s, b); s.gravityWell!.ticks = 40; gravityHit(s, sibling);
    expect(s.gravityWell!.ticks).toBe(40); delete s.gravityWell;
    for (let i = 0; i < 300; i++) advanceRelicTimers(s, false);
    sibling.phase = 'return'; gravityHit(s, sibling); expect(s.gravityWell).toBeUndefined();
  });
  it('shares thorn damage intervals across overlapping trails and preserves full-slot lifetimes', () => {
    const s = arena(['R15']), e = enemy(s, 310); beginThornTrail(s, 4); beginThornTrail(s, 4);
    s.thornTrails![0].ticks = 80; beginThornTrail(s, 4); expect(s.thornTrails).toHaveLength(2); expect(s.thornTrails![0].ticks).toBe(80);
    thornDamage(s, damageEnemy); expect(e.hp).toBe(96); thornDamage(s, damageEnemy); expect(e.hp).toBe(96);
    s.tick += 29; thornDamage(s, damageEnemy); expect(e.hp).toBe(96);
    s.tick++; ageRelicFields(s); thornDamage(s, damageEnemy); expect(e.hp).toBe(92);
  });
  it('ends the recorded trail after a forced pull rather than drawing a damaging bridge', () => {
    const s = arena(['R15']); beginGrowthRun(s, defaultProfile().investment, 'pulled-trail', false, ['R14', 'R15']); enemy(s, 700);
    step(s, { ...emptyInput(), dodge: true, moveX: 1 }); const points = structuredClone(s.thornTrails![0].points);
    applyChainPull(s, { x: 360, y: 180 }); step(s, emptyInput());
    expect(s.thornTrails![0].points).toEqual(points); expect(s.player.thornTrailId).toBeUndefined(); expect(validRun(s)).toBe(true);
  });
  it('does not damage through walls or protected boss phases', () => {
    const s = arena(['R15', 'R23']), e = enemy(s, 257, 127); s.player.x = 195; s.player.y = 127;
    crownOnHurt(s, 12, damageEnemy); expect(e.hp).toBe(100);
    s.thornTrails = [{ id: s.nextId++, ticks: 120, damage: 4, points: [{ x: 203, y: 127 }, { x: 207, y: 127 }] }];
    thornDamage(s, damageEnemy); expect(e.hp).toBe(100);
    s.boss = createHeart(s); s.boss.x = 300; s.boss.y = 180; s.boss.pillarIndex = 0; s.boss.pillarHp = 100;
    s.player.x = 300; s.player.y = 180; delete s.player.thornsCooldown; const hp = s.boss.hp;
    crownOnHurt(s, 12, damageEnemy); beginThornTrail(s, 4); thornDamage(s, damageEnemy); expect(s.boss.hp).toBe(hp);
  });
  it('uses the boss body radius where the thorn trail touches its outer edge', () => {
    const s = arena(['R15']); s.boss = createBoss(s); s.boss.x = 320; s.boss.y = 180; s.boss.mode = 'recover';
    beginThornTrail(s, 4); thornDamage(s, damageEnemy); expect(s.boss.hp).toBe(1796);
    s.tick = 30; ageRelicFields(s); s.boss.x = 327; thornDamage(s, damageEnemy); expect(s.boss.hp).toBe(1796);
  });
  it.each(['R06', 'R10', 'R15'] as RelicId[])('immediately removes active %s fields lost in a revival without changing cooldowns', id => {
    const s = arena([id, 'R01', 'R38']); beginGrowthRun(s, defaultProfile().investment, 'lost-field', false, ['R14', 'R15']); s.tick = 20;
    s.player.orbitCount = id === 'R06' ? 3 : undefined;
    if (id === 'R06') s.orbitShots = [{ id: s.nextId++, eventId: 0, ticks: 21, damage: 3.5, angle: 0, bouncesLeft: 2 }];
    if (id === 'R10') { s.gravityWell = { id: s.nextId++, eventId: 0, x: 300, y: 180, ticks: 90 }; s.player.gravityCooldown = 300; }
    if (id === 'R15') { beginThornTrail(s, 4); s.player.dodgeRemaining = .2; }
    expect(validRun(s)).toBe(true); s.player.hp = 0; expect(reviveContract(s)).toBe(true);
    expect(s.revival!.lost).toContain(id); expect(s.orbitShots).toBeUndefined(); expect(s.gravityWell).toBeUndefined();
    expect(s.thornTrails).toBeUndefined(); expect(s.player.thornTrailId).toBeUndefined(); expect(validRun(s)).toBe(true);
    if (id === 'R06') expect(s.player.orbitCount).toBe(3);
    if (id === 'R10') expect(s.player.gravityCooldown).toBe(300);
  });
  it('retaliates after a bandage saves life and snapshots weakness, but obeys cooldown', () => {
    const s = arena(['R23', 'R20']), e = enemy(s, 340); enemy(s, 700); s.player.hp = 5;
    const hurt = () => { s.bullets = [{ id: s.nextId++, x: 310, y: 180, vx: -320, vy: 0, owner: 'enemy', damage: 10, life: 75 }]; step(s, emptyInput()); };
    hurt(); expect(s.player.hp).toBe(1); expect(e.hp).toBe(88); expect(s.expedition!.relics).not.toContain('R20');
    s.player.hp = 100; s.player.invulnerable = 0; hurt(); expect(e.hp).toBe(88);
    delete s.player.thornsCooldown; s.player.invulnerable = 0; s.player.weakTicks = 180; hurt(); expect(e.hp).toBeCloseTo(78.4);
  });
  it('clears fields on both boss transitions, leaving counters and cooldowns intact', () => {
    for (const heart of [false, true]) {
      const s = arena(additions); s.player.orbitCount = 2; s.player.gravityCooldown = 30; s.player.thornsCooldown = 20;
      beginThornTrail(s, 4); s.gravityWell = { id: s.nextId++, eventId: 0, x: 300, y: 180, ticks: 90 };
      s.orbitShots = [{ id: s.nextId++, eventId: 0, ticks: 20, damage: 3.5, angle: 0, bouncesLeft: 0 }];
      s.boss = heart ? createHeart(s) : createBoss(s); s.boss.hp = 800;
      if (heart) checkHeartTransition(s); else checkBossTransition(s);
      expect(s.orbitShots).toBeUndefined(); expect(s.gravityWell).toBeUndefined(); expect(s.thornTrails).toBeUndefined();
      expect(s.player.orbitCount).toBe(2); expect(s.player.gravityCooldown).toBe(30); expect(s.player.thornsCooldown).toBe(20);
    }
  });
});

describe('field save validation and growth compatibility', () => {
  function snapshot() {
    const s = arena(additions); s.tick = 20; beginGrowthRun(s, defaultProfile().investment, 'field-save', false, ['R14', 'R15']);
    s.player.orbitCount = 2; s.player.gravityCooldown = 300; s.player.thornsCooldown = 60;
    s.orbitShots = [{ id: s.nextId++, eventId: 0, ticks: 21, damage: 3.5, angle: 0, bouncesLeft: 0, vertical: true }];
    s.gravityWell = { id: s.nextId++, eventId: 0, x: 300, y: 180, ticks: 90 };
    beginThornTrail(s, 4); s.player.dodgeRemaining = .2; s.thornHits = [{ id: 100, tick: 20 }]; return s;
  }
  it('adds both G02 unlocks only to a new departure and retains old unlock snapshots', () => {
    const p = defaultProfile(); p.rooms = Array.from({ length: 5 }, (_, i) => ({ runId: `prior-${i}`, room: 1 }));
    expect(growthRelicUnlocks(p)).toEqual(['R14', 'R15']);
    const old = createRun(42); beginGrowthRun(old, p.investment, 'old-snapshot', false, ['R14']);
    expect(canAcquireRelic(old, 'R15')).toBe(false); expect(validRun(old)).toBe(true);
  });
  it('accepts active field snapshots and released orbit projectiles', () => {
    const s = snapshot(); expect(validRun(s)).toBe(true); s.orbitShots![0].ticks = 1; advanceOrbits(s, 0);
    expect(s.bullets[0].kind).toBe('orbit'); expect(validRun(s)).toBe(true);
  });
  it.each(['R06', 'R10', 'R15'] as RelicId[])('rejects active fields from a lost %s relic', id => {
    const s = snapshot(); s.expedition!.relics = s.expedition!.relics.filter(r => r !== id); expect(validRun(s)).toBe(false);
  });
  it('preserves an already released orbit projectile after the relic is lost', () => {
    const s = arena(['R06', 'R01', 'R38']); s.bullets = [{ id: s.nextId++, eventId: 0, kind: 'orbit', x: 300, y: 180,
      vx: 320, vy: 0, damage: 3.5, life: 60, owner: 'player', bouncesLeft: 2, hitIds: [] }];
    s.player.hp = 0; expect(reviveContract(s)).toBe(true); expect(s.bullets).toHaveLength(1); expect(validRun(s)).toBe(true);
  });
  it.each(['orbitShots', 'gravityWell', 'thornTrails', 'thornHits'] as const)('rejects malformed %s without throwing', key => {
    for (const value of [null, false, [null], { x: Infinity }]) {
      const s = snapshot(); (s as any)[key] = value; expect(validRun(s)).toBe(false);
    }
  });
  it('rejects impossible timers, counters, trail movement and generated budgets', () => {
    const changes = [(s: RunState) => s.player.orbitCount = 4, (s: RunState) => s.player.gravityCooldown = 301,
      (s: RunState) => s.player.thornsCooldown = 61, (s: RunState) => s.orbitShots![0].ticks = 22,
      (s: RunState) => s.gravityWell!.x = Infinity, (s: RunState) => s.thornTrails![0].points.push({ x: 400, y: 180 }),
      (s: RunState) => s.thornHits![0].tick = 21, (s: RunState) => s.expedition!.acquired = []];
    for (const change of changes) { const s = snapshot(); change(s); expect(validRun(s)).toBe(false); }
    const s = snapshot(); s.orbitShots = Array.from({ length: 121 }, () => ({ id: s.nextId++, eventId: 0, ticks: 21, damage: 3.5, angle: 0, bouncesLeft: 0 })); expect(validRun(s)).toBe(false);
  });
  it('round-trips all active effects and resumes deterministically', async () => {
    const name = 'relic-field-save', store = new SaveStore(name); await store.load();
    const profile = defaultProfile(); profile.rooms = Array.from({ length: 5 }, (_, i) => ({ runId: `prior-${i}`, room: 1 }));
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open(name, 1); request.onsuccess = () => resolve(request.result); });
    await new Promise<void>(resolve => { const tx = db.transaction('save', 'readwrite'); tx.objectStore('save').put({ schema: 1, content: 'prototype-0.13', revision: 0, savedAt: '2026-10-06', run: null, settings: defaultSettings(), profile }, 'current'); tx.oncomplete = () => resolve(); }); db.close(); await store.load();
    const s = snapshot(); enemy(s, 700); await store.save(s, defaultSettings()); const restored = (await store.load())!.run!;
    expect(restored).toEqual(s); for (let i = 0; i < 50; i++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s);
  });
  it('makes all four relics reachable in chest, reroll and shop pools while preserving the G02 gate', () => {
    const seen = [new Set<string>(), new Set<string>(), new Set<string>()];
    for (let i = 1; i <= 500; i++) {
      const seed = Math.imul(i, 0x9e3779b9) >>> 0, s = createDungeonRun(seed);
      beginGrowthRun(s, defaultProfile().investment, `unlocked-${seed}`, false, ['R14', 'R15']);
      s.expedition!.room = 6; s.phase = 'cleared'; const room = s.expedition!.dungeon!.rooms[6]; room.visited = room.cleared = true;
      prepareReward(s); roomReward(s)!.candidates.forEach(id => seen[0].add(id));
      expect(rerollReward(s)).toBe(true); roomReward(s)!.candidates.forEach(id => seen[1].add(id));
      expect(chooseRelic(s, roomReward(s)!.candidates[0])).toBe(true); expect(validRun(s)).toBe(true);
      const shop = createDungeonRun(seed); beginGrowthRun(shop, defaultProfile().investment, `shop-${seed}`, false, ['R14', 'R15']);
      shop.expedition!.room = 10; const node = shop.expedition!.dungeon!.rooms[10]; node.visited = node.cleared = true; shop.gold = 100;
      refreshShop(shop); node.shop!.slots.forEach(slot => { if (slot.relic) seen[2].add(slot.relic); });
      expect(buyFromShop(shop, 0, node.shop!.revision)).toBe('bought'); expect(validRun(shop)).toBe(true);
      const locked = createDungeonRun(seed); locked.expedition!.room = 6; locked.phase = 'cleared';
      locked.expedition!.dungeon!.rooms[6].visited = locked.expedition!.dungeon!.rooms[6].cleared = true;
      prepareReward(locked); expect(roomReward(locked)!.candidates).not.toContain('R15');
    }
    for (const id of additions) for (const pool of seen) expect(pool.has(id), `pool contains ${id}`).toBe(true);
  });
});
