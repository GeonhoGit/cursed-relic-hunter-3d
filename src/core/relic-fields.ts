import { DT, isBoss, type Boss, type Bullet, type Enemy, type Point, type RunState } from './model';
import { distance, moveBody, visible } from './geometry';
import { groundObstacles as bodyObstacles, roomLayout } from './room-layout';
import { hasRelic } from './relics';
import { playerEyeHeight } from './fps-geometry';
import { ENEMY_BODY_RADIUS } from './enemy-balance';
import { stoppedEnemy } from './time-debt';
import { clearCharms, isAlly } from './allegiance';
import { clearScarecrow } from './scarecrow';
import { clearAnchor } from './anchor';
import { GATEKEEPER } from './boss';

export const ORBIT = { radius: 26, ticks: 21, speed: 320, life: 60, budget: 120 } as const;
export const GRAVITY = { radius: 64, ticks: 90, speed: 50, cooldown: 300 } as const;
export const THORN = { radius: 6, ticks: 120, damage: 4, interval: 30, limit: 2 } as const;
export const CROWN = { radius: 60, damage: 12, cooldown: 60 } as const;
type Damage = (s: RunState, e: Enemy | Boss, amount: number) => void;
export const generatedShots = (s: RunState) => s.bullets.filter(b => b.kind === 'split' || b.kind === 'orbit' || b.kind === 'ally').length + (s.orbitShots?.length ?? 0);
export function orbitPoint(s: RunState, shot: NonNullable<RunState['orbitShots']>[number]) {
  return { x: s.player.x + Math.cos(shot.angle) * ORBIT.radius, y: s.player.y + Math.sin(shot.angle) * ORBIT.radius,
    height: playerEyeHeight(s.player) };
}
export function orbitAfterFiring(s: RunState, damage: number, eventId: number, vertical: boolean) {
  if (!hasRelic(s, 'R06')) return;
  s.player.orbitCount = ((s.player.orbitCount ?? 0) + 1) % 4;
  if (s.player.orbitCount || generatedShots(s) >= ORBIT.budget || s.bullets.length + (s.orbitShots?.length ?? 0) >= 240) return;
  (s.orbitShots ??= []).push({ id: s.nextId++, eventId, damage: damage * .5, ticks: ORBIT.ticks, angle: s.player.aim,
    ...(vertical ? { vertical: true } : {}), bouncesLeft: hasRelic(s, 'R01') ? 2 : 0 });
}
export function advanceOrbits(s: RunState, pitch?: number) {
  const remaining: NonNullable<RunState['orbitShots']> = [];
  for (const shot of s.orbitShots ?? []) {
    shot.angle = Math.atan2(Math.sin(shot.angle + DT * 8), Math.cos(shot.angle + DT * 8));
    if (--shot.ticks > 0) { remaining.push(shot); continue; }
    const orbit = orbitPoint(s, shot), walls = roomLayout(s).walls;
    const origin = [orbit, s.player].find(p => visible(s.player, p, 2, walls));
    if (!origin || s.bullets.length >= 240) continue;
    const angle = s.player.aim, elevation = pitch ?? 0;
    s.bullets.push({ id: shot.id, eventId: shot.eventId, kind: 'orbit', x: origin.x, y: origin.y,
      vx: Math.cos(angle) * Math.cos(elevation) * ORBIT.speed, vy: Math.sin(angle) * Math.cos(elevation) * ORBIT.speed,
      ...(shot.vertical || pitch !== undefined ? { height: playerEyeHeight(s.player), heightVelocity: Math.sin(elevation) * ORBIT.speed } : {}),
      damage: shot.damage, life: ORBIT.life, bouncesLeft: shot.bouncesLeft, owner: 'player', hitIds: [] });
  }
  if (remaining.length) s.orbitShots = remaining; else delete s.orbitShots;
}
export function gravityHit(s: RunState, b: Bullet) {
  if (b.kind || b.gravityDone || !hasRelic(s, 'R10') || s.player.gravityCooldown || s.gravityWell) return;
  b.gravityDone = true;
  const eventId = b.eventId ?? b.id;
  for (const sibling of s.bullets) if (sibling.owner === 'player' && !sibling.kind && (sibling.eventId ?? sibling.id) === eventId) sibling.gravityDone = true;
  s.gravityWell = { id: s.nextId++, eventId, x: b.x, y: b.y, ticks: GRAVITY.ticks };
  s.player.gravityCooldown = GRAVITY.cooldown;
}
export function ageRelicFields(s: RunState) {
  if (s.gravityWell && --s.gravityWell.ticks <= 0) delete s.gravityWell;
  if (s.thornTrails) {
    s.thornTrails = s.thornTrails.filter(t => --t.ticks > 0);
    if (!s.thornTrails.length) delete s.thornTrails;
  }
  if (s.thornHits) { s.thornHits = s.thornHits.filter(h => s.tick - h.tick < THORN.interval); if (!s.thornHits.length) delete s.thornHits; }
}
export function pullGravity(s: RunState) {
  const well = s.gravityWell; if (!well) return;
  const walls = roomLayout(s).walls, obstacles = bodyObstacles(s);
  for (const e of s.enemies) {
    const gap = distance(well, e);
    if (e.hp <= 0 || isAlly(e) || e.spawnTicks || e.frost?.freezeTicks || stoppedEnemy(s, e.id) || gap <= .001 || gap > GRAVITY.radius || !visible(well, e, 0, walls)) continue;
    const amount = Math.min(gap, GRAVITY.speed * DT);
    moveBody(e, (well.x - e.x) / gap * amount, (well.y - e.y) / gap * amount, ENEMY_BODY_RADIUS, obstacles);
  }
}
export function beginThornTrail(s: RunState, damage: number) {
  delete s.player.thornTrailId;
  if (!hasRelic(s, 'R15') || (s.thornTrails?.length ?? 0) >= THORN.limit) return;
  const id = s.nextId++; s.player.thornTrailId = id;
  (s.thornTrails ??= []).push({ id, ticks: THORN.ticks, damage, points: [{ x: s.player.x, y: s.player.y }] });
}
export function recordThornMovement(s: RunState, from: Point, via?: Point) {
  const trail = s.thornTrails?.find(t => t.id === s.player.thornTrailId);
  // Forced displacement ends this path; it must not become a long damaging segment.
  if (trail && distance(trail.points.at(-1)!, from) > .001) { delete s.player.thornTrailId; return; }
  if (trail && hasRelic(s, 'R15')) {
    for (const p of [...(via ? [via] : []), s.player]) if (distance(trail.points.at(-1)!, p) > .0001) trail.points.push({ x: p.x, y: p.y });
  }
  if (!trail || !hasRelic(s, 'R15') || s.player.dodgeRemaining === 0) delete s.player.thornTrailId;
}
function closest(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return { x: a.x + dx * t, y: a.y + dy * t };
}
export function thornDamage(s: RunState, damage: Damage) {
  const stage = s.boss?.stage, walls = roomLayout(s).walls;
  for (const e of [...s.enemies, ...(s.boss ? [s.boss] : [])]) {
    if (e.hp <= 0 || s.thornHits?.some(h => h.id === e.id && s.tick - h.tick < THORN.interval)) continue;
    const trail = s.thornTrails?.find(t => t.points.some((a, i) => {
      const near = closest(e, a, t.points[i + 1] ?? a);
      return distance(e, near) <= THORN.radius + (isBoss(e) ? GATEKEEPER.bodyRadius : ENEMY_BODY_RADIUS) && visible(near, e, 0, walls);
    }));
    if (!trail) continue;
    const hp = e.hp; damage(s, e, trail.damage);
    if (s.boss?.stage !== stage) return;
    if (e.hp < hp) (s.thornHits ??= []).push({ id: e.id, tick: s.tick });
  }
}
export function crownOnHurt(s: RunState, amount: number, damage: Damage) {
  if (s.player.hp <= 0 || !hasRelic(s, 'R23') || s.player.thornsCooldown) return;
  s.player.thornsCooldown = CROWN.cooldown;
  s.cues.push({ id: s.nextId++, kind: 'thorns', x: s.player.x, y: s.player.y, tick: s.tick, amount: CROWN.radius });
  const stage = s.boss?.stage;
  for (const e of [...s.enemies, ...(s.boss ? [s.boss] : [])]) if (e.hp > 0 && distance(s.player, e) <= CROWN.radius && visible(s.player, e, 0, roomLayout(s).walls)) {
    damage(s, e, amount); if (s.boss?.stage !== stage) break;
  }
}
export function clearRelicFields(s: RunState) {
  clearScarecrow(s);
  clearCharms(s);
  delete s.stoneWall;
  delete s.orbitShots; delete s.gravityWell; delete s.thornTrails; delete s.thornHits; delete s.player.thornTrailId;
}
export function clearLostRelicFields(s: RunState) {
  if(!hasRelic(s,'R28'))delete s.player.pitDodge;
  if (!hasRelic(s, 'R26')) { clearAnchor(s); if (s.player.equippedAux === 'R26') s.player.equippedAux = null; }
  if (!hasRelic(s, 'R18')) { clearScarecrow(s); if (s.player.equippedAux === 'R18') s.player.equippedAux = null; }
  if (!hasRelic(s, 'R17')) { clearCharms(s); if (s.player.equippedAux === 'R17') s.player.equippedAux = null; }
  if (!hasRelic(s, 'R16')) { delete s.stoneWall; if (s.player.equippedAux === 'R16') s.player.equippedAux = null; }
  if (!hasRelic(s, 'R06')) delete s.orbitShots;
  if (!hasRelic(s, 'R10')) delete s.gravityWell;
  if (!hasRelic(s, 'R15')) { delete s.thornTrails; delete s.thornHits; delete s.player.thornTrailId; }
}
