import type { Boss, Bullet, Enemy, RunState } from './model';
import { hasRelic } from './relics';

export function frostHit(s: RunState, e: Enemy | Boss, b: Bullet) {
  if (b.kind || !hasRelic(s, 'R08') || e.hp <= 0) return;
  const f = e.frost ??= { hits: [], freezeTicks: 0, resistTicks: 0 };
  f.hits = f.hits.filter(h => s.tick - h.tick <= 180);
  const eventId = b.eventId ?? b.id;
  if (f.resistTicks || f.hits.some(h => h.eventId === eventId)) return;
  f.hits.push({ eventId, tick: s.tick });
  if (f.hits.length === 4) { f.hits = []; f.freezeTicks = 36; f.resistTicks = 216; }
}
export function ageFrost(s: RunState) {
  for (const e of [...s.enemies, ...(s.boss ? [s.boss] : [])]) if (e.frost) {
    e.frost.resistTicks = Math.max(0, e.frost.resistTicks - 1);
    e.frost.hits = e.frost.hits.filter(h => s.tick - h.tick <= 180);
  }
}
export function splitShot(s: RunState, b: Bullet, target: Enemy | Boss, pending: Bullet[]) {
  if (b.kind || b.splitDone || !hasRelic(s, 'R03')) return;
  b.splitDone = true;
  // Every pellet shares the volley budget; surviving siblings retain it in saves.
  const eventId = b.eventId ?? b.id;
  for (const sibling of s.bullets) if (sibling.owner === 'player' && !sibling.kind && (sibling.eventId ?? sibling.id) === eventId) sibling.splitDone = true;
  if (s.bullets.filter(q => q.kind === 'split').length + pending.length + 3 > 120) return;
  const angle = Math.atan2(b.vy, b.vx);
  const pitch = Math.atan2(b.heightVelocity ?? 0, Math.hypot(b.vx, b.vy));
  for (const offset of [-25, 0, 25]) {
    const a = angle + offset * Math.PI / 180;
    pending.push({ id: s.nextId++, eventId: b.eventId ?? b.id, kind: 'split', originTargetId: target.id,
      x: b.x, y: b.y, vx: Math.cos(a) * 320 * Math.cos(pitch), vy: Math.sin(a) * 320 * Math.cos(pitch), life: 36,
      ...(b.height === undefined ? {} : { height: b.height, heightVelocity: Math.sin(pitch) * 320 }),
      owner: 'player', damage: b.damage * 0.35, bouncesLeft: hasRelic(s, 'R01') ? 2 : 0, hitIds: [] });
  }
}
export function canHitOnReturn(s: RunState, b: Bullet, id: number) {
  return b.originTargetId !== id && (b.phase !== 'return' || !b.outboundHits?.some(h => h.id === id && s.tick - h.tick < 15));
}
export function expireShot(s: RunState, b: Bullet): boolean {
  if (--b.life > 0) return true;
  if (b.owner !== 'player' || b.kind || b.phase || !hasRelic(s, 'R04')) return false;
  b.phase = 'return'; b.life = 60; b.hitIds = []; return true;
}
