import 'fake-indexeddb/auto';
import {describe,expect,it} from 'vitest';
import {createRun,createDungeonRun,emptyInput,step} from '../src/core/simulation';
import {WEAPONS} from '../src/core/weapons';
import {defaultProfile} from '../src/core/growth';
import {SaveStore,defaultSettings} from '../src/persistence/save';
import {validRecord} from '../src/persistence/save-validation';
import {EYE_HEIGHT,BODY_HEIGHT} from '../src/core/fps-geometry';
import type {Enemy,WeaponId} from '../src/core/model';

function range(weapon:WeaponId,distance:number,hp=100){
 const s=createRun(42);s.phase='explore';s.weapon=weapon;s.player.x=96;s.player.y=180;
 const target:Enemy={id:s.nextId++,kind:'rat',x:96+distance,y:180,hp,maxHp:hp,angle:Math.PI,mode:'move',timer:0,targetX:96,targetY:180,flash:0};s.enemies=[target];
 const fire={...emptyInput(),fire:true,aimX:target.x,aimY:target.y,aimPitch:Math.atan2(BODY_HEIGHT.rat/2-EYE_HEIGHT,distance)};return{s,target,fire};
}
describe('approved weapon range and staff adjustments',()=>{
 it.each([[50,12.5],[100,7.5],[200,2.5]])('uses a 22-degree shotgun spread to deal %s-units range damage without strengthening every pellet', (distance,damage)=>{
  const{s,target,fire}=range('W02',distance);step(s,fire);for(let i=0;i<65;i++)step(s,emptyInput());expect(100-target.hp).toBeCloseTo(damage);expect(s.stats.shots).toBe(1);
 });
 it('keeps a four-metre stationary rat shotgun kill near the basic weapon while maintaining a range tradeoff',()=>{
  const times=(['W01','W02'] as const).map(weapon=>{const{s,target,fire}=range(weapon,100,30);while(target.hp>0&&s.tick<600)step(s,fire);expect(target.hp).toBe(0);return s.tick/60;});
  expect(times[1]).toBeLessThan(times[0]+.6);expect(WEAPONS.W02.interval).toBe(36);expect(WEAPONS.W02.damage).toBe(2.5);
 });
 it('gives the staff damage12 while keeping its cadence, reach and two-target piercing',()=>{
  const s=createRun(42);s.phase='explore';s.weapon='W04';s.player.x=96;s.player.y=180;
  s.enemies=[136,176].map((x):Enemy=>({id:s.nextId++,kind:'archer',x,y:180,hp:100,maxHp:100,angle:Math.PI,mode:'move',timer:0,targetX:96,targetY:180,flash:0}));
  step(s,{...emptyInput(),fire:true,aimX:300,aimY:180,aimPitch:0});for(let i=0;i<35;i++)step(s,emptyInput());
  expect(s.enemies.map(e=>e.hp)).toEqual([88,88]);expect(WEAPONS.W04.interval).toBe(42);expect(WEAPONS.W04.speed*75/60*.04).toBe(12.5);
 });
 it('restores an old staff shot at damage9 and only gives new shots the balanced damage12',async()=>{
  const name='staff-balance-legacy',store=new SaveStore(name);await store.load();const s=createDungeonRun(42,2);s.weapon='W04';step(s,{...emptyInput(),fire:true});s.bullets[0].damage=9;
  const old={schema:1,content:'prototype-0.15',revision:1,savedAt:'2026-10-09',run:s,settings:defaultSettings(),profile:defaultProfile()};expect(validRecord(old)).toBe(true);
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(name,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await new Promise<void>((resolve,reject)=>{const tx=db.transaction('save','readwrite');tx.objectStore('save').put(old,'current');tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});db.close();
  const restored=(await store.load())!.run!,oldId=restored.bullets[0].id;expect(restored.bullets[0].damage).toBe(9);restored.player.fireCooldown=0;step(restored,{...emptyInput(),fire:true});
  expect(restored.bullets.find(b=>b.id===oldId)?.damage).toBe(9);expect(restored.bullets.find(b=>b.id!==oldId)?.damage).toBe(12);await store.save(restored,defaultSettings());expect((await store.load())!.run).toEqual(restored);
 });
});
