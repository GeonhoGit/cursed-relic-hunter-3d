import type { RelicId, RelicUnlockId, RunState } from './model';
import { hasRelic, normalRelics } from './relics';
import { syncDodgeCharges } from './dodge';
import { activeAuxiliary, isAuxiliary } from './auxiliary';
import { cleanseStatus } from './relic-survival';
import { AUXILIARY_IDS } from './model';
import { crownPlan, crownReserved, reserveCrown } from './sealed-crown';
import { drawRelic } from './relic-rarity';
import { isCurse, RELIC_IDS } from './relics';

export function canAcquireRelic(s: RunState, id: RelicId): boolean {
  return !!s.expedition && !s.expedition.acquired.includes(id) && !crownReserved(s,id) && (id !== 'R38' || normalRelics(s).length >= 2)
    && (!['R11', 'R12'].includes(id) || firstCombatCleared(s))
    && (!['R14', 'R15', 'R16', 'R17', 'R18', 'R26', 'R27', 'R28', 'R29', 'R32', 'R33', 'R34', 'R35', 'R36','R47','R48'].includes(id) || s.growth?.relicUnlocks?.includes(id as RelicUnlockId) === true)
    && (!['R28','R35','R47'].includes(id)||(s.expedition.dungeon?.layoutVersion ?? 0)>=2)
    && (id!=='R35'||s.expedition.dungeon?.rooms.some(r=>r.locked)===true)
    && (id!=='R42'||AUXILIARY_IDS.some(a=>a!=='R42'&&hasRelic(s,a)))
    && (id!=='R47'||crownPlan(s)!==null)
    && (id!=='R48'||s.expedition.route==='maze');
}
function firstCombatCleared(s: RunState): boolean {
  const e = s.expedition!;
  return !!s.growth?.firstRoomCleared || (e.route === 'maze'
    ? [e.dungeon, e.previousDungeon, e.earlierDungeon].some(d => d?.rooms.some(r => r.kind === 'combat' && r.cleared))
    : e.room > 0 || s.phase === 'cleared');
}
// New candidates may exclude a relic without invalidating an already displayed offer.
export function canOfferRelic(s: RunState, id: RelicId): boolean {
  return canAcquireRelic(s, id) && !(id === 'R33' && hasRelic(s, 'R37')) && !(id==='R31'&&hasRelic(s,'R48'));
}
export function grantRelic(s: RunState, id: RelicId): boolean {
  if (!canAcquireRelic(s, id)) return false;
  if(id==='R47'&&!reserveCrown(s))return false;
  const e = s.expedition!, firstAuxiliary = isAuxiliary(id) && !e.acquired.some(isAuxiliary), equipped = activeAuxiliary(s);
  e.acquired.push(id); e.relics.push(id);
  if(id==='R47')repairReservedOffers(s);
  if (id === 'R25') syncDodgeCharges(s);
  if (id === 'R22') cleanseStatus(s);
  if (id === 'R32') s.diceRerolls = 2;
  if (firstAuxiliary && isAuxiliary(id)) s.player.equippedAux = id;
  else if (isAuxiliary(id) && s.player.equippedAux === undefined) s.player.equippedAux = equipped;
  return true;
}
function repairReservedOffers(s:RunState){
  for(const node of s.expedition!.dungeon!.rooms){
    const context={...s,expedition:{...s.expedition!,room:node.id}},rng={rng:((s.seed^Math.imul(node.id+1,0x85ebca6b))>>>0)||1};
    const reward=node.reward;
    if(reward?.choice===null){let changed=false;reward.candidates=reward.candidates.flatMap(id=>{
      if(!crownReserved(context,id))return[id];changed=true;
      const pool=RELIC_IDS.filter(r=>!isCurse(r)&&canOfferRelic(context,r)&&!reward.candidates.includes(r));const next=drawRelic(rng,pool);if(next)reward.candidates.push(next);return next?[next]:[];
    });if(changed)reward.revision=(reward.revision ?? 1)+1;}
    const shop=node.shop;if(shop){let changed=false;for(const slot of shop.slots)if(!slot.purchased&&slot.relic&&crownReserved(context,slot.relic)){
      slot.relic=drawRelic(rng,RELIC_IDS.filter(id=>isCurse(id)===(slot.kind==='curse')&&canOfferRelic(context,id)&&!shop.slots.some(q=>q.relic===id)));slot.repairCounter++;changed=true;
    }if(changed)shop.revision++;}
  }
}
