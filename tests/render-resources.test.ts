import {describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {box,bevel,orb,ring,dispose} from '../src/game/scene-primitives';
import {releaseGeometry,withRenderResources} from '../src/game/render-resources';

describe('render resource reuse and lifetime',()=>{
 it('shares identical geometry while keeping material and transform ownership separate',()=>{
  const a=new THREE.Group(),b=new THREE.Group(),one=box(a,2,3,4,1,2,3,0x112233),two=box(b,2,3,4,4,5,6,0x556677);
  expect(one.geometry).toBe(two.geometry);expect(one.material).not.toBe(two.material);expect(one.scale.toArray()).toEqual([1,1,1]);
  expect(new THREE.Box3().setFromObject(a).getSize(new THREE.Vector3()).toArray()).toEqual([2,3,4]);
  let freed=0;one.geometry.addEventListener('dispose',()=>freed++);dispose(a);expect(freed).toBe(0);expect(b.children).toHaveLength(1);dispose(b);expect(freed).toBe(1);
 });
 it('reuses common round and beveled geometry but distinguishes dimensions',()=>{
  const g=new THREE.Group();expect(orb(g,.1,0,0,0,1).geometry).toBe(orb(g,.1,1,0,0,2).geometry);
  expect(ring(g,.5,1).geometry).toBe(ring(g,.5,2).geometry);
  expect(bevel(g,1,2,3,0,0,0,1).geometry).toBe(bevel(g,1,2,3,0,0,0,2,true).geometry);
  expect(box(g,1,2,3,0,0,0,1).geometry).not.toBe(box(g,2,2,3,0,0,0,1).geometry);dispose(g);
 });
 it('bridges room replacement in one paint without disposing reused buffers and shaders early',()=>{
  const old=new THREE.Group(),next=new THREE.Group(),mesh=bevel(old,2,3,4,0,0,0,1),geometry=mesh.geometry;
  const released=vi.fn(),materialReleased=vi.fn();geometry.addEventListener('dispose',released);mesh.material.addEventListener('dispose',materialReleased);
  withRenderResources(()=>{dispose(old);expect(released).not.toHaveBeenCalled();expect(materialReleased).not.toHaveBeenCalled();expect(bevel(next,2,3,4,0,0,0,2).geometry).toBe(geometry);});
  expect(released).not.toHaveBeenCalled();expect(materialReleased).toHaveBeenCalledOnce();dispose(next);expect(released).toHaveBeenCalledOnce();
 });
 it('releases an unused geometry at paint end, including nested scopes and a failed paint',()=>{
  const g=new THREE.Group(),mesh=orb(g,.19,0,0,0,1),released=vi.fn();mesh.geometry.addEventListener('dispose',released);
  expect(()=>withRenderResources(()=>{dispose(g);withRenderResources(()=>expect(released).not.toHaveBeenCalled());throw new Error('paint failed');})).toThrow('paint failed');
  expect(released).toHaveBeenCalledOnce();const next=new THREE.Group();expect(orb(next,.19,0,0,0,1).geometry).not.toBe(mesh.geometry);dispose(next);
 });
 it('allows a prop to replace shared geometry without invalidating the other owner or leaking a reference',()=>{
  const a=new THREE.Group(),b=new THREE.Group(),one=orb(a,.25,0,0,0,1),two=orb(b,.25,0,0,0,2),old=one.geometry,freed=vi.fn();old.addEventListener('dispose',freed);
  releaseGeometry(one.geometry);one.geometry=new THREE.OctahedronGeometry(.27);expect(freed).not.toHaveBeenCalled();dispose(a);expect(freed).not.toHaveBeenCalled();dispose(b);expect(freed).toHaveBeenCalledOnce();
 });
});
