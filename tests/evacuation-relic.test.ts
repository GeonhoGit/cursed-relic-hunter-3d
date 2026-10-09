import { describe, expect, it } from 'vitest';
import { createDungeonRun, createRun, advanceRoom, emptyInput, step, travel } from '../src/core/simulation';
import { beginGrowthRun, emptyInvestment } from '../src/core/growth';
import { grantRelic, canAcquireRelic } from '../src/core/relic-acquisition';
import { RELIC_IDS, RELICS } from '../src/core/relics';
import { validRun } from '../src/persistence/save';
import { clearCombatEffects } from '../src/core/player-effects';
import { clearLostRelicFields } from '../src/core/relic-fields';
import { captureMotion, interpolateMotion } from '../src/game/render-motion';
import { distance } from '../src/core/geometry';
import { evacuationTarget, featherAvailable } from '../src/core/evacuation';
import { chooseRelic, prepareReward, rerollReward } from '../src/core/expedition';
import { buyFromShop, refreshShop } from '../src/core/shop';
import { createBoss } from '../src/core/boss';
import { enterNextRegion } from '../src/core/region';
import { adjacentRooms, currentRoom } from '../src/core/dungeon';
import { spikeTraps } from '../src/core/traps';
import { visible, segmentBox } from '../src/core/geometry';
import { bodyObstacles } from '../src/core/room-layout';
import 'fake-indexeddb/auto';
import { SaveStore, defaultSettings } from '../src/persistence/save';

function run() {
  const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'evacuation-run');
  const r = s.expedition!.dungeon!.rooms[6]; r.visited = r.cleared = true; r.reward = { room: 6, candidates: ['R24' as any], choice: 'R24' as any };
  grantRelic(s, 'R24' as any); s.expedition!.room = 1; const room = s.expedition!.dungeon!.rooms[1]; room.visited = true; room.structure = 0;
  s.phase = 'combat'; s.player.x = 80; s.player.y = 183;
  s.enemies = [{ id: s.nextId++, kind: 'rat', x: 80, y: 183, hp: 30, maxHp: 30, angle: 0, mode: 'move', timer: 0, targetX: 80, targetY: 183, flash: 0 }]; return s;
}
const used = (s: ReturnType<typeof run>) => (s.expedition!.dungeon!.rooms[1] as any).featherUsed;
function extra(s: ReturnType<typeof run>, id: 'R16' | 'R20' | 'R23' | 'R53' | 'R22') {
  if (id === 'R16') s.growth!.relicUnlocks = ['R16'];
  const r = s.expedition!.dungeon!.rooms[7]; r.visited = r.cleared = true; r.reward = { room: 7, candidates: [id], choice: id }; grantRelic(s, id);
}
describe('evacuation feather', () => {
  it('adds an initially eligible epic passive to the normal catalogue', () => {
    expect(RELIC_IDS).toHaveLength(57); expect((RELICS as any).R24.rarity).toBe('epic'); expect(canAcquireRelic(createDungeonRun(42), 'R24' as any)).toBe(true);
  });
  it('moves a living hurt player eighty to one hundred twenty units without cancelling the hit', () => {
    const s = run(), before = { ...s.player }, rng = s.rng; step(s, emptyInput());
    expect(s.player.hp).toBe(94); expect(s.player.invulnerable).toBe(45); expect(s.stats.hits).toBe(1);
    expect(distance(before, s.player)).toBeGreaterThanOrEqual(80 - .001); expect(distance(before, s.player)).toBeLessThanOrEqual(120 + .001);
    expect(used(s)).toBe(true); expect(s.cues.filter(c => (c.kind as string) === 'evade')).toHaveLength(1); expect(s.rng).toBe(rng); expect(validRun(s)).toBe(true);
  });
  it('spends the allowance once and keeps it across damage, cleanup and relic loss', () => {
    const s = run(); step(s, emptyInput()); const point = { x: s.player.x, y: s.player.y }; s.player.invulnerable = 0;
    s.enemies[0].x = point.x; s.enemies[0].y = point.y; step(s, emptyInput()); expect(s.player.hp).toBe(88); expect({ x: s.player.x, y: s.player.y }).toEqual(point);
    clearCombatEffects(s); expect(used(s)).toBe(true); s.expedition!.relics = []; clearLostRelicFields(s); expect(used(s)).toBe(true); expect(validRun(s)).toBe(true);
  });
  it('does not activate without actual damage or after final death', () => {
    const safe = run(); safe.player.invulnerable = 3; step(safe, emptyInput()); expect(safe.player.hp).toBe(100); expect(used(safe)).toBeUndefined();
    const dodge = run(); dodge.player.dodgeRemaining = .2; step(dodge, emptyInput()); expect(dodge.player.hp).toBe(100); expect(used(dodge)).toBeUndefined();
    const dead = run(); dead.player.hp = 1; step(dead, emptyInput()); expect(dead.phase).toBe('dead'); expect(used(dead)).toBeUndefined(); expect(dead.cues.some(c => (c.kind as string) === 'evade')).toBe(false);
  });
  it('uses the final surviving bandage state and preserves its stronger invulnerability', () => {
    const s = run(), r = s.expedition!.dungeon!.rooms[7]; r.visited = r.cleared = true; r.reward = { room: 7, candidates: ['R20'], choice: 'R20' }; grantRelic(s, 'R20');
    s.player.hp = 1; step(s, emptyInput()); expect(s.player.hp).toBe(1); expect(s.player.invulnerable).toBe(90); expect(used(s)).toBe(true); expect(s.expedition!.relics).not.toContain('R20'); expect(validRun(s)).toBe(true);
  });
  it('does not draw a camera interpolation path and preserves the consumed chance after reload', () => {
    const s = run(), previous = captureMotion(s); step(s, emptyInput()); const copy = structuredClone(s); expect(validRun(copy)).toBe(true);
    expect(interpolateMotion(s, previous, .1).player.x).toBe(s.player.x);
    s.player.invulnerable = copy.player.invulnerable = 0; s.enemies[0].x = copy.enemies[0].x = s.player.x; s.enemies[0].y = copy.enemies[0].y = s.player.y;
    step(s, emptyInput()); step(copy, emptyInput()); expect(copy).toEqual(s); expect(used(copy)).toBe(true);
  });
  it('remembers a used room after leaving and returning instead of refilling it', () => {
    const s = run(); step(s, emptyInput()); s.enemies = []; s.phase = 'explore'; s.expedition!.dungeon!.rooms[1].cleared = true;
    expect(travel(s, 'north')).toBe(true); expect((s.expedition!.dungeon!.rooms[0] as any).featherUsed).toBeUndefined();
    expect(travel(s, 'south')).toBe(true); expect(used(s)).toBe(true); expect(validRun(s)).toBe(true);
  });
  it('rejects false and unowned room allowance records without rejecting old missing fields', () => {
    const s = run(); step(s, emptyInput()); const bad = structuredClone(s); (bad.expedition!.dungeon!.rooms[1] as any).featherUsed = false; expect(validRun(bad)).toBe(false);
    const wrong = structuredClone(s); const source = wrong.expedition!.dungeon!.rooms[6]; source.reward = null; source.visited = source.cleared = false;
    wrong.expedition!.acquired = wrong.expedition!.relics = []; expect(validRun(wrong)).toBe(false); expect(validRun(createDungeonRun(42))).toBe(true);
  });
  it('retains the allowance when no safe candidate exists and succeeds on a later real hit', () => {
    const s = run(); extra(s, 'R16'); s.enemies[0].x = 700;
    s.stoneWall = { id: s.nextId++, x: 76, y: 159, w: 8, h: 48, hp: 40, ticks: 240 }; s.player.auxCooldowns = { R16: 600 }; s.player.height = 61; s.player.jumpVelocity = 0;
    s.bullets = [{ id: s.nextId++, x: 90, y: 183, vx: -600, vy: 0, owner: 'enemy', damage: 10, life: 20, height: 75 }]; const rng = s.rng;
    step(s, emptyInput()); expect(s.player.hp).toBe(90); expect(used(s)).toBeUndefined(); expect(s.player.x).toBe(80); expect(s.rng).toBe(rng); expect(validRun(s)).toBe(true);
    delete s.stoneWall; s.player.height = s.player.jumpVelocity = 0; s.player.invulnerable = 0;
    s.bullets = [{ id: s.nextId++, x: 90, y: 183, vx: -600, vy: 0, owner: 'enemy', damage: 10, life: 20, height: 34 }];
    step(s, emptyInput()); expect(s.player.hp).toBe(80); expect(used(s)).toBe(true);
  });
  it('takes the original highest hit once and never treats a passive escape as an auxiliary cast', () => {
    const s = run(); s.bullets = [9, 12].map(damage => ({ id: s.nextId++, x: 90, y: 183, vx: -600, vy: 0, owner: 'enemy' as const, damage, life: 20 }));
    step(s, emptyInput()); expect(s.player.hp).toBe(88); expect(s.stats.hits).toBe(1); expect(s.cues.filter(c => c.kind === 'evade')).toHaveLength(1); expect(s.growth!.auxiliaryUsed).toBeUndefined();
  });
  it('keeps weakness and fractional mitigation from the received projectile', () => {
    const s = run(); extra(s, 'R53'); s.enemies[0].x = 700;
    s.bullets = [{ id: s.nextId++, x: 90, y: 183, vx: -600, vy: 0, owner: 'enemy', source: 'riftshaman', damage: 10, life: 20 }];
    step(s, emptyInput()); expect(s.player.hp).toBe(91.5); expect(s.player.weakTicks).toBe(180); expect(used(s)).toBe(true); expect(validRun(s)).toBe(true);
  });
  it('retaliates at the injury position before evacuating and preserves the used record on clear', () => {
    const s = run(); extra(s, 'R23'); s.enemies[0].hp = 10; const before = { ...s.player };
    step(s, emptyInput()); expect(s.stats.kills).toBe(1); expect(s.phase).toBe('explore'); expect(used(s)).toBe(true);
    const thorns = s.cues.find(c => c.kind === 'thorns')!; expect({ x: thorns.x, y: thorns.y }).toEqual({ x: before.x, y: before.y }); expect(distance(before, s.player)).toBeGreaterThanOrEqual(80);
    expect(validRun(s)).toBe(true);
  });
  it('checks safe ground and excludes even resting traps across all nine regional room palettes', () => {
    for (const region of [1, 2, 3] as const) for (const template of [0, 1, 2]) {
      const s = run(); s.expedition!.region = region; s.expedition!.dungeon!.rooms[1].template = template; delete s.expedition!.dungeon!.rooms[1].structure; s.trapTicks = 140;
      const target = evacuationTarget(s)!; expect(target).toBeDefined(); expect(distance(target, s.player)).toBeGreaterThanOrEqual(80 - .001);
      expect(visible(target, target, 6.999, bodyObstacles(s))).toBe(true); expect(spikeTraps(s).some(b => segmentBox(target.x, target.y, target.x, target.y, b, 7) !== null)).toBe(false);
    }
  });
  it('records distinct room allowances on the legacy route without refilling between waves', () => {
    const s = createRun(42); beginGrowthRun(s, emptyInvestment(), 'legacy-feather'); s.phase = 'cleared'; s.enemies = [];
    s.expedition!.reward = { room: 0, candidates: ['R24'], choice: null }; expect(chooseRelic(s, 'R24')).toBe(true); expect(advanceRoom(s)).toBe(true);
    for (let i = 0; i < 48; i++) step(s, emptyInput());
    s.enemies = [{ id: s.nextId++, kind: 'rat', x: s.player.x, y: s.player.y, hp: 30, maxHp: 30, angle: 0, mode: 'move', timer: 0, targetX: s.player.x, targetY: s.player.y, flash: 0 }];
    step(s, emptyInput()); expect(s.featherRooms).toEqual([1]); expect(validRun(s)).toBe(true);
    s.phase = 'cleared'; s.enemies = []; prepareReward(s); chooseRelic(s, 'skip'); expect(advanceRoom(s)).toBe(true);
    for (let i = 0; i < 48; i++) step(s, emptyInput()); s.enemies = [{ id: s.nextId++, kind: 'rat', x: s.player.x, y: s.player.y, hp: 30, maxHp: 30, angle: 0, mode: 'move', timer: 0, targetX: s.player.x, targetY: s.player.y, flash: 0 }];
    step(s, emptyInput()); expect(s.featherRooms).toEqual([1, 2]); expect(validRun(s)).toBe(true); expect(featherAvailable(s)).toBe(false);
  });
  it('archives the original allowance and gives a fresh region its own room chance', () => {
    const s = run(); step(s, emptyInput()); s.enemies = []; s.expedition!.dungeon!.rooms[1].cleared = true;
    s.expedition!.room = 8; s.expedition!.dungeon!.rooms[8].visited = s.expedition!.dungeon!.rooms[8].cleared = true; s.boss = createBoss(s); s.boss.hp = 0; s.phase = 'cleared';
    expect(enterNextRegion(s)).toBe(true); expect(s.expedition!.previousDungeon!.rooms[1].featherUsed).toBe(true);
    const door = adjacentRooms(s).find(d => d.room.kind === 'combat')!; expect(travel(s, door.direction)).toBe(true);
    for (let i = 0; i < 48; i++) step(s, emptyInput());
    s.enemies = [{ id: s.nextId++, kind: 'rat', x: s.player.x, y: s.player.y, hp: 30, maxHp: 30, angle: 0, mode: 'move', timer: 0, targetX: s.player.x, targetY: s.player.y, flash: 0 }];
    step(s, emptyInput()); expect(currentRoom(s)!.featherUsed).toBe(true); expect(validRun(s)).toBe(true);
  });
  it('saves a real evacuation and resumes fifty identical ticks without refunding the chance', async () => {
    const store = new SaveStore('evacuation-live'); await store.load(); const s = run(); step(s, emptyInput()); await store.save(s, defaultSettings());
    const copy = (await store.load())!.run!; expect(copy).toEqual(s); expect((await store.load())!.profile!.relics).toContain('R24');
    for (let i = 0; i < 50; i++) { step(s, emptyInput()); step(copy, emptyInput()); } expect(copy).toEqual(s); expect(currentRoom(copy)!.featherUsed).toBe(true);
  });
  it('rejects malformed feedback and safe-room or mixed-route quota records without throwing', () => {
    const s = run(); step(s, emptyInput());
    for (const change of [{ amount: 121 }, { end: null }, { height: Infinity }, { endHeight: 1 }]) { const q = structuredClone(s); Object.assign(q.cues.find(c => c.kind === 'evade')!, change); expect(() => validRun(q)).not.toThrow(); expect(validRun(q)).toBe(false); }
    const start = structuredClone(s); start.expedition!.dungeon!.rooms[0].featherUsed = true; expect(validRun(start)).toBe(false);
    const mixed = structuredClone(s); mixed.featherRooms = [1]; expect(validRun(mixed)).toBe(false);
  });
  it('reaches the epic in actual chest, refresh and shop pools and cannot acquire it twice', () => {
    const seen = new Set<string>();
    for (let i = 1; i <= 500; i++) {
      const s = createDungeonRun(Math.imul(i, 0x9e3779b9) >>> 0); beginGrowthRun(s, emptyInvestment(), `evacuation-pool-${i}`); s.expedition!.room = 6; s.phase = 'cleared';
      const r = s.expedition!.dungeon!.rooms[6]; r.visited = r.cleared = true; prepareReward(s);
      if (r.reward!.candidates.includes('R24')) { seen.add('chest'); const q = structuredClone(s); expect(chooseRelic(q, 'R24')).toBe(true); expect(validRun(q)).toBe(true); }
      rerollReward(s); if (r.reward!.candidates.includes('R24')) { seen.add('refresh'); const q = structuredClone(s); expect(chooseRelic(q, 'R24')).toBe(true); expect(validRun(q)).toBe(true); }
      chooseRelic(s, 'skip'); s.expedition!.room = 10; const shop = s.expedition!.dungeon!.rooms[10]; shop.visited = shop.cleared = true; s.phase = 'explore'; s.gold = 100; refreshShop(s);
      const slot = shop.shop!.slots.findIndex(q => q.relic === 'R24'); if (slot >= 0) { seen.add('shop'); expect(buyFromShop(s, slot, shop.shop!.revision)).toBe('bought'); expect(grantRelic(s, 'R24')).toBe(false); expect(validRun(s)).toBe(true); }
    }
    expect([...seen].sort()).toEqual(['chest', 'refresh', 'shop']);
  });
  it('evacuates after contract revival only if the feather survived the actual relic loss', () => {
    const seen = new Set<string>();
    for (let i = 1; i <= 64; i++) {
      const s = run(), r = s.expedition!.dungeon!.rooms[7]; r.visited = r.cleared = true; r.reward = { room: 7, candidates: ['R01'], choice: 'R01' }; grantRelic(s, 'R01');
      s.expedition!.room = 10; const shop = s.expedition!.dungeon!.rooms[10]; shop.visited = shop.cleared = true; s.phase = 'explore'; s.gold = 100; refreshShop(s); shop.shop!.slots[0].relic = 'R03';
      expect(buyFromShop(s, 0, shop.shop!.revision)).toBe('bought'); s.expedition!.room = 9; const altar = s.expedition!.dungeon!.rooms[9]; altar.visited = altar.cleared = true;
      s.phase = 'cleared'; prepareReward(s); expect(chooseRelic(s, 'R38')).toBe(true);
      s.expedition!.room = 1; s.phase = 'combat'; s.player.hp = 1; s.rng = Math.imul(i, 0x9e3779b9) >>> 0; step(s, emptyInput());
      expect(s.player.hp).toBe(40); expect(s.player.invulnerable).toBe(120); const retained = s.expedition!.relics.includes('R24'); seen.add(retained ? 'retained' : 'lost');
      expect(used(s)).toBe(retained ? true : undefined); expect(s.cues.some(c => c.kind === 'evade')).toBe(retained); expect(validRun(s)).toBe(true);
    }
    expect([...seen].sort()).toEqual(['lost', 'retained']);
  });
});
