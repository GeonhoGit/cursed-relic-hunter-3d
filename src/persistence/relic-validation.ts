import { BOUNDS, type Cue, type Point, type RelicUnlockId, type RunState } from '../core/model';
import { isCurse } from '../core/relics';
import { LIGHTNING, STARLIGHT, WARD } from '../core/relic-combat';
import { CLEANSE } from '../core/relic-survival';
import { CROWN, GRAVITY } from '../core/relic-fields';
import { validRelicFields } from './field-validation';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const integer = (v: unknown, min: number, max: number) => finite(v) && Number.isInteger(v) && v >= min && v <= max;
const locked = (v: unknown): v is RelicUnlockId => ['R14','R15','R16','R17','R18','R26','R27','R28','R29','R32','R33','R34','R35','R36','R47','R48'].includes(v as string);
const bounded = (p: Point) => finite(p.x) && finite(p.y) && p.x >= BOUNDS.x - .001 && p.x <= BOUNDS.x + BOUNDS.w + .001
  && p.y >= BOUNDS.y - .001 && p.y <= BOUNDS.y + BOUNDS.h + .001;
export function validRelicExpansion(s: RunState): boolean {
  const unlocks = s.growth?.relicUnlocks;
  if (unlocks !== undefined && (!Array.isArray(unlocks) || unlocks.length > 16 || new Set(unlocks).size !== unlocks.length || !unlocks.every(locked))) return false;
  const e = s.expedition, acquired = e?.acquired ?? [];
  const rooms = [e?.dungeon, e?.previousDungeon, e?.earlierDungeon].flatMap(d => d?.rooms ?? []);
  const offered = [...acquired, ...(e?.reward?.candidates ?? []), ...rooms.flatMap(r => [
    ...(r.reward?.candidates ?? []), ...(r.shop?.slots.flatMap(slot => slot.relic ? [slot.relic] : []) ?? [])])];
  if (offered.some(id => locked(id) && !unlocks?.includes(id))) return false;
  const rewards = [...rooms.flatMap(r => r.reward ? [r.reward] : []), ...(e?.reward ? [e.reward] : [])];
  if (rewards.some(r => r.candidates.length === 4 && (!acquired.includes('R34') || r.candidates.includes('R34')))) return false;
  if (rewards.some(r => r.diceRerolls !== undefined && (!integer(r.diceRerolls, 1, 2) || r.rerolled !== true || r.candidates.some(isCurse)))) return false;
  const spent = rewards.reduce((n, r) => n + (r.diceRerolls ?? 0), 0);
  if (acquired.includes('R32')) {
    if (!integer(s.diceRerolls, 0, 2) || spent > 2 - s.diceRerolls!
      || e?.route === 'maze' && spent !== 2 - s.diceRerolls!) return false;
  } else if (s.diceRerolls !== undefined || spent) return false;
  const timers = [['lightningCooldown', 'R09', LIGHTNING.cooldown], ['starlightCooldown', 'R14', STARLIGHT.cooldown],
    ['wardCooldown', 'R19', WARD.cooldown], ['cleanseCooldown', 'R22', CLEANSE.cooldown],
    ['gravityCooldown', 'R10', GRAVITY.cooldown], ['thornsCooldown', 'R23', CROWN.cooldown]] as const;
  if (timers.some(([key, id, max]) => s.player[key] !== undefined && (!integer(s.player[key], 1, max) || !acquired.includes(id)))) return false;
  if (s.player.starlightRest !== undefined && (!integer(s.player.starlightRest, 0, STARLIGHT.rest) || !acquired.includes('R14'))) return false;
  if (s.bullets.some(b => !b || b.lightningDone !== undefined && (b.lightningDone !== true || b.kind !== undefined || b.owner !== 'player' || !acquired.includes('R09')))) return false;
  if (s.bullets.some(b => b.gravityDone !== undefined && (b.gravityDone !== true || b.kind !== undefined || b.owner !== 'player' || !acquired.includes('R10')))
    || !validRelicFields(s)) return false;
  const counted = rooms.filter(r => r.mossCounted !== undefined);
  if (counted.some(r => r.mossCounted !== true || r.kind !== 'combat' || !r.visited || !r.cleared)) return false;
  if (s.mossRooms !== undefined && (e?.route === 'maze' || !Array.isArray(s.mossRooms) || s.mossRooms.length > 3
    || new Set(s.mossRooms).size !== s.mossRooms.length || !s.mossRooms.every(id => integer(id, 0, 2)))) return false;
  const count = counted.length + (s.mossRooms?.length ?? 0);
  if ((count || s.mossClears !== undefined || s.mossRooms !== undefined) && !acquired.includes('R21')) return false;
  return s.mossClears === undefined ? count === 0 : integer(s.mossClears, 0, 2) && s.mossClears === count % 3;
}
export function validExpansionCue(s: RunState, c: Cue): boolean {
  if (c.kind === 'evade') return !!s.expedition?.acquired.includes('R24') && bounded(c) && !!c.end && bounded(c.end)
    && integer(c.tick, 0, s.tick) && finite(c.amount) && c.amount >= 80 - .001 && c.amount <= 120 + .001
    && Math.abs(Math.hypot(c.end.x - c.x, c.end.y - c.y) - c.amount) < .001
    && finite(c.height) && c.height >= 0 && c.height <= 62.5 && c.endHeight === 0;
  const relic = { lightning: 'R09', starlight: 'R14', ward: 'R19', cleanse: 'R22', moss: 'R21', thorns: 'R23' } as const;
  if (!(c.kind in relic)) return false;
  const id = relic[c.kind as keyof typeof relic];
  if (!s.expedition?.acquired.includes(id) || !bounded(c) || !integer(c.tick, 0, s.tick) || !finite(c.amount) || c.amount < 0) return false;
  if (c.kind === 'thorns' && c.amount !== CROWN.radius) return false;
  if (c.kind === 'lightning' || c.kind === 'starlight') {
    return !!c.end && bounded(c.end) && [c.height, c.endHeight].every(finite)
      && c.height! >= 0 && c.height! <= 140 && c.endHeight! >= 0 && c.endHeight! <= 140
      && Math.hypot(c.end.x - c.x, c.end.y - c.y) <= (c.kind === 'lightning' ? LIGHTNING.range : STARLIGHT.range) + .001;
  }
  return c.end === undefined && c.endHeight === undefined && (c.height === undefined || finite(c.height) && c.height >= 0 && c.height <= 140);
}
