import { DT, PILLARS, isBoss, isBossBullet, type Box, type Bullet, type Cue, type Npc, type Point, type RunState } from './model';
import { clearHeartShield, damageHeartPillar, heartProtected } from './heart-boss';
import { roomLayout } from './room-layout';
import { damageStoneWall, MASONRY } from './masonry';
import { boxHit3D } from './fps-geometry';
import { segmentBox, segmentCircle } from './geometry';
import { hasRelic } from './relics';
import { blocksBossShot, checkBossTransition, GATEKEEPER } from './boss';
import { blocksGuardShot, shieldHealth } from './enemy-special';
import { canHitOnReturn, expireShot, frostHit, splitShot } from './projectile-effects';
import { parryProjectile } from './dodge';
import { stoppedBullet } from './time-debt';
import { BODY_HEIGHT, CEILING_HEIGHT, cylinderHit, EYE_HEIGHT, PLAYER_BODY_HEIGHT, playerEyeHeight } from './fps-geometry';
import { playerDamage } from './player-effects';
import { cancelVoidAttack } from './void-knight';
import { currentWeapon } from './weapons';
import { cancelSealBlast } from './seal-caster';
import { cancelChainBite } from './chain-hound';
import { cancelStatueLaser } from './reader-statue';
import { silenceHit } from './silence';
import { clearLens, releaseShield } from './rift-lens';
import { healOnKill } from './survival-relics';
import { guideProjectile } from './homing';
import { blockWithWard, lightningHit, wardContact } from './relic-combat';
import { gravityHit } from './relic-fields';
import { isAlly, releaseCharm } from './allegiance';
import { damageScarecrow, SCARECROW } from './scarecrow';
import { portalCrossing, portalExitSafe, PORTAL } from './portal';
import { absorbBullet, breakStealth } from './shadow-absorb';

export function cue(s: RunState, kind: Cue['kind'], x: number, y: number, amount = 0) {
  s.cues.push({ id: s.nextId++, kind, x, y, tick: s.tick, amount });
}
export function damageEnemy(s: RunState, enemy: Npc, damage: number, source: 'player' | 'ally' | 'enemy' = 'player') {
  if(s.expedition?.dungeon?.layoutVersion===3&&!isBoss(enemy)&&enemy.kind!=='decoy'&&enemy.spawnTicks)return;
  if (enemy.kind === 'decoy') { if (source === 'enemy') damageScarecrow(s, enemy, damage); return; }
  if (isAlly(enemy) && source !== 'enemy') return;
  if (enemy.hp <= 0 || (isBoss(enemy) && (enemy.mode === 'transition' || heartProtected(enemy)))) return;
  enemy.hp = Math.max(0, enemy.hp - damage); enemy.flash = 6; if (source !== 'enemy') s.stats.damage += damage;
  if(damage>0)breakStealth(s);
  if (enemy.hp <= 0) { delete enemy.silenceTicks; clearLens(enemy); if (source !== 'enemy'&&!s.replay) healOnKill(s); if (!isBoss(enemy) && enemy.charm) releaseCharm(enemy); }
  cue(s, 'hit', enemy.x, enemy.y, damage);
  if (enemy.hp <= 0) { if(enemy.kind==='relicheart')clearHeartShield(enemy); if(enemy.kind==='voidknight')cancelVoidAttack(enemy); if(enemy.kind==='sealcaster')cancelSealBlast(enemy); if(enemy.kind==='chainhound')cancelChainBite(enemy); if(enemy.kind==='readerstatue')cancelStatueLaser(enemy); if(!s.replay)s.stats.kills++; cue(s, 'kill', enemy.x, enemy.y); }
  else if (isBoss(enemy)) checkBossTransition(s);
}
export function advanceBurn(s: RunState) {
  for (const e of [...s.enemies, ...(s.boss ? [s.boss] : [])]) if (e.hp > 0 && (e.burnTicks ?? 0) > 0) {
    e.burnTicks!--; e.burnPulse = (e.burnPulse ?? 60) - 1;
    if (e.burnPulse <= 0) { damageEnemy(s, e, e.burnDamage ?? 2); e.burnPulse = 60; }
  }
  s.enemies = s.enemies.filter(e => e.hp > 0);
}

function reflect(b: Bullet, wall: Box): boolean {
  const epsilon = 0.00001;
  const x = (b.vx > 0 && Math.abs(b.x - (wall.x - 2)) < epsilon)
    || (b.vx < 0 && Math.abs(b.x - (wall.x + wall.w + 2)) < epsilon);
  const y = (b.vy > 0 && Math.abs(b.y - (wall.y - 2)) < epsilon)
    || (b.vy < 0 && Math.abs(b.y - (wall.y + wall.h + 2)) < epsilon);
  if (!x && !y) return false; // Never escape a corrupted position inside a wall by tunneling.
  if (x) b.vx *= -1; if (y) b.vy *= -1;
  b.x += Math.sign(b.vx) * 0.001; b.y += Math.sign(b.vy) * 0.001;
  return true;
}

type ProjectileHit = { damage: number; cause: string; source?: Bullet['source'] };
export function advanceProjectiles(s: RunState, previousPlayerHeight = s.player.height ?? 0, previousPlayer: Point = s.player): ProjectileHit[] {
  const incoming: ProjectileHit[] = [];
  const pending: Bullet[] = [];
  const stage = s.boss?.stage;
  const playerAt = (t: number) => ({ x: previousPlayer.x + (s.player.x - previousPlayer.x) * t,
    y: previousPlayer.y + (s.player.y - previousPlayer.y) * t,
    height: previousPlayerHeight + ((s.player.height ?? 0) - previousPlayerHeight) * t });
  const advance = (b: Bullet): boolean => {
    if (s.view && b.owner === 'enemy' && b.height === undefined) { b.height = EYE_HEIGHT; b.heightVelocity = 0; }
    const frozen = stoppedBullet(s, b);
    if (b.phase === 'return') {
      const angle = Math.atan2(s.player.y - b.y, s.player.x - b.x), speed = Math.hypot(b.vx, b.vy, b.heightVelocity ?? 0);
      const pitch = b.height === undefined ? 0 : Math.atan2(playerEyeHeight(s.player) - b.height, Math.hypot(s.player.x - b.x, s.player.y - b.y));
      if (b.height !== undefined) b.heightVelocity = Math.sin(pitch) * speed;
      b.vx = Math.cos(angle) * speed * Math.cos(pitch); b.vy = Math.sin(angle) * speed * Math.cos(pitch);
    } else if (!frozen && hasRelic(s, 'R05')) guideProjectile(s, b, roomLayout(s).walls);
    let remaining = DT;
    // A basic shot can encounter four enemies and two bounces in one swept tick.
    for (let contact = 0; contact < 8 && remaining > 0.0000001; contact++) {
      const nx = b.x + b.vx * (frozen ? 0 : remaining), ny = b.y + b.vy * (frozen ? 0 : remaining);
      const nh = b.height === undefined ? undefined : b.height + (b.heightVelocity ?? 0) * (frozen ? 0 : remaining);
      const startTime = 1 - remaining / DT, previous = playerAt(startTime);
      // Every reflected or teleported segment uses the same elapsed tick time as the player.
      const playerHitTime = (radius: number, top = PLAYER_BODY_HEIGHT) => cylinderHit(b.x - previous.x, b.y - previous.y,
        nx - s.player.x, ny - s.player.y, b.height === undefined ? undefined : b.height - previous.height,
        nh === undefined ? undefined : nh - (s.player.height ?? 0), 0, 0, radius, top);
      let nearest = Infinity, wallHit: Box | null = null, target: Npc | null = null, playerHit = false, caught = false;
      let verticalWall = false, wardHit = false;
      if (b.height !== undefined && nh !== undefined && (nh <= 0 || nh >= CEILING_HEIGHT)) {
        nearest = Math.max(0, (nh <= 0 ? -b.height : CEILING_HEIGHT - b.height) / (nh - b.height || 1));
        verticalWall = true;
      }
      for (const wall of roomLayout(s).walls) {
        const t = wall === s.stoneWall ? boxHit3D(b, { x: nx, y: ny }, b.height, nh, wall, MASONRY.height)
          : segmentBox(b.x, b.y, nx, ny, wall, 2);
        if (t !== null && t < nearest) { nearest = t; wallHit = wall; verticalWall = false; }
      }
      if (b.owner === 'player') {
        if (b.phase === 'return') {
          const t = playerHitTime(7);
          if (t !== null && t < nearest) { nearest = t; caught = true; wallHit = null; verticalWall = false; }
        }
        for (const e of [...s.enemies, ...(s.boss ? [s.boss] : [])]) if (e.hp > 0 && !(s.expedition?.dungeon?.layoutVersion===3&&!isBoss(e)&&e.spawnTicks) && !isAlly(e) && !b.hitIds?.includes(e.id) && canHitOnReturn(s, b, e.id)) {
          const t = cylinderHit(b.x, b.y, nx, ny, b.height, nh, e.x, e.y, isBoss(e) ? GATEKEEPER.hitRadius + 2 : 12, BODY_HEIGHT[e.kind]);
          if (t !== null && (t < nearest || (t === nearest && target && e.id < target.id))) {
            nearest = t; target = e; wallHit = null; caught = false; verticalWall = false;
          }
        }
      } else {
        for (const e of [...s.enemies.filter(isAlly), ...(s.decoy ? [s.decoy] : [])]) if (e.hp > 0 && e.id !== b.originalEnemyId) {
          const t = cylinderHit(b.x, b.y, nx, ny, b.height, nh, e.x, e.y, e.kind === 'decoy' ? SCARECROW.radius + 2 : 12, BODY_HEIGHT[e.kind]);
          if (t !== null && t < nearest) { nearest = t; target = e; wallHit = null; verticalWall = false; }
        }
        const t = playerHitTime(9);
        if (t !== null && t < nearest) { nearest = t; playerHit = true; target = null; wallHit = null; verticalWall = false; }
        const ward = wardContact(s, b, { x: nx, y: ny }, nh, previous, previous.height);
        if (ward !== null && ward < nearest) { nearest = ward; wardHit = true; playerHit = false; target = null; wallHit = null; verticalWall = false; }
      }
      const portal=!frozen?portalCrossing(s,b,{x:b.x,y:b.y,height:b.height},{x:nx,y:ny,height:nh}):null;
      const teleport=portal && portal.t<nearest && portalExitSafe(s,portal.exit) ? portal : null;
      const segmentEnd=Math.min(1,teleport?.t ?? nearest);
      const absorption=s.absorption?playerHitTime(40,60):null;
      if(absorption!==null&&absorption<=segmentEnd){
        const impact={x:b.x+(nx-b.x)*absorption,y:b.y+(ny-b.y)*absorption};
        if(absorbBullet(s,b,impact,impact,playerAt(startTime+(1-startTime)*absorption)))return false;
      }
      if(teleport){
        if(b.height!==undefined&&nh!==undefined)b.height+=(nh-b.height)*teleport.t;
        b.x=teleport.exit.x;b.y=teleport.exit.y;remaining*=1-teleport.t;
        b.portalTrips=(b.portalTrips ?? 0)+1;b.portalPairId=teleport.portalId;b.portalLockUntil=s.tick+PORTAL.reentryLock;continue;
      }
      if (nearest === Infinity) { b.x = nx; b.y = ny; if (nh !== undefined) b.height = nh; remaining = 0; break; }
      b.x += (nx - b.x) * nearest; b.y += (ny - b.y) * nearest;
      if (b.height !== undefined && nh !== undefined) b.height += (nh - b.height) * nearest;
      remaining *= 1 - nearest;
      if (caught) return false;
      if (wardHit) { blockWithWard(s, b); return false; }
      if (playerHit) {
        if (parryProjectile(s, b, playerAt(1 - remaining / DT))) { cue(s, 'parry', b.x, b.y); if (frozen) return true; continue; }
        incoming.push({ damage: b.damage, cause: b.source === 'riftshaman' ? '균열 주술사의 봉인탄' : b.source === 'relicheart' ? '유물 심장의 탄환' : b.source === 'watcher' ? '궤도 감시자의 탄환' : b.source === 'gatekeeper' ? '문지기 석상의 돌탄' : b.source === 'chainpriest' ? '사슬의 사제의 탄환 고리' : b.source === 'ashpriest' ? '재의 사제의 사격' : '금 간 궁수의 화살', source: b.source }); return false;
      }
      if (target) {
        if (target.kind === 'decoy') { damageScarecrow(s, target, b.damage); return false; }
        const blocked = isBoss(target) ? blocksBossShot(target, b) : blocksGuardShot(target, b);
        if (b.owner === 'enemy') {
          if (blocked) { if (target.kind === 'shield') target.shieldHp = Math.max(0, shieldHealth(target) - b.damage); }
          else damageEnemy(s, target, b.damage, 'enemy');
          return false;
        }
        if (blocked && !releaseShield(s, target, b)) {
          if (target.kind === 'shield') {
            target.shieldHp = Math.max(0, shieldHealth(target) - b.damage); target.flash = 6;
          }
          // The breaking projectile is absorbed too; later projectiles can reach the body.
          cue(s, 'hit', b.x, b.y, 0); return false;
        }
        (b.hitIds ??= []).push(target.id);
        if (!b.kind && !b.phase) (b.outboundHits ??= []).push({ id: target.id, tick: s.tick });
        damageEnemy(s, target, b.damage, b.kind === 'ally' ? 'ally' : 'player');
        if (s.boss?.stage !== stage) return false;
        if (!b.kind && target.hp > 0 && hasRelic(s, 'R07')) {
          if (!target.burnTicks) target.burnPulse = 60;
          target.burnTicks = 180;
          if (s.player.weakTicks) target.burnDamage = playerDamage(s, 2); else delete target.burnDamage;
        }
        frostHit(s, target, b); silenceHit(s, target, b); lightningHit(s, target, b, damageEnemy);
        if (s.boss?.stage !== stage) return false;
        gravityHit(s, b);
        splitShot(s, b, target, pending);
        const targetLimit = b.kind === 'ally' ? 1 : hasRelic(s, 'R02') ? 4 : b.kind ? 1 : currentWeapon(s).targets;
        if (b.kind === 'reflected' || b.hitIds.length >= targetLimit) return false;
      } else if (verticalWall) {
        if (b.owner !== 'player' || b.kind === 'reflected' || !hasRelic(s, 'R01') || !b.bouncesLeft) return false;
        b.heightVelocity = -(b.heightVelocity ?? 0); b.height! += Math.sign(b.heightVelocity) * 0.001; b.bouncesLeft--;
      } else if (wallHit) {
        if (wallHit === s.stoneWall && b.owner === 'enemy') { damageStoneWall(s, b.damage); return false; }
        if (b.owner==='player' && damageHeartPillar(s,PILLARS.indexOf(wallHit),b.damage)) {
          cue(s,'hit',b.x,b.y,b.damage); return false;
        }
        if (b.owner !== 'player' || b.kind === 'reflected' || !hasRelic(s, 'R01') || !b.bouncesLeft) return false;
        if (wallHit === s.stoneWall && b.height !== undefined && (b.heightVelocity ?? 0) < 0 && Math.abs(b.height - MASONRY.height - 2) < .01) {
          b.heightVelocity = -b.heightVelocity!; b.height += .001;
        } else if (!reflect(b, wallHit)) return false;
        b.bouncesLeft--;
      }
    }
    return remaining <= 0.0000001 && (frozen || expireShot(s, b));
  };
  const survivors: Bullet[] = [];
  for (const b of s.bullets) {
    if (advance(b)) survivors.push(b);
    if (s.boss?.stage !== stage) { survivors.length = 0; pending.length = 0; break; }
  }
  s.bullets = [...survivors, ...pending];
  // A half-health transition cancels impacts already collected earlier in this tick too.
  return s.boss?.stage !== stage ? incoming.filter(hit => !isBossBullet(hit)) : incoming;
}
