import { BOUNDS, type Direction, type DungeonRoom, type InputState, type RunState } from './model';
import { roomStructure } from './room-structures';

export const DIRECTIONS: Record<Direction, { x: number; y: number }> = {
  north: { x: 0, y: -1 }, east: { x: 1, y: 0 }, south: { x: 0, y: 1 }, west: { x: -1, y: 0 },
};
// Connected templates include a loop, side branches, and a farthest leaf for the boss.
const LAYOUTS = [
  [[0, 0], [-1, 0], [1, 0], [0, -1], [1, -1], [1, -2], [-2, 0], [0, 1], [2, -2], [-1, 1], [2, 0]],
  [[0, 0], [-1, 0], [1, 0], [0, 1], [1, 1], [2, 1], [-1, -1], [0, -1], [3, 1], [0, 2], [2, 0]],
  [[0, 0], [-1, 0], [1, 0], [0, -1], [1, -1], [-1, -1], [-2, 0], [0, 1], [2, -1], [-2, -1], [0, 2]],
];
export function createDungeon(seed: number): { rooms: DungeonRoom[]; layoutVersion: 1 } {
  return { layoutVersion: 1, rooms: LAYOUTS[seed % LAYOUTS.length].map(([column, row], id) => {
    let x = column * ((seed >>> 3) % 2 ? -1 : 1), y = row;
    for (let turn = 0; turn < (seed >>> 1) % 4; turn++) [x, y] = [-y, x];
    return { id, x, y, kind: id === 0 ? 'start' : id === 8 ? 'boss' : id === 9 ? 'altar' : id === 10 ? 'shop' : id >= 6 ? 'treasure' : 'combat',
      template: (seed + id) % 3, ...(id === 8 ? {} : { structure: roomStructure(seed, id) }),
      visited: id === 0, cleared: id === 0, reward: null };
  }) };
}
export function currentRoom(s: RunState): DungeonRoom | undefined {
  return s.expedition?.route === 'maze' ? s.expedition.dungeon?.rooms[s.expedition.room] : undefined;
}
export function adjacentRooms(s: RunState, id = s.expedition?.room) {
  const rooms = s.expedition?.dungeon?.rooms ?? [], from = rooms.find(r => r.id === id);
  if (!from) return [];
  return (Object.entries(DIRECTIONS) as [Direction, { x: number; y: number }][]).flatMap(([direction, delta]) => {
    const room = rooms.find(r => r.x === from.x + delta.x && r.y === from.y + delta.y);
    return room ? [{ direction, room }] : [];
  });
}
export function knownRooms(s: RunState): DungeonRoom[] {
  const rooms = s.expedition?.dungeon?.rooms ?? [];
  return rooms.filter(r => r.visited || rooms.some(v => v.visited && Math.abs(r.x - v.x) + Math.abs(r.y - v.y) === 1));
}
export function exitDirection(s: RunState, input: InputState): Direction | undefined {
  if (s.phase !== 'explore') return;
  const p = s.player;
  return adjacentRooms(s).find(({ direction }) => {
    if (direction === 'north') return input.moveY < 0 && p.y <= BOUNDS.y + 14 && Math.abs(p.x - 320) <= 22;
    if (direction === 'south') return input.moveY > 0 && p.y >= BOUNDS.y + BOUNDS.h - 14 && Math.abs(p.x - 320) <= 22;
    if (direction === 'west') return input.moveX < 0 && p.x <= BOUNDS.x + 14 && Math.abs(p.y - 183) <= 22;
    return input.moveX > 0 && p.x >= BOUNDS.x + BOUNDS.w - 14 && Math.abs(p.y - 183) <= 22;
  })?.direction;
}
