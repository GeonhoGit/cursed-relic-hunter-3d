import type { RunState } from './model';
import { growthStats } from './growth';
import { hasRelic } from './relics';
import { currentWeapon } from './weapons';

// Derived at firing time. Fixed-damage abilities continue to use playerDamage directly.
export function attackStats(s: RunState) {
  const base = growthStats(s);
  const fangActive = hasRelic(s, 'R51') && s.player.hp <= base.maxHp * 0.5;
  const crownActive = hasRelic(s, 'R57') && s.player.hp >= base.maxHp * 0.8;
  const damageBonus = (hasRelic(s, 'R49') ? 0.15 : 0) + (hasRelic(s, 'R50') ? 0.3 : 0)
    + (fangActive ? 0.25 : 0) + (crownActive ? 0.35 : 0);
  return { ...base, damage: base.damage * (1 + damageBonus),
    fireInterval: base.fireInterval * (hasRelic(s, 'R50') ? 1.05 : 1) * (hasRelic(s, 'R52') ? 0.9 : 1),
    projectileSpeed: currentWeapon(s).speed * (hasRelic(s, 'R55') ? 1.2 : 1), damageBonus, fangActive, crownActive };
}
