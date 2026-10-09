import { AUXILIARY_IDS, BOUNDS, type CrownTarget, type RunState } from '../core/model';
import { currentRoom, createDungeon } from '../core/dungeon';
import { hasRelic, isCurse, RELIC_IDS } from '../core/relics';
import { regionDungeonSeed } from '../core/room-structures';
import { ENEMY_HEALTH } from '../core/enemy-balance';
import { PORTAL } from '../core/portal';
import { ABSORB, SHADOW } from '../core/shadow-absorb';
import { validEncounter } from './wave-validation';

const int=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
const point=(v:unknown):boolean=>!!v&&typeof v==='object'&&Number.isFinite((v as {x:number}).x)&&Number.isFinite((v as {y:number}).y)
  &&(v as {x:number}).x>=BOUNDS.x&&(v as {x:number}).x<=BOUNDS.x+BOUNDS.w&&(v as {y:number}).y>=BOUNDS.y&&(v as {y:number}).y<=BOUNDS.y+BOUNDS.h;
const ids=(v:unknown,max=57):boolean=>Array.isArray(v)&&v.length<=max&&new Set(v).size===v.length&&v.every(id=>RELIC_IDS.includes(id));
export function validRemainingRelics(s:RunState):boolean{
 const e=s.expedition,p=s.player,acquired=e?.acquired ?? [];
 if(p.safeGround!==undefined&&!point(p.safeGround))return false;
 if(p.pitDodge!==undefined&&(p.pitDodge!==true||!hasRelic(s,'R28')||p.dodgeRemaining<=0))return false;
 if(p.quietTicks!==undefined&&(!hasRelic(s,'R41')||!int(p.quietTicks,0,SHADOW.quiet)))return false;
 if(p.stealthed!==undefined&&(p.stealthed!==true||p.quietTicks!==SHADOW.quiet||!hasRelic(s,'R41')))return false;
 if(p.dodgeLock!==undefined&&(!acquired.includes('R41')||!int(p.dodgeLock,1,SHADOW.dodgeLock)))return false;
 if(s.notice!==undefined&&(typeof s.notice!=='string'||s.notice.length>240))return false;
 if(s.absorbEnergy!==undefined&&(!hasRelic(s,'R42')||!int(s.absorbEnergy,0,ABSORB.cap)))return false;
 if(s.absorption!==undefined&&(!s.absorption||!hasRelic(s,'R42')||!['combat','explore'].includes(s.phase)||!int(s.absorption.ticks,1,ABSORB.duration)||!int(s.absorption.absorbed,0,4)||!p.auxCooldowns?.R42))return false;
 if(p.cooldownCredits!==undefined&&(!p.cooldownCredits||typeof p.cooldownCredits!=='object'||Array.isArray(p.cooldownCredits)||!acquired.includes('R42')
   ||Object.entries(p.cooldownCredits).some(([id,n])=>!AUXILIARY_IDS.includes(id as never)||id==='R42'||!acquired.includes(id as never)||!int(n,1,1080))))return false;
 if(s.recoveryOrder!==undefined&&(!hasRelic(s,'R39')||!int(s.recoveryOrder,0,Number.MAX_SAFE_INTEGER)))return false;
 if(s.recoveryItems!==undefined&&(!hasRelic(s,'R39')||!Array.isArray(s.recoveryItems)||s.recoveryItems.length>3||new Set(s.recoveryItems.map(i=>i?.pickupId)).size!==s.recoveryItems.length
   ||s.recoveryItems.some((i,n)=>!i||typeof i.pickupId!=='string'||i.pickupId.length<1||i.pickupId.length>100||!['floor','shop'].includes(i.source)||i.healAmount!==(i.source==='floor'?10:15)
    ||!int(i.order,1,s.recoveryOrder ?? Number.MAX_SAFE_INTEGER)||n>0&&i.order<=s.recoveryItems![n-1].order)))return false;
 if(s.recoveryCast!==undefined&&(!s.recoveryCast||!hasRelic(s,'R39')||!['combat','explore'].includes(s.phase)||!int(s.recoveryCast.ticks,1,30)||s.recoveryItems?.[0]?.pickupId!==s.recoveryCast.pickupId))return false;
 if(s.portals!==undefined){const v=s.portals;if(!v||!hasRelic(s,'R40')||!['combat','explore'].includes(s.phase)||!int(v.id,1,s.nextId-1)||!point(v.first)
   ||!int(v.ticks,1,v.second?PORTAL.duration:PORTAL.firstDuration)||v.second&&(!point(v.second)||(p.auxCooldowns?.R40 ?? 0)+(p.cooldownCredits?.R40 ?? 0)<v.ticks+360))return false;}
 for(const b of s.bullets){
  if(b.portalTrips!==undefined&&(!acquired.includes('R40')||!int(b.portalTrips,1,2)||!int(b.portalPairId,1,s.nextId-1)||!int(b.portalLockUntil,0,s.tick+12)))return false;
  if(b.portalTrips===undefined&&(b.portalPairId!==undefined||b.portalLockUntil!==undefined))return false;
 }
 const region=e?.region ?? 1;
 for(const [d,r] of [[e?.dungeon,region],[e?.previousDungeon,region-1],[e?.earlierDungeon,1]] as const){
  if(!d)continue;const canonical=(d.layoutVersion ?? 0)>=2?createDungeon(regionDungeonSeed(s.seed,r),d.layoutVersion!):null;
  for(const node of d.rooms){
   if(!validEncounter({...s,expedition:{...e!,dungeon:d}},node,r as 1|2|3))return false;
   if(canonical){const expected=canonical.rooms[node.id];if(!expected||JSON.stringify(node.pits)!==JSON.stringify(expected.pits)||node.mainReward!==expected.mainReward
      ||(node.id===11?(typeof node.locked!=='boolean'||node.locked===false&&node.keyOpened!==true||node.keyOpened===true&&(!acquired.includes('R35')||node.locked)):(node.locked!==undefined||node.keyOpened!==undefined)))return false;
   }else if(node.pits!==undefined||node.mainReward!==undefined||node.locked!==undefined||node.keyOpened!==undefined)return false;
   if(node.firstRoster!==undefined&&(!Array.isArray(node.firstRoster)||node.kind!=='combat'||!node.visited||node.firstRoster.length<5||node.firstRoster.length>(d.layoutVersion===3?12:10)||node.firstRoster.some(e=>!e||!(e.kind in ENEMY_HEALTH)||e.maxHp!==ENEMY_HEALTH[e.kind])))return false;
   if(node.pickups!==undefined&&(!canonical||!node.cleared||!Array.isArray(node.pickups)||node.pickups.length>2||new Set(node.pickups.map(p=>p?.id)).size!==node.pickups.length
    ||node.pickups.some(p=>!p||typeof p.id!=='string'||!point(p)||(p.kind==='gold'?p.amount!==(node.kind==='boss'?40:node.kind==='elite'?20:8):p.kind!=='heal'||node.id!==3||p.amount!==10))))return false;
   const reward=node.reward;if(reward){if(reward.revision!==undefined&&!int(reward.revision,1,Number.MAX_SAFE_INTEGER)||reward.slots!==undefined&&!int(reward.slots,0,4))return false;
    if(reward.selectedIds!==undefined&&(!s.crown||r!==s.crown.a.region||node.id!==s.crown.a.room||!ids(reward.selectedIds,2)))return false;
   }
  }
 }
 if(s.replay!==undefined&&(!s.replay||s.replay.room!==e?.room||s.replay.region!==region||currentRoom(s)?.kind!=='combat'||!currentRoom(s)?.cleared||!currentRoom(s)?.firstRoster||!['ready','combat','dead'].includes(s.phase)))return false;
 if(s.crown!==undefined){
  const c=s.crown;const target=(v:CrownTarget)=>!!v&&int(v.region,1,3)&&int(v.room,1,5)&&int(v.mainPathIndex,1,12)&&createDungeon(regionDungeonSeed(s.seed,v.region),2).rooms[v.room].mainReward===true;
  if(!c||!acquired.includes('R47')||(e?.dungeon?.layoutVersion ?? 0)<2||!target(c.a)||!target(c.b)||c.a.region>=c.b.region||!ids(c.ids,2)||c.ids.length!==2||c.ids.some(id=>isCurse(id)||Number(id.slice(1))>30)
   ||!ids(c.selectedIds,2)||!c.selectedIds.every(id=>acquired.includes(id))||!['reserved','complete','abandoned'].includes(c.state)||c.state==='complete'&&c.selectedIds.length!==2||c.state==='reserved'&&c.selectedIds.length>=2)return false;
  const archives=[[e!.dungeon,region],[e!.previousDungeon,region-1],[e!.earlierDungeon,1]] as const;
  const b=archives.find(([,r])=>r===c.b.region)?.[0]?.rooms[c.b.room];if(b&&!b.reward?.forfeited)return false;
 }
 return true;
}
