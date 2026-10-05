import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { SaveStore, defaultSettings, validRun, ConflictError, CorruptSaveError } from '../src/persistence/save';
import { createDungeonRun, emptyInput, step } from '../src/core/simulation';
import { createBoss } from '../src/core/boss';
import { beginGrowthRun, emptyInvestment, earnedPoints } from '../src/core/growth';
import { splitShot } from '../src/core/projectile-effects';
import { selectedWeapon } from '../src/core/weapons';
import type { Bullet } from '../src/core/model';

function victory() {
  const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'winner');
  s.expedition!.room = 8; const room = s.expedition!.dungeon!.rooms[8]; room.visited = room.cleared = true;
  s.boss = createBoss(s); s.boss.hp = 0; s.phase = 'cleared'; return s;
}
describe('weapon persistence', () => {
  it('locks unearned preferences and expeditions without replacing the previous record', async () => {
    const store = new SaveStore('weapon-locked'); await store.load(); const s = createDungeonRun(42);
    const before = await store.save(s, defaultSettings());
    await expect(store.save(s, defaultSettings(), undefined, 'W02')).rejects.toBeInstanceOf(CorruptSaveError);
    s.weapon = 'W02'; await expect(store.save(s, defaultSettings())).rejects.toBeInstanceOf(CorruptSaveError);
    expect(await store.load()).toEqual(before);
  });
  it('selects an unlocked weapon atomically while preserving the existing expedition and queued settings', async () => {
    const store = new SaveStore('weapon-select'); await store.load(); const old = victory();
    const won = await store.save(old, defaultSettings()); expect(won.profile!.bossDefeated).toBe(true);
    const select = store.save(old, defaultSettings(), undefined, 'W02'); const settings = store.save(old, { ...defaultSettings(), sound: false });
    await select; const result = await settings;
    expect(result.content).toBe('prototype-0.13'); expect(selectedWeapon(result.profile!)).toBe('W02'); expect(result.run).toEqual(old);
    const reset = await store.save(null, defaultSettings(), emptyInvestment()); expect(selectedWeapon(reset.profile!)).toBe('W02'); expect(earnedPoints(reset.profile!)).toBe(5);
  });
  it('restores an in-flight shotgun volley, cooldown and spent split budget with identical future behavior', async () => {
    const store = new SaveStore('weapon-volley'); await store.load(); await store.save(victory(), defaultSettings());
    const s = createDungeonRun(42); beginGrowthRun(s, { ...emptyInvestment(), speed: 1 }, 'shotgun'); s.weapon = 'W02';
    s.expedition!.relics = ['R03', 'R04']; s.expedition!.acquired = [...s.expedition!.relics];
    s.expedition!.relics.forEach((id, index) => {
      const room = s.expedition!.dungeon!.rooms[6 + index]; room.visited = room.cleared = true;
      room.reward = { room: room.id, candidates: [id], choice: id };
    });
    step(s, { ...emptyInput(), fire: true }); const pending: Bullet[] = [];
    splitShot(s, s.bullets[0], createBoss(s), pending); s.bullets.shift();
    expect(validRun(s)).toBe(true); await store.save(s, defaultSettings()); const restored = (await store.load())!.run!;
    expect(restored).toEqual(s);
    const later: Bullet[] = [];
    for (const b of restored.bullets) splitShot(restored, b, createBoss(restored), later);
    expect(later).toHaveLength(0);
    // Pure save/restore run follows the exact same sequence from the saved snapshot.
    const replay = (await store.load())!.run!;
    for (let t = 0; t < 100; t++) { step(s, emptyInput()); step(replay, emptyInput()); }
    expect(replay).toEqual(s); expect(restored.bullets.every(b => b.splitDone)).toBe(true);
  });
  it('rejects unknown weapons and out-of-range weapon cooldowns before deriving stats', () => {
    const s = createDungeonRun(42); s.weapon = 'W02'; s.player.fireCooldown = 36; expect(validRun(s)).toBe(true);
    s.player.fireCooldown = 37; expect(validRun(s)).toBe(false);
    s.player.fireCooldown = -1; expect(validRun(s)).toBe(false);
    s.player.fireCooldown = 0; expect(validRun({ ...s, weapon: 'W99' })).toBe(false);
  });
  it('retains the old choice after aborted writes, retries exactly, and rejects a stale tab', async () => {
    const a = new SaveStore('weapon-retry'), b = new SaveStore('weapon-retry'); await a.load(); const s = victory();
    const before = await a.save(s, defaultSettings()); await b.load(); const original = IDBDatabase.prototype.transaction;
    const spy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
      const tx = original.apply(this, args); if (args[1] === 'readwrite') queueMicrotask(() => tx.abort()); return tx;
    });
    await expect(a.save(s, defaultSettings(), undefined, 'W02')).rejects.toThrow(); spy.mockRestore(); expect(await a.load()).toEqual(before);
    const after = await a.save(s, defaultSettings(), undefined, 'W02');
    await expect(b.save(s, defaultSettings(), undefined, 'W01')).rejects.toBeInstanceOf(ConflictError); expect(await b.load()).toEqual(after);
  });
  it('reads 0.10 boss progress without mutation and lets an existing winner choose W02', async () => {
    const name = 'weapon-legacy', store = new SaveStore(name); await store.load(); const before = await store.save(victory(), defaultSettings());
    const legacy = { ...before, content: 'prototype-0.10' };
    const db = await new Promise<IDBDatabase>(resolve => { const req = indexedDB.open(name, 1); req.onsuccess = () => resolve(req.result); });
    await new Promise<void>(resolve => { const tx = db.transaction('save', 'readwrite'); tx.objectStore('save').put(legacy, 'current'); tx.oncomplete = () => resolve(); });
    expect(await store.load()).toEqual(legacy);
    expect(selectedWeapon((await store.save(legacy.run, defaultSettings(), undefined, 'W02')).profile!)).toBe('W02'); db.close();
  });
});
