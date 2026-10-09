import { TREASURE_PEDESTAL, type Enemy, type RelicId, type RunState } from './model';
import { hasRelic, isCurse, RELIC_IDS } from './relics';
import { drawRelic } from './relic-rarity';
import { currentRoom } from './dungeon';
import { canOfferRelic, grantRelic } from './relic-acquisition';
import { roomLayout } from './room-layout';
import { canAcquireRelic } from './relic-acquisition';
import { abandonCrown, crownOwner, crownSelected } from './sealed-crown';
import { buildEncounter } from './encounters';
function baseRoster(s:RunState){const node=currentRoom(s)!;const base=ROOMS[node.template];return s.expedition?.region===3
 ?(node.id%2?['watcher','heartguard','riftshaman','voidknight','rat']:['watcher','heartguard','riftshaman','voidknight','shield','ashpriest']) as Enemy['kind'][]
 :s.expedition?.region===2?(node.id%2?['ashpriest','sealcaster','chainhound','readerstatue','guard','rat']:['ashpriest','sealcaster','chainhound','readerstatue','shield','archer']) as Enemy['kind'][]
 :MAZE_GUARDS[node.id] ?? base.waves[(s.seed+node.id)%2];}
export function roomEncounter(s:RunState,eliteBalance:1|2=2){const node=currentRoom(s);return s.expedition?.dungeon?.layoutVersion===3&&node&&['combat','elite'].includes(node.kind)
 ?node.encounter ?? buildEncounter(s.seed,s.expedition.region ?? 1,node.id,baseRoster(s),node.kind==='elite',eliteBalance):undefined;}

export const ROOMS: { name: string; subtitle: string; reward: boolean; boss?: boolean; waves: Enemy['kind'][][] }[] = [
  { name: '무너진 입구', subtitle: '첫 번째 석실', reward: true, waves: [['rat', 'archer', 'rat'], ['archer', 'rat', 'archer']] },
  { name: '사냥꾼의 회랑', subtitle: '두 번째 석실', reward: true, waves: [['rat', 'rat', 'rat'], ['archer', 'rat', 'archer']] },
  { name: '잿빛 성소', subtitle: '세 번째 석실', reward: false, waves: [['archer', 'archer', 'rat'], ['rat', 'rat', 'archer']] },
  { name: '문지기의 봉인', subtitle: '최종 보스', reward: false, boss: true, waves: [] },
];
const MAZE_GUARDS: Record<number, Enemy['kind'][]> = {
  2: ['guard', 'rat', 'archer'], 3: ['shield', 'rat', 'rat'],
  4: ['guard', 'shield', 'archer'], 5: ['shield', 'guard', 'rat'],
};

export function roomInfo(s: RunState) {
  const index = s.expedition?.room ?? 0;
  const node = currentRoom(s);
  if (node) {
    const base = ROOMS[node.template], varied = !!s.expedition?.dungeon?.layoutVersion;
    const heart = s.expedition?.region === 3, cursed = s.expedition?.region === 2;
    const encounter=roomEncounter(s),waves=s.replay?[node.firstRoster?.slice(0,2).map(e=>e.kind) ?? []]:encounter?encounter.waves.map(w=>w.map(e=>e.kind)):node.kind==='combat'?[baseRoster(s)]:[];
    return { name: node.kind === 'start' ? heart ? '심장부의 문턱' : cursed ? '회랑의 문턱' : '길잡이의 방' : node.kind === 'treasure' ? '유물의 안식처' : node.kind === 'boss' ? heart ? '심장의 성소' : cursed ? '사슬의 성소' : '문지기의 봉인' : node.kind === 'altar' ? '저주받은 제단' : node.kind === 'shop' ? '방랑 상인의 쉼터' : varied ? roomLayout(s).name : base.name,
      subtitle: { start: varied ? `탐험의 시작 · ${roomLayout(s).name}` : '탐험의 시작', combat: '전투 석실', elite:'정예 석실 · 금화20과유물', treasure: '유물방', boss: '최종 보스', altar: '선택의 대가', shop: '금화로 준비하는 다음 전투' }[node.kind],
      reward: node.kind === 'treasure' || node.kind === 'altar'||node.kind==='elite'||node.mainReward===true, boss: node.kind === 'boss',
      waves, index, total: s.expedition!.dungeon!.rooms.length };
  }
  return { ...ROOMS[index], index, total: s.expedition?.route === 'gatekeeper' ? ROOMS.length : s.expedition ? 3 : 1 };
}
export function canContinue(s: RunState) {
  if (s.expedition?.route === 'maze') return s.phase !== 'dead' && !(currentRoom(s)?.kind === 'boss' && s.phase === 'cleared');
  return s.phase !== 'dead' && (s.phase !== 'cleared' || roomInfo(s).index < roomInfo(s).total - 1);
}
export function roomReward(s: RunState) { return currentRoom(s)?.reward ?? (s.expedition?.route === 'maze' ? null : s.expedition?.reward ?? null); }
export function canOpenTreasure(s: RunState): boolean {
  const node = currentRoom(s), box = TREASURE_PEDESTAL;
  if (s.phase !== 'explore' || node?.kind !== 'treasure' || !node.cleared || node.reward !== null) return false;
  const dx = Math.max(box.x - s.player.x, 0, s.player.x - box.x - box.w);
  const dy = Math.max(box.y - s.player.y, 0, s.player.y - box.y - box.h);
  return Math.hypot(dx, dy) <= 32;
}
export function openTreasure(s: RunState): boolean {
  if (!canOpenTreasure(s)) return false;
  s.phase = 'cleared'; prepareReward(s); return true;
}
export function prepareReward(s: RunState) {
  const expedition = s.expedition;
  if (!expedition || !canContinue(s) || !roomInfo(s).reward || roomReward(s)) return;
  const pool = RELIC_IDS.filter(id => !isCurse(id) && canOfferRelic(s, id));
  const altar=currentRoom(s)?.kind==='altar',slots=hasRelic(s,'R34')?4:3;
  const expanded=(s.expedition?.dungeon?.layoutVersion ?? 0)>=2;
  const candidates: RelicId[] = altar ? expanded ? [] : ['R38', 'R43'] : crownOwner(s)?[...s.crown!.ids]:[];
  if(altar&&expanded){const curses=RELIC_IDS.filter(id=>isCurse(id)&&canOfferRelic(s,id));while(curses.length&&candidates.length<2){const id=drawRelic(s,curses)!;candidates.push(id);curses.splice(curses.indexOf(id),1);}}
  if (!altar) while (pool.length && candidates.length < slots) {
    const id = drawRelic(s, pool)!; candidates.push(id); pool.splice(pool.indexOf(id), 1);
    if(new Set(candidates).size!==candidates.length)candidates.splice(candidates.lastIndexOf(id),1);
  }
  const reward = { room: expedition.room, candidates, choice: null,slots:altar?2:slots,revision:1,...(crownOwner(s)?{selectedIds:[]}: {}) };
  const node = currentRoom(s); if (node) node.reward = reward; else expedition.reward = reward;
}
export function chooseRelic(s: RunState, choice: RelicId | 'skip'|'gold', revision?:number): boolean {
  const e = s.expedition, reward = roomReward(s);
  if (s.phase !== 'cleared' || !e || !reward || reward.choice !== null || reward.room !== e.room||revision!==undefined&&revision!==(reward.revision ?? 1)) return false;
  const crown=crownOwner(s);
  if(choice==='gold'){if(crown||currentRoom(s)?.kind==='altar'||reward.candidates.length>=(reward.slots ?? 3))return false;s.gold+=15;}
  else if (choice !== 'skip') {
    if (!reward.candidates.includes(choice) || !grantRelic(s, choice)) return false;
    if(crown){(reward.selectedIds ??= []).push(choice);crownSelected(s,choice);reward.revision=(reward.revision ?? 1)+1;
      if(reward.selectedIds.length<2)return true;}
  }
  if(crown&&choice==='skip')abandonCrown(s);
  reward.revision=(reward.revision ?? 1)+1;
  reward.choice = choice; if (currentRoom(s)) s.phase = 'explore'; return true;
}
export function canRerollReward(s: RunState): boolean {
  const reward = roomReward(s), node = currentRoom(s);
  return s.phase === 'cleared' && !!s.expedition && !!reward && reward.choice === null
    && reward.candidates.length > 0
    && (!reward.rerolled || hasRelic(s, 'R32') && (s.diceRerolls ?? 0) > 0)
    && reward.room === s.expedition.room && (!node || node.kind === 'treasure'||node.kind==='elite'||node.mainReward===true)
    && reward.candidates.every(id => !isCurse(id))
    && (!crownOwner(s)||(reward.slots ?? reward.candidates.length)>new Set([...s.crown!.ids,...(reward.selectedIds ?? [])]).size)
    && RELIC_IDS.some(id => !isCurse(id) && canOfferRelic(s, id) && !reward.candidates.includes(id));
}
export function rerollReward(s: RunState): boolean {
  if (!canRerollReward(s)) return false;
  const reward = roomReward(s)!;
  const pool = RELIC_IDS.filter(id => !isCurse(id) && canOfferRelic(s, id));
  const fresh = pool.filter(id => !reward.candidates.includes(id));
  const old = pool.filter(id => reward.candidates.includes(id));
  const fixed=crownOwner(s)?[...new Set([...s.crown!.ids,...(reward.selectedIds ?? [])])]:[];
  const candidates: RelicId[] = [...fixed];
  const slots = reward.slots ?? reward.candidates.length;
  // Prefer entirely new candidates, filling from old ones only when the eligible pool is small.
  for (const group of [fresh, old]) while (group.length && candidates.length < slots) {
    const id = drawRelic(s, group)!; candidates.push(id); group.splice(group.indexOf(id), 1);
    if(new Set(candidates).size!==candidates.length)candidates.splice(candidates.lastIndexOf(id),1);
  }
  if(candidates.length===reward.candidates.length&&candidates.every((id,i)=>id===reward.candidates[i]))return false;
  reward.candidates = candidates;
  reward.revision=(reward.revision ?? 1)+1;
  if (reward.rerolled) { s.diceRerolls!--; reward.diceRerolls = (reward.diceRerolls ?? 0) + 1; }
  else reward.rerolled = true;
  return true;
}
export function leaveAltar(s: RunState): boolean {
  if (s.phase !== 'cleared' || currentRoom(s)?.kind !== 'altar' || roomReward(s)?.choice !== null) return false;
  s.phase = 'explore'; return true;
}
