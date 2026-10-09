import { describe, expect, it } from 'vitest';
import { createDungeonRun, emptyInput, step } from '../src/core/simulation';
import { beginGrowthRun, defaultProfile, emptyInvestment, growthRelicUnlocks } from '../src/core/growth';
import { grantRelic, canAcquireRelic } from '../src/core/relic-acquisition';
import { useAuxiliary } from '../src/core/auxiliary';
import { RELIC_IDS, RELICS } from '../src/core/relics';
import { advanceEnemies } from '../src/core/enemy-ai';
import { advanceProjectiles, damageEnemy } from '../src/core/combat';
import { type Enemy } from '../src/core/model';
import { ENEMY_HEALTH } from '../src/core/enemy-balance';
import { validRun } from '../src/persistence/save';
import 'fake-indexeddb/auto';
import { defaultSettings, SaveStore } from '../src/persistence/save';
import { recordGrowth, validProfile } from '../src/core/growth';
import { ENEMY_ATTACK } from '../src/core/enemy-balance';
import { ageCharms } from '../src/core/allegiance';
import { createBoss, advanceBoss, startBossPattern } from '../src/core/boss';
import { bossNpcDamage } from '../src/core/npc-boss';
import { roomLayout } from '../src/core/room-layout';
import { enterNextRegion } from '../src/core/region';
import { reviveContract } from '../src/core/curses';
import { equipAuxiliary } from '../src/core/auxiliary';
import { startTimeStop } from '../src/core/time-debt';

function run(kinds: Enemy['kind'][] = ['archer', 'guard']) {
  const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'puppet-run', false, ['R17'] as any);
  const chest = s.expedition!.dungeon!.rooms[6]; chest.visited = chest.cleared = true; chest.reward = { room: 6, candidates: ['R17' as any], choice: 'R17' as any };
  grantRelic(s, 'R17' as any); s.expedition!.room = 1; s.expedition!.dungeon!.rooms[1].visited = true; s.expedition!.dungeon!.rooms[1].structure = 0;
  s.phase = 'combat'; s.player.x = 80; s.player.y = 183;
  s.enemies = kinds.map((kind, i) => ({ id: s.nextId++, kind, x: 200 + i * 120, y: 183, hp: ENEMY_HEALTH[kind], maxHp: ENEMY_HEALTH[kind],
    angle: Math.PI, mode: 'move', timer: 0, targetX: 80, targetY: 183, flash: 0 })); return s;
}
describe('puppet relic', () => {
  it('registers an epic auxiliary unlocked by the next departure G03 snapshot', () => {
    expect(RELIC_IDS).toHaveLength(57); expect((RELICS as any).R17.rarity).toBe('epic');
    const s = createDungeonRun(42); expect(canAcquireRelic(s, 'R17' as any)).toBe(false);
    const p = defaultProfile(); p.bossDefeated = true; expect(growthRelicUnlocks(p)).toEqual(expect.arrayContaining(['R16', 'R17']));
    expect(canAcquireRelic(s, 'R17' as any)).toBe(false);
  });
  it('preserves current HP, original ID and the enemy slot while charging exactly 840 ticks', () => {
    const s = run(), e = s.enemies[0]; e.hp = 17; const id = e.id, next = s.nextId;
    expect(useAuxiliary(s, e)).toBe(true); expect((e as any).charm).toEqual({ ticks: 240, ownerFaction: 'player', sourceRelicId: 'R17', originalEnemyId: id });
    expect(e.hp).toBe(17); expect(s.nextId).toBe(next); expect(s.enemies).toHaveLength(2); expect((s.player as any).auxCooldowns.R17).toBe(840);
    expect(validRun(s)).toBe(true);
  });
  it('does not spend IDs, randomness or cooldown on an invalid or occluded target', () => {
    const s = run(); const old = structuredClone(s); expect(useAuxiliary(s, { x: 600, y: 183 })).toBe(false); expect(s).toEqual(old);
    s.player.x = 180; s.player.y = 120; s.enemies[0].x = 260; s.enemies[0].y = 120; const blocked = structuredClone(s);
    expect(useAuxiliary(s, s.enemies[0])).toBe(false); expect(s).toEqual(blocked);
  });
  it('does not convert a second creature, a dead creature or a protected summon', () => {
    const s = run(); expect(useAuxiliary(s, s.enemies[0])).toBe(true); delete (s.player as any).auxCooldowns;
    const old = structuredClone(s); expect(useAuxiliary(s, s.enemies[1])).toBe(false); expect(s).toEqual(old);
    const dead = run(['rat']); dead.enemies[0].hp = 0; expect(useAuxiliary(dead, dead.enemies[0])).toBe(false);
    const spawned = run(['rat']); spawned.enemies[0].spawnTicks = 48; expect(useAuxiliary(spawned, spawned.enemies[0])).toBe(false);
  });
  it('holds room clear until the remaining converted original enemy returns', () => {
    const s = run(['rat']); expect(useAuxiliary(s, s.enemies[0])).toBe(true);
    for (let i = 0; i < 239; i++) step(s, emptyInput());
    expect(s.phase).toBe('combat'); expect((s.enemies[0] as any).charm.ticks).toBe(1);
    step(s, emptyInput()); expect((s.enemies[0] as any).charm).toBeUndefined(); expect(s.phase).toBe('combat'); expect(s.enemies).toHaveLength(1);
  });
  it('prevents all player damage sources from hurting the converted creature', () => {
    const s = run(); useAuxiliary(s, s.enemies[0]); expect((s.enemies[0] as any).charm).toBeDefined(); const hp = s.enemies[0].hp;
    damageEnemy(s, s.enemies[0], 45); expect(s.enemies[0].hp).toBe(hp); expect(s.stats.damage).toBe(0);
  });
  it('uses the original archer attack against enemies with immutable allied projectiles', () => {
    const s = run(['archer', 'archer']); const e = s.enemies[0], target = s.enemies[1]; useAuxiliary(s, e);
    e.mode = 'windup'; e.timer = 1; e.angle = 0; e.targetX = target.x; e.targetY = target.y; (e as any).targetId = target.id;
    advanceEnemies(s, { x: 0, y: 0 }); const b = s.bullets.find(v => v.owner === 'player');
    expect(b?.kind).toBe('ally'); expect(b?.damage).toBe(10); expect((b as any).originalEnemyId).toBe(e.id);
    for (let i = 0; i < 40; i++) advanceProjectiles(s); expect(target.hp).toBeLessThan(target.maxHp); expect(s.player.hp).toBe(100);
  });
  it('lets enemy projectiles hit an ally without applying player weakness or inflating outgoing damage', () => {
    const s = run(['rat']); useAuxiliary(s, s.enemies[0]);
    s.bullets = [{ id: s.nextId++, owner: 'enemy', source: 'riftshaman', x: 225, y: 183, vx: -1800, vy: 0, damage: 10, life: 20 }];
    advanceProjectiles(s); expect(s.enemies[0].hp).toBe(20); expect(s.player.weakTicks).toBeUndefined(); expect(s.stats.damage).toBe(0);
  });
  it.each(['shield', 'heartguard', 'chainhound', 'voidknight', 'sealcaster', 'readerstatue'] as const)('reuses %s attacks on enemy bodies without hurting the player', kind => {
    const s = run([kind, 'guard']), e = s.enemies[0], q = s.enemies[1]; q.x = 240; q.frost = { hits: [], freezeTicks: 30, resistTicks: 210 };
    useAuxiliary(s, e); e.mode = 'windup'; e.timer = 1; e.angle = 0; e.targetX = q.x; e.targetY = q.y; e.targetId = q.id;
    if (kind === 'heartguard') e.comboStrike = 1;
    advanceEnemies(s, { x: 0, y: 0 }); expect(q.hp).toBe(q.maxHp - ENEMY_ATTACK[kind].damage); expect(s.player.hp).toBe(100); expect(validRun(s)).toBe(true);
  });
  it.each(['shield', 'heartguard', 'chainhound', 'voidknight', 'sealcaster', 'readerstatue'] as const)('allows hostile %s attacks to hurt an ally without player-only effects', kind => {
    const s = run([kind, 'guard']), e = s.enemies[0], q = s.enemies[1]; q.x = 240; useAuxiliary(s, q); q.frost = { hits: [], freezeTicks: 30, resistTicks: 210 };
    e.mode = 'windup'; e.timer = 1; e.angle = 0; e.targetX = q.x; e.targetY = q.y; e.targetId = q.id;
    if (kind === 'heartguard') e.comboStrike = 1;
    advanceEnemies(s, { x: 0, y: 0 }); expect(q.hp).toBe(q.maxHp - ENEMY_ATTACK[kind].damage); expect(s.stats.damage).toBe(0); expect(s.player.slowTicks).toBeUndefined(); expect(validRun(s)).toBe(true);
  });
  it('preserves an already committed hostile target and selects nearby allies only for a new attack', () => {
    const s = run(['archer', 'rat']), e = s.enemies[0], q = s.enemies[1]; q.x = 240; e.mode = 'windup'; e.timer = 1; e.targetX = s.player.x;
    useAuxiliary(s, q); advanceEnemies(s, { x: 0, y: 0 }); expect(s.bullets[0].vx).toBeLessThan(0); expect(e.targetId).toBe(0);
    e.mode = 'move'; e.timer = 0; advanceEnemies(s, { x: 0, y: 0 }); expect(e.targetId).toBe(q.id);
  });
  it('cancels a shaman reservation, retains its spent attempt, and emits an independent damage8 allied shot', () => {
    const s = run(['riftshaman', 'guard']), e = s.enemies[0], q = s.enemies[1];
    s.riftSummonUsed = true; e.mode = 'windup'; e.timer = 72; e.summonPoints = [{ x: 400, y: 90 }, { x: 500, y: 300 }];
    useAuxiliary(s, e); expect(e.summonPoints).toBeUndefined(); expect(s.riftSummonUsed).toBe(true); expect(s.enemies).toHaveLength(2);
    e.mode = 'windup'; e.timer = 1; e.targetX = q.x; e.targetY = q.y; e.angle = 0; e.targetId = q.id; s.player.weakTicks = 100;
    advanceEnemies(s, { x: 0, y: 0 }); expect(s.bullets.filter(b => b.kind === 'ally')).toHaveLength(1); expect(s.bullets[0].damage).toBe(8); expect(s.bullets[0].source).toBe('riftshaman'); expect(validRun(s)).toBe(true);
    for (let i = 0; i < 240; i++) ageCharms(s); expect(e.charm).toBeUndefined(); expect(s.riftSummonUsed).toBe(true); expect(s.enemies).toHaveLength(2);
  });
  it('keeps recovered attack time across a faction change and does not extend charm with enemy time stop', () => {
    const s = run(['archer']); const e = s.enemies[0]; e.mode = 'recover'; e.timer = 60; useAuxiliary(s, e);
    expect(e.timer).toBe(60); expect(e.mode).toBe('recover');
    s.timeStop = { x: 80, y: 183, ticks: 90, enemyIds: [e.id], bulletIds: [] };
    for (let i = 0; i < 240; i++) ageCharms(s); expect(e.charm).toBeUndefined(); expect(e.timer).toBe(60);
    const other = run(['rat']); useAuxiliary(other, other.enemies[0]); startTimeStop(other); expect(other.timeStop!.enemyIds).toEqual([]);
  });
  it('does not let old enemy shots hit their now-converted shooter and preserves allied shot allegiance after expiry', () => {
    const s = run(['archer', 'guard']), e = s.enemies[0]; useAuxiliary(s, e);
    s.bullets = [{ id: s.nextId++, x: e.x + 3, y: e.y, vx: 210, vy: 0, owner: 'enemy', life: 100, damage: 10, originalEnemyId: e.id }];
    advanceProjectiles(s); expect(e.hp).toBe(40); expect(s.bullets).toHaveLength(1);
    const b = s.bullets[0]; b.kind = 'ally'; b.owner = 'player'; b.sourceRelicId = 'R17'; e.charm!.ticks = 1; ageCharms(s);
    expect(b.owner).toBe('player'); expect(b.kind).toBe('ally'); expect(validRun(s)).toBe(true);
  });
  it('never heals the player from an ally death and records that original body only once', () => {
    const s = run(['rat']); const e = s.enemies[0]; useAuxiliary(s, e); e.hp = 1; grantRelic(s, 'R56'); s.player.hp = 50;
    const make = () => ({ id: s.nextId++, x: 225, y: 183, vx: -1800, vy: 0, owner: 'enemy' as const, life: 30, damage: 10 });
    s.bullets = [make(), make()]; advanceProjectiles(s); expect(e.hp).toBe(0); expect(s.stats.kills).toBe(1); expect(s.stats.damage).toBe(0); expect(s.player.hp).toBe(50);
  });
  it('returns an actual lost R17 creature alive to the enemy side while retaining recharge', () => {
    const s = run(['rat']); const other = s.expedition!.dungeon!.rooms[7]; other.visited = other.cleared = true; other.reward = { room: 7, candidates: ['R13'], choice: 'R13' }; grantRelic(s, 'R13');
    const altar = s.expedition!.dungeon!.rooms[9]; altar.visited = altar.cleared = true; altar.reward = { room: 9, candidates: ['R38', 'R43'], choice: 'R38' }; grantRelic(s, 'R38');
    useAuxiliary(s, s.enemies[0]); const id = s.enemies[0].id; s.player.hp = 0; expect(reviveContract(s)).toBe(true);
    expect(s.enemies).toHaveLength(1); expect(s.enemies[0].id).toBe(id); expect(s.enemies[0].charm).toBeUndefined(); expect(s.player.auxCooldowns!.R17).toBe(840); expect(validRun(s)).toBe(true);
  });
  it('records only actual successful distinct auxiliary uses and keeps old profile points unchanged', () => {
    const s = run(); expect(s.growth!.auxiliaryUsed).toBeUndefined(); useAuxiliary(s, { x: 700, y: 300 }); expect(s.growth!.auxiliaryUsed).toBeUndefined();
    useAuxiliary(s, s.enemies[0]); const p = recordGrowth(defaultProfile(), s); expect(p.auxiliaryUsed).toEqual(['R17']); expect(recordGrowth(p, s)).toEqual(p); expect(validProfile(p)).toBe(true);
    const bad = defaultProfile(); bad.auxiliaryUsed = ['R17']; expect(validProfile(bad)).toBe(false);
  });
  it('rejects forged charm, ownership, cooldown and success records without exceptions', () => {
    const s = run(); useAuxiliary(s, s.enemies[0]);
    for (const mutate of [
      (v: typeof s) => { v.enemies[0].charm!.ticks = 0; }, (v: typeof s) => { v.enemies[0].charm!.ticks = 241; },
      (v: typeof s) => { v.enemies[0].charm!.originalEnemyId++; }, (v: typeof s) => { (v.enemies[0].charm as any).ownerFaction = 'enemy'; },
      (v: typeof s) => { v.player.auxCooldowns!.R17 = 600; }, (v: typeof s) => { v.enemies[1].charm = { ...v.enemies[0].charm!, originalEnemyId: v.enemies[1].id }; },
      (v: typeof s) => { v.expedition!.relics = []; }, (v: typeof s) => { v.growth!.auxiliaryUsed = ['R13']; },
      (v: typeof s) => { v.enemies[0].charm = null as any; }, (v: typeof s) => { v.player.auxCooldowns!.R17 = NaN; },
    ]) { const value = structuredClone(s); mutate(value); expect(() => validRun(value)).not.toThrow(); expect(validRun(value)).toBe(false); }
    expect(validRun(createDungeonRun(42))).toBe(true);
  });
  it('shares generated projectile capacity without adding IDs or inheriting projectile relic modifiers', () => {
    const s = run(['archer', 'guard']); const e = s.enemies[0], q = s.enemies[1]; useAuxiliary(s, e);
    s.bullets = Array.from({ length: 120 }, () => ({ id: s.nextId++, kind: 'split' as const, owner: 'player' as const, x: 80, y: 183, vx: 100, vy: 0, life: 30, damage: 1 }));
    e.mode = 'windup'; e.timer = 1; e.angle = 0; e.targetX = q.x; e.targetY = q.y; e.targetId = q.id; const id = s.nextId;
    advanceEnemies(s, { x: 0, y: 0 }); expect(s.nextId).toBe(id); expect(s.bullets).toHaveLength(120);
  });
  it('restores a live converted creature and its actual success record through SaveStore with identical 60-tick combat', async () => {
    const store = new SaveStore('live-puppet'); await store.load(); const prior = createDungeonRun(42); beginGrowthRun(prior, emptyInvestment(), 'boss-proof');
    prior.expedition!.room = 8; const room = prior.expedition!.dungeon!.rooms[8]; room.visited = room.cleared = true; prior.boss = createBoss(prior); prior.boss.hp = 0; prior.phase = 'cleared'; await store.save(prior, defaultSettings());
    const s = run(['archer', 'guard']); s.view = { yaw: 0, pitch: 0 }; useAuxiliary(s, s.enemies[0], 0); await store.save(s, defaultSettings());
    const copy = (await store.load())!.run!; expect(copy).toEqual(s); expect((await store.load())!.profile!.auxiliaryUsed).toEqual(['R17']);
    for (let i = 0; i < 60; i++) { step(s, emptyInput()); step(copy, emptyInput()); expect(validRun(copy)).toBe(true); }
    expect(copy).toEqual(s); await store.save(copy, defaultSettings()); expect((await store.load())!.run).toEqual(copy);
  });
  it('lets fixed boss rocks hit an ally without changing the aim and cleans up on region carry', () => {
    const s = run(['guard']); s.expedition!.room = 8; s.expedition!.dungeon!.rooms[8].visited = true; s.boss = createBoss(s);
    const e = s.enemies[0]; useAuxiliary(s, e); e.frost = { hits: [], freezeTicks: 30, resistTicks: 210 }; s.boss.pattern = 'rocks'; s.boss.mode = 'windup'; s.boss.timer = 1; s.boss.rocks = [{ x: e.x, y: e.y }];
    const before = { ...s.boss }, walls = roomLayout(s).walls, points = new Map([[e.id, { x: e.x, y: e.y }]]); advanceBoss(s); bossNpcDamage(s, before, walls, points);
    expect(e.hp).toBe(e.maxHp - 16); expect(s.boss.targetX).toBe(before.targetX); expect(s.boss.targetY).toBe(before.targetY);
    s.expedition!.dungeon!.rooms[8].cleared = true; s.boss.hp = 0; s.phase = 'cleared'; expect(enterNextRegion(s)).toBe(true);
    expect(s.enemies).toEqual([]); expect(s.player.auxCooldowns!.R17).toBe(840);
  });
  it('can convert and save a summon after its last protection tick reaches zero', () => {
    const s = run(['rat']); s.enemies[0].spawnTicks = 0; expect(validRun(s)).toBe(true);
    expect(useAuxiliary(s, s.enemies[0])).toBe(true); expect(validRun(s)).toBe(true);
  });
  it.each(['shield', 'heartguard', 'chainhound', 'voidknight', 'sealcaster', 'readerstatue'] as const)('retains real player damage from hostile %s targeting an ally', kind => {
    const s = run([kind, 'guard']), e = s.enemies[0], q = s.enemies[1]; q.x = 240;
    useAuxiliary(s, q); s.player.x = 244; q.frost = { hits: [], freezeTicks: 30, resistTicks: 210 };
    e.mode = 'windup'; e.timer = 1; e.angle = 0; e.targetX = q.x; e.targetY = q.y; e.targetId = q.id;
    if (kind === 'heartguard') e.comboStrike = 1;
    expect(validRun(s)).toBe(true); step(s, emptyInput());
    expect(s.player.hp).toBe(100 - ENEMY_ATTACK[kind].damage);
    expect(q.hp).toBe(q.maxHp - ENEMY_ATTACK[kind].damage); expect(validRun(s)).toBe(true);
    if (kind === 'sealcaster') expect(s.player.slowTicks).toBe(120);
    if (kind === 'chainhound') expect(s.player.x).toBeLessThan(244);
  });
});
