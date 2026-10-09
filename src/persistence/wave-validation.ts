import type { DungeonRoom, RunState } from '../core/model';
import { roomEncounter } from '../core/expedition';
import { currentRoom } from '../core/dungeon';
import { ENEMY_HEALTH } from '../core/enemy-balance';
import { ELITE_KINDS, eliteHealth } from '../core/elite';

export function validEncounter(s:RunState,node:DungeonRoom,region:1|2|3=s.expedition?.region ?? 1):boolean{
 const plan=node.encounter;
 if(plan===undefined)return true;
 if(s.expedition?.dungeon?.layoutVersion!==3||!node.visited||!['combat','elite'].includes(node.kind)||!plan||plan.balanceVersion!==undefined&&(plan.balanceVersion!==2||node.kind!=='elite')||!Array.isArray(plan.waves)||plan.waves.length<1||plan.waves.length>3
  ||plan.waves.some(w=>!Array.isArray(w)||w.length<1||w.length>8||w.some(e=>!e||!(e.kind in ENEMY_HEALTH)||e.elite!==undefined&&e.elite!==true)))return false;
 const e=s.expedition!,copy={...s,expedition:{...e,region,room:node.id,dungeon:{...e.dungeon!,rooms:e.dungeon!.rooms.map(r=>r.id===node.id?{...r,encounter:undefined}:r)}}};
 const expected=roomEncounter(copy,plan.balanceVersion ?? 1)!;
 return plan.waves.length===expected.waves.length&&plan.waves.every((w,i)=>w.length===expected.waves[i].length&&w.every((spec,j)=>spec.kind===expected.waves[i][j].kind&&spec.elite===expected.waves[i][j].elite));
}
export function validWaveState(s:RunState):boolean{
 const node=currentRoom(s),expanded=s.expedition?.dungeon?.layoutVersion===3;
 const elites=s.enemies.filter(e=>e?.elite!==undefined);
 if(elites.some(e=>e.elite!==true||!expanded||node?.kind!=='elite'||!ELITE_KINDS.includes(e.kind as never)||e.maxHp!==eliteHealth(e.kind)||e.charm))return false;
 if(elites.length>1)return false;
 if(!expanded)return ![s.expedition?.dungeon,s.expedition?.previousDungeon,s.expedition?.earlierDungeon].some(d=>d?.rooms.some(r=>r.encounter!==undefined));
 if(!node)return false;
 if(['ready','combat','dead'].includes(s.phase)&&['combat','elite'].includes(node.kind)&&!node.encounter)return false;
 if(s.replay&&s.wave!==1)return false;
 const limit=node.kind==='elite'?6:node.kind==='combat'?8:10;
 if(s.enemies.length+s.enemies.reduce((n,e)=>n+(e.summonPoints?.length ?? 0),0)>limit)return false;
 if(elites.some(e=>s.wave!==2||e.kind!==ELITE_KINDS[(s.expedition!.region ?? 1)-1]))return false;
 if(node.firstRoster&&node.encounter){const kinds=node.encounter.waves.flat();if(node.firstRoster.length!==kinds.length||node.firstRoster.some((e,i)=>e.kind!==kinds[i].kind))return false;}
 return s.waveDelay===0;
}
