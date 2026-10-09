import * as THREE from 'three';
import type { RunState } from '../core/model';
import { EVACUATION } from '../core/evacuation';
import { box, ring } from './scene-primitives';
import { SCALE, wx, wz } from './world-space';

export function paintEvacuation(s: RunState, object: (key: string, create: () => THREE.Group) => THREE.Group) {
  for (const c of s.cues) {
    const age = (s.tick - c.tick) / EVACUATION.cueTicks;
    if (c.kind !== 'evade' || !c.end || age < 0 || age >= 1) continue;
    const g = object(`evacuation-${c.id}`, () => {
      const trace = new THREE.Group(); trace.name = 'evacuation-trace'; ring(trace, .42, 0xe4cca0).name = 'escape-departure';
      const destination = new THREE.Group(); destination.name = 'escape-destination'; trace.add(destination); ring(destination, .5, 0xb4e9d8).name = 'escape-arrival';
      for (const x of [-.16, 0, .16]) box(destination, .035, .18, .025, x, .42, -.08, 0xcde8df, 0x335a50).rotation.z = x * 2;
      trace.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = false; const mats = Array.isArray(o.material) ? o.material : [o.material]; for (const m of mats) { m.transparent = true; m.depthWrite = false; } } });
      return trace;
    });
    g.position.set(wx(c.x), (c.height ?? 0) * SCALE, wz(c.y));
    g.getObjectByName('escape-destination')!.position.set((c.end.x - c.x) * SCALE, ((c.endHeight ?? 0) - (c.height ?? 0)) * SCALE, (c.end.y - c.y) * SCALE);
    g.getObjectByName('escape-departure')!.scale.setScalar(.75 + age * .5); g.getObjectByName('escape-arrival')!.scale.setScalar(.75 + age * .5);
    g.traverse(o => { if (o instanceof THREE.Mesh) { const mats = Array.isArray(o.material) ? o.material : [o.material]; for (const m of mats) m.opacity = (1 - age) * .8; } });
  }
}
