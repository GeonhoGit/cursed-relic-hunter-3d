import {describe,expect,it} from 'vitest';
import * as THREE from 'three';
import {createEffectWarmup} from '../src/game/effect-warmup';
import {dispose} from '../src/game/scene-primitives';
describe('effect shader warmup outside the camera image',()=>{
 it('submits the transparent attack material and both basic warning sides for early shader preparation',()=>{
  const g=createEffectWarmup();const meshes=g.children as THREE.Mesh[];expect(meshes).toHaveLength(3);
  expect(meshes[0].material).toBeInstanceOf(THREE.MeshStandardMaterial);expect((meshes[0].material as THREE.Material).transparent).toBe(true);
  expect(meshes[1].material).toBeInstanceOf(THREE.MeshBasicMaterial);expect((meshes[1].material as THREE.Material).side).toBe(THREE.DoubleSide);expect((meshes[1].material as THREE.Material).transparent).toBe(true);
  expect((meshes[2].material as THREE.Material).side).toBe(THREE.DoubleSide);expect((meshes[2].material as THREE.Material).transparent).toBe(false);expect(meshes.every(m=>!m.frustumCulled&&!m.castShadow)).toBe(true);dispose(g);
 });
 it('keeps every warmup vertex behind the camera under translation, rotation and jumping poses',()=>{
  for(const position of [[0,1,0],[10,2,-3],[-8,4,12]]){const camera=new THREE.PerspectiveCamera(78,1,.04,75),g=createEffectWarmup();camera.position.fromArray(position);camera.rotation.set(.5,.7,.3);camera.add(g);camera.updateMatrixWorld(true);camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
   for(const m of g.children as THREE.Mesh[]){const vertices=m.geometry.getAttribute('position');for(let i=0;i<vertices.count;i++){const p=new THREE.Vector4(vertices.getX(i),vertices.getY(i),vertices.getZ(i),1).applyMatrix4(m.matrixWorld).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);expect(p.w).toBeLessThan(0);}}
   dispose(g);
  }
 });
 it('keeps geometry shared and releases the warmup when its owner is disposed',()=>{
  const g=createEffectWarmup(),geometry=(g.children[0] as THREE.Mesh).geometry;expect((g.children[1] as THREE.Mesh).geometry).toBe(geometry);let count=0;geometry.addEventListener('dispose',()=>count++);dispose(g);expect(count).toBe(1);
 });
});
