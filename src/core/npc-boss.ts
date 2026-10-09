import { type Boss, type Box, type Point, type RunState } from './model';
import { damageEnemy } from './combat';
import { isAlly, PUPPET } from './allegiance';
import { distance, segmentBox, segmentCircle, visible } from './geometry';
import { GATEKEEPER } from './boss';
import { sweptWave } from './heart-boss';
import { BODY_HEIGHT } from './fps-geometry';

export function bossNpcDamage(s: RunState, before: Boss | undefined, walls: Box[], positions: Map<number, Point>): boolean {
  const b = s.boss;
  if (!b || !before || b.hp <= 0 || b.mode === 'transition') return false;
  if (b.contactCooldown && --b.contactCooldown <= 0) delete b.contactCooldown;
  const allies = [...s.enemies.filter(e => e.hp > 0 && isAlly(e)), ...(s.decoy?.hp ? [s.decoy] : [])], hit = new Set<number>(); let intercept = false;
  const apply = (e: typeof allies[number], damage: number) => { damageEnemy(s, e, damage, 'enemy'); hit.add(e.id); };
  if (before.kind === 'gatekeeper' && before.mode === 'charge' && !before.chargeHit) {
    const first = [...allies, s.player].map(e => ({ e, t: segmentCircle(before.x, before.y, b.x, b.y, e.x, e.y, GATEKEEPER.bodyRadius + ('id' in e ? 10 : 7)) }))
      .filter(v => v.t !== null).sort((a, c) => a.t! - c.t! || ('id' in a.e ? a.e.id : 0) - ('id' in c.e ? c.e.id : 0))[0];
    if (first && 'id' in first.e) { apply(first.e, 18); b.chargeHit = true; intercept = true; }
  }
  const fired = before.mode === 'windup' && before.timer === 1 && (b.mode === 'recover' || b.mode === 'wave');
  for (const e of allies) {
    if (e.hp <= 0) continue;
    if (fired && before.kind === 'gatekeeper' && before.pattern === 'rocks') {
      for (const rock of before.rocks) if (distance(rock, e) <= GATEKEEPER.rockRadius && visible(rock, e, 0, walls)) apply(e, 16);
    } else if (fired && before.kind === 'chainpriest' && before.pattern === 'chains') {
      if (visible(before, e, 0, walls) && before.chains?.some(c => segmentCircle(c.x, c.y, c.tx, c.ty, e.x, e.y, 17) !== null)) apply(e, 16);
    } else if (fired && before.kind === 'relicheart' && before.pattern === 'laser') {
      const end = { x: before.x + Math.cos(before.angle) * 1400, y: before.y + Math.sin(before.angle) * 1400 }; let stop = 1;
      for (const wall of walls) { const t = segmentBox(before.x, before.y, end.x, end.y, wall); if (t !== null) stop = Math.min(stop, t); }
      const c = Math.cos(before.angle), sn = Math.sin(before.angle), length = distance(before, end) * stop;
      const local = (p: Point) => ({ x: (p.x - before.x) * c + (p.y - before.y) * sn, y: -(p.x - before.x) * sn + (p.y - before.y) * c });
      const p = positions.get(e.id) ?? e, a = local(p), z = local(e), t = segmentBox(a.x, a.y, z.x, z.y, { x: 0, y: -6, w: length, h: 12 }, 10);
      if (BODY_HEIGHT[e.kind] >= 32 && t !== null && visible(before, { x: p.x + (e.x - p.x) * t, y: p.y + (e.y - p.y) * t }, 0, walls)) apply(e, 22);
    } else if (before.kind === 'relicheart' && before.mode === 'wave' && (b.shockRadius ?? 0) > (before.shockRadius ?? 0) && (e.kind === 'decoy' ? b.decoyShockHit : b.allyShockHit) !== e.id) {
      const context = { ...s, stoneWall: walls.find(w => 'id' in w && w.id === s.stoneWall?.id) as RunState['stoneWall'], player: { ...s.player, x: e.x, y: e.y, height: 0 } };
      // Retain an obstacle removed by the same expanding wave for this tick's impacts.
      const oldWall = walls.find(w => 'hp' in w && 'ticks' in w); if (oldWall) context.stoneWall = oldWall as RunState['stoneWall'];
      if (sweptWave(context, positions.get(e.id) ?? e, 0, before.shockRadius ?? 0, b.shockRadius!, 10)) { apply(e, 18); if (e.kind === 'decoy') b.decoyShockHit = e.id; else b.allyShockHit = e.id; }
    }
    if (e.hp > 0 && !b.contactCooldown) {
      const p = positions.get(e.id) ?? e;
      if (segmentCircle(p.x - before.x, p.y - before.y, e.x - b.x, e.y - b.y, 0, 0, GATEKEEPER.bodyRadius + 10) !== null) {
        if (!hit.has(e.id)) apply(e, 12); b.contactCooldown = PUPPET.contactTicks;
      }
    }
  }
  return intercept;
}
