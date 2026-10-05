import * as THREE from 'three';
import type { Box } from '../core/model';

// Bounds are in world metres (Box.y is the floor's z axis).
// Extrude the rectangle union so joined walls never draw coincident faces.
export function wallGeometry(bounds: readonly Box[], height: number, bottom = 0, padding = 0) {
  const boxes = bounds.map(b => ({ x: b.x - padding, y: b.y - padding, w: b.w + padding * 2, h: b.h + padding * 2 }));
  const xs = [...new Set(boxes.flatMap(b => [b.x, b.x + b.w]))].sort((a, b) => a - b);
  const zs = [...new Set(boxes.flatMap(b => [b.y, b.y + b.h]))].sort((a, b) => a - b);
  const occupied = xs.slice(1).map((x, i) => zs.slice(1).map((z, j) => {
    const cx = (xs[i] + x) / 2, cz = (zs[j] + z) / 2;
    return boxes.some(b => cx > b.x && cx < b.x + b.w && cz > b.y && cz < b.y + b.h);
  }));
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const quad = (points: number[][], normal: number[]) => {
    const start = positions.length / 3;
    for (const [x, y, z] of points) {
      positions.push(x, y, z); normals.push(...normal);
      // Shared world coordinates keep stone joints continuous across grid cuts.
      uvs.push((normal[0] ? z : x) / 2, (normal[1] ? z : y) / 2);
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  };
  const top = bottom + height;
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
    if (!occupied[i][j]) continue;
    const x0 = xs[i], x1 = xs[i + 1], z0 = zs[j], z1 = zs[j + 1];
    quad([[x0, top, z0], [x0, top, z1], [x1, top, z1], [x1, top, z0]], [0, 1, 0]);
    quad([[x0, bottom, z0], [x1, bottom, z0], [x1, bottom, z1], [x0, bottom, z1]], [0, -1, 0]);
    if (!occupied[i - 1]?.[j]) quad([[x0, bottom, z0], [x0, bottom, z1], [x0, top, z1], [x0, top, z0]], [-1, 0, 0]);
    if (!occupied[i + 1]?.[j]) quad([[x1, bottom, z1], [x1, bottom, z0], [x1, top, z0], [x1, top, z1]], [1, 0, 0]);
    if (!occupied[i][j - 1]) quad([[x1, bottom, z0], [x0, bottom, z0], [x0, top, z0], [x1, top, z0]], [0, 0, -1]);
    if (!occupied[i][j + 1]) quad([[x0, bottom, z1], [x1, bottom, z1], [x1, top, z1], [x0, top, z1]], [0, 0, 1]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices);
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
