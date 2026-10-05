import { expect, it } from 'vitest';
import * as THREE from 'three';
import { wallGeometry } from '../src/game/wall-geometry';
import { ROOM_STRUCTURES } from '../src/core/room-structures';

const joined = [{ x: 0, y: 0, w: 3, h: 1 }, { x: 0, y: 0, w: 1, h: 3 }];
function area(geometry: THREE.BufferGeometry) {
  const p = geometry.getAttribute('position'), index = geometry.index!, a = new THREE.Vector3(), b = a.clone(), c = a.clone();
  let sum = 0;
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(p, index.getX(i)); b.fromBufferAttribute(p, index.getX(i + 1)); c.fromBufferAttribute(p, index.getX(i + 2));
    sum += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return sum;
}
it('extrudes the union once, removing coincident and buried surfaces while retaining its concavity', () => {
  const geometry = wallGeometry(joined, 2), mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  expect(area(geometry)).toBeCloseTo(34);
  const front = new THREE.Raycaster(new THREE.Vector3(.31, .77, -1), new THREE.Vector3(0, 0, 1));
  expect(front.intersectObject(mesh).filter(hit => Math.abs(hit.point.z) < 1e-6)).toHaveLength(1);
  const courtyard = new THREE.Raycaster(new THREE.Vector3(2, 4, 2), new THREE.Vector3(0, -1, 0));
  expect(courtyard.intersectObject(mesh)).toEqual([]);
});
it('unions the expanded trim too, preserving its height and outward clearance', () => {
  const geometry = wallGeometry(joined, .14, 1.23, .07);
  expect(geometry.boundingBox!.min.y).toBeCloseTo(1.23); expect(geometry.boundingBox!.max.y).toBeCloseTo(1.37);
  expect(geometry.boundingBox!.min.x).toBeCloseTo(-.07); expect(geometry.boundingBox!.max.z).toBeCloseTo(3.07);
  // Expanded L: area 2*(3.14*1.14)-1.14², perimeter 12.56.
  expect(area(geometry)).toBeCloseTo(2 * (2 * 3.14 * 1.14 - 1.14 ** 2) + 12.56 * .14, 5);
});
it.each(ROOM_STRUCTURES)('keeps $name bounds intact and emits only outward triangles with continuous UVs', structure => {
  const before = structuredClone(structure.obstacles), geometry = wallGeometry(structure.obstacles, 5.5);
  expect(structure.obstacles).toEqual(before);
  expect(geometry.boundingBox!.min.x).toBeCloseTo(Math.min(...before.map(b => b.x)));
  expect(geometry.boundingBox!.max.z).toBeCloseTo(Math.max(...before.map(b => b.y + b.h)));
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), uv = geometry.getAttribute('uv'), index = geometry.index!;
  const a = new THREE.Vector3(), b = a.clone(), c = a.clone(), n = a.clone();
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(position, index.getX(i)); b.fromBufferAttribute(position, index.getX(i + 1)); c.fromBufferAttribute(position, index.getX(i + 2));
    n.fromBufferAttribute(normal, index.getX(i)); expect(b.sub(a).cross(c.sub(a)).dot(n)).toBeGreaterThan(0);
  }
  for (let i = 0; i < uv.count; i++) {
    expect(uv.getX(i)).toBeCloseTo((normal.getX(i) ? position.getZ(i) : position.getX(i)) / 2);
    expect(uv.getY(i)).toBeCloseTo((normal.getY(i) ? position.getZ(i) : position.getY(i)) / 2);
  }
});
