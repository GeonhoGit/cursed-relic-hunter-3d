import { BOUNDS, DT, type RunState, type InputState, type Enemy, type Direction } from './model';
import { distance, moveBody, visible } from './geometry';
import { bodyObstacles, roomLayout } from './room-layout';
import { advanceEnemies } from './enemy-ai';
import { random } from './random';
import { canContinue, prepareReward, roomInfo } from './expedition';
import { hasRelic } from './relics';
import { advanceBurn, advanceProjectiles, cue } from './combat';
import { advanceBoss, createBoss, GATEKEEPER } from './boss';
import { clearHeartShield } from './heart-boss';
import { adjacentRooms, createDungeon, currentRoom, DIRECTIONS, exitDirection } from './dungeon';
import { CONTACT_DAMAGE, ENCOUNTER_SIZE, ENEMY_ATTACK, ENEMY_BODY_RADIUS, ENEMY_HEALTH, ENEMY_NAMES } from './enemy-balance';
import { advanceBombs } from './bombs';
import { ageFrost } from './projectile-effects';
import { advanceDodgeRecharge, dodgeCharges, startDodgeRecharge } from './dodge';
import { currentWeapon } from './weapons';
import { useAuxiliary } from './auxiliary';
import { advanceAuxiliaryRecharge, endTimeStop, finishTimeStopTick } from './time-debt';
import { reviveContract } from './curses';
import { refreshShop } from './shop';
import { attackStats } from './attack-relics';
import { BODY_HEIGHT, cylinderHit, playerEyeHeight } from './fps-geometry';
import { advanceJump, landingImpact, resetJump } from './jump';
import { spikeTraps, trapHits } from './traps';
import { advanceWeakness, advanceSlow, clearCombatEffects, playerDamage, walkingSpeed } from './player-effects';
import { regionDungeonSeed, roomStructure } from './room-structures';
import { applyChainPull } from './chain-hound';
import { healAfterCombat, receivedDamage } from './survival-relics';

export const emptyInput = (): InputState => ({ moveX: 0, moveY: 0, aimX: 500, aimY: 180, fire: false, dodge: false });
const SPAWN_GRID = Array.from({ length: 7 }, (_, row) => BOUNDS.y + 45 + row * (BOUNDS.h - 90) / 6)
  .flatMap(y => Array.from({ length: 11 }, (_, column) => ({ x: BOUNDS.x + 45 + column * (BOUNDS.w - 90) / 10, y })));

export function createRun(seed: number): RunState {
  const s: RunState = {
    version: 1, seed: seed >>> 0, rng: (seed >>> 0) || 1, tick: 0, nextId: 1,
    phase: 'ready', readyTicks: 48, wave: 1, waveDelay: 0,
    player: { x: 96, y: 180, hp: 100, aim: 0, lastX: 0, lastY: 1,
      dodgeRemaining: 0, dodgeX: 0, dodgeY: 1, dodgeCooldown: 0, invulnerable: 0, fireCooldown: 0 },
    enemies: [], bullets: [], cues: [], gold: 0, lastDamage: '',
    expedition: { route: 'gatekeeper', room: 0, relics: [], acquired: [], reward: null },
    stats: { shots: 0, hits: 0, kills: 0, damage: 0, dodges: 0 },
  };
  spawnWave(s); return s;
}

export function advanceRoom(s: RunState): boolean {
  if (s.expedition?.route === 'maze') return false;
  if (s.phase !== 'cleared' || !canContinue(s) || !s.expedition || (roomInfo(s).reward && !s.expedition.reward?.choice)) return false;
  endTimeStop(s);
  s.expedition.room++; s.expedition.reward = null;
  delete s.chaliceHealed;
  clearCombatEffects(s);
  s.phase = 'ready'; s.readyTicks = 48; s.wave = 1; s.waveDelay = 0;
  s.enemies = []; s.bullets = []; s.cues = []; delete s.bombs;
  s.player.x = 96; s.player.y = 180; s.player.dodgeRemaining = 0; s.player.invulnerable = 0;
  resetJump(s.player);
  if (roomInfo(s).boss) s.boss = createBoss(s); else spawnWave(s);
  return true;
}

export function createDungeonRun(seed: number): RunState {
  const s = createRun(seed);
  s.expedition = { route: 'maze', region: 1, room: 0, relics: [], acquired: [], reward: null, dungeon: createDungeon(s.seed) };
  s.phase = 'explore'; s.readyTicks = 0; s.enemies = []; s.player.x = 320; s.player.y = 183;
  return s;
}
export function travel(s: RunState, direction: Direction): boolean {
  if (s.phase !== 'explore' || !currentRoom(s)?.cleared) return false;
  const door = adjacentRooms(s).find(d => d.direction === direction);
  if (!door) return false;
  endTimeStop(s);
  const node = door.room, delta = DIRECTIONS[direction];
  clearCombatEffects(s);
  if (!node.visited && node.kind !== 'boss' && node.structure === undefined && s.expedition!.dungeon!.layoutVersion === 1) {
    node.structure = roomStructure(regionDungeonSeed(s.seed, s.expedition!.region ?? 1), node.id);
  }
  s.expedition!.room = node.id; node.visited = true;
  s.enemies = []; s.bullets = []; s.cues = []; delete s.boss; delete s.bombs;
  s.wave = 1; s.waveDelay = 0; s.readyTicks = 0;
  s.player.x = 320 - delta.x * (BOUNDS.w / 2 - 40); s.player.y = 183 - delta.y * (BOUNDS.h / 2 - 33);
  resetJump(s.player);
  s.player.dodgeRemaining = 0; s.player.invulnerable = 0;
  if ((s.expedition!.region ?? 1) >= 2 && node.kind === 'combat') s.trapTicks = 0; else delete s.trapTicks;
  if (node.kind === 'shop') { node.cleared = true; s.phase = 'explore'; refreshShop(s); return true; }
  if (node.cleared) { s.phase = node.reward?.choice === null ? 'cleared' : 'explore'; return true; }
  if (node.kind === 'treasure') { node.cleared = true; s.phase = 'explore'; }
  else if (node.kind === 'altar') { node.cleared = true; s.phase = 'cleared'; prepareReward(s); }
  else { s.phase = 'ready'; s.readyTicks = 48; if (node.kind === 'boss') s.boss = createBoss(s); else spawnWave(s); }
  return true;
}

function spawnWave(s: RunState) {
  const positions = [{ x: 520, y: 104 }, { x: 500, y: 258 }, { x: 330, y: 85 },
    { x: 320, y: 280 }, { x: 115, y: 90 }, { x: 120, y: 270 }, { x: 552, y: 180 }];
  const roster: Enemy['kind'][] = roomInfo(s).waves[s.wave - 1], kinds = [...roster];
  if (currentRoom(s)?.kind === 'combat') {
    const min = s.expedition?.region === 3 ? 8 : s.expedition?.region === 2 ? 7 : ENCOUNTER_SIZE.min;
    const count = min + Math.floor(random(s) * (ENCOUNTER_SIZE.max - min + 1));
    while (kinds.length < count) kinds.push(roster[Math.floor(random(s) * roster.length)]);
    // Enough distinct, obstacle-free positions for ten enemies from any doorway.
    positions.push({ x: 80, y: 180 }, { x: 170, y: 180 }, { x: 265, y: 180 }, { x: 375, y: 180 },
      { x: 470, y: 180 }, { x: 320, y: 140 }, { x: 320, y: 225 }, { x: 180, y: 70 },
      { x: 450, y: 70 }, { x: 180, y: 300 }, { x: 450, y: 300 });
  }
  const layout = roomLayout(s), points = s.expedition?.dungeon?.layoutVersion === 1 ? SPAWN_GRID : positions;
  const available = points.filter(p => distance(p, s.player) >= 110 && visible(p, p, 10, layout.walls) && visible(p, p, 10, spikeTraps(s)));
  for (const kind of kinds) {
    const index = Math.floor(random(s) * available.length), p = available.splice(index, 1)[0];
    s.enemies.push({ id: s.nextId++, kind, ...p, hp: ENEMY_HEALTH[kind], maxHp: ENEMY_HEALTH[kind],
      angle: Math.PI, mode: 'move', timer: 20, targetX: s.player.x, targetY: s.player.y, flash: 0 });
  }
}

export function step(s: RunState, input: InputState) {
  if (s.phase === 'cleared' || s.phase === 'dead') return;
  s.tick++;
  s.cues = s.cues.filter(c => s.tick - c.tick < 30);
  const p = s.player;
  p.aim = Math.atan2(input.aimY - p.y, input.aimX - p.x);
  if (s.phase === 'ready') {
    s.readyTicks--;
    if (s.readyTicks <= 0) s.phase = 'combat';
    return;
  }
  p.invulnerable = Math.max(0, p.invulnerable - 1);
  advanceWeakness(s);
  advanceSlow(s);
  if (p.silenceCooldown && --p.silenceCooldown <= 0) delete p.silenceCooldown;
  if ((s.expedition?.region ?? 1) >= 2 && currentRoom(s)?.kind === 'combat') s.trapTicks = (s.trapTicks ?? 0) + 1;
  advanceDodgeRecharge(s);
  advanceAuxiliaryRecharge(s);
  const stats = attackStats(s), fireCarry = p.fireCooldown > 0 ? Math.min(0, p.fireCooldown - 1) : 0;
  p.fireCooldown = Math.max(0, p.fireCooldown - 1);
  // Fractional intervals can leave a tiny remainder at an exact firing boundary.
  if (p.fireCooldown < 1e-9) p.fireCooldown = 0;
  const length = Math.hypot(input.moveX, input.moveY);
  const beforeMove = { x: p.x, y: p.y };
  const beforeHeight = p.height ?? 0;
  const landed = advanceJump(s, input.jump);
  // Keep start positions to detect contact between ticks, including moving enemies.
  // Spawn grace and boss transitions are safe even on their final tick.
  const contactBodies = s.enemies.filter(e => e.hp > 0 && !e.spawnTicks)
    .map(e => ({ body: e, x: e.x, y: e.y }));
  const contactBoss = s.boss && s.boss.hp > 0 && s.boss.mode !== 'transition'
    ? { body: s.boss, x: s.boss.x, y: s.boss.y } : undefined;
  const obstacles = bodyObstacles(s);
  const mx = length ? input.moveX / length : 0, my = length ? input.moveY / length : 0;
  if (length) { p.lastX = mx; p.lastY = my; }
  if (input.dodge && dodgeCharges(s) > 0 && p.dodgeRemaining === 0) {
    p.dodgeRemaining = 0.24; p.dodgeCharges!--; p.parryUsed = false;
    if (p.dodgeCooldown === 0) startDodgeRecharge(s);
    p.dodgeX = p.lastX; p.dodgeY = p.lastY; s.stats.dodges++;
    cue(s, 'dodge', p.x, p.y);
  }
  if (p.dodgeRemaining > 0) {
    const elapsed = Math.min(DT, p.dodgeRemaining);
    moveBody(p, p.dodgeX * 300 * elapsed, p.dodgeY * 300 * elapsed, 7, obstacles);
    p.dodgeRemaining = Math.max(0, p.dodgeRemaining - DT);
  } else moveBody(p, mx * walkingSpeed(s, stats.moveSpeed) * DT, my * walkingSpeed(s, stats.moveSpeed) * DT, 7, obstacles);

  if (input.fire && p.fireCooldown === 0) {
    // Start at the body center so a muzzle near a wall cannot shoot through it.
    const weapon = currentWeapon(s), eventId = s.nextId;
    for (let pellet = 0; pellet < weapon.pellets; pellet++) {
      const angle = p.aim + (weapon.pellets === 1 ? 0 : (pellet / (weapon.pellets - 1) - 0.5) * weapon.spread * Math.PI / 180);
      const pitch = input.aimPitch ?? 0;
      s.bullets.push({ id: s.nextId++, eventId, x: p.x, y: p.y, vx: Math.cos(angle) * stats.projectileSpeed * Math.cos(pitch), vy: Math.sin(angle) * stats.projectileSpeed * Math.cos(pitch),
        ...(input.aimPitch === undefined ? {} : { height: playerEyeHeight(p), heightVelocity: Math.sin(pitch) * stats.projectileSpeed }),
        life: 75, owner: 'player', damage: playerDamage(s, stats.damage), bouncesLeft: hasRelic(s, 'R01') ? 2 : 0, hitIds: [] });
    }
    p.fireCooldown = stats.fireInterval + fireCarry; s.stats.shots++; cue(s, 'shot', p.x, p.y);
  }
  const bossStage = s.boss?.stage;
  if (landed) landingImpact(s);
  ageFrost(s); advanceBombs(s);
  if (input.auxiliary) useAuxiliary(s, { x: input.aimX, y: input.aimY });
  if (s.phase === 'explore') {
    advanceProjectiles(s, beforeHeight);
    finishTimeStopTick(s);
    const direction = exitDirection(s, input); if (direction) travel(s, direction);
    return;
  }
  // Observe normal movement, without perfect prediction of a dash's destination.
  const observed = { x: (p.x - beforeMove.x) / DT, y: (p.y - beforeMove.y) / DT };
  const observedSpeed = Math.hypot(observed.x, observed.y);
  const walkSpeed = walkingSpeed(s, stats.moveSpeed);
  if (observedSpeed > walkSpeed) { observed.x *= walkSpeed / observedSpeed; observed.y *= walkSpeed / observedSpeed; }
  advanceBurn(s);
  const incoming = advanceEnemies(s, observed, beforeMove, beforeHeight);
  const bossHits = advanceBoss(s,beforeMove,beforeHeight), projectileHits = advanceProjectiles(s, beforeHeight);
  if (s.boss?.stage === bossStage) incoming.push(...bossHits);
  incoming.push(...projectileHits);
  incoming.push(...trapHits(s, beforeMove, beforeHeight));
  s.enemies = s.enemies.filter(e => e.hp > 0);
  const touches = (previous: { x: number; y: number }, body: { x: number; y: number }, radius: number, top: number) =>
    cylinderHit(beforeMove.x - previous.x, beforeMove.y - previous.y,
      p.x - body.x, p.y - body.y, beforeHeight, p.height ?? 0, 0, 0, radius + 7, top) !== null;
  for (const previous of contactBodies) {
    const e = previous.body;
    // A teleport has no traversed body path and always lands outside contact range.
    if (e.kind === 'voidknight' && e.blinkTick === s.tick) continue;
    if (e.hp > 0 && touches(previous, e, ENEMY_BODY_RADIUS, BODY_HEIGHT[e.kind]))
      incoming.push({ damage: CONTACT_DAMAGE.monster, cause: `${ENEMY_NAMES[e.kind]} 접촉 피해` });
  }
  if (contactBoss && contactBoss.body.hp > 0 && contactBoss.body.mode !== 'transition'
    && touches(contactBoss, contactBoss.body, GATEKEEPER.bodyRadius, BODY_HEIGHT[contactBoss.body.kind]))
    incoming.push({ damage: CONTACT_DAMAGE.boss, cause: contactBoss.body.kind === 'relicheart' ? '유물 심장과 접촉' : contactBoss.body.kind === 'chainpriest' ? '사슬의 사제와 접촉' : '문지기 석상과 접촉' });
  const dodgeElapsed = 0.24 - p.dodgeRemaining;
  const dodgeSafe = p.dodgeRemaining > 0 && dodgeElapsed >= 0.02 && dodgeElapsed <= 0.18;
  if (incoming.length && !dodgeSafe && p.invulnerable === 0) {
    incoming.sort((a, b) => b.damage - a.damage);
    const hit = incoming[0];
    if (hit.pull) applyChainPull(s, hit.pull);
    const damage = receivedDamage(s, hit.damage);
    p.hp = Math.max(0, p.hp - damage); p.invulnerable = 45;
    const fatal = p.hp === 0;
    if (p.hp === 0 && hasRelic(s, 'R20')) {
      p.hp = 1; p.invulnerable = 90;
      s.expedition!.relics = s.expedition!.relics.filter(id => id !== 'R20');
    }
    if (p.hp === 0) reviveContract(s);
    if (fatal) { delete p.weakTicks; delete p.slowTicks; }
    else {
      if ('source' in hit && hit.source === 'riftshaman') p.weakTicks = 180;
      if ('slow' in hit && hit.slow) p.slowTicks = ENEMY_ATTACK.sealcaster.slowTicks;
    }
    s.stats.hits++; s.lastDamage = hit.cause; cue(s, 'hurt', p.x, p.y, damage);
  }
  finishTimeStopTick(s);
  if (p.hp === 0) { clearCombatEffects(s); endTimeStop(s); s.phase = 'dead'; s.bullets = []; delete s.bombs; if (s.boss) { if(s.boss.kind==='relicheart')clearHeartShield(s.boss); s.boss.rocks = []; s.boss.impactTicks = 0; if (s.boss.chains) s.boss.chains = []; delete s.boss.reservedSummons; } return; }
  if (s.boss) {
    if (s.boss.hp <= 0) {
      clearCombatEffects(s);
      s.phase = 'cleared'; s.gold += 40; s.enemies = []; s.bullets = []; s.boss.rocks = []; s.boss.impactTicks = 0;
      if (s.boss.chains) s.boss.chains = []; delete s.boss.reservedSummons;
      if (s.boss.kind==='relicheart') clearHeartShield(s.boss);
      endTimeStop(s);
      delete s.bombs;
      const node = currentRoom(s); if (node) node.cleared = true;
    }
    return;
  }
  if (s.enemies.length === 0) {
    if (s.wave >= roomInfo(s).waves.length && s.waveDelay === 0) {
      clearCombatEffects(s);
      healAfterCombat(s);
      s.phase = 'cleared'; s.gold += 8; s.bullets = []; delete s.bombs;
      endTimeStop(s);
      const node = currentRoom(s); if (node) { node.cleared = true; s.phase = 'explore'; } else prepareReward(s);
    }
    else if (s.waveDelay > 0) {
      s.waveDelay--; if (s.waveDelay === 0) { s.wave++; spawnWave(s); }
    } else { s.waveDelay = 48; s.bullets = []; }
  }
}
