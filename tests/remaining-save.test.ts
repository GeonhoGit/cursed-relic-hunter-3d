import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { CorruptSaveError, SaveStore, defaultSettings, validRun } from '../src/persistence/save';
import { createDungeonRun, emptyInput, step, travel } from '../src/core/simulation';
import { adjacentRooms, currentRoom } from '../src/core/dungeon';
import { chooseRelic, prepareReward, roomReward } from '../src/core/expedition';
import { canAcquireRelic, canOfferRelic } from '../src/core/relic-acquisition';
import { isCurse, RELIC_IDS } from '../src/core/relics';
import { buyFromShop, refreshShop } from '../src/core/shop';
import { collectPickups, createFloorReward, unlockDoor } from '../src/core/terrain';
import { placePortal } from '../src/core/portal';
import { absorbBullet, spendAbsorbEnergy, startAbsorption } from '../src/core/shadow-absorb';
import { equipAuxiliary, useAuxiliary } from '../src/core/auxiliary';
import { advanceProjectiles, damageEnemy } from '../src/core/combat';
import { createBoss } from '../src/core/boss';
import { enterNextRegion } from '../src/core/region';
import { beginGrowthRun, defaultProfile, emptyInvestment, growthGoals, growthRelicUnlocks, validProfile } from '../src/core/growth';
import { BOUNDS, type GrowthProfile, type RelicId, type RunState } from '../src/core/model';

let sequence = 0;
const nextName = (purpose: string) => `remaining-${purpose}-${++sequence}`;
const expectedRelics = Array.from({ length: 57 }, (_, i) => `R${String(i + 1).padStart(2, '0')}` as RelicId);

// Previous expeditions supplied these valid ledgers; new-run unlocks use their public derivation.
function priorProfile(): GrowthProfile {
  const p = defaultProfile();
  p.rooms = [1, 2, 3, 4, 5].map(room => ({ runId: 'prior-rooms', room }));
  p.relics = Array.from({ length: 24 }, (_, i) => `R${String(i + 1).padStart(2, '0')}` as RelicId);
  p.purchases = [0, 1, 2, 3].map(slot => ({ runId: 'prior-shop', room: 10, slot }));
  p.purchases.push({ runId: 'other-shop', room: 10, slot: 0 });
  p.auxiliaryUsed = ['R13', 'R16', 'R17'];
  p.bossDefeated = p.priestDefeated = p.heartDefeated = true;
  p.curseFreeWin = true;
  return p;
}

function fresh(profile = priorProfile(), layoutVersion: 1 | 2 = 2, id = nextName('run')) {
  const s = createDungeonRun(17, layoutVersion);
  expect(beginGrowthRun(s, emptyInvestment(), id, profile.rooms.length > 0, growthRelicUnlocks(profile))).toBe(true);
  return s;
}

async function disk(name: string, value?: unknown): Promise<unknown> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('save', value === undefined ? 'readonly' : 'readwrite');
      const request = value === undefined ? tx.objectStore('save').get('current') : tx.objectStore('save').put(value, 'current');
      tx.oncomplete = () => resolve(value === undefined ? request.result : value);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

async function storeWithProfile(purpose: string, profile = priorProfile()) {
  expect(validProfile(profile)).toBe(true);
  const name = nextName(purpose), store = new SaveStore(name);
  await store.load();
  await disk(name, { schema: 1, content: 'prototype-0.14', revision: 1,
    savedAt: '2026-10-08T00:00:00.000Z', run: null, settings: defaultSettings(), profile });
  await store.load();
  return { store, name };
}

async function roundTrip(s: RunState, purpose: string, profile = priorProfile()) {
  expect(validRun(s), `${purpose}: before saving`).toBe(true);
  const { store, name } = await storeWithProfile(purpose, profile);
  const saved = await store.save(s, defaultSettings());
  expect(saved.content).toBe('prototype-0.16');
  const restored = (await new SaveStore(name).load())!;
  expect(restored.run).toEqual(s);
  return { store, name, restored: restored.run!, profile: restored.profile! };
}

// A displayed offer is a fixture; committing it goes through the real acquisition transaction.
function receiveRelic(s: RunState, id: RelicId) {
  const e = s.expedition!;
  const node = isCurse(id) ? e.dungeon!.rooms[9]
    : e.dungeon!.rooms.find(r => r.kind === 'treasure' && !r.locked && r.reward === null)!;
  expect(node, `unused source for ${id}`).toBeDefined();
  node.visited = node.cleared = true; e.room = node.id; s.phase = 'cleared'; s.enemies = [];
  node.reward = { room: node.id, candidates: [id], choice: null, slots: isCurse(id) ? 2 : 3, revision: 1 };
  expect(chooseRelic(s, id, 1), `acquiring ${id}`).toBe(true);
  expect(node.reward.choice).toBe(id); expect(e.acquired).toContain(id);
}

function clearedRoom(s: RunState, room: number) {
  const node = s.expedition!.dungeon!.rooms[room];
  node.visited = node.cleared = true; s.expedition!.room = room; s.phase = 'explore';
  s.enemies = []; s.bullets = []; s.cues = []; delete s.boss;
  if (node.kind === 'shop') refreshShop(s);
  if (node.kind === 'altar' && !node.reward) {
    s.phase = 'cleared'; prepareReward(s); expect(chooseRelic(s, 'skip')).toBe(true);
  }
  return node;
}

function home(s: RunState) {
  clearedRoom(s, 0); s.player.x = 320; s.player.y = 183;
}

function chargeEnergy(s: RunState, count = 5) {
  expect(startAbsorption(s)).toBe(true);
  for (let i = 0; i < count; i++) {
    const b = { id: s.nextId++, x: s.player.x, y: s.player.y, vx: 0, vy: 0,
      life: 30, owner: 'enemy' as const, damage: 10 };
    expect(absorbBullet(s, b)).toBe(true);
  }
}

function winBoss(s: RunState) {
  const node = s.expedition!.dungeon!.rooms[8];
  node.visited = true; s.expedition!.room = 8; s.phase = 'combat'; s.readyTicks = 0;
  s.enemies = []; s.bullets = []; s.cues = []; s.boss = createBoss(s);
  damageEnemy(s, s.boss, 10000); step(s, emptyInput());
  expect(s.boss.hp).toBe(0); expect(node.cleared).toBe(true); expect(s.phase).toBe('cleared');
}

function reachRegion(s: RunState, region: 1 | 2 | 3) {
  while ((s.expedition!.region ?? 1) < region) { winBoss(s); expect(enterNextRegion(s)).toBe(true); }
}

function enterReplay(s: RunState) {
  if (currentRoom(s)?.kind === 'combat') {
    const back = adjacentRooms(s).find(d => d.room.id === 0)!;
    expect(travel(s, back.direction)).toBe(true);
  } else home(s);
  const door = adjacentRooms(s).find(d => d.room.kind === 'combat')!;
  expect(travel(s, door.direction)).toBe(true);
  return { room: currentRoom(s)!, direction: door.direction };
}

describe('prototype 0.14 remaining-relic checkpoints', () => {
  it('writes and restores the new twelve-room terrain and departure unlock snapshot', async () => {
    const s = fresh();
    const { restored } = await roundTrip(s, 'new-layout');
    expect(restored.expedition!.dungeon!.layoutVersion).toBe(2);
    expect(restored.expedition!.dungeon!.rooms).toHaveLength(12);
    expect(restored.expedition!.dungeon!.rooms[11].locked).toBe(true);
    expect(restored.expedition!.dungeon!.rooms.filter(r => r.pits?.length)).toHaveLength(1);
    expect(restored.growth!.relicUnlocks).toContain('R47');
  });

  it('loads prototype 0.13 without adding terrain or effects, then keeps its eleven-room layout on write', async () => {
    const name = nextName('legacy'), store = new SaveStore(name); await store.load();
    const s = createDungeonRun(17), raw = { schema: 1, content: 'prototype-0.13', revision: 3,
      savedAt: '2026-10-05T00:00:00.000Z', run: s, settings: defaultSettings(), profile: defaultProfile() };
    await disk(name, raw);
    expect(await store.load()).toEqual(raw); expect(await disk(name)).toEqual(raw);
    const saved = await store.save(s, defaultSettings());
    expect(saved.content).toBe('prototype-0.16'); expect(saved.run).toEqual(s);
    expect(saved.run!.expedition!.dungeon!.rooms).toHaveLength(11);
    expect(saved.run!.expedition!.dungeon!.rooms.some(r => r.pits || r.locked !== undefined)).toBe(false);
    expect(saved.run!.recoveryItems).toBeUndefined(); expect(saved.run!.portals).toBeUndefined();
  });

  it('preserves an unknown future content record when load and write are rejected', async () => {
    const name = nextName('future'), store = new SaveStore(name); await store.load();
    const raw = { schema: 1, content: 'prototype-0.17', revision: 9, savedAt: 'future',
      run: null, settings: defaultSettings(), profile: defaultProfile(), futurePayload: { retain: true } };
    await disk(name, raw);
    await expect(store.load()).rejects.toBeInstanceOf(CorruptSaveError);
    await expect(store.save(createDungeonRun(17, 2), defaultSettings())).rejects.toBeInstanceOf(CorruptSaveError);
    expect(await disk(name)).toEqual(raw);
  });

  it('preserves shop and floor FIFO healing and resumes an actual heal input cast once', async () => {
    const s = fresh(); receiveRelic(s, 'R39');
    const shop = clearedRoom(s, 10); s.gold = 40;
    expect(buyFromShop(s, 2, shop.shop!.revision)).toBe('bought');
    const room = clearedRoom(s, 3); expect(createFloorReward(s)).toBe(true);
    s.player.x = 355; s.player.y = 183; collectPickups(s);
    expect(s.recoveryItems?.map(i => [i.source, i.healAmount, i.order])).toEqual([['shop', 15, 1], ['floor', 10, 2]]);
    expect(room.pickups?.map(p => p.kind)).toEqual(['gold']);
    s.player.hp = 50; step(s, { ...emptyInput(), heal: true });
    for (let i = 0; i < 10; i++) step(s, emptyInput());
    expect(s.recoveryCast?.ticks).toBe(20);
    const { restored, store } = await roundTrip(s, 'heal-fifo');
    for (let i = 0; i < 20; i++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s); expect(restored.player.hp).toBe(65);
    expect(restored.recoveryCast).toBeUndefined(); expect(restored.recoveryItems?.map(i => i.healAmount)).toEqual([10]);
    step(restored, { ...emptyInput(), heal: true });
    for (let i = 0; i < 30; i++) step(restored, emptyInput());
    expect(restored.player.hp).toBe(75); expect(restored.recoveryItems).toEqual([]);
    await store.save(restored, defaultSettings()); expect((await store.load())!.run).toEqual(restored);
  });

  it('restores an unfinished portal, completes the pair, and keeps actual transported bullet provenance', async () => {
    const s = fresh(); receiveRelic(s, 'R40'); home(s);
    expect(placePortal(s, { x: 350, y: 183 })).toBe(true);
    const { restored } = await roundTrip(s, 'portal-first');
    expect(restored.portals?.ticks).toBe(300); expect(restored.player.auxCooldowns?.R40).toBeUndefined();
    expect(placePortal(restored, { x: 390, y: 183 })).toBe(true);
    restored.bullets.push({ id: restored.nextId++, x: 330, y: 183, vx: 2400, vy: 0,
      life: 60, owner: 'player', damage: 10 });
    advanceProjectiles(restored);
    expect(restored.bullets[0].portalTrips).toBe(1);
    expect(restored.bullets[0].portalPairId).toBe(restored.portals!.id);
    expect(restored.bullets[0].portalLockUntil).toBe(restored.tick + 12);
    const saved = await roundTrip(restored, 'portal-pair');
    expect(saved.restored.bullets[0].x).toBeCloseTo(410);
    const malformed = structuredClone(saved.restored); malformed.bullets[0].portalTrips = 3;
    expect(validRun(malformed)).toBe(false);
  });

  it('restores stealth and the attack-induced dodge lock without restarting either timer', async () => {
    const s = fresh(); receiveRelic(s, 'R41'); home(s);
    for (let i = 0; i < 90; i++) step(s, emptyInput());
    expect(s.player.stealthed).toBe(true); expect(s.player.quietTicks).toBe(90);
    const { restored } = await roundTrip(s, 'stealth');
    step(restored, { ...emptyInput(), fire: true });
    expect(restored.player.stealthed).toBeUndefined(); expect(restored.player.dodgeLock).toBe(30);
    const locked = (await roundTrip(restored, 'dodge-lock')).restored;
    step(locked, { ...emptyInput(), dodge: true });
    expect(locked.player.dodgeLock).toBe(29); expect(locked.stats.dodges).toBe(0);
  });

  it('resumes a partially charged absorption channel with the same expiry and energy', async () => {
    const s = fresh(); receiveRelic(s, 'R13'); receiveRelic(s, 'R42'); home(s); chargeEnergy(s, 1);
    const { restored } = await roundTrip(s, 'absorption');
    expect(restored.absorption).toEqual({ ticks: 90, absorbed: 1 }); expect(restored.absorbEnergy).toBe(1);
    for (let i = 0; i < 90; i++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s); expect(restored.absorption).toBeUndefined();
    expect(restored.absorbEnergy).toBe(1); expect(restored.player.auxCooldowns?.R42).toBe(750);
  });

  it.each(['R16', 'R18'] as const)('accepts a real active %s effect after spending absorption energy on its recharge', async target => {
    const s = fresh(); receiveRelic(s, target); receiveRelic(s, 'R42'); home(s); chargeEnergy(s);
    expect(equipAuxiliary(s, target)).toBe(true); expect(useAuxiliary(s, { x: 400, y: 183 })).toBe(true);
    expect(spendAbsorbEnergy(s, target)).toBe(true);
    expect(s.absorbEnergy).toBe(4); expect(s.player.cooldownCredits?.[target]).toBe(30);
    expect(s.player.auxCooldowns?.[target]).toBe(target === 'R16' ? 570 : 690);
    const { restored } = await roundTrip(s, `energy-${target}`);
    expect(target === 'R16' ? restored.stoneWall : restored.decoy).toBeDefined();
    const forged = structuredClone(restored); delete forged.player.cooldownCredits;
    expect(validRun(forged)).toBe(false);
  });

  it('persists a crown reservation and first choice, finishes the second choice, and forfeits future B on region generation', async () => {
    const s = fresh(); receiveRelic(s, 'R47'); home(s);
    expect(s.crown!.a.region).toBe(1); expect(s.crown!.b.region).toBe(2); expect(s.crown!.ids).toEqual(['R01', 'R02']);
    const { restored: reserved } = await roundTrip(s, 'crown-reserved');
    expect(canOfferRelic(reserved, 'R01')).toBe(false);
    const a = clearedRoom(reserved, reserved.crown!.a.room); reserved.phase = 'cleared'; prepareReward(reserved);
    expect(chooseRelic(reserved, 'R01', a.reward!.revision)).toBe(true);
    expect(a.reward!.choice).toBeNull(); expect(a.reward!.selectedIds).toEqual(['R01']);
    const { restored: partial } = await roundTrip(reserved, 'crown-partial');
    expect(chooseRelic(partial, 'R01')).toBe(false); expect(chooseRelic(partial, 'R02')).toBe(true);
    expect(partial.crown!.state).toBe('complete'); expect(partial.crown!.selectedIds).toEqual(['R01', 'R02']);
    const { restored: complete } = await roundTrip(partial, 'crown-complete');
    winBoss(complete); expect(enterNextRegion(complete)).toBe(true);
    const b = complete.expedition!.dungeon!.rooms[complete.crown!.b.room];
    expect(b.reward?.forfeited).toBe(true); expect(b.reward?.candidates).toEqual([]); expect(b.reward?.choice).toBe('skip');
    const result = await roundTrip(complete, 'crown-next-region');
    expect(result.restored.crown!.state).toBe('complete');
    expect(result.restored.expedition!.previousDungeon!.rooms[result.restored.crown!.a.room].reward!.selectedIds).toEqual(['R01', 'R02']);
  });

  it('round-trips the original roster and replay, clears it without duplicate rewards, and preserves a valid replay death', async () => {
    const s = fresh(); receiveRelic(s, 'R54'); receiveRelic(s, 'R48');
    const first = enterReplay(s); s.phase = 'combat'; s.readyTicks = 0;
    for (const e of s.enemies) damageEnemy(s, e, 10000);
    step(s, emptyInput()); if (roomReward(s)?.choice === null) expect(chooseRelic(s, 'skip')).toBe(true);
    const originalRoster = structuredClone(first.room.firstRoster!);
    expect(originalRoster.length).toBeGreaterThanOrEqual(5);
    const replay = enterReplay(s); expect(s.replay?.room).toBe(first.room.id); expect(s.enemies).toHaveLength(2);
    expect(s.enemies.map(e => [e.kind, e.hp])).toEqual(originalRoster.slice(0, 2).map(e => [e.kind, e.maxHp]));
    s.player.hp = 50;
    const { restored } = await roundTrip(s, 'replay');
    const kills = restored.stats.kills, gold = restored.gold, beforePickups = structuredClone(replay.room.pickups);
    restored.phase = 'combat'; restored.readyTicks = 0;
    for (const e of restored.enemies) damageEnemy(restored, e, 10000);
    step(restored, emptyInput());
    expect(restored.stats.kills).toBe(kills); expect(restored.gold).toBe(gold); expect(restored.player.hp).toBe(50);
    expect(currentRoom(restored)!.pickups).toEqual(beforePickups); expect(restored.replay).toBeUndefined();
    expect(currentRoom(restored)!.firstRoster).toEqual(originalRoster);
    await roundTrip(restored, 'replay-cleared');
    enterReplay(restored); restored.phase = 'combat'; restored.readyTicks = 0; restored.player.hp = 1; restored.player.invulnerable = 0;
    restored.bullets.push({ id: restored.nextId++, x: restored.player.x, y: restored.player.y,
      vx: 0, vy: 0, life: 30, owner: 'enemy', damage: 10 });
    step(restored, emptyInput()); expect(restored.phase).toBe('dead'); expect(restored.player.hp).toBe(0);
    expect(validRun(restored)).toBe(true);
    const saved = await roundTrip(restored, 'replay-death'); expect(saved.restored.phase).toBe('dead');
  });
});

describe('remaining optional-state validation', () => {
  it.each([
    ['quiet overflow', (s: RunState) => { s.player.quietTicks = 91; }],
    ['stealth without quiet progress', (s: RunState) => { s.player.stealthed = true; }],
    ['dodge lock overflow', (s: RunState) => { s.player.dodgeLock = 31; }],
  ] as const)('rejects %s on an otherwise legal acquisition checkpoint', (_label, mutate) => {
    const s = fresh(); receiveRelic(s, 'R41'); home(s); expect(validRun(s)).toBe(true);
    mutate(s); expect(validRun(s)).toBe(false);
  });

  it.each([
    ['energy overflow', (s: RunState) => { s.absorbEnergy = 6; }],
    ['channel duration overflow', (s: RunState) => { s.absorption!.ticks = 91; }],
    ['completed channel retained', (s: RunState) => { s.absorption!.absorbed = 5; }],
    ['self recharge credit', (s: RunState) => { s.player.cooldownCredits = { R42: 30 }; }],
    ['credit overflow', (s: RunState) => { s.player.cooldownCredits = { R13: 1081 }; }],
  ] as const)('rejects %s without trusting forged timer or energy progress', (_label, mutate) => {
    const s = fresh(); receiveRelic(s, 'R13'); receiveRelic(s, 'R42'); home(s); chargeEnergy(s, 1);
    expect(validRun(s)).toBe(true); mutate(s); expect(validRun(s)).toBe(false);
  });

  it.each([
    ['nonboolean lock', (s: RunState) => { s.expedition!.dungeon!.rooms[11].locked = 'false' as never; }],
    ['unproven opened key door', (s: RunState) => { s.expedition!.dungeon!.rooms[11].locked = false; }],
    ['changed canonical pit', (s: RunState) => { s.expedition!.dungeon!.rooms.find(r => r.pits?.length)!.pits![0].x += 1; }],
    ['invalid safe ground', (s: RunState) => { s.player.safeGround = { x: NaN, y: 183 }; }],
  ] as const)('rejects %s in the new terrain snapshot', (_label, mutate) => {
    const s = fresh(); expect(validRun(s)).toBe(true); mutate(s); expect(validRun(s)).toBe(false);
  });

  it('rejects malformed FIFO amounts, duplicate items, and an unmatched recovery cast', () => {
    const s = fresh(); receiveRelic(s, 'R39'); const node = clearedRoom(s, 10); s.gold = 20;
    expect(buyFromShop(s, 2, node.shop!.revision)).toBe('bought'); expect(validRun(s)).toBe(true);
    const wrongAmount = structuredClone(s); wrongAmount.recoveryItems![0].healAmount = 10; expect(validRun(wrongAmount)).toBe(false);
    const duplicate = structuredClone(s); duplicate.recoveryItems!.push({ ...duplicate.recoveryItems![0], order: 2 });
    duplicate.recoveryOrder = 2; expect(validRun(duplicate)).toBe(false);
    const wrongCast = structuredClone(s); wrongCast.recoveryCast = { pickupId: 'missing', ticks: 30 }; expect(validRun(wrongCast)).toBe(false);
  });

  it('rejects crown targets and selection history that do not match actual designated rewards and grants', () => {
    const s = fresh(); receiveRelic(s, 'R47'); home(s); expect(validRun(s)).toBe(true);
    const wrongRoom = structuredClone(s); wrongRoom.crown!.a.room = 6; expect(validRun(wrongRoom)).toBe(false);
    const reversedRegions = structuredClone(s); reversedRegions.crown!.b.region = 1; expect(validRun(reversedRegions)).toBe(false);
    const forgedSelection = structuredClone(s); forgedSelection.crown!.selectedIds = ['R03']; expect(validRun(forgedSelection)).toBe(false);
  });

  it('rejects a first roster with invented health and a replay marker attached to a different room', () => {
    const s = fresh(); receiveRelic(s, 'R48'); const first = enterReplay(s);
    expect(validRun(s)).toBe(true);
    const wrongHealth = structuredClone(s);
    wrongHealth.expedition!.dungeon!.rooms[first.room.id].firstRoster![0].maxHp += 1;
    expect(validRun(wrongHealth)).toBe(false);
    const wrongReplay = structuredClone(s); wrongReplay.replay = { region: 1, room: 0 };
    expect(validRun(wrongReplay)).toBe(false);
  });
});

describe('actual remaining growth goals and acquisition gates', () => {
  it.each([
    { count: 11, platform: false, dice: false }, { count: 12, platform: true, dice: false },
    { count: 23, platform: true, dice: false }, { count: 24, platform: true, dice: true },
  ])('uses the previous profile proof at $count distinct relics for new departure unlocks', async ({ count, platform, dice }) => {
    const p = defaultProfile(); p.relics = expectedRelics.slice(0, count);
    expect(validProfile(p)).toBe(true);
    const s = fresh(p);
    expect(canOfferRelic(s, 'R28')).toBe(platform); expect(canOfferRelic(s, 'R32')).toBe(dice);
    await roundTrip(s, `threshold-${count}`, p);
  });

  it('counts R37 and two other distinct acquired curses once across real acquisition checkpoints', async () => {
    const initial = defaultProfile(), { store } = await storeWithProfile('curse-goal', initial);
    const first = fresh(initial, 2, 'curse-one'); receiveRelic(first, 'R37'); receiveRelic(first, 'R43'); home(first);
    const saved = await store.save(first, defaultSettings());
    expect(growthGoals(saved.profile!).find(g => g.id === 'G10')!.count).toBe(2);
    const second = fresh(saved.profile!, 2, 'curse-two'); receiveRelic(second, 'R40'); home(second);
    const complete = await store.save(second, defaultSettings());
    expect(growthGoals(complete.profile!).find(g => g.id === 'G10')!.count).toBe(3);
    expect((await store.save(second, defaultSettings())).profile).toEqual(complete.profile);
  });

  it('records actual key consumption by unique run, region, and room without repeating a checkpoint', async () => {
    const { store } = await storeWithProfile('key-goal');
    let profile = priorProfile();
    for (const region of [1, 2, 3] as const) {
      const s = fresh(profile, 2, `key-run-${region}`); reachRegion(s, region); receiveRelic(s, 'R35');
      const locked = s.expedition!.dungeon!.rooms[11];
      const parent = s.expedition!.dungeon!.rooms.find(r => Math.abs(r.x - locked.x) + Math.abs(r.y - locked.y) === 1)!;
      clearedRoom(s, parent.id);
      s.player.x = 320 + (locked.x - parent.x) * (BOUNDS.w / 2 - 12);
      s.player.y = 183 + (locked.y - parent.y) * (BOUNDS.h / 2 - 12);
      expect(unlockDoor(s)).toBe(true); expect(unlockDoor(s)).toBe(false);
      expect(s.expedition!.relics).not.toContain('R35'); expect(s.expedition!.acquired).toContain('R35');
      expect(validRun(s)).toBe(true);
      const saved = await store.save(s, defaultSettings()); profile = saved.profile!;
      expect((await store.save(s, defaultSettings())).profile!.lockedRooms).toEqual(profile.lockedRooms);
    }
    expect(profile.lockedRooms).toEqual([
      { runId: 'key-run-1', region: 1, room: 11 }, { runId: 'key-run-2', region: 2, room: 11 }, { runId: 'key-run-3', region: 3, room: 11 },
    ]);
    expect(growthGoals(profile).find(g => g.id === 'G11')!.count).toBe(3);
    expect(validProfile({ ...profile, lockedRooms: [profile.lockedRooms![0], profile.lockedRooms![0]] })).toBe(false);
  });

  it.each(['clean new run', 'lost R37', 'lost R43', 'legacy unknown history'] as const)(
    'awards a curse-free heart victory only from positive run history: %s', async kind => {
      const initial = defaultProfile(), s = fresh(initial, kind === 'legacy unknown history' ? 1 : 2, nextName('victory'));
      if (kind === 'lost R37' || kind === 'lost R43') {
        receiveRelic(s, kind === 'lost R37' ? 'R37' : 'R43');
        s.expedition!.relics = []; s.player.equippedAux = null;
      }
      reachRegion(s, 3); winBoss(s);
      const { profile } = await roundTrip(s, `goal-${kind}`, initial);
      expect(profile.heartDefeated).toBe(true);
      expect(growthGoals(profile).find(g => g.id === 'G12')!.count).toBe(kind === 'clean new run' ? 1 : 0);
      expect(growthRelicUnlocks(profile).includes('R47')).toBe(kind === 'clean new run');
      expect(growthRelicUnlocks(profile).includes('R48')).toBe(kind === 'clean new run');
    });

  it('distinguishes two key events in the same run across regions and rejects the repeated full identity', () => {
    const p = defaultProfile(); p.lockedRooms = [{ runId: 'same-run', region: 1, room: 11 }, { runId: 'same-run', region: 2, room: 11 }];
    expect(validProfile(p)).toBe(true); expect(growthGoals(p).find(g => g.id === 'G11')!.count).toBe(2);
    p.lockedRooms.push({ runId: 'same-run', region: 2, room: 11 }); expect(validProfile(p)).toBe(false);
  });

  it.each(expectedRelics)('offers, commits, and saves the real acquisition path for %s when its requirements are met', async id => {
    const s = fresh();
    if (id === 'R38') { receiveRelic(s, 'R01'); receiveRelic(s, 'R02'); }
    if (id === 'R42') receiveRelic(s, 'R13');
    home(s); expect(RELIC_IDS).toContain(id); expect(canAcquireRelic(s, id)).toBe(true); expect(canOfferRelic(s, id)).toBe(true);
    receiveRelic(s, id);
    const { restored } = await roundTrip(s, `acquire-${id}`);
    expect(restored.expedition!.relics).toContain(id);
    expect(restored.expedition!.acquired.filter(r => r === id)).toHaveLength(1);
  });
});
