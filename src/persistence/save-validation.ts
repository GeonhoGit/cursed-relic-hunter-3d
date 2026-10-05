import { JUMP, STOMP } from '../core/jump';
import { validMouseSensitivity } from '../core/settings';
import { BOUNDS, unreflectableBullet, type Boss, type Bullet, type DungeonRoom, type Enemy, type Frost, type RelicId, type RunState } from '../core/model';
import { HEART } from '../core/heart-boss';
import { hasRelic, isCurse, RELIC_IDS } from '../core/relics';
import { roomInfo } from '../core/expedition';
import { GATEKEEPER } from '../core/boss';
import { PRIEST } from '../core/priest-boss';
import { adjacentRooms, currentRoom } from '../core/dungeon';
import { ENCOUNTER_SIZE, ENEMY_ATTACK, ENEMY_HEALTH } from '../core/enemy-balance';
import { distance, visible } from '../core/geometry';
import { roomLayout } from '../core/room-layout';
import { ROOM_STRUCTURES } from '../core/room-structures';
import { defaultProfile, earnedPoints, growthStats, investedPoints, validGrowthId, validInvestment, validProfile } from '../core/growth';
import { currentWeapon, isWeapon, weaponUnlocked } from '../core/weapons';
import { CHALICE } from '../core/survival-relics';

import type { SaveRecord, Settings } from './save-types';

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const validChaliceHealing = (v: unknown) => finite(v) && v >= 0 && v <= CHALICE.roomCap;
const integer = (v: unknown, min: number, max: number) => finite(v) && Number.isInteger(v) && v >= min && v <= max;
const relicList = (v: unknown): v is RelicId[] => Array.isArray(v) && v.length <= RELIC_IDS.length
  && new Set(v).size === v.length && v.every(id => RELIC_IDS.includes(id));
function validFrost(f: Frost | undefined, tick: number): boolean {
  return f === undefined || (!!f && integer(f.freezeTicks, 0, 36) && integer(f.resistTicks, f.freezeTicks, 216)
    && Array.isArray(f.hits) && f.hits.length <= 3 && (!f.resistTicks || f.hits.length === 0)
    && new Set(f.hits.map(h => h?.eventId)).size === f.hits.length
    && f.hits.every(h => h && integer(h.eventId, 0, Number.MAX_SAFE_INTEGER) && integer(h.tick, Math.max(0, tick - 180), tick)));
}
function validProjectileEffect(b: Bullet, tick: number): boolean {
  if ((b.kind !== undefined && !['split', 'reflected'].includes(b.kind)) || (b.phase !== undefined && b.phase !== 'return')) return false;
  if (b.owner !== 'player' && [b.kind, b.phase, b.eventId, b.splitDone, b.originTargetId, b.outboundHits].some(v => v !== undefined)) return false;
  if (b.kind === 'reflected') return [12, 15].includes(b.damage) && integer(b.life, 1, 240) && (b.hitIds === undefined || b.hitIds.length === 0)
    && [b.phase, b.source, b.eventId, b.bouncesLeft, b.splitDone, b.originTargetId, b.outboundHits].every(v => v === undefined);
  return (b.eventId === undefined || integer(b.eventId, 0, Number.MAX_SAFE_INTEGER))
    && (b.splitDone === undefined || typeof b.splitDone === 'boolean')
    && (b.originTargetId === undefined || (b.kind === 'split' && integer(b.originTargetId, 0, Number.MAX_SAFE_INTEGER)))
    && (b.kind !== 'split' || (b.phase === undefined && b.splitDone === undefined && b.outboundHits === undefined && integer(b.life, 1, 36)))
    && (b.phase !== 'return' || integer(b.life, 1, 60))
    && (b.outboundHits === undefined || (Array.isArray(b.outboundHits) && b.outboundHits.length <= 4
      && new Set(b.outboundHits.map(h => h?.id)).size === b.outboundHits.length
      && b.outboundHits.every(h => h && integer(h.id, 0, Number.MAX_SAFE_INTEGER) && integer(h.tick, 0, tick))));
}
function validShop(node: DungeonRoom, chosen: RelicId[]): boolean {
  const shop = node.shop;
  if (node.kind !== 'shop' || !node.visited) return shop === undefined;
  if (!node.cleared || !shop || !integer(shop.revision, 1, Number.MAX_SAFE_INTEGER) || !Array.isArray(shop.slots) || shop.slots.length !== 4) return false;
  const offered: RelicId[] = [];
  for (const [index, slot] of shop.slots.entries()) {
    if (!slot || slot.kind !== ['relic', 'relic', 'heal', 'curse'][index] || typeof slot.purchased !== 'boolean'
      || !integer(slot.repairCounter, 0, Number.MAX_SAFE_INTEGER)) return false;
    if (slot.kind === 'heal') { if (slot.relic !== null || slot.repairCounter !== 0) return false; }
    else if (slot.relic === null) { if (slot.purchased) return false; }
    else {
      if (!RELIC_IDS.includes(slot.relic) || isCurse(slot.relic) !== (slot.kind === 'curse')) return false;
      offered.push(slot.relic); if (slot.purchased) chosen.push(slot.relic);
    }
  }
  return new Set(offered).size === offered.length && shop.revision > shop.slots.filter(slot => slot.purchased).length;
}
function validMaze(s: RunState, past = false, chosen: RelicId[] = []): boolean {
  const e = s.expedition!, rooms = e.dungeon?.rooms;
  if (e.dungeon?.layoutVersion !== undefined && e.dungeon.layoutVersion !== 1) return false;
  if (e.reward !== null || !Array.isArray(rooms) || ![9, 10, 11].includes(rooms.length) || !integer(e.room, 0, rooms.length - 1)
    || !rooms.every((r, i) => r && r.id === i && integer(r.x, -4, 4) && integer(r.y, -4, 4)
      && integer(r.template, 0, 2) && ['start', 'combat', 'treasure', 'boss', 'altar', 'shop'].includes(r.kind)
      && (r.structure === undefined || r.kind !== 'boss' && integer(r.structure, 0, ROOM_STRUCTURES.length - 1))
      && (r.chaliceHealed === undefined || validChaliceHealing(r.chaliceHealed) && r.visited
        && ['combat', 'boss'].includes(r.kind) && e.acquired.includes('R56'))
      && typeof r.visited === 'boolean' && typeof r.cleared === 'boolean' && (!r.cleared || r.visited))) return false;
  if (new Set(rooms.map(r => `${r.x}/${r.y}`)).size !== rooms.length || rooms[0].kind !== 'start' || rooms[8].kind !== 'boss'
    || (rooms.length >= 10 && rooms[9].kind !== 'altar') || (rooms.length === 11 && rooms[10].kind !== 'shop')
    || rooms.filter(r => r.kind === 'combat').length !== 5 || rooms.filter(r => r.kind === 'treasure').length !== 2
    || !rooms[0].visited || !rooms[0].cleared || !rooms[e.room].visited) return false;
  const distances = new Map([[0, 0]]), queue = [0];
  while (queue.length) {
    const id = queue.shift()!;
    for (const next of adjacentRooms(s, id)) if (!distances.has(next.room.id)) {
      distances.set(next.room.id, distances.get(id)! + 1); queue.push(next.room.id);
    }
  }
  if (distances.size !== rooms.length || adjacentRooms(s, 0).length < 3 || adjacentRooms(s, 8).length !== 1
    || distances.get(8) !== Math.max(...distances.values())
    || rooms.reduce((sum, r) => sum + adjacentRooms(s, r.id).length, 0) < 18) return false;
  if (!past && (e.region === 2 || e.region === 3)) {
    const archives = e.region===3 ? [e.earlierDungeon,e.previousDungeon] : [e.previousDungeon];
    for (const archive of archives) if (!archive || !validMaze({ ...s, phase: 'cleared', expedition: { ...e, room: 8, region: 1,
      dungeon: archive, previousDungeon: undefined, earlierDungeon:undefined } }, true, chosen)) return false;
  }
  for (const node of rooms) {
    if (!validShop(node, chosen)) return false;
    if (node.visited && node.id !== e.room && !node.cleared) return false;
    if (!['treasure', 'altar'].includes(node.kind) || !node.visited) { if (node.reward !== null) return false; continue; }
    const r = node.reward;
    // A visited treasure room stays traversable while its chest is unopened.
    if (node.kind === 'treasure' && node.cleared && r === null) continue;
    if (!node.cleared || !r || r.room !== node.id || !relicList(r.candidates) || r.candidates.length < 1 || r.candidates.length > 3
      || (r.rerolled !== undefined && (r.rerolled !== true || node.kind !== 'treasure'))) return false;
    if (node.kind === 'altar' ? r.candidates.length !== 2 || r.candidates[0] !== 'R38' || r.candidates[1] !== 'R43' : r.candidates.some(isCurse)) return false;
    if (r.choice === null) {
      if (node.kind !== 'altar' && (node.id !== e.room || s.phase !== 'cleared' || r.candidates.some(id => e.acquired.includes(id)))) return false;
    } else if (r.choice !== 'skip') {
      if (!r.candidates.includes(r.choice) || !e.acquired.includes(r.choice)) return false;
      chosen.push(r.choice);
    }
  }
  if (!past && (new Set(chosen).size !== chosen.length || chosen.length !== e.acquired.length || !e.acquired.every(id => chosen.includes(id)))) return false;
  const node = currentRoom(s)!;
  if (s.wave !== 1 || s.waveDelay !== 0 || !integer(s.readyTicks, 0, 48)) return false;
  if (s.phase === 'explore') return node.cleared && node.kind !== 'boss' && (node.kind === 'altar' || node.reward?.choice !== null) && s.enemies.length === 0;
  if (node.kind === 'treasure' || node.kind === 'altar') return s.phase === 'cleared' && node.reward?.choice === null && s.enemies.length === 0;
  if (node.kind === 'start' || node.kind === 'shop') return false;
  if (s.phase === 'cleared') return node.kind === 'boss' && node.cleared;
  return !node.cleared;
}
function validExpedition(s: RunState): boolean {
  const e = s.expedition;
  if (e === undefined) return true; // Retain original single-room snapshots without rewriting them.
  if (!e || (e.route !== undefined && e.route !== 'gatekeeper' && e.route !== 'maze') || !integer(e.room, 0, e.route === 'maze' ? 10 : e.route ? 3 : 2) || !relicList(e.relics) || !relicList(e.acquired)
    || !e.relics.every(id => e.acquired.includes(id))) return false;
  if ((e.region !== undefined && (e.route !== 'maze' || ![1, 2, 3].includes(e.region)))
    || ((e.region === 2 || e.region === 3) ? !e.previousDungeon : e.previousDungeon !== undefined)
    || (e.region===3 ? !e.earlierDungeon : e.earlierDungeon!==undefined)) return false;
  if (e.route === 'maze') return validMaze(s);
  if (e.dungeon !== undefined || s.phase === 'explore') return false;
  const r = e.reward;
  if (r === null) return s.phase !== 'cleared' || !roomInfo(s).reward;
  if (!r || s.phase !== 'cleared' || r.room !== e.room || !roomInfo(s).reward
    || !relicList(r.candidates) || r.candidates.length > 3
    || (r.rerolled !== undefined && (r.rerolled !== true || !r.candidates.length || r.candidates.some(isCurse)))) return false;
  if (r.choice !== null && r.choice !== 'skip' && (!r.candidates.includes(r.choice) || !e.relics.includes(r.choice))) return false;
  return r.candidates.every(id => !e.acquired.includes(id) || id === r.choice);
}
function validBurn(e: { burnTicks?: number; burnPulse?: number; burnDamage?: number }) {
  return ((e.burnTicks === undefined && e.burnPulse === undefined) || (integer(e.burnTicks, 0, 180) && integer(e.burnPulse, 1, 60)))
    && (e.burnDamage === undefined || (e.burnTicks !== undefined && [1.6, 2].includes(e.burnDamage)));
}
function validSilence(s: RunState, e: Enemy | Boss): boolean {
  if (e.silenceTicks === undefined) return true;
  const cooldown = e.kind === 'sealcaster' ? ENEMY_ATTACK.sealcaster.cooldownTicks
    : e.kind === 'riftshaman' ? ENEMY_ATTACK.riftshaman.cooldownTicks
    : e.kind === 'chainpriest' && e.pattern === 'ritual' && !e.reservedSummons && e.rocks.length === 0 ? PRIEST.recovery : 0;
  return s.phase === 'combat' && s.expedition?.acquired.includes('R11') === true && e.hp > 0 && e.mode === 'recover'
    && integer(e.silenceTicks, 1, 60) && cooldown > 0 && e.timer === cooldown - 60 + e.silenceTicks
    && (!('summonPoints' in e) || e.summonPoints === undefined);
}
function validLens(s: RunState, e: Enemy | Boss): boolean {
  const disabled = (e as Enemy).shieldDisabledTicks;
  if (e.lensCooldown === undefined) return disabled === undefined;
  if (e.hp <= 0 || !s.expedition?.acquired.includes('R12') || !['shield', 'gatekeeper'].includes(e.kind)
    || !integer(e.lensCooldown, 1, 300)) return false;
  if (e.kind === 'gatekeeper') return disabled === undefined;
  return disabled === undefined ? e.lensCooldown <= 180 : integer(disabled, 1, 120)
    && e.lensCooldown === disabled + 180 && ((e as Enemy).shieldHp ?? ENEMY_ATTACK.shield.durability) > 0;
}
function validShaman(s: RunState, e: Enemy) {
  if (e.kind !== 'riftshaman') return e.summonPoints === undefined;
  if (e.maxHp !== 80 || e.hp < 0 || e.hp > 80 || !['move', 'recover', 'windup'].includes(e.mode)) return false;
  if (e.summonPoints === undefined) return integer(e.timer, e.mode === 'windup' ? 1 : 0, e.mode === 'windup' ? 42 : 144);
  return s.riftSummonUsed === true && e.hp > 0 && e.mode === 'windup' && integer(e.timer, 1, 72)
    && Array.isArray(e.summonPoints) && e.summonPoints.length === 2 && e.summonPoints.every(p => p && finite(p.x) && finite(p.y)
      && p.x >= BOUNDS.x + 10 && p.x <= BOUNDS.x + BOUNDS.w - 10 && p.y >= BOUNDS.y + 10 && p.y <= BOUNDS.y + BOUNDS.h - 10
      && visible(p, p, 10, roomLayout(s).obstacles)) && distance(e.summonPoints[0], e.summonPoints[1]) >= 28;
}
function validVoidKnight(s: RunState, e: Enemy) {
  if (e.kind !== 'voidknight') return e.blinkTarget === undefined && e.blinkTick === undefined;
  const attack = ENEMY_ATTACK.voidknight;
  if (e.maxHp !== ENEMY_HEALTH.voidknight || e.hp < 0 || e.hp > e.maxHp || !['move','windup','recover'].includes(e.mode)
    || (e.blinkTick !== undefined && !integer(e.blinkTick, 0, s.tick))) return false;
  if (!integer(e.timer, e.mode === 'windup' ? 1 : 0,
    e.mode === 'windup' ? (e.blinkTarget ? attack.blinkTicks : attack.windupTicks) : attack.cooldownTicks)) return false;
  if (e.blinkTarget === undefined) return true;
  const p = e.blinkTarget;
  // Dynamic occupancy can change during the warning and is checked again on landing.
  return e.hp > 0 && e.mode === 'windup' && p && finite(p.x) && finite(p.y)
    && p.x === e.targetX && p.y === e.targetY
    && p.x >= BOUNDS.x + 10 && p.x <= BOUNDS.x + BOUNDS.w - 10
    && p.y >= BOUNDS.y + 10 && p.y <= BOUNDS.y + BOUNDS.h - 10
    && visible(p, p, 10, roomLayout(s).obstacles);
}
function validSealCaster(e: Enemy) {
  if (e.kind !== 'sealcaster') return true;
  const attack = ENEMY_ATTACK.sealcaster;
  return e.maxHp === ENEMY_HEALTH.sealcaster && e.hp >= 0 && e.hp <= e.maxHp && ['move','windup','recover'].includes(e.mode)
    && integer(e.timer, e.mode === 'windup' ? 1 : 0, e.mode === 'windup' ? attack.windupTicks : attack.cooldownTicks)
    && (e.mode !== 'windup' || (e.hp > 0 && finite(e.targetX) && finite(e.targetY)
      && e.targetX >= BOUNDS.x + 7 && e.targetX <= BOUNDS.x + BOUNDS.w - 7
      && e.targetY >= BOUNDS.y + 7 && e.targetY <= BOUNDS.y + BOUNDS.h - 7));
}
function validChainHound(e: Enemy) {
  if (e.kind !== 'chainhound') return true;
  const attack = ENEMY_ATTACK.chainhound;
  return e.maxHp === ENEMY_HEALTH.chainhound && e.hp >= 0 && e.hp <= e.maxHp && ['move','windup','recover'].includes(e.mode)
    && integer(e.timer, e.mode === 'windup' ? 1 : 0, e.mode === 'windup' ? attack.windupTicks : attack.cooldownTicks)
    && (e.mode !== 'windup' || (e.hp > 0 && e.targetX >= BOUNDS.x + 7 && e.targetX <= BOUNDS.x + BOUNDS.w - 7
      && e.targetY >= BOUNDS.y + 7 && e.targetY <= BOUNDS.y + BOUNDS.h - 7));
}
function validReaderStatue(e: Enemy) {
  if (e.kind !== 'readerstatue') return e.laserTicks === undefined;
  const attack = ENEMY_ATTACK.readerstatue;
  return e.maxHp === ENEMY_HEALTH.readerstatue && e.hp >= 0 && e.hp <= e.maxHp && ['move','windup','recover'].includes(e.mode)
    && integer(e.timer, e.mode === 'windup' ? 1 : 0, e.mode === 'windup' ? attack.windupTicks : attack.cooldownTicks)
    && (e.mode !== 'windup' || (e.hp > 0 && e.targetX >= BOUNDS.x + 7 && e.targetX <= BOUNDS.x + BOUNDS.w - 7
      && e.targetY >= BOUNDS.y + 7 && e.targetY <= BOUNDS.y + BOUNDS.h - 7))
    && (e.laserTicks === undefined || (e.hp > 0 && e.mode === 'recover' && integer(e.laserTicks, 1, attack.effectTicks)
      && e.timer === attack.cooldownTicks - attack.effectTicks + e.laserTicks));
}
function validBoss(s: RunState): boolean {
  const b = s.boss, bossRoom = !!roomInfo(s).boss;
  if (!b) return b === undefined && !bossRoom;
  const heart = s.expedition?.region===3, priest = s.expedition?.region === 2;
  if (!bossRoom || b.kind !== (heart ? 'relicheart' : priest ? 'chainpriest' : 'gatekeeper') || b.maxHp !== (heart ? HEART.hp : priest ? PRIEST.hp : GATEKEEPER.hp) || !(heart ? [1,2,3] : [1, 2]).includes(b.stage)
    || !(heart ? ['pulse','laser','shockwave'] : priest ? ['chains','ring','ritual'] : ['fan', 'charge', 'rocks', 'shield']).includes(b.pattern)
    || !(heart ? ['windup','recover','transition','wave'] : priest ? ['windup','recover','transition'] : ['windup', 'charge', 'shield', 'recover', 'transition']).includes(b.mode)) return false;
  if (![b.id, b.x, b.y, b.hp, b.angle, b.flash, b.timer, b.targetX, b.targetY, b.impactTicks, b.transitionTick].every(finite)
    || b.hp < 0 || b.hp > b.maxHp || !integer(b.timer, 0, 120) || !integer(b.impactTicks, 0, priest ? 18 : 12)
    || typeof b.chargeHit !== 'boolean' || typeof b.summonsDone !== 'boolean') return false;
  if ((b.mode === 'transition' && b.stage !== 2 && !(heart && b.stage===3)) || (b.mode === 'shield' && b.pattern !== 'shield')
    || (b.mode === 'charge' && b.pattern !== 'charge') || (s.phase === 'cleared' && b.hp > 0)) return false;
  if (priest && (!Array.isArray(b.rocks) || !integer(b.ritualAttempts,0,2) || !integer(b.ringGap,0,9)
    || !Array.isArray(b.chains) || b.chains.length>3 || !b.chains.every(c=>c && [c.x,c.y,c.tx,c.ty].every(finite)
      && [c.x,c.tx].every(x=>x>=BOUNDS.x && x<=BOUNDS.x+BOUNDS.w) && [c.y,c.ty].every(y=>y>=BOUNDS.y && y<=BOUNDS.y+BOUNDS.h))
    || (b.reservedSummons!==undefined && (b.reservedSummons!==2 || b.mode!=='windup' || b.pattern!=='ritual' || b.rocks.length!==2 || s.enemies.length+2>10))
    || (s.phase!=='dead' && b.hp>0 && b.mode==='windup' && b.pattern==='ritual' && b.reservedSummons!==2))) return false;
  if (heart) {
    const active=b.pillarIndex!==undefined, alive=s.phase!=='dead' && b.hp>0;
    if (!integer(b.shieldLinks,0,2) || (b.stage===1 && b.shieldLinks!==0)
      || (active && (b.stage!==2 || !alive || !integer(b.pillarIndex,0,1) || b.pillarIndex!==b.shieldLinks!-1 || !finite(b.pillarHp) || b.pillarHp<=0 || b.pillarHp>100 || b.relinkTicks!==undefined))
      || (!active && b.pillarHp!==undefined)
      || (b.relinkTicks!==undefined && (b.stage!==2 || !alive || active || b.shieldLinks!==1 || !integer(b.relinkTicks,0,480)))
      || (b.stage===2 && alive && (b.shieldLinks===0 || (!active && b.shieldLinks===1 && b.relinkTicks===undefined)))
      || (b.mode==='wave' && (b.pattern!=='shockwave' || (alive && (!integer(b.timer,1,72) || !finite(b.shockRadius) || b.shockRadius<0 || b.shockRadius>576 || typeof b.shockHit!=='boolean'))))
      || (b.mode!=='wave' && (b.shockRadius!==undefined || b.shockHit!==undefined))
      || (b.stage===3 && b.mode!=='transition' && b.pattern==='shockwave')) return false;
  }
  return validLens(s, b) && validSilence(s, b) && validFrost(b.frost, s.tick) && Array.isArray(b.rocks) && b.rocks.length <= 3 && b.rocks.every(p => p && finite(p.x) && finite(p.y))
    && validBurn(b);
}
function validCurses(s: RunState): boolean {
  const p = s.player, stop = s.timeStop, revival = s.revival;
  if (p.equippedAux !== undefined && p.equippedAux !== null
    && (!['R13', 'R43'].includes(p.equippedAux) || !hasRelic(s, p.equippedAux))) return false;
  if (p.timeCooldown !== undefined && !integer(p.timeCooldown, 0, 1080)) return false;
  if (s.timeDebt !== undefined && !integer(s.timeDebt, 0, 180)) return false;
  const ids = (v: unknown, limit: number): v is number[] => Array.isArray(v) && v.length <= limit
    && new Set(v).size === v.length && v.every(id => integer(id, 0, s.nextId - 1));
  if (stop !== undefined && (!stop || !hasRelic(s, 'R43') || !p.timeCooldown || !['combat', 'explore'].includes(s.phase)
    || !integer(stop.ticks, 1, 90) || !finite(stop.x) || !finite(stop.y)
    || stop.x < BOUNDS.x || stop.x > BOUNDS.x + BOUNDS.w || stop.y < BOUNDS.y || stop.y > BOUNDS.y + BOUNDS.h
    || !ids(stop.enemyIds, ENCOUNTER_SIZE.max) || !ids(stop.bulletIds, 240)
    || stop.enemyIds.includes(s.boss?.id ?? -1)
    || stop.bulletIds.some(id => s.bullets.some(b => b.id === id && (unreflectableBullet(b) || (b.owner !== 'enemy' && b.kind !== 'reflected')))))) return false;
  if (revival !== undefined && (!revival || !integer(revival.tick, 0, s.tick) || !s.expedition?.acquired.includes('R38') || hasRelic(s, 'R38')
    || !relicList(revival.lost) || revival.lost.length > 2 || revival.lost.some(id => isCurse(id) || hasRelic(s, id) || !s.expedition!.acquired.includes(id)))) return false;
  return !s.expedition?.acquired.includes('R38') || hasRelic(s, 'R38') || !!revival;
}
export function validRun(value: unknown): value is RunState {
  if (!value || typeof value !== 'object') return false;
  const s = value as RunState;
  if (s.view !== undefined && (!s.view || !finite(s.view.yaw) || Math.abs(s.view.yaw) > Math.PI
    || !finite(s.view.pitch) || Math.abs(s.view.pitch) > 1.15)) return false;
  if (s.weapon !== undefined && !isWeapon(s.weapon)) return false;
  if (s.growth !== undefined && (!s.growth || !validGrowthId(s.growth.id) || !validInvestment(s.growth.investment)
    || (s.growth.firstRoomCleared !== undefined && s.growth.firstRoomCleared !== true))) return false;
  if (s.version !== 1 || !['ready', 'combat', 'explore', 'cleared', 'dead'].includes(s.phase) || (s.phase === 'explore' && s.expedition?.route !== 'maze')) return false;
  if (![s.seed, s.rng, s.tick, s.nextId, s.readyTicks, s.wave, s.waveDelay, s.gold].every(finite)) return false;
  if (!s.player || !s.stats || !Array.isArray(s.enemies) || !Array.isArray(s.bullets) || !Array.isArray(s.cues)) return false;
  if (!['x', 'y', 'hp', 'aim', 'lastX', 'lastY', 'dodgeRemaining', 'dodgeX', 'dodgeY', 'dodgeCooldown', 'invulnerable', 'fireCooldown']
    .every(k => finite(s.player[k as keyof typeof s.player]))) return false;
  const { height, jumpVelocity } = s.player;
  if ((height === undefined) !== (jumpVelocity === undefined)
    || (height !== undefined && (!finite(height) || height < 0 || height > JUMP.maxHeight + 0.001
      || !finite(jumpVelocity) || jumpVelocity > JUMP.bootsVelocity || jumpVelocity < -JUMP.maxFallVelocity || (height === 0 && jumpVelocity !== 0)))) return false;
  if (s.player.airJumpUsed !== undefined && (s.player.airJumpUsed !== true || !(height! > 0))) return false;
  if (s.player.stompCooldown !== undefined && !integer(s.player.stompCooldown, 0, STOMP.cooldown)) return false;
  if (s.player.hp < 0 || s.player.hp > growthStats(s).maxHp || s.enemies.length > ENCOUNTER_SIZE.max || s.bullets.length > 240 || s.cues.length > 500) return false;
  if (s.player.weakTicks !== undefined && (s.phase !== 'combat' || !integer(s.player.weakTicks, 1, 180))) return false;
  if (s.player.slowTicks !== undefined && (s.phase !== 'combat' || !integer(s.player.slowTicks, 1, ENEMY_ATTACK.sealcaster.slowTicks))) return false;
  if (s.riftSummonUsed !== undefined && (s.riftSummonUsed !== true || s.phase !== 'combat')) return false;
  if (s.growth && (s.player.dodgeCooldown < 0 || s.player.dodgeCooldown > growthStats(s).dodgeRecharge)) return false;
  if (s.player.dodgeCarry !== undefined && (!s.growth || !finite(s.player.dodgeCarry) || s.player.dodgeCarry < 0 || s.player.dodgeCarry >= 1)) return false;
  if (s.player.auxCooldown !== undefined && !integer(s.player.auxCooldown, 0, 480)) return false;
  // Validate room/relic structure before bombs request its collision geometry.
  if (!validExpedition(s)) return false;
  if (s.chaliceHealed !== undefined && (s.expedition?.route === 'maze' || !validChaliceHealing(s.chaliceHealed)
    || !s.expedition?.acquired.includes('R56'))) return false;
  // Retain the former 15% ceiling for saved cooldowns already in progress, including after relic loss.
  if ((s.growth || s.weapon || s.expedition?.acquired.includes('R50')) && (s.player.fireCooldown < 0
    || s.player.fireCooldown > currentWeapon(s).interval * (s.expedition?.acquired.includes('R50') ? 1.15 : 1))) return false;
  if (s.player.silenceCooldown !== undefined && (!integer(s.player.silenceCooldown, 1, 360) || !s.expedition?.acquired.includes('R11'))) return false;
  if (s.bombs !== undefined && (!Array.isArray(s.bombs) || s.bombs.length > 1 || !s.bombs.every(b => b
    && s.expedition?.relics.includes('R13') && (s.phase === 'combat' || s.phase === 'explore')
    && integer(b.id, 0, Number.MAX_SAFE_INTEGER) && integer(b.ticks, 1, 60) && (s.player.auxCooldown ?? 0) >= b.ticks
    && (b.damage === undefined || b.damage === 36 || b.damage === 45)
    && finite(b.x) && finite(b.y) && b.x >= BOUNDS.x + 4 && b.x <= BOUNDS.x + BOUNDS.w - 4
    && b.y >= BOUNDS.y + 4 && b.y <= BOUNDS.y + BOUNDS.h - 4 && visible(b, b, 3.999, roomLayout(s).walls)))) return false;
  if (s.bullets.filter(b => b?.kind === 'split').length > 120) return false;
  if (!Object.values(s.stats).every(finite) || !['shots', 'hits', 'kills', 'damage', 'dodges'].every(k => finite(s.stats[k as keyof typeof s.stats]))) return false;
  if (!validBoss(s) || !validCurses(s)) return false;
  const doubleDodge = s.expedition?.relics.includes('R25'), maxCharges = doubleDodge ? 2 : 1;
  if (s.player.dodgeCharges === undefined) { if (doubleDodge) return false; }
  else if (!integer(s.player.dodgeCharges, 0, maxCharges) || !finite(s.player.dodgeCooldown) || s.player.dodgeCooldown < 0 || s.player.dodgeCooldown > growthStats(s).dodgeRecharge
    || (!s.growth && !Number.isInteger(s.player.dodgeCooldown))
    || (s.player.dodgeCharges === maxCharges) !== (s.player.dodgeCooldown === 0)) return false;
  if (s.player.parryUsed !== undefined && typeof s.player.parryUsed !== 'boolean') return false;
  if (s.expedition?.relics.includes('R30') && s.player.dodgeRemaining > 0 && s.player.parryUsed === undefined) return false;
  if (s.trapTicks !== undefined && (![2,3].includes(s.expedition?.region??0) || currentRoom(s)?.kind !== 'combat' || !integer(s.trapTicks, 0, Number.MAX_SAFE_INTEGER))) return false;
  return s.enemies.every(e => e && ['rat', 'archer', 'guard', 'shield', 'ashpriest','watcher','heartguard','riftshaman','voidknight','sealcaster','chainhound','readerstatue'].includes(e.kind) && ['move', 'windup', 'recover', 'charge'].includes(e.mode)
    && validLens(s, e) && validSilence(s, e) && validShaman(s, e) && validVoidKnight(s, e) && validSealCaster(e) && validChainHound(e) && validReaderStatue(e)
    && (e.kind === 'heartguard'
      ? e.maxHp === ENEMY_HEALTH.heartguard && e.hp >= 0 && e.hp <= e.maxHp && (e.mode === 'windup'
        ? [1,2].includes(e.comboStrike ?? 0) && integer(e.timer, 1, e.comboStrike === 1 ? ENEMY_ATTACK.heartguard.windupTicks : ENEMY_ATTACK.heartguard.followupTicks)
        : e.mode === 'recover' && e.comboStrike === 2
          ? integer(e.timer, 1, ENEMY_ATTACK.heartguard.comboPauseTicks)
          : e.comboStrike === undefined && ['move','recover'].includes(e.mode) && integer(e.timer, 0, ENEMY_ATTACK.heartguard.cooldownTicks))
      : e.comboStrike === undefined)
    && (e.shieldHp === undefined || (e.kind === 'shield' && finite(e.shieldHp) && e.shieldHp >= 0 && e.shieldHp <= ENEMY_ATTACK.shield.durability))
    && [e.id, e.x, e.y, e.hp, e.maxHp, e.angle, e.timer, e.targetX, e.targetY, e.flash].every(finite)
    && (e.chargeHit === undefined || (e.kind === 'guard' && typeof e.chargeHit === 'boolean'))
    && (e.mode !== 'charge' || (e.kind === 'guard' && typeof e.chargeHit === 'boolean' && integer(e.timer, 1, 60)))
    && (!['guard', 'shield', 'ashpriest','watcher'].includes(e.kind) || (e.maxHp === ENEMY_HEALTH[e.kind] && e.hp >= 0 && e.hp <= e.maxHp
      && integer(e.timer, e.mode === 'windup' ? 1 : 0, e.mode === 'windup' ? ENEMY_ATTACK[e.kind].windupTicks : ENEMY_ATTACK[e.kind].cooldownTicks)))
    && validBurn(e)
    && (e.spawnTicks === undefined || integer(e.spawnTicks, 0, 48)) && validFrost(e.frost, s.tick))
    && s.enemies.length + s.enemies.reduce((sum, e) => sum + (e.summonPoints?.length ?? 0), s.boss?.reservedSummons ?? 0) <= ENCOUNTER_SIZE.max
    && s.bullets.every(b => b && ['player', 'enemy'].includes(b.owner) && [b.id, b.x, b.y, b.vx, b.vy, b.life, b.damage].every(finite)
      && (b.height === undefined ? b.heightVelocity === undefined : finite(b.height) && b.height >= 0 && b.height <= 140 && finite(b.heightVelocity))
      && (b.bouncesLeft === undefined || integer(b.bouncesLeft, 0, 2))
      && (b.source === undefined || ['gatekeeper', 'chainpriest', 'ashpriest','watcher','relicheart','riftshaman'].includes(b.source)) && validProjectileEffect(b, s.tick)
      && (b.hitIds === undefined || (Array.isArray(b.hitIds) && b.hitIds.length <= 4 && new Set(b.hitIds).size === b.hitIds.length && b.hitIds.every(id => integer(id, 0, Number.MAX_SAFE_INTEGER)))))
    && s.cues.every(c => c && ['shot', 'hit', 'hurt', 'kill', 'dodge', 'blast', 'parry', 'stomp'].includes(c.kind) && [c.id, c.x, c.y, c.tick, c.amount].every(finite));
}

export function validRecord(value: unknown): value is SaveRecord {
  if (!value || typeof value !== 'object') return false;
  const r = value as SaveRecord;
  return r.schema === 1 && ['prototype-0.1', 'prototype-0.2', 'prototype-0.3', 'prototype-0.4', 'prototype-0.5', 'prototype-0.6', 'prototype-0.7', 'prototype-0.8', 'prototype-0.9', 'prototype-0.10', 'prototype-0.11', 'prototype-0.12', 'prototype-0.13'].includes(r.content) && Number.isInteger(r.revision) && r.revision >= 0
    && typeof r.savedAt === 'string' && (r.run === null || validRun(r.run))
    && (r.profile === undefined ? !['prototype-0.10', 'prototype-0.11', 'prototype-0.12', 'prototype-0.13'].includes(r.content) : validProfile(r.profile))
    // W04 was previously a starting weapon; existing expeditions stay readable.
    && (!r.run?.weapon || r.run.weapon === 'W04' || weaponUnlocked(r.profile ?? defaultProfile(), r.run.weapon))
    && (!r.run?.growth || investedPoints(r.run.growth.investment) <= earnedPoints(r.profile ?? defaultProfile()))
    && (!r.run?.growth?.firstRoomCleared || !!r.profile?.rooms.length)
    && !!r.settings && [0, 30, 60, 120, 144].includes(r.settings.fps)
    && ['sound', 'reducedMotion', 'showFps'].every(k => typeof r.settings[k as keyof Settings] === 'boolean')
    && (r.settings.mouseSensitivity === undefined || validMouseSensitivity(r.settings.mouseSensitivity));
}
