import { describe, expect, it } from 'vitest';
import { BOUNDS, BOUNDARY_WALLS } from '../src/core/model';
import { createDungeonRun, emptyInput, step } from '../src/core/simulation';
import { adjacentRooms, DIRECTIONS } from '../src/core/dungeon';
import { moveBody, visible } from '../src/core/geometry';
import { validRun } from '../src/persistence/save';

describe('expanded FPS rooms', () => {
  it('provides at least 2.5 times the old floor area without changing its center', () => {
    expect(BOUNDS.w * BOUNDS.h).toBeGreaterThanOrEqual(576 * 282 * 2.5);
    expect(BOUNDS.x + BOUNDS.w / 2).toBeCloseTo(320);
    expect(BOUNDS.y + BOUNDS.h / 2).toBeCloseTo(183);
  });
  it('allows walking beyond the former wall and stops bodies and bullets at the new wall', () => {
    const p = { x: 320, y: 60 };
    moveBody(p, 0, -75, 7, []);
    expect(p.y).toBe(-15);
    expect(visible({ x: 320, y: 60 }, p, 2, BOUNDARY_WALLS)).toBe(true);
    moveBody(p, 0, -1000, 7, []);
    expect(p.y).toBeCloseTo(BOUNDS.y + 7);
    expect(visible(p, { x: 320, y: BOUNDS.y - 10 }, 0, BOUNDARY_WALLS)).toBe(false);
  });
  it('retains existing snapshots and saves exploration in the expanded area', () => {
    const s = createDungeonRun(42);
    expect(validRun(s)).toBe(true);
    s.player.y = -15;
    expect(validRun(s)).toBe(true);
  });
  it('uses the new edges for door travel and spreads encounters into the additional floor area', () => {
    let outsideOldRoom = false;
    for (let seed = 1; seed <= 20; seed++) {
      for (const door of adjacentRooms(createDungeonRun(seed))) {
        const s = createDungeonRun(seed), d = DIRECTIONS[door.direction];
        s.player.x = 320 + d.x * (BOUNDS.w / 2 - 8);
        s.player.y = 183 + d.y * (BOUNDS.h / 2 - 8);
        step(s, { ...emptyInput(), moveX: d.x, moveY: d.y });
        expect(s.expedition!.room).toBe(door.room.id);
        expect(s.player.x).toBeCloseTo(320 - d.x * (BOUNDS.w / 2 - 40));
        expect(s.player.y).toBeCloseTo(183 - d.y * (BOUNDS.h / 2 - 33));
        outsideOldRoom ||= s.enemies.some(e => e.x < 32 || e.x > 608 || e.y < 42 || e.y > 324);
      }
    }
    expect(outsideOldRoom).toBe(true);
  });
});
