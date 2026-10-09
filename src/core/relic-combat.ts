import { DT, isBoss, unreflectableBullet, type Boss, type Bullet, type Enemy, type Point, type RunState } from './model';
import { hasRelic } from './relics';
import { distance, segmentBox, visible } from './geometry';
import { roomLayout } from './room-layout';
import { BODY_HEIGHT, CEILING_HEIGHT, EYE_HEIGHT, boxHit3D, cylinderHit, playerEyeHeight } from './fps-geometry';
import { MASONRY } from './masonry';
import { blocksBossShot } from './boss';
import { blocksGuardShot } from './enemy-special';

export const LIGHTNING = { range: 80, targets: 3, cooldown: 72 } as const;
export const STARLIGHT = { range: 260, halfWidth: 4, rest: 60, cooldown: 240 } as const;
export const WARD = { radius: 22, hitRadius: 6, cooldown: 180 } as const;
type Damage = (s: RunState, e: Enemy | Boss, damage: number) => void;
const targets = (s: RunState) => [...s.enemies.filter(e => !e.charm), ...(s.boss ? [s.boss] : [])];
const blocked = (e: Enemy | Boss, origin: Point) => isBoss(e) ? blocksBossShot(e, origin) : e.kind === 'shield' && blocksGuardShot(e, origin);
function lineCue(s: RunState, kind: 'lightning' | 'starlight', a: Point, b: Point, amount: number, height = EYE_HEIGHT, endHeight = height) {
  s.cues.push({ id: s.nextId++, kind, x: a.x, y: a.y, end: { x: b.x, y: b.y }, amount, tick: s.tick,
    height, endHeight });
}
export function lightningHit(s: RunState, origin: Enemy | Boss, b: Bullet, damage: Damage) {
  if (b.kind || b.lightningDone || !hasRelic(s, 'R09') || s.player.lightningCooldown) return;
  const visited = new Set([origin.id]), stage = s.boss?.stage;
  let from = origin;
  for (let hop = 0; hop < LIGHTNING.targets; hop++) {
    const next = targets(s).filter(e => e.hp > 0 && !visited.has(e.id) && distance(from, e) <= LIGHTNING.range
      && visible(from, e, 0, roomLayout(s).walls) && !blocked(e, from))
      .sort((a, c) => distance(from, a) - distance(from, c) || a.id - c.id)[0];
    if (!next) break;
    b.lightningDone = true;
    for (const sibling of s.bullets) if (sibling.owner === 'player' && !sibling.kind
      && (sibling.eventId ?? sibling.id) === (b.eventId ?? b.id)) sibling.lightningDone = true;
    visited.add(next.id); s.player.lightningCooldown = LIGHTNING.cooldown;
    lineCue(s, 'lightning', from, next, b.damage * .5, BODY_HEIGHT[from.kind] / 2, BODY_HEIGHT[next.kind] / 2);
    damage(s, next, b.damage * .5); from = next;
    if (s.boss?.stage !== stage) break;
  }
}
export function starlightEnd(s: RunState, pitch?: number) {
  const p = s.player, angle = pitch ?? 0;
  const end = { x: p.x + Math.cos(p.aim) * Math.cos(angle) * STARLIGHT.range,
    y: p.y + Math.sin(p.aim) * Math.cos(angle) * STARLIGHT.range };
  const height = pitch === undefined ? undefined : playerEyeHeight(p);
  const endHeight = height === undefined ? undefined : height + Math.sin(angle) * STARLIGHT.range;
  let stop = 1;
  for (const wall of roomLayout(s).walls) {
    const t = wall === s.stoneWall ? boxHit3D(p, end, height, endHeight, wall, MASONRY.height, 0) : segmentBox(p.x, p.y, end.x, end.y, wall);
    if (t !== null) stop = Math.min(stop, t);
  }
  if (height !== undefined && endHeight !== undefined && (endHeight < 0 || endHeight > CEILING_HEIGHT))
    stop = Math.min(stop, ((endHeight < 0 ? 0 : CEILING_HEIGHT) - height) / (endHeight - height));
  return { end: { x: p.x + (end.x - p.x) * stop, y: p.y + (end.y - p.y) * stop }, height,
    endHeight: height === undefined ? undefined : Math.max(0, Math.min(CEILING_HEIGHT, height + (endHeight! - height) * stop)) };
}
export function fireStarlight(s: RunState, firingDamage: number, pitch: number | undefined, damage: Damage) {
  if (!hasRelic(s, 'R14') || s.player.starlightCooldown || (s.player.starlightRest ?? 0) < STARLIGHT.rest) return;
  s.player.starlightCooldown = STARLIGHT.cooldown;
  const p = s.player, ray = starlightEnd(s, pitch), stage = s.boss?.stage;
  lineCue(s, 'starlight', p, ray.end, firingDamage * 1.5, ray.height, ray.endHeight);
  const hits = targets(s).filter(e => e.hp > 0 && visible(p, e, 0, roomLayout(s, false).walls)
    && cylinderHit(p.x, p.y, ray.end.x, ray.end.y, ray.height, ray.endHeight,
      e.x, e.y, (isBoss(e) ? 22 : 12) + STARLIGHT.halfWidth, BODY_HEIGHT[e.kind]) !== null)
    .sort((a, b) => distance(p, a) - distance(p, b) || a.id - b.id);
  for (const e of hits) {
    if (!blocked(e, p)) damage(s, e, firingDamage * 1.5);
    if (s.boss?.stage !== stage) break;
  }
}
export function wardPoint(s: RunState) {
  const angle = s.tick * DT * 1.8;
  return { x: s.player.x + Math.cos(angle) * WARD.radius, y: s.player.y + Math.sin(angle) * WARD.radius, height: playerEyeHeight(s.player) };
}
export function wardContact(s: RunState, b: Bullet, end: Point, height?: number,
  previousPlayer: Point = s.player, previousPlayerHeight = s.player.height ?? 0): number | null {
  if (b.owner !== 'enemy' || unreflectableBullet(b) || !hasRelic(s, 'R19') || s.player.wardCooldown) return null;
  const p = wardPoint(s);
  return cylinderHit(b.x - previousPlayer.x, b.y - previousPlayer.y, end.x - s.player.x, end.y - s.player.y,
    b.height === undefined ? undefined : b.height - EYE_HEIGHT - previousPlayerHeight + 4,
    height === undefined ? undefined : height - p.height + 4, p.x - s.player.x, p.y - s.player.y, WARD.hitRadius, 8);
}
export function blockWithWard(s: RunState, point: Point) {
  s.player.wardCooldown = WARD.cooldown;
  s.cues.push({ id: s.nextId++, kind: 'ward', x: point.x, y: point.y, tick: s.tick, amount: 0, height: wardPoint(s).height });
}
