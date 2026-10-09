import { describe, expect, it } from 'vitest';
import { createDungeonRun, emptyInput, step, travel } from '../src/core/simulation';
import { beginGrowthRun, defaultProfile, emptyInvestment, growthGoals, growthRelicUnlocks } from '../src/core/growth';
import { grantRelic, canAcquireRelic } from '../src/core/relic-acquisition';
import { useAuxiliary, equipAuxiliary } from '../src/core/auxiliary';
import { RELIC_IDS, RELICS } from '../src/core/relics';
import { validRun } from '../src/persistence/save';
import { clearCombatEffects } from '../src/core/player-effects';
import { clearLostRelicFields } from '../src/core/relic-fields';
import { BOUNDS } from '../src/core/model';
import { captureMotion, interpolateMotion } from '../src/game/render-motion';
import { advanceAuxiliaryRecharge } from '../src/core/time-debt';
import { createBoss } from '../src/core/boss';
import { enterNextRegion } from '../src/core/region';
import { chooseRelic, prepareReward, rerollReward } from '../src/core/expedition';
import { buyFromShop, refreshShop } from '../src/core/shop';
import 'fake-indexeddb/auto';
import { SaveStore, defaultSettings } from '../src/persistence/save';

function run(id: 'R26' | 'R27' = 'R26') {
  const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'movement-run', false, ['R26', 'R27'] as any);
  const r = s.expedition!.dungeon!.rooms[6]; r.visited = r.cleared = true; r.reward = { room: 6, candidates: [id as any], choice: id as any };
  grantRelic(s, id as any); s.expedition!.room = 1; s.expedition!.dungeon!.rooms[1].visited = s.expedition!.dungeon!.rooms[1].cleared = true;
  s.expedition!.dungeon!.rooms[1].structure = 0; s.phase = 'explore'; s.player.x = 80; s.player.y = 183; return s;
}
const anchor = (s: ReturnType<typeof run>) => (s as any).anchor;
describe('movement relics', () => {
  it('registers two rare relics and snapshots G05 only on the next departure', () => {
    expect(RELIC_IDS).toHaveLength(57); expect((RELICS as any).R26.rarity).toBe('rare'); expect((RELICS as any).R27.rarity).toBe('rare');
    const s = createDungeonRun(42), p = defaultProfile(); p.heartDefeated = true;
    expect(growthRelicUnlocks(p)).toEqual(expect.arrayContaining(['R26', 'R27'])); expect(growthGoals(p).find(g => g.id === 'G05')!.description).toContain('유랑자의 닻');
    expect(canAcquireRelic(s, 'R26' as any)).toBe(false); expect(canAcquireRelic(s, 'R27' as any)).toBe(false);
  });
  it('places an uncharged anchor at the current ground, then recalls and charges exactly ten seconds', () => {
    const s = run(), next = s.nextId; expect(useAuxiliary(s, { x: 500, y: 183 })).toBe(true);
    expect(anchor(s)).toEqual({ id: next, x: 80, y: 183, room: 1, region: 1 }); expect(s.player.auxCooldowns).toBeUndefined();
    s.player.x = 400; const hp = s.player.hp; expect(useAuxiliary(s, { x: 0, y: 0 })).toBe(true);
    expect(s.player.x).toBe(80); expect(s.player.hp).toBe(hp); expect(anchor(s)).toBeUndefined(); expect((s.player.auxCooldowns as any).R26).toBe(600);
    expect(s.growth!.auxiliaryUsed).toEqual(['R26']); expect(validRun(s)).toBe(true);
  });
  it('keeps an occupied anchor and all resources intact when returning is unsafe', () => {
    const s = run(); useAuxiliary(s, s.player); s.player.x = 400; s.phase = 'combat'; s.expedition!.dungeon!.rooms[1].cleared = false;
    s.enemies = [{ id: s.nextId++, kind: 'rat', x: 80, y: 183, hp: 30, maxHp: 30, angle: 0, mode: 'move', timer: 0, targetX: 400, targetY: 183, flash: 0 }];
    const before = structuredClone(s); expect(useAuxiliary(s, s.player)).toBe(false); expect(s).toEqual(before); expect(validRun(s)).toBe(true);
  });
  it('refuses planting in the air or inside furniture without IDs, cooldown or use progress', () => {
    const s = run(); s.player.height = 10; s.player.jumpVelocity = 0; const airborne = structuredClone(s); expect(useAuxiliary(s, s.player)).toBe(false); expect(s).toEqual(airborne);
    delete s.player.height; delete s.player.jumpVelocity; s.expedition!.room = 6; s.player.x = 320; s.player.y = 183;
    const inside = structuredClone(s); expect(useAuxiliary(s, s.player)).toBe(false); expect(s).toEqual(inside);
  });
  it('keeps its room anchor on battle cleanup but removes it when leaving or losing the relic', () => {
    const s = run(); useAuxiliary(s, s.player); clearCombatEffects(s); expect(anchor(s)).toBeDefined();
    expect(travel(s, 'north')).toBe(true); expect(anchor(s)).toBeUndefined();
    const lost = run(); useAuxiliary(lost, lost.player); lost.expedition!.relics = []; clearLostRelicFields(lost); expect(anchor(lost)).toBeUndefined(); expect(lost.player.equippedAux).toBeNull();
  });
  it('returns without a damaging swept path through a remote enemy, preserving health and existing invulnerability', () => {
    const s = run(); useAuxiliary(s, s.player); s.player.x = 400; s.phase = 'combat';
    s.enemies = [{ id: s.nextId++, kind: 'rat', x: 240, y: 183, hp: 30, maxHp: 30, angle: 0, mode: 'move', timer: 0, targetX: 400, targetY: 183, flash: 0 }];
    step(s, { ...emptyInput(), auxiliary: true }); expect(s.player.x).toBe(80); expect(s.player.hp).toBe(100); expect(s.player.invulnerable).toBe(0);
  });
  it('slides along a contacted wall once using current tangent input without lengthening the dodge', () => {
    const s = run('R27'); s.player.x = 199; s.player.y = 120;
    step(s, { ...emptyInput(), moveX: 1, moveY: 1, dodge: true }); expect(s.player.x).toBe(201); expect(s.player.y).toBeGreaterThan(160);
    expect((s.player as any).clawUsed).toBe(true); expect(s.player.dodgeRemaining).toBeCloseTo(.24 - 1 / 60); expect(s.player.invulnerable).toBe(0);
    const y = s.player.y; step(s, { ...emptyInput(), moveX: 1, moveY: 1 }); expect(s.player.y - y).toBeLessThan(5); expect(validRun(s)).toBe(true);
  });
  it('does not extend a head-on collision, ordinary walking or an uncollided dodge', () => {
    const head = run('R27'); head.player.x = 199; head.player.y = 120; step(head, { ...emptyInput(), moveX: 1, dodge: true }); expect(head.player.y).toBe(120); expect((head.player as any).clawUsed).toBeUndefined();
    const walk = run('R27'); walk.player.x = 199; walk.player.y = 120; step(walk, { ...emptyInput(), moveX: 1, moveY: 1 }); expect(walk.player.y).toBeLessThan(125);
    const open = run('R27'); step(open, { ...emptyInput(), moveX: 1, moveY: 1, dodge: true }); expect(open.player.y).toBeLessThan(190);
  });
  it('clips the tangent extension to a second wall and to the room boundary', () => {
    const s = run('R27'); s.player.x = 199; s.player.y = 140; s.growth!.relicUnlocks!.push('R16'); grantRelic(s, 'R16');
    s.stoneWall = { id: s.nextId++, x: 180, y: 150, w: 48, h: 8, hp: 40, ticks: 240 }; s.player.auxCooldowns = { R16: 600 };
    step(s, { ...emptyInput(), moveX: 1, moveY: 1, dodge: true }); expect(s.player.x).toBe(201); expect(s.player.y).toBe(143); expect(s.player.clawUsed).toBeUndefined();
    const edge = run('R27'); edge.player.x = BOUNDS.x + BOUNDS.w - 8; edge.player.y = BOUNDS.y + BOUNDS.h - 8;
    step(edge, { ...emptyInput(), moveX: 1, moveY: 1, dodge: true }); expect(edge.player.x).toBeLessThanOrEqual(BOUNDS.x + BOUNDS.w - 7); expect(edge.player.y).toBeLessThanOrEqual(BOUNDS.y + BOUNDS.h - 7);
  });
  it('saves the live anchor and per-dodge consumed flag and refuses forged ownership', () => {
    const s = run(); useAuxiliary(s, s.player); const saved = structuredClone(s); expect(validRun(saved)).toBe(true);
    const wrong = structuredClone(s); if (anchor(wrong)) anchor(wrong).room = 6; expect(validRun(wrong)).toBe(false);
    const claw = run('R27'); claw.player.x = 199; claw.player.y = 120; step(claw, { ...emptyInput(), moveX: 1, moveY: 1, dodge: true }); expect(validRun(claw)).toBe(true);
    const forged = structuredClone(claw); forged.expedition!.acquired = []; expect(validRun(forged)).toBe(false);
  });
  it('records the wall contact and tangent as one real thorn path and saves the full extended dodge', () => {
    const s = run('R27'); s.growth!.relicUnlocks!.push('R15'); const room = s.expedition!.dungeon!.rooms[7]; room.visited = room.cleared = true;
    room.reward = { room: 7, candidates: ['R15'], choice: 'R15' }; grantRelic(s, 'R15'); s.player.x = 199; s.player.y = 120;
    step(s, { ...emptyInput(), moveX: 1, moveY: 1, dodge: true }); expect(s.thornTrails![0].points).toHaveLength(3);
    expect(s.thornTrails![0].points[1].x).toBe(201); expect(s.thornTrails![0].points[2].x).toBe(201); expect(validRun(s)).toBe(true);
    for (let i = 0; i < 14; i++) step(s, { ...emptyInput(), moveX: 1, moveY: 1 }); expect(s.player.clawUsed).toBeUndefined(); expect(validRun(s)).toBe(true);
  });
  it('rejects newly active trap destinations but permits an anchor on currently resting ground', () => {
    const s = run(); s.expedition!.region = 2; s.expedition!.dungeon!.rooms[1].cleared = false; s.phase = 'combat'; s.trapTicks = 110; s.player.x = 80; s.player.y = 110;
    expect(useAuxiliary(s, s.player)).toBe(true); s.player.x = 400; s.player.y = 183; s.trapTicks = 70;
    const before = structuredClone(s); expect(useAuxiliary(s, s.player)).toBe(false); expect(s).toEqual(before); s.trapTicks = 120; expect(useAuxiliary(s, s.player)).toBe(true); expect(s.player.y).toBe(110);
  });
  it('allows unsafe dynamic occupancy to be saved but refuses to return until the obstruction leaves', () => {
    const s = run(); useAuxiliary(s, s.player); s.player.x = 400; s.growth!.relicUnlocks!.push('R16');
    const room = s.expedition!.dungeon!.rooms[7]; room.visited = room.cleared = true; room.reward = { room: 7, candidates: ['R16'], choice: 'R16' }; grantRelic(s, 'R16');
    s.stoneWall = { id: s.nextId++, x: 76, y: 159, w: 8, h: 48, hp: 40, ticks: 240 }; s.player.auxCooldowns = { R16: 600 };
    expect(validRun(s)).toBe(true); const before = structuredClone(s); expect(useAuxiliary(s, s.player)).toBe(false); expect(s).toEqual(before);
    delete s.stoneWall; expect(useAuxiliary(s, s.player)).toBe(true);
  });
  it('ends a current jump and dodge without adding protection or resetting ordinary attack and dodge recharge', () => {
    const s = run(); useAuxiliary(s, s.player); s.player.x = 400; s.player.height = 15; s.player.jumpVelocity = -10; s.player.airJumpUsed = true;
    s.player.dodgeRemaining = .1; s.player.dodgeCooldown = 60; s.player.fireCooldown = 20; s.player.invulnerable = 11;
    expect(useAuxiliary(s, s.player)).toBe(true); expect(s.player.height).toBeUndefined(); expect(s.player.airJumpUsed).toBeUndefined(); expect(s.player.dodgeRemaining).toBe(0);
    expect(s.player.dodgeCooldown).toBe(60); expect(s.player.fireCooldown).toBe(20); expect(s.player.invulnerable).toBe(11);
  });
  it('does not interpolate even a short recall through the space between its endpoints', () => {
    const s = run(); useAuxiliary(s, s.player); s.player.x = 100; const previous = captureMotion(s);
    step(s, { ...emptyInput(), auxiliary: true }); expect(interpolateMotion(s, previous, .25).player.x).toBe(80);
  });
  it('preserves a live anchor and charge across safe equipment swaps and recharges exactly at the boundary', () => {
    const s = run(); useAuxiliary(s, s.player); grantRelic(s, 'R13'); expect(equipAuxiliary(s, 'R13')).toBe(true); expect(anchor(s)).toBeDefined();
    expect(equipAuxiliary(s, 'R26')).toBe(true); s.player.x = 400; useAuxiliary(s, s.player); s.timeDebt = 2;
    advanceAuxiliaryRecharge(s); advanceAuxiliaryRecharge(s); expect(s.player.auxCooldowns!.R26).toBe(600);
    for (let i = 0; i < 599; i++) advanceAuxiliaryRecharge(s); expect(s.player.auxCooldowns!.R26).toBe(1); expect(useAuxiliary(s, s.player)).toBe(false);
    advanceAuxiliaryRecharge(s); expect(useAuxiliary(s, s.player)).toBe(true);
  });
  it('clears anchors on death and region changes but preserves a recall cooldown', () => {
    const dead = run(); useAuxiliary(dead, dead.player); dead.player.hp = 0; clearCombatEffects(dead); expect(anchor(dead)).toBeUndefined();
    const s = run(); s.expedition!.room = 8; s.expedition!.dungeon!.rooms[8].visited = true; s.boss = createBoss(s); useAuxiliary(s, s.player);
    s.boss.hp = 0; s.phase = 'cleared'; s.expedition!.dungeon!.rooms[8].cleared = true; clearCombatEffects(s); expect(anchor(s)).toBeDefined();
    expect(enterNextRegion(s)).toBe(true); expect(anchor(s)).toBeUndefined();
    const charged = run(); useAuxiliary(charged, charged.player); charged.player.x = 400; useAuxiliary(charged, charged.player); travel(charged, 'north'); expect(charged.player.auxCooldowns!.R26).toBe(600);
  });
  it('does not wall-slide along merchant furniture and requires current tangent input', () => {
    const s = run('R27'); s.expedition!.room = 10; s.player.x = 275; s.player.y = 183; step(s, { ...emptyInput(), moveX: 1, moveY: 1, dodge: true });
    expect(s.player.clawUsed).toBeUndefined(); expect(s.player.y).toBeLessThan(190);
    const released = run('R27'); released.player.x = 150; released.player.y = 120; step(released, { ...emptyInput(), moveX: 1, moveY: 1, dodge: true });
    released.player.x = 199; released.player.y = 120; step(released, emptyInput()); expect(released.player.clawUsed).toBeUndefined(); expect(released.player.y).toBeLessThan(125);
  });
  it('uses each double-dodge charge once and resumes a saved spent extension without refilling it', () => {
    const s = run('R27'); grantRelic(s, 'R25'); for (let i = 0; i < 96; i++) step(s, emptyInput()); s.player.x = 199; s.player.y = 120; step(s, { ...emptyInput(), moveX: 1, moveY: 1, dodge: true });
    const copy = structuredClone(s); for (let i = 0; i < 14; i++) { step(s, { ...emptyInput(), moveX: 1, moveY: 1 }); step(copy, { ...emptyInput(), moveX: 1, moveY: 1 }); }
    expect(copy).toEqual(s); expect(s.player.clawUsed).toBeUndefined(); s.player.x = 199; s.player.y = 120;
    step(s, { ...emptyInput(), moveX: 1, moveY: 1, dodge: true }); expect(s.player.clawUsed).toBe(true); expect(s.stats.dodges).toBe(2); expect(s.player.dodgeCharges).toBe(0);
  });
  it('rejects corrupted movement ownership, location and timer data without throwing while old saves stay valid', () => {
    const s = run(); useAuxiliary(s, s.player);
    const mutations: ((q: typeof s) => void)[] = [q => { anchor(q).region = 2; }, q => { anchor(q).room = 6; }, q => { anchor(q).id = 0; },
      q => { anchor(q).x = NaN; }, q => { anchor(q).x = 220; anchor(q).y = 120; }, q => { q.anchor = null as any; },
      q => { q.player.auxCooldowns = { R26: 1 }; }, q => { q.player.teleportTick = q.tick + 1; }, q => { q.player.clawUsed = true; }, q => { q.expedition!.relics = []; }];
    for (const mutation of mutations) { const bad = structuredClone(s); mutation(bad); expect(() => validRun(bad)).not.toThrow(); expect(validRun(bad)).toBe(false); }
    expect(validRun(createDungeonRun(42))).toBe(true);
  });
  it('saves an actual final-heart unlock and a live anchor, then resumes the identical recall cooldown', async () => {
    const store = new SaveStore('movement-live'); await store.load(); const won = createDungeonRun(42); beginGrowthRun(won, emptyInvestment(), 'movement-heart-proof');
    for (let region = 1; region <= 3; region++) {
      won.expedition!.room = 8; won.expedition!.dungeon!.rooms[8].visited = won.expedition!.dungeon!.rooms[8].cleared = true;
      won.boss = createBoss(won); won.boss.hp = 0; won.phase = 'cleared'; if (region < 3) expect(enterNextRegion(won)).toBe(true);
    }
    expect(validRun(won)).toBe(true); await store.save(won, defaultSettings()); const profile = (await store.load())!.profile!;
    expect(profile.heartDefeated).toBe(true); expect(growthRelicUnlocks(profile)).toEqual(expect.arrayContaining(['R26', 'R27']));
    const s = run(); useAuxiliary(s, s.player); await store.save(s, defaultSettings()); const loaded = (await store.load())!.run!; expect(loaded).toEqual(s);
    s.player.x = loaded.player.x = 400; useAuxiliary(s, s.player); useAuxiliary(loaded, loaded.player); for (let i = 0; i < 50; i++) { step(s, emptyInput()); step(loaded, emptyInput()); }
    expect(loaded).toEqual(s); await store.save(s, defaultSettings()); expect((await store.load())!.run).toEqual(s);
  });
  it('reaches both additions in real chest, refresh and shop pools after unlocking', () => {
    const seen = new Set<string>();
    for (let i = 1; i <= 500; i++) {
      const seed = Math.imul(i, 0x9e3779b9) >>> 0, s = createDungeonRun(seed); beginGrowthRun(s, emptyInvestment(), `movement-pool-${i}`, false, ['R26', 'R27']);
      s.expedition!.room = 6; s.phase = 'cleared'; const r = s.expedition!.dungeon!.rooms[6]; r.visited = r.cleared = true; prepareReward(s);
      for (const id of ['R26', 'R27'] as const) if (r.reward!.candidates.includes(id)) { seen.add(`chest-${id}`); const q = structuredClone(s); expect(chooseRelic(q, id)).toBe(true); expect(validRun(q)).toBe(true); }
      rerollReward(s); for (const id of ['R26', 'R27'] as const) if (r.reward!.candidates.includes(id)) { seen.add(`refresh-${id}`); const q = structuredClone(s); expect(chooseRelic(q, id)).toBe(true); expect(validRun(q)).toBe(true); }
      chooseRelic(s, 'skip');
      s.expedition!.room = 10; s.phase = 'explore'; const shop = s.expedition!.dungeon!.rooms[10]; shop.visited = shop.cleared = true; s.gold = 100; refreshShop(s);
      for (const id of ['R26', 'R27'] as const) { const slot = shop.shop!.slots.findIndex(q => q.relic === id); if (slot >= 0) { seen.add(`shop-${id}`); const q = structuredClone(s); expect(buyFromShop(q, slot, shop.shop!.revision)).toBe('bought'); expect(validRun(q)).toBe(true); } }
    }
    expect(seen.size).toBe(6);
  });
  it('extends a dodge whose horizontal wall contact finishes beyond the edge in the same tick', () => {
    const s = run('R27'); s.player.x = 199; s.player.y = 154;
    step(s, { ...emptyInput(), moveX: 1, moveY: 1, dodge: true }); expect(s.player.x).toBe(201); expect(s.player.y).toBeGreaterThan(197); expect(s.player.clawUsed).toBe(true);
  });
  it('uses the actual horizontal contact for the opposite corner and negative tangent', () => {
    const s = run('R27'); s.player.x = 249; s.player.y = 102;
    step(s, { ...emptyInput(), moveX: -1, moveY: -1, dodge: true }); expect(s.player.x).toBe(247); expect(s.player.y).toBeLessThan(59); expect(s.player.clawUsed).toBe(true);
  });
  it('preserves the existing seventeen-point thorn save allowance without granting a claw extension', () => {
    const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'old-thorn-save', false, ['R15']);
    const r = s.expedition!.dungeon!.rooms[6]; r.visited = r.cleared = true; r.reward = { room: 6, candidates: ['R15'], choice: 'R15' }; grantRelic(s, 'R15');
    s.expedition!.room = 1; s.expedition!.dungeon!.rooms[1].visited = s.expedition!.dungeon!.rooms[1].cleared = true; s.expedition!.dungeon!.rooms[1].structure = 0;
    s.thornTrails = [{ id: s.nextId++, ticks: 120, damage: 4, points: Array.from({ length: 17 }, (_, i) => ({ x: 80 + i * 4.5, y: 183 })) }];
    expect(validRun(s)).toBe(true); s.thornTrails[0].points[1].x += 1; expect(validRun(s)).toBe(false);
  });
});
