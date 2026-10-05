import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { createDungeonRun, createRun, emptyInput, step } from '../src/core/simulation';
import { advanceProjectiles, damageEnemy } from '../src/core/combat';
import { advanceEnemies } from '../src/core/enemy-ai';
import { createBoss, advanceBoss } from '../src/core/boss';
import { startPriestPattern } from '../src/core/priest-boss';
import { enterNextRegion } from '../src/core/region';
import { startRiftSummon } from '../src/core/rift-shaman';
import { beginGrowthRun, defaultProfile, emptyInvestment } from '../src/core/growth';
import { canAcquireRelic, grantRelic } from '../src/core/relic-acquisition';
import { prepareReward } from '../src/core/expedition';
import { RELIC_IDS } from '../src/core/relics';
import { clearCombatEffects } from '../src/core/player-effects';
import { SaveStore, defaultSettings, validRun } from '../src/persistence/save';
import type { Bullet, Enemy, RelicId, RunState } from '../src/core/model';

const R11 = 'R11' as RelicId;
function arena(kind: Enemy['kind'] = 'sealcaster') {
  const s = createRun(42); s.phase = 'combat'; s.player.x = 90; s.player.y = 180;
  s.expedition!.relics = [R11]; s.expedition!.acquired = [R11];
  const hp = kind === 'riftshaman' ? 80 : kind === 'archer' ? 40 : 55;
  const e: Enemy = { id: s.nextId++, kind, x: 150, y: 180, hp, maxHp: hp,
    mode: 'windup', timer: 30, angle: Math.PI, targetX: 90, targetY: 180, flash: 0 };
  s.enemies = [e]; return { s, e };
}
function hit(s: RunState, e: { x: number; y: number }, extra: Partial<Bullet> = {}) {
  const id = s.nextId++;
  s.bullets.push({ id, eventId: id, owner: 'player', x: e.x - 11, y: e.y, vx: 320, vy: 0,
    damage: 7, life: 75, hitIds: [], ...extra }); advanceProjectiles(s); s.bullets = [];
}
function priest() {
  const s = createDungeonRun(42); const first = s.expedition!.dungeon!.rooms[8];
  const treasure = s.expedition!.dungeon!.rooms[6]; treasure.visited = treasure.cleared = true;
  treasure.reward = { room: 6, candidates: [R11], choice: R11 };
  first.visited = first.cleared = true; s.expedition!.room = 8;
  s.boss = createBoss(s); s.boss.hp = 0; s.phase = 'cleared'; enterNextRegion(s);
  const node = s.expedition!.dungeon!.rooms[8]; node.visited = true; s.expedition!.room = 8;
  s.phase = 'combat'; s.player.x = 90; s.player.y = 180;
  s.boss = createBoss(s); s.expedition!.relics = s.expedition!.acquired = [R11];
  startPriestPattern(s, 'ritual'); return { s, b: s.boss };
}

describe('silence bell', () => {
  it('unlocks after a first combat clear and keeps the unlock on the next expedition', () => {
    const s = createDungeonRun(42); expect(RELIC_IDS).toContain(R11);
    expect(canAcquireRelic(s, R11)).toBe(false); expect(grantRelic(s, R11)).toBe(false);
    const room = s.expedition!.dungeon!.rooms[1]; room.visited = room.cleared = true;
    expect(canAcquireRelic(s, R11)).toBe(true);
    const next = createDungeonRun(1); beginGrowthRun(next, emptyInvestment(), 'unlocked', true);
    expect(canAcquireRelic(next, R11)).toBe(true); expect(grantRelic(next, R11)).toBe(true);
    expect(grantRelic(next, R11)).toBe(false);
  });
  it('excludes locked rewards and offers the bell after unlocking when it is the remaining relic', () => {
    const s = createRun(42); s.phase = 'cleared';
    s.expedition!.acquired = s.expedition!.relics = RELIC_IDS.filter(id => !['R11','R38','R43'].includes(id));
    prepareReward(s); expect(s.expedition!.reward!.candidates).toEqual([R11]);
    for (let seed = 1; seed <= 30; seed++) {
      const fresh = createDungeonRun(seed); fresh.expedition!.room = 6;
      const room = fresh.expedition!.dungeon!.rooms[6]; room.visited = room.cleared = true; fresh.phase = 'cleared';
      prepareReward(fresh); expect(room.reward!.candidates).not.toContain(R11);
    }
  });
  it('cancels a blast, stops the caster for one second and keeps the full attack cooldown', () => {
    const { s, e } = arena(); hit(s, e);
    expect(e.hp).toBe(48); expect(e.mode).toBe('recover'); expect(e.timer).toBe(210);
    expect(s.player.silenceCooldown).toBe(360); expect(e.silenceTicks).toBe(60);
    for (let i = 0; i < 60; i++) advanceEnemies(s, { x: 0, y: 0 });
    expect([e.x, e.y]).toEqual([150, 180]); expect(e.timer).toBe(150); expect(e.silenceTicks).toBeUndefined();
    advanceEnemies(s, { x: 0, y: 0 }); expect(e.x).not.toBe(150);
    expect(s.cues.some(c => c.kind === 'blast')).toBe(false);
  });
  it('shares the six-second cooldown across targets and makes it available on the exact boundary', () => {
    const { s, e } = arena(); hit(s, e);
    const other = { ...e, id: s.nextId++, mode: 'windup' as const, timer: 30, silenceTicks: undefined }; s.enemies.push(other);
    hit(s, other); expect(other.mode).toBe('windup');
    s.enemies = []; s.waveDelay = 999;
    for (let i = 0; i < 359; i++) step(s, emptyInput());
    expect(s.player.silenceCooldown).toBe(1);
    s.enemies = [other]; hit(s, other); expect(other.mode).toBe('windup');
    other.timer = 30; step(s, emptyInput()); expect(s.player.silenceCooldown).toBeUndefined();
    hit(s, other); expect(other.mode).toBe('recover'); expect(s.player.silenceCooldown).toBe(360);
  });
  it('releases shaman reservations without refunding the room summon attempt', () => {
    const { s, e } = arena('riftshaman'); e.mode = 'move'; e.timer = 0;
    expect(startRiftSummon(s, e)).toBe(true); expect(e.summonPoints).toHaveLength(2);
    hit(s, e); expect(e.summonPoints).toBeUndefined(); expect(s.riftSummonUsed).toBe(true);
    expect(e.timer).toBe(144); expect(e.silenceTicks).toBe(60);
    for (let i = 0; i < 72; i++) advanceEnemies(s, { x: 0, y: 0 });
    expect(s.enemies).toHaveLength(1); expect(startRiftSummon(s, e)).toBe(false);
  });
  it('cancels a prepared shaman bolt as well as its summon', () => {
    const { s, e } = arena('riftshaman'); hit(s, e);
    expect(e.mode).toBe('recover'); expect(e.timer).toBe(144);
    for (let i = 0; i < 60; i++) advanceEnemies(s, { x: 0, y: 0 }); expect(s.bullets).toEqual([]);
  });
  it('cancels only the priest ritual, returns its slots and advances to chains without refunding attempts', () => {
    const { s, b } = priest(); expect(b.reservedSummons).toBe(2); hit(s, b);
    expect(b.mode).toBe('recover'); expect(b.timer).toBe(72); expect(b.silenceTicks).toBe(60);
    expect(b.ritualAttempts).toBe(1); expect(b.reservedSummons).toBeUndefined(); expect(b.rocks).toEqual([]);
    const position = [b.x, b.y];
    for (let i = 0; i < 60; i++) advanceBoss(s); expect([b.x, b.y]).toEqual(position);
    for (let i = 0; i < 12; i++) advanceBoss(s);
    expect(b.pattern).toBe('chains'); expect(b.mode).toBe('windup'); expect(s.enemies).toEqual([]);
  });
  it.each(['chains', 'ring'] as const)('leaves priest %s preparations intact without consuming the bell', pattern => {
    const { s, b } = priest(); startPriestPattern(s, pattern); hit(s, b);
    expect(b.mode).toBe('windup'); expect(b.pattern).toBe(pattern); expect(s.player.silenceCooldown).toBeUndefined();
  });
  it.each(['split', 'reflected'] as const)('does not let %s projectiles trigger silence', kind => {
    const { s, e } = arena(); hit(s, e, { kind }); expect(e.mode).toBe('windup');
    expect(s.player.silenceCooldown).toBeUndefined();
  });
  it('does not spend the bell on uninterruptible, dead, moving or blocked targets', () => {
    const ordinary = arena('archer'); hit(ordinary.s, ordinary.e); expect(ordinary.e.mode).toBe('windup');
    expect(ordinary.s.player.silenceCooldown).toBeUndefined();
    const dead = arena(); dead.e.hp = 7; hit(dead.s, dead.e); expect(dead.e.hp).toBe(0);
    expect(dead.s.player.silenceCooldown).toBeUndefined();
    const moving = arena(); moving.e.mode = 'move'; hit(moving.s, moving.e); expect(moving.e.mode).toBe('move');
    expect(moving.s.player.silenceCooldown).toBeUndefined();
    const wall = arena(); wall.e.x = 220; wall.e.y = 280;
    hit(wall.s, wall.e, { x: 220, y: 200, vx: 0, vy: 12000 }); expect(wall.e.hp).toBe(55);
    expect(wall.s.player.silenceCooldown).toBeUndefined();
  });
  it('allows a returning basic shot but never triggers without the relic or during boss protection', () => {
    const returning = arena(); returning.s.player.x = 200;
    hit(returning.s, returning.e, { x: 139, phase: 'return', outboundHits: [] });
    expect(returning.e.mode).toBe('recover'); expect(returning.s.player.silenceCooldown).toBe(360);
    const absent = arena(); absent.s.expedition!.relics = []; hit(absent.s, absent.e);
    expect(absent.e.mode).toBe('windup'); expect(absent.s.player.silenceCooldown).toBeUndefined();
    const protectedBoss = priest(); damageEnemy(protectedBoss.s, protectedBoss.b, 1100);
    const hp = protectedBoss.b.hp; hit(protectedBoss.s, protectedBoss.b);
    expect(protectedBoss.b.hp).toBe(hp); expect(protectedBoss.b.mode).toBe('transition');
    expect(protectedBoss.s.player.silenceCooldown).toBeUndefined();
  });
  it('keeps the cooldown after losing the bell and prevents reacquisition in the same expedition', () => {
    const { s, e } = arena(); hit(s, e); s.expedition!.relics = [];
    expect(validRun(s)).toBe(true); step(s, emptyInput()); expect(s.player.silenceCooldown).toBe(359);
    expect(grantRelic(s, R11)).toBe(false);
  });
  it('consumes both canceled ritual attempts and removes further rituals from the cycle', () => {
    const { s, b } = priest(); hit(s, b); delete s.player.silenceCooldown;
    startPriestPattern(s, 'ritual'); expect(b.ritualAttempts).toBe(2); hit(s, b);
    expect(b.reservedSummons).toBeUndefined(); expect(b.ritualAttempts).toBe(2);
    startPriestPattern(s, 'ritual'); expect(b.pattern).toBe('chains'); expect(b.ritualAttempts).toBe(2);
  });
  it('rejects an unlock snapshot without a supporting permanent clear record', async () => {
    const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'forged-unlock', true);
    const store = new SaveStore('silence-unlock-validation'); await store.load();
    await expect(store.save(s, defaultSettings())).rejects.toThrow();
    const room = s.expedition!.dungeon!.rooms[1]; room.visited = room.cleared = true;
    await store.save(s, defaultSettings()); const saved = await store.load();
    expect(saved!.run!.growth!.firstRoomCleared).toBe(true); expect(saved!.profile!.rooms).toHaveLength(1);
  });
  it('pauses the interrupted enemy lock during frost or time stop while the player cooldown advances', () => {
    const { s, e } = arena(); hit(s, e); e.frost = { hits: [], freezeTicks: 2, resistTicks: 2 };
    step(s, emptyInput()); expect(e.silenceTicks).toBe(60); expect(e.timer).toBe(210); expect(s.player.silenceCooldown).toBe(359);
    delete e.frost; s.timeStop = { x: 90, y: 180, ticks: 2, enemyIds: [e.id], bulletIds: [] };
    step(s, emptyInput()); expect(e.silenceTicks).toBe(60);
    delete s.timeStop; step(s, emptyInput()); expect(e.silenceTicks).toBe(59);
  });
  it('removes the action lock on enemy death or boss transition and combat cleanup', () => {
    const a = arena(); hit(a.s, a.e); damageEnemy(a.s, a.e, 100); expect(a.e.silenceTicks).toBeUndefined();
    const { s, b } = priest(); hit(s, b); damageEnemy(s, b, 1100); expect(b.mode).toBe('transition');
    expect(b.silenceTicks).toBeUndefined(); expect(b.ritualAttempts).toBe(1);
    const c = arena(); hit(c.s, c.e); clearCombatEffects(c.s); expect(c.e.silenceTicks).toBeUndefined();
    expect(c.s.player.silenceCooldown).toBe(360);
  });
  it.each(['caster', 'ritual'] as const)('saves %s lock and resumes identical combat including the global cooldown', async kind => {
    const s = kind === 'ritual' ? priest().s : arena().s; hit(s, s.boss ?? s.enemies[0]);
    expect(validRun(s)).toBe(true);
    const store = new SaveStore(`silence-${kind}`); await store.load(); await store.save(s, defaultSettings());
    const copy = (await store.load())!.run!;
    for (let i = 0; i < 370; i++) { step(s, emptyInput()); step(copy, emptyInput()); }
    expect(copy).toEqual(s);
  });
  it('accepts legacy state and rejects corrupted silence timers or an uninterruptible target lock', () => {
    expect(validRun(createRun(42))).toBe(true); const { s, e } = arena(); hit(s, e); expect(validRun(s)).toBe(true);
    for (const value of [-1, 0, 61, .5, NaN]) {
      const copy = structuredClone(s); copy.enemies[0].silenceTicks = value; expect(validRun(copy)).toBe(false);
    }
    for (const value of [-1, 0, 361, .5, NaN]) {
      const copy = structuredClone(s); copy.player.silenceCooldown = value; expect(validRun(copy)).toBe(false);
    }
    const copy = structuredClone(s); copy.enemies[0].timer--; expect(validRun(copy)).toBe(false);
    const ordinary = arena('archer'); ordinary.e.silenceTicks = 60; expect(validRun(ordinary.s)).toBe(false);
    const old = createDungeonRun(42); beginGrowthRun(old, emptyInvestment(), 'legacy'); expect(validRun(old)).toBe(true);
    old.growth!.firstRoomCleared = false as any; expect(validRun(old)).toBe(false);
    expect(defaultProfile().rooms).toEqual([]);
  });
});
