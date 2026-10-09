import { BOUNDS, type Point, type RunState } from '../core/model';
import { GRAVITY, ORBIT, THORN } from '../core/relic-fields';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const integer = (v: unknown, min: number, max: number) => finite(v) && Number.isInteger(v) && v >= min && v <= max;
const point = (p: Point) => !!p && finite(p.x) && finite(p.y) && p.x >= BOUNDS.x - .001 && p.x <= BOUNDS.x + BOUNDS.w + .001
  && p.y >= BOUNDS.y - .001 && p.y <= BOUNDS.y + BOUNDS.h + .001;
export function validRelicFields(s: RunState): boolean {
  const acquired = s.expedition?.acquired ?? [], id = (v: unknown) => integer(v, 0, s.nextId - 1);
  const live = s.phase === 'combat' || s.phase === 'explore';
  if (s.player.orbitCount !== undefined && (!integer(s.player.orbitCount, 0, 3) || !acquired.includes('R06'))) return false;
  if (s.orbitShots !== undefined && (!live || !s.expedition?.relics.includes('R06') || !Array.isArray(s.orbitShots)
    || s.orbitShots.length < 1 || s.orbitShots.length > ORBIT.budget || new Set(s.orbitShots.map(o => o?.id)).size !== s.orbitShots.length
    || !s.orbitShots.every(o => o && id(o.id) && id(o.eventId) && integer(o.ticks, 1, ORBIT.ticks)
      && finite(o.damage) && o.damage > 0 && finite(o.angle) && Math.abs(o.angle) <= Math.PI
      && integer(o.bouncesLeft, 0, 2) && (o.vertical === undefined || o.vertical === true)))) return false;
  if (s.gravityWell !== undefined && (!live || !s.expedition?.relics.includes('R10') || !s.gravityWell || !point(s.gravityWell)
    || !id(s.gravityWell.id) || !id(s.gravityWell.eventId) || !integer(s.gravityWell.ticks, 1, GRAVITY.ticks)
    || (s.player.gravityCooldown ?? 0) < s.gravityWell.ticks)) return false;
  if (s.thornTrails !== undefined && (!live || !s.expedition?.relics.includes('R15') || !Array.isArray(s.thornTrails)
    || s.thornTrails.length < 1 || s.thornTrails.length > THORN.limit || new Set(s.thornTrails.map(t => t?.id)).size !== s.thornTrails.length
    || !s.thornTrails.every(t => t && id(t.id) && integer(t.ticks, 1, THORN.ticks) && [3.2, 4].includes(t.damage)
      && Array.isArray(t.points) && t.points.length >= 1 && t.points.length <= 17 && t.points.every(point)
      && t.points.every((p, i) => !i || Math.hypot(p.x - t.points[i - 1].x, p.y - t.points[i - 1].y) <= (acquired.includes('R27') ? 40.001 : 5.001))
      && t.points.filter((p, i) => i && Math.hypot(p.x - t.points[i - 1].x, p.y - t.points[i - 1].y) > 5.001).length <= (acquired.includes('R27') ? 1 : 0)
      && t.points.reduce((sum, p, i) => sum + (i ? Math.hypot(p.x - t.points[i - 1].x, p.y - t.points[i - 1].y) : 0), 0) <= (acquired.includes('R27') ? 112.001 : 72.001)))) return false;
  if (s.player.thornTrailId !== undefined && (!id(s.player.thornTrailId) || !s.expedition?.relics.includes('R15')
    || s.player.dodgeRemaining <= 0 || !s.thornTrails?.some(t => t.id === s.player.thornTrailId))) return false;
  if (s.thornHits !== undefined && (!live || !acquired.includes('R15') || !Array.isArray(s.thornHits)
    || s.thornHits.length < 1 || s.thornHits.length > 32 || new Set(s.thornHits.map(h => h?.id)).size !== s.thornHits.length
    || !s.thornHits.every(h => h && integer(h.id, 0, Number.MAX_SAFE_INTEGER) && integer(h.tick, Math.max(0, s.tick - THORN.interval + 1), s.tick)))) return false;
  if (s.bullets.some(b => b.kind === 'orbit' && (!acquired.includes('R06') || b.phase !== undefined || b.splitDone !== undefined || b.source !== undefined
    || b.outboundHits !== undefined || b.gravityDone !== undefined || b.lightningDone !== undefined || !integer(b.life, 1, ORBIT.life)))) return false;
  const generated = s.bullets.filter(b => b.kind === 'orbit' || b.kind === 'split' || b.kind === 'ally').length + (s.orbitShots?.length ?? 0);
  return generated <= ORBIT.budget && s.bullets.length + (s.orbitShots?.length ?? 0) <= 240
    && !(s.orbitShots?.some(o => s.bullets.some(b => b.id === o.id)));
}
