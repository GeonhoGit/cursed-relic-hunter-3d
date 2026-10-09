import type { RunState } from './model';
import { ENEMY_ATTACK } from './enemy-balance';
import { cancelVoidAttack } from './void-knight';
import { cancelSealBlast } from './seal-caster';
import { cancelChainBite } from './chain-hound';
import { cancelStatueLaser } from './reader-statue';
import { clearLens } from './rift-lens';
import { clearRelicFields } from './relic-fields';
import { clearAnchor } from './anchor';
import { clearPortals } from './portal';
import { clearAbsorption, breakStealth } from './shadow-absorb';
import { cancelRecovery } from './recovery';

export const playerDamage = (s: RunState, damage: number) => damage * (s.player.weakTicks ? 0.8 : 1);
export const walkingSpeed = (s: RunState, base: number) => base * (s.player.slowTicks ? .8 : 1);
export function advanceSlow(s: RunState) {
  if (s.player.slowTicks && --s.player.slowTicks <= 0) delete s.player.slowTicks;
}
export function advanceWeakness(s: RunState) {
  if (s.player.weakTicks && --s.player.weakTicks <= 0) delete s.player.weakTicks;
}
export function clearCombatEffects(s: RunState) {
  clearPortals(s);clearAbsorption(s);cancelRecovery(s);breakStealth(s);
  if(s.player.hp<=0&&s.crown?.state==='reserved')s.crown.state='abandoned';
  if (s.player.hp <= 0) clearAnchor(s);
  clearRelicFields(s);
  delete s.player.weakTicks; delete s.player.slowTicks; delete s.riftSummonUsed;
  for (const e of s.enemies) { delete e.silenceTicks; clearLens(e); }
  if (s.boss) { delete s.boss.silenceTicks; clearLens(s.boss); }
  for (const e of s.enemies) if (e.kind === 'readerstatue') cancelStatueLaser(e);
  for (const e of s.enemies) if (e.kind === 'chainhound') cancelChainBite(e);
  for (const e of s.enemies) if (e.kind === 'sealcaster') cancelSealBlast(e);
  for (const e of s.enemies) if (e.kind === 'voidknight') cancelVoidAttack(e);
  for (const e of s.enemies) if (e.summonPoints) {
    delete e.summonPoints; e.mode = 'recover'; e.timer = ENEMY_ATTACK.riftshaman.cooldownTicks;
  }
}
