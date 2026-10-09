import * as THREE from 'three';
import type { RunState } from '../core/model';
import { currentRoom } from '../core/dungeon';
import { SCALE, wx, wz } from './world-space';
import { box, orb, ring } from './scene-primitives';
import { PORTAL } from '../core/portal';
import { ABSORB } from '../core/shadow-absorb';

type ObjectFor=(key:string,create:()=>THREE.Group)=>THREE.Group;
export function paintRemainingEffects(s:RunState,reduced:boolean,object:ObjectFor){
 for(const p of currentRoom(s)?.pickups ?? []){
  const g=object(`pickup-${p.id}`,()=>{const g=new THREE.Group();
   if(p.kind==='gold'){for(let i=0;i<3;i++)box(g,.24,.065,.24,(i%2)*.13-.06,.07+i*.07,0,0xe2be67,0x534015);}
   else{const vial=orb(g,.14,0,.22,0,0x8fc3a0,0x255b39);vial.scale.set(.7,1.5,.7);box(g,.09,.05,.09,0,.41,0,0xd7ccb2);}
   ring(g,.32,p.kind==='gold'?0xebc878:0x94d4ab);return g;});
  g.position.set(wx(p.x),.035,wz(p.y));g.rotation.y=reduced?0:s.tick*.012;
 }
 if(s.portals){const v=s.portals;for(const [i,p] of [v.first,v.second].entries())if(p){
  const g=object(`portal-${v.id}-${i}-${!!v.second}`,()=>{const g=new THREE.Group();const radius=PORTAL.radius*SCALE;
   const halo=new THREE.Mesh(new THREE.TorusGeometry(radius,.035,8,24),new THREE.MeshBasicMaterial({color:v.second?0xaa94e8:0xdbcaa3}));halo.position.y=PORTAL.height*SCALE/2;halo.scale.y=PORTAL.height*SCALE/(radius*2);g.add(halo);
   ring(g,.45,v.second?0xaa94e8:0xdbcaa3);return g;});
  g.position.set(wx(p.x),.035,wz(p.y));g.rotation.y=reduced?0:s.tick*.01;
 }}
 if(s.absorption){const g=object('black-sun-channel',()=>{const g=new THREE.Group();ring(g,ABSORB.range*SCALE,0xb5a2e0);orb(g,.17,0,.85,0,0x171020,0x483465);return g;});
  g.position.set(wx(s.player.x),.03,wz(s.player.y));g.rotation.y=reduced?0:s.tick*.02;
 }
}
