import { describe, expect, it } from 'vitest';
import { advanceProjectiles } from '../src/core/combat';
import { createDungeonRun, emptyInput, step } from '../src/core/simulation';
import type { Bullet } from '../src/core/model';

function room(overrides: Partial<Bullet> = {}) {
  const s = createDungeonRun(42); s.phase = 'combat'; s.expedition!.room = 1; s.view = { yaw: 0, pitch: 0 };
  Object.assign(s.player, { x: 320, y: 183 });
  s.enemies = [{ id: s.nextId++, kind: 'rat', x: 550, y: 280, hp: 30, maxHp: 30, angle: 0,
    mode: 'move', timer: 0, targetX: 320, targetY: 183, flash: 0, frost: { freezeTicks: 300, resistTicks: 0, hits: [] } }];
  const b: Bullet = { id: s.nextId++, x: 331, y: 183, vx: 210, vy: 0, height: 34, heightVelocity: 0,
    damage: 10, life: 60, owner: 'enemy', ...overrides };
  s.bullets = [b]; return { s, b };
}

describe('relative projectile collision', () => {
  it('misses an arrow whose gap widens from 11 to 12 during normal walking', () => {
    const { s, b } = room(); step(s, { ...emptyInput(), moveX: 1 });
    expect(s.player.x).toBe(322.5); expect(s.player.hp).toBe(100); expect(s.stats.hits).toBe(0);
    expect(s.bullets).toContain(b); expect(b.x).toBe(334.5);
  });
  it('hits when the simultaneous paths enter radius 9 only between their endpoints', () => {
    const { s } = room({ x: 310.85, y: 182.4, vx: 166.6042014611594, vy: 127.83990009183132 });
    step(s, { ...emptyInput(), moveX: 1 });
    expect(s.player.hp).toBe(90); expect(s.stats.hits).toBe(1); expect(s.bullets).toHaveLength(0);
  });
  it('keeps the previous-height second argument for a stationary player', () => {
    const { s } = room({ x: 320, vx: 0, height: 10 }); s.player.height = 25;
    expect(advanceProjectiles(s, 0)).toHaveLength(1);
  });
  it('detects walking across a stopped arrow without advancing its position', () => {
    const { s, b } = room({ x: 320, vx: 210 });
    s.timeStop = { x: 320, y: 183, ticks: 90, enemyIds: [], bulletIds: [b.id] };
    s.player.x = 340;
    // An earlier player position is an optional third argument; direct callers retain their defaults.
    expect(advanceProjectiles(s, 0, { x: 300, y: 183 })).toHaveLength(1);
    expect(b.x).toBe(320);
  });
  it('detects diagonal player movement across a stationary projectile', () => {
    const { s } = room({ x: 320, vx: 0 }); Object.assign(s.player, { x: 340, y: 203 });
    expect(advanceProjectiles(s, 0, { x: 300, y: 163 })).toHaveLength(1);
  });
  it('catches a returning shot along the moving player path', () => {
    const { s } = room({ x: 320, vx: 0, owner: 'player', phase: 'return' }); s.player.x = 340;
    expect(advanceProjectiles(s, 0, { x: 300, y: 183 })).toEqual([]);
    expect(s.bullets).toHaveLength(0);
  });
  it('uses the contact position for parry direction and preserves the remaining reflected travel', () => {
    const { s } = room({ x: 340, vx: -600 }); s.player.x = 340; s.expedition!.relics = ['R30'];
    Object.assign(s.player, { dodgeRemaining: .2, dodgeX: 1, dodgeY: 0 });
    const target = { ...s.enemies[0], kind: 'archer' as const, x: 354, y: 183, hp: 40, maxHp: 40 };
    s.enemies = [target];
    expect(advanceProjectiles(s, 0, { x: 320, y: 183 })).toEqual([]);
    expect(s.player.parryUsed).toBe(true); expect(target.hp).toBe(25); expect(s.bullets).toHaveLength(0);
  });
  it('keeps a parried time-stopped shot at its frozen position until the next tick', () => {
    const { s, b } = room(); s.player.x = 340; s.expedition!.relics = ['R30'];
    Object.assign(s.player, { dodgeRemaining: .2, dodgeX: 1, dodgeY: 0 });
    s.timeStop = { x: 320, y: 183, ticks: 90, enemyIds: [], bulletIds: [b.id] };
    expect(advanceProjectiles(s, 0, { x: 320, y: 183 })).toEqual([]);
    expect(b.owner).toBe('player'); expect(b.x).toBe(331); expect(b.life).toBe(60);
  });
  it('aligns player time after a portal with the unspent part of the tick', () => {
    const { s, b } = room({ x: 90, vx: 1200 }); s.player.x = 360; s.expedition!.relics = ['R40'];
    s.portals = { id: s.nextId++, first: { x: 100, y: 183 }, second: { x: 330, y: 183 }, ticks: 360 };
    expect(advanceProjectiles(s, 0, { x: 320, y: 183 })).toHaveLength(1);
    expect(b.portalTrips).toBe(1); expect(b.x).toBeCloseTo(322); expect(s.bullets).toHaveLength(0);
  });
  it('interpolates player height at the delayed impact after a portal', () => {
    const { s, b } = room({ x: 90, vx: 1200 }); s.player.x = 360; s.player.height = 0; s.expedition!.relics = ['R40'];
    s.portals = { id: s.nextId++, first: { x: 100, y: 183 }, second: { x: 330, y: 183 }, ticks: 360 };
    expect(advanceProjectiles(s, 60, { x: 320, y: 183 })).toHaveLength(1);
    expect(b.portalTrips).toBe(1); expect(b.x).toBeCloseTo(328); expect(s.bullets).toHaveLength(0);
  });
  it('catches a returning shot after a wall bounce using the elapsed player movement', () => {
    const { s, b } = room({ x: 300, vx: 6000, owner: 'player', phase: 'return', bouncesLeft: 1 });
    s.player.x = 360; s.expedition!.relics = ['R01', 'R04'];
    s.stoneWall = { id: s.nextId++, x: 330, y: 170, w: 8, h: 48, hp: 40, ticks: 200 };
    expect(advanceProjectiles(s, 0, { x: 280, y: 183 })).toEqual([]);
    expect(b.bouncesLeft).toBe(0); expect(b.x).toBeCloseTo(317.6662222222, 6); expect(s.bullets).toHaveLength(0);
  });
  it('lets a moving ward intercept a shot before the player body', () => {
    const { s } = room({ x: 350, vx: 0 }); s.player.x = 360; s.expedition!.relics = ['R19'];
    expect(advanceProjectiles(s, 0, { x: 320, y: 183 })).toEqual([]);
    expect(s.player.wardCooldown).toBe(180); expect(s.bullets).toHaveLength(0);
  });
  it('matches a moving ward height with its horizontal intersection time', () => {
    const { s } = room({ x: 370, vx: 0 }); s.player.x = 360; s.player.height = 0; s.expedition!.relics = ['R19'];
    expect(advanceProjectiles(s, 20, { x: 320, y: 183 })).toEqual([]);
    expect(s.player.wardCooldown).toBe(180); expect(s.bullets).toHaveLength(0);
  });
  it('absorbs at the player contact position even when the player ends outside the radius', () => {
    const { s } = room({ x: 350, vx: 0 }); s.player.x = 420; s.expedition!.relics = ['R42'];
    s.absorption = { ticks: 90, absorbed: 0 };
    expect(advanceProjectiles(s, 0, { x: 300, y: 183 })).toEqual([]);
    expect(s.absorbEnergy).toBe(1); expect(s.bullets).toHaveLength(0);
  });
  it('absorbs before ward and body contact on the same incoming segment', () => {
    const { s } = room({ x: 400, vx: -6000 }); s.expedition!.relics = ['R19', 'R42'];
    s.absorption = { ticks: 90, absorbed: 0 };
    expect(advanceProjectiles(s)).toEqual([]); expect(s.absorbEnergy).toBe(1);
    expect(s.player.wardCooldown).toBeUndefined(); expect(s.bullets).toHaveLength(0);
  });
  it('keeps an earlier wall collision ahead of absorption', () => {
    const { s } = room({ x: 260, vx: 6000 }); s.expedition!.relics = ['R42'];
    s.absorption = { ticks: 90, absorbed: 0 };
    s.stoneWall = { id: s.nextId++, x: 270, y: 170, w: 8, h: 48, hp: 40, ticks: 200 };
    expect(advanceProjectiles(s)).toEqual([]); expect(s.absorbEnergy ?? 0).toBe(0);
    expect(s.stoneWall.hp).toBe(30); expect(s.bullets).toHaveLength(0);
  });
  it('keeps an earlier ally impact ahead of absorption and player contact', () => {
    const { s } = room({ x: 400, vx: -6000 }); s.expedition!.relics = ['R42'];
    s.absorption = { ticks: 90, absorbed: 0 };
    const ally = { ...s.enemies[0], kind: 'archer' as const, x: 385, y: 183, hp: 40, maxHp: 40,
      charm: { ticks: 120 } };
    s.enemies = [ally];
    expect(advanceProjectiles(s)).toEqual([]); expect(s.absorbEnergy ?? 0).toBe(0);
    expect(ally.hp).toBe(30); expect(s.bullets).toHaveLength(0);
  });
});
