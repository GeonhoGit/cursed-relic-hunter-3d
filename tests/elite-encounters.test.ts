import { describe, expect, it } from 'vitest';
import { createRun, emptyInput, step } from '../src/core/simulation';
import { advanceSpecialEnemy } from '../src/core/enemy-special';
import { advanceEnemies } from '../src/core/enemy-ai';
import { applyChainPull, cancelChainBite } from '../src/core/chain-hound';
import { npcAttack } from '../src/core/npc-combat';
import { roomLayout } from '../src/core/room-layout';
import { ENEMY_HEALTH } from '../src/core/enemy-balance';
import { ELITE_KINDS, eliteCooldown, eliteDamage, eliteHealth } from '../src/core/elite';
import { buildEncounter } from '../src/core/encounters';
import { advanceProjectiles } from '../src/core/combat';
import { pullGravity } from '../src/core/relic-fields';
import type { Enemy } from '../src/core/model';

type EliteKind = 'guard' | 'chainhound' | 'heartguard';
function arena(kind: EliteKind, elite = true) {
  const s = createRun(42); s.phase = 'combat'; s.readyTicks = 0;
  Object.assign(s.player, { x: 360, y: 180 });
  const e: Enemy = { id: s.nextId++, kind, ...(elite ? { elite: true as const } : {}),
    x: 320, y: 180, hp: ENEMY_HEALTH[kind], maxHp: ENEMY_HEALTH[kind],
    angle: 0, mode: 'windup', timer: 1, targetX: 360, targetY: 180, flash: 0 };
  if (kind === 'heartguard') e.comboStrike = 1;
  if (kind === 'guard') Object.assign(e, { mode: 'charge', x: 344, timer: 10, targetX: 500, chargeHit: false });
  s.enemies = [e]; return { s, e };
}

describe('elite attack execution', () => {
  it.each([
    ['guard', 16.8], ['chainhound', 16.8], ['heartguard', 19.2],
  ] as const)('scales the real %s player attack once', (kind, damage) => {
    const { s, e } = arena(kind), action = advanceSpecialEnemy(s, e);
    expect(action.hits).toHaveLength(1); expect(action.hits[0].damage).toBeCloseTo(damage);
    if (kind === 'chainhound') {
      expect(action.hits[0].pull).toEqual({ x: 320, y: 180 });
      applyChainPull(s, action.hits[0].pull!); expect(s.player.x).toBe(338);
    }
  });
  it.each([
    ['guard', 14], ['chainhound', 14], ['heartguard', 16],
  ] as const)('preserves ordinary %s player damage', (kind, damage) => {
    const { s, e } = arena(kind, false); expect(advanceSpecialEnemy(s, e).hits[0].damage).toBe(damage);
  });
  it('keeps both heartguard warnings and the combo pause while shortening only final recovery', () => {
    const { s, e } = arena('heartguard'); e.mode = 'move'; e.timer = 0; delete e.comboStrike;
    advanceSpecialEnemy(s, e); expect(e.timer).toBe(42); expect(e.comboStrike).toBe(1);
    for (let i = 0; i < 41; i++) expect(advanceSpecialEnemy(s, e).hits).toEqual([]);
    expect(advanceSpecialEnemy(s, e).hits[0].damage).toBeCloseTo(19.2); expect(e.timer).toBe(18);
    for (let i = 0; i < 18; i++) expect(advanceSpecialEnemy(s, e).hits).toEqual([]);
    expect(e.mode).toBe('windup'); expect(e.timer).toBe(30);
    for (let i = 0; i < 29; i++) expect(advanceSpecialEnemy(s, e).hits).toEqual([]);
    expect(advanceSpecialEnemy(s, e).hits[0].damage).toBeCloseTo(19.2);
    expect(e.timer).toBe(162); expect(e.comboStrike).toBeUndefined();
    for (let i = 0; i < 35; i++) expect(advanceSpecialEnemy(s, e).move).toBe(false);
    expect(advanceSpecialEnemy(s, e).move).toBe(true);
    for (let i = 0; i < 125; i++) expect(advanceSpecialEnemy(s, e).hits).toEqual([]);
    expect(e.timer).toBe(1); advanceSpecialEnemy(s, e); expect(e.timer).toBe(42);
  });
  it('keeps the guard warning and sixty-tick recovery opening', () => {
    const { s, e } = arena('guard'); Object.assign(e, { x: 320, mode: 'move', timer: 0 });
    advanceSpecialEnemy(s, e); expect(e.timer).toBe(48);
    const aim = { x: e.targetX, y: e.targetY, angle: e.angle }; s.player.y = 190;
    for (let i = 0; i < 47; i++) expect(advanceSpecialEnemy(s, e).hits).toEqual([]);
    expect({ x: e.targetX, y: e.targetY, angle: e.angle }).toEqual(aim);
    advanceSpecialEnemy(s, e); expect(e.mode).toBe('charge');
    for (let i = 0; i < 100 && e.mode === 'charge'; i++) advanceSpecialEnemy(s, e);
    expect(e.mode).toBe('recover'); expect(e.timer).toBe(162);
    for (let i = 0; i < 59; i++) expect(advanceSpecialEnemy(s, e).move).toBe(false);
    expect(advanceSpecialEnemy(s, e).move).toBe(true);
  });
  it('keeps the hound warning, pull strength and eighteen-tick recovery opening', () => {
    const { s, e } = arena('chainhound'); e.mode = 'move'; e.timer = 0;
    advanceSpecialEnemy(s, e); expect(e.timer).toBe(48);
    for (let i = 0; i < 47; i++) expect(advanceSpecialEnemy(s, e).hits).toEqual([]);
    expect(advanceSpecialEnemy(s, e).hits[0].damage).toBeCloseTo(16.8); expect(e.timer).toBe(162);
    for (let i = 0; i < 18; i++) expect(advanceSpecialEnemy(s, e).move).toBe(false);
    expect(advanceSpecialEnemy(s, e).move).toBe(true);
    cancelChainBite(e); expect(e.timer).toBe(162);
  });
  it.each([
    ['guard', 23.2], ['chainhound', 23.2], ['heartguard', 20.8],
  ] as const)('scales %s stone-wall damage once', (kind, wallHp) => {
    const { s, e } = arena(kind); s.player.y = 220;
    s.stoneWall = { id: s.nextId++, x: 352, y: 170, w: 8, h: 48, hp: 40, ticks: 240 };
    advanceSpecialEnemy(s, e); expect(s.stoneWall?.hp).toBeCloseTo(wallHp);
  });
  it.each([
    ['guard', 16.8], ['chainhound', 16.8], ['heartguard', 19.2],
  ] as const)('scales hostile %s hits on allies and decoys once', (kind, damage) => {
    for (const targetKind of ['ally', 'decoy'] as const) {
      const { s, e } = arena(kind); s.player.x = 540;
      let target;
      if (targetKind === 'ally') {
        const ally: Enemy = { ...e, id: s.nextId++, kind: 'rat', x: 360, hp: 100, maxHp: 100,
          elite: undefined, mode: 'move', timer: 0, charm: { ticks: 240, ownerFaction: 'player', sourceRelicId: 'R17', originalEnemyId: s.nextId - 1 } };
        s.enemies.push(ally); target = ally;
      } else { s.decoy = { id: s.nextId++, kind: 'decoy', x: 360, y: 180, hp: 100, ticks: 240 }; target = s.decoy; }
      const before = { ...e }, walls = roomLayout(s).walls;
      if (kind === 'guard') e.x = 349;
      const result = npcAttack(s, before, e, walls, new Map());
      expect(target.hp).toBeCloseTo(100 - damage); expect(result.hits.has(target.id)).toBe(true);
    }
  });
  it('scales elite NPC body contact once', () => {
    const { s, e } = arena('heartguard'); e.mode = 'move'; e.timer = 10;
    s.decoy = { id: s.nextId++, kind: 'decoy', x: 330, y: 180, hp: 100, ticks: 240 };
    npcAttack(s, { ...e }, e, [], new Map()); expect(s.decoy.hp).toBeCloseTo(92.8);
  });
  it.each(['chainhound', 'heartguard'] as const)('preserves elite %s height, angle and visibility avoidance', kind => {
    for (const protection of ['height', 'behind', 'wall'] as const) {
      const { s, e } = arena(kind);
      if (protection === 'height') s.player.height = 60;
      if (protection === 'behind') s.player.x = 280;
      if (protection === 'wall') { Object.assign(e, { x: 220, y: 100, angle: Math.PI / 2 }); Object.assign(s.player, { x: 220, y: 160 }); }
      expect(advanceSpecialEnemy(s, e).hits).toEqual([]);
    }
  });
  it('pauses an elite warning during frost and resumes its original duration', () => {
    const { s, e } = arena('chainhound'); e.timer = 48; e.frost = { hits: [], freezeTicks: 2, resistTicks: 0 };
    advanceEnemies(s, { x: 0, y: 0 }); expect(e.timer).toBe(48); expect(e.frost.freezeTicks).toBe(1);
    advanceEnemies(s, { x: 0, y: 0 }); expect(e.timer).toBe(48); expect(e.frost.freezeTicks).toBe(0);
    advanceEnemies(s, { x: 0, y: 0 }); expect(e.timer).toBe(47);
  });
  it('applies elite hound damage and the normal pull through the common damage gate', () => {
    const { s, e } = arena('chainhound'); s.player.x = 380; e.targetX = 380;
    step(s, emptyInput()); expect(s.player.hp).toBeCloseTo(83.2); expect(s.player.x).toBe(350); expect(s.stats.hits).toBe(1);
  });
  it.each([
    ['chainhound', 16.8, 23.2], ['heartguard', 19.2, 20.8],
  ] as const)('scales %s alternate-target player queries without repeating real wall or NPC damage', (kind, damage, wallHp) => {
    const { s, e } = arena(kind);
    s.decoy = { id: s.nextId++, kind: 'decoy', x: 365, y: 180, hp: 100, ticks: 240 };
    e.targetId = s.decoy.id;
    s.stoneWall = { id: s.nextId++, x: 372, y: 170, w: 8, h: 48, hp: 40, ticks: 240 };
    const hits = advanceEnemies(s, { x: 0, y: 0 });
    expect(hits).toHaveLength(1); expect(hits[0].damage).toBeCloseTo(damage);
    expect(s.decoy.hp).toBeCloseTo(100 - damage); expect(s.stoneWall?.hp).toBeCloseTo(wallHp);
  });
  it('lets a decoy intercept an elite guard charge without a second special hit', () => {
    const { s, e } = arena('guard'); s.player.x = 380;
    s.decoy = { id: s.nextId++, kind: 'decoy', x: 360, y: 180, hp: 100, ticks: 240 }; e.targetId = s.decoy.id;
    expect(advanceEnemies(s, { x: 0, y: 0 })).toEqual([]);
    expect(s.decoy.hp).toBeCloseTo(83.2); expect(e.chargeHit).toBe(true);
    advanceEnemies(s, { x: 0, y: 0 }); expect(s.decoy.hp).toBeCloseTo(83.2);
  });
  it.each(['dodge', 'invulnerable'] as const)('keeps elite hound damage and pull behind the %s gate', protection => {
    const { s } = arena('chainhound'); s.player.x = 380;
    if (protection === 'dodge') Object.assign(s.player, { dodgeRemaining: .14, dodgeX: 0, dodgeY: 0 });
    else s.player.invulnerable = 20;
    step(s, emptyInput()); expect(s.player.hp).toBe(100); expect(s.player.x).toBe(380);
  });
  it('allows ordinary frost and gravity relic effects on an elite body', () => {
    const { s, e } = arena('chainhound'); s.expedition!.relics = ['R08']; s.expedition!.acquired = ['R08'];
    for (let i = 0; i < 4; i++) {
      s.bullets.push({ id: s.nextId++, x: e.x, y: e.y, vx: 0, vy: 0, damage: 1, owner: 'player', life: 10 });
      advanceProjectiles(s);
    }
    expect(e.frost?.freezeTicks).toBe(36); expect(e.hp).toBe(81);
    delete e.frost; s.gravityWell = { id: s.nextId++, eventId: 9000, x: 360, y: 180, ticks: 90 };
    pullGravity(s); expect(e.x).toBeCloseTo(320 + 50 / 60);
  });
});

describe('elite rules', () => {
  it.each([
    ['guard', 117], ['chainhound', 153], ['heartguard', 216],
  ] as const)('derives enhanced %s health from the existing body', (kind, hp) => {
    expect(ELITE_KINDS).toContain(kind); expect(eliteHealth(kind)).toBe(hp);
  });
  it('applies fractional damage and rounds only elite full cooldowns up', () => {
    expect(eliteDamage({ elite: true }, 6)).toBeCloseTo(7.2);
    expect(eliteDamage({}, 6)).toBe(6);
    expect(eliteCooldown({ elite: true }, 17)).toBe(16);
    expect(eliteCooldown({}, 17)).toBe(17);
  });
});

describe('deterministic encounter planning', () => {
  it('reconstructs the same ordered plan without changing inputs or run randomness', () => {
    const s = createRun(42), roster: Enemy['kind'][] = ['guard', 'shield', 'archer'];
    const rng = s.rng, first = buildEncounter(s.seed, 1, 4, roster);
    s.rng = 12345; expect(buildEncounter(s.seed, 1, 4, roster)).toEqual(first);
    expect(s.rng).toBe(12345); s.rng = rng;
    expect(roster).toEqual(['guard', 'shield', 'archer']);
    const plans = new Set(Array.from({ length: 24 }, (_, seed) => JSON.stringify(buildEncounter(seed, 1, 4, roster))));
    expect(plans.size).toBeGreaterThan(1);
    const rooms = new Set(Array.from({ length: 24 }, (_, room) => JSON.stringify(buildEncounter(42, 1, room, roster))));
    expect(rooms.size).toBeGreaterThan(1);
  });
  it.each([
    { region: 1 as const, min: 5, max: 10, minWaves: 1, maxWaves: 2, roster: ['guard', 'rat', 'archer'] as Enemy['kind'][] },
    { region: 2 as const, min: 7, max: 10, minWaves: 2, maxWaves: 2, roster: ['ashpriest', 'sealcaster', 'chainhound', 'readerstatue', 'shield', 'archer'] as Enemy['kind'][] },
    { region: 3 as const, min: 8, max: 12, minWaves: 2, maxWaves: 3, roster: ['watcher', 'heartguard', 'riftshaman', 'voidknight', 'shield', 'ashpriest'] as Enemy['kind'][] },
  ])('balances region $region totals and preserves the original roster before filling', ({ region, min, max, minWaves, maxWaves, roster }) => {
    const totals = new Set<number>(), waveCounts = new Set<number>();
    for (let seed = 0; seed < 80; seed++) {
      const plan = buildEncounter(seed, region, 4, roster), all = plan.waves.flat(), lengths = plan.waves.map(w => w.length);
      expect(all.length).toBeGreaterThanOrEqual(min); expect(all.length).toBeLessThanOrEqual(max);
      expect(plan.waves.length).toBeGreaterThanOrEqual(minWaves); expect(plan.waves.length).toBeLessThanOrEqual(maxWaves);
      expect(Math.max(...lengths)).toBeLessThanOrEqual(8); expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThanOrEqual(1);
      if (region === 1 && all.length > 8) expect(plan.waves).toHaveLength(2);
      expect(all.slice(0, roster.length).map(spec => spec.kind)).toEqual(roster);
      expect(all.every(spec => !spec.elite && roster.includes(spec.kind))).toBe(true);
      totals.add(all.length); waveCounts.add(plan.waves.length);
    }
    expect(totals.has(min)).toBe(true); expect(totals.has(max)).toBe(true);
    expect(waveCounts.has(minWaves)).toBe(true); expect(waveCounts.has(maxWaves)).toBe(true);
  });
  it.each([
    [1, 'guard'], [2, 'chainhound'], [3, 'heartguard'],
  ] as const)('puts one region %s elite %s behind a separate ordinary support wave', (region, kind) => {
    const roster: Enemy['kind'][] = ['rat', 'archer'];
    for (let seed = 0; seed < 40; seed++) {
      const { waves } = buildEncounter(seed, region, 12, roster, true);
      expect(waves).toHaveLength(2); expect(waves[0].length).toBeGreaterThanOrEqual(2); expect(waves[0].length).toBeLessThanOrEqual(3);
      expect(waves[0].every(spec => !spec.elite && roster.includes(spec.kind))).toBe(true);
      expect(waves[1][0]).toEqual({ kind, elite: true });
      expect(waves[1].length).toBeGreaterThanOrEqual(3); expect(waves[1].length).toBeLessThanOrEqual(4);
      expect(waves[1].slice(1).every(spec => !spec.elite && roster.includes(spec.kind))).toBe(true);
      expect(waves.flat().filter(spec => spec.elite)).toHaveLength(1);
    }
  });
  it('supports zero seeds and an empty base roster without empty waves', () => {
    for (const region of [1, 2, 3] as const) {
      const { waves } = buildEncounter(0, region, 1, []);
      expect(waves.every(wave => wave.length > 0 && wave.every(spec => !!spec.kind))).toBe(true);
    }
  });
});
