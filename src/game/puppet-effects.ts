import * as THREE from 'three';
import { BODY_HEIGHT } from '../core/fps-geometry';
import { isAlly } from '../core/allegiance';
import type { Boss, Enemy, Point } from '../core/model';
import { label, orb, ring } from './scene-primitives';
import { SCALE, wx, wz } from './world-space';

export function paintPuppet(e: Enemy | Boss, pose: Point, body: THREE.Group, object: (key: string, create: () => THREE.Group) => THREE.Group) {
  const fill = body.getObjectByName('fill') as THREE.Mesh | undefined;
  if (fill?.material instanceof THREE.MeshStandardMaterial) {
    const mat = fill.material; mat.userData.puppetBaseColor ??= mat.color.getHex();
    mat.color.setHex(isAlly(e) ? 0x83e4bd : mat.userData.puppetBaseColor);
  }
  if (!isAlly(e) || !('charm' in e) || !e.charm) return;
  const top = BODY_HEIGHT[e.kind] * SCALE + .45;
  const mark = object(`puppet-${e.id}`, () => {
    const g = new THREE.Group(); g.name = 'puppet-mark'; ring(g, .55, 0x91e7c2);
    orb(g, .07, 0, top, 0, 0xb6ffe0, 0x367d63); label(g, '아군', 0, top + .22, 0, 0xbaffdf); return g;
  });
  mark.position.set(wx(pose.x), 0, wz(pose.y)); mark.userData.enemyId = e.id; mark.userData.ticks = e.charm.ticks; mark.userData.hp = e.hp;
}
