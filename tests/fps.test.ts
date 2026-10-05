import { describe, expect, it } from 'vitest';
import { createRun, emptyInput, step } from '../src/core/simulation';
import { advanceProjectiles } from '../src/core/combat';
import { movementForView, clampPitch } from '../src/game/fps-controls';
import { cylinderHit } from '../src/core/fps-geometry';
import { validRun } from '../src/persistence/save';

function arena() {
  const s = createRun(42); s.phase = 'combat'; s.waveDelay = 99999;
  s.player.x = 100; s.player.y = 180;
  s.enemies = [{ id: s.nextId++, kind: 'rat' as const, x: 140, y: 180, hp: 30, maxHp: 30,
    angle: Math.PI, mode: 'recover' as const, timer: 42, targetX: 100, targetY: 180, flash: 0 }];
  return s;
}
describe('FPS aiming and movement', () => {
  it('moves relative to the view, with normal diagonal speed', () => {
    expect(movementForView(-Math.PI / 2, 1, 0).x).toBeCloseTo(0);
    expect(movementForView(-Math.PI / 2, 1, 0).y).toBeCloseTo(-1);
    expect(movementForView(0, 0, 1)).toEqual({ x: 0, y: 1 });
    const m = movementForView(0.4, 1, 1); expect(Math.hypot(m.x, m.y)).toBeCloseTo(1);
    expect(clampPitch(9)).toBeLessThan(Math.PI / 2);
  });
  it('fires pitched projectiles with height and vertical velocity', () => {
    const s = arena(); step(s, { ...emptyInput(), fire: true, aimPitch: 0.3 });
    expect(s.bullets[0].height).toBeGreaterThan(34); expect(s.bullets[0].heightVelocity).toBeGreaterThan(0);
  });
  it('a level shot passes above a low rat', () => {
    const s = arena(); s.bullets = [{ id: 99, x: 120, y: 180, vx: 1800, vy: 0, height: 34, heightVelocity: 0,
      life: 60, owner: 'player', damage: 7 }];
    advanceProjectiles(s); expect(s.enemies[0].hp).toBe(30);
  });
  it('aiming down hits a rat and aiming higher can hit a standing enemy', () => {
    const s = arena(); s.bullets = [{ id: 99, x: 120, y: 180, vx: 1800, vy: 0, height: 24, heightVelocity: -1800,
      life: 60, owner: 'player', damage: 7 }];
    advanceProjectiles(s); expect(s.enemies[0].hp).toBe(23);
    s.enemies[0].kind = 'archer'; s.bullets = [{ id: 100, x: 120, y: 180, vx: 1800, vy: 0, height: 34, heightVelocity: 0,
      life: 60, owner: 'player', damage: 7 }];
    advanceProjectiles(s); expect(s.enemies[0].hp).toBe(16);
  });
  it('floor and ceiling stop a projectile', () => {
    const s = arena(); s.enemies = []; s.bullets = [
      { id: 99, x: 100, y: 180, vx: 20, vy: 0, height: 1, heightVelocity: -300, life: 60, owner: 'player', damage: 7 },
      { id: 100, x: 100, y: 180, vx: 20, vy: 0, height: 139, heightVelocity: 300, life: 60, owner: 'player', damage: 7 },
    ]; advanceProjectiles(s); expect(s.bullets).toHaveLength(0);
  });
  it('snapshot restore preserves pitched projectile trajectories', () => {
    const s = arena(); step(s, { ...emptyInput(), fire: true, aimPitch: 0.2 });
    const restored = structuredClone(s);
    for (let i = 0; i < 15; i++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s);
  });
  it('hits a body when the descending trajectory enters its height after horizontal entry', () => {
    const t = cylinderHit(0, 0, 100, 0, 50, -50, 50, 0, 12, 18);
    expect(t).toBeCloseTo(0.38);
    expect(cylinderHit(0, 0, 100, 0, 90, 90, 50, 0, 12, 18)).toBeNull();
  });
  it('floor ricochet preserves the relic bounce limit and vertical trajectory', () => {
    const s = arena(); s.enemies = []; s.expedition!.relics = ['R01'];
    s.bullets = [{ id: 99, x: 100, y: 180, vx: 60, vy: 0, height: 1, heightVelocity: -300,
      bouncesLeft: 2, life: 60, owner: 'player', damage: 7 }];
    advanceProjectiles(s); expect(s.bullets[0].bouncesLeft).toBe(1);
    expect(s.bullets[0].heightVelocity).toBe(300); expect(s.bullets[0].height).toBeGreaterThan(0);
  });
  it('split relic projectiles inherit their impact height', () => {
    const s = arena(); s.expedition!.relics = ['R03'];
    s.bullets = [{ id: 99, x: 120, y: 180, vx: 1800, vy: 0, height: 10, heightVelocity: 0,
      life: 60, owner: 'player', damage: 7 }];
    advanceProjectiles(s); expect(s.bullets).toHaveLength(3);
    expect(s.bullets.every(b => b.height === 10 && b.heightVelocity === 0)).toBe(true);
  });
  it('return relic steers toward the hunter height as well as position', () => {
    const s = arena(); s.enemies = []; s.expedition!.relics = ['R04'];
    s.bullets = [{ id: 99, x: 180, y: 180, vx: 320, vy: 0, height: 60, heightVelocity: 0,
      phase: 'return', life: 60, owner: 'player', damage: 7 }];
    advanceProjectiles(s); expect(s.bullets[0].vx).toBeLessThan(0); expect(s.bullets[0].heightVelocity).toBeLessThan(0);
  });
  it('enemy arrows have an explicit physical height in an FPS run', () => {
    const s = arena(); s.view = { yaw: 0, pitch: 0 };
    s.bullets = [{ id: 99, x: 300, y: 180, vx: 210, vy: 0, life: 60, owner: 'enemy', damage: 10 }];
    advanceProjectiles(s); expect(s.bullets[0].height).toBe(34); expect(s.bullets[0].heightVelocity).toBe(0);
  });
  it('angled split projectiles retain their full 3D speed', () => {
    const s = arena(); s.expedition!.relics = ['R03'];
    s.bullets = [{ id: 99, x: 120, y: 180, vx: 1800, vy: 0, height: 10, heightVelocity: -100,
      life: 60, owner: 'player', damage: 7 }];
    advanceProjectiles(s); expect(s.bullets).toHaveLength(3);
    for (const b of s.bullets) expect(Math.hypot(b.vx, b.vy, b.heightVelocity!)).toBeCloseTo(320);
  });
  it('rejects invalid view and projectile heights while allowing normal snapshots', () => {
    const s = arena(); s.view = { yaw: 0, pitch: -0.2 };
    s.bullets = [{ id: 99, x: 100, y: 180, vx: 320, vy: 0, height: 34, heightVelocity: -30,
      life: 60, owner: 'player', damage: 7 }]; expect(validRun(s)).toBe(true);
    for (const change of [
      (v: typeof s) => { v.view!.pitch = 2; },
      (v: typeof s) => { v.view!.yaw = NaN; },
      (v: typeof s) => { v.bullets[0].height = -1; },
      (v: typeof s) => { v.bullets[0].heightVelocity = Infinity; },
    ]) { const bad = structuredClone(s); change(bad); expect(validRun(bad)).toBe(false); }
  });
});
