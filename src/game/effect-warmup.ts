import * as THREE from 'three';
import {box,material} from './scene-primitives';

// Camera-local +Z is behind the eye. Submit clipped meshes once to prepare effect shaders, never visible pixels.
export function createEffectWarmup(){
 const group=new THREE.Group();group.name='effect-shader-warmup';group.position.z=1;
 const materials=[material(0xf5aa63,0x773319),new THREE.MeshBasicMaterial({transparent:true,opacity:.25,side:THREE.DoubleSide,depthWrite:false}),new THREE.MeshBasicMaterial({side:THREE.DoubleSide})];
 materials[0].transparent=true;materials[0].opacity=.65;
 for(const surface of materials){const mesh:THREE.Mesh=box(group,.001,.001,.001,0,0,0,0);(mesh.material as THREE.Material).dispose();mesh.material=surface;mesh.frustumCulled=false;mesh.castShadow=false;}
 group.visible=false;return group;
}
