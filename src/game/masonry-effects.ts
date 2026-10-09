import * as THREE from 'three';
import type { RunState } from '../core/model';
import { MASONRY } from '../core/masonry';
import { roomLayout } from '../core/room-layout';
import { bevel, box, label } from './scene-primitives';
import { SCALE, wx, wz } from './world-space';

export function paintMasonry(s: RunState, object: (key: string, create: () => THREE.Group) => THREE.Group, camera: THREE.Camera) {
  const wall = s.stoneWall;
  if (!wall) return;
  const layout = roomLayout(s, false), w = wall.w * SCALE, d = wall.h * SCALE, h = MASONRY.height * SCALE;
  const g = object(`stone-wall-${wall.id}`, () => {
    const group = new THREE.Group(); group.name = 'masonry-wall';
    bevel(group, w, h, d, 0, h / 2, 0, layout.stone);
    // Raised bands stay outside the surface; no coincident wall layers.
    for (const y of [.04, h / 3, h * 2 / 3, h - .04]) box(group, w + .024, .028, d + .024, 0, y, 0, layout.trim);
    group.userData.bounds = { ...wall }; return group;
  });
  const x = wx(wall.x + wall.w / 2), z = wz(wall.y + wall.h / 2);
  g.position.set(x, 0, z);
  const bar = object(`stone-durability-${wall.id}`, () => {
    const group = new THREE.Group(); group.name = 'masonry-durability';
    box(group, 1.35, .07, .025, 0, 0, 0, 0xa4d3bc, 0x294237);
    label(group, '석공의 돌벽', 0, .24, 0, 0xcde1cd); return group;
  });
  bar.position.set(x, h + .18, z); bar.lookAt(camera.position); bar.children[0].scale.x = wall.hp / MASONRY.hp;
  bar.userData.hp = wall.hp; bar.userData.ticks = wall.ticks;
}
