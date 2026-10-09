import { isBoss, type Box, type Enemy, type Point, type RunState } from './model';
import { damageEnemy } from './combat';
import { isAlly, opponents, PUPPET } from './allegiance';
import { ENEMY_ATTACK } from './enemy-balance';
import { distance, moveBody, segmentBox, segmentCircle, visible } from './geometry';
import { BODY_HEIGHT } from './fps-geometry';
import { roomLayout } from './room-layout';
import { eliteDamage } from './elite';

export function npcAttack(s: RunState, before: Enemy, e: Enemy, walls: Box[], previous: Map<number, Point>): { hits: Set<number>; chargeIntercepted: boolean } {
  const hit = new Set<number>(), candidates = opponents(s, before), source = isAlly(before) ? 'ally' : 'enemy';
  let chargeIntercepted = false;
  const apply = (target: typeof candidates[number], damage: number, pull = false) => {
    if (pull && target.kind !== 'decoy') {
      const gap = distance(e, target), length = Math.min(30, Math.max(0, gap - 21));
      if (gap > 0) {
        const dx = (e.x - target.x) / gap * length, dy = (e.y - target.y) / gap * length, obstacles = [...roomLayout(s).obstacles,...(s.expedition?.dungeon?.rooms[s.expedition.room]?.pits ?? [])];
        let stop = 1; for (const wall of obstacles) { const t = segmentBox(target.x, target.y, target.x + dx, target.y + dy, wall, 10); if (t !== null) stop = Math.min(stop, Math.max(0, t - .0001)); }
        moveBody(target, dx * stop, dy * stop, 10, obstacles);
      }
    }
    damageEnemy(s, target, eliteDamage(before, damage), source); hit.add(target.id);
  };
  if (before.mode === 'charge' && !before.chargeHit) {
    const target = [...candidates, ...(!isAlly(before) ? [s.player] : [])].map(q => ({ q, t: segmentCircle(before.x, before.y, e.x, e.y, q.x, q.y, 'id' in q ? isBoss(q) ? 30 : 20 : 17) }))
      .filter(v => v.t !== null && visible(before, v.q, 0, walls)).sort((a, b) => a.t! - b.t! || ('id' in a.q ? a.q.id : 0) - ('id' in b.q ? b.q.id : 0))[0];
    if (target && 'id' in target.q) { apply(target.q, ENEMY_ATTACK.guard.damage); e.chargeHit = true; chargeIntercepted = true; }
  } else if (before.mode === 'windup' && before.timer === 1 && !before.blinkTarget && !before.summonPoints) {
    const attack = ENEMY_ATTACK[before.kind];
    for (const q of candidates) {
      let touches = false;
      if (before.kind === 'heartguard' || before.kind === 'chainhound') {
        const a = ENEMY_ATTACK[before.kind], diff = Math.atan2(q.y - before.y, q.x - before.x) - before.angle;
        touches = distance(before, q) <= a.hitRange && Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff))) <= a.halfAngle && visible(before, q, 0, walls);
      } else if (before.kind === 'shield') touches = segmentCircle(before.x, before.y, before.targetX, before.targetY, q.x, q.y, ENEMY_ATTACK.shield.thrustRadius + (isBoss(q) ? 20 : 10)) !== null && visible(before, q, 0, walls);
      else if (before.kind === 'voidknight') touches = distance(before, q) <= ENEMY_ATTACK.voidknight.hitRange && visible(before, q, 0, walls);
      else if (before.kind === 'sealcaster') { const p = { x: before.targetX, y: before.targetY }; touches = distance(p, q) <= ENEMY_ATTACK.sealcaster.radius && visible(p, q, 0, walls); }
      else if (before.kind === 'readerstatue') {
        const end = { x: before.x + Math.cos(before.angle) * ENEMY_ATTACK.readerstatue.range, y: before.y + Math.sin(before.angle) * ENEMY_ATTACK.readerstatue.range }; let stop = 1;
        // Preserve the pre-impact obstruction even when the laser broke that wall.
        for (const wall of walls) { const t = segmentBox(before.x, before.y, end.x, end.y, wall); if (t !== null) stop = Math.min(stop, t); }
        const angle = before.angle, length = distance(before, end) * stop, c = Math.cos(angle), sn = Math.sin(angle), p = previous.get(q.id) ?? q;
        const local = (v: Point) => ({ x: (v.x - before.x) * c + (v.y - before.y) * sn, y: -(v.x - before.x) * sn + (v.y - before.y) * c });
        const a = local(p), z = local(q), t = segmentBox(a.x, a.y, z.x, z.y, { x: 0, y: -6, w: length, h: 12 }, 10);
        touches = BODY_HEIGHT[q.kind] >= 32 && t !== null && visible(before, { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }, 0, walls);
      }
      if (touches) apply(q, attack.damage, before.kind === 'chainhound');
    }
  }
  if (!e.contactCooldown) {
    const from = previous.get(e.id) ?? before;
    const target = candidates.filter(q => q.hp > 0).map(q => {
      const p = previous.get(q.id) ?? q;
      return { q, t: segmentCircle(from.x - p.x, from.y - p.y, e.x - q.x, e.y - q.y, 0, 0, 20) };
    }).filter(v => v.t !== null).sort((a, b) => a.t! - b.t! || a.q.id - b.q.id)[0];
    if (target) { if (!hit.has(target.q.id)) apply(target.q, 6); e.contactCooldown = PUPPET.contactTicks; }
  }
  return { hits: hit, chargeIntercepted };
}
