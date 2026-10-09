import { describe,expect,it } from 'vitest';
import { createDungeon,currentRoom,adjacentRooms } from '../src/core/dungeon';
import { createDungeonRun,travel,step,emptyInput } from '../src/core/simulation';
import { roomInfo } from '../src/core/expedition';
import { validRun } from '../src/persistence/save-validation';
import 'fake-indexeddb/auto';
import { SaveStore,defaultSettings } from '../src/persistence/save';
import { damageEnemy } from '../src/core/combat';
import { createBoss } from '../src/core/boss';
import { enterNextRegion } from '../src/core/region';
import { beginGrowthRun,emptyInvestment,defaultProfile,recordGrowth } from '../src/core/growth';
import { chooseRelic } from '../src/core/expedition';
import { puppetTarget } from '../src/core/allegiance';
function regionRun(region:1|2|3){const s=createDungeonRun(42,3);beginGrowthRun(s,emptyInvestment(),`waves-${region}`);for(let r=1;r<region;r++){s.expedition!.room=8;const n=currentRoom(s)!;n.visited=n.cleared=true;s.boss=createBoss(s);s.boss.hp=0;s.phase='cleared';enterNextRegion(s);}return s;}
function finishWave(s:ReturnType<typeof createDungeonRun>){s.phase='combat';s.readyTicks=0;for(let i=0;i<48&&s.enemies.some(e=>e.spawnTicks);i++)step(s,emptyInput());for(const e of s.enemies)damageEnemy(s,e,1000);step(s,emptyInput());}

describe('new elite and wave departures',()=>{
 it('adds a thirteenth optional elite room while preserving old versions',()=>{
  expect(createDungeon(42).rooms).toHaveLength(11);expect(createDungeon(42,2).rooms).toHaveLength(12);
  const d=createDungeon(42,3);expect(d.rooms).toHaveLength(13);expect(d.rooms[12].kind).toBe('elite');
 });
 it('creates region-scaled waves only in new terrain',()=>{
  const s=createDungeonRun(42,3);s.expedition!.room=2;s.expedition!.region=2;
  expect(roomInfo(s).waves).toHaveLength(2);const old=createDungeonRun(42,2);old.expedition!.room=2;old.expedition!.region=2;expect(roomInfo(old).waves).toHaveLength(1);
 });
 it('keeps a new departure valid for saving',()=>{expect(validRun(createDungeonRun(42,3))).toBe(true);});
 it('keeps elite branches optional, every room connected and the boss at the farthest leaf across seeds',()=>{
  for(let seed=1;seed<=160;seed++){
   const s=createDungeonRun(seed*7919,3),rooms=s.expedition!.dungeon!.rooms,elite=rooms[12];
   expect(validRun(s),`seed ${seed}`).toBe(true);expect(adjacentRooms(s,12)).toHaveLength(1);expect(adjacentRooms(s,12)[0].room.kind).toBe('combat');
   const distance=new Map([[0,0]]),queue=[rooms[0]];
   for(const from of queue)for(const {room} of adjacentRooms(s,from.id))if(!distance.has(room.id)){distance.set(room.id,distance.get(from.id)!+1);queue.push(room);}
   expect(distance.size).toBe(13);expect(adjacentRooms(s,8)).toHaveLength(1);expect(distance.get(8)).toBe(Math.max(...distance.values()));
   expect(rooms.filter(r=>r.mainReward)).toHaveLength(1);
   const withoutElite=rooms.filter(r=>r.id!==elite.id);const reached=new Set([0]),remaining=[withoutElite[0]];
   for(const from of remaining)for(const room of withoutElite)if(!reached.has(room.id)&&Math.abs(from.x-room.x)+Math.abs(from.y-room.y)===1){reached.add(room.id);remaining.push(room);}
   expect(reached.size).toBe(12);
  }
 });
 it('keeps doors and rewards locked until every wave finishes, including a reload during spawn warning',async()=>{
  const s=regionRun(2),door=adjacentRooms(s).find(d=>d.room.kind==='combat')!;travel(s,door.direction);const node=currentRoom(s)!;s.player.hp=50;
  expect(s.enemies.length).toBeLessThanOrEqual(8);finishWave(s);expect(s.wave).toBe(2);expect(s.phase).toBe('combat');expect(node.cleared).toBe(false);expect(node.pickups).toBeUndefined();expect(recordGrowth(defaultProfile(),s).rooms).toEqual([]);
  expect(s.enemies.every(e=>e.spawnTicks===48)).toBe(true);const hp=s.enemies[0].hp;damageEnemy(s,s.enemies[0],999);expect(s.enemies[0].hp).toBe(hp);
  expect(validRun(s)).toBe(true);const store=new SaveStore('wave-reload');await store.load();await store.save(s,defaultSettings());const restored=(await store.load())!.run!;
  for(let i=0;i<25;i++){step(s,emptyInput());step(restored,emptyInput());}expect(restored).toEqual(s);finishWave(s);expect(node.cleared).toBe(true);expect(node.pickups?.find(p=>p.kind==='gold')?.amount).toBe(8);expect(validRun(s)).toBe(true);
 });
 it.each([1,2,3] as const)('provides the region %i elite only on its second wave and pays once',region=>{
  const s=regionRun(region),rooms=s.expedition!.dungeon!.rooms,elite=rooms[12],from=rooms.find(r=>Math.abs(r.x-elite.x)+Math.abs(r.y-elite.y)===1)!;from.visited=from.cleared=true;s.expedition!.room=from.id;
  travel(s,adjacentRooms(s).find(d=>d.room.id===12)!.direction);finishWave(s);const boss=s.enemies.find(e=>e.elite)!;expect(boss.kind).toBe(['guard','chainhound','heartguard'][region-1]);expect(s.enemies.length).toBeLessThanOrEqual(6);expect(puppetTarget(s,boss)).toBeUndefined();expect(validRun(s)).toBe(true);
  finishWave(s);expect(s.phase).toBe('cleared');expect(elite.pickups?.[0].amount).toBe(20);expect(elite.reward!.candidates.length).toBeGreaterThan(0);expect(recordGrowth(defaultProfile(),s).rooms.some(r=>r.room===12)).toBe(false);
  chooseRelic(s,'skip');expect(validRun(s)).toBe(true);const gold=s.gold;step(s,emptyInput());expect(s.gold).toBe(gold);
 });
 it('rejects fabricated wave plans, out-of-range wave indices and elite flags in ordinary rooms',()=>{
  const s=createDungeonRun(42,3);travel(s,adjacentRooms(s).find(d=>d.room.kind==='combat')!.direction);expect(validRun(s)).toBe(true);
  const a=structuredClone(s);currentRoom(a)!.encounter!.waves[0][0].kind='readerstatue';expect(validRun(a)).toBe(false);
  const b=structuredClone(s);b.wave=9;expect(validRun(b)).toBe(false);const c=structuredClone(s);c.enemies[0].elite=true;expect(validRun(c)).toBe(false);
 });
 it('loads completed second-region encounters when moving to the third region',()=>{
  const s=regionRun(2);travel(s,adjacentRooms(s).find(d=>d.room.kind==='combat')!.direction);while(s.phase==='ready'||s.phase==='combat')finishWave(s);if(currentRoom(s)?.reward?.choice===null)chooseRelic(s,'skip');
  s.expedition!.room=8;const node=currentRoom(s)!;node.visited=node.cleared=true;s.boss=createBoss(s);s.boss.hp=0;s.phase='cleared';expect(enterNextRegion(s)).toBe(true);expect(validRun(s)).toBe(true);
 });
 it('replays a completed multi-wave room once without extra rewards and saves a replay death',async()=>{
  const s=createDungeonRun(42,3);beginGrowthRun(s,emptyInvestment(),'v3-replay',false,['R48']);
  const altar=s.expedition!.dungeon!.rooms[9];altar.visited=altar.cleared=true;s.expedition!.room=9;s.phase='cleared';altar.reward={room:9,candidates:['R48'],choice:null,slots:2,revision:1};expect(chooseRelic(s,'R48',1)).toBe(true);expect(validRun(s)).toBe(true);
  s.expedition!.room=0;const door=adjacentRooms(s).find(d=>d.room.kind==='combat')!;expect(travel(s,door.direction)).toBe(true);const node=currentRoom(s)!;
  while(s.phase==='ready'||s.phase==='combat')finishWave(s);if(node.reward?.choice===null)chooseRelic(s,'skip');const roster=structuredClone(node.firstRoster!);
  const replay=()=>{expect(travel(s,adjacentRooms(s).find(d=>d.room.id===0)!.direction)).toBe(true);expect(travel(s,door.direction)).toBe(true);};replay();
  expect(s.enemies).toHaveLength(2);expect(s.enemies.map(e=>[e.kind,e.maxHp])).toEqual(roster.slice(0,2).map(e=>[e.kind,e.maxHp]));expect(roomInfo(s).waves).toHaveLength(1);
  s.player.hp=50;const kills=s.stats.kills,gold=s.gold;finishWave(s);expect(s.phase).toBe('explore');expect(s.wave).toBe(1);expect(s.replay).toBeUndefined();expect(s.stats.kills).toBe(kills);expect(s.gold).toBe(gold);expect(s.player.hp).toBe(50);expect(node.firstRoster).toEqual(roster);expect(node.pickups).toHaveLength(0);
  replay();s.phase='combat';s.readyTicks=0;s.player.hp=1;s.player.invulnerable=0;s.bullets.push({id:s.nextId++,x:s.player.x,y:s.player.y,vx:0,vy:0,life:30,owner:'enemy',damage:10});step(s,emptyInput());expect(s.phase).toBe('dead');expect(validRun(s)).toBe(true);
  const name='v3-replay-death',store=new SaveStore(name);await store.load();const prior=await store.save(null,defaultSettings());prior.profile!.bossDefeated=prior.profile!.priestDefeated=prior.profile!.heartDefeated=true;prior.profile!.curseFreeWin=true;
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open(name,1);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  await new Promise<void>((resolve,reject)=>{const tx=db.transaction('save','readwrite');tx.objectStore('save').put(prior,'current');tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});db.close();await store.load();
  await store.save(s,defaultSettings());expect((await store.load())!.run).toEqual(s);
 });
});
