import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { SaveStore, defaultSettings, validRun, ConflictError } from '../src/persistence/save';
import { createDungeonRun, travel } from '../src/core/simulation';
import { adjacentRooms, currentRoom } from '../src/core/dungeon';
import { buyFromShop, refreshShop } from '../src/core/shop';
import { chooseRelic, prepareReward } from '../src/core/expedition';
import { reviveContract } from '../src/core/curses';

function visit() {
  const s = createDungeonRun(42), from = adjacentRooms(s, 10)[0].room;
  from.visited = from.cleared = true; s.expedition!.room = from.id; s.gold = 40;
  travel(s, adjacentRooms(s).find(d => d.room.id === 10)!.direction); return s;
}
describe('shop saves', () => {
  it('atomically round-trips payment, relic, equipment and sold slot, including immutable capture', async () => {
    const s = visit(), shop = currentRoom(s)!.shop!, store = new SaveStore('shop-purchase'); await store.load();
    shop.slots[0].relic = 'R13'; shop.slots[1].relic = 'R25';
    await store.save(s, defaultSettings()); buyFromShop(s, 0, shop.revision);
    const expected = structuredClone(s), pending = store.save(s, defaultSettings()); s.gold = 99;
    const saved = await pending; expect(saved.content).toBe('prototype-0.13'); expect(saved.run).toEqual(expected);
    const loaded = (await store.load())!.run!; expect(loaded).toEqual(expected);
    expect(buyFromShop(loaded, 0, currentRoom(loaded)!.shop!.revision)).toBe('unavailable'); expect(loaded.gold).toBe(16);
  });
  it('persists a healing purchase and clamps to maximum HP', async () => {
    const s = visit(), store = new SaveStore('shop-heal'); await store.load(); s.player.hp = 94;
    expect(buyFromShop(s, 2, currentRoom(s)!.shop!.revision)).toBe('bought'); await store.save(s, defaultSettings());
    const loaded = (await store.load())!.run!; expect(loaded.player.hp).toBe(100); expect(loaded.gold).toBe(20);
    expect(currentRoom(loaded)!.shop!.slots[2].purchased).toBe(true);
  });
  it('preserves stale stock while away, repairs it on return, and allows an altar curse bought in the shop', async () => {
    const s = visit(), rooms = s.expedition!.dungeon!.rooms, offered = rooms[10].shop!.slots[0].relic!;
    s.expedition!.room = 6; rooms[6].visited = rooms[6].cleared = true; s.phase = 'cleared';
    rooms[6].reward = { room: 6, candidates: [offered], choice: null }; chooseRelic(s, offered);
    expect(validRun(s)).toBe(true); const snapshot = structuredClone(rooms[10].shop);
    s.expedition!.room = 10; expect(refreshShop(s)).toBe(true); expect(rooms[10].shop).not.toEqual(snapshot);
    buyFromShop(s, 3, rooms[10].shop!.revision);
    s.expedition!.room = 9; rooms[9].visited = rooms[9].cleared = true; s.phase = 'cleared'; prepareReward(s);
    expect(chooseRelic(s, 'R43')).toBe(false); expect(validRun(s)).toBe(true);
    const store = new SaveStore('shop-altar'); await store.load(); await store.save(s, defaultSettings()); expect((await store.load())!.run).toEqual(s);
  });
  it('retains purchased relic provenance when the contract consumes itself and removes normal relics', () => {
    const s = visit(), rooms = s.expedition!.dungeon!.rooms;
    for (const [id, relic] of [[6, 'R01'], [7, 'R02'], [9, 'R43']] as const) {
      s.expedition!.room = id; rooms[id].visited = rooms[id].cleared = true; s.phase = 'cleared';
      rooms[id].reward = { room: id, candidates: id === 9 ? ['R38', 'R43'] : [relic], choice: null }; chooseRelic(s, relic);
    }
    s.expedition!.room = 10; refreshShop(s); expect(buyFromShop(s, 3, rooms[10].shop!.revision)).toBe('bought');
    s.player.hp = 0; reviveContract(s); expect(validRun(s)).toBe(true);
    expect(rooms[10].shop!.slots[3]).toMatchObject({ relic: 'R38', purchased: true });
  });
  it('rejects malformed stock, purchase ledgers and shop states', () => {
    const s = visit(); expect(validRun(s)).toBe(true);
    const mutations = [
      (r: typeof s) => { delete currentRoom(r)!.shop; },
      (r: typeof s) => { currentRoom(r)!.shop!.revision = 0; },
      (r: typeof s) => { currentRoom(r)!.shop!.slots.pop(); },
      (r: typeof s) => { currentRoom(r)!.shop!.slots[0].repairCounter = -1; },
      (r: typeof s) => { currentRoom(r)!.shop!.slots[2].relic = 'R01'; },
      (r: typeof s) => { currentRoom(r)!.shop!.slots[3].relic = 'R01'; },
      (r: typeof s) => { currentRoom(r)!.shop!.slots[1].relic = currentRoom(r)!.shop!.slots[0].relic; },
      (r: typeof s) => { currentRoom(r)!.shop!.slots[0].purchased = true; },
      (r: typeof s) => { currentRoom(r)!.reward = { room: 10, candidates: ['R01'], choice: 'skip' }; },
      (r: typeof s) => { r.expedition!.dungeon!.rooms[0].shop = currentRoom(r)!.shop; },
      (r: typeof s) => { r.phase = 'combat'; },
    ];
    for (const mutate of mutations) { const copy = structuredClone(s); mutate(copy); expect(validRun(copy)).toBe(false); }
  });
  it('rejects stale-tab purchase commits without changing the latest shop ledger', async () => {
    const a = new SaveStore('shop-conflict'), b = new SaveStore('shop-conflict'); await a.load(); const s = visit();
    await a.save(s, defaultSettings()); const other = (await b.load())!.run!;
    buyFromShop(s, 3, currentRoom(s)!.shop!.revision); await a.save(s, defaultSettings());
    other.player.hp = 90; buyFromShop(other, 2, currentRoom(other)!.shop!.revision);
    await expect(b.save(other, defaultSettings())).rejects.toBeInstanceOf(ConflictError);
    expect((await b.load())!.run).toEqual(s);
  });
  it('preserves an old ten-room 0.8 save without adding or moving rooms', async () => {
    const name = 'shop-legacy-ten', store = new SaveStore(name); await store.load();
    const s = createDungeonRun(42); s.expedition!.dungeon!.rooms = s.expedition!.dungeon!.rooms.slice(0, 10);
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open(name, 1); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>(resolve => { const tx = db.transaction('save', 'readwrite'); tx.objectStore('save').put({
      schema: 1, content: 'prototype-0.8', revision: 3, savedAt: '2026-10-01', run: s, settings: defaultSettings(),
    }, 'current'); tx.oncomplete = () => resolve(); });
    expect((await store.load())!.run).toEqual(s); expect((await store.save(s, defaultSettings())).run).toEqual(s); db.close();
  });
});
