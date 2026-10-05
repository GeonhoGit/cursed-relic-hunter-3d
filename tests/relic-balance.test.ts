import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { advanceRoom, createDungeonRun, createRun, emptyInput, step, travel } from '../src/core/simulation';
import { damageEnemy } from '../src/core/combat';
import { adjacentRooms, currentRoom } from '../src/core/dungeon';
import { chooseRelic } from '../src/core/expedition';
import { grantRelic } from '../src/core/relic-acquisition';
import { createBoss } from '../src/core/boss';
import { enterNextRegion } from '../src/core/region';
import { RELICS } from '../src/core/relics';
import { attackStats } from '../src/core/attack-relics';
import { SaveStore, defaultSettings, validRun } from '../src/persistence/save';
import type { Enemy, RunState } from '../src/core/model';

function run() {
  const s = createDungeonRun(42); s.expedition!.room = 6; s.phase = 'cleared';
  const chest = currentRoom(s)!; chest.visited = chest.cleared = true;
  chest.reward = { room: 6, candidates: ['R56'], choice: null }; chooseRelic(s, 'R56');
  s.expedition!.room = 1; currentRoom(s)!.visited = true; s.phase = 'combat'; s.player.hp = 50;
  return s;
}
function kill(s: RunState, count = 1) {
  for (let i = 0; i < count; i++) {
    const e: Enemy = { id: s.nextId++, kind: 'rat', x: 350, y: 183, hp: 1, maxHp: 30,
      angle: 0, mode: 'move', timer: 0, targetX: 350, targetY: 183, flash: 0 };
    damageEnemy(s, e, 1);
  }
}
function clearAndReturnToStart(s: RunState) {
  currentRoom(s)!.cleared = true; s.phase = 'explore'; s.enemies = [];
  const door = adjacentRooms(s).find(d => d.room.id === 0)!;
  expect(travel(s, door.direction)).toBe(true);
}

describe('approved relic balance adjustments', () => {
  it('limits all kill healing in one room to 12 and keeps clear healing separate', () => {
    const s = run(); grantRelic(s, 'R54'); kill(s, 10);
    expect(s.player.hp).toBe(62); expect(currentRoom(s)!.chaliceHealed).toBe(12);
    s.player.hp = 30; kill(s); expect(s.player.hp).toBe(30);
    step(s, emptyInput()); expect(s.player.hp).toBe(35);
  });
  it('counts actual recovery, including fractional healing, without spending capacity at full HP', () => {
    const s = run(); s.player.hp = 99.5; kill(s, 3);
    expect(s.player.hp).toBe(100); expect(currentRoom(s)!.chaliceHealed).toBe(0.5);
    s.player.hp = 50; kill(s, 6);
    expect(s.player.hp).toBe(61.5); expect(currentRoom(s)!.chaliceHealed).toBe(12);
    kill(s); expect(s.player.hp).toBe(61.5);
  });
  it('gives a new room its own allowance and preserves a cleared room allowance on revisits', () => {
    const s = run(); kill(s, 6); clearAndReturnToStart(s);
    expect(travel(s, adjacentRooms(s).find(d => d.room.id === 2)!.direction)).toBe(true);
    s.phase = 'combat'; s.enemies = []; kill(s, 6); expect(s.player.hp).toBe(74);
    clearAndReturnToStart(s);
    expect(travel(s, adjacentRooms(s).find(d => d.room.id === 1)!.direction)).toBe(true);
    expect(currentRoom(s)!.chaliceHealed).toBe(12);
    expect(s.expedition!.dungeon!.rooms[2].chaliceHealed).toBe(12);
    expect(validRun(s)).toBe(true);
  });
  it('starts a fresh allowance in the next region and in a new expedition', () => {
    const s = run(); kill(s, 6); currentRoom(s)!.cleared = true;
    s.expedition!.room = 8; currentRoom(s)!.visited = currentRoom(s)!.cleared = true;
    s.boss = createBoss(s); s.boss.hp = 0; s.phase = 'cleared';
    expect(enterNextRegion(s)).toBe(true);
    expect(s.expedition!.previousDungeon!.rooms[1].chaliceHealed).toBe(12);
    s.expedition!.room = 1; currentRoom(s)!.visited = true; s.phase = 'combat'; kill(s);
    expect(s.player.hp).toBe(64); expect(currentRoom(s)!.chaliceHealed).toBe(2);
    expect(validRun(s)).toBe(true);
    expect(createDungeonRun(42).expedition!.dungeon!.rooms.every(r => r.chaliceHealed === undefined)).toBe(true);
  });
  it('retains the remaining room allowance after saving and resuming', async () => {
    const s = run(); kill(s, 5); expect(validRun(s)).toBe(true);
    const store = new SaveStore('relic-balance-room-cap'); await store.load(); await store.save(s, defaultSettings());
    const restored = (await store.load())!.run!;
    expect(currentRoom(restored)!.chaliceHealed).toBe(10);
    kill(restored, 2); expect(restored.player.hp).toBe(62);
    expect(currentRoom(restored)!.chaliceHealed).toBe(12); expect(validRun(restored)).toBe(true);
  });
  it('shares the cap across legacy waves and resets it only on advancing to another room', () => {
    const s = createRun(42); grantRelic(s, 'R56'); s.phase = 'combat'; s.player.hp = 50; kill(s, 6);
    s.wave = 2; kill(s, 4); expect(s.player.hp).toBe(62); expect(s.chaliceHealed).toBe(12);
    s.phase = 'cleared'; s.expedition!.reward = { room: 0, candidates: ['R49'], choice: 'skip' };
    expect(advanceRoom(s)).toBe(true); kill(s); expect(s.player.hp).toBe(64); expect(s.chaliceHealed).toBe(2);
    expect(validRun(s)).toBe(true);
  });
  it.each([-1, 12.01, NaN, Infinity, '12', null])('rejects invalid saved room healing %s', value => {
    const s = run(); Object.assign(currentRoom(s)!, { chaliceHealed: value }); expect(validRun(s)).toBe(false);
    const legacy = createRun(42); grantRelic(legacy, 'R56'); Object.assign(legacy, { chaliceHealed: value });
    expect(validRun(legacy)).toBe(false);
  });
  it('caps healing from summoned enemies and a boss kill together', () => {
    const s = run(); currentRoom(s)!.cleared = true; s.expedition!.room = 8;
    currentRoom(s)!.visited = true; s.boss = createBoss(s); s.boss.mode = 'recover';
    kill(s, 6); damageEnemy(s, s.boss, s.boss.hp);
    expect(s.player.hp).toBe(62); expect(currentRoom(s)!.chaliceHealed).toBe(12);
  });
  it('loads old saves with no healing counter and preserves the old seal cooldown already in progress', async () => {
    const s = createDungeonRun(42); s.expedition!.room = 6; s.phase = 'cleared';
    const chest = currentRoom(s)!; chest.visited = chest.cleared = true;
    chest.reward = { room: 6, candidates: ['R50'], choice: null }; chooseRelic(s, 'R50');
    s.player.fireCooldown = 24 * 1.15;
    const store = new SaveStore('relic-balance-legacy-seal'); await store.load(); await store.save(s, defaultSettings());
    const restored = (await store.load())!.run!;
    expect(restored.player.fireCooldown).toBeCloseTo(27.6); expect(attackStats(restored).fireInterval).toBeCloseTo(25.2);
    step(restored, emptyInput()); expect(restored.player.fireCooldown).toBeCloseTo(26.6);
    expect(validRun(restored)).toBe(true);
  });
  it('describes the 5% firing penalty and 12 HP room cap in the shared item metadata', () => {
    expect(RELICS.R50.description).toContain('발사 간격 +5%');
    expect(RELICS.R56.description).toContain('방당 최대 12');
  });
});
