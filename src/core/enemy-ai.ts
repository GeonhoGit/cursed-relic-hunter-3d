import { BOUNDS, DT, type Box, type Enemy, type EnemyHit, type Point, type RunState } from './model';
import { roomLayout, type RoomLayout } from './room-layout';
import { distance, moveBody, nextWaypoint, visible } from './geometry';
import { ENEMY_ATTACK, ENEMY_BODY_RADIUS } from './enemy-balance';
import { advanceSpecialEnemy } from './enemy-special';
import { stoppedEnemy } from './time-debt';
import { advanceRiftSummon, startRiftSummon } from './rift-shaman';
import { advanceSilence } from './silence';
import { ageLens } from './rift-lens';
import { enemyTarget, isAlly, resetEnemyAttack } from './allegiance';
import { npcAttack } from './npc-combat';
import { generatedShots } from './relic-fields';
import { BODY_HEIGHT, EYE_HEIGHT } from './fps-geometry';
import { eliteCooldown } from './elite';

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

function ageEnemy(state: RunState, e: Enemy): boolean {
  if (e.hp <= 0) return false;
  if (e.frost?.freezeTicks) { e.frost.freezeTicks--; return false; }
  if (stoppedEnemy(state, e.id)) return false;
  if (e.spawnTicks) { e.spawnTicks--; return false; }
  e.flash = Math.max(0, e.flash - 1); ageLens(e);
  if (e.contactCooldown && --e.contactCooldown <= 0) delete e.contactCooldown;
  return !advanceSilence(e);
}
export function advanceEnemies(state: RunState, velocity: Point, before: Point = state.player, height = state.player.height ?? 0): EnemyHit[] {
  if (!state.player.stealthed && !state.decoy && !state.enemies.some(e => isAlly(e) || e.targetId !== undefined || e.contactCooldown)) return advanceEnemyGroup(state, velocity, before, height);
  const positions = new Map(state.enemies.map(e => [e.id, { x: e.x, y: e.y }]));
  if (state.boss) positions.set(state.boss.id, { x: state.boss.x, y: state.boss.y });
  if (state.decoy) positions.set(state.decoy.id, { x: state.decoy.x, y: state.decoy.y });
  const hits: EnemyHit[] = [];
  for (const e of [...state.enemies]) {
    if (!ageEnemy(state, e)) continue;
    const target = enemyTarget(state, e);
    if (!target) {
      if (e.mode === 'windup' || e.mode === 'charge' || e.comboStrike) { resetEnemyAttack(e); e.mode = 'recover'; e.timer = eliteCooldown(e,ENEMY_ATTACK[e.kind].cooldownTicks); }
      else e.timer = Math.max(0, e.timer - 1);
      continue;
    }
    const saved = { ...e }, walls = roomLayout(state).walls;
    const originalPlayer = target === state.player;
    const context: RunState = originalPlayer ? state : { ...state, player: { ...state.player, x: target.x, y: target.y, height: 0, jumpVelocity: 0 } };
    const incoming = advanceEnemyGroup(context, originalPlayer ? velocity : { x: 0, y: 0 },
      originalPlayer ? before : positions.get('id' in target ? target.id : 0) ?? target, originalPlayer ? height : 0, e, true, state);
    if (!originalPlayer) {
      state.nextId = Math.max(state.nextId, context.nextId);
      if (state.stoneWall && state.stoneWall.hp <= 0) delete state.stoneWall;
    }
    const npcImpact = npcAttack(state, saved, e, walls, positions);
    const playerHits = originalPlayer ? incoming : playerSpecialHits(state, saved, walls, before, height);
    const retained = saved.mode === 'charge' && npcImpact.chargeIntercepted ? playerHits.filter(h => h.cause !== '돌진 파수꾼의 돌진') : playerHits;
    if (saved.mode === 'charge' && retained.some(h => h.cause === '돌진 파수꾼의 돌진')) e.chargeHit = true;
    hits.push(...retained);
    if (!state.decoy && !state.enemies.some(isAlly) && !isAlly(e) && e.targetId === 0 && !['windup', 'charge'].includes(e.mode) && !e.comboStrike) delete e.targetId;
  }
  return hits;
}
function playerSpecialHits(state: RunState, before: Enemy, walls: Box[], previousPlayer: Point, height: number): EnemyHit[] {
  if (isAlly(before) || !(before.mode === 'charge' && !before.chargeHit
    || before.mode === 'windup' && before.timer === 1 && !before.blinkTarget && !before.summonPoints)) return [];
  const wall = walls.find(w => 'hp' in w && 'ticks' in w) as RunState['stoneWall'];
  // Query the original attack against the real player without committing its timers,
  // cues, allocation or wall damage a second time.
  const context: RunState = { ...state, player: { ...state.player }, stoneWall: wall ? { ...wall } : undefined, cues: [], bullets: [] };
  return advanceSpecialEnemy(context, { ...before }, previousPlayer, height).hits;
}
function advanceEnemyGroup(state: RunState, velocity: Point, before: Point = state.player, height = state.player.height ?? 0, only?: Enemy, aged = false, original = state): EnemyHit[] {
  const player = state.player, base = roomLayout(state), layout = { ...base, obstacles: [...base.obstacles,...(state.expedition?.dungeon?.rooms[state.expedition.room]?.pits ?? [])] };
  const neighbors = state.enemies.map(e => ({ id: e.id, kind: e.kind, x: e.x, y: e.y }));
  const hits: EnemyHit[] = [];
  // New summons start their grace period on the next simulation tick.
  for (const e of only ? [only] : [...state.enemies]) {
    if (!aged && !ageEnemy(state, e)) continue;
    if (e.kind === 'rat') {
      // Old saves may contain a bite windup or recovery; resume pursuit instead.
      e.mode = 'move'; e.timer = 0;
      steer(e, pursuitGoal(player, velocity, layout), player, neighbors, layout);
      continue;
    }
    if (e.kind === 'readerstatue') {
      hits.push(...advanceSpecialEnemy(state, e, before, height, original.player).hits);
      continue;
    }
    if (e.kind === 'sealcaster') {
      const action = advanceSpecialEnemy(state, e, state.player, state.player.height ?? 0, original.player); hits.push(...action.hits);
      if (action.move) steer(e, archerGoal(e, player, layout), player, neighbors, layout);
      continue;
    }
    if (e.kind === 'riftshaman' && e.summonPoints) { advanceRiftSummon(original, e); continue; }
    if (e.kind === 'guard' || e.kind === 'shield' || e.kind === 'heartguard' || e.kind === 'voidknight' || e.kind === 'chainhound') {
      const action = advanceSpecialEnemy(state, e, before, height, original.player); hits.push(...action.hits);
      if (action.move) steer(e, reachableGoal(player, layout.obstacles), player, neighbors, layout);
      continue;
    }
    const attack = ENEMY_ATTACK[e.kind];
    if (e.mode === 'windup') {
      if (--e.timer <= 0) {
        const angle = Math.atan2(e.targetY - e.y, e.targetX - e.x);
        const speed = ENEMY_ATTACK[e.kind].projectileSpeed;
        const offsets = e.kind === 'watcher' ? Array.from({length:6},(_,i)=>i*Math.PI/3) : e.kind === 'ashpriest' ? [-0.24, 0, 0.24] : [0];
        for (const offset of offsets) {
          if (isAlly(e) && (generatedShots(state) >= 120 || state.bullets.length + (state.orbitShots?.length ?? 0) >= 240)) continue;
          const target = e.targetId ? state.enemies.find(q => q.id === e.targetId) ?? (state.boss?.id === e.targetId ? state.boss : state.decoy?.id === e.targetId ? state.decoy : undefined) : undefined;
          const dh = state.view && target ? BODY_HEIGHT[target.kind] / 2 - EYE_HEIGHT : 0;
          const vertical = dh / (distance(e, player) || 1) * speed, scale = speed / Math.hypot(speed, vertical);
          state.bullets.push({ id: state.nextId++, x: e.x, y: e.y,
          vx: Math.cos(angle + offset) * speed, vy: Math.sin(angle + offset) * speed,
          ...(state.view && target ? { height: EYE_HEIGHT, heightVelocity: vertical * scale, vx: Math.cos(angle + offset) * speed * scale, vy: Math.sin(angle + offset) * speed * scale } : {}),
          life: 240, owner: isAlly(e) ? 'player' : 'enemy', damage: isAlly(e) && e.kind === 'riftshaman' ? 8 : attack.damage,
          ...(isAlly(e) ? { kind: 'ally' as const, originalEnemyId: e.id, sourceRelicId: 'R17' as const }
            : state.expedition?.acquired.includes('R17') ? { originalEnemyId: e.id } : {}),
          ...(['ashpriest','watcher','riftshaman'].includes(e.kind) ? { source: e.kind as 'ashpriest' | 'watcher' | 'riftshaman' } : {}) });
        }
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
    if (e.kind === 'riftshaman' && !isAlly(e) && e.timer === 0 && startRiftSummon(original, e)) continue;
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
