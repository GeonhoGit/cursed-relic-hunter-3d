import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { SaveStore, defaultSettings, validRun } from '../src/persistence/save';
import { createDungeonRun, createRun, emptyInput, step, travel } from '../src/core/simulation';
import { chooseRelic, leaveAltar } from '../src/core/expedition';
import { adjacentRooms } from '../src/core/dungeon';
import { useAuxiliary } from '../src/core/auxiliary';
import { reviveContract } from '../src/core/curses';

describe('curse save compatibility', () => {
  it('round-trips a deferred altar away from its room, then settles it without another offer', async () => {
    const store = new SaveStore('deferred-altar'); await store.load();
    const s = createDungeonRun(2), from = adjacentRooms(s, 9)[0].room;
    from.visited = from.cleared = true; s.expedition!.room = from.id;
    travel(s, adjacentRooms(s).find(d => d.room.id === 9)!.direction);
    await store.save(s, defaultSettings()); leaveAltar(s); await store.save(s, defaultSettings());
    travel(s, adjacentRooms(s)[0].direction); await store.save(s, defaultSettings());
    const restored = (await store.load())!.run!; expect(restored).toEqual(s);
    travel(restored, adjacentRooms(restored).find(d => d.room.id === 9)!.direction);
    expect(chooseRelic(restored, 'R43')).toBe(true); await store.save(restored, defaultSettings());
    expect((await store.load())!.run!.player.equippedAux).toBe('R43');
  });
  it('preserves a legacy nine-room maze exactly across load and save', async () => {
    const name = 'legacy-nine-rooms', store = new SaveStore(name); await store.load();
    const s = createDungeonRun(42); s.expedition!.dungeon!.rooms = s.expedition!.dungeon!.rooms.slice(0, 9);
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open(name, 1); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>(resolve => { const tx = db.transaction('save', 'readwrite'); tx.objectStore('save').put({
      schema: 1, content: 'prototype-0.7', revision: 3, savedAt: '2026-09-30', run: s, settings: defaultSettings(),
    }, 'current'); tx.oncomplete = () => resolve(); });
    expect((await store.load())!.run).toEqual(s); const saved = await store.save(s, defaultSettings());
    expect(saved.content).toBe('prototype-0.16'); expect(saved.run!.expedition!.dungeon!.rooms).toHaveLength(9); db.close();
  });
  it('restores the same time stop targets, debt, cooldown and revival loss with deterministic continuation', async () => {
    const store = new SaveStore('curse-effects'); await store.load();
    const s = createRun(42); s.phase = 'combat'; s.player.x = 320; s.player.y = 180;
    s.expedition!.relics = ['R43', 'R38', 'R13', 'R25']; s.expedition!.acquired = [...s.expedition!.relics];
    s.player.equippedAux = 'R43'; s.player.dodgeCharges = 2; s.player.hp = 0; reviveContract(s);
    s.player.auxCooldown = 270; useAuxiliary(s, s.player);
    for (let i = 0; i < 20; i++) step(s, emptyInput());
    await store.save(s, defaultSettings()); const restored = (await store.load())!.run!; expect(restored).toEqual(s);
    for (let i = 0; i < 90; i++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s); expect(s.timeDebt).toBeGreaterThan(0);
    await store.save(s, defaultSettings()); expect((await store.load())!.run).toEqual(s);
  });
  it('rejects corrupt equipment, stop targets, timers, losses and altar offers', () => {
    const s = createRun(42); s.phase = 'combat'; s.expedition!.relics = ['R43', 'R38', 'R01', 'R02'];
    s.expedition!.acquired = [...s.expedition!.relics]; s.player.equippedAux = 'R43'; s.player.hp = 0;
    reviveContract(s); useAuxiliary(s, s.player); expect(validRun(s)).toBe(true);
    const mutations = [
      (r: typeof s) => { r.player.equippedAux = 'R13'; },
      (r: typeof s) => { r.player.timeCooldown = 1081; },
      (r: typeof s) => { r.timeDebt = 181; },
      (r: typeof s) => { r.timeStop!.ticks = 91; },
      (r: typeof s) => { r.timeStop!.enemyIds = [1, 1]; },
      (r: typeof s) => { r.timeStop!.bulletIds = [s.nextId]; },
      (r: typeof s) => { r.timeStop!.x = -1000; },
      (r: typeof s) => { r.revival!.lost = ['R43']; },
      (r: typeof s) => { r.revival!.lost = ['R01', 'R01']; },
      (r: typeof s) => { r.revival!.tick = s.tick + 1; },
      (r: typeof s) => { r.expedition!.relics.push('R38'); },
    ];
    for (const mutate of mutations) { const copy = structuredClone(s); mutate(copy); expect(validRun(copy)).toBe(false); }
    const maze = createDungeonRun(2), altar = maze.expedition!.dungeon!.rooms[9];
    altar.visited = altar.cleared = true; altar.reward = { room: 9, candidates: ['R38', 'R43'], choice: null };
    expect(validRun(maze)).toBe(true); altar.reward.candidates = ['R01']; expect(validRun(maze)).toBe(false);
  });
});
