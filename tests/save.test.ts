import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { SaveStore, defaultSettings, validRun } from '../src/persistence/save';
import { chooseRelic, openTreasure } from '../src/core/expedition';
import { createBoss, startBossPattern } from '../src/core/boss';
import { createRun, createDungeonRun, travel, step, emptyInput } from '../src/core/simulation';
import { adjacentRooms, currentRoom } from '../src/core/dungeon';
import { roomReward } from '../src/core/expedition';
import { useAuxiliary } from '../src/core/auxiliary';

let count = 0;
describe('atomic local saves', () => {
  it('restores ten enemies and ten stopped targets without rerolling, while rejecting eleven', async () => {
    const store = new SaveStore(`ten-enemies-${++count}`); await store.load();
    const s = createRun(42); s.phase = 'combat'; s.player.x = 320; s.player.y = 180;
    s.enemies = Array.from({ length: 10 }, (_, i) => ({ ...s.enemies[0], id: s.nextId++, x: 270 + (i % 5) * 25, y: i < 5 ? 170 : 200 }));
    s.expedition!.relics = ['R43']; s.expedition!.acquired = ['R43']; s.player.equippedAux = 'R43';
    expect(useAuxiliary(s, s.player)).toBe(true); expect(s.timeStop!.enemyIds).toHaveLength(10);
    await store.save(s, defaultSettings()); const restored = (await store.load())!.run!; expect(restored).toEqual(s);
    for (let i = 0; i < 20; i++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s);
    const invalid = structuredClone(s); invalid.enemies.push({ ...invalid.enemies[0], id: invalid.nextId++ });
    expect(validRun(invalid)).toBe(false);
    const badStop = structuredClone(s); badStop.timeStop!.enemyIds.push(badStop.nextId++); expect(validRun(badStop)).toBe(false);
  });
  it('restores partial double-dodge recharge and a spent reflection without granting another parry', async () => {
    const store = new SaveStore(`dodge-relics-${++count}`); await store.load();
    const s = createRun(42); s.phase = 'combat'; s.player.x = 320; s.player.y = 180;
    s.expedition!.relics = ['R25', 'R30']; s.expedition!.acquired = [...s.expedition!.relics];
    Object.assign(s.player, { dodgeCharges: 1, dodgeCooldown: 80, dodgeRemaining: 0.2, dodgeX: 1, dodgeY: 0, parryUsed: true });
    s.bullets = [
      { id: s.nextId++, x: 350, y: 180, vx: 210, vy: 0, owner: 'player', kind: 'reflected', damage: 15, life: 80 },
      { id: s.nextId++, x: 330, y: 180, vx: -210, vy: 0, owner: 'enemy', damage: 10, life: 80 },
    ];
    await store.save(s, defaultSettings()); const restored = (await store.load())!.run!; expect(restored).toEqual(s);
    const mutate = [
      (r: typeof s) => { r.player.dodgeCharges = 3; },
      (r: typeof s) => { r.player.dodgeCharges = 2; },
      (r: typeof s) => { r.player.dodgeCooldown = 0; },
      (r: typeof s) => { delete r.player.dodgeCharges; },
      (r: typeof s) => { delete r.player.parryUsed; },
      (r: typeof s) => { r.bullets[0].phase = 'return'; },
      (r: typeof s) => { r.bullets[0].source = 'gatekeeper'; },
      (r: typeof s) => { r.bullets[0].bouncesLeft = 2; },
    ];
    for (const change of mutate) { const invalid = structuredClone(s); change(invalid); expect(validRun(invalid)).toBe(false); }
    step(s, emptyInput()); step(restored, emptyInput());
    expect(s.bullets.filter(b => b.kind === 'reflected')).toHaveLength(1); expect(s.player.parryUsed).toBe(true);
    for (let i = 0; i < 100; i++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s);
  });
  it('restores bombs, frost, and returning projectiles with their remaining effects and rejects damaged metadata', async () => {
    const store = new SaveStore(`relic-effects-${++count}`); await store.load();
    const s = createRun(42); s.phase = 'combat'; s.tick = 200;
    s.expedition!.relics = ['R03', 'R04', 'R08', 'R13']; s.expedition!.acquired = [...s.expedition!.relics];
    s.player.auxCooldown = 450; s.bombs = [{ id: s.nextId++, x: 180, y: 180, ticks: 30 }];
    s.enemies[0].frost = { hits: [], freezeTicks: 20, resistTicks: 200 };
    s.enemies[1].frost = { hits: [{ eventId: 90, tick: 198 }], freezeTicks: 0, resistTicks: 0 };
    s.bullets = [{ id: s.nextId++, eventId: 88, phase: 'return', splitDone: true, x: 320, y: 180, vx: -320, vy: 0,
      owner: 'player', damage: 7, life: 45, hitIds: [], outboundHits: [{ id: s.enemies[0].id, tick: 195 }] }];
    await store.save(s, defaultSettings()); const restored = (await store.load())!.run!;
    expect(restored).toEqual(s);
    for (let i = 0; i < 80; i++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s);
    const mutate = [
      (r: typeof s) => { r.player.auxCooldown = -1; },
      (r: typeof s) => { r.bombs = [{ id: 99, x: 220, y: 125, ticks: 30 }]; },
      (r: typeof s) => { r.bombs = [{ id: 99, x: 1500, y: 180, ticks: 30 }]; },
      (r: typeof s) => { r.bombs = [{ id: 99, x: 180, y: 180, ticks: 61 }]; },
      (r: typeof s) => { r.enemies[0].frost = { hits: [], freezeTicks: 37, resistTicks: 216 }; },
      (r: typeof s) => { r.enemies[0].frost = { hits: [{ eventId: 1, tick: 99999 }], freezeTicks: 0, resistTicks: 0 }; },
      (r: typeof s) => { r.bullets = [{ id: 90, x: 300, y: 180, vx: 0, vy: 0, owner: 'enemy', damage: 7, life: 30, phase: 'return' }]; },
      (r: typeof s) => { r.bullets = [{ id: 90, x: 300, y: 180, vx: 320, vy: 0, owner: 'player', damage: 2.45, life: 30, kind: 'split', phase: 'return' }]; },
    ];
    for (const change of mutate) { const invalid = structuredClone(s); change(invalid); expect(validRun(invalid)).toBe(false); }
  });
  it('restores a charging guard and a shield wraith without repeating a charge hit', async () => {
    const store = new SaveStore(`guardians-${++count}`); await store.load();
    const s = createDungeonRun(42); travel(s, adjacentRooms(s).find(d => d.room.kind === 'combat')!.direction);
    s.phase = 'combat'; s.player.x = 320; s.player.y = 180;
    s.enemies = [
      { id: s.nextId++, kind: 'guard', x: 310, y: 180, hp: 65, maxHp: 65, mode: 'charge', angle: 0, timer: 40, targetX: 500, targetY: 180, flash: 0, chargeHit: true },
      { id: s.nextId++, kind: 'shield', x: 480, y: 180, hp: 70, maxHp: 70, mode: 'windup', angle: Math.PI, timer: 30, targetX: 432, targetY: 180, flash: 0 },
    ];
    await store.save(s, defaultSettings()); const restored = (await store.load())!.run!;
    expect(restored).toEqual(s);
    for (let i = 0; i < 20; i++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s); expect(restored.player.hp).toBe(94);
    expect(restored.stats.hits).toBe(1); expect(restored.lastDamage).toBe('돌진 파수꾼 접촉 피해');
    const invalid = structuredClone(s); invalid.enemies[0].chargeHit = undefined;
    expect(validRun(invalid)).toBe(false);
    const wrongKind = structuredClone(s); wrongKind.enemies[0].kind = 'rat'; expect(validRun(wrongKind)).toBe(false);
    const wrongTimer = structuredClone(s); wrongTimer.enemies[0].timer = 1000; expect(validRun(wrongTimer)).toBe(false);
  });
  it('round-trips maze exploration, per-room treasures and a live encounter without changing the future', async () => {
    const store = new SaveStore(`maze-${++count}`); await store.load();
    const s = createDungeonRun(42); await store.save(s, defaultSettings()); expect((await store.load())!.run).toEqual(s);
    const treasure = adjacentRooms(s).find(d => d.room.kind === 'treasure')!; travel(s, treasure.direction);
    s.player.x = 320; s.player.y = 215; expect(openTreasure(s)).toBe(true);
    await store.save(s, defaultSettings()); const pending = (await store.load())!.run!;
    expect(roomReward(pending)).toEqual(roomReward(s)); chooseRelic(s, roomReward(s)!.candidates[0]);
    travel(s, adjacentRooms(s)[0].direction);
    travel(s, adjacentRooms(s).find(d => d.room.kind === 'combat')!.direction);
    for (let i = 0; i < 60; i++) step(s, { ...emptyInput(), fire: true });
    await store.save(s, defaultSettings()); const restored = (await store.load())!.run!;
    expect(restored).toEqual(s);
    for (let i = 0; i < 50; i++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s);
  });
  it('rejects malformed maze topology, inaccessible current rooms and unresolved historical rewards', () => {
    const mutations = [
      (s: ReturnType<typeof createDungeonRun>) => { s.expedition!.dungeon!.rooms[1].x = 90; },
      (s: ReturnType<typeof createDungeonRun>) => { s.expedition!.dungeon!.rooms[1].x = 0; s.expedition!.dungeon!.rooms[1].y = 0; },
      (s: ReturnType<typeof createDungeonRun>) => { s.expedition!.room = 8; },
      (s: ReturnType<typeof createDungeonRun>) => { currentRoom(s)!.visited = false; },
      (s: ReturnType<typeof createDungeonRun>) => { s.expedition!.dungeon!.rooms[6].reward = { room: 6, candidates: ['R01'], choice: null }; },
    ];
    for (const mutate of mutations) { const s = createDungeonRun(42); mutate(s); expect(validRun(s)).toBe(false); }
  });
  it('reads an old single-room save unchanged and writes the new content version without losing progress', async () => {
    const name = `legacy-${++count}`, store = new SaveStore(name); await store.load();
    const run = createRun(42); delete run.expedition; run.player.hp = 57;
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open(name, 1); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>(resolve => { const tx = db.transaction('save', 'readwrite');
      tx.objectStore('save').put({ schema: 1, content: 'prototype-0.1', revision: 5, savedAt: '2026-09-29', run, settings: defaultSettings() }, 'current'); tx.oncomplete = () => resolve(); });
    expect((await store.load())?.run).toEqual(run);
    const next = await store.save(run, defaultSettings());
    expect(next.content).toBe('prototype-0.16'); expect(next.revision).toBe(6); expect(next.run).toEqual(run); db.close();
  });
  it('restores fixed offers and chosen relics without granting a second selection', async () => {
    const store = new SaveStore(`reward-${++count}`); await store.load(); const s = createRun(42);
    s.phase = 'combat'; s.enemies = []; s.wave = 2; step(s, emptyInput());
    await store.save(s, defaultSettings()); const pending = (await store.load())!.run!;
    expect(pending).toEqual(s);
    chooseRelic(pending, pending.expedition!.reward!.candidates[0]); await store.save(pending, defaultSettings());
    const chosen = (await store.load())!.run!;
    expect(chooseRelic(chosen, 'skip')).toBe(false); expect(chosen).toEqual(pending);
  });
  it('rejects malformed expedition, status and projectile metadata', () => {
    const s = createRun(42);
    const invalid = [
      { ...s, expedition: { ...s.expedition, room: 9 } },
      { ...s, expedition: { ...s.expedition, relics: ['R01', 'R01'], acquired: ['R01'] } },
      { ...s, expedition: { ...s.expedition, acquired: ['R99'] } },
      { ...s, expedition: { ...s.expedition, reward: { room: 0, candidates: ['R01'], choice: 'R02' } } },
      { ...s, enemies: [{ ...s.enemies[0], burnTicks: -1, burnPulse: 60 }] },
      { ...s, bullets: [{ id: 99, x: 80, y: 180, vx: 320, vy: 0, owner: 'player', damage: 10, life: 60, bouncesLeft: 3 }] },
    ];
    for (const state of invalid) expect(validRun(state)).toBe(false);
  });
  it('round-trips boss telegraphs and resumes the same battle', async () => {
    const store = new SaveStore(`boss-${++count}`); await store.load();
    const s = createRun(42); s.expedition!.room = 3; s.enemies = []; s.phase = 'combat'; s.boss = createBoss(s);
    startBossPattern(s, 'rocks'); for (let i = 0; i < 20; i++) step(s, emptyInput());
    await store.save(s, defaultSettings()); const restored = (await store.load())!.run!;
    expect(restored).toEqual(s);
    for (let i = 0; i < 180; i++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s);
    const invalid = structuredClone(s); invalid.boss!.rocks = [{ x: NaN, y: 0 }];
    expect(validRun(invalid)).toBe(false);
    const missing = structuredClone(s); delete missing.boss; expect(validRun(missing)).toBe(false);
  });
  it('keeps a completed 0.2 expedition complete instead of appending a boss', async () => {
    const store = new SaveStore(`three-rooms-${++count}`); await store.load();
    const s = createRun(42); delete s.expedition!.route; s.expedition!.room = 2;
    s.phase = 'combat'; s.wave = 2; s.waveDelay = 0; s.enemies = []; step(s, emptyInput());
    await store.save(s, defaultSettings()); expect((await store.load())!.run).toEqual(s);
    expect(s.expedition!.reward).toBeNull();
  });
  it('can retry after a temporary failure opening IndexedDB', async () => {
    const store = new SaveStore(`open-retry-${++count}`);
    const open = vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => { throw new DOMException('temporary open failure', 'UnknownError'); });
    try {
      await expect(store.load()).rejects.toThrow('temporary open failure');
      await store.save(createRun(9), defaultSettings());
      expect((await store.load())?.run?.seed).toBe(9);
    } finally { open.mockRestore(); }
  });
  it('restores the complete snapshot without changing the seed or projectiles', async () => {
    const name = `restore-${++count}`; const store = new SaveStore(name);
    await store.load(); const s = createRun(17);
    for (let i = 0; i < 80; i++) step(s, { ...emptyInput(), fire: true });
    await store.save(s, defaultSettings());
    const read = await new SaveStore(name).load();
    expect(read?.run).toEqual(s);
  });
  it('captures snapshots at request time and serializes concurrent writes', async () => {
    const store = new SaveStore(`queue-${++count}`); await store.load();
    const s = createRun(2); const first = store.save(s, defaultSettings());
    s.player.hp = 75;
    const second = store.save(s, defaultSettings()); s.player.hp = 10;
    await Promise.all([first, second]);
    const read = await store.load();
    expect(read?.run?.player.hp).toBe(75);
    expect(read?.revision).toBe(2);
  });
  it('rejects another tab instead of overwriting a newer saved run', async () => {
    const name = `conflict-${++count}`; const a = new SaveStore(name); const b = new SaveStore(name);
    await a.load(); await b.load();
    await a.save(createRun(1), defaultSettings());
    await expect(b.save(createRun(2), defaultSettings())).rejects.toThrow('다른 창');
    expect((await new SaveStore(name).load())?.run?.seed).toBe(1);
  });
  it('clearing a run preserves preferences and increases revision', async () => {
    const store = new SaveStore(`clear-${++count}`); await store.load();
    const settings = { ...defaultSettings(), fps: 30 };
    await store.save(createRun(4), settings); await store.save(null, settings);
    const read = await store.load();
    expect(read?.run).toBeNull(); expect(read?.settings.fps).toBe(30); expect(read?.revision).toBe(2);
  });
  it('persists mouse sensitivity while accepting older settings without it', async () => {
    const name = `sensitivity-${++count}`, store = new SaveStore(name); await store.load();
    const legacy = { ...defaultSettings() }; delete legacy.mouseSensitivity;
    await store.save(createRun(4), legacy);
    expect((await store.load())?.run?.seed).toBe(4);
    await store.save(null, { ...defaultSettings(), mouseSensitivity: 0.45 });
    expect((await new SaveStore(name).load())?.settings.mouseSensitivity).toBe(0.45);
  });
  it('persists graphics mode, accepts legacy settings and rejects unknown modes', async () => {
    expect(defaultSettings()).toMatchObject({ graphicsQuality: 'auto' });
    const name = `graphics-${++count}`, store = new SaveStore(name); await store.load();
    const legacy = { ...defaultSettings() } as any; delete legacy.graphicsQuality;
    await store.save(createRun(4), legacy);
    expect((await store.load())?.run?.seed).toBe(4);
    await store.save(null, { ...defaultSettings(), graphicsQuality: 'low' } as any);
    expect((await new SaveStore(name).load())?.settings.graphicsQuality).toBe('low');
    await expect(store.save(null, { ...defaultSettings(), graphicsQuality: 'unknown' } as any)).rejects.toThrow();
  });
  it('rejects invalid sensitivity without overwriting the existing save', async () => {
    const store = new SaveStore(`sensitivity-invalid-${++count}`); await store.load();
    await store.save(createRun(7), defaultSettings());
    for (const value of [-1, 0, 3.01, NaN, Infinity, '2', null]) {
      await expect(store.save(null, { ...defaultSettings(), mouseSensitivity: value } as any)).rejects.toThrow();
    }
    expect((await store.load())?.run?.seed).toBe(7);
  });
  it('corrupt snapshots are preserved and never silently overwritten', async () => {
    const name = `corrupt-${++count}`;
    const store = new SaveStore(name); await store.load();
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open(name, 1); request.onsuccess = () => resolve(request.result); });
    await new Promise<void>(resolve => { const tx = db.transaction('save', 'readwrite'); tx.objectStore('save').put({ schema: 999, revision: 8, secret: 'preserve-me' }, 'current'); tx.oncomplete = () => resolve(); });
    await expect(store.load()).rejects.toThrow('기존 기록은 보존');
    await expect(store.save(createRun(1), defaultSettings())).rejects.toThrow();
    const raw = await new Promise<any>(resolve => { const request = db.transaction('save').objectStore('save').get('current'); request.onsuccess = () => resolve(request.result); });
    expect(raw.secret).toBe('preserve-me'); db.close();
  });
});
