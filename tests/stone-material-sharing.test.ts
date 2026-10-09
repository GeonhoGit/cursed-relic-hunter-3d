import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import * as THREE from 'three';
import {stoneMaterial} from '../src/game/ruins-materials';
import {dispose} from '../src/game/scene-primitives';

beforeEach(()=>vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{}})})}));
afterEach(()=>vi.unstubAllGlobals());
describe('stone texture sources',()=>{
 it('shares image upload sources for equal stone while retaining independent repeats and material effects',()=>{
  const a=stoneMaterial(0x506170,'wall',2,3),b=stoneMaterial(0x506170,'wall',5,7);
  for(const key of ['map','normalMap','roughnessMap','aoMap'] as const){expect(a[key]).not.toBe(b[key]);expect(a[key]!.source).toBe(b[key]!.source);expect(a[key]!.repeat.toArray()).toEqual([2,3]);expect(b[key]!.repeat.toArray()).toEqual([5,7]);}
  a.emissive.setHex(0xffffff);a.map!.repeat.x=9;expect(b.emissive.getHex()).toBe(0);expect(b.map!.repeat.x).toBe(5);
  const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.PlaneGeometry(),a),new THREE.Mesh(new THREE.PlaneGeometry(),b));dispose(g);
 });
 it('keeps floor, wall and palette sources distinct and preserves texture options',()=>{
  const materials=[stoneMaterial(0x506170,'floor'),stoneMaterial(0x506170,'wall'),stoneMaterial(0x406170,'wall')];
  expect(new Set(materials.map(m=>m.map!.source)).size).toBe(3);
  for(const m of materials){expect(m.map!.colorSpace).toBe(THREE.SRGBColorSpace);expect(m.normalMap!.anisotropy).toBe(4);expect(m.normalMap!.wrapS).toBe(THREE.RepeatWrapping);expect(m.normalScale.toArray()).toEqual([.6,.6]);}
  const g=new THREE.Group();for(const material of materials)g.add(new THREE.Mesh(new THREE.PlaneGeometry(),material));dispose(g);
 });
 it('does not mark shared pixels dirty when only the next room repeat settings change',()=>{
  const a=stoneMaterial(0x506170,'wall',2,3),versions=[a.map!,a.normalMap!,a.roughnessMap!,a.aoMap!].map(t=>t.source.version),b=stoneMaterial(0x506170,'wall',5,7);
  expect([b.map!,b.normalMap!,b.roughnessMap!,b.aoMap!].map(t=>t.source.version)).toEqual(versions);expect(b.map!.version).toBeGreaterThan(0);expect(b.normalMap!.version).toBeGreaterThan(0);
  const g=new THREE.Group();g.add(new THREE.Mesh(new THREE.PlaneGeometry(),a),new THREE.Mesh(new THREE.PlaneGeometry(),b));dispose(g);
 });
});
