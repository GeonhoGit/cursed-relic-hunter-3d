import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDungeonRun, travel, emptyInput, step } from '../src/core/simulation';
import { adjacentRooms } from '../src/core/dungeon';
import { advanceProjectiles } from '../src/core/combat';
import { SaveStore, defaultSettings, validRun } from '../src/persistence/save';

function encounter() {
  const s = createDungeonRun(42); travel(s, adjacentRooms(s).find(d => d.room.kind === 'combat')!.direction); s.phase = 'combat';
  s.enemies = [{ id: s.nextId++, kind: 'shield', x: 450, y: 180, hp: 70, maxHp: 70, angle: Math.PI, mode: 'recover', timer: 120, targetX: 320, targetY: 180, flash: 0 }];
  return s;
}
describe('shield durability saves', () => {
  it.each([0, 2.5, 35])('restores shield HP %s with an identical future', async hp => {
    const s = encounter(); s.enemies[0].shieldHp = hp;
    const store = new SaveStore(`shield-${hp}`); await store.load(); await store.save(s, defaultSettings()); const restored = (await store.load())!.run!;
    expect(restored).toEqual(s);
    for (let t = 0; t < 50; t++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s); expect(restored.enemies[0].shieldHp).toBe(hp);
  });
  it('keeps an old missing shield field unchanged on load and starts at full durability on the first block', async () => {
    const s = encounter(), store = new SaveStore('shield-legacy'); await store.load(); const record = await store.save(s, defaultSettings());
    const legacy = { ...record, content: 'prototype-0.11' };
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('shield-legacy', 1); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>(resolve => { const tx = db.transaction('save', 'readwrite'); tx.objectStore('save').put(legacy, 'current'); tx.oncomplete = () => resolve(); });
    expect(await store.load()).toEqual(legacy); db.close();
    const restored = (await store.load())!.run!; expect(restored.enemies[0].shieldHp).toBeUndefined();
    restored.bullets.push({ id: restored.nextId++, x: 439, y: 180, vx: 0, vy: 0, damage: 7, life: 60, owner: 'player' });
    advanceProjectiles(restored); expect(restored.enemies[0].shieldHp).toBe(28); expect(restored.enemies[0].hp).toBe(70);
  });
  it('rejects impossible durability and durability on a different monster', () => {
    for (const value of [-1, 36, NaN, Infinity]) { const s = encounter(); s.enemies[0].shieldHp = value; expect(validRun(s)).toBe(false); }
    const s = encounter(); Object.assign(s.enemies[0], { kind: 'rat', hp: 30, maxHp: 30, shieldHp: 5 }); expect(validRun(s)).toBe(false);
  });
});
