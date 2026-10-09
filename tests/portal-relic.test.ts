import { describe, expect, it } from 'vitest';
import { BOUNDS, type Bullet, type Enemy, type RunState } from '../src/core/model';
import { agePortals, cancelFirstPortal, clearPortals, placePortal, portalCrossing, portalExitSafe, portalFailure } from '../src/core/portal';

function run(): RunState {
  return {
    version: 1, seed: 42, rng: 42, tick: 100, nextId: 20,
    phase: 'explore', readyTicks: 0, wave: 1, waveDelay: 0,
    player: { x: 80, y: 183, hp: 100, aim: 0, lastX: 0, lastY: 1,
      dodgeRemaining: 0, dodgeX: 0, dodgeY: 1, dodgeCooldown: 0, invulnerable: 0, fireCooldown: 0, equippedAux: 'R40' },
    expedition: { route: 'maze', region: 1, room: 0, relics: ['R40'], acquired: ['R40'], reward: null,
      dungeon: { layoutVersion: 1, rooms: [
        { id: 0, x: 0, y: 0, kind: 'start', template: 0, visited: true, cleared: true, reward: null },
        { id: 1, x: 1, y: 0, kind: 'combat', template: 0, visited: false, cleared: false, reward: null },
      ] } },
    enemies: [], bullets: [], cues: [], gold: 0, lastDamage: '',
    stats: { shots: 0, hits: 0, kills: 0, damage: 0, dodges: 0 },
  };
}
function enemy(x = 160, y = 183): Enemy {
  return { id: 9, kind: 'riftshaman', x, y, hp: 30, maxHp: 30, angle: 0,
    mode: 'move', timer: 20, targetX: 80, targetY: 183, flash: 0 };
}
function pair() {
  const s = run(); s.portals = { first: { x: 160, y: 183 }, second: { x: 300, y: 183 }, id: 19, ticks: 360 };
  return s;
}
function bullet(): Bullet {
  return { id: 18, x: 100, y: 183, vx: 6000, vy: 0, height: 30, heightVelocity: 0,
    life: 20, owner: 'player', damage: 7 };
}

describe('void portal placement', () => {
  it('clamps the first endpoint to 120u without consuming cooldown', () => {
    const s = run(); expect(placePortal(s, { x: 1000, y: 183 })).toBe(true);
    expect(s.portals).toEqual({ first: { x: 200, y: 183 }, ticks: 300, id: 20 });
    expect(s.nextId).toBe(21); expect(s.player.auxCooldowns).toBeUndefined();
  });
  it('completes the same pair with a fresh six-second lifetime and twelve-second cooldown', () => {
    const s = run(); placePortal(s, { x: 160, y: 183 }); agePortals(s);
    expect(placePortal(s, { x: 80, y: 263 })).toBe(true);
    expect(s.portals).toEqual({ first: { x: 160, y: 183 }, second: { x: 80, y: 263 }, ticks: 360, id: 20 });
    expect(s.nextId).toBe(21); expect(s.player.auxCooldowns).toEqual({ R40: 720 });
  });
  it('rejects a third endpoint atomically', () => {
    const s = pair(), before = structuredClone(s);
    expect(placePortal(s, { x: 80, y: 263 })).toBe(false); expect(s).toEqual(before);
  });
  it.each(['unowned', 'ready', 'dead', 'cooldown', 'invalid'] as const)('rejects %s placement without allocating an ID', reason => {
    const s = run();
    if (reason === 'unowned') s.expedition!.relics = [];
    if (reason === 'ready' || reason === 'dead') s.phase = reason;
    if (reason === 'cooldown') s.player.auxCooldowns = { R40: 1 };
    const before = structuredClone(s), aim = { x: reason === 'invalid' ? NaN : 160, y: 183 };
    expect(portalFailure(s, aim)).not.toBeNull(); expect(placePortal(s, aim)).toBe(false); expect(s).toEqual(before);
  });
  it('rejects overlapping endpoints and leaves the first lifetime intact', () => {
    const s = run(); placePortal(s, { x: 160, y: 183 }); const before = structuredClone(s);
    expect(placePortal(s, { x: 168, y: 183 })).toBe(false); expect(s).toEqual(before);
  });
  it.each(['player', 'enemy', 'spawn', 'blink', 'summon', 'bomb', 'decoy'] as const)('keeps %s bodies and reservations clear', kind => {
    const s = run();
    if (kind === 'player') s.player.x = 160;
    if (kind === 'enemy' || kind === 'spawn') s.enemies = [{ ...enemy(), ...(kind === 'spawn' ? { spawnTicks: 30 } : {}) }];
    if (kind === 'blink') s.enemies = [{ ...enemy(300), blinkTarget: { x: 160, y: 183 } }];
    if (kind === 'summon') s.enemies = [{ ...enemy(300), summonPoints: [{ x: 160, y: 183 }] }];
    if (kind === 'bomb') s.bombs = [{ id: 15, x: 160, y: 183, ticks: 10 }];
    if (kind === 'decoy') s.decoy = { kind: 'decoy', id: 15, x: 160, y: 183, hp: 30, ticks: 10 };
    const before = structuredClone(s); expect(placePortal(s, { x: 160, y: 183 })).toBe(false); expect(s).toEqual(before);
  });
  it('does not reserve the body of a defeated enemy', () => {
    const s = run(); s.enemies = [{ ...enemy(), hp: 0 }]; expect(placePortal(s, { x: 160, y: 183 })).toBe(true);
  });
  it('rejects static walls and placement through a wall', () => {
    const inside = run(); inside.player.x = 180; inside.player.y = 100;
    expect(placePortal(inside, { x: 220, y: 125 })).toBe(false);
    const behind = run(); behind.player.x = 180; behind.player.y = 125;
    expect(placePortal(behind, { x: 270, y: 125 })).toBe(false);
  });
  it('checks the ground footprint of a temporary wall while the player is above it', () => {
    const s = run(); s.player.height = 70;
    s.stoneWall = { id: 15, x: 156, y: 159, w: 8, h: 48, hp: 40, ticks: 200 };
    expect(placePortal(s, { x: 160, y: 183 })).toBe(false);
  });
  it('rejects a pit including the eight-unit footprint around its edge', () => {
    const s = run(); s.expedition!.dungeon!.rooms[0].pits = [{ x: 166, y: 170, w: 80, h: 30 }];
    const before = structuredClone(s); expect(placePortal(s, { x: 160, y: 183 })).toBe(false); expect(s).toEqual(before);
  });
  it('rejects hazard terrain even during its resting stage', () => {
    const s = run(); s.expedition!.region = 2; s.expedition!.dungeon!.rooms[0].kind = 'combat';
    s.player.x = 80; s.player.y = 180; s.phase = 'combat'; s.trapTicks = 150;
    expect(placePortal(s, { x: 80, y: 120 })).toBe(false);
  });
  it('rejects furniture in a noncombat room', () => {
    const s = run(); s.expedition!.dungeon!.rooms[0].kind = 'treasure'; s.player.x = 270;
    expect(placePortal(s, { x: 320, y: 183 })).toBe(false);
  });
  it('rejects a boundary footprint and an adjacent exit approach', () => {
    const s = run(); s.player.x = BOUNDS.x + BOUNDS.w - 100;
    expect(placePortal(s, { x: BOUNDS.x + BOUNDS.w - 3, y: 240 })).toBe(false);
    expect(portalFailure(s, { x: BOUNDS.x + BOUNDS.w - 35, y: 183 })).toContain('출구');
  });
});

describe('void portal lifetime', () => {
  it('expires an unfinished endpoint after exactly 300 simulation ticks without charging cooldown', () => {
    const s = run(); placePortal(s, { x: 160, y: 183 });
    for (let i = 0; i < 299; i++) agePortals(s);
    expect(s.portals?.ticks).toBe(1); agePortals(s);
    expect(s.portals).toBeUndefined(); expect(s.player.auxCooldowns).toBeUndefined();
    expect(placePortal(s, { x: 160, y: 183 })).toBe(true); expect(s.portals?.id).toBe(21);
  });
  it('cancels only an unfinished endpoint and preserves a completed pair', () => {
    const s = run(); placePortal(s, { x: 160, y: 183 }); expect(cancelFirstPortal(s)).toBe(true);
    expect(s.portals).toBeUndefined(); expect(cancelFirstPortal(s)).toBe(false); expect(s.player.auxCooldowns).toBeUndefined();
    const complete = pair(), before = structuredClone(complete);
    expect(cancelFirstPortal(complete)).toBe(false); expect(complete).toEqual(before);
  });
  it('ages a completed pair independently of the equipped auxiliary without resetting recharge', () => {
    const s = pair(); s.player.equippedAux = 'R13'; s.player.auxCooldowns = { R40: 720 };
    for (let i = 0; i < 359; i++) agePortals(s);
    expect(s.portals?.ticks).toBe(1); agePortals(s); expect(s.portals).toBeUndefined(); expect(s.player.auxCooldowns.R40).toBe(720);
  });
  it.each(['loss', 'death'] as const)('removes the active pair on %s without resetting cooldown', reason => {
    const s = pair(); s.player.auxCooldowns = { R40: 500 };
    if (reason === 'loss') s.expedition!.relics = []; else s.phase = 'dead';
    agePortals(s); expect(s.portals).toBeUndefined(); expect(s.player.auxCooldowns.R40).toBe(500);
  });
  it('allows explicit room cleanup of first or completed endpoints', () => {
    for (const s of [run(), pair()]) {
      if (!s.portals) placePortal(s, { x: 160, y: 183 });
      s.player.auxCooldowns = { R40: 300 }; clearPortals(s);
      expect(s.portals).toBeUndefined(); expect(s.player.auxCooldowns.R40).toBe(300);
    }
  });
});

describe('void portal swept projectile query', () => {
  it('finds the earliest endpoint crossed by a fast bullet and preserves its relative exit position', () => {
    const s = pair(), b = bullet(), before = structuredClone({ s, b });
    const hit = portalCrossing(s, b, { x: 100, y: 183 }, { x: 340, y: 183 });
    expect(hit?.t).toBeCloseTo(13 / 60, 10); expect(hit).toMatchObject({ point: { x: 152, y: 183 }, exit: { x: 292, y: 183 }, portalId: 19 });
    expect({ s, b }).toEqual(before);
  });
  it('chooses the second endpoint first when traveling in the reverse direction', () => {
    const hit = portalCrossing(pair(), bullet(), { x: 340, y: 183 }, { x: 100, y: 183 });
    expect(hit?.t).toBeCloseTo(2 / 15, 10); expect(hit).toMatchObject({ point: { x: 308, y: 183 }, exit: { x: 168, y: 183 } });
  });
  it('uses a circular footprint and keeps an offcenter offset', () => {
    const s = pair(), b = bullet();
    expect(portalCrossing(s, b, { x: 100, y: 192 }, { x: 200, y: 192 })).toBeNull();
    const hit = portalCrossing(s, b, { x: 100, y: 189 }, { x: 200, y: 189 });
    expect(hit?.point.x).toBeCloseTo(154.7084973779, 8); expect(hit?.exit.x).toBeCloseTo(294.7084973779, 8); expect(hit?.exit.y).toBe(189);
  });
  it.each(['player', 'enemy'] as const)('accepts an eligible %s bullet', owner => {
    const b = bullet(); b.owner = owner;
    expect(portalCrossing(pair(), b, { x: 100, y: 183 }, { x: 200, y: 183 })).not.toBeNull();
  });
  it('requires a completed live pair and a moving live bullet', () => {
    const s = pair(), b = bullet(); delete s.portals!.second;
    expect(portalCrossing(s, b, b, { x: 200, y: 183 })).toBeNull();
    const expired = pair(); expired.portals!.ticks = 0;
    expect(portalCrossing(expired, b, b, { x: 200, y: 183 })).toBeNull();
    expect(portalCrossing(pair(), { ...b, life: 0 }, b, { x: 200, y: 183 })).toBeNull();
    expect(portalCrossing(pair(), b, { x: 160, y: 183 }, { x: 160, y: 183 })).toBeNull();
  });
  it('permits the second trip but rejects the third', () => {
    const s = pair(), b = bullet(); b.portalTrips = 1;
    expect(portalCrossing(s, b, b, { x: 200, y: 183 })).not.toBeNull(); b.portalTrips = 2;
    expect(portalCrossing(s, b, b, { x: 200, y: 183 })).toBeNull();
  });
  it('locks the same pair for twelve ticks and unlocks at the exact boundary', () => {
    const s = pair(), b = bullet(); b.portalTrips = 1; b.portalPairId = 19; b.portalLockUntil = 112;
    s.tick = 111; expect(portalCrossing(s, b, b, { x: 200, y: 183 })).toBeNull();
    s.tick = 112; expect(portalCrossing(s, b, b, { x: 200, y: 183 })).not.toBeNull();
    s.tick = 100; s.portals!.id = 20; expect(portalCrossing(s, b, b, { x: 200, y: 183 })).not.toBeNull();
  });
  it.each([0, 60])('accepts the %su height boundary', height => {
    const b = bullet(); b.height = height; expect(portalCrossing(pair(), b, b, { x: 200, y: 183 })).not.toBeNull();
  });
  it.each([-1, 61])('rejects a bullet outside the height span at %su', height => {
    const b = bullet(); b.height = height; expect(portalCrossing(pair(), b, b, { x: 200, y: 183 })).toBeNull();
  });
  it('interpolates height at the crossing instead of using only starting height', () => {
    const s = pair(), b = bullet();
    expect(portalCrossing(s, b, { x: 100, y: 183, height: 50 }, { x: 200, y: 183, height: 80 })).toBeNull();
    const hit = portalCrossing(s, b, { x: 100, y: 183, height: 80 }, { x: 200, y: 183, height: 40 });
    expect(hit?.t).toBeCloseTo(.52, 10); expect(hit?.point).toEqual({ x: 152, y: 183 });
  });
  it('finds a descending bullet entering through the top while already over the circular footprint', () => {
    const hit = portalCrossing(pair(), bullet(), { x: 154, y: 183, height: 80 }, { x: 166, y: 183, height: 40 });
    expect(hit?.t).toBe(.5); expect(hit?.point).toEqual({ x: 160, y: 183 }); expect(hit?.exit).toEqual({ x: 300, y: 183 });
  });
});

describe('void portal exit safety', () => {
  it('allows a clear exit occupied by a body so the caller can resolve its actual bullet hit', () => {
    const s = pair(), point = { x: 300, y: 183 };
    s.player.x = 300; s.enemies = [enemy(300)];
    s.decoy = { kind: 'decoy', id: 15, ...point, hp: 30, ticks: 10 };
    s.bombs = [{ id: 16, ...point, ticks: 10 }];
    const before = structuredClone(s); expect(portalExitSafe(s, point)).toBe(true); expect(s).toEqual(before);
  });
  it('rejects a temporary wall newly placed over an endpoint regardless of player height', () => {
    const s = pair(); s.player.height = 70;
    expect(portalExitSafe(s, { x: 160, y: 183 })).toBe(true);
    s.stoneWall = { id: 15, x: 156, y: 159, w: 8, h: 48, hp: 40, ticks: 200 };
    expect(portalExitSafe(s, { x: 160, y: 183 })).toBe(false);
  });
  it('keeps the actual two-unit bullet footprint outside terrain', () => {
    const s = pair();
    expect(portalExitSafe(s, { x: 205, y: 125 })).toBe(true);
    expect(portalExitSafe(s, { x: 207, y: 125 })).toBe(false);
    expect(portalExitSafe(s, { x: 220, y: 125 })).toBe(false);
    expect(portalExitSafe(s, { x: BOUNDS.x + 1, y: 183 })).toBe(false);
  });
  it('rejects current pit, hazard and furniture occupancy', () => {
    const pit = pair(); pit.expedition!.dungeon!.rooms[0].pits = [{ x: 300, y: 170, w: 80, h: 30 }];
    expect(portalExitSafe(pit, { x: 300, y: 183 })).toBe(false);
    const hazard = pair(); hazard.expedition!.region = 2; hazard.expedition!.dungeon!.rooms[0].kind = 'combat';
    expect(portalExitSafe(hazard, { x: 80, y: 120 })).toBe(false);
    const furniture = pair(); furniture.expedition!.dungeon!.rooms[0].kind = 'treasure';
    expect(portalExitSafe(furniture, { x: 320, y: 183 })).toBe(false);
  });
  it('rejects malformed exit coordinates', () => {
    expect(portalExitSafe(pair(), { x: NaN, y: 183 })).toBe(false);
    expect(portalExitSafe(pair(), { x: 160, y: Infinity })).toBe(false);
  });
});
