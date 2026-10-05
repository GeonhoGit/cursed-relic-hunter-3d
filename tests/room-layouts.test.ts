import { describe, expect, it } from 'vitest';
import { ROOM_LAYOUTS, roomLayout } from '../src/core/room-layout';
import { createDungeonRun, emptyInput, step } from '../src/core/simulation';
import { adjacentRooms, currentRoom } from '../src/core/dungeon';
import { distance, moveBody, nextWaypoint, visible } from '../src/core/geometry';
import { advanceProjectiles } from '../src/core/combat';
import { advanceBombs, bombTarget } from '../src/core/bombs';
import { advanceSpecialEnemy } from '../src/core/enemy-special';
import { PILLARS } from '../src/core/model';

function arena(template: number) {
  const s = createDungeonRun(42); s.expedition!.room = 1;
  const room = currentRoom(s)!; room.template = template; room.visited = true;
  delete room.structure; // This suite exercises the original three terrain fixtures.
  s.phase = 'combat'; s.enemies = []; s.player.x = 320; s.player.y = 183;
  return s;
}

describe('varied room layouts', () => {
  it('preserves three repeatable terrain palettes in each new expedition', () => {
    expect(ROOM_LAYOUTS).toHaveLength(3);
    expect(new Set(ROOM_LAYOUTS.map(r => JSON.stringify(r.obstacles))).size).toBe(3);
    for (let seed = 0; seed < 30; seed++) {
      const s = createDungeonRun(seed), found = new Set<number>();
      expect(s).toEqual(createDungeonRun(seed));
      for (const room of s.expedition!.dungeon!.rooms.filter(r => r.kind === 'combat')) {
        s.expedition!.room = room.id; found.add(roomLayout(s).id);
      }
      expect(found.size).toBe(3);
    }
  });

  it('generates at least three genuinely different connection graphs', () => {
    const graphs = [0, 1, 2].map(seed => {
      const s = createDungeonRun(seed);
      return s.expedition!.dungeon!.rooms.map(r => adjacentRooms(s, r.id).map(d => d.room.id).sort().join(',')).join('/');
    });
    expect(new Set(graphs).size).toBe(3);
  });

  it.each([0, 1, 2])('keeps all four entrances and the center connected in layout %s', template => {
    const layout = roomLayout(arena(template));
    const entries = [{ x: 72, y: 183 }, { x: 568, y: 183 }, { x: 320, y: 75 }, { x: 320, y: 291 }];
    for (const start of entries) for (const target of [...entries, { x: 320, y: 183 }]) {
      const body = { ...start };
      for (let i = 0; i < 500 && distance(body, target) > 2; i++) {
        const next = nextWaypoint(body, target, 10, layout.obstacles), gap = distance(body, next);
        if (gap === 0) break;
        const stride = Math.min(3, gap);
        moveBody(body, (next.x - body.x) / gap * stride, (next.y - body.y) / gap * stride, 10, layout.obstacles);
        expect(visible(body, body, 9.999, layout.walls)).toBe(true);
      }
      expect(distance(body, target)).toBeLessThanOrEqual(2);
    }
  });

  it.each([1, 2])('uses layout %s walls for walking, dodge, projectiles and bomb placement', template => {
    const s = arena(template), layout = roomLayout(s), wall = layout.obstacles[0];
    const x = wall.x + wall.w / 2, y = wall.y - 20;
    Object.assign(s.player, { x, y }); s.phase = 'explore';
    for (let tick = 0; tick < 15; tick++) step(s, { ...emptyInput(), moveY: 1, dodge: tick === 0 });
    expect(s.player.y).toBe(wall.y - 7);
    s.bullets = [{ id: s.nextId++, x, y: wall.y - 3, vx: 0, vy: 320, owner: 'player', damage: 7, life: 60 }];
    advanceProjectiles(s); expect(s.bullets).toHaveLength(0);
    const target = bombTarget(s, { x, y: wall.y + wall.h + 20 });
    expect(target.y).toBeLessThan(wall.y - 4);
    expect(visible(target, target, 3.999, layout.walls)).toBe(true);
  });

  it('rats navigate around a new wall and archers do not aim through it', () => {
    const s = arena(1); Object.assign(s.player, { x: 185, y: 183 });
    s.enemies = [{ id: s.nextId++, kind: 'archer', x: 185, y: 60, hp: 40, maxHp: 40, angle: Math.PI / 2, mode: 'move', timer: 0, targetX: 185, targetY: 183, flash: 0 }];
    step(s, emptyInput()); expect(s.enemies[0].mode).toBe('move');
    Object.assign(s.player, { x: 228, y: 183 });
    Object.assign(s.enemies[0], { kind: 'rat', x: 228, y: 80 });
    const walls = roomLayout(s).walls;
    for (let tick = 0; tick < 600 && distance(s.enemies[0], s.player) >= 17; tick++) {
      step(s, emptyInput()); expect(visible(s.enemies[0], s.enemies[0], 9.999, walls)).toBe(true);
    }
    expect(s.enemies[0].mode).toBe('move'); expect(distance(s.enemies[0], s.player)).toBeLessThan(17);
  });

  it('new walls block blast damage', () => {
    const s = arena(1); s.expedition!.relics = ['R13'];
    s.enemies = [{ id: s.nextId++, kind: 'rat', x: 228, y: 102, hp: 40, maxHp: 40, angle: 0, mode: 'move', timer: 0, targetX: 320, targetY: 183, flash: 0 }];
    s.bombs = [{ id: s.nextId++, x: 228, y: 150, ticks: 1 }];
    advanceBombs(s); expect(s.enemies[0].hp).toBe(40);
  });

  it('stops a guard charge and its warning at a new wall', () => {
    const s = arena(1); Object.assign(s.player, { x: 185, y: 90 });
    s.enemies = [{ id: s.nextId++, kind: 'guard', x: 185, y: 70, hp: 65, maxHp: 65, angle: Math.PI / 2, mode: 'move', timer: 0, targetX: 185, targetY: 90, flash: 0 }];
    const guard = s.enemies[0]; advanceSpecialEnemy(s, guard);
    expect(guard.mode).toBe('windup'); expect(guard.targetY).toBeCloseTo(102, 1);
    for (let t = 0; t < 70; t++) advanceSpecialEnemy(s, guard);
    expect(guard.mode).toBe('recover'); expect(guard.y).toBeLessThanOrEqual(102);
    expect(visible(guard, guard, 9.999, roomLayout(s).walls)).toBe(true);
  });

  it('keeps old saves and special rooms on their original layout', () => {
    const s = arena(1); delete s.expedition!.dungeon!.layoutVersion;
    expect(roomLayout(s).obstacles).toEqual(PILLARS);
    const fresh = createDungeonRun(42);
    for (const room of fresh.expedition!.dungeon!.rooms) delete room.structure;
    for (const id of [6, 7, 8, 9, 10]) { fresh.expedition!.room = id; expect(roomLayout(fresh).obstacles).toEqual(PILLARS); }
  });
});
