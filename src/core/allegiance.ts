import { isBoss, type Enemy, type Npc, type Point, type RunState } from './model';
import { hasRelic } from './relics';
import { distance } from './geometry';
import { BODY_HEIGHT, boxHit3D, CEILING_HEIGHT, playerEyeHeight } from './fps-geometry';
import { roomLayout } from './room-layout';
import { MASONRY } from './masonry';

export const PUPPET = { range: 100, duration: 240, cooldown: 840, contactTicks: 45 } as const;
export const isAlly = (e: Npc) => e.kind !== 'decoy' && !isBoss(e) && e.charm !== undefined;
export function resetEnemyAttack(e: Enemy) {
  e.mode = 'move'; e.timer = 0; e.targetX = e.x; e.targetY = e.y;
  delete e.targetId; delete e.chargeHit; delete e.comboStrike; delete e.summonPoints; delete e.blinkTarget; delete e.blinkTick; delete e.laserTicks;
}
function changeFaction(e: Enemy) {
  const recovery = e.mode === 'recover' && e.comboStrike !== 2 ? e.timer : 0;
  resetEnemyAttack(e); if (recovery > 0) { e.mode = 'recover'; e.timer = recovery; }
}
export function releaseCharm(e: Enemy) { delete e.charm; changeFaction(e); }
export function clearCharms(s: RunState) { for (const e of s.enemies) if (isAlly(e)) releaseCharm(e); if (s.boss) delete s.boss.allyShockHit; }
export function ageCharms(s: RunState) {
  for (const e of s.enemies) if (e.charm && (!hasRelic(s, 'R17') || --e.charm.ticks <= 0 || e.hp <= 0)) releaseCharm(e);
}
export function puppetTarget(s: RunState, aim: Point, pitch?: number): Enemy | undefined {
  if (!Number.isFinite(aim.x) || !Number.isFinite(aim.y) || (pitch !== undefined && !Number.isFinite(pitch))) return;
  const height = playerEyeHeight(s.player), walls = roomLayout(s).walls;
  return s.enemies.filter(e => e.hp > 0 && !e.elite && !e.spawnTicks && !isAlly(e) && distance(e, aim) <= PUPPET.range
    && (pitch === undefined || Math.abs(pitch - Math.atan2(BODY_HEIGHT[e.kind] / 2 - height, distance(s.player, e))) <= .45)
    && !walls.some(w => boxHit3D(s.player, e, pitch === undefined ? undefined : height,
      pitch === undefined ? undefined : BODY_HEIGHT[e.kind] / 2, w, w === s.stoneWall ? MASONRY.height : CEILING_HEIGHT, 0) !== null))
    .sort((a, b) => distance(a, aim) - distance(b, aim) || a.id - b.id)[0];
}
export function puppetFailure(s: RunState, aim: Point, pitch?: number): string | null {
  if (!hasRelic(s, 'R17') || s.phase !== 'combat') return '전투 중인 일반 몬스터를 조준하세요.';
  if (s.player.auxCooldowns?.R17) return '꼭두각시 실이 아직 재사용 대기 중입니다.';
  if (s.enemies.some(e => e.hp > 0 && isAlly(e))) return '한 번에 한 마리만 전환할 수 있습니다.';
  return puppetTarget(s, aim, pitch) ? null : '조준점 가까이에 전환할 몬스터가 없습니다.';
}
export function charmEnemy(s: RunState, aim: Point, pitch?: number): boolean {
  if (puppetFailure(s, aim, pitch)) return false;
  const e = puppetTarget(s, aim, pitch)!; changeFaction(e);
  e.charm = { ticks: PUPPET.duration, ownerFaction: 'player', sourceRelicId: 'R17', originalEnemyId: e.id };
  (s.player.auxCooldowns ??= {}).R17 = PUPPET.cooldown;
  if (s.timeStop) s.timeStop.enemyIds = s.timeStop.enemyIds.filter(id => id !== e.id);
  return true;
}
export function opponents(s: RunState, e: Enemy): Npc[] {
  return isAlly(e) ? [...s.enemies.filter(q => q.hp > 0 && !isAlly(q) && !q.spawnTicks),
    ...(s.boss && s.boss.hp > 0 && s.boss.mode !== 'transition' ? [s.boss] : [])]
    : [...s.enemies.filter(q => q.hp > 0 && isAlly(q)), ...(s.decoy?.hp ? [s.decoy] : [])];
}
export function enemyTarget(s: RunState, e: Enemy): Npc | RunState['player'] | undefined {
  const locked = e.mode === 'windup' || e.mode === 'charge' || e.comboStrike === 2;
  const candidates = [...opponents(s, e), ...(!isAlly(e) && (!s.player.stealthed || locked) ? [s.player] : [])];
  const id = (p: typeof candidates[number]) => 'id' in p ? p.id : 0;
  if (locked && e.targetId === undefined && !isAlly(e)) { if (s.decoy || s.enemies.some(isAlly)) e.targetId = 0; return s.player; }
  if (locked && e.targetId !== undefined) return candidates.find(p => id(p) === e.targetId);
  const target = !isAlly(e) && s.decoy?.hp ? s.decoy : candidates.sort((a, b) => distance(e, a) - distance(e, b) || id(a) - id(b))[0];
  if (target && (s.decoy || isAlly(e) || s.enemies.some(isAlly) || e.targetId !== undefined)) e.targetId = id(target);
  return target;
}
