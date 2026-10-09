import { ALTAR_PEDESTAL, TREASURE_PEDESTAL, SHOP_MERCHANT, SHOP_COUNTER, BOUNDARY_WALLS, PILLARS, type Box, type DungeonRoom, type RunState } from './model';
import { currentRoom } from './dungeon';
import { ROOM_STRUCTURES } from './room-structures';
import { decoyBounds, SCARECROW } from './scarecrow';

function layout(id: number, name: string, obstacles: Box[], floor: number[], stone: number, trim: number) {
  return { id, name, obstacles, walls: [...BOUNDARY_WALLS, ...obstacles], floor, stone, trim };
}

export const ROOM_LAYOUTS = [
  layout(0, '봉인의 석실', PILLARS, [0x202c32, 0x222f35, 0x253137, 0x27333a, 0x1e2a30], 0x48565b, 0x66716e),
  layout(1, '모래빛 회랑', ROOM_STRUCTURES[1].obstacles, [0x302b25, 0x342e26, 0x383128, 0x322e28, 0x2c2923], 0x716047, 0xa68b60),
  layout(2, '이끼 낀 폐허', ROOM_STRUCTURES[2].obstacles, [0x202e28, 0x25322a, 0x29362d, 0x233028, 0x1e2b25], 0x52654d, 0x86966a),
] as const;
export type RoomLayout = typeof ROOM_LAYOUTS[number];
export const CURSED_LAYOUTS = [
  layout(3, '사슬의 회랑', PILLARS, [0x302936, 0x342b3a, 0x292530, 0x38303e, 0x2f2835], 0x60516a, 0xb39879),
  layout(4, '재의 기도실', [{ x: 160, y: 88, w: 36, h: 96 }, { x: 444, y: 214, w: 36, h: 96 }],
    [0x37302d, 0x3b3431, 0x30292a, 0x342f32, 0x403530], 0x756050, 0xc69773),
  layout(5, '봉인된 갈림길', [{ x: 208, y: 100, w: 72, h: 32 }, { x: 360, y: 234, w: 72, h: 32 }, { x: 96, y: 216, w: 32, h: 60 }],
    [0x282a38, 0x303244, 0x2b2b3e, 0x373344, 0x252638], 0x52546e, 0xab92bb),
] as const;

export const HEART_LAYOUTS = [
  layout(6, '심장부의 석실', PILLARS, [0x322431,0x392936,0x30222c,0x3f2c38,0x2a222e], 0x68536b, 0xe1a187),
  layout(7, '공허의 교차로', [{x:152,y:96,w:40,h:92},{x:448,y:218,w:40,h:92}],
    [0x202d38,0x243444,0x283646,0x23313e,0x1e2a38],0x546a85,0x9dd5df),
  layout(8, '붉은 봉인의 회랑', [{x:184,y:96,w:88,h:32},{x:368,y:238,w:88,h:32},{x:104,y:224,w:32,h:52}],
    [0x35252a,0x402c31,0x352932,0x3c2930,0x2e232d],0x7c555f,0xd9a579),
] as const;

function roomPalette(s: RunState): RoomLayout {
  const room = currentRoom(s);
  if (s.expedition?.region === 3) return HEART_LAYOUTS[room && ['start', 'combat','elite'].includes(room.kind) ? room.template : 0] ?? HEART_LAYOUTS[0];
  if (s.expedition?.region === 2) return CURSED_LAYOUTS[room && ['start', 'combat','elite'].includes(room.kind) ? room.template : 0] ?? CURSED_LAYOUTS[0];
  // Preserve the terrain of pre-0.13 saves, including live bullets and placed bombs.
  return !!s.expedition?.dungeon?.layoutVersion && room && ['start', 'combat','elite'].includes(room.kind)
    ? ROOM_LAYOUTS[room.template] ?? ROOM_LAYOUTS[0] : ROOM_LAYOUTS[0];
}

export function roomLayout(s: RunState, dynamic = true): RoomLayout {
  const palette = roomPalette(s), room = currentRoom(s);
  const shape = !!s.expedition?.dungeon?.layoutVersion && room?.kind !== 'boss'
    && room?.structure !== undefined ? ROOM_STRUCTURES[room.structure] : undefined;
  const result = shape ? { ...palette, name: `${palette.name} · ${shape.name}`, obstacles: shape.obstacles,
    walls: [...BOUNDARY_WALLS, ...shape.obstacles] } : palette;
  const withWall = dynamic && s.stoneWall ? { ...result, obstacles: [...result.obstacles, s.stoneWall], walls: [...result.walls, s.stoneWall] } : result;
  if (!dynamic || !s.decoy) return withWall;
  const decoy = { ...decoyBounds(s.decoy), decoyId: s.decoy.id };
  return { ...withWall, obstacles: [...withWall.obstacles, decoy] };
}

const PROP_OBSTACLES: Partial<Record<DungeonRoom['kind'], Box[]>> = {
  altar: [ALTAR_PEDESTAL],
  treasure: [TREASURE_PEDESTAL],
  shop: [SHOP_MERCHANT, SHOP_COUNTER],
};
export function bodyObstacles(s: RunState, dynamic = true) {
  const room = currentRoom(s);
  const obstacles = roomLayout(s, dynamic).obstacles.filter(b => (b !== s.stoneWall || (s.player.height ?? 0) < 60)
    && (!('decoyId' in b) || (s.player.height ?? 0) < SCARECROW.height)), props = room && PROP_OBSTACLES[room.kind];
  return props ? [...obstacles, ...props] : obstacles;
}
export function groundObstacles(s:RunState,dynamic=true){
  return [...bodyObstacles({...s,player:{...s.player,height:0}},dynamic),...(currentRoom(s)?.pits ?? [])];
}
