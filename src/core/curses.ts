import type { RelicId, RunState } from './model';
import { hasRelic, normalRelics } from './relics';
import { random } from './random';
import { syncDodgeCharges } from './dodge';

export function reviveContract(s: RunState): boolean {
  if (s.player.hp > 0 || !hasRelic(s, 'R38')) return false;
  const pool = normalRelics(s), lost: RelicId[] = [];
  while (pool.length && lost.length < 2) lost.push(pool.splice(Math.floor(random(s) * pool.length), 1)[0]);
  s.expedition!.relics = s.expedition!.relics.filter(id => id !== 'R38' && !lost.includes(id));
  if (lost.includes('R13')) { delete s.bombs; if (s.player.equippedAux === 'R13' || s.player.equippedAux === undefined) s.player.equippedAux = null; }
  syncDodgeCharges(s);
  s.player.hp = 40; s.player.invulnerable = 120; s.revival = { tick: s.tick, lost };
  delete s.player.weakTicks;
  return true;
}
