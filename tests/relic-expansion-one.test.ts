import { describe, expect, it } from 'vitest';
import { createRun, createDungeonRun, emptyInput, step } from '../src/core/simulation';
import { advanceProjectiles } from '../src/core/combat';
import { grantRelic, canAcquireRelic } from '../src/core/relic-acquisition';
import { healAfterCombat } from '../src/core/survival-relics';
import { applyChainPull } from '../src/core/chain-hound';
import { RELICS, RELIC_IDS } from '../src/core/relics';
import 'fake-indexeddb/auto';
import { SaveStore, defaultSettings, validRun } from '../src/persistence/save';
import { beginGrowthRun, defaultProfile, growthRelicUnlocks } from '../src/core/growth';
import { fireStarlight, lightningHit, wardPoint } from '../src/core/relic-combat';
import { createBoss } from '../src/core/boss';
import { createHeart } from '../src/core/heart-boss';
import { enterNextRegion } from '../src/core/region';
import { chooseRelic, prepareReward, rerollReward, roomReward } from '../src/core/expedition';
import { buyFromShop, refreshShop } from '../src/core/shop';
import { damageEnemy } from '../src/core/combat';
import { cleanseStatus, advanceRelicTimers } from '../src/core/relic-survival';
import type { Enemy, RelicId, RunState } from '../src/core/model';

const ids = ['R09', 'R14', 'R19', 'R21', 'R22', 'R29'] as RelicId[];
function arena(relics: RelicId[] = []) {
  const s = createRun(42); s.phase = 'combat'; s.enemies = []; s.bullets = [];
  s.player.x = 300; s.player.y = 180; s.expedition!.relics = [...relics]; s.expedition!.acquired = [...relics];
  return s;
}
function target(s: RunState, x: number, y = 180, kind: Enemy['kind'] = 'archer') {
  const e: Enemy = { id: s.nextId++, kind, x, y, hp: 100, maxHp: 100, angle: 0, mode: 'recover', timer: 200,
    targetX: 300, targetY: 180, flash: 0 }; s.enemies.push(e); return e;
}
function hit(s: RunState, e: Enemy, extra = {}) {
  s.bullets.push({ id: s.nextId++, x: e.x - 13, y: e.y, vx: 320, vy: 0, owner: 'player', damage: 10, life: 75, ...extra });
  advanceProjectiles(s);
}
describe('first six original relic additions', () => {
  it('registers exactly six new relics with the intended grades', () => {
    expect(RELIC_IDS).toHaveLength(57);
    expect(ids.map(id => RELICS[id]?.rarity)).toEqual(['epic', 'epic', 'rare', 'common', 'rare', 'common']);
  });
  it('keeps G02 and G06 relics locked until the departure unlock snapshot', () => {
    const s = arena(); expect(canAcquireRelic(s, 'R14')).toBe(false); expect(canAcquireRelic(s, 'R29')).toBe(false);
    s.growth = { id: 'test', investment: { health: 0, attack: 0, speed: 0, movement: 0, dodge: 0 }, relicUnlocks: ['R14', 'R29'] } as any;
    expect(canAcquireRelic(s, 'R14')).toBe(true); expect(canAcquireRelic(s, 'R29')).toBe(true);
  });
  it('chains half of the hit damage through at most three other enemies', () => {
    const s = arena(['R09' as RelicId]); const origin = target(s, 320);
    const others = [target(s, 365), target(s, 410), target(s, 455), target(s, 500)]; hit(s, origin);
    expect(origin.hp).toBe(90); expect(others.map(e => e.hp)).toEqual([95, 95, 95, 100]);
    expect((s.player as any).lightningCooldown).toBe(72);
  });
  it('does not chain behind a wall, into dead targets or from split/reflected shots', () => {
    for (const kind of ['split', 'reflected']) {
      const s = arena(['R09' as RelicId]); const e = target(s, 320), other = target(s, 360); hit(s, e, { kind });
      expect(other.hp).toBe(100); expect((s.player as any).lightningCooldown).toBeUndefined();
    }
    const s = arena(['R09' as RelicId]); const e = target(s, 190, 127), hidden = target(s, 257, 127), dead = target(s, 185, 135); dead.hp = 0;
    hit(s, e); expect(hidden.hp).toBe(100); expect((s.player as any).lightningCooldown).toBeUndefined();
  });
  it('shares the lightning cooldown across pellets and return hits', () => {
    const s = arena(['R09' as RelicId]); const e = target(s, 320), other = target(s, 360); hit(s, e); hit(s, e, { phase: 'return' });
    expect(other.hp).toBe(95);
  });
  it('cannot trigger lightning again from a surviving pellet or return of the same volley after recharge', () => {
    const s = arena(['R09']); const e = target(s, 320), other = target(s, 360);
    const b = { id: s.nextId++, eventId: 999, x: 320, y: 180, vx: 320, vy: 0, owner: 'player' as const, damage: 10, life: 75 };
    const sibling = { ...b, id: s.nextId++ }; s.bullets = [b, sibling];
    lightningHit(s, e, b, damageEnemy); for (let i = 0; i < 72; i++) advanceRelicTimers(s, false);
    lightningHit(s, e, sibling, damageEnemy); expect(other.hp).toBe(95);
  });
  it('fires a penetrating beam only after sixty ticks without shooting', () => {
    const s = arena(['R14' as RelicId]); const a = target(s, 350), b = target(s, 420);
    for (let i = 0; i < 60; i++) step(s, emptyInput());
    step(s, { ...emptyInput(), fire: true });
    expect(a.hp).toBe(89.5); expect(b.hp).toBe(89.5); expect((s.player as any).starlightCooldown).toBe(240);
    expect(s.stats.shots).toBe(1); expect(s.bullets).toHaveLength(1);
  });
  it('uses the shotgun total firing damage for the beam and respects vertical aim', () => {
    const s = arena(['R14' as RelicId]); s.weapon = 'W02'; const e = target(s, 350);
    for (let i = 0; i < 60; i++) step(s, emptyInput());
    step(s, { ...emptyInput(), fire: true, aimPitch: 0 }); expect(e.hp).toBe(81.25);
    const up = arena(['R14' as RelicId]); const low = target(up, 350, 180, 'rat');
    for (let i = 0; i < 60; i++) step(up, emptyInput());
    step(up, { ...emptyInput(), fire: true, aimPitch: .8 }); expect(low.hp).toBe(100);
  });
  it('does not arm the beam while holding fire through its normal cooldown', () => {
    const s = arena(['R14' as RelicId]); target(s, 600);
    for (let i = 0; i < 100; i++) step(s, { ...emptyInput(), fire: true });
    expect(s.cues.some(c => (c.kind as string) === 'starlight')).toBe(false);
  });
  it('lets the orbiting stone consume one ordinary bullet and then recharge', () => {
    const s = arena(['R19' as RelicId]);
    s.bullets = [{ id: s.nextId++, x: 325, y: 180, vx: -320, vy: 0, owner: 'enemy', damage: 10, life: 75 }];
    expect(advanceProjectiles(s)).toEqual([]); expect(s.bullets).toHaveLength(0); expect((s.player as any).wardCooldown).toBe(180);
  });
  it('never lets the stone absorb an unreflectable boss projectile', () => {
    const s = arena(['R19' as RelicId]); s.bullets = [{ id: s.nextId++, x: 311, y: 180, vx: -320, vy: 0,
      owner: 'enemy', source: 'gatekeeper', damage: 10, life: 75 }];
    expect(advanceProjectiles(s)).toHaveLength(1); expect((s.player as any).wardCooldown).toBeUndefined();
  });
  it('heals five after three first combat clears and excludes already cleared nodes', () => {
    const s = createDungeonRun(42); s.expedition!.relics = s.expedition!.acquired = ['R21' as RelicId]; s.player.hp = 80;
    for (const id of [1, 2, 3]) { s.expedition!.room = id; const r = s.expedition!.dungeon!.rooms[id]; r.visited = true; healAfterCombat(s); r.cleared = true; }
    expect(s.player.hp).toBe(85); expect((s as any).mossClears).toBe(0);
    for (let i = 0; i < 3; i++) healAfterCombat(s); expect(s.player.hp).toBe(85);
  });
  it('removes only the longest harmful status on acquisition, then starts an eight-second cooldown', () => {
    const s = arena(); s.player.weakTicks = 180; s.player.slowTicks = 120;
    grantRelic(s, 'R22' as RelicId); expect(s.player.weakTicks).toBeUndefined(); expect(s.player.slowTicks).toBe(120);
    expect((s.player as any).cleanseCooldown).toBe(480);
  });
  it('reduces enemy pull by eighty percent without changing regular movement', () => {
    const s = arena(['R29' as RelicId]); applyChainPull(s, { x: 240, y: 180 }); expect(s.player.x).toBeCloseTo(294);
    const normal = arena(); applyChainPull(normal, { x: 240, y: 180 }); expect(normal.player.x).toBe(270);
  });
});

describe('relic edge cases and saved progress', () => {
  function snapshot() {
    const s = createRun(42); s.phase = 'combat';
    s.expedition!.relics = [...ids]; s.expedition!.acquired = [...ids];
    s.growth = { id: 'saved-six', investment: { health: 0, attack: 0, speed: 0, movement: 0, dodge: 0 }, relicUnlocks: ['R14', 'R29'] };
    return s;
  }
  it('copies the departure unlock set and cannot replace it mid-expedition', () => {
    const s = createRun(42), list = ['R14', 'R29'];
    (beginGrowthRun as any)(s, defaultProfile().investment, 'unlock-test', false, list);
    list.length = 0; expect(s.growth!.relicUnlocks).toEqual(['R14', 'R29']);
    expect((beginGrowthRun as any)(s, defaultProfile().investment, 'replace', false, [])).toBe(false);
    expect(s.growth!.relicUnlocks).toEqual(['R14', 'R29']);
  });
  it.each([['lightningCooldown', 72], ['starlightCooldown', 240], ['wardCooldown', 180], ['cleanseCooldown', 480]] as const)
    ('rejects damaged %s and cooldowns with no acquisition history', (key, max) => {
      const s = snapshot(); s.player[key] = max; expect(validRun(s)).toBe(true);
      for (const value of [-1, 0, max + 1, .5, NaN, null]) {
        (s.player as any)[key] = value; expect(validRun(s)).toBe(false);
      }
      s.player[key] = max; s.expedition!.relics = []; s.expedition!.acquired = []; expect(validRun(s)).toBe(false);
    });
  it('rejects malformed unlock snapshots and a forged acquisition of a locked relic', () => {
    const s = snapshot(); expect(validRun(s)).toBe(true);
    s.growth!.relicUnlocks = ['R14', 'R14']; expect(validRun(s)).toBe(false);
    (s.growth as any).relicUnlocks = ['R13']; expect(validRun(s)).toBe(false);
    delete s.growth!.relicUnlocks; expect(validRun(s)).toBe(false);
  });
  it('rejects a damaged stop-shooting counter and inconsistent moss progress', () => {
    const s = snapshot(); s.player.starlightRest = 60; expect(validRun(s)).toBe(true);
    s.player.starlightRest = 61; expect(validRun(s)).toBe(false); delete s.player.starlightRest;
    s.mossRooms = [0, 1]; s.mossClears = 2; expect(validRun(s)).toBe(true);
    s.mossClears = 1; expect(validRun(s)).toBe(false);
    s.mossClears = 2; s.mossRooms = [0, 0]; expect(validRun(s)).toBe(false);
  });
  it('restores all cooldowns and moss counters and resumes the same deterministic progress', async () => {
    const s = snapshot(); Object.assign(s.player, { lightningCooldown: 72, starlightCooldown: 240, wardCooldown: 180, cleanseCooldown: 480, starlightRest: 32 });
    s.mossRooms = [0, 1]; s.mossClears = 2;
    const profile = defaultProfile(); profile.rooms = Array.from({ length: 5 }, (_, i) => ({ runId: `prior-${i}`, room: 1 }));
    profile.relics = RELIC_IDS.filter(id => !['R14', 'R29'].includes(id)).slice(0, 12);
    const name = 'six-relic-progress', store = new SaveStore(name); await store.load();
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open(name, 1); request.onsuccess = () => resolve(request.result); });
    await new Promise<void>(resolve => { const tx = db.transaction('save', 'readwrite');
      tx.objectStore('save').put({ schema: 1, content: 'prototype-0.13', revision: 0, savedAt: '2026-10-06', run: null, settings: defaultSettings(), profile }, 'current');
      tx.oncomplete = () => resolve(); }); db.close();
    await store.load(); await store.save(s, defaultSettings());
    const restored = (await store.load())!.run!; expect(restored).toEqual(s);
    for (let i = 0; i < 20; i++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s); expect(restored.player.wardCooldown).toBe(160);
  });
  it('keeps old saves without the new optional fields valid', () => { expect(validRun(createRun(42))).toBe(true); });
  it('rejects a corrupt null bullet without throwing outside save validation', () => {
    const s = createRun(42); (s.bullets as unknown[]) = [null]; expect(validRun(s)).toBe(false);
  });
  it('validates actual legacy beam cues and rejects damaged endpoints or unearned effects', () => {
    const s = snapshot(); s.player.starlightRest = 60; fireStarlight(s, 7, undefined, damageEnemy);
    expect(validRun(s)).toBe(true); const c = s.cues.find(c => c.kind === 'starlight')!;
    c.endHeight = 141; expect(validRun(s)).toBe(false); c.endHeight = 34;
    c.end!.x = Infinity; expect(validRun(s)).toBe(false); c.end = { x: 1e9, y: 180 }; c.x = 1e9; expect(validRun(s)).toBe(false);
  });
  it.each([-.5482999999999999, .87, -1.15])('keeps floor or ceiling clipped beams saveable at fractional pitch %s', pitch => {
    const s = snapshot(); Object.assign(s.player, { x: 300, y: 180, aim: 0, height: 0, jumpVelocity: 0, starlightRest: 60 });
    fireStarlight(s, 7, pitch, damageEnemy); const c = s.cues.find(c => c.kind === 'starlight')!;
    expect(c.endHeight).toBeGreaterThanOrEqual(0); expect(c.endHeight).toBeLessThanOrEqual(140); expect(validRun(s)).toBe(true);
  });
  it('stops beam damage at walls and ignores shields, dead bodies and boss protection', () => {
    const s = arena(['R14']); s.player.x = 160; s.player.y = 127; s.player.starlightRest = 60;
    const hidden = target(s, 265, 127); fireStarlight(s, 10, undefined, damageEnemy); expect(hidden.hp).toBe(100);
    expect(s.cues.find(c => c.kind === 'starlight')!.end!.x).toBe(208);
    const shielded = arena(['R14']); shielded.player.starlightRest = 60;
    const shield = target(shielded, 350, 180, 'shield'); shield.angle = Math.PI;
    fireStarlight(shielded, 10, undefined, damageEnemy); expect(shield.hp).toBe(100);
  });
  it('keeps beam damage isolated from chain lightning, split, burn and freeze effects', () => {
    const s = arena(['R14', 'R09', 'R03', 'R07', 'R08']); s.player.starlightRest = 60;
    const e = target(s, 350), side = target(s, 350, 230); fireStarlight(s, 10, 0, damageEnemy);
    expect(e.hp).toBe(85); expect(side.hp).toBe(100); expect(e.burnTicks).toBeUndefined(); expect(e.frost).toBeUndefined();
    expect(s.bullets).toEqual([]); expect(s.player.lightningCooldown).toBeUndefined();
  });
  it('uses the stable enemy ID for equal-distance chain targets', () => {
    const s = arena(['R09']); const e = target(s, 320), a = target(s, 360, 170), b = target(s, 360, 190);
    s.enemies = [e, b, a]; hit(s, e); expect(s.cues.filter(c => c.kind === 'lightning')[0].end).toEqual({ x: a.x, y: a.y });
  });
  it('does not let a high bullet or a bullet behind a wall strike the orbiting stone', () => {
    const s = arena(['R19']); const point = wardPoint(s);
    s.bullets = [{ id: s.nextId++, x: point.x + 3, y: point.y, vx: -320, vy: 0, height: 100, heightVelocity: 0, owner: 'enemy', damage: 10, life: 75 }];
    advanceProjectiles(s); expect(s.player.wardCooldown).toBeUndefined();
    s.player.x = 201; s.player.y = 128;
    s.bullets = [{ id: s.nextId++, x: 207, y: 128, vx: 320, vy: 0, owner: 'enemy', damage: 10, life: 75 }];
    advanceProjectiles(s); expect(s.player.wardCooldown).toBeUndefined();
  });
  it('expires cooldowns on their exact tick and consumes only one ward per tick', () => {
    const s = arena(['R19']); s.bullets = [0, 1].map(() => ({ id: s.nextId++, x: 325, y: 180, vx: -320, vy: 0, owner: 'enemy', damage: 10, life: 75 }));
    advanceProjectiles(s); expect(s.bullets).toHaveLength(1);
    for (let i = 0; i < 179; i++) advanceRelicTimers(s, false); expect(s.player.wardCooldown).toBe(1);
    advanceRelicTimers(s, false); expect(s.player.wardCooldown).toBeUndefined();
  });
  it('does not repeatedly cleanse an old status after the cooldown expires without a new application', () => {
    const s = arena(['R22']); s.player.weakTicks = 120; s.player.slowTicks = 120;
    cleanseStatus(s); expect(s.player.slowTicks).toBeUndefined(); expect(s.player.weakTicks).toBe(120);
    s.player.slowTicks = 100; cleanseStatus(s); expect(s.player.slowTicks).toBe(100);
    for (let i = 0; i < 480; i++) advanceRelicTimers(s, false);
    expect(s.player.slowTicks).toBe(100); expect(s.player.weakTicks).toBe(120);
  });
  it('does not spend cleanse cooldown for an attack blocked by invulnerability', () => {
    const s = arena(['R22']); const e = target(s, 600); e.timer = 1000; s.player.invulnerable = 30;
    s.bullets = [{ id: s.nextId++, x: 310, y: 180, vx: -320, vy: 0, owner: 'enemy', source: 'riftshaman', damage: 10, life: 75 }];
    step(s, emptyInput()); expect(s.player.hp).toBe(100); expect(s.player.cleanseCooldown).toBeUndefined();
  });
  it('cleanses an actually inflicted seal debuff without preventing its damage', () => {
    const s = arena(['R22']); target(s, 600);
    s.bullets = [{ id: s.nextId++, x: 310, y: 180, vx: -320, vy: 0, owner: 'enemy', source: 'riftshaman', damage: 10, life: 75 }];
    step(s, emptyInput()); expect(s.player.hp).toBe(90); expect(s.player.weakTicks).toBeUndefined(); expect(s.player.cleanseCooldown).toBe(480);
  });
  it('never counts safe rooms or overheals and combines moss with clear healing', () => {
    const s = createDungeonRun(42); s.expedition!.relics = s.expedition!.acquired = ['R21', 'R54']; s.player.hp = 97;
    healAfterCombat(s); expect(s.mossClears).toBeUndefined();
    for (const id of [1, 2, 3]) { s.expedition!.room = id; healAfterCombat(s); s.expedition!.dungeon!.rooms[id].cleared = true; }
    expect(s.player.hp).toBe(100); expect(s.mossClears).toBe(0);
    const hp = arena(['R21', 'R54']); hp.player.hp = 70; hp.mossRooms = [1, 2]; hp.mossClears = 2;
    healAfterCombat(hp); expect(hp.player.hp).toBe(80);
  });
  it('carries moss progress through archived regions and validates the third clear', () => {
    const s = createDungeonRun(42), e = s.expedition!, rooms = e.dungeon!.rooms;
    e.relics = e.acquired = ['R21']; rooms[6].visited = rooms[6].cleared = true;
    rooms[6].reward = { room: 6, candidates: ['R21'], choice: 'R21' }; s.player.hp = 80;
    for (const id of [1, 2]) { e.room = id; rooms[id].visited = true; healAfterCombat(s); rooms[id].cleared = true; }
    e.room = 8; rooms[8].visited = rooms[8].cleared = true; s.boss = createBoss(s); s.boss.hp = 0; s.phase = 'cleared';
    expect(enterNextRegion(s)).toBe(true); expect(s.mossClears).toBe(2); expect(validRun(s)).toBe(true);
    e.room = 1; e.dungeon!.rooms[1].visited = true; healAfterCombat(s); e.dungeon!.rooms[1].cleared = true;
    expect(s.player.hp).toBe(85); expect(s.mossClears).toBe(0); expect(validRun(s)).toBe(true);
    e.previousDungeon!.rooms[1].mossCounted = undefined; expect(validRun(s)).toBe(false);
  });
  it('never damages boss protection and cancels remaining chain damage on a phase transition', () => {
    const beam = arena(['R14']); beam.player.starlightRest = 60; beam.boss = createHeart(beam); beam.boss.x = 350; beam.boss.y = 180;
    beam.boss.pillarIndex = 0; beam.boss.pillarHp = 100; const hp = beam.boss.hp;
    fireStarlight(beam, 100, 0, damageEnemy); expect(beam.boss.hp).toBe(hp);
    const chain = arena(['R09']); const origin = target(chain, 320), beyond = target(chain, 440);
    chain.boss = createBoss(chain); Object.assign(chain.boss, { x: 360, y: 180, hp: 902, mode: 'recover' });
    hit(chain, origin); expect(chain.boss.stage).toBe(2); expect(beyond.hp).toBe(100);
  });
  it('keeps real chest, reroll and shop pools reachable with the departure gates', () => {
    const chestSeen = new Set<string>(), rerollSeen = new Set<string>(), shopSeen = new Set<string>();
    const p = defaultProfile(); expect(growthRelicUnlocks(p)).toEqual([]);
    p.rooms = Array.from({ length: 5 }, (_, i) => ({ runId: `g-${i}`, room: 1 })); p.relics = RELIC_IDS.slice(0, 12);
    expect(growthRelicUnlocks(p)).toEqual(['R14', 'R15', 'R28','R29']);
    for (let i = 1; i <= 500; i++) {
      const seed = Math.imul(i, 0x9e3779b9) >>> 0;
      const s = createDungeonRun(seed); beginGrowthRun(s, p.investment, `run-${seed}`, false, growthRelicUnlocks(p));
      s.expedition!.room = 6; s.phase = 'cleared'; const r = s.expedition!.dungeon!.rooms[6]; r.visited = r.cleared = true;
      prepareReward(s); roomReward(s)!.candidates.forEach(id => chestSeen.add(id));
      expect(rerollReward(s)).toBe(true); roomReward(s)!.candidates.forEach(id => rerollSeen.add(id));
      expect(chooseRelic(s, roomReward(s)!.candidates[0])).toBe(true); expect(validRun(s)).toBe(true);
      const shop = createDungeonRun(seed); beginGrowthRun(shop, p.investment, `shop-${seed}`, false, growthRelicUnlocks(p));
      shop.expedition!.room = 10; shop.expedition!.dungeon!.rooms[10].visited = shop.expedition!.dungeon!.rooms[10].cleared = true;
      shop.gold = 100; refreshShop(shop); shop.expedition!.dungeon!.rooms[10].shop!.slots.forEach(slot => { if (slot.relic) shopSeen.add(slot.relic); });
      expect(buyFromShop(shop, 0, shop.expedition!.dungeon!.rooms[10].shop!.revision)).toBe('bought'); expect(validRun(shop)).toBe(true);
      const locked = createDungeonRun(seed); locked.expedition!.room = 6; locked.phase = 'cleared';
      locked.expedition!.dungeon!.rooms[6].visited = locked.expedition!.dungeon!.rooms[6].cleared = true;
      prepareReward(locked); expect(roomReward(locked)!.candidates.some(id => id === 'R14' || id === 'R29')).toBe(false);
    }
    for (const id of ids) { expect(chestSeen.has(id), `chest ${id}`).toBe(true); expect(rerollSeen.has(id), `reroll ${id}`).toBe(true); expect(shopSeen.has(id), `shop ${id}`).toBe(true); }
  });
});
