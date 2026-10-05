import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDungeonRun, emptyInput, step } from '../src/core/simulation';
import { advanceProjectiles as advanceBullets } from '../src/core/combat';
import { defaultProfile, emptyInvestment, beginGrowthRun, growthStats, validProfile, recordGrowth } from '../src/core/growth';
import { currentWeapon, isWeapon, selectedWeapon, weaponUnlocked } from '../src/core/weapons';
import { SaveStore, defaultSettings, validRun, CorruptSaveError } from '../src/persistence/save';
import { createBoss } from '../src/core/boss';
import { enterNextRegion } from '../src/core/region';
import type { Enemy, WeaponId } from '../src/core/model';

function arena() {
  const s = createDungeonRun(42); s.weapon = 'W04' as WeaponId;
  s.expedition!.room = 1; const room = s.expedition!.dungeon!.rooms[1]; room.visited = true; room.template = 0; delete room.structure;
  s.phase = 'combat'; s.player.x = 320; s.player.y = 180;
  s.enemies = [380, 420, 460, 500, 540].map(x => ({ id: s.nextId++, kind: 'archer', x, y: 180,
    hp: 40, maxHp: 40, angle: Math.PI, mode: 'windup', timer: 27, targetX: 320, targetY: 180, flash: 0 } as Enemy));
  return s;
}
function projectile(s: ReturnType<typeof arena>, speed = 12000) {
  s.bullets = [{ id: s.nextId++, eventId: s.nextId++, x: 340, y: 180, vx: speed, vy: 0,
    life: 75, height: 34, heightVelocity: 0, owner: 'player', damage: 9, hitIds: [], bouncesLeft: 0 }];
}
function heartVictory() {
  const s = createDungeonRun(42);
  beginGrowthRun(s, emptyInvestment(), 'staff-heart-winner');
  for (let i = 0; i < 3; i++) {
    s.expedition!.room = 8; const room = s.expedition!.dungeon!.rooms[8]; room.visited = room.cleared = true;
    s.boss = createBoss(s); s.boss.hp = 0; s.phase = 'cleared';
    if (i < 2) enterNextRegion(s);
  }
  return s;
}

describe('rift staff departure weapon', () => {
  it('requires a heart victory and falls back from an old locked staff preference without granting unlocks', () => {
    const p = defaultProfile(); expect(isWeapon('W04')).toBe(true); expect(weaponUnlocked(p, 'W04')).toBe(false);
    p.selectedWeapon = 'W04'; expect(selectedWeapon(p)).toBe('W01'); expect(validProfile(p)).toBe(true);
    p.bossDefeated = true; p.priestDefeated = true; expect(weaponUnlocked(p, 'W04')).toBe(false);
    const won = recordGrowth(p, heartVictory()); expect(weaponUnlocked(won, 'W04')).toBe(true);
    expect(selectedWeapon(won)).toBe('W04'); expect(validProfile(won)).toBe(true);
    expect(recordGrowth(won, null).heartDefeated).toBe(true);
  });
  it('fires one 9-damage spell every 42 ticks and applies growth and vertical aim', () => {
    const s = createDungeonRun(42); s.weapon = 'W04' as WeaponId;
    const fire = { ...emptyInput(s), fire: true, aimX: 600, aimY: s.player.y };
    step(s, fire); expect(s.bullets[0]).toMatchObject({ damage: 9, vx: 250, vy: 0, bouncesLeft: 0 });
    for (let i = 0; i < 41; i++) step(s, fire); expect(s.stats.shots).toBe(1);
    step(s, fire); expect(s.stats.shots).toBe(2);
    const g = createDungeonRun(42); g.weapon = 'W04' as WeaponId;
    beginGrowthRun(g, { ...emptyInvestment(), attack: 1, speed: 1 }, 'rift-growth');
    step(g, { ...emptyInput(g), fire: true, aimPitch: .2 });
    const b = g.bullets[0]; expect(b.damage).toBeCloseTo(9.045);
    expect(Math.hypot(b.vx, b.vy, b.heightVelocity!)).toBeCloseTo(250);
    expect(growthStats(g).fireInterval).toBeCloseTo(42 / 1.005);
    expect(currentWeapon(g).damage * 60 / currentWeapon(g).interval).toBeLessThan(7 / .4);
  });
  it('hits two aligned enemies once and stops before the third without a piercing relic', () => {
    const s = arena(); projectile(s); advanceBullets(s);
    expect(s.enemies.map(e => e.hp)).toEqual([31, 31, 40, 40, 40]); expect(s.bullets).toEqual([]);
  });
  it('keeps normal weapons single-target and lets the piercing relic extend the staff to four targets', () => {
    const normal = arena(); normal.weapon = 'W01'; projectile(normal); advanceBullets(normal);
    expect(normal.enemies.map(e => e.hp)).toEqual([31, 40, 40, 40, 40]);
    const s = arena(); s.expedition!.relics = ['R02']; projectile(s); advanceBullets(s);
    expect(s.enemies.map(e => e.hp)).toEqual([31, 31, 31, 31, 40]); expect(s.bullets).toEqual([]);
  });
  it('cannot penetrate walls or intact shields and reflected shots do not gain innate piercing', () => {
    const wall = arena(); wall.enemies = [wall.enemies[0], wall.enemies[1]];
    Object.assign(wall.enemies[0], { x: 190, y: 128 }); Object.assign(wall.enemies[1], { x: 270, y: 128 });
    projectile(wall); Object.assign(wall.bullets[0], { x: 180, y: 128 }); advanceBullets(wall);
    expect(wall.enemies.map(e => e.hp)).toEqual([31, 40]); expect(wall.bullets).toEqual([]);
    const shield = arena(); Object.assign(shield.enemies[0], { kind: 'shield', hp: 70, maxHp: 70, angle: Math.PI });
    projectile(shield); advanceBullets(shield); expect(shield.enemies[0].hp).toBe(70); expect(shield.enemies[0].shieldHp).toBe(26);
    expect(shield.enemies[1].hp).toBe(40);
    const reflected = arena(); projectile(reflected); reflected.bullets[0].kind = 'reflected'; advanceBullets(reflected);
    expect(reflected.enemies.map(e => e.hp)).toEqual([31, 40, 40, 40, 40]);
  });
  it('preserves an in-flight spell after its first hit through save and reload', async () => {
    const s = arena(); projectile(s, 250); s.bullets[0].x = 370; advanceBullets(s);
    expect(s.enemies[0].hp).toBe(31); expect(s.bullets[0].hitIds).toEqual([s.enemies[0].id]); expect(validRun(s)).toBe(true);
    const store = new SaveStore('rift-projectile'); await store.load(); await store.save(heartVictory(), defaultSettings()); await store.save(s, defaultSettings());
    const restored = (await store.load())!.run!;
    for (let i = 0; i < 30; i++) { advanceBullets(s); advanceBullets(restored); }
    expect(restored).toEqual(s); expect(s.enemies.map(e => e.hp)).toEqual([31, 31, 40, 40, 40]);
  });
  it('applies burn and frost to both pierced targets but produces only one split volley without innate child piercing', () => {
    const s = arena(); s.expedition!.relics = ['R03', 'R07', 'R08']; projectile(s); advanceBullets(s);
    expect(s.bullets).toHaveLength(3); expect(s.bullets.every(b => b.kind === 'split' && Math.abs(b.damage - 3.15) < 1e-9)).toBe(true);
    for (const e of s.enemies.slice(0, 2)) { expect(e.burnTicks).toBe(180); expect(e.frost!.hits).toHaveLength(1); }
    const child = arena(); projectile(child); child.bullets[0].kind = 'split'; advanceBullets(child);
    expect(child.enemies.map(e => e.hp)).toEqual([31, 40, 40, 40, 40]);
  });
  it('saves a new departure choice without altering an existing expedition weapon', async () => {
    const store = new SaveStore('rift-choice'); await store.load(); const old = createDungeonRun(42);
    old.weapon = 'W01'; await store.save(heartVictory(), defaultSettings()); await store.save(old, defaultSettings());
    await store.save(old, defaultSettings(), undefined, 'W04' as WeaponId);
    const record = (await store.load())!; expect(record.profile!.selectedWeapon).toBe('W04'); expect(record.run).toEqual(old);
  });
  it('rejects a locked departure choice and a new locked staff run without overwriting the saved run', async () => {
    const store = new SaveStore('rift-locked'); await store.load(); const old = createDungeonRun(42);
    const before = await store.save(old, defaultSettings());
    await expect(store.save(old, defaultSettings(), undefined, 'W04')).rejects.toBeInstanceOf(CorruptSaveError);
    const next = createDungeonRun(99); next.weapon = 'W04';
    await expect(store.save(next, defaultSettings())).rejects.toBeInstanceOf(CorruptSaveError);
    expect(await store.load()).toEqual(before);
  });
  it('loads and keeps saving a pre-lock staff expedition but cannot use it to start a new staff run', async () => {
    const name = 'rift-legacy-lock', store = new SaveStore(name); await store.load(); const old = createDungeonRun(42);
    old.weapon = 'W04'; beginGrowthRun(old, emptyInvestment(), 'legacy-staff-run');
    const profile = { ...defaultProfile(), selectedWeapon: 'W04' as const };
    const record = { schema: 1, content: 'prototype-0.13', revision: 1, savedAt: new Date().toISOString(), run: old, profile, settings: defaultSettings() };
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open(name, 1); request.onsuccess = () => resolve(request.result); });
    await new Promise<void>(resolve => { const tx = db.transaction('save', 'readwrite'); tx.objectStore('save').put(record, 'current'); tx.oncomplete = () => resolve(); }); db.close();
    const loaded = (await store.load())!; expect(loaded.run).toEqual(old); expect(selectedWeapon(loaded.profile!)).toBe('W01');
    step(old, emptyInput(old)); await store.save(old, defaultSettings()); expect((await store.load())!.run!.weapon).toBe('W04');
    const next = createDungeonRun(42); next.weapon = 'W04'; beginGrowthRun(next, emptyInvestment(), 'new-staff-run');
    await expect(store.save(next, defaultSettings())).rejects.toBeInstanceOf(CorruptSaveError);
  });
});
