import { describe, expect, it } from 'vitest';
import { createDungeonRun, emptyInput, step, travel } from '../src/core/simulation';
import { adjacentRooms, currentRoom, DIRECTIONS, knownRooms } from '../src/core/dungeon';
import { canContinue, chooseRelic, openTreasure, roomReward } from '../src/core/expedition';
import { BOUNDS, type Direction, type RunState } from '../src/core/model';
import { distance, visible } from '../src/core/geometry';
import { roomLayout } from '../src/core/room-layout';

function settle(s: RunState) {
  if (currentRoom(s)!.kind === 'combat' && !currentRoom(s)!.cleared) { s.phase = 'combat'; s.enemies = []; step(s, emptyInput()); }
  if (roomReward(s)?.choice === null) chooseRelic(s, 'skip');
}
function path(s: RunState, target: number): Direction[] {
  const queue = [{ id: s.expedition!.room, steps: [] as Direction[] }], seen = new Set<number>();
  while (queue.length) {
    const next = queue.shift()!; if (next.id === target) return next.steps;
    if (seen.has(next.id)) continue; seen.add(next.id);
    for (const door of adjacentRooms(s, next.id)) queue.push({ id: door.room.id, steps: [...next.steps, door.direction] });
  }
  throw new Error('unreachable');
}
function walk(s: RunState, target: number) {
  for (const direction of path(s, target)) { settle(s); expect(travel(s, direction)).toBe(true); }
}

describe('maze expedition', () => {
  it('spawns 5–10 enemies in every combat room from every entrance, with varied repeatable counts and safe positions', () => {
    const counts = new Set<number>();
    for (let seed = 1; seed <= 32; seed++) {
      const original = createDungeonRun(seed);
      for (const node of original.expedition!.dungeon!.rooms.filter(r => r.kind === 'combat')) {
        for (const entrance of adjacentRooms(original, node.id)) {
          const s = createDungeonRun(seed), from = s.expedition!.dungeon!.rooms[entrance.room.id];
          from.visited = from.cleared = true; s.expedition!.room = from.id;
          const copy = structuredClone(s), direction = adjacentRooms(s).find(d => d.room.id === node.id)!.direction;
          expect(travel(s, direction)).toBe(true); travel(copy, direction); expect(copy).toEqual(s);
          expect(s.enemies.length).toBeGreaterThanOrEqual(5); expect(s.enemies.length).toBeLessThanOrEqual(10);
          counts.add(s.enemies.length);
          for (const enemy of s.enemies) {
            expect(visible(enemy, enemy, 10, roomLayout(s).walls)).toBe(true); expect(distance(enemy, s.player)).toBeGreaterThanOrEqual(110);
            for (const other of s.enemies) if (other.id !== enemy.id) expect(distance(enemy, other)).toBeGreaterThanOrEqual(20);
          }
        }
      }
    }
    expect([...counts].sort((a, b) => a - b)).toEqual([5, 6, 7, 8, 9, 10]);
  });
  it('generates connected, repeatable branching layouts with a loop and a remote boss leaf', () => {
    const layouts = new Set<string>();
    for (let seed = 1; seed <= 64; seed++) {
      const s = createDungeonRun(seed), rooms = s.expedition!.dungeon!.rooms;
      expect(s).toEqual(createDungeonRun(seed)); expect(rooms).toHaveLength(11);
      expect(new Set(rooms.map(r => `${r.x}/${r.y}`)).size).toBe(11);
      expect(adjacentRooms(s).length).toBeGreaterThanOrEqual(3);
      const distances = rooms.map(r => path(s, r.id).length), boss = rooms.find(r => r.kind === 'boss')!;
      expect(adjacentRooms(s, boss.id)).toHaveLength(1); expect(distances[boss.id]).toBe(Math.max(...distances));
      expect(distances[boss.id]).toBeGreaterThanOrEqual(3);
      expect(rooms.reduce((n, r) => n + adjacentRooms(s, r.id).length, 0) / 2).toBeGreaterThanOrEqual(rooms.length);
      layouts.add(JSON.stringify(rooms.map(r => [r.x, r.y])));
    }
    expect(layouts.size).toBeGreaterThanOrEqual(8);
  });
  it('starts safely with discovered neighbors and hides unexplored distant rooms', () => {
    const s = createDungeonRun(42);
    expect(s.phase).toBe('explore'); expect(s.enemies).toHaveLength(0); expect(s.player).toMatchObject({ x: 320, y: 183 });
    expect(knownRooms(s)).toHaveLength(adjacentRooms(s).length + 1); expect(knownRooms(s).length).toBeLessThan(9);
    expect(canContinue(s)).toBe(true);
  });
  it.each(['north', 'east', 'south', 'west'] as Direction[])('walks through the %s door into the opposite doorway', direction => {
    const s = createDungeonRun(42), door = adjacentRooms(s).find(d => d.direction === direction)!;
    const delta = DIRECTIONS[direction]; s.player.x = 320 + delta.x * (BOUNDS.w / 2 - 7); s.player.y = 183 + delta.y * (BOUNDS.h / 2 - 7);
    step(s, { ...emptyInput(), moveX: delta.x, moveY: delta.y });
    expect(s.expedition!.room).toBe(door.room.id);
    expect(s.player.x).toBe(320 - delta.x * (BOUNDS.w / 2 - 40)); expect(s.player.y).toBe(183 - delta.y * (BOUNDS.h / 2 - 33));
    const arrived = s.expedition!.room; step(s, emptyInput()); expect(s.expedition!.room).toBe(arrived);
  });
  it('locks combat exits and never respawns enemies or gold on a cleared revisit', () => {
    const s = createDungeonRun(42), door = adjacentRooms(s).find(d => d.room.kind === 'combat')!;
    expect(travel(s, door.direction)).toBe(true); const id = s.expedition!.room;
    expect(s.enemies.length).toBeGreaterThanOrEqual(5); expect(s.enemies.length).toBeLessThanOrEqual(10);
    expect(travel(s, adjacentRooms(s)[0].direction)).toBe(false);
    settle(s); expect(s.phase).toBe('explore'); expect(s.gold).toBe(8);
    walk(s, 0); walk(s, id); expect(s.enemies).toHaveLength(0); expect(s.phase).toBe('explore'); expect(s.gold).toBe(8);
  });
  it('keeps each treasure choice fixed and blocks departure until the offer is resolved', () => {
    const s = createDungeonRun(42), treasure = s.expedition!.dungeon!.rooms.find(r => r.kind === 'treasure')!;
    walk(s, treasure.id); expect(roomReward(s)).toBeNull();
    s.player.x = 320; s.player.y = 215; expect(openTreasure(s)).toBe(true);
    const reward = structuredClone(roomReward(s)!);
    expect(s.enemies).toHaveLength(0); expect(reward.candidates).toHaveLength(3);
    expect(travel(s, adjacentRooms(s)[0].direction)).toBe(false);
    expect(chooseRelic(s, reward.candidates[0])).toBe(true); expect(s.phase).toBe('explore');
    walk(s, 0); walk(s, treasure.id);
    expect(roomReward(s)!.candidates).toEqual(reward.candidates); expect(chooseRelic(s, 'skip')).toBe(false);
    expect(s.expedition!.acquired).toEqual([reward.candidates[0]]);
  });
  it('can reach and defeat the boss without clearing optional branches', () => {
    const s = createDungeonRun(42), boss = s.expedition!.dungeon!.rooms.find(r => r.kind === 'boss')!;
    walk(s, boss.id); expect(s.boss?.hp).toBe(1800); expect(s.phase).toBe('ready');
    const gold = s.gold; s.phase = 'combat'; s.boss!.hp = 10;
    s.bullets = [{ id: s.nextId++, x: s.boss!.x, y: s.boss!.y, vx: 0, vy: 0, owner: 'player', damage: 10, life: 60 }];
    step(s, emptyInput()); expect(s.phase).toBe('cleared'); expect(s.gold).toBe(gold + 40); expect(canContinue(s)).toBe(false);
    expect(currentRoom(s)!.cleared).toBe(true); expect(s.expedition!.dungeon!.rooms.some(r => !r.visited)).toBe(true);
  });
});
