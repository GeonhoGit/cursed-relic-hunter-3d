import { BOUNDS, type Bullet, type Point, type RunState } from './model';
import { currentRoom } from './dungeon';
import { distance, segmentBox, visible } from './geometry';
import { stoneWallBlocksExit } from './masonry';
import { hasRelic } from './relics';
import { bodyObstacles, roomLayout } from './room-layout';
import { spikeTraps } from './traps';

export const PORTAL = { range: 120, radius: 8, height: 60, firstDuration: 300, duration: 360,
  cooldown: 720, maxTrips: 2, reentryLock: 12 } as const;
type PortalPoint = Point & { height?: number };
export interface PortalCrossing { t: number; point: Point; exit: Point; portalId: number }

function portalTarget(s: RunState, aim: Point): Point {
  const dx = aim.x - s.player.x, dy = aim.y - s.player.y;
  const ratio = Math.min(1, PORTAL.range / (Math.hypot(dx, dy) || 1));
  return { x: s.player.x + dx * ratio, y: s.player.y + dy * ratio };
}
export function portalFailure(s: RunState, aim: Point): string | null {
  if (!hasRelic(s, 'R40') || !['combat', 'explore'].includes(s.phase)) return '지금은 공허의 문을 설치할 수 없습니다.';
  if (s.player.auxCooldowns?.R40) return '공허의 문이 아직 재사용 대기 중입니다.';
  if (s.portals?.second) return '공허의 문은 한 번에 한 쌍만 설치할 수 있습니다.';
  if (!Number.isFinite(aim.x) || !Number.isFinite(aim.y)) return '안전한 지상 위치를 조준하세요.';
  const point = portalTarget(s, aim), radius = PORTAL.radius;
  // Placement always checks the ground, including walls beneath an airborne player.
  const ground = { ...s, player: { ...s.player, height: 0 } };
  if (point.x - radius < BOUNDS.x || point.y - radius < BOUNDS.y
    || point.x + radius > BOUNDS.x + BOUNDS.w || point.y + radius > BOUNDS.y + BOUNDS.h
    || [...bodyObstacles(ground), ...spikeTraps(s), ...(currentRoom(s)?.pits ?? [])]
      .some(box => segmentBox(point.x, point.y, point.x, point.y, box, radius) !== null)
    || !visible(s.player, point, radius, roomLayout(ground).walls)) return '벽·가구·구덩이·위험 지형에는 설치할 수 없습니다.';
  const reserved = [...s.enemies.filter(e => e.hp > 0)
    .flatMap(e => [...(e.summonPoints ?? []), ...(e.blinkTarget ? [e.blinkTarget] : [])]),
    ...(s.boss?.hp && s.boss.kind === 'chainpriest' && s.boss.pattern === 'ritual'
      && s.boss.mode === 'windup' && s.boss.reservedSummons ? s.boss.rocks : [])];
  const bodies = [{ ...s.player, radius: 7 }, ...s.enemies.filter(e => e.hp > 0).map(e => ({ ...e, radius: 10 })),
    ...(s.boss?.hp ? [{ ...s.boss, radius: 20 }] : []), ...(s.decoy ? [{ ...s.decoy, radius: 7 }] : []),
    ...(s.bombs ?? []).map(b => ({ ...b, radius: 4 })), ...reserved.map(p => ({ ...p, radius: 10 }))];
  if (bodies.some(p => distance(point, p) <= radius + p.radius)) return '몸체·폭탄·출현 예정 위치에는 설치할 수 없습니다.';
  if (s.portals && distance(point, s.portals.first) <= radius * 2) return '두 공허의 문이 겹치지 않는 위치를 조준하세요.';
  const box = { x: point.x - radius, y: point.y - radius, w: radius * 2, h: radius * 2 };
  return stoneWallBlocksExit(s, box) ? '출구 앞에는 공허의 문을 설치할 수 없습니다.' : null;
}
export function placePortal(s: RunState, aim: Point): boolean {
  if (portalFailure(s, aim)) return false;
  const point = portalTarget(s, aim);
  if (s.portals) {
    s.portals.second = point; s.portals.ticks = PORTAL.duration;
    (s.player.auxCooldowns ??= {}).R40 = PORTAL.cooldown;
  } else s.portals = { first: point, ticks: PORTAL.firstDuration, id: s.nextId++ };
  return true;
}
export function clearPortals(s: RunState) { delete s.portals; }
export function cancelFirstPortal(s: RunState): boolean {
  if (!s.portals || s.portals.second) return false;
  clearPortals(s); return true;
}
export function agePortals(s: RunState) {
  if (s.portals && (!hasRelic(s, 'R40') || s.phase === 'dead' || --s.portals.ticks <= 0)) clearPortals(s);
}
export function portalExitSafe(s: RunState, point: Point): boolean {
  // Match the projectile's 2u terrain clearance; bodies remain normal bullet targets after exiting.
  const radius = 2, ground = { ...s, player: { ...s.player, height: 0 } };
  return Number.isFinite(point.x) && Number.isFinite(point.y)
    && point.x - radius >= BOUNDS.x && point.y - radius >= BOUNDS.y
    && point.x + radius <= BOUNDS.x + BOUNDS.w && point.y + radius <= BOUNDS.y + BOUNDS.h
    && [...bodyObstacles(ground).filter(box => !('decoyId' in box)), ...spikeTraps(s), ...(currentRoom(s)?.pits ?? [])]
      .every(box => segmentBox(point.x, point.y, point.x, point.y, box, radius) === null);
}

// Return the first overlap of a swept point with the portal's circular ground footprint and height span.
function crossingTime(from: PortalPoint, to: PortalPoint, center: Point, startHeight: number, endHeight: number): number | null {
  const dx = to.x - from.x, dy = to.y - from.y, ox = from.x - center.x, oy = from.y - center.y;
  const a = dx * dx + dy * dy, c = ox * ox + oy * oy - PORTAL.radius * PORTAL.radius;
  let near = 0, far = 1;
  if (a < 1e-12) {
    if (c > 0) return null;
  } else {
    const b = 2 * (ox * dx + oy * dy), discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    const root = Math.sqrt(discriminant);
    near = Math.max(near, (-b - root) / (2 * a)); far = Math.min(far, (-b + root) / (2 * a));
  }
  const dh = endHeight - startHeight;
  if (Math.abs(dh) < 1e-12) {
    if (startHeight < 0 || startHeight > PORTAL.height) return null;
  } else {
    const bottom = -startHeight / dh, top = (PORTAL.height - startHeight) / dh;
    near = Math.max(near, Math.min(bottom, top)); far = Math.min(far, Math.max(bottom, top));
  }
  return near <= far ? near : null;
}
export function portalCrossing(s: RunState, b: Bullet, from: PortalPoint, to: PortalPoint): PortalCrossing | null {
  const pair = s.portals;
  if (!pair?.second || pair.ticks <= 0 || b.life <= 0 || (b.portalTrips ?? 0) >= PORTAL.maxTrips
    || (b.portalPairId === pair.id && s.tick < (b.portalLockUntil ?? 0))) return null;
  const startHeight = from.height ?? b.height ?? 0, endHeight = to.height ?? startHeight;
  if (![from.x, from.y, to.x, to.y, startHeight, endHeight].every(Number.isFinite)
    || (distance(from, to) < 1e-12 && Math.abs(endHeight - startHeight) < 1e-12)) return null;
  let first: PortalCrossing | null = null;
  for (const [entry, exit] of [[pair.first, pair.second], [pair.second, pair.first]]) {
    const t = crossingTime(from, to, entry, startHeight, endHeight);
    if (t === null || (first && t >= first.t)) continue;
    const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    first = { t, point, exit: { x: exit.x + point.x - entry.x, y: exit.y + point.y - entry.y }, portalId: pair.id };
  }
  return first;
}
