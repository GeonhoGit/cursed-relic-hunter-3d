import type {RunState} from '../core/model';
import {canContinue,roomReward} from '../core/expedition';
export function canAdvanceLegacy(s:RunState):boolean{
 return !!s.expedition&&s.expedition.route!=='maze'&&s.phase==='cleared'&&canContinue(s)&&roomReward(s)?.choice!==null;
}
export function completionModal(s:RunState):'result'|'reward'|null{
 if(s.phase==='dead')return'result';
 if(s.phase!=='cleared')return null;
 return s.boss||!roomReward(s)?'result':'reward';
}
