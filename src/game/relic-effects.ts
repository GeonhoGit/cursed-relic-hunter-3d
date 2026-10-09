import * as THREE from 'three';
import type { RunState } from '../core/model';
import { wardPoint } from '../core/relic-combat';
import { hasRelic } from '../core/relics';
import { EYE_HEIGHT } from '../core/fps-geometry';
import { SCALE, wx, wz } from './world-space';
import { box, orb, ring } from './scene-primitives';

type ObjectFor = (key: string, create: () => THREE.Group) => THREE.Group;
export function paintRelicEffects(s: RunState, reduced: boolean, object: ObjectFor) {
  if (hasRelic(s, 'R19') && !s.player.wardCooldown) {
    const point = wardPoint(s);
    const g = object('relic-ward', () => { const g = new THREE.Group(); const stone = orb(g, .1, 0, 0, 0, 0x89a9cf, 0x385371);
      stone.material.transparent = true; stone.material.opacity = .65; stone.material.depthWrite = false;
      const halo = ring(g, .18, 0xc5e3ff); halo.rotation.x = 0; return g; });
    g.position.set(wx(point.x), point.height * SCALE, wz(point.y)); g.rotation.y = reduced ? 0 : s.tick * .02;
  }
  for (const c of s.cues) {
    if (c.kind === 'lightning' || c.kind === 'starlight') {
      const duration = c.kind === 'lightning' ? 12 : 18, age = (s.tick - c.tick) / duration;
      if (age < 0 || age >= 1 || !c.end) continue;
      const g = object(`relic-cue-${c.id}`, () => { const g = new THREE.Group();
        const m = box(g, c.kind === 'starlight' ? .32 : .045, .045, 1, 0, 0, 0,
          c.kind === 'starlight' ? 0xe4c9ff : 0xbdeeff, c.kind === 'starlight' ? 0x9164bf : 0x5ca5c4);
        m.castShadow = false; m.material.transparent = true; m.material.depthWrite = false; return g; });
      const a = new THREE.Vector3(wx(c.x), (c.height ?? EYE_HEIGHT) * SCALE, wz(c.y));
      const b = new THREE.Vector3(wx(c.end.x), (c.endHeight ?? EYE_HEIGHT) * SCALE, wz(c.end.y));
      const direction = b.clone().sub(a);
      g.position.copy(a.clone().add(b).multiplyScalar(.5)); g.scale.z = direction.length();
      if (direction.lengthSq()) g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
      (g.children[0] as THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>).material.opacity = 1 - age;
    } else if (['ward', 'cleanse', 'moss', 'thorns'].includes(c.kind)) {
      const age = (s.tick - c.tick) / 24; if (age < 0 || age >= 1) continue;
      const color = c.kind === 'thorns' ? 0xe3b896 : c.kind === 'moss' ? 0xa4e9ad : c.kind === 'cleanse' ? 0xe3d0fa : 0xbdeeff;
      const g = object(`relic-cue-${c.id}`, () => { const g = new THREE.Group(); ring(g, c.kind === 'thorns' ? c.amount * SCALE : .35, color); return g; });
      g.position.set(wx(c.x), (c.height ?? 2) * SCALE, wz(c.y)); g.scale.setScalar(reduced ? 1 : c.kind === 'thorns' ? .3 + age * .7 : .5 + age * 1.5);
      (g.children[0] as THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>).material.opacity = (1 - age) * .8;
    }
  }
}
