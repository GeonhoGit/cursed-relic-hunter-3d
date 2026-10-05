import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { BOUNDS, PILLARS } from '../src/core/model';
import { createDungeonRun, emptyInput, step, travel } from '../src/core/simulation';
import { adjacentRooms, currentRoom } from '../src/core/dungeon';
import { bodyObstacles, roomLayout } from '../src/core/room-layout';
import { distance, nextWaypoint, moveBody, visible } from '../src/core/geometry';
import { SaveStore, defaultSettings, validRun } from '../src/persistence/save';
import { spikeTraps } from '../src/core/traps';

describe('room structures within a floor', () => {
  it('gives all ten non-boss rooms different structures while preserving their palette', () => {
    for (const region of [1, 2, 3] as const) for (let seed = 0; seed < 20; seed++) {
      const s = createDungeonRun(seed); s.expedition!.region = region;
      const geometries = new Set<string>();
      for (const room of s.expedition!.dungeon!.rooms) {
        s.expedition!.room = room.id;
        const before = roomLayout(s), copy = structuredClone(s);
        delete currentRoom(copy)!.structure;
        const palette = roomLayout(copy);
        expect([before.id, before.floor, before.stone, before.trim]).toEqual([palette.id, palette.floor, palette.stone, palette.trim]);
        if (room.kind === 'boss') expect(before.obstacles).toEqual(PILLARS);
        else geometries.add(JSON.stringify(before.obstacles));
      }
      expect(geometries.size).toBe(10);
      expect(createDungeonRun(seed)).toEqual(createDungeonRun(seed));
    }
  });

  it('keeps all entrances and every free area connected for enemy-sized bodies', () => {
    const s = createDungeonRun(42);
    for (const room of s.expedition!.dungeon!.rooms.filter(r => r.kind !== 'boss')) {
      s.expedition!.room = room.id;
      const obstacles = bodyObstacles(s), walls = [...roomLayout(s).walls, ...obstacles];
      const points = Array.from({ length: 36 }, (_, y) => Array.from({ length: 74 }, (_, x) => ({
        x: BOUNDS.x + 22 + x * 12, y: BOUNDS.y + 22 + y * 12,
      }))).flat();
      const open = new Set(points.flatMap((p, i) => visible(p, p, 10, walls) ? [i] : []));
      const start = [...open].sort((a, b) => distance(points[a], { x: 320, y: 250 }) - distance(points[b], { x: 320, y: 250 }))[0];
      const reached = new Set([start]), queue = [start];
      for (let head = 0; head < queue.length; head++) {
        const i = queue[head];
        for (const n of [i - 74, i + 74, ...(i % 74 ? [i - 1] : []), ...(i % 74 < 73 ? [i + 1] : [])]) {
          if (!open.has(n) || reached.has(n) || !visible(points[i], points[n], 10, walls)) continue;
          reached.add(n); queue.push(n);
        }
      }
      expect(reached.size, `room ${room.id} has isolated spawn areas`).toBe(open.size);
      for (const from of [{ x: BOUNDS.x + 40, y: 183 }, { x: BOUNDS.x + BOUNDS.w - 40, y: 183 },
        { x: 320, y: BOUNDS.y + 33 }, { x: 320, y: BOUNDS.y + BOUNDS.h - 33 }]) {
        const body = { ...from }, target = { x: 320, y: 250 };
        expect(visible(body, body, 10, walls)).toBe(true);
        for (let tick = 0; tick < 600 && distance(body, target) > 2; tick++) {
          const next = nextWaypoint(body, target, 10, obstacles), gap = distance(body, next);
          if (!gap) break;
          moveBody(body, (next.x - body.x) / gap * Math.min(3, gap), (next.y - body.y) / gap * Math.min(3, gap), 10, obstacles);
        }
        expect(distance(body, target), `room ${room.id} entrance`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('spawns complete encounters outside walls and keeps all moving trap positions clear', () => {
    for (const region of [1, 2, 3] as const) for (let seed = 0; seed < 10; seed++) for (let id = 1; id <= 5; id++) {
      const s = createDungeonRun(seed); s.expedition!.region = region;
      const source = adjacentRooms(s, id)[0].room; s.expedition!.room = source.id; source.visited = source.cleared = true;
      expect(travel(s, adjacentRooms(s).find(d => d.room.id === id)!.direction)).toBe(true);
      expect(s.enemies.length).toBeGreaterThanOrEqual(region === 3 ? 8 : region === 2 ? 7 : 5);
      expect(s.enemies.length).toBeLessThanOrEqual(10);
      for (const e of s.enemies) { expect(visible(e, e, 10, roomLayout(s).walls)).toBe(true); expect(distance(e, s.player)).toBeGreaterThanOrEqual(110); }
      for (const ticks of [0, 258, 334, 410, 516, 592, 668]) {
        s.trapTicks = ticks;
        const traps = spikeTraps(s); expect(traps.length).toBe(region === 1 ? 0 : 3);
        for (const t of traps) for (const wall of roomLayout(s).obstacles) {
          expect(t.x < wall.x + wall.w && t.x + t.w > wall.x && t.y < wall.y + wall.h && t.y + t.h > wall.y).toBe(false);
        }
      }
    }
  });

  it('stores the selected geometry and resumes the same combat future', async () => {
    const s = createDungeonRun(47); travel(s, adjacentRooms(s).find(d => d.room.kind === 'combat')!.direction);
    const store = new SaveStore('room-structures'); await store.load(); await store.save(s, defaultSettings());
    const restored = (await store.load())!.run!; expect(validRun(restored)).toBe(true);
    expect(roomLayout(restored)).toEqual(roomLayout(s));
    for (let i = 0; i < 120; i++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s);
    for (const value of [-1, 10, .5, '1']) {
      const bad = structuredClone(restored); Object.assign(currentRoom(bad)!, { structure: value }); expect(validRun(bad)).toBe(false);
    }
    const boss = structuredClone(restored); Object.assign(boss.expedition!.dungeon!.rooms[8], { structure: 1 }); expect(validRun(boss)).toBe(false);
  });

  it('preserves visited legacy rooms and assigns a structure only on first entry to an unvisited room', () => {
    const s = createDungeonRun(42); for (const r of s.expedition!.dungeon!.rooms) delete r.structure;
    const before = structuredClone(roomLayout(s));
    const door = adjacentRooms(s).find(d => d.room.kind === 'combat')!;
    expect(travel(s, door.direction)).toBe(true); expect(currentRoom(s)!.structure).toBeTypeOf('number');
    currentRoom(s)!.cleared = true; s.phase = 'explore';
    expect(travel(s, adjacentRooms(s).find(d => d.room.id === 0)!.direction)).toBe(true);
    expect(currentRoom(s)!.structure).toBeUndefined(); expect(roomLayout(s)).toEqual(before);
    const classic = createDungeonRun(42); delete classic.expedition!.dungeon!.layoutVersion;
    for (const r of classic.expedition!.dungeon!.rooms) delete r.structure;
    travel(classic, adjacentRooms(classic).find(d => d.room.kind === 'combat')!.direction);
    expect(currentRoom(classic)!.structure).toBeUndefined(); expect(roomLayout(classic).obstacles).toEqual(PILLARS);
  });
});
