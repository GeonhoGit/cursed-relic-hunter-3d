import * as THREE from 'three';
import type { RunState } from '../core/model';
import { GRAVITY, orbitPoint, THORN } from '../core/relic-fields';
import { SCALE, wx, wz } from './world-space';
import { orb, ring } from './scene-primitives';

type ObjectFor = (key: string, create: () => THREE.Group) => THREE.Group;
export function paintRelicFields(s: RunState, reduced: boolean, object: ObjectFor) {
  for (const shot of s.orbitShots ?? []) {
    const p = orbitPoint(s, shot);
    const g = object(`relic-orbit-${shot.id}`, () => { const g = new THREE.Group();
      orb(g, .095, 0, 0, 0, 0xf6ce8b, 0x996b35); const halo = ring(g, .16, 0xffe2ab); halo.rotation.x = 0; return g; });
    g.position.set(wx(p.x), p.height * SCALE, wz(p.y)); g.rotation.y = reduced ? 0 : s.tick * .07;
  }
  if (s.gravityWell) {
    const well = s.gravityWell;
    const g = object(`relic-gravity-${well.id}`, () => { const g = new THREE.Group();
      ring(g, GRAVITY.radius * SCALE, 0xaea2ed); ring(g, GRAVITY.radius * SCALE * .6, 0x8573c7);
      const center = orb(g, .15, 0, .13, 0, 0x211c3d, 0x403361); center.castShadow = false; return g; });
    g.position.set(wx(well.x), .015, wz(well.y)); g.rotation.y = reduced ? 0 : s.tick * .015;
    g.children.forEach(child => { if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshBasicMaterial)
      child.material.opacity = Math.min(.8, well.ticks / 15); });
  }
  for (const trail of s.thornTrails ?? []) {
    const g = object(`relic-trail-${trail.id}`, () => {
      const g = new THREE.Group();
      const strips = new THREE.InstancedMesh(new THREE.BoxGeometry(1, .015, 1), new THREE.MeshBasicMaterial({ color: 0x75a77d, transparent: true, opacity: .35, depthWrite: false }), 17);
      const spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(.065, .28, 5), new THREE.MeshStandardMaterial({ color: 0x91b29a, roughness: .8 }), 17);
      strips.name = 'thorn-path'; spikes.name = 'thorn-spikes'; strips.frustumCulled = spikes.frustumCulled = false;
      g.add(strips, spikes); return g;
    });
    const strips = g.children[0] as THREE.InstancedMesh, spikes = g.children[1] as THREE.InstancedMesh;
    const transform = new THREE.Object3D(); strips.count = spikes.count = trail.points.length;
    trail.points.forEach((a, i) => {
      const b = trail.points[i + 1] ?? a, length = Math.hypot(b.x - a.x, b.y - a.y) * SCALE;
      transform.position.set(wx((a.x + b.x) / 2), .055, wz((a.y + b.y) / 2));
      transform.rotation.set(0, Math.atan2(b.x - a.x, b.y - a.y), 0); transform.scale.set(THORN.radius * 2 * SCALE, 1, Math.max(THORN.radius * 2 * SCALE, length)); transform.updateMatrix();
      strips.setMatrixAt(i, transform.matrix);
      transform.position.set(wx(a.x), .17, wz(a.y)); transform.rotation.set(0, 0, 0); transform.scale.setScalar(1); transform.updateMatrix(); spikes.setMatrixAt(i, transform.matrix);
    });
    strips.instanceMatrix.needsUpdate = spikes.instanceMatrix.needsUpdate = true;
    (strips.material as THREE.MeshBasicMaterial).opacity = .35 * Math.min(1, trail.ticks / 20);
  }
}
