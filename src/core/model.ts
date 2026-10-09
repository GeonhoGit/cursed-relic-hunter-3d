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
export interface InputState { moveX: number; moveY: number; aimX: number; aimY: number; fire: boolean; dodge: boolean; jump?: boolean; auxiliary?: boolean; heal?: boolean; aimPitch?: number }
export interface Player extends Point {
  quietTicks?: number; stealthed?: true; dodgeLock?: number;
  cooldownCredits?: Partial<Record<AuxiliaryId, number>>;
  safeGround?: Point; pitDodge?: true;
  clawUsed?: true; teleportTick?: number;
  height?: number; jumpVelocity?: number; airJumpUsed?: boolean; stompCooldown?: number;
  weakTicks?: number;
  slowTicks?: number;
  silenceCooldown?: number;
  lightningCooldown?: number; starlightCooldown?: number; starlightRest?: number;
  wardCooldown?: number; cleanseCooldown?: number;
  orbitCount?: number; gravityCooldown?: number; thornsCooldown?: number; thornTrailId?: number;
  hp: number; aim: number; lastX: number; lastY: number;
  dodgeRemaining: number; dodgeX: number; dodgeY: number; dodgeCooldown: number;
  invulnerable: number; fireCooldown: number;
  auxCooldown?: number;
  timeCooldown?: number; equippedAux?: AuxiliaryId | null;
  auxCooldowns?: Partial<Record<AuxiliaryId, number>>;
  dodgeCharges?: number; dodgeCarry?: number; parryUsed?: boolean;
}
export interface Frost { hits: { eventId: number; tick: number }[]; freezeTicks: number; resistTicks: number }
export interface Decoy extends Point { kind: 'decoy'; id: number; hp: number; ticks: number }
export interface Enemy extends Point {
  elite?: true;
  charm?: { ticks: number; ownerFaction: 'player'; sourceRelicId: 'R17'; originalEnemyId: number };
  targetId?: number;
  contactCooldown?: number;
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
  decoyShockHit?: number;
  contactCooldown?: number;
  allyShockHit?: number;
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
export type Npc = Enemy | Boss | Decoy;
export const isBoss = (e: Npc): e is Boss => e.kind === 'gatekeeper' || e.kind === 'chainpriest' || e.kind === 'relicheart';
export const isBossBullet = (b: Pick<Bullet, 'source'>) => b.source === 'gatekeeper' || b.source === 'chainpriest' || b.source === 'relicheart';
export const unreflectableBullet = (b: Pick<Bullet, 'source'>) => isBossBullet(b) && b.source !== 'relicheart';
export interface Bullet extends Point {
  portalTrips?: number; portalLockUntil?: number; portalPairId?: number;
  originalEnemyId?: number; sourceRelicId?: 'R17';
  height?: number; heightVelocity?: number;
  id: number; vx: number; vy: number; life: number; owner: 'player' | 'enemy'; damage: number;
  bouncesLeft?: number; hitIds?: number[];
  source?: 'gatekeeper' | 'chainpriest' | 'ashpriest' | 'relicheart' | 'watcher' | 'riftshaman';
  kind?: 'split' | 'reflected' | 'orbit' | 'ally'; eventId?: number; splitDone?: boolean; lightningDone?: true; gravityDone?: true; originTargetId?: number;
  phase?: 'return'; outboundHits?: { id: number; tick: number }[];
}
export interface Bomb extends Point { id: number; ticks: number; damage?: number }
export interface Cue extends Point { id: number; kind: 'shot' | 'hit' | 'hurt' | 'kill' | 'dodge' | 'blast' | 'parry' | 'stomp' | 'lightning' | 'starlight' | 'ward' | 'cleanse' | 'moss' | 'thorns' | 'evade'; tick: number; amount: number; end?: Point; height?: number; endHeight?: number; ally?: true }
export type RelicId = 'R01' | 'R02' | 'R03' | 'R04' | 'R05' | 'R06' | 'R07' | 'R08' | 'R09' | 'R10' | 'R11' | 'R12' | 'R13' | 'R14' | 'R15' | 'R16' | 'R17' | 'R18' | 'R19' | 'R20' | 'R21' | 'R22' | 'R23' | 'R24' | 'R25' | 'R26' | 'R27' | 'R28' | 'R29' | 'R30' | 'R31' | 'R32' | 'R33' | 'R34' | 'R35' | 'R36' | 'R37' | 'R38' | 'R39' | 'R40' | 'R41' | 'R42' | 'R43' | 'R44' | 'R45' | 'R46' | 'R47' | 'R48' | 'R49' | 'R50' | 'R51' | 'R52' | 'R53' | 'R54' | 'R55' | 'R56' | 'R57';
export const AUXILIARY_IDS = ['R13', 'R16', 'R17', 'R18', 'R26', 'R40', 'R42', 'R43'] as const;
export type AuxiliaryId = typeof AUXILIARY_IDS[number];
export type RelicUnlockId = 'R14' | 'R15' | 'R16' | 'R17' | 'R18' | 'R26' | 'R27' | 'R28' | 'R29' | 'R32' | 'R33' | 'R34' | 'R35' | 'R36' | 'R47' | 'R48';
export type RelicRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type GrowthStat = 'health' | 'attack' | 'speed' | 'movement' | 'dodge';
export type WeaponId = 'W01' | 'W02' | 'W03' | 'W04';
export type Investment = Record<GrowthStat, number>;
export interface GrowthProfile {
  lockedRooms?: { runId: string; room: number; region: 1 | 2 | 3 }[];
  curseFreeWin?: true;
  auxiliaryUsed?: AuxiliaryId[];
  selectedWeapon?: WeaponId;
  investment: Investment;
  rooms: { runId: string; room: number; region?: 1 | 2 | 3 }[];
  purchases: { runId: string; room: number; slot: number; region?: 1 | 2 | 3 }[];
  relics: RelicId[]; bossDefeated: boolean;
  priestDefeated?: boolean;
  heartDefeated?: boolean;
}
export type Direction = 'north' | 'east' | 'south' | 'west';
export interface RoomReward { room: number; candidates: RelicId[]; choice: RelicId | 'skip' | 'gold' | null; rerolled?: true; diceRerolls?: number; revision?: number; slots?: number; selectedIds?: RelicId[]; forfeited?: true }
export interface ShopSlot { kind: 'relic' | 'heal' | 'curse'; relic: RelicId | null; purchased: boolean; repairCounter: number }
export interface ShopOffer { revision: number; slots: ShopSlot[] }
export interface DungeonRoom extends Point {
  encounter?: EncounterPlan;
  locked?: boolean; keyOpened?: true;
  pits?: Box[]; mainReward?: true;
  firstRoster?: { kind: Enemy['kind']; maxHp: number }[];
  pickups?: Pickup[];
  featherUsed?: true;
  id: number; kind: 'start' | 'combat' | 'elite' | 'treasure' | 'boss' | 'altar' | 'shop'; template: number;
  visited: boolean; cleared: boolean; reward: RoomReward | null;
  shop?: ShopOffer;
  structure?: number;
  chaliceHealed?: number;
  mossCounted?: true;
}
export interface Pickup extends Point { id: string; kind: 'gold' | 'heal'; amount: number }
export interface CrownTarget { region: 1 | 2 | 3; room: number; mainPathIndex: number }
export interface CrownReservation { a: CrownTarget; b: CrownTarget; ids: RelicId[]; selectedIds: RelicId[]; state: 'reserved' | 'complete' | 'abandoned' }
export interface EncounterSpec { kind: Enemy['kind']; elite?: true }
export interface EncounterPlan { waves: EncounterSpec[][]; balanceVersion?: 2 }
export interface Expedition {
  route?: 'gatekeeper' | 'maze';
  region?: 1 | 2 | 3;
  room: number; relics: RelicId[]; acquired: RelicId[];
  reward: RoomReward | null;
  dungeon?: { rooms: DungeonRoom[]; layoutVersion?: 1 | 2 | 3 };
  previousDungeon?: { rooms: DungeonRoom[]; layoutVersion?: 1 | 2 | 3 };
  earlierDungeon?: { rooms: DungeonRoom[]; layoutVersion?: 1 | 2 | 3 };
}
export interface RunState {
  portals?: { first: Point; second?: Point; ticks: number; id: number };
  absorption?: { ticks: number; absorbed: number }; absorbEnergy?: number;
  recoveryItems?: { pickupId: string; healAmount: number; source: 'floor' | 'shop'; order: number }[];
  recoveryCast?: { pickupId: string; ticks: number }; recoveryOrder?: number;
  crown?: CrownReservation;
  replay?: { region: 1 | 2 | 3; room: number };
  notice?: string;
  featherRooms?: number[];
  anchor?: Point & { id: number; room: number; region: 1 | 2 | 3 };
  decoy?: Decoy;
  stoneWall?: Box & { id: number; hp: number; ticks: number };
  diceRerolls?: number;
  orbitShots?: { id: number; eventId: number; ticks: number; damage: number; angle: number; vertical?: true; bouncesLeft: number }[];
  gravityWell?: Point & { id: number; ticks: number; eventId: number };
  thornTrails?: { id: number; ticks: number; damage: number; points: Point[] }[];
  thornHits?: { id: number; tick: number }[];
  // Legacy routes have no DungeonRoom in which to keep the current room allowance.
  chaliceHealed?: number;
  mossClears?: number;
  mossRooms?: number[];
  riftSummonUsed?: true;
  trapTicks?: number;
  view?: { yaw: number; pitch: number };
  weapon?: WeaponId;
  growth?: { id: string; investment: Investment; firstRoomCleared?: true; relicUnlocks?: RelicUnlockId[]; auxiliaryUsed?: AuxiliaryId[] };
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
