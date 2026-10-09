import { BOUNDS, type Direction, type DungeonRoom, type InputState, type RunState } from './model';
import { roomStructure, ROOM_STRUCTURES } from './room-structures';
import { hasRelic } from './relics';

export const DIRECTIONS: Record<Direction, { x: number; y: number }> = {
  north: { x: 0, y: -1 }, east: { x: 1, y: 0 }, south: { x: 0, y: 1 }, west: { x: -1, y: 0 },
};
// Connected templates include a loop, side branches, and a farthest leaf for the boss.
const LAYOUTS = [
  [[0, 0], [-1, 0], [1, 0], [0, -1], [1, -1], [1, -2], [-2, 0], [0, 1], [2, -2], [-1, 1], [2, 0]],
  [[0, 0], [-1, 0], [1, 0], [0, 1], [1, 1], [2, 1], [-1, -1], [0, -1], [3, 1], [0, 2], [2, 0]],
  [[0, 0], [-1, 0], [1, 0], [0, -1], [1, -1], [-1, -1], [-2, 0], [0, 1], [2, -1], [-2, -1], [0, 2]],
];
export function createDungeon(seed: number, layoutVersion: 1 | 2 | 3 = 1): { rooms: DungeonRoom[]; layoutVersion: 1 | 2 | 3 } {
  const dungeon = { layoutVersion, rooms: LAYOUTS[seed % LAYOUTS.length].map(([column, row], id): DungeonRoom => {
    let x = column * ((seed >>> 3) % 2 ? -1 : 1), y = row;
    for (let turn = 0; turn < (seed >>> 1) % 4; turn++) [x, y] = [-y, x];
    return { id, x, y, kind: id === 0 ? 'start' : id === 8 ? 'boss' : id === 9 ? 'altar' : id === 10 ? 'shop' : id >= 6 ? 'treasure' : 'combat',
      template: (seed + id) % 3, ...(id === 8 ? {} : { structure: roomStructure(seed, id) }),
      visited: id === 0, cleared: id === 0, reward: null };
  }) };
  if (layoutVersion >= 2) {
    const rooms = dungeon.rooms;
    const options = rooms.filter(r => r.kind === 'treasure').flatMap(r => Object.values(DIRECTIONS).map(d => ({ x: r.x+d.x, y: r.y+d.y })))
      .filter(p => !rooms.some(r => r.x===p.x && r.y===p.y) && rooms.filter(r => Math.abs(r.x-p.x)+Math.abs(r.y-p.y)===1).length===1);
    const p = options[seed % options.length];
    rooms.push({ ...p, id: 11, kind: 'treasure', template: seed % 3, structure: roomStructure(seed, 11), visited: false, cleared: false, reward: null, locked: true });
    const boss = rooms[8], main = rooms.find(r => r.kind==='combat' && Math.abs(r.x-boss.x)+Math.abs(r.y-boss.y)===1)!;
    main.mainReward = true;
    // An optional side crossing with wide, unobstructed routes around both ends.
    const pitRoom=rooms[1+seed%5],walls=ROOM_STRUCTURES[pitRoom.structure!].obstacles;
    const pits=[500,600,60,-100].flatMap(x=>[110,232].map(y=>({x,y,w:80,h:60})))
      .filter(p=>!walls.some(w=>p.x<w.x+w.w+8&&p.x+p.w>w.x-8&&p.y<w.y+w.h+8&&p.y+p.h>w.y-8));
    pitRoom.pits=[pits[seed%pits.length]];
  }
  if(layoutVersion===3){
    const rooms=dungeon.rooms,distances=new Map([[0,0]]),queue=[rooms[0]];
    for(const from of queue)for(const next of rooms)if(!distances.has(next.id)&&Math.abs(from.x-next.x)+Math.abs(from.y-next.y)===1){distances.set(next.id,distances.get(from.id)!+1);queue.push(next);}
    const options=rooms.filter(r=>r.kind==='combat'&&(distances.get(r.id) ?? 9)<distances.get(8)!).flatMap(r=>Object.values(DIRECTIONS).map(d=>({x:r.x+d.x,y:r.y+d.y})))
      .filter(p=>!rooms.some(r=>r.x===p.x&&r.y===p.y)&&rooms.filter(r=>Math.abs(r.x-p.x)+Math.abs(r.y-p.y)===1).length===1);
    const p=options[seed%options.length];
    rooms.push({...p,id:12,kind:'elite',template:seed%3,structure:roomStructure(seed,12),visited:false,cleared:false,reward:null});
  }
  return dungeon;
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
  return hasRelic(s, 'R48') ? rooms : rooms.filter(r => r.visited || rooms.some(v => v.visited && Math.abs(r.x - v.x) + Math.abs(r.y - v.y) === 1));
}
export function revealedRoomKind(s: RunState, room: DungeonRoom): DungeonRoom['kind'] | 'unknown' {
  if((s.expedition?.dungeon?.layoutVersion ?? 0)<2)return room.kind;
  const from = currentRoom(s);
  return room.visited || hasRelic(s, 'R48') || hasRelic(s, 'R31') && from && Math.abs(room.x - from.x) + Math.abs(room.y - from.y) === 1 ? room.kind : 'unknown';
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
