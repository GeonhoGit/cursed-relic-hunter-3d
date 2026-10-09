import { describe, expect, it } from 'vitest';
import { createDungeonRun, emptyInput, step, travel } from '../src/core/simulation';
import { adjacentRooms, createDungeon, currentRoom, knownRooms, revealedRoomKind } from '../src/core/dungeon';
import { canAcquireRelic, canOfferRelic } from '../src/core/relic-acquisition';
import { advanceProjectiles, damageEnemy } from '../src/core/combat';
import { useAuxiliary } from '../src/core/auxiliary';
import { enemyTarget } from '../src/core/allegiance';
import { validRun } from '../src/persistence/save-validation';
import { beginGrowthRun, emptyInvestment } from '../src/core/growth';
import { checkGround, pitDodgeAvailable, unlockDoor } from '../src/core/terrain';
import { BOUNDS } from '../src/core/model';
import { chooseRelic, prepareReward, rerollReward } from '../src/core/expedition';
import { grantRelic } from '../src/core/relic-acquisition';
import { crownPlan } from '../src/core/sealed-crown';
import { isCurse, RELIC_IDS } from '../src/core/relics';
import { startAbsorption } from '../src/core/shadow-absorb';
import { safeAnchorFloor } from '../src/core/anchor';
import { stoneWallFailure } from '../src/core/masonry';
import { scarecrowFailure } from '../src/core/scarecrow';
import { roomLayout } from '../src/core/room-layout';
import { regionDungeonSeed, ROOM_STRUCTURES } from '../src/core/room-structures';
import { spikeTraps } from '../src/core/traps';
import { createBoss } from '../src/core/boss';
import { enterNextRegion } from '../src/core/region';
import { buyFromShop, refreshShop } from '../src/core/shop';
import { reviveContract } from '../src/core/curses';

describe('remaining relic integration',()=>{
 it('keeps every moving hazard outside the new structures and optional pits',()=>{
  for(const region of [2,3] as const)for(let seed=0;seed<24;seed++){
   const s=createDungeonRun(seed,2);s.expedition!.region=region;s.expedition!.dungeon=createDungeon(regionDungeonSeed(seed,region),2);s.phase='combat';
   for(let id=1;id<=5;id++){s.expedition!.room=id;for(const tick of [0,258,334,410,516,592,668]){s.trapTicks=tick;
    for(const trap of spikeTraps(s))for(const box of [...roomLayout(s).obstacles,...(currentRoom(s)?.pits ?? [])])expect(trap.x<box.x+box.w&&trap.x+trap.w>box.x&&trap.y<box.y+box.h&&trap.y+trap.h>box.y).toBe(false);
   }}
  }
 });
 it('keeps old map labels while only new terrain hides undiscovered room types',()=>{
  const old=createDungeonRun(17),fresh=createDungeonRun(17,2);
  expect(knownRooms(old).every(r=>revealedRoomKind(old,r)===r.kind)).toBe(true);
  expect(knownRooms(fresh).some(r=>!r.visited&&revealedRoomKind(fresh,r)==='unknown')).toBe(true);
 });
 it('uses exact fall damage without triggering retaliation or a second evacuation',()=>{
  const s=createDungeonRun(17,2);s.expedition!.room=1;const room=currentRoom(s)!;room.visited=true;room.pits=[{x:500,y:140,w:80,h:60}];s.phase='combat';
  s.expedition!.relics=['R23','R24','R53'];s.expedition!.acquired=[...s.expedition!.relics];s.player.x=540;s.player.y=170;s.player.safeGround={x:490,y:170};
  s.enemies=[{id:s.nextId++,kind:'rat',x:450,y:170,hp:100,maxHp:100,angle:0,mode:'move',timer:0,targetX:0,targetY:0,flash:0}];
  step(s,emptyInput());expect(s.player.hp).toBe(90);expect(s.enemies[0].hp).toBe(100);expect(s.player.thornsCooldown).toBeUndefined();expect(room.featherUsed).toBeUndefined();expect(s.player.x).toBe(490);
 });
 it('clears pit dodge extension immediately when revival takes its relic',()=>{
  const s=createDungeonRun(17,2);beginGrowthRun(s,emptyInvestment(),'lost-platform',false,['R28']);
  for(const [room,id] of [[6,'R28'],[7,'R37'],[9,'R38']] as const){const node=s.expedition!.dungeon!.rooms[room];node.visited=node.cleared=true;s.expedition!.room=room;s.phase='cleared';node.reward={room,candidates:room===9?['R38','R43']:[id],choice:null};expect(chooseRelic(s,id)).toBe(true);}
  s.expedition!.room=1;currentRoom(s)!.visited=true;s.phase='combat';s.player.dodgeRemaining=.2;s.player.pitDodge=true;expect(validRun(s)).toBe(true);
  s.player.hp=0;expect(reviveContract(s)).toBe(true);expect(s.revival!.lost).toContain('R28');expect(s.player.pitDodge).toBeUndefined();expect(validRun(s)).toBe(true);
 });
 it('keeps an exhausted final altar traversable and its empty offer saveable',()=>{
  const s=createDungeonRun(42,2);beginGrowthRun(s,emptyInvestment(),'empty-altar');
  const altar=(id:'R39'|'R41')=>{const node=s.expedition!.dungeon!.rooms[9];s.expedition!.room=9;node.visited=node.cleared=true;s.phase='cleared';node.reward={room:9,candidates:[id,'R43'],choice:null};expect(chooseRelic(s,id)).toBe(true);};
  const shop=(id:'R40'|'R42'|'R43')=>{const node=s.expedition!.dungeon!.rooms[10];s.expedition!.room=10;node.visited=node.cleared=true;s.phase='explore';s.gold=100;refreshShop(s);node.shop!.slots[3].relic=id;expect(buyFromShop(s,3,node.shop!.revision)).toBe('bought');};
  const next=()=>{s.expedition!.room=8;const node=currentRoom(s)!;node.visited=node.cleared=true;s.phase='cleared';s.boss=createBoss(s);s.boss.hp=0;expect(enterNextRegion(s)).toBe(true);};
  altar('R39');shop('R40');next();altar('R41');shop('R42');next();shop('R43');
  delete s.boss;s.expedition!.room=9;const node=currentRoom(s)!;node.visited=node.cleared=true;s.phase='cleared';prepareReward(s);
  expect(node.reward!.candidates).toEqual([]);expect(validRun(s)).toBe(true);expect(chooseRelic(s,'skip')).toBe(true);expect(validRun(s)).toBe(true);
 });
 it('retains each generated room structure in the new terrain version',()=>{
  const s=createDungeonRun(17,2);s.expedition!.room=1;const r=currentRoom(s)!;
  expect(roomLayout(s).obstacles).toEqual(ROOM_STRUCTURES[r.structure!].obstacles);
 });
 it('keeps fresh twelve-room snapshots valid and rejects malformed new terrain',()=>{
  const s=createDungeonRun(17,2);expect(validRun(s)).toBe(true);
  s.expedition!.dungeon!.rooms[11].locked='bad' as never;expect(validRun(s)).toBe(false);
 });
 it('opens a nearby optional lock once and keeps acquisition history',()=>{
  const s=createDungeonRun(17,2),rooms=s.expedition!.dungeon!.rooms,locked=rooms[11];
  const parent=rooms.find(r=>Math.abs(r.x-locked.x)+Math.abs(r.y-locked.y)===1)!;
  parent.visited=parent.cleared=true;s.expedition!.room=parent.id;s.expedition!.relics=['R35'];s.expedition!.acquired=['R35'];
  s.player.x=320+(locked.x-parent.x)*(BOUNDS.w/2-20);s.player.y=183+(locked.y-parent.y)*(BOUNDS.h/2-20);
  expect(unlockDoor(s)).toBe(true);expect(locked.locked).toBe(false);expect(locked.keyOpened).toBe(true);
  expect(s.expedition!.relics).not.toContain('R35');expect(s.expedition!.acquired).toContain('R35');expect(unlockDoor(s)).toBe(false);
 });
 it('only extends a real pit crossing with a safe landing and recovers a failed landing once',()=>{
  const s=createDungeonRun(17,2),r=s.expedition!.dungeon!.rooms[1];s.expedition!.room=1;r.pits=[{x:500,y:140,w:80,h:60}];
  s.expedition!.relics=['R28'];s.player.x=490;s.player.y=170;s.player.safeGround={x:490,y:170};
  expect(pitDodgeAvailable(s,{x:1,y:0})).toBe(true);expect(pitDodgeAvailable(s,{x:0,y:1})).toBe(false);
  s.player.x=540;expect(checkGround(s)?.damage).toBe(10);expect(s.player.x).toBe(490);expect(checkGround(s)).toBeNull();
 });
 it('reveals and replays first-cleared enemies without repeat gold, kills or healing',()=>{
  const s=createDungeonRun(17,2);const first=adjacentRooms(s).find(d=>d.room.kind==='combat')!;travel(s,first.direction);
  const room=currentRoom(s)!;s.phase='combat';s.enemies.forEach(e=>e.hp=0);step(s,emptyInput());expect(room.firstRoster!.length).toBeGreaterThanOrEqual(5);
  room.reward={room:room.id,candidates:[],choice:'skip'};s.phase='explore';s.expedition!.relics=['R48','R54'];s.expedition!.acquired=['R48','R54'];
  const home=adjacentRooms(s).find(d=>d.room.id===0)!;travel(s,home.direction);travel(s,first.direction);
  expect(s.replay?.room).toBe(room.id);expect(s.phase).toBe('ready');expect(s.enemies).toHaveLength(2);
  const kills=s.stats.kills,gold=s.gold;s.player.hp=50;s.phase='combat';for(const e of s.enemies)damageEnemy(s,e,999);step(s,emptyInput());
  expect(s.stats.kills).toBe(kills);expect(s.gold).toBe(gold);expect(s.player.hp).toBe(50);expect(room.cleared).toBe(true);expect(s.replay).toBeUndefined();
 });
 it('excludes only new lantern offers while inverted map is held',()=>{
  const s=createDungeonRun(17,2);s.expedition!.relics=['R48'];s.expedition!.acquired=['R48'];
  expect(canOfferRelic(s,'R31')).toBe(false);expect(canAcquireRelic(s,'R31')).toBe(true);
 });
 it('rejects terrain-dependent relics in compatible old runs even when unlocked',()=>{
  const s=createDungeonRun(17);beginGrowthRun(s,emptyInvestment(),'old',false,['R28','R35','R47']);
  for(const id of ['R28','R35','R47'] as const)expect(canOfferRelic(s,id)).toBe(false);
 });
 it('routes swept bullets through portals without hitting bodies in the teleport gap',()=>{
  const s=createDungeonRun(17);s.phase='combat';s.expedition!.relics=['R40'];s.expedition!.acquired=['R40'];s.tick=12;
  s.portals={id:20,first:{x:100,y:180},second:{x:500,y:180},ticks:360};
  s.enemies=[{id:21,kind:'rat',x:300,y:180,hp:100,maxHp:100,angle:0,mode:'move',timer:0,targetX:0,targetY:0,flash:0},
  {id:22,kind:'rat',x:540,y:180,hp:100,maxHp:100,angle:0,mode:'move',timer:0,targetX:0,targetY:0,flash:0}];
  s.bullets=[{id:23,x:80,y:180,vx:18000,vy:0,life:60,owner:'player',damage:10}];
  advanceProjectiles(s);expect(s.enemies[0].hp).toBe(100);expect(s.enemies[1].hp).toBe(90);
 });
 it('equips the new auxiliary skills and starts their actual effects',()=>{
  const s=createDungeonRun(17);s.expedition!.relics=['R13','R40','R42'];s.expedition!.acquired=[...s.expedition!.relics];
  s.player.equippedAux='R40';expect(useAuxiliary(s,{x:350,y:183})).toBe(true);expect(s.portals).toBeDefined();
  s.player.equippedAux='R42';expect(useAuxiliary(s,s.player)).toBe(true);expect(s.absorption?.ticks).toBe(90);
 });
 it('blocks new player targets in stealth while retaining a committed attack',()=>{
  const s=createDungeonRun(17);s.player.stealthed=true;const e={id:5,kind:'archer' as const,x:200,y:183,hp:10,maxHp:10,angle:0,mode:'move' as const,timer:0,targetX:320,targetY:183,flash:0};
  expect(enemyTarget(s,e)).toBeUndefined();e.mode='windup' as never;expect(enemyTarget(s,e)).toBe(s.player);
 });
 it('does not acquire stealth on an attack tick at the quiet threshold',()=>{
  const s=createDungeonRun(17);s.expedition!.relics=['R41'];s.expedition!.acquired=['R41'];s.player.quietTicks=89;
  step(s,{...emptyInput(),fire:true});expect(s.player.stealthed).toBeUndefined();expect(s.player.dodgeLock).toBeUndefined();expect(s.player.quietTicks).toBe(0);
 });
 it('reserves a double reward, preserves selected slots, and permanently forgoes B',()=>{
  const s=createDungeonRun(17,2);beginGrowthRun(s,emptyInvestment(),'crown',false,['R47']);
  const plan=crownPlan(s)!;expect(grantRelic(s,'R47')).toBe(true);expect(s.crown?.ids).toEqual(plan.ids);
  expect(canOfferRelic(s,plan.ids[0])).toBe(false);const room=s.expedition!.dungeon!.rooms[plan.a.room];s.expedition!.room=room.id;room.visited=room.cleared=true;s.phase='cleared';
  prepareReward(s);expect(room.reward?.candidates.slice(0,2)).toEqual(plan.ids);
  const first=room.reward!.candidates[0];expect(chooseRelic(s,first)).toBe(true);expect(s.phase).toBe('cleared');expect(room.reward!.selectedIds).toEqual([first]);
  rerollReward(s);expect(room.reward!.candidates).toContain(first);expect(chooseRelic(s,first)).toBe(false);
  expect(chooseRelic(s,room.reward!.candidates[1])).toBe(true);expect(s.phase).toBe('explore');expect(s.crown!.state).toBe('complete');
 });
 it('gives a real gold alternative when ordinary candidates are exhausted',()=>{
  const s=createDungeonRun(17),room=s.expedition!.dungeon!.rooms[6];s.expedition!.room=6;room.visited=room.cleared=true;s.phase='cleared';
  s.expedition!.acquired=RELIC_IDS.filter(id=>!isCurse(id));s.expedition!.relics=[...s.expedition!.acquired];prepareReward(s);
  expect(room.reward!.candidates).toHaveLength(0);expect(chooseRelic(s,'gold')).toBe(true);expect(s.gold).toBe(15);
 });
 it('does not let a new absorption channel continue an existing dodge',()=>{
  const s=createDungeonRun(17);s.expedition!.relics=['R13','R42'];s.player.dodgeRemaining=.1;
  expect(startAbsorption(s)).toBe(false);
 });
 it('prevents anchors, walls and decoys from being installed on a pit',()=>{
  const s=createDungeonRun(17,2);s.expedition!.room=1;s.expedition!.dungeon!.rooms[1].pits=[{x:500,y:140,w:80,h:60}];
  s.expedition!.relics=['R16','R18','R26'];s.player.x=460;s.player.y=170;
  expect(safeAnchorFloor(s,{x:540,y:170})).toBe(false);expect(stoneWallFailure(s,{x:540,y:170})).not.toBeNull();expect(scarecrowFailure(s,{x:540,y:170})).not.toBeNull();
 });
 it('crosses eighty-unit pits at 108 units, while a normal dodge falls only once',()=>{
  for(const relics of [[],['R28']] as const){const s=createDungeonRun(17,2);s.expedition!.room=1;const r=currentRoom(s)!;r.visited=r.cleared=true;r.pits=[{x:500,y:140,w:80,h:60}];
    s.player.x=490;s.player.y=170;s.player.safeGround={x:490,y:170};s.expedition!.relics=[...relics];
    step(s,{...emptyInput(),moveX:1,dodge:true});for(let i=0;i<14;i++)step(s,emptyInput());
    expect(s.player.hp).toBe(relics.length?100:90);expect(s.player.x).toBeCloseTo(relics.length?598:490);
    for(let i=0;i<50;i++)step(s,emptyInput());expect(s.player.hp).toBe(relics.length?100:90);
  }
 });
});
