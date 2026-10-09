import { describe, expect, it } from 'vitest';
import { createDungeonRun, emptyInput, step } from '../src/core/simulation';
import { beginGrowthRun, defaultProfile, emptyInvestment, growthRelicUnlocks, growthGoals } from '../src/core/growth';
import { grantRelic, canAcquireRelic } from '../src/core/relic-acquisition';
import { useAuxiliary, equipAuxiliary } from '../src/core/auxiliary';
import { RELIC_IDS, RELICS } from '../src/core/relics';
import { advanceEnemies } from '../src/core/enemy-ai';
import { advanceProjectiles, damageEnemy } from '../src/core/combat';
import { type Enemy, type RunState } from '../src/core/model';
import { ENEMY_HEALTH } from '../src/core/enemy-balance';
import { validRun } from '../src/persistence/save';
import { clearCombatEffects } from '../src/core/player-effects';
import { clearLostRelicFields } from '../src/core/relic-fields';
import { ENEMY_ATTACK } from '../src/core/enemy-balance';
import { advanceHeart, startHeartPattern } from '../src/core/heart-boss';
import { advanceBoss, createBoss, startBossPattern } from '../src/core/boss';
import { bossNpcDamage } from '../src/core/npc-boss';
import { roomLayout } from '../src/core/room-layout';
import { advanceAuxiliaryRecharge } from '../src/core/time-debt';
import { chooseRelic, prepareReward, rerollReward } from '../src/core/expedition';
import { refreshShop, buyFromShop } from '../src/core/shop';
import { ageScarecrow } from '../src/core/scarecrow';
import { bodyObstacles } from '../src/core/room-layout';
import { moveBody } from '../src/core/geometry';
import { enterNextRegion } from '../src/core/region';
import { recordGrowth, validProfile } from '../src/core/growth';
import 'fake-indexeddb/auto';
import { SaveStore, defaultSettings } from '../src/persistence/save';

function run(kinds: Enemy['kind'][] = ['rat']) {
  const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'scarecrow-run', false, ['R18'] as any);
  const chest = s.expedition!.dungeon!.rooms[6]; chest.visited = chest.cleared = true; chest.reward = { room: 6, candidates: ['R18' as any], choice: 'R18' as any };
  grantRelic(s, 'R18' as any); s.expedition!.room = 1; s.expedition!.dungeon!.rooms[1].visited = true; s.expedition!.dungeon!.rooms[1].structure = 0;
  s.phase = 'combat'; s.player.x = 80; s.player.y = 183;
  s.enemies = kinds.map((kind, i) => ({ id: s.nextId++, kind, x: 360 + i * 120, y: 183, hp: ENEMY_HEALTH[kind], maxHp: ENEMY_HEALTH[kind],
    angle: Math.PI, mode: 'move', timer: 0, targetX: 80, targetY: 183, flash: 0 })); return s;
}
const decoy = (s: RunState) => (s as any).decoy;
describe('scarecrow relic', () => {
  it('registers a rare auxiliary and unlocks on the next departure after G04', () => {
    expect(RELIC_IDS).toHaveLength(57); expect((RELICS as any).R18.rarity).toBe('rare');
    const s = createDungeonRun(42), p = defaultProfile(); expect(canAcquireRelic(s, 'R18' as any)).toBe(false);
    p.priestDefeated = true; expect(growthRelicUnlocks(p)).toContain('R18');
    expect(growthGoals(p).find(g => g.id === 'G04')!.description).toContain('허수아비');
    expect(canAcquireRelic(s, 'R18' as any)).toBe(false);
  });
  it('places one real decoy at maximum range without taking an enemy slot and records only success', () => {
    const s = run(), next = s.nextId; expect(useAuxiliary(s, { x: 500, y: 183 })).toBe(true);
    expect(decoy(s)).toEqual({ kind: 'decoy', id: next, x: 180, y: 183, hp: 30, ticks: 300 });
    expect((s.player.auxCooldowns as any).R18).toBe(720); expect(s.nextId).toBe(next + 1); expect(s.enemies).toHaveLength(1);
    expect(s.growth!.auxiliaryUsed).toEqual(['R18']); expect(validRun(s)).toBe(true);
    const prior = structuredClone(s); expect(useAuxiliary(s, { x: 150, y: 183 })).toBe(false); expect(s).toEqual(prior);
  });
  it('rejects invalid and occupied ground without changing RNG, IDs or progress', () => {
    const s = run();
    for (const aim of [{ x: NaN, y: 183 }, { x: 80, y: 183 }]) { const before = structuredClone(s); expect(useAuxiliary(s, aim)).toBe(false); expect(s).toEqual(before); }
    s.player.x = 180; s.player.y = 120;
    const before = structuredClone(s); expect(useAuxiliary(s, { x: 220, y: 120 })).toBe(false); expect(s).toEqual(before);
  });
  it('prioritizes the decoy even with the player closer for a newly selected target', () => {
    const s = run(); expect(useAuxiliary(s, { x: 180, y: 183 })).toBe(true);
    const e = s.enemies[0]; e.x = 230; s.player.x = 240;
    advanceEnemies(s, { x: 0, y: 0 }); expect(e.targetId).toBe(decoy(s).id); expect(e.x).toBeLessThan(230);
  });
  it('keeps a previously committed player shot while a new attack lures to the decoy', () => {
    const s = run(['archer']), e = s.enemies[0]; e.mode = 'windup'; e.timer = 1; e.targetX = 80; e.targetY = 100;
    expect(useAuxiliary(s, { x: 180, y: 183 })).toBe(true); advanceEnemies(s, { x: 0, y: 0 });
    expect(e.targetId).toBe(0); expect(s.bullets[0].vy).toBeLessThan(0);
    e.mode = 'move'; e.timer = 0; advanceEnemies(s, { x: 0, y: 0 }); expect(e.targetId).toBe(decoy(s).id);
  });
  it('lets rats damage the decoy by contact without awarding a kill, gold or outgoing damage', () => {
    const s = run(); expect(useAuxiliary(s, { x: 180, y: 183 })).toBe(true);
    const e = s.enemies[0]; e.x = 198; advanceEnemies(s, { x: 0, y: 0 });
    expect(decoy(s).hp).toBe(24); expect(e.contactCooldown).toBe(45); expect(s.stats.damage).toBe(0); expect(s.stats.kills).toBe(0); expect(s.gold).toBe(0);
    advanceEnemies(s, { x: 0, y: 0 }); expect(decoy(s).hp).toBe(24); expect(validRun(s)).toBe(true);
  });
  it('absorbs an enemy projectile before the player but lets a high shot cross above it', () => {
    const s = run(); expect(useAuxiliary(s, { x: 180, y: 183 })).toBe(true);
    s.bullets = [{ id: s.nextId++, x: 220, y: 183, vx: -2400, vy: 0, owner: 'enemy', life: 20, damage: 10, height: 34 }];
    expect(advanceProjectiles(s)).toEqual([]); expect(decoy(s).hp).toBe(20); expect(s.bullets).toHaveLength(0);
    s.bullets = [{ id: s.nextId++, x: 220, y: 183, vx: -2400, vy: 0, owner: 'enemy', life: 20, damage: 10, height: 55 }];
    advanceProjectiles(s); expect(decoy(s).hp).toBe(20); expect(s.bullets).toHaveLength(1);
  });
  it('expires at 300 simulation ticks and preserves its recharge on clearing and loss', () => {
    const s = run(); s.enemies[0].frost = { hits: [], freezeTicks: 300, resistTicks: 480 };
    expect(useAuxiliary(s, { x: 180, y: 183 })).toBe(true);
    for (let i = 0; i < 299; i++) step(s, emptyInput()); expect(decoy(s).ticks).toBe(1); step(s, emptyInput()); expect(decoy(s)).toBeUndefined();
    expect((s.player.auxCooldowns as any).R18).toBe(420);
    const other = run(); useAuxiliary(other, { x: 180, y: 183 }); clearCombatEffects(other); expect(decoy(other)).toBeUndefined(); expect((other.player.auxCooldowns as any).R18).toBe(720);
    const lost = run(); useAuxiliary(lost, { x: 180, y: 183 }); lost.expedition!.relics = []; clearLostRelicFields(lost); expect(decoy(lost)).toBeUndefined(); expect(lost.player.equippedAux).toBeNull(); expect((lost.player.auxCooldowns as any).R18).toBe(720);
  });
  it('restores an active decoy and cooldown with deterministic progression, rejecting a forged decoy', () => {
    const s = run(); expect(useAuxiliary(s, { x: 180, y: 183 })).toBe(true); const saved = JSON.parse(JSON.stringify(s)); expect(validRun(saved)).toBe(true);
    for (let i = 0; i < 30; i++) { step(s, emptyInput()); step(saved, emptyInput()); } expect(saved).toEqual(JSON.parse(JSON.stringify(s)));
    for (const changes of [{ ticks: 301 }, { hp: 31 }, { id: s.enemies[0].id }, { x: 215, y: 120 }]) {
      const bad = structuredClone(s); Object.assign(decoy(bad), changes); expect(validRun(bad)).toBe(false);
    }
  });
  it.each(['shield', 'heartguard', 'chainhound', 'voidknight', 'sealcaster', 'readerstatue'] as const)('applies the original %s attack to the lure without player status effects or moving it', kind => {
    const s = run([kind]); useAuxiliary(s, { x: 180, y: 183 }); const e = s.enemies[0], d = decoy(s), before = { x: d.x, y: d.y };
    e.x = 220; e.angle = Math.PI; e.mode = 'windup'; e.timer = 1; e.targetX = d.x; e.targetY = d.y; e.targetId = d.id;
    if (kind === 'heartguard') e.comboStrike = 1;
    advanceEnemies(s, { x: 0, y: 0 }); expect(d.hp).toBe(30 - ENEMY_ATTACK[kind].damage); expect({ x: d.x, y: d.y }).toEqual(before);
    expect(s.player.weakTicks).toBeUndefined(); expect(s.player.slowTicks).toBeUndefined(); expect(s.stats.damage).toBe(0); expect(validRun(s)).toBe(true);
  });
  it('destroys the lure without a kill and recovers when a committed target disappears', () => {
    const s = run(['archer']); useAuxiliary(s, { x: 180, y: 183 }); const e = s.enemies[0];
    e.mode = 'windup'; e.timer = 10; e.targetId = decoy(s).id; damageEnemy(s, decoy(s), 30, 'enemy');
    expect(decoy(s)).toBeUndefined(); expect(s.stats.kills).toBe(0); advanceEnemies(s, { x: 0, y: 0 }); expect(e.mode).toBe('recover'); expect(s.bullets).toHaveLength(0);
  });
  it('does not take player or allied damage and allied targeting ignores the lure', () => {
    const s = run(['rat', 'guard']); useAuxiliary(s, { x: 180, y: 183 }); const d = decoy(s);
    damageEnemy(s, d, 45); damageEnemy(s, d, 45, 'ally'); expect(d.hp).toBe(30);
    const e = s.enemies[0]; e.charm = { ticks: 100, ownerFaction: 'player', sourceRelicId: 'R17', originalEnemyId: e.id };
    advanceEnemies(s, { x: 0, y: 0 }); expect(e.targetId).toBe(s.enemies[1].id); expect(s.enemies[1].targetId).toBe(d.id);
    s.bullets = [{ id: s.nextId++, x: 150, y: 183, vx: 2400, vy: 0, owner: 'player', life: 20, damage: 45 }]; advanceProjectiles(s); expect(d.hp).toBe(30);
  });
  it('preserves player hits in the same area when the original special attack targets the lure', () => {
    const s = run(['voidknight']); useAuxiliary(s, { x: 180, y: 183 }); const e = s.enemies[0], d = decoy(s);
    e.x = 220; s.player.x = 240; e.mode = 'windup'; e.timer = 1; e.targetId = d.id; e.targetX = d.x; e.targetY = d.y;
    expect(advanceEnemies(s, { x: 0, y: 0 })).toEqual(expect.arrayContaining([expect.objectContaining({ damage: ENEMY_ATTACK.voidknight.damage })]));
    expect(d.hp).toBe(30 - ENEMY_ATTACK.voidknight.damage);
  });
  it('keeps the boss aiming at the player but its announced rocks damage the lure', () => {
    const s = run([]); s.expedition!.room = 8; s.expedition!.dungeon!.rooms[8].visited = true; s.boss = createBoss(s);
    useAuxiliary(s, { x: 180, y: 183 }); startBossPattern(s, 'rocks'); expect(s.boss!.targetX).toBe(s.player.x);
    s.boss!.rocks = [{ x: 180, y: 183 }]; s.boss!.timer = 1; const old = structuredClone(s.boss!); s.boss!.mode = 'recover';
    bossNpcDamage(s, old, roomLayout(s).walls, new Map()); expect(decoy(s).hp).toBe(14); expect(s.boss!.targetX).toBe(80); expect(s.stats.kills).toBe(0);
  });
  it('keeps separate ally and decoy wave hits and clears decoy metadata after the wave', () => {
    const s = run(['rat']); s.expedition!.region = 3; s.expedition!.room = 8; s.expedition!.dungeon!.rooms[8].visited = true; s.boss = createBoss(s);
    s.player.x = 80; useAuxiliary(s, { x: 180, y: 183 }); const e = s.enemies[0]; e.x = 180; e.y = 190;
    e.charm = { ticks: 100, ownerFaction: 'player', sourceRelicId: 'R17', originalEnemyId: e.id };
    const b = s.boss!; b.mode = 'wave'; b.pattern = 'shockwave'; b.timer = 10; b.shockRadius = 120;
    const old = structuredClone(b); b.shockRadius = 128; bossNpcDamage(s, old, roomLayout(s).walls, new Map());
    expect(decoy(s).hp).toBe(12); expect(e.hp).toBe(12); expect(b.allyShockHit).toBe(e.id); expect((b as any).decoyShockHit).toBe(decoy(s).id);
    const same = structuredClone(b); b.shockRadius = 136; bossNpcDamage(s, same, roomLayout(s).walls, new Map()); expect(decoy(s).hp).toBe(12); expect(e.hp).toBe(12);
    b.timer = 1; advanceHeart(s); expect((b as any).decoyShockHit).toBeUndefined();
  });
  it('keeps lifetime independent of enemy time stop and suspends only recharge during time debt', () => {
    const s = run(); useAuxiliary(s, { x: 180, y: 183 }); s.timeDebt = 2;
    ageScarecrow(s); advanceAuxiliaryRecharge(s); expect(decoy(s).ticks).toBe(299); expect((s.player.auxCooldowns as any).R18).toBe(720);
    ageScarecrow(s); advanceAuxiliaryRecharge(s); expect(decoy(s).ticks).toBe(298); expect((s.player.auxCooldowns as any).R18).toBe(720);
    advanceAuxiliaryRecharge(s); expect((s.player.auxCooldowns as any).R18).toBe(719);
  });
  it('refuses unsafe exits, furniture, reserved summons and occupied ground atomically', () => {
    const s = run(); s.player.x = 180; s.player.y = 183;
    s.enemies[0].x = 230; const prior = structuredClone(s); expect(useAuxiliary(s, { x: 230, y: 183 })).toBe(false); expect(s).toEqual(prior);
    s.enemies[0].x = 360; s.enemies[0].summonPoints = [{ x: 230, y: 183 }]; expect(useAuxiliary(s, { x: 230, y: 183 })).toBe(false);
    delete s.enemies[0].summonPoints; s.phase = 'explore'; s.expedition!.room = 0; s.player.x = 320; s.player.y = 375;
    expect(useAuxiliary(s, { x: 320, y: 395 })).toBe(false);
    s.expedition!.room = 6; s.player.x = 320; s.player.y = 225; expect(useAuxiliary(s, { x: 320, y: 183 })).toBe(false);
  });
  it('makes the unlock reachable in actual chest, refresh and shop pools and acquires it once', () => {
    const seen = new Set<string>();
    for (let i = 1; i <= 500; i++) {
      const seed = Math.imul(i, 0x9e3779b9) >>> 0, s = createDungeonRun(seed); beginGrowthRun(s, emptyInvestment(), `lure-pool-${i}`, false, ['R18'] as any);
      s.expedition!.room = 6; s.phase = 'cleared'; const room = s.expedition!.dungeon!.rooms[6]; room.visited = room.cleared = true; prepareReward(s);
      if (room.reward!.candidates.includes('R18' as any)) { seen.add('chest'); const copy = structuredClone(s); expect(chooseRelic(copy, 'R18' as any)).toBe(true); expect(validRun(copy)).toBe(true); }
      rerollReward(s); if (room.reward!.candidates.includes('R18' as any)) { seen.add('refresh'); const copy = structuredClone(s); chooseRelic(copy, 'R18' as any); expect(validRun(copy)).toBe(true); }
      const shop = createDungeonRun(seed); beginGrowthRun(shop, emptyInvestment(), `lure-shop-${i}`, false, ['R18'] as any); shop.expedition!.room = 10;
      const r = shop.expedition!.dungeon!.rooms[10]; r.visited = r.cleared = true; shop.phase = 'explore'; shop.gold = 100; refreshShop(shop); const offer = r.shop!;
      const slot = offer.slots.findIndex(v => v.relic === ('R18' as any)); if (slot >= 0) { seen.add('shop'); expect(buyFromShop(shop, slot, offer.revision)).toBe('bought'); expect(validRun(shop)).toBe(true); expect(grantRelic(shop, 'R18' as any)).toBe(false); }
    }
    expect([...seen].sort()).toEqual(['chest', 'refresh', 'shop']);
  });
  it('blocks ground movement but lets sufficient jump height cross the body without treating it as a shot wall', () => {
    const s = run(); useAuxiliary(s, { x: 180, y: 183 }); s.player.x = 150;
    moveBody(s.player, 30, 0, 7, bodyObstacles(s)); expect(s.player.x).toBeLessThanOrEqual(166);
    s.player.height = 44; moveBody(s.player, 30, 0, 7, bodyObstacles(s)); expect(s.player.x).toBeGreaterThan(180);
    expect(roomLayout(s).walls).not.toContainEqual(expect.objectContaining({ decoyId: decoy(s).id }));
  });
  it('intercepts a guard charge once at the decoy body while retaining the committed player direction', () => {
    const s = run(['guard']); useAuxiliary(s, { x: 180, y: 183 }); const e = s.enemies[0]; e.x = 205;
    e.mode = 'charge'; e.timer = 20; e.angle = Math.PI; e.targetX = 80; e.targetY = 183; e.targetId = 0;
    advanceEnemies(s, { x: 0, y: 0 }); expect(decoy(s).hp).toBe(30 - ENEMY_ATTACK.guard.damage); expect(e.chargeHit).toBe(true);
    const hp = decoy(s).hp; advanceEnemies(s, { x: 0, y: 0 }); expect(decoy(s).hp).toBe(hp);
  });
  it('retains recharge and a live decoy through safe equipment swaps without granting a free cast', () => {
    const s = run(); grantRelic(s, 'R13'); s.phase = 'explore'; useAuxiliary(s, { x: 180, y: 183 });
    expect(equipAuxiliary(s, 'R13')).toBe(true); expect(decoy(s)).toBeDefined(); expect(equipAuxiliary(s, 'R18')).toBe(true);
    const prior = structuredClone(s); expect(useAuxiliary(s, { x: 150, y: 183 })).toBe(false); expect(s).toEqual(prior);
    s.phase = 'combat'; expect(equipAuxiliary(s, 'R13')).toBe(false);
  });
  it('rejects wrong ownership, phase, cooldown and malformed optional state without throwing', () => {
    const s = run(); useAuxiliary(s, { x: 180, y: 183 });
    const changed: ((v: RunState) => void)[] = [v => { v.phase = 'dead'; }, v => { v.expedition!.relics = []; },
      v => { delete v.player.auxCooldowns; }, v => { v.player.auxCooldowns!.R18 = 719; }, v => { v.decoy = null as any; },
      v => { v.bombs = {} as any; }, v => { decoy(v).x = NaN; }, v => { decoy(v).ticks = 0; }, v => { decoy(v).hp = 0; },
      v => { v.growth!.relicUnlocks = []; }];
    for (const change of changed) { const bad = structuredClone(s); change(bad); expect(() => validRun(bad)).not.toThrow(); expect(validRun(bad)).toBe(false); }
    const legacy = createDungeonRun(42); expect(validRun(legacy)).toBe(true);
  });
  it('records actual G04 victory and saves an acquired cast with unchanged next-departure unlocks', async () => {
    const store = new SaveStore('scarecrow-live'); await store.load();
    const prior = createDungeonRun(42); beginGrowthRun(prior, emptyInvestment(), 'lure-priest-proof'); prior.expedition!.room = 8;
    prior.expedition!.dungeon!.rooms[8].visited = prior.expedition!.dungeon!.rooms[8].cleared = true; prior.boss = createBoss(prior); prior.boss.hp = 0; prior.phase = 'cleared';
    expect(enterNextRegion(prior)).toBe(true); prior.expedition!.room = 8; prior.expedition!.dungeon!.rooms[8].visited = prior.expedition!.dungeon!.rooms[8].cleared = true;
    prior.boss = createBoss(prior); prior.boss.hp = 0; prior.phase = 'cleared'; expect(validRun(prior)).toBe(true); await store.save(prior, defaultSettings());
    const profile = (await store.load())!.profile!; expect(profile.priestDefeated).toBe(true); expect(growthRelicUnlocks(profile)).toContain('R18');
    const s = run(); useAuxiliary(s, { x: 180, y: 183 }); await store.save(s, defaultSettings()); const loaded = (await store.load())!;
    expect(loaded.run).toEqual(s); expect(loaded.profile!.auxiliaryUsed).toEqual(['R18']); expect(validProfile(loaded.profile)).toBe(true);
    for (let i = 0; i < 50; i++) { step(s, emptyInput()); step(loaded.run!, emptyInput()); } expect(loaded.run).toEqual(s);
    expect(recordGrowth(loaded.profile!, s).auxiliaryUsed).toEqual(['R18']);
  });
  it('refuses placing a stone wall through a live decoy rather than creating an invalid overlapping save', () => {
    const s = run(); s.growth!.relicUnlocks!.push('R16'); grantRelic(s, 'R16'); s.phase = 'explore';
    expect(useAuxiliary(s, { x: 160, y: 183 })).toBe(true); expect(equipAuxiliary(s, 'R16')).toBe(true);
    const before = structuredClone(s); expect(useAuxiliary(s, { x: 160, y: 183 })).toBe(false); expect(s).toEqual(before);
  });
  it('keeps unannounced gatekeeper reinforcements out of a decoy placed during transition', () => {
    const s = run([]); s.expedition!.room = 8; s.expedition!.dungeon!.rooms[8].visited = true; s.boss = createBoss(s);
    s.player.x = 80; s.player.y = 80; expect(useAuxiliary(s, { x: 100, y: 90 })).toBe(true);
    s.player.x = 600; s.player.y = 275; s.boss!.stage = 2; s.boss!.hp = 900; s.boss!.mode = 'transition'; s.boss!.timer = 1;
    advanceBoss(s); expect(s.enemies).toHaveLength(2); expect(s.enemies.every(e => Math.hypot(e.x - 100, e.y - 90) >= 17)).toBe(true);
  });
  it('uses the narrower decoy body for grazing shots instead of the ordinary monster radius', () => {
    const s = run(); useAuxiliary(s, { x: 180, y: 183 });
    s.bullets = [{ id: s.nextId++, x: 220, y: 193, vx: -2400, vy: 0, owner: 'enemy', life: 20, damage: 10, height: 34 }];
    advanceProjectiles(s); expect(decoy(s).hp).toBe(30); expect(s.bullets).toHaveLength(1);
  });
});
