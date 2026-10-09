import * as THREE from 'three';
import type { RunState } from '../core/model';
import { box, label, orb, ring } from './scene-primitives';
import { wx, wz } from './world-space';

export function paintAnchor(s: RunState, object: (key: string, create: () => THREE.Group) => THREE.Group) {
  const a = s.anchor;
  if (!a) return;
  const marker = object(`anchor-${a.id}`, () => {
    const g = new THREE.Group(); g.name = 'anchor-marker'; ring(g, .42, 0x9bdce8);
    box(g, .07, .04, .56, 0, .05, 0, 0x9dbac1, 0x294955);
    box(g, .4, .04, .06, 0, .05, -.1, 0x9dbac1);
    for (const x of [-.2, .2]) { const hook = box(g, .2, .04, .07, x, .05, .19, 0x9bdce8); hook.rotation.y = x > 0 ? -.65 : .65; }
    orb(g, .07, 0, .32, 0, 0xd5f3f3, 0x416e77); label(g, '닻 · 귀환점', 0, .65, 0, 0xbceaf0); return g;
  });
  marker.position.set(wx(a.x), 0, wz(a.y)); marker.userData.room = a.room; marker.userData.region = a.region;
}
