import * as THREE from 'three';
import type { RunState } from '../core/model';
import { SCARECROW } from '../core/scarecrow';
import { bevel, box, label, orb, ring } from './scene-primitives';
import { SCALE, wx, wz } from './world-space';

export function paintScarecrow(s: RunState, object: (key: string, create: () => THREE.Group) => THREE.Group, camera: THREE.Camera) {
  const d = s.decoy;
  if (!d) return;
  const h = SCARECROW.height * SCALE;
  const body = object(`scarecrow-${d.id}`, () => {
    const g = new THREE.Group(); g.name = 'scarecrow-body';
    box(g, .36, .08, .36, 0, .04, 0, 0x574934);
    box(g, .09, h - .3, .09, 0, (h - .3) / 2, 0, 0x725a3e);
    bevel(g, .35, .48, .2, 0, 1.01, 0, 0xb29c69);
    box(g, .56, .07, .07, 0, 1.14, 0, 0x8a714d);
    for (const x of [-.1, .1]) box(g, .08, .44, .06, x, .56, 0, 0x9b815a).rotation.z = x;
    box(g, .36, .045, .22, 0, .86, 0, 0x594831);
    orb(g, .18, 0, h - .23, 0, 0xd1bd80);
    box(g, .42, .04, .35, 0, h - .02, 0, 0x8b744b);
    for (const x of [-.06, .06]) box(g, .025, .035, .025, x, h - .2, -.17, 0x352d22);
    ring(g, .35, 0xe8c77b); g.userData.height = h; return g;
  });
  body.position.set(wx(d.x), 0, wz(d.y)); body.userData.hp = d.hp; body.userData.ticks = d.ticks;
  const bar = object(`scarecrow-health-${d.id}`, () => {
    const g = new THREE.Group(); g.name = 'scarecrow-health';
    box(g, 1.15, .075, .025, 0, 0, 0, 0xe8c77b, 0x433e2d).name = 'fill';
    label(g, '허수아비 · 미끼', 0, .22, 0, 0xf1dfa8); return g;
  });
  bar.position.set(wx(d.x), h + .18, wz(d.y)); bar.lookAt(camera.position);
  bar.getObjectByName('fill')!.scale.x = d.hp / SCARECROW.hp; bar.userData.hp = d.hp; bar.userData.ticks = d.ticks;
}
