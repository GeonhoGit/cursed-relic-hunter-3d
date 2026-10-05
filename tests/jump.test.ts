import { describe, expect, it } from 'vitest';
import { createDungeonRun, emptyInput, step, travel } from '../src/core/simulation';
import { adjacentRooms } from '../src/core/dungeon';
import { advanceProjectiles } from '../src/core/combat';
import { EYE_HEIGHT } from '../src/core/fps-geometry';
import { validRun } from '../src/persistence/save';

function run() { const s = createDungeonRun(42); s.view = { yaw: 0, pitch: 0 }; return s; }
describe('FPS jump', () => {
  it('rises, refuses a second jump in the air, and lands before another jump', () => {
    const s = run(); step(s, { ...emptyInput(), jump: true });
    expect(s.player.height).toBeGreaterThan(0);
    const normal = structuredClone(s);
    step(s, { ...emptyInput(), jump: true }); step(normal, emptyInput());
    expect(s.player).toEqual(normal.player);
    let apex = 0;
    for (let i = 0; i < 60; i++) { step(s, emptyInput()); apex = Math.max(apex, s.player.height ?? 0); }
    expect(apex).toBeGreaterThan(24); expect(apex).toBeLessThan(28);
    expect(s.player.height).toBe(0); expect(s.player.jumpVelocity).toBe(0);
    step(s, { ...emptyInput(), jump: true }); expect(s.player.height).toBeGreaterThan(0);
  });
  it('shoots from the elevated eye height and retains horizontal obstacle collision', () => {
    const s = run(); for (let i = 0; i < 12; i++) step(s, { ...emptyInput(), jump: i === 0 });
    step(s, { ...emptyInput(), fire: true, aimX: 500, aimY: s.player.y, aimPitch: 0 });
    expect(s.bullets[0].height).toBeCloseTo(EYE_HEIGHT + s.player.height!);
    s.player.x = 220; s.player.y = 180;
    for (let i = 0; i < 25; i++) step(s, { ...emptyInput(), moveY: -1, jump: i === 0 });
    expect(s.player.y).toBeGreaterThanOrEqual(155);
  });
  it('restores an airborne snapshot deterministically and rejects corrupt jump state', () => {
    const s = run(); for (let i = 0; i < 10; i++) step(s, { ...emptyInput(), jump: i === 0 });
    expect(validRun(s)).toBe(true); const restored = structuredClone(s);
    for (let i = 0; i < 35; i++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s); expect(s.player.height).toBe(0);
    for (const invalid of [{ height: -1, jumpVelocity: 0 }, { height: Infinity, jumpVelocity: 0 },
      { height: 20, jumpVelocity: NaN }, { height: 20, jumpVelocity: 999 }, { height: 0, jumpVelocity: 20 },
      { height: 20, jumpVelocity: undefined }]) {
      const bad = structuredClone(s); Object.assign(bad.player, invalid); expect(validRun(bad)).toBe(false);
    }
  });
  it('lands at the next doorway and leaves old ground snapshots valid', () => {
    const s = run(); expect(validRun(s)).toBe(true);
    step(s, { ...emptyInput(), jump: true }); expect(s.player.height).toBeGreaterThan(0);
    travel(s, adjacentRooms(s)[0].direction);
    expect(s.player.height ?? 0).toBe(0); expect(s.player.jumpVelocity ?? 0).toBe(0);
  });
  it('uses the raised body for incoming bullets and the moving eye for returning bullets', () => {
    const s = run(); s.player.height = 25; s.player.jumpVelocity = 0;
    s.bullets = [{ id: s.nextId++, x: s.player.x, y: s.player.y, vx: 0, vy: 0,
      height: 10, heightVelocity: 0, owner: 'enemy', damage: 10, life: 60 }];
    expect(advanceProjectiles(s)).toHaveLength(0);
    s.bullets[0].height = 35; expect(advanceProjectiles(s)).toHaveLength(1);
    s.expedition!.relics = ['R04'];
    s.bullets = [{ id: s.nextId++, x: s.player.x + 100, y: s.player.y, vx: -320, vy: 0,
      height: EYE_HEIGHT, heightVelocity: 0, owner: 'player', damage: 7, life: 60, phase: 'return' }];
    advanceProjectiles(s); expect(s.bullets[0].heightVelocity).toBeGreaterThan(0);
  });
  it('clears a rat at jump height, but larger enemies still cause contact damage', () => {
    for (const kind of ['rat', 'archer'] as const) {
      const s = run(); s.expedition!.room = 1; s.phase = 'combat'; s.player.height = 25; s.player.jumpVelocity = 0;
      s.enemies = [{ id: s.nextId++, kind, x: s.player.x, y: s.player.y,
        hp: 30, maxHp: 30, angle: 0, mode: 'recover', timer: 60, targetX: s.player.x, targetY: s.player.y,
        flash: 0, frost: { freezeTicks: 30, resistTicks: 0, hits: [] } }];
      step(s, emptyInput()); expect(s.player.hp).toBe(kind === 'rat' ? 100 : 94);
    }
  });
  it('a pursuing rat misses an airborne player and causes contact damage after landing', () => {
    const s = run(); s.expedition!.room = 1; s.phase = 'combat';
    s.player.height = 25; s.player.jumpVelocity = 0;
    const e = { id: s.nextId++, kind: 'rat' as const, x: s.player.x + 10, y: s.player.y,
      hp: 30, maxHp: 30, angle: 0, mode: 'windup' as const, timer: 1, targetX: s.player.x, targetY: s.player.y, flash: 0 };
    s.enemies = [e]; step(s, emptyInput()); expect(s.player.hp).toBe(100);
    s.player.height = 0; s.player.jumpVelocity = 0; Object.assign(e, { mode: 'windup', timer: 1 });
    step(s, emptyInput()); expect(s.player.hp).toBe(94); expect(s.lastDamage).toContain('접촉');
  });
});
