import 'fake-indexeddb/auto';
import {describe,expect,it} from 'vitest';
import {createDungeonRun,emptyInput,step,travel} from '../src/core/simulation';
import {adjacentRooms,currentRoom} from '../src/core/dungeon';
import {buildEncounter} from '../src/core/encounters';
import {roomEncounter,chooseRelic} from '../src/core/expedition';
import {beginGrowthRun,emptyInvestment} from '../src/core/growth';
import {createBoss} from '../src/core/boss';
import {enterNextRegion} from '../src/core/region';
import {damageEnemy} from '../src/core/combat';
import {ENEMY_HEALTH} from '../src/core/enemy-balance';
import {SaveStore,defaultSettings} from '../src/persistence/save';
import {validRun,validRecord} from '../src/persistence/save-validation';
import type {Enemy,RunState} from '../src/core/model';

function enterElite(region:1|2|3){
 const s=createDungeonRun(42,3);beginGrowthRun(s,emptyInvestment(),`elite-balance-${region}`);
 for(let r=1;r<region;r++){s.expedition!.room=8;const node=currentRoom(s)!;node.visited=node.cleared=true;s.boss=createBoss(s);s.boss.hp=0;s.phase='cleared';enterNextRegion(s);}
 const node=s.expedition!.dungeon!.rooms[12],from=s.expedition!.dungeon!.rooms.find(r=>Math.abs(r.x-node.x)+Math.abs(r.y-node.y)===1)!;from.visited=from.cleared=true;s.expedition!.room=from.id;
 expect(travel(s,adjacentRooms(s).find(d=>d.room.id===12)!.direction)).toBe(true);return s;
}
function finishWave(s:RunState){s.phase='combat';s.readyTicks=0;for(let i=0;i<48&&s.enemies.some(e=>e.spawnTicks);i++)step(s,emptyInput());for(const e of s.enemies)damageEnemy(s,e,10000);step(s,emptyInput());}
function legacyElite(region:1|2|3){const s=enterElite(region),node=currentRoom(s)!;delete node.encounter;const plan=roomEncounter(s,1)!;node.encounter=plan;
 s.enemies=plan.waves[0].map((spec,i)=>({...s.enemies[i%s.enemies.length],kind:spec.kind,id:s.nextId++,hp:ENEMY_HEALTH[spec.kind],maxHp:ENEMY_HEALTH[spec.kind]}));return s;
}
async function putRecord(name:string,record:unknown){const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(name,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await new Promise<void>((resolve,reject)=>{const tx=db.transaction('save','readwrite');tx.objectStore('save').put(record,'current');tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});db.close();}

describe('elite risk and versioned encounter balance',()=>{
 it.each([1,2,3] as const)('strengthens new region %i support waves while keeping one elite and the six-body limit',region=>{
  const roster:Enemy['kind'][]=['rat','archer'];const min=region===3?4:3;
  for(let seed=1;seed<=100;seed++){
   const plan=buildEncounter(seed,region,12,roster,true,2);expect(plan.balanceVersion).toBe(2);expect(plan.waves).toHaveLength(2);
   expect(plan.waves[0].length).toBeGreaterThanOrEqual(min);expect(plan.waves[0].length).toBeLessThanOrEqual(min+1);expect(plan.waves[0].every(e=>!e.elite)).toBe(true);
   expect(plan.waves[1].length).toBeGreaterThanOrEqual(min+1);expect(plan.waves[1].length).toBeLessThanOrEqual(min+2);expect(plan.waves[1].filter(e=>e.elite)).toHaveLength(1);expect(plan.waves[1].length).toBeLessThanOrEqual(6);
  }
 });
 it('leaves ordinary encounters and the legacy elite generator unchanged',()=>{
  const roster:Enemy['kind'][]=['guard','rat','archer'];expect(buildEncounter(42,3,2,roster,false,2)).toEqual(buildEncounter(42,3,2,roster));
  const old=buildEncounter(42,1,12,roster,true);expect(old.balanceVersion).toBeUndefined();expect(old.waves[0].length).toBeLessThanOrEqual(3);expect(old.waves[1].length).toBeLessThanOrEqual(4);
 });
 it.each([1,2,3] as const)('saves the new region %i plan and waits for its last wave before paying the unchanged reward',async region=>{
  const s=enterElite(region),node=currentRoom(s)!;expect(node.encounter!.balanceVersion).toBe(2);expect(validRun(s)).toBe(true);finishWave(s);
  expect(s.wave).toBe(2);expect(node.cleared).toBe(false);expect(node.pickups).toBeUndefined();expect(s.enemies.length).toBeLessThanOrEqual(6);
  const store=new SaveStore(`elite-balance-new-${region}`);await store.load();await store.save(s,defaultSettings());expect((await store.load())!.run).toEqual(s);
  finishWave(s);expect(node.pickups?.[0].amount).toBe(20);expect(node.reward?.choice).toBeNull();expect(chooseRelic(s,'skip')).toBe(true);expect(validRun(s)).toBe(true);
 });
 it('reads a prototype0.15 active elite room and preserves both of its already-determined legacy waves',async()=>{
  const s=legacyElite(1),plan=structuredClone(currentRoom(s)!.encounter!);expect(validRun(s)).toBe(true);const name='elite-balance-legacy',store=new SaveStore(name);await store.load();const old=await store.save(s,defaultSettings());old.content='prototype-0.15';expect(validRecord(old)).toBe(true);await putRecord(name,old);
  const restored=(await store.load())!.run!;expect(currentRoom(restored)!.encounter).toEqual(plan);finishWave(restored);expect(restored.enemies).toHaveLength(plan.waves[1].length);expect(currentRoom(restored)!.encounter).toEqual(plan);expect(validRun(restored)).toBe(true);
  const saved=await store.save(restored,defaultSettings());expect(saved.content).toBe('prototype-0.16');expect((await store.load())!.run).toEqual(restored);
 });
 it('validates completed old elite plans in regional archives after moving onward',()=>{
  const s=legacyElite(2);finishWave(s);finishWave(s);chooseRelic(s,'skip');s.expedition!.room=8;const node=currentRoom(s)!;node.visited=node.cleared=true;s.boss=createBoss(s);s.boss.hp=0;s.phase='cleared';expect(enterNextRegion(s)).toBe(true);expect(validRun(s)).toBe(true);
  const unknown=structuredClone(s);Object.assign(unknown.expedition!.previousDungeon!.rooms[12].encounter!,{balanceVersion:3});expect(validRun(unknown)).toBe(false);
  const changed=structuredClone(s);changed.expedition!.previousDungeon!.rooms[12].encounter!.waves[0][0].elite=true;expect(validRun(changed)).toBe(false);
 });
 it('rejects unknown balance tags and an elite-only tag on an ordinary combat plan',()=>{
  const s=enterElite(1);Object.assign(currentRoom(s)!.encounter!,{balanceVersion:3});expect(validRun(s)).toBe(false);
  const ordinary=createDungeonRun(42,3);travel(ordinary,adjacentRooms(ordinary).find(d=>d.room.kind==='combat')!.direction);Object.assign(currentRoom(ordinary)!.encounter!,{balanceVersion:2});expect(validRun(ordinary)).toBe(false);
 });
});
