import { DT, type Enemy, type EnemyHit, type Point, type RunState } from './model';
import { roomLayout } from './room-layout';
import { distance, moveBody, segmentBox, visible } from './geometry';
import { ENEMY_ATTACK } from './enemy-balance';
import { BODY_HEIGHT, cylinderHit } from './fps-geometry';
import { advanceVoidKnight } from './void-knight';
import { advanceSealCaster } from './seal-caster';
import { advanceChainHound } from './chain-hound';
import { advanceReaderStatue } from './reader-statue';
import { strikeStoneWall, strikeStoneWallArc } from './masonry';
import { eliteCooldown, eliteDamage } from './elite';

export const shieldHealth = (e: Enemy) => e.kind === 'shield' ? e.shieldHp ?? ENEMY_ATTACK.shield.durability : 0;

export function blocksGuardShot(e: Enemy, impact: Point): boolean {
  if (shieldHealth(e) <= 0 || e.shieldDisabledTicks) return false;
  const angle = Math.atan2(impact.y - e.y, impact.x - e.x) - e.angle;
  return Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) <= ENEMY_ATTACK.shield.halfAngle;
}

export function advanceSpecialEnemy(s: RunState, e: Enemy, before: Point = s.player, height = s.player.height ?? 0, actualPlayer: Point = s.player): { move: boolean; hits: EnemyHit[] } {
  if (e.kind === 'readerstatue') return advanceReaderStatue(s, e, before, height);
  if (e.kind === 'chainhound') return advanceChainHound(s, e);
  if (e.kind === 'sealcaster') return advanceSealCaster(s, e);
  if (e.kind === 'voidknight') return advanceVoidKnight(s, e, actualPlayer);
  const hits: { damage: number; cause: string }[] = [], idle = { move: false, hits };
  if (e.kind === 'heartguard') {
    if (e.hp <= 0) return idle;
    const attack = ENEMY_ATTACK.heartguard, p = s.player, layout = roomLayout(s);
    const warn = (strike: 1 | 2) => {
      e.mode = 'windup'; e.comboStrike = strike;
      e.timer = strike === 1 ? attack.windupTicks : attack.followupTicks;
      e.targetX = p.x; e.targetY = p.y; e.angle = Math.atan2(p.y - e.y, p.x - e.x);
    };
    if (e.mode === 'windup') {
      if (--e.timer <= 0) {
        const angle = Math.atan2(p.y - e.y, p.x - e.x) - e.angle;
        if (distance(e, p) <= attack.hitRange && Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) <= attack.halfAngle
          && (p.height ?? 0) <= BODY_HEIGHT.heartguard && visible(e, p, 0, layout.walls)) {
          hits.push({ damage: eliteDamage(e, attack.damage), cause: e.comboStrike === 1 ? '심장 수호병의 첫 베기' : '심장 수호병의 후속 베기' });
        }
        e.mode = 'recover';
        strikeStoneWallArc(s, e, attack.hitRange, attack.halfAngle, eliteDamage(e, attack.damage));
        if (e.comboStrike === 1) { e.comboStrike = 2; e.timer = attack.comboPauseTicks; }
        else { delete e.comboStrike; e.timer = eliteCooldown(e, attack.cooldownTicks); }
      }
      return idle;
    }
    e.timer = Math.max(0, e.timer - 1);
    if (e.comboStrike === 2) {
      if (e.timer === 0) warn(2);
      return idle;
    }
    if (e.mode === 'recover') {
      if (e.timer > eliteCooldown(e, attack.cooldownTicks) - attack.recoveryTicks) return idle;
      if (e.timer === 0) e.mode = 'move';
    }
    if (e.timer === 0 && distance(e, p) <= attack.startRange && visible(e, p, 0, layout.walls)) {
      warn(1); return idle;
    }
    return { move: true, hits };
  }
  if (e.kind !== 'guard' && e.kind !== 'shield') return idle;
  const attack = ENEMY_ATTACK[e.kind], p = s.player, layout = roomLayout(s);
  if (e.mode === 'charge') {
    const beforeEnemy = { x: e.x, y: e.y };
    const length = Math.min(ENEMY_ATTACK.guard.chargeSpeed * DT, Math.hypot(e.targetX - e.x, e.targetY - e.y));
    const wallImpact = !e.chargeHit && strikeStoneWall(s, e, { x: e.x + Math.cos(e.angle) * length, y: e.y + Math.sin(e.angle) * length }, eliteDamage(e, attack.damage), 10);
    if (wallImpact) e.chargeHit = true;
    moveBody(e, Math.cos(e.angle) * length, Math.sin(e.angle) * length, 10, [...layout.obstacles,...(s.expedition?.dungeon?.rooms[s.expedition.room]?.pits ?? [])]);
    if (!e.chargeHit && cylinderHit(before.x - beforeEnemy.x, before.y - beforeEnemy.y,
      p.x - e.x, p.y - e.y, height, p.height ?? 0, 0, 0, 17, BODY_HEIGHT.guard) !== null) {
      e.chargeHit = true; hits.push({ damage: eliteDamage(e, attack.damage), cause: '돌진 파수꾼의 돌진' });
    }
    if (--e.timer <= 0 || Math.hypot(e.targetX - e.x, e.targetY - e.y) < 0.1 || distance(beforeEnemy, e) < 0.001) {
      e.mode = 'recover'; e.timer = eliteCooldown(e, attack.cooldownTicks);
    }
    return idle;
  }
  if (e.mode === 'windup') {
    if (--e.timer <= 0) {
      if (e.kind === 'guard') {
        e.mode = 'charge'; e.timer = Math.max(1, Math.ceil(Math.hypot(e.targetX - e.x, e.targetY - e.y) / ENEMY_ATTACK.guard.chargeSpeed * 60));
      } else {
        if (cylinderHit(e.x - before.x, e.y - before.y, e.targetX - p.x, e.targetY - p.y,
          height, p.height ?? 0, 0, 0, ENEMY_ATTACK.shield.thrustRadius + 7, BODY_HEIGHT.shield) !== null && visible(e, p, 0, layout.walls)) {
          hits.push({ damage: attack.damage, cause: '방패 망령의 찌르기' });
        }
        e.mode = 'recover'; e.timer = attack.cooldownTicks;
        strikeStoneWall(s, e, { x: e.targetX, y: e.targetY }, attack.damage, ENEMY_ATTACK.shield.thrustRadius);
      }
    }
    return idle;
  }
  e.timer = Math.max(0, e.timer - 1);
  if (e.mode === 'recover') {
    if (e.timer > eliteCooldown(e, attack.cooldownTicks) - attack.recoveryTicks) return idle;
    if (e.timer === 0) e.mode = 'move';
  }
  const angle = Math.atan2(p.y - e.y, p.x - e.x), diff = Math.atan2(Math.sin(angle - e.angle), Math.cos(angle - e.angle));
  const facing = e.kind === 'guard' || Math.abs(diff) <= 0.3 || distance(e, p) < 1;
  if (e.timer === 0 && distance(e, p) < attack.startRange && facing && visible(e, p, 0, layout.walls)) {
    e.mode = 'windup'; e.timer = attack.windupTicks; e.angle = e.kind === 'guard' ? angle : e.angle;
    const length = e.kind === 'guard' ? ENEMY_ATTACK.guard.chargeDistance : ENEMY_ATTACK.shield.thrustLength;
    const end = { x: e.x + Math.cos(e.angle) * length, y: e.y + Math.sin(e.angle) * length };
    let stop = 1;
    for (const wall of layout.walls) {
      // Like navigation, allow leaving or sliding along a contact face; moveBody keeps the full body radius.
      const radius = e.kind === 'guard' ? 10 - 0.001 : ENEMY_ATTACK.shield.thrustRadius;
      const t = segmentBox(e.x, e.y, end.x, end.y, wall, radius);
      if (t !== null) stop = Math.min(stop, Math.max(0, t - 0.0001));
    }
    e.targetX = e.x + (end.x - e.x) * stop; e.targetY = e.y + (end.y - e.y) * stop;
    if (e.kind === 'guard') e.chargeHit = false;
    return idle;
  }
  return { move: true, hits };
}
