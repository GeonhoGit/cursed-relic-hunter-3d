import { BOUNDS, type Enemy, type Point, type RunState } from './model';
import { ENCOUNTER_SIZE, ENEMY_ATTACK, ENEMY_BODY_RADIUS } from './enemy-balance';
import { distance, visible } from './geometry';
import { roomLayout } from './room-layout';
import { spikeTraps } from './traps';

function safeSpawn(s: RunState, p: Point) {
  return distance(p, s.player) >= 96 && visible(p, p, ENEMY_BODY_RADIUS, [...roomLayout(s).obstacles,...(s.expedition?.dungeon?.rooms[s.expedition.room]?.pits ?? [])])
    && visible(p, p, ENEMY_BODY_RADIUS, spikeTraps(s))
    && s.enemies.every(e => e.hp <= 0 || distance(p, e) >= 28);
}
export function startRiftSummon(s: RunState, e: Enemy): boolean {
  const reserved = s.enemies.reduce((sum, q) => sum + (q.hp > 0 ? q.summonPoints?.length ?? 0 : 0), s.boss?.reservedSummons ?? 0);
  const limit=s.expedition?.dungeon?.layoutVersion===3?(s.expedition.dungeon.rooms[s.expedition.room].kind==='elite'?6:8):ENCOUNTER_SIZE.max;
  if (s.riftSummonUsed || s.enemies.filter(q => q.hp > 0).length + reserved + 2 > limit
    || distance(e, s.player) > 280 || !visible(e, s.player, 2, roomLayout(s).walls)) return false;
  const positions = Array.from({ length: 7 }, (_, row) => BOUNDS.y + 45 + row * (BOUNDS.h - 90) / 6)
    .flatMap(y => Array.from({ length: 11 }, (_, column) => ({ x: BOUNDS.x + 45 + column * (BOUNDS.w - 90) / 10, y })))
    .filter(p => safeSpawn(s, p) && s.enemies.every(q => !q.summonPoints?.some(other => distance(p, other) < 28)))
    .sort((a, b) => distance(a, e) - distance(b, e));
  if (positions.length < 2) return false;
  s.riftSummonUsed = true; e.summonPoints = positions.slice(0, 2); e.mode = 'windup'; e.timer = ENEMY_ATTACK.riftshaman.summonTicks;
  e.targetX = s.player.x; e.targetY = s.player.y; e.angle = Math.atan2(e.targetY - e.y, e.targetX - e.x);
  return true;
}
export function advanceRiftSummon(s: RunState, e: Enemy) {
  if (--e.timer > 0) return;
  for (const p of e.summonPoints!) {
    if (s.enemies.filter(q => q.hp > 0).length >= ENCOUNTER_SIZE.max || !safeSpawn(s, p)) continue;
    s.enemies.push({ id: s.nextId++, kind: 'rat', ...p, hp: 30, maxHp: 30, angle: Math.atan2(s.player.y - p.y, s.player.x - p.x),
      mode: 'move', timer: 0, targetX: s.player.x, targetY: s.player.y, flash: 0, spawnTicks: 48 });
  }
  delete e.summonPoints; e.mode = 'recover'; e.timer = ENEMY_ATTACK.riftshaman.cooldownTicks;
}
