import { expect, it } from 'vitest';
import * as THREE from 'three';
import * as primitives from '../src/game/scene-primitives';

it('draws a grid of spikes as one instanced mesh without moving their collision visual positions', () => {
  expect((primitives as any).spikeField).toBeTypeOf('function');
  const mesh = (primitives as any).spikeField(1, 1, 0.48, 0xed754b) as THREE.InstancedMesh;
  expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
  expect(mesh.count).toBe(9);
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(0, matrix);
  const position = new THREE.Vector3().setFromMatrixPosition(matrix);
  expect(position.x).toBeCloseTo(-0.34);
  expect(position.y).toBeCloseTo(0.24);
  expect(position.z).toBeCloseTo(-0.34);
});
