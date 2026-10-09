import { BOUNDS, DT, type Boss, type BossPattern, type Point, type RunState } from './model';
import { roomLayout } from './room-layout';
import { distance, moveBody, nextWaypoint, segmentBox, segmentCircle, visible } from './geometry';
import { advancePriest, createPriest, startPriestPattern } from './priest-boss';
import { advanceHeart, checkHeartTransition, createHeart, heartProtected, startHeartPattern } from './heart-boss';
import { ageLens } from './rift-lens';
import { clearRelicFields } from './relic-fields';
import { blastStoneWall, strikeStoneWall } from './masonry';
import { decoyBounds } from './scarecrow';

export const GATEKEEPER = {
  hp: 1800, bodyRadius: 20, hitRadius: 24, stoneSpeed: 190, chargeSpeed: 360, chargeDistance: 300,
  rockRadius: 36, shieldHalfAngle: 50 * Math.PI / 180,
  chaseSpeed: 78, enragedChaseSpeed: 96, chaseStop: 64,
  windup: { fan: 48, charge: 60, rocks: 72, shield: 120 }, recovery: 72, transition: 60,
} as const;
const PATTERNS: BossPattern[] = ['fan', 'charge', 'rocks', 'shield'];

export function createBoss(s: RunState): Boss {
  if (s.expedition?.region === 3) return createHeart(s);
  if (s.expedition?.region === 2) return createPriest(s);
  const x = BOUNDS.x + BOUNDS.w / 2, y = BOUNDS.y + BOUNDS.h / 2;
  return { id: s.nextId++, kind: 'gatekeeper', x, y, hp: GATEKEEPER.hp, maxHp: GATEKEEPER.hp,
    angle: Math.atan2(s.player.y - y, s.player.x - x), flash: 0, stage: 1, pattern: 'fan', mode: 'windup',
    timer: 48, targetX: s.player.x, targetY: s.player.y, chargeHit: false, rocks: [], impactTicks: 0,
    summonsDone: false, transitionTick: -1 };
}
export function startBossPattern(s: RunState, pattern: BossPattern) {
  if (s.boss?.kind === 'relicheart') { startHeartPattern(s, pattern); return; }
  if (s.boss?.kind === 'chainpriest') { startPriestPattern(s, pattern); return; }
  if (!['fan','charge','rocks','shield'].includes(pattern)) return;
  const b = s.boss!; b.pattern = pattern; b.mode = pattern === 'shield' ? 'shield' : 'windup';
  b.timer = GATEKEEPER.windup[pattern as keyof typeof GATEKEEPER.windup]; b.targetX = s.player.x; b.targetY = s.player.y;
  b.angle = Math.atan2(b.targetY - b.y, b.targetX - b.x); b.chargeHit = false; b.rocks = []; b.impactTicks = 0;
  if (pattern === 'charge') {
    const length = Math.min(GATEKEEPER.chargeDistance, distance(b, s.player));
    const end = { x: b.x + Math.cos(b.angle) * length, y: b.y + Math.sin(b.angle) * length };
    let stop = 1;
    for (const wall of roomLayout(s).walls) {
      const t = segmentBox(b.x, b.y, end.x, end.y, wall, GATEKEEPER.bodyRadius);
      if (t !== null) stop = Math.min(stop, Math.max(0, t - 0.0001));
    }
    b.targetX = b.x + (end.x - b.x) * stop; b.targetY = b.y + (end.y - b.y) * stop;
  } else if (pattern === 'rocks') {
    b.rocks = [[0, 0], [80, -50], [-80, 50]].map(([x, y]) => ({
      x: Math.max(BOUNDS.x + 7, Math.min(BOUNDS.x + BOUNDS.w - 7, s.player.x + x)),
      y: Math.max(BOUNDS.y + 7, Math.min(BOUNDS.y + BOUNDS.h - 7, s.player.y + y)),
    }));
  }
}
export function blocksBossShot(b: Boss, impact: Point): boolean {
  if (heartProtected(b)) return true;
  if (b.mode === 'transition') return true;
  if (b.mode !== 'shield') return false;
  const angle = Math.atan2(impact.y - b.y, impact.x - b.x) - b.angle;
  return Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) <= GATEKEEPER.shieldHalfAngle;
}
export function checkBossTransition(s: RunState) {
  const b = s.boss;
  if (b?.kind === 'relicheart') { checkHeartTransition(s); return; }
  if (!b || b.hp <= 0 || b.stage !== 1 || b.hp > b.maxHp * (b.kind === 'chainpriest' ? 0.6 : 0.5)) return;
  b.stage = 2; b.mode = 'transition'; b.timer = GATEKEEPER.transition; b.transitionTick = s.tick;
  delete b.silenceTicks;
  b.rocks = []; b.impactTicks = 0; s.bullets = [];
  clearRelicFields(s);
  if (b.kind === 'chainpriest') { b.chains = []; delete b.reservedSummons; }
}
function recover(b: Boss) {
  b.mode = 'recover'; b.timer = b.stage === 2 && b.pattern === 'charge' ? 24 : GATEKEEPER.recovery;
}
function pursue(s: RunState, speed: number) {
  const b = s.boss!, layout = roomLayout(s), near = distance(b, s.player);
  const inSight = visible(b, s.player, 0, layout.walls);
  if (inSight && near <= GATEKEEPER.chaseStop) return;
  // A player at a wall or pillar can occupy positions the larger boss cannot reach.
  const goal = { x: s.player.x, y: s.player.y };
  moveBody(goal, 0, 0, GATEKEEPER.bodyRadius + 1, layout.obstacles);
  const next = nextWaypoint(b, goal, GATEKEEPER.bodyRadius, layout.obstacles), gap = distance(b, next);
  if (gap < 0.001) return;
  const stride = Math.min(speed * DT, gap, inSight ? Math.max(0, near - GATEKEEPER.chaseStop) : Infinity);
  moveBody(b, (next.x - b.x) / gap * stride, (next.y - b.y) / gap * stride, GATEKEEPER.bodyRadius, layout.obstacles);
}
function summonRats(s: RunState) {
  const b = s.boss!;
  if (b.summonsDone) return;
  b.summonsDone = true;
  const positions = [{ x: 100, y: 90 }, { x: 100, y: 275 }, { x: 320, y: 80 },
    { x: 320, y: 280 }, { x: 540, y: 90 }, { x: 540, y: 275 }]
    .filter(p => distance(p, s.player) >= 96 && distance(p, b) >= 45 && (!s.decoy || visible(p, p, 10, [decoyBounds(s.decoy)])))
    .sort((a, c) => distance(c, s.player) - distance(a, s.player));
  for (const p of positions.slice(0, 2)) s.enemies.push({ id: s.nextId++, kind: 'rat', ...p, hp: 30, maxHp: 30,
    angle: Math.atan2(s.player.y - p.y, s.player.x - p.x), mode: 'move', timer: 0,
    targetX: s.player.x, targetY: s.player.y, flash: 0, spawnTicks: 48 });
}

export function advanceBoss(s: RunState, previousPlayer?:Point, previousHeight?:number): { damage: number; cause: string }[] {
  const b = s.boss, hits: { damage: number; cause: string }[] = [];
  if (!b || b.hp <= 0) return hits;
  ageLens(b);
  if (b.kind === 'relicheart') return advanceHeart(s,previousPlayer,previousHeight);
  if (b.kind === 'chainpriest') return advancePriest(s);
  const moveScale = b.frost?.freezeTicks ? 0.8 : 1;
  if (b.frost?.freezeTicks) b.frost.freezeTicks--;
  b.flash = Math.max(0, b.flash - 1);
  if (b.impactTicks > 0 && --b.impactTicks === 0) b.rocks = [];
  if (b.mode === 'transition') {
    if (s.tick > b.transitionTick && --b.timer <= 0) { summonRats(s); startBossPattern(s, 'fan'); }
    return hits;
  }
  if (b.mode === 'charge') {
    const before = { x: b.x, y: b.y }, length = Math.min(GATEKEEPER.chargeSpeed * DT * moveScale, Math.hypot(b.targetX - b.x, b.targetY - b.y));
    if (!b.chargeHit && strikeStoneWall(s, b, { x: b.x + Math.cos(b.angle) * length, y: b.y + Math.sin(b.angle) * length }, 18, GATEKEEPER.bodyRadius)) b.chargeHit = true;
    moveBody(b, Math.cos(b.angle) * length, Math.sin(b.angle) * length, GATEKEEPER.bodyRadius, roomLayout(s).obstacles);
    if (!b.chargeHit && segmentCircle(before.x, before.y, b.x, b.y, s.player.x, s.player.y, GATEKEEPER.bodyRadius + 7) !== null) {
      b.chargeHit = true; hits.push({ damage: 18, cause: '문지기 석상의 돌진' });
    }
    if (--b.timer <= 0 || Math.hypot(b.targetX - b.x, b.targetY - b.y) < 0.1 || distance(before, b) < 0.001) recover(b);
    return hits;
  }
  const chaseSpeed = (b.stage === 2 ? GATEKEEPER.enragedChaseSpeed : GATEKEEPER.chaseSpeed) * moveScale;
  if (b.mode === 'recover') {
    const recovery = b.stage === 2 && b.pattern === 'charge' ? 24 : GATEKEEPER.recovery;
    if (b.timer <= recovery - 12) {
      pursue(s, chaseSpeed);
      b.angle = Math.atan2(s.player.y - b.y, s.player.x - b.x);
    }
  } else if (b.mode === 'shield' || (b.mode === 'windup' && b.pattern === 'fan' && b.timer > 12)) {
    // Advance slowly without rotating an already announced fan or shield direction.
    pursue(s, chaseSpeed * 0.55);
  }
  if (--b.timer > 0) return hits;
  if (b.mode === 'recover') { startBossPattern(s, PATTERNS[(PATTERNS.indexOf(b.pattern) + 1) % PATTERNS.length]); return hits; }
  if (b.mode === 'shield') { recover(b); return hits; }
  if (b.pattern === 'fan') {
    const count = b.stage === 1 ? 5 : 7;
    for (let i = 0; i < count; i++) {
      const angle = b.angle + (i - (count - 1) / 2) * 0.22;
      s.bullets.push({ id: s.nextId++, x: b.x, y: b.y, vx: Math.cos(angle) * GATEKEEPER.stoneSpeed,
        vy: Math.sin(angle) * GATEKEEPER.stoneSpeed, owner: 'enemy', source: 'gatekeeper', damage: 12, life: 240 });
    }
    recover(b);
  } else if (b.pattern === 'charge') {
    b.mode = 'charge'; b.timer = Math.max(1, Math.ceil(Math.hypot(b.targetX - b.x, b.targetY - b.y) / GATEKEEPER.chargeSpeed * 60));
  } else if (b.pattern === 'rocks') {
    for (const rock of b.rocks) if (distance(rock, s.player) <= GATEKEEPER.rockRadius && visible(rock, s.player, 0, roomLayout(s).walls)) hits.push({ damage: 16, cause: '문지기 석상의 낙석' });
    for (const rock of b.rocks) blastStoneWall(s, rock, GATEKEEPER.rockRadius, 16);
    b.impactTicks = 12; recover(b);
  }
  return hits;
}
