import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { createDungeonRun, emptyInput, step, travel } from '../src/core/simulation';
import { beginGrowthRun, defaultProfile, emptyInvestment, growthRelicUnlocks } from '../src/core/growth';
import { RELIC_IDS, RELICS } from '../src/core/relics';
import { canAcquireRelic, grantRelic } from '../src/core/relic-acquisition';
import { equipAuxiliary, useAuxiliary } from '../src/core/auxiliary';
import { bodyObstacles, roomLayout } from '../src/core/room-layout';
import { moveBody } from '../src/core/geometry';
import { advanceProjectiles } from '../src/core/combat';
import { defaultSettings, SaveStore, validRun } from '../src/persistence/save';
import { BOUNDS, type Enemy } from '../src/core/model';
import { MASONRY, stoneWallFailure } from '../src/core/masonry';
import { ROOM_STRUCTURES } from '../src/core/room-structures';
import { advanceEnemies } from '../src/core/enemy-ai';
import { ENEMY_HEALTH } from '../src/core/enemy-balance';
import { advanceBoss, createBoss, startBossPattern } from '../src/core/boss';
import { damageEnemy } from '../src/core/combat';
import { reviveContract } from '../src/core/curses';
import { endTimeStop } from '../src/core/time-debt';
import { starlightEnd } from '../src/core/relic-combat';
import { prepareReward, chooseRelic, rerollReward } from '../src/core/expedition';
import { buyFromShop, refreshShop } from '../src/core/shop';
import { enterNextRegion } from '../src/core/region';

function run() {
  const s = createDungeonRun(42);
  beginGrowthRun(s, emptyInvestment(), 'masonry-run', false, ['R16']);
  const chest = s.expedition!.dungeon!.rooms[6]; chest.visited = chest.cleared = true;
  chest.reward = { room: 6, candidates: ['R16'], choice: 'R16' };
  grantRelic(s, 'R16');
  s.player.x = 80; s.player.y = 183;
  return s;
}
function enemy(s: ReturnType<typeof run>, kind: Enemy['kind'], x = 240, y = 183): Enemy {
  return { id: s.nextId++, kind, x, y, hp: ENEMY_HEALTH[kind], maxHp: ENEMY_HEALTH[kind], angle: Math.PI,
    mode: 'windup', timer: 1, targetX: 80, targetY: 183, flash: 0 };
}
function combatRun() {
  const s = run(); s.expedition!.room = 1; const room = s.expedition!.dungeon!.rooms[1]; room.visited = true; room.structure = 0;
  s.phase = 'combat'; return s;
}
describe('masonry relic', () => {
  it('adds a rare auxiliary and snapshots its boss unlock only at departure', () => {
    expect(RELIC_IDS).toHaveLength(57); expect((RELICS as any).R16.rarity).toBe('rare');
    const s = createDungeonRun(42), p = defaultProfile();
    beginGrowthRun(s, emptyInvestment(), 'locked-wall');
    expect(canAcquireRelic(s, 'R16' as any)).toBe(false);
    p.bossDefeated = true; expect(growthRelicUnlocks(p)).toContain('R16');
    expect(canAcquireRelic(s, 'R16' as any)).toBe(false);
    expect(grantRelic(run(), 'R16' as any)).toBe(false);
  });
  it('installs one 48x8 wall within 80u and consumes only its own cooldown', () => {
    const s = run(); expect(useAuxiliary(s, { x: 1000, y: 183 })).toBe(true);
    expect((s as any).stoneWall).toMatchObject({ x: 156, y: 159, w: 8, h: 48, hp: 40, ticks: 240 });
    expect((s.player as any).auxCooldowns).toEqual({ R16: 600 });
    expect(s.player.auxCooldown).toBeUndefined(); expect(s.player.timeCooldown).toBeUndefined();
    const old = structuredClone(s); expect(useAuxiliary(s, { x: 80, y: 103 })).toBe(false); expect(s).toEqual(old);
  });
  it('blocks walking and dodging with the same bounds as enemy navigation', () => {
    const s = run(); useAuxiliary(s, { x: 160, y: 183 });
    const p = { x: 100, y: 183 }; moveBody(p, 150, 0, 7, bodyObstacles(s));
    expect(p.x).toBe(149); expect(roomLayout(s).walls).toContain((s as any).stoneWall);
  });
  it('rejects installation inside a body without charging or allocating an ID', () => {
    const s = run(), old = structuredClone(s);
    expect(useAuxiliary(s, { x: 80, y: 183 })).toBe(false); expect(s).toEqual(old);
  });
  it('absorbs enemy projectiles and breaks while leaving player damage and kills unchanged', () => {
    const s = run(); useAuxiliary(s, { x: 160, y: 183 });
    s.bullets = [0, 1].map(() => ({ id: s.nextId++, x: 180, y: 183, vx: -2400, vy: 0, life: 20, damage: 20, owner: 'enemy' as const }));
    expect(advanceProjectiles(s)).toEqual([]); expect((s as any).stoneWall).toBeUndefined();
    expect(s.bullets).toEqual([]); expect(s.stats.damage).toBe(0); expect(s.player.hp).toBe(100);
  });
  it('has actual 60u height so a projectile above the wall passes', () => {
    const s = run(); useAuxiliary(s, { x: 160, y: 183 });
    s.bullets = [{ id: s.nextId++, x: 140, y: 183, vx: 2400, vy: 0, height: 70, heightVelocity: 0, life: 20, damage: 7, owner: 'player' }];
    advanceProjectiles(s); expect(s.bullets).toHaveLength(1); expect(s.bullets[0].x).toBe(180);
    expect((s as any).stoneWall.hp).toBe(40);
  });
  it('ages the wall and persists cooldown while changing equipped auxiliary', () => {
    const s = run(); useAuxiliary(s, { x: 160, y: 183 });
    expect(validRun(s)).toBe(true);
    const chest = s.expedition!.dungeon!.rooms[7]; chest.visited = chest.cleared = true;
    chest.reward = { room: 7, candidates: ['R13'], choice: 'R13' };
    grantRelic(s, 'R13'); expect(equipAuxiliary(s, 'R13')).toBe(true);
    for (let i = 0; i < 240; i++) step(s, emptyInput());
    expect((s as any).stoneWall).toBeUndefined(); expect((s.player as any).auxCooldowns.R16).toBe(360);
    expect(equipAuxiliary(s, 'R16' as any)).toBe(true); expect(useAuxiliary(s, { x: 160, y: 183 })).toBe(false);
    expect(validRun(s)).toBe(true);
  });
  it('clears a placed wall on room movement while retaining cooldown', () => {
    const s = run(); useAuxiliary(s, { x: 160, y: 183 });
    expect(travel(s, 'north')).toBe(true); expect((s as any).stoneWall).toBeUndefined();
    expect((s.player as any).auxCooldowns.R16).toBe(600);
  });
  it('rejects exits, obstacles, enemies and reserved destinations without spending state', () => {
    const exit = run(); exit.player.x = 320; exit.player.y = BOUNDS.y + 100;
    expect(stoneWallFailure(exit, { x: 320, y: BOUNDS.y + 40 })).toContain('출구');
    for (const reservation of ['body', 'blink', 'summon', 'bomb'] as const) {
      const s = run(), e = enemy(s, 'voidknight', 280); e.mode = 'move'; e.timer = 0;
      if (reservation === 'body') e.x = 160;
      if (reservation === 'blink') e.blinkTarget = { x: 160, y: 183 };
      if (reservation === 'summon') e.summonPoints = [{ x: 160, y: 183 }, { x: 300, y: 183 }];
      if (reservation === 'bomb') s.bombs = [{ id: s.nextId++, x: 160, y: 183, ticks: 60 }];
      s.enemies = [e]; const old = structuredClone(s);
      expect(useAuxiliary(s, { x: 160, y: 183 })).toBe(false); expect(s).toEqual(old);
    }
    const pillar = run(); pillar.player.x = 180; pillar.player.y = 100;
    const old = structuredClone(pillar); expect(useAuxiliary(pillar, { x: 220, y: 125 })).toBe(false); expect(pillar).toEqual(old);
  });
  it('rejects a wall that seals a required corridor before allocating resources', () => {
    const s = run(), saved = ROOM_STRUCTURES[0];
    ROOM_STRUCTURES[0] = { name: '좁은 필수 통로', obstacles: [
      { x: 156, y: BOUNDS.y, w: 8, h: 159 - BOUNDS.y },
      { x: 156, y: 207, w: 8, h: BOUNDS.y + BOUNDS.h - 207 },
    ] };
    s.expedition!.dungeon!.rooms[0].structure = 0;
    try {
      expect(stoneWallFailure(s, { x: 160, y: 183 })).toContain('필수 이동 통로');
      const old = structuredClone(s); expect(useAuxiliary(s, { x: 160, y: 183 })).toBe(false); expect(s).toEqual(old);
    } finally { ROOM_STRUCTURES[0] = saved; }
  });
  it('stops the actual Shift dash, but permits a body above the 60u wall', () => {
    const s = run(); useAuxiliary(s, { x: 160, y: 183 }); s.player.x = 120;
    for (let i = 0; i < 15; i++) step(s, { ...emptyInput(), moveX: 1, dodge: i === 0 });
    expect(s.player.x).toBe(149); expect(validRun(s)).toBe(true);
    s.player.height = 61; s.player.jumpVelocity = 0;
    const p = { x: 149, y: 183 }; moveBody(p, 25, 0, 7, bodyObstacles(s)); expect(p.x).toBe(174);
  });
  it('bounces player shots without durability loss and detects descending shots through the top', () => {
    const s = run(); useAuxiliary(s, { x: 160, y: 183 }); grantRelic(s, 'R01');
    s.bullets = [{ id: s.nextId++, x: 140, y: 183, vx: 2400, vy: 0, height: 34, heightVelocity: 0, life: 20, damage: 7, owner: 'player', bouncesLeft: 2 }];
    advanceProjectiles(s); expect(s.bullets[0].vx).toBe(-2400); expect(s.stoneWall!.hp).toBe(40);
    s.bullets = [{ id: s.nextId++, x: 140, y: 183, vx: 2400, vy: 0, height: 80, heightVelocity: -2400, life: 20, damage: 7, owner: 'player' }];
    advanceProjectiles(s); expect(s.bullets).toEqual([]); expect(s.stoneWall!.hp).toBe(40);
  });
  it('blocks ground starlight while its elevated ray clears the actual wall height', () => {
    const s = run(); useAuxiliary(s, { x: 160, y: 183 }); s.player.aim = 0;
    expect(starlightEnd(s, 0).end.x).toBe(156);
    s.player.height = 50; expect(starlightEnd(s, 0).end.x).toBe(340);
  });
  it.each(['shield', 'heartguard', 'chainhound', 'voidknight', 'readerstatue'] as const)('receives one real %s attack, including a breaking attack absorbed for the player', kind => {
    const s = combatRun(); useAuxiliary(s, { x: 160, y: 183 }); s.stoneWall!.hp = 1;
    const e = enemy(s, kind, 190); e.targetX = 80; if (kind === 'heartguard') e.comboStrike = 1;
    s.enemies = [e]; const hits = advanceEnemies(s, { x: 0, y: 0 });
    expect(s.stoneWall).toBeUndefined(); expect(hits).toEqual([]);
    expect(s.stats.kills).toBe(0); expect(s.stats.damage).toBe(0);
  });
  it('charges into the wall once instead of repeatedly removing durability', () => {
    const s = combatRun(); useAuxiliary(s, { x: 160, y: 183 });
    const e = enemy(s, 'guard', 175); e.mode = 'charge'; e.timer = 10; e.targetX = 80; e.chargeHit = false; s.enemies = [e];
    advanceEnemies(s, { x: 0, y: 0 }); const hp = s.stoneWall!.hp; expect(hp).toBeLessThan(40);
    advanceEnemies(s, { x: 0, y: 0 }); expect(s.stoneWall!.hp).toBe(hp);
  });
  it('freezes auxiliary recharge during debt, while the independent wall lifetime runs', () => {
    const s = run(); useAuxiliary(s, { x: 160, y: 183 }); s.timeDebt = 2;
    step(s, emptyInput()); step(s, emptyInput()); expect(s.player.auxCooldowns!.R16).toBe(600); expect(s.stoneWall!.ticks).toBe(238);
    step(s, emptyInput()); expect(s.player.auxCooldowns!.R16).toBe(599); endTimeStop(s);
  });
  it('removes walls on actual revival loss without resetting its cooldown', () => {
    const s = run(); const other = s.expedition!.dungeon!.rooms[7]; other.visited = other.cleared = true; other.reward = { room: 7, candidates: ['R13'], choice: 'R13' };
    grantRelic(s, 'R13'); const altar = s.expedition!.dungeon!.rooms[9]; altar.visited = altar.cleared = true; altar.reward = { room: 9, candidates: ['R38', 'R43'], choice: 'R38' }; grantRelic(s, 'R38');
    useAuxiliary(s, { x: 160, y: 183 }); s.player.hp = 0; expect(reviveContract(s)).toBe(true);
    expect(s.stoneWall).toBeUndefined(); expect(s.player.equippedAux).toBeNull(); expect(s.player.auxCooldowns!.R16).toBe(600); expect(validRun(s)).toBe(true);
  });
  it.each([null, false, 'wall', { x: 156, y: 159, w: 48, h: 48, id: 1, hp: 40, ticks: 240 }, { x: 0, y: 0 }])('rejects a malformed wall %j without throwing', value => {
    const s = run(); useAuxiliary(s, { x: 160, y: 183 }); (s as any).stoneWall = value;
    expect(() => validRun(s)).not.toThrow(); expect(validRun(s)).toBe(false);
  });
  it('checks wall durability, IDs, ownership, geometry and independent timer shape', () => {
    const s = run(); useAuxiliary(s, { x: 160, y: 183 }); expect(validRun(s)).toBe(true);
    for (const change of [
      (v: typeof s) => { v.stoneWall!.hp = 0; }, (v: typeof s) => { v.stoneWall!.hp = 41; },
      (v: typeof s) => { v.stoneWall!.ticks = .5; }, (v: typeof s) => { v.stoneWall!.id = v.nextId; },
      (v: typeof s) => { v.stoneWall!.x = NaN; }, (v: typeof s) => { v.stoneWall!.x = 210; v.stoneWall!.y = 108; },
      (v: typeof s) => { v.player.auxCooldowns!.R16 = 601; }, (v: typeof s) => { v.player.auxCooldowns!.R13 = 10; },
      (v: typeof s) => { delete v.player.auxCooldowns; }, (v: typeof s) => { v.phase = 'dead'; },
      (v: typeof s) => { v.expedition!.relics = []; }, (v: typeof s) => { v.player.auxCooldowns = [] as any; },
    ]) { const value = structuredClone(s); change(value); expect(() => validRun(value)).not.toThrow(); expect(validRun(value)).toBe(false); }
    const old = createDungeonRun(42); expect(validRun(old)).toBe(true);
  });
  it('round trips a live wall through SaveStore and resumes the same attacks and timers', async () => {
    const store = new SaveStore('masonry-live'); await store.load();
    const prior = createDungeonRun(42); beginGrowthRun(prior, emptyInvestment(), 'unlock-boss'); prior.expedition!.room = 8;
    const room = prior.expedition!.dungeon!.rooms[8]; room.visited = room.cleared = true;
    prior.boss = createBoss(prior); prior.boss.hp = 0; prior.phase = 'cleared'; await store.save(prior, defaultSettings());
    const s = combatRun(); s.enemies = [enemy(s, 'archer', 280)]; useAuxiliary(s, { x: 160, y: 183 }); expect(validRun(s)).toBe(true);
    await store.save(s, defaultSettings()); const copy = (await store.load())!.run!; expect(copy).toEqual(s);
    for (let i = 0; i < 50; i++) { step(s, emptyInput()); step(copy, emptyInput()); }
    expect(copy).toEqual(s); expect(validRun(copy)).toBe(true); await store.save(copy, defaultSettings()); expect((await store.load())!.run).toEqual(copy);
  });
  it('actually selects or buys R16 from seeded unlocked pools and excludes locked pools', () => {
    const sources = new Set<string>();
    for (let i = 1; i <= 500; i++) {
      const seed = Math.imul(i, 0x9e3779b9) >>> 0, s = createDungeonRun(seed); beginGrowthRun(s, emptyInvestment(), `wall-pool-${i}`, false, ['R16']);
      s.expedition!.room = 6; const room = s.expedition!.dungeon!.rooms[6]; room.visited = room.cleared = true; s.phase = 'cleared'; prepareReward(s);
      if (room.reward!.candidates.includes('R16')) { sources.add('chest'); expect(chooseRelic(s, 'R16')).toBe(true); expect(validRun(s)).toBe(true); }
      else { rerollReward(s); if (room.reward!.candidates.includes('R16')) { sources.add('refresh'); expect(chooseRelic(s, 'R16')).toBe(true); expect(validRun(s)).toBe(true); } }
      const shop = createDungeonRun(seed); beginGrowthRun(shop, emptyInvestment(), `wall-shop-${i}`, false, ['R16']); shop.expedition!.room = 10;
      const r = shop.expedition!.dungeon!.rooms[10]; r.visited = r.cleared = true; shop.gold = 100; refreshShop(shop);
      const slot = r.shop!.slots.findIndex(v => v.relic === 'R16'); if (slot >= 0) { sources.add('shop'); expect(buyFromShop(shop, slot, r.shop!.revision)).toBe('bought'); expect(validRun(shop)).toBe(true); }
      const locked = createDungeonRun(seed); expect(canAcquireRelic(locked, 'R16')).toBe(false);
    }
    expect([...sources].sort()).toEqual(['chest', 'refresh', 'shop']);
  });
  it('has an exact 600-tick cooldown boundary without requiring re-equipment', () => {
    const s = run(); useAuxiliary(s, { x: 160, y: 183 });
    for (let i = 0; i < 599; i++) step(s, emptyInput());
    expect(useAuxiliary(s, { x: 160, y: 183 })).toBe(false); expect(s.player.auxCooldowns!.R16).toBe(1);
    step(s, emptyInput()); expect(s.player.auxCooldowns).toBeUndefined(); expect(useAuxiliary(s, { x: 160, y: 183 })).toBe(true); expect(validRun(s)).toBe(true);
  });
  it('absorbs one boss charge and clears on its real phase transition while keeping recharge', () => {
    const s = run(); s.expedition!.room = 8; s.expedition!.dungeon!.rooms[8].visited = true; s.phase = 'combat';
    s.boss = createBoss(s); s.boss.x = 195; s.boss.y = 183; s.boss.angle = Math.PI; s.boss.mode = 'charge'; s.boss.pattern = 'charge'; s.boss.timer = 10; s.boss.targetX = 80; s.boss.targetY = 183;
    expect(useAuxiliary(s, { x: 160, y: 183 })).toBe(true);
    for (let i = 0; i < 4; i++) advanceBoss(s);
    expect(s.stoneWall!.hp).toBe(22); expect(s.player.auxCooldowns!.R16).toBe(600);
    damageEnemy(s, s.boss, s.boss.maxHp * .6); expect(s.boss.mode).toBe('transition'); expect(s.stoneWall).toBeUndefined(); expect(s.player.auxCooldowns!.R16).toBe(600);
  });
  it('clears walls on final death and normal room clear without returning cooldown', () => {
    const s = combatRun(); useAuxiliary(s, { x: 160, y: 183 }); s.player.hp = 0; step(s, emptyInput());
    expect(s.phase).toBe('dead'); expect(s.stoneWall).toBeUndefined(); expect(s.player.auxCooldowns!.R16).toBe(599); expect(validRun(s)).toBe(true);
    const clear = combatRun(); useAuxiliary(clear, { x: 160, y: 183 }); step(clear, emptyInput());
    expect(clear.phase).toBe('explore'); expect(clear.stoneWall).toBeUndefined(); expect(clear.player.auxCooldowns!.R16).toBe(599); expect(validRun(clear)).toBe(true);
  });
  it('rejects saved walls with impossible lifetime/recharge or a blocked doorway', () => {
    const s = run(); useAuxiliary(s, { x: 160, y: 183 });
    const early = structuredClone(s); early.player.auxCooldowns!.R16 = 599; expect(validRun(early)).toBe(false);
    const door = structuredClone(s); Object.assign(door.stoneWall!, { x: 296, y: BOUNDS.y + 16, w: 48, h: 8 }); expect(validRun(door)).toBe(false);
  });
  it('rejects installation on the chain priest ritual summon reservation', () => {
    const s = run(); s.expedition!.room = 8; const room = s.expedition!.dungeon!.rooms[8]; room.visited = room.cleared = true;
    s.boss = createBoss(s); s.boss.hp = 0; s.phase = 'cleared'; expect(enterNextRegion(s)).toBe(true);
    s.expedition!.room = 8; s.expedition!.dungeon!.rooms[8].visited = true; s.phase = 'combat'; s.boss = createBoss(s);
    startBossPattern(s, 'ritual'); expect(s.boss.rocks).toContainEqual({ x: 540, y: 90 });
    s.player.x = 490; s.player.y = 90; expect(validRun(s)).toBe(true);
    const before = structuredClone(s); expect(useAuxiliary(s, { x: 540, y: 90 })).toBe(false); expect(s).toEqual(before);
  });
  it('reflects a descending R01 shot from the stone wall top instead of losing it', () => {
    const s = run(); const room = s.expedition!.dungeon!.rooms[7]; room.visited = room.cleared = true; room.reward = { room: 7, candidates: ['R01'], choice: 'R01' };
    grantRelic(s, 'R01'); useAuxiliary(s, { x: 160, y: 183 });
    s.bullets = [{ id: s.nextId++, x: 140, y: 183, vx: 2400, vy: 0, height: 80, heightVelocity: -2400, life: 20, damage: 7, owner: 'player', bouncesLeft: 2 }];
    advanceProjectiles(s); expect(s.bullets).toHaveLength(1); expect(s.bullets[0].heightVelocity).toBe(2400); expect(s.bullets[0].bouncesLeft).toBe(1);
    expect(s.bullets[0].height).toBeGreaterThan(62); expect(s.stoneWall!.hp).toBe(40); expect(validRun(s)).toBe(true);
  });
  it.each(['bombs', 'orbitShots', 'thornTrails'] as const)('rejects malformed %s alongside a live wall without bypassing corrupt-save handling', key => {
    const s = run(); useAuxiliary(s, { x: 160, y: 183 }); (s as any)[key] = {};
    expect(() => validRun(s)).not.toThrow(); expect(validRun(s)).toBe(false);
  });
});
