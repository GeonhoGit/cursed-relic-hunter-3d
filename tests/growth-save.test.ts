import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { SaveStore, defaultSettings, validRun, ConflictError, CorruptSaveError } from '../src/persistence/save';
import { createDungeonRun, emptyInput, step } from '../src/core/simulation';
import { beginGrowthRun, defaultProfile, earnedPoints, emptyInvestment, validProfile } from '../src/core/growth';

function cleared(id = 'progress') {
  const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), id);
  s.expedition!.dungeon!.rooms[1].visited = s.expedition!.dungeon!.rooms[1].cleared = true; return s;
}
describe('growth persistence', () => {
  it('awards goals atomically and never regresses or repeats progress through an older queued checkpoint', async () => {
    const store = new SaveStore('growth-awards'); await store.load(); const s = cleared(), old = structuredClone(s);
    const first = await store.save(s, defaultSettings()); expect(earnedPoints(first.profile!)).toBe(5);
    for (const r of s.expedition!.dungeon!.rooms.filter(r => r.kind === 'combat')) r.visited = r.cleared = true;
    const a = store.save(s, defaultSettings()), b = store.save(old, defaultSettings()); await a; const latest = await b;
    expect(latest.content).toBe('prototype-0.13'); expect(latest.profile!.rooms).toHaveLength(5); expect(earnedPoints(latest.profile!)).toBe(10);
    expect((await store.save(old, defaultSettings())).profile).toEqual(latest.profile);
  });
  it('saves investment without changing the active run, then carries it to a new run and survives death', async () => {
    const store = new SaveStore('growth-invest'); await store.load(); const s = cleared(); await store.save(s, defaultSettings());
    const investment = { ...emptyInvestment(), health: 4, dodge: 1 };
    const saved = await store.save(s, defaultSettings(), investment); expect(saved.run).toEqual(s);
    const next = createDungeonRun(14); beginGrowthRun(next, saved.profile!.investment, 'next'); expect(next.player.hp).toBe(104);
    step(next, { ...emptyInput(), dodge: true }); expect(validRun(next)).toBe(true);
    await store.save(next, defaultSettings()); expect((await store.load())!.run).toEqual(next);
    next.expedition!.room = 1; next.expedition!.dungeon!.rooms[1].visited = true; next.phase = 'dead'; next.player.hp = 0;
    const dead = await store.save(next, defaultSettings()); expect(earnedPoints(dead.profile!)).toBe(5);
    const reset = await store.save(null, defaultSettings(), emptyInvestment()); expect(earnedPoints(reset.profile!)).toBe(5);
    expect(reset.profile!.investment).toEqual(emptyInvestment());
  });
  it('preserves fractional dodge credit and future recharge after saving at full charge', async () => {
    const store = new SaveStore('growth-dodge-carry'); await store.load(); await store.save(cleared(), defaultSettings());
    const s = createDungeonRun(42); beginGrowthRun(s, { ...emptyInvestment(), dodge: 1 }, 'dodge-carry');
    step(s, { ...emptyInput(), dodge: true });
    while (s.player.dodgeCooldown > 0) step(s, emptyInput());
    expect(s.player.dodgeCarry).toBeCloseTo(0.48); expect(s.player.dodgeCharges).toBe(1);
    await store.save(s, defaultSettings()); const restored = (await store.load())!.run!;
    expect(restored).toEqual(s);
    for (let tick = 0; tick < 300; tick++) {
      const input = { ...emptyInput(), dodge: tick % 100 === 0 };
      step(s, input); step(restored, input);
    }
    expect(restored).toEqual(s);
    for (const invalid of [-0.1, 1, NaN, Infinity]) {
      const bad = structuredClone(s); bad.player.dodgeCarry = invalid; expect(validRun(bad)).toBe(false);
    }
    const legacy = createDungeonRun(42); legacy.player.dodgeCarry = 0.48; expect(validRun(legacy)).toBe(false);
    const badCooldown = structuredClone(s); delete badCooldown.player.dodgeCharges;
    badCooldown.player.dodgeCooldown = 96; expect(validRun(badCooldown)).toBe(false);
  });
  it('rejects overspending and restores the exact previous record', async () => {
    const store = new SaveStore('growth-overspend'); await store.load(); const s = cleared(), before = await store.save(s, defaultSettings());
    await expect(store.save(s, defaultSettings(), { ...emptyInvestment(), health: 6 })).rejects.toBeInstanceOf(CorruptSaveError);
    expect(await store.load()).toEqual(before);
  });
  it('retries an aborted goal save without losing or doubling earned points', async () => {
    const store = new SaveStore('growth-retry'); await store.load(); const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'retry');
    await store.save(s, defaultSettings()); s.expedition!.dungeon!.rooms[1].visited = s.expedition!.dungeon!.rooms[1].cleared = true;
    const original = IDBDatabase.prototype.transaction;
    const spy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (this: IDBDatabase, ...args: Parameters<IDBDatabase['transaction']>) {
      const tx = original.apply(this, args); if (args[1] === 'readwrite') queueMicrotask(() => tx.abort()); return tx;
    });
    await expect(store.save(s, defaultSettings())).rejects.toThrow(); spy.mockRestore();
    expect(earnedPoints((await store.load())!.profile!)).toBe(0);
    await store.save(s, defaultSettings()); expect(earnedPoints((await store.load())!.profile!)).toBe(5);
  });
  it('blocks an old tab from overwriting goals or investment', async () => {
    const a = new SaveStore('growth-conflict'), b = new SaveStore('growth-conflict'); await a.load(); const s = cleared();
    await a.save(s, defaultSettings()); await b.load();
    const latest = await a.save(s, defaultSettings(), { ...emptyInvestment(), health: 5 });
    await expect(b.save(s, defaultSettings(), { ...emptyInvestment(), attack: 5 })).rejects.toBeInstanceOf(ConflictError);
    expect(await b.load()).toEqual(latest);
  });
  it('reads a 0.9 snapshot without modifying it and initializes an empty profile on write', async () => {
    const name = 'growth-legacy', store = new SaveStore(name); await store.load(); const s = createDungeonRun(42);
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open(name, 1); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>(resolve => { const tx = db.transaction('save', 'readwrite'); tx.objectStore('save').put({
      schema: 1, content: 'prototype-0.9', revision: 3, savedAt: '2026-10-01', run: s, settings: defaultSettings(),
    }, 'current'); tx.oncomplete = () => resolve(); });
    const legacy = (await store.load())!; expect(legacy.profile).toBeUndefined(); expect(legacy.run).toEqual(s);
    const saved = await store.save(s, defaultSettings()); expect(saved.profile).toEqual(defaultProfile()); expect(saved.run).toEqual(s); db.close();
  });
  it('validates profile ledgers and departure stats before trusting derived health or cooldown', () => {
    const p = defaultProfile(); expect(validProfile(p)).toBe(true);
    expect(validProfile({ ...p, investment: { ...p.investment, health: 1 } })).toBe(false);
    expect(validProfile({ ...p, rooms: [{ runId: 'a', room: 1 }, { runId: 'a', room: 1 }] })).toBe(false);
    expect(validProfile({ ...p, purchases: [{ runId: 'a', room: 10, slot: 4 }] })).toBe(false);
    const s = cleared(); s.growth!.investment.health = 20; s.player.hp = 120; expect(validRun(s)).toBe(true);
    s.player.hp = 121; expect(validRun(s)).toBe(false); s.player.hp = 120;
    s.growth!.investment.health = 60; s.player.hp = 160; expect(validRun(s)).toBe(true);
    s.player.hp = 161; expect(validRun(s)).toBe(false); s.player.hp = 160;
    s.growth!.investment.health = 61; expect(validRun(s)).toBe(false);
  });
});
