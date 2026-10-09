import type { GrowthProfile, RelicId, RelicRarity, RelicUnlockId, RunState } from './model';
import { growthGoals } from './growth';
import { isCurseHistory, RELICS, RELIC_IDS } from './relics';
export interface CodexOptions { query?: string; status?: 'all'|'discovered'|'undiscovered'|'locked'; rarity?: 'all'|RelicRarity }
export interface CodexEntry { id:RelicId; name:string; icon:string; type:string; description:string; rarity:RelicRarity; discovered:boolean; unlocked:boolean; departureUnlocked:boolean|null; curse:boolean; appearance:string; runStatus:'held'|'consumed'|'lost'|null; unlock:{description:string; count:number; target:number} }
const GATES:Partial<Record<RelicId,string>>={R11:'G01',R12:'G01',R14:'G02',R15:'G02',R16:'G03',R17:'G03',R18:'G04',R26:'G05',R27:'G05',R28:'G06',R29:'G06',R32:'G07',R33:'G08',R34:'G08',R35:'G09',R36:'G09',R47:'G12',R48:'G12'};
const APPEARANCE:Partial<Record<RelicId,string>>={
 R28:'새 탐험의 구덩이가 있는 지형에서 등장합니다.',R35:'새 탐험에서 아직 잠긴 보물방이 있을 때 등장합니다.',
 R37:'일반 상자·상점에서 등장하지만 저주 수집과 무저주 승리 목표에서는 저주 이력으로 계산합니다.',
 R38:'현재 보유한 일반 유물 2개 이상이 필요합니다.',R42:'다른 보조 기술을 보유해야 후보로 등장합니다.',
 R47:'새 탐험에 미개봉 지정 보상 A/B와 예약할 일반 R01~R30 유물 2종이 남아 있어야 합니다.',R48:'미로 탐험에서 등장합니다. 클리어한 전투방을 다시 방문하면 추가 보상 없이 재전투합니다.',
 R31:'거꾸로 된 지도를 보유하면 새 후보에서 제외됩니다.',R33:'피의 지갑을 보유하면 새 후보에서 제외됩니다.',
};
function currentUnlock(s:RunState,id:RelicId,gate:string|undefined):boolean{
 if(!gate)return true;
 if(gate==='G01')return !!s.growth?.firstRoomCleared|| (s.expedition?.route==='maze'
  ?[s.expedition.dungeon,s.expedition.previousDungeon,s.expedition.earlierDungeon].some(d=>d?.rooms.some(r=>r.kind==='combat'&&r.cleared))
  :(s.expedition?.room ?? 0)>0||s.phase==='cleared');
 return s.growth?.relicUnlocks?.includes(id as RelicUnlockId)===true;
}
export function relicCodex(profile:GrowthProfile,run:RunState|null=null,options:CodexOptions={}):CodexEntry[]{
 const goals=growthGoals(profile),seen=new Set([...profile.relics,...(run?.expedition?.acquired ?? [])]),query=options.query?.trim().toLocaleLowerCase('ko') ?? '';
 return [...RELIC_IDS].sort().map((id):CodexEntry=>{
  const relic=RELICS[id],gate=GATES[id],goal=goals.find(g=>g.id===gate),acquired=run?.expedition?.acquired.includes(id),held=run?.expedition?.relics.includes(id);
  return {id,...relic,discovered:seen.has(id),unlocked:!goal||goal.count>=goal.target,
   departureUnlocked:run?currentUnlock(run,id,gate):null,curse:isCurseHistory(id),
   appearance:APPEARANCE[id] ?? (isCurseHistory(id)?'저주 제단·상점의 저주 진열대에서 등장합니다.':'일반 유물 상자·지정 보상·상점에서 등장합니다.'),
   runStatus:held?'held':acquired?run?.revival?.lost.includes(id)?'lost':'consumed':null,
   unlock:goal?{description:goal.description,count:Math.min(goal.count,goal.target),target:goal.target}:{description:'처음부터 공개되는 유물',count:1,target:1}};
 }).filter(e=>(!query||[e.id,e.name,e.description,e.type,e.appearance].join(' ').toLocaleLowerCase('ko').includes(query))
  &&(!options.rarity||options.rarity==='all'||e.rarity===options.rarity)
  &&(!options.status||options.status==='all'||options.status==='discovered'&&e.discovered||options.status==='undiscovered'&&!e.discovered||options.status==='locked'&&!e.unlocked));
}
