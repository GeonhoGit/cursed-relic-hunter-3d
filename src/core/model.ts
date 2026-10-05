export const WIDTH = 640;
export const HEIGHT = 360;
export const DT = 1 / 60;
// Keep the original center and prop coordinates so existing FPS saves remain usable.
export const BOUNDS = { x: 320 - 576 * 0.8, y: 183 - 282 * 0.8, w: 576 * 1.6, h: 282 * 1.6 };
export interface Point { x: number; y: number }
export interface EnemyHit { damage: number; cause: string; slow?: true; pull?: Point }
export interface Box extends Point { w: number; h: number }
// Physical pedestal bounds; the surrounding rune and floating crescent are decorative.
export const ALTAR_PEDESTAL: Box = { x: 290, y: 171, w: 60, h: 29 };
export const TREASURE_PEDESTAL: Box = { x: 303, y: 170, w: 34, h: 21 };
export const SHOP_MERCHANT: Box = { x: 306, y: 145, w: 28, h: 31 };
export const SHOP_COUNTER: Box = { x: 284, y: 176, w: 72, h: 27 };
export const PILLARS: Box[] = [
  { x: 208, y: 108, w: 32, h: 40 }, { x: 400, y: 108, w: 32, h: 40 },
  { x: 208, y: 224, w: 32, h: 40 }, { x: 400, y: 224, w: 32, h: 40 },
];
export const BOUNDARY_WALLS: Box[] = [
  { x: BOUNDS.x - 32, y: BOUNDS.y - 42, w: BOUNDS.w + 64, h: 42 },
  { x: BOUNDS.x - 32, y: BOUNDS.y + BOUNDS.h, w: BOUNDS.w + 64, h: 36 },
  { x: BOUNDS.x - 32, y: BOUNDS.y - 42, w: 32, h: BOUNDS.h + 78 },
  { x: BOUNDS.x + BOUNDS.w, y: BOUNDS.y - 42, w: 32, h: BOUNDS.h + 78 },
];
export const WALLS: Box[] = [...BOUNDARY_WALLS, ...PILLARS];
export interface InputState { moveX: number; moveY: number; aimX: number; aimY: number; fire: boolean; dodge: boolean; jump?: boolean; auxiliary?: boolean; aimPitch?: number }
export interface Player extends Point {
  height?: number; jumpVelocity?: number; airJumpUsed?: boolean; stompCooldown?: number;
  weakTicks?: number;
  slowTicks?: number;
  silenceCooldown?: number;
  hp: number; aim: number; lastX: number; lastY: number;
  dodgeRemaining: number; dodgeX: number; dodgeY: number; dodgeCooldown: number;
  invulnerable: number; fireCooldown: number;
  auxCooldown?: number;
  timeCooldown?: number; equippedAux?: 'R13' | 'R43' | null;
  dodgeCharges?: number; dodgeCarry?: number; parryUsed?: boolean;
}
export interface Frost { hits: { eventId: number; tick: number }[]; freezeTicks: number; resistTicks: number }
export interface Enemy extends Point {
  id: number; kind: 'rat' | 'archer' | 'guard' | 'shield' | 'ashpriest' | 'watcher' | 'heartguard' | 'riftshaman' | 'voidknight' | 'sealcaster' | 'chainhound' | 'readerstatue'; hp: number; maxHp: number; angle: number;
  mode: 'move' | 'windup' | 'recover' | 'charge'; timer: number; targetX: number; targetY: number; flash: number;
  chargeHit?: boolean;
  comboStrike?: 1 | 2;
  summonPoints?: Point[];
  blinkTarget?: Point;
  blinkTick?: number;
  laserTicks?: number;
  burnTicks?: number; burnPulse?: number; burnDamage?: number;
  spawnTicks?: number;
  shieldHp?: number;
  shieldDisabledTicks?: number;
  lensCooldown?: number;
  silenceTicks?: number;
  frost?: Frost;
}
export type BossPattern = 'fan' | 'charge' | 'rocks' | 'shield' | 'chains' | 'ring' | 'ritual' | 'pulse' | 'laser' | 'shockwave';
export interface Boss extends Point {
  id: number; kind: 'gatekeeper' | 'chainpriest' | 'relicheart'; hp: number; maxHp: number; angle: number; flash: number;
  stage: 1 | 2 | 3; pattern: BossPattern; mode: 'windup' | 'charge' | 'shield' | 'recover' | 'transition' | 'wave';
  timer: number; targetX: number; targetY: number; chargeHit: boolean;
  rocks: Point[]; impactTicks: number; summonsDone: boolean; transitionTick: number;
  chains?: (Point & { tx: number; ty: number })[];
  ringGap?: number; ritualAttempts?: number; reservedSummons?: number;
  shieldLinks?: number; pillarIndex?: number; pillarHp?: number; relinkTicks?: number;
  shockRadius?: number; shockHit?: boolean;
  lensCooldown?: number;
  silenceTicks?: number;
  burnTicks?: number; burnPulse?: number; burnDamage?: number;
  frost?: Frost;
}
export const isBoss = (e: Enemy | Boss): e is Boss => e.kind === 'gatekeeper' || e.kind === 'chainpriest' || e.kind === 'relicheart';
export const isBossBullet = (b: Pick<Bullet, 'source'>) => b.source === 'gatekeeper' || b.source === 'chainpriest' || b.source === 'relicheart';
export const unreflectableBullet = (b: Pick<Bullet, 'source'>) => isBossBullet(b) && b.source !== 'relicheart';
export interface Bullet extends Point {
  height?: number; heightVelocity?: number;
  id: number; vx: number; vy: number; life: number; owner: 'player' | 'enemy'; damage: number;
  bouncesLeft?: number; hitIds?: number[];
  source?: 'gatekeeper' | 'chainpriest' | 'ashpriest' | 'relicheart' | 'watcher' | 'riftshaman';
  kind?: 'split' | 'reflected'; eventId?: number; splitDone?: boolean; originTargetId?: number;
  phase?: 'return'; outboundHits?: { id: number; tick: number }[];
}
export interface Bomb extends Point { id: number; ticks: number; damage?: number }
export interface Cue extends Point { id: number; kind: 'shot' | 'hit' | 'hurt' | 'kill' | 'dodge' | 'blast' | 'parry' | 'stomp'; tick: number; amount: number }
export type RelicId = 'R01' | 'R02' | 'R03' | 'R04' | 'R05' | 'R07' | 'R08' | 'R11' | 'R12' | 'R13' | 'R20' | 'R25' | 'R30' | 'R38' | 'R43' | 'R44' | 'R45' | 'R46' | 'R49' | 'R50' | 'R51' | 'R52' | 'R53' | 'R54' | 'R55' | 'R56' | 'R57';
export type RelicRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type GrowthStat = 'health' | 'attack' | 'speed' | 'movement' | 'dodge';
export type WeaponId = 'W01' | 'W02' | 'W03' | 'W04';
export type Investment = Record<GrowthStat, number>;
export interface GrowthProfile {
  selectedWeapon?: WeaponId;
  investment: Investment;
  rooms: { runId: string; room: number; region?: 1 | 2 | 3 }[];
  purchases: { runId: string; room: number; slot: number; region?: 1 | 2 | 3 }[];
  relics: RelicId[]; bossDefeated: boolean;
  priestDefeated?: boolean;
  heartDefeated?: boolean;
}
export type Direction = 'north' | 'east' | 'south' | 'west';
export interface RoomReward { room: number; candidates: RelicId[]; choice: RelicId | 'skip' | null; rerolled?: true }
export interface ShopSlot { kind: 'relic' | 'heal' | 'curse'; relic: RelicId | null; purchased: boolean; repairCounter: number }
export interface ShopOffer { revision: number; slots: ShopSlot[] }
export interface DungeonRoom extends Point {
  id: number; kind: 'start' | 'combat' | 'treasure' | 'boss' | 'altar' | 'shop'; template: number;
  visited: boolean; cleared: boolean; reward: RoomReward | null;
  shop?: ShopOffer;
  structure?: number;
  chaliceHealed?: number;
}
export interface Expedition {
  route?: 'gatekeeper' | 'maze';
  region?: 1 | 2 | 3;
  room: number; relics: RelicId[]; acquired: RelicId[];
  reward: RoomReward | null;
  dungeon?: { rooms: DungeonRoom[]; layoutVersion?: 1 };
  previousDungeon?: { rooms: DungeonRoom[]; layoutVersion?: 1 };
  earlierDungeon?: { rooms: DungeonRoom[]; layoutVersion?: 1 };
}
export interface RunState {
  // Legacy routes have no DungeonRoom in which to keep the current room allowance.
  chaliceHealed?: number;
  riftSummonUsed?: true;
  trapTicks?: number;
  view?: { yaw: number; pitch: number };
  weapon?: WeaponId;
  growth?: { id: string; investment: Investment; firstRoomCleared?: true };
  version: 1; seed: number; rng: number; tick: number; nextId: number;
  phase: 'ready' | 'combat' | 'explore' | 'cleared' | 'dead'; readyTicks: number;
  wave: number; waveDelay: number; player: Player; enemies: Enemy[]; bullets: Bullet[];
  cues: Cue[]; gold: number; lastDamage: string;
  expedition?: Expedition;
  boss?: Boss;
  bombs?: Bomb[];
  timeStop?: Point & { ticks: number; enemyIds: number[]; bulletIds: number[] };
  timeDebt?: number;
  revival?: { tick: number; lost: RelicId[] };
  stats: { shots: number; hits: number; kills: number; damage: number; dodges: number };
}
