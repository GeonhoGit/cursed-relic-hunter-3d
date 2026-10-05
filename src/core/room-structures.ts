import { PILLARS, type Box } from './model';

const structure = (name: string, obstacles: Box[]) => ({ name, obstacles });
// Keep the central crossroads, door approaches and furniture area clear.
// Only solid walls and pillars belong here; the renderer uses these exact bounds.
export const ROOM_STRUCTURES = [
  structure('네 기둥 홀', PILLARS),
  structure('엇갈린 장벽', [{ x: 176, y: 112, w: 104, h: 32 }, { x: 360, y: 222, w: 104, h: 32 }]),
  structure('갈림 석실', [
    { x: 160, y: 104, w: 32, h: 72 }, { x: 448, y: 190, w: 32, h: 72 },
    { x: 256, y: 238, w: 48, h: 26 }, { x: 336, y: 104, w: 48, h: 26 },
  ]),
  structure('열주 회랑', [-20, 180, 460, 660].flatMap(x => [
    { x, y: 48, w: 32, h: 40 }, { x, y: 285, w: 32, h: 40 },
  ])),
  structure('긴 우회 통로', [
    { x: -20, y: 45, w: 240, h: 28 }, { x: 420, y: 45, w: 240, h: 28 },
    { x: -20, y: 295, w: 240, h: 28 }, { x: 420, y: 295, w: 240, h: 28 },
  ]),
  structure('지그재그 홀', [
    { x: -20, y: 55, w: 160, h: 32 }, { x: 480, y: 275, w: 160, h: 32 },
    { x: 155, y: 275, w: 90, h: 32 }, { x: 395, y: 55, w: 90, h: 32 },
  ]),
  structure('측면 안뜰', [
    { x: -20, y: 45, w: 180, h: 28 }, { x: -20, y: 45, w: 28, h: 278 }, { x: -20, y: 295, w: 180, h: 28 },
    { x: 480, y: 45, w: 180, h: 28 }, { x: 632, y: 45, w: 28, h: 278 }, { x: 480, y: 295, w: 180, h: 28 },
  ]),
  structure('팔각 기둥 홀', [
    { x: 180, y: 70, w: 32, h: 40 }, { x: 428, y: 70, w: 32, h: 40 },
    { x: 180, y: 265, w: 32, h: 40 }, { x: 428, y: 265, w: 32, h: 40 },
    { x: 30, y: 110, w: 32, h: 40 }, { x: 578, y: 110, w: 32, h: 40 },
    { x: 30, y: 220, w: 32, h: 40 }, { x: 578, y: 220, w: 32, h: 40 },
  ]),
  structure('분기 회랑', [
    { x: 130, y: 0, w: 28, h: 135 }, { x: 482, y: 230, w: 28, h: 135 },
    { x: 130, y: 275, w: 28, h: 90 }, { x: 482, y: 0, w: 28, h: 90 },
    { x: -10, y: 107, w: 168, h: 28 }, { x: 482, y: 230, w: 168, h: 28 },
  ]),
  structure('깨진 방어선', [
    { x: 145, y: 55, w: 55, h: 40 }, { x: 440, y: 55, w: 55, h: 40 },
    { x: 145, y: 280, w: 55, h: 40 }, { x: 440, y: 280, w: 55, h: 40 },
    { x: -10, y: 215, w: 135, h: 28 }, { x: 515, y: 123, w: 135, h: 28 },
  ]),
];

export function roomStructure(seed: number, roomId: number): number {
  // Skip boss room 8 so the other ten rooms receive a permutation without repetition.
  const order = roomId > 8 ? roomId - 1 : roomId;
  return ((seed >>> 0) + 8 + order) % ROOM_STRUCTURES.length;
}

export function regionDungeonSeed(seed: number, region: number): number {
  return region === 3 ? (seed ^ 0x85ebca6b) >>> 0 : region === 2 ? (seed ^ 0x9e3779b9) >>> 0 : seed >>> 0;
}
