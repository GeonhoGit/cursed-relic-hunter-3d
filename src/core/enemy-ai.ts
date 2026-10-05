import { BOUNDS, DT, type Box, type Enemy, type EnemyHit, type Point, type RunState } from './model';
import { roomLayout, type RoomLayout } from './room-layout';
import { distance, moveBody, nextWaypoint, visible } from './geometry';
import { ENEMY_ATTACK, ENEMY_BODY_RADIUS } from './enemy-balance';
import { advanceSpecialEnemy } from './enemy-special';
import { stoppedEnemy } from './time-debt';
import { advanceRiftSummon, startRiftSummon } from './rift-shaman';
import { advanceSilence } from './silence';
import { ageLens } from './rift-lens';

type Neighbor = Point & { id: number; kind: Enemy['kind'] };
const BODY_RADIUS = ENEMY_BODY_RADIUS;
const RAT_SPEED = 102;
const ARCHER_SPEED = 66;

function reachableGoal(point: Point, obstacles: readonly Box[]): Point {
  // A player's smaller body may fit where an enemy's body cannot.
  const margin = BODY_RADIUS + 1;
  let goal = {
    x: Math.max(BOUNDS.x + margin, Math.min(BOUNDS.x + BOUNDS.w - margin, point.x)),
    y: Math.max(BOUNDS.y + margin, Math.min(BOUNDS.y + BOUNDS.h - margin, point.y)),
  };
  for (const box of obstacles) {
    const left = box.x - margin, right = box.x + box.w + margin;
    const top = box.y - margin, bottom = box.y + box.h + margin;
    if (goal.x > left && goal.x < right && goal.y > top && goal.y < bottom) {
      const choices = [{ x: left, y: goal.y }, { x: right, y: goal.y }, { x: goal.x, y: top }, { x: goal.x, y: bottom }];
      choices.sort((a, b) => distance(a, goal) - distance(b, goal)); goal = choices[0];
    }
  }
  return goal;
}

function archerGoal(e: Enemy, player: Point, layout: RoomLayout): Point {
  const near = distance(e, player), side = e.id % 2 ? 1 : -1;
  const away = Math.atan2(e.y - player.y, e.x - player.x);
  if (near < 140) {
    // A wall behind an archer should produce a side escape, not endless backpedaling.
    const offsets = [0, side * 0.65, -side * 0.65, side * 1.2, -side * 1.2, side * Math.PI / 2, -side * Math.PI / 2];
    const candidates = offsets.map(offset => reachableGoal({ x: e.x + Math.cos(away + offset) * 80, y: e.y + Math.sin(away + offset) * 80 }, layout.obstacles));
    const score = (p: Point) => (distance(p, player) - near) * 1.5 + distance(p, e) * 0.2 + (visible(e, p, BODY_RADIUS - 0.001, layout.walls) ? 30 : -15);
    candidates.sort((a, b) => score(b) - score(a));
    return candidates[0];
  }
  if (near > 245 || !visible(e, player, 2, layout.walls)) return reachableGoal(player, layout.obstacles);
  // Reposition around the player between shots. Once windup begins, this stops.
  const options = [side, -side].map(direction => reachableGoal({
    x: player.x + Math.cos(away + direction * 0.3) * Math.min(near, 205),
    y: player.y + Math.sin(away + direction * 0.3) * Math.min(near, 205),
  }, layout.obstacles));
  return options.find(p => distance(p, e) > 8 && visible(e, p, BODY_RADIUS - 0.001, layout.walls)) ?? options[0];
}

function pursuitGoal(player: Point, velocity: Point, layout: RoomLayout): Point {
  return reachableGoal({ x: player.x + velocity.x * 0.18, y: player.y + velocity.y * 0.18 }, layout.obstacles);
}

function steer(e: Enemy, goal: Point, player: Point, neighbors: Neighbor[], layout: RoomLayout) {
  const waypoint = nextWaypoint(e, goal, BODY_RADIUS, layout.obstacles);
  const remaining = distance(e, waypoint);
  let dx = remaining > 1 ? (waypoint.x - e.x) / remaining : 0;
  let dy = remaining > 1 ? (waypoint.y - e.y) / remaining : 0;
  for (const other of neighbors) {
    if (other.id === e.id) continue;
    const gap = distance(e, other);
    if (gap >= 28) continue;
    if (gap < 0.01) {
      const angle = Math.atan2(player.y - e.y, player.x - e.x) + (e.id < other.id ? Math.PI / 2 : -Math.PI / 2);
      dx += Math.cos(angle) * 1.2; dy += Math.sin(angle) * 1.2;
    } else {
      const weight = (28 - gap) / 28 * 1.4;
      dx += (e.x - other.x) / gap * weight; dy += (e.y - other.y) / gap * weight;
    }
  }
  const magnitude = Math.hypot(dx, dy);
  if (magnitude < 0.01) return;
  dx /= magnitude; dy /= magnitude;
  if (e.kind === 'archer' || e.kind === 'ashpriest' || e.kind === 'watcher' || e.kind === 'riftshaman' || e.kind === 'sealcaster') {
    // Archers can walk backwards or sideways while keeping the player in view.
    e.angle = Math.atan2(player.y - e.y, player.x - e.x);
    moveBody(e, dx * ARCHER_SPEED * DT, dy * ARCHER_SPEED * DT, BODY_RADIUS, layout.obstacles);
  } else {
    const angle = Math.atan2(dy, dx), diff = Math.atan2(Math.sin(angle - e.angle), Math.cos(angle - e.angle));
    const turn = e.kind === 'shield' ? 0.035 : 0.065;
    e.angle += Math.max(-turn, Math.min(turn, diff));
    // Turn before crossing a corner instead of driving into the pillar at full speed.
    const baseSpeed = e.kind === 'chainhound' ? ENEMY_ATTACK.chainhound.moveSpeed : e.kind === 'voidknight' ? ENEMY_ATTACK.voidknight.moveSpeed : e.kind === 'heartguard' ? ENEMY_ATTACK.heartguard.moveSpeed : e.kind === 'guard' ? 78 : e.kind === 'shield' ? 60 : RAT_SPEED;
    const speed = baseSpeed * Math.max(0.15, Math.cos(diff));
    const stride = Math.min(speed * DT, remaining > 1 ? remaining : speed * DT);
    moveBody(e, Math.cos(e.angle) * stride, Math.sin(e.angle) * stride, BODY_RADIUS, layout.obstacles);
  }
}

export function advanceEnemies(state: RunState, velocity: Point, before: Point = state.player, height = state.player.height ?? 0): EnemyHit[] {
  const player = state.player, layout = roomLayout(state);
  const neighbors = state.enemies.map(e => ({ id: e.id, kind: e.kind, x: e.x, y: e.y }));
  const hits: EnemyHit[] = [];
  // New summons start their grace period on the next simulation tick.
  for (const e of [...state.enemies]) {
    if (e.hp <= 0) continue;
    if (e.frost?.freezeTicks) { e.frost.freezeTicks--; continue; }
    if (stoppedEnemy(state, e.id)) continue;
    if (e.spawnTicks) { e.spawnTicks--; continue; }
    e.flash = Math.max(0, e.flash - 1);
    ageLens(e);
    if (advanceSilence(e)) continue;
    if (e.kind === 'rat') {
      // Old saves may contain a bite windup or recovery; resume pursuit instead.
      e.mode = 'move'; e.timer = 0;
      steer(e, pursuitGoal(player, velocity, layout), player, neighbors, layout);
      continue;
    }
    if (e.kind === 'readerstatue') {
      hits.push(...advanceSpecialEnemy(state, e, before, height).hits);
      continue;
    }
    if (e.kind === 'sealcaster') {
      const action = advanceSpecialEnemy(state, e); hits.push(...action.hits);
      if (action.move) steer(e, archerGoal(e, player, layout), player, neighbors, layout);
      continue;
    }
    if (e.kind === 'riftshaman' && e.summonPoints) { advanceRiftSummon(state, e); continue; }
    if (e.kind === 'guard' || e.kind === 'shield' || e.kind === 'heartguard' || e.kind === 'voidknight' || e.kind === 'chainhound') {
      const action = advanceSpecialEnemy(state, e); hits.push(...action.hits);
      if (action.move) steer(e, reachableGoal(player, layout.obstacles), player, neighbors, layout);
      continue;
    }
    const attack = ENEMY_ATTACK[e.kind];
    if (e.mode === 'windup') {
      if (--e.timer <= 0) {
        const angle = Math.atan2(e.targetY - e.y, e.targetX - e.x);
        const speed = ENEMY_ATTACK[e.kind].projectileSpeed;
        const offsets = e.kind === 'watcher' ? Array.from({length:6},(_,i)=>i*Math.PI/3) : e.kind === 'ashpriest' ? [-0.24, 0, 0.24] : [0];
        for (const offset of offsets) state.bullets.push({ id: state.nextId++, x: e.x, y: e.y,
          vx: Math.cos(angle + offset) * speed, vy: Math.sin(angle + offset) * speed,
          life: 240, owner: 'enemy', damage: attack.damage, ...(['ashpriest','watcher','riftshaman'].includes(e.kind) ? { source: e.kind as 'ashpriest' | 'watcher' | 'riftshaman' } : {}) });
        e.mode = 'recover'; e.timer = attack.cooldownTicks;
      }
      continue;
    }
    e.timer = Math.max(0, e.timer - 1);
    if (e.mode === 'recover') {
      if (e.timer > attack.cooldownTicks - attack.recoveryTicks) continue;
      if (e.timer === 0) e.mode = 'move';
    }
    const near = distance(e, player);
    if (e.kind === 'riftshaman' && e.timer === 0 && startRiftSummon(state, e)) continue;
    const inRange = near >= (e.kind === 'ashpriest' ? 80 : 110) && near <= 280;
    if (e.timer === 0 && inRange && visible(e, player, 2, layout.walls)) {
      e.mode = 'windup'; e.timer = attack.windupTicks;
      e.targetX = player.x; e.targetY = player.y; e.angle = Math.atan2(player.y - e.y, player.x - e.x);
      continue;
    }
    const goal = archerGoal(e, player, layout);
    steer(e, goal, player, neighbors, layout);
  }
  return hits;
}
