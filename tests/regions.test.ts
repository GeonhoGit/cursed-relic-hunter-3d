import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDungeonRun, emptyInput, step, travel } from '../src/core/simulation';
import { createBoss } from '../src/core/boss';
import { adjacentRooms } from '../src/core/dungeon';
import { canEnterNextRegion, enterNextRegion } from '../src/core/region';
import { defaultSettings, SaveStore, validRun } from '../src/persistence/save';
import { beginGrowthRun, defaultProfile, emptyInvestment, recordGrowth, validProfile } from '../src/core/growth';

function defeated() {
  const s = createDungeonRun(42); s.expedition!.room = 8; const room = s.expedition!.dungeon!.rooms[8];
  room.visited = room.cleared = true; s.boss = createBoss(s); s.boss.hp = 0; s.phase = 'cleared'; return s;
}
describe('second region transition', () => {
  it('requires a living player and a defeated first boss, then carries the build exactly once', () => {
    const s = createDungeonRun(42); expect(enterNextRegion(s)).toBe(false);
    const won = defeated(); won.player.hp = 61; won.gold = 73; won.player.auxCooldown = 230; won.player.stompCooldown = 120;
    beginGrowthRun(won, emptyInvestment(), 'regions-run'); won.player.hp = 61; won.weapon = 'W02';
    expect(canEnterNextRegion(won)).toBe(true); expect(enterNextRegion(won)).toBe(true);
    expect(won.expedition!.region).toBe(2); expect(won.expedition!.room).toBe(0); expect(won.phase).toBe('explore');
    expect(won.expedition!.previousDungeon!.rooms[8].cleared).toBe(true); expect(won.boss).toBeUndefined();
    expect(won.player).toMatchObject({ hp: 61, x: 320, y: 183, auxCooldown: 230, stompCooldown: 120 });
    expect(won.gold).toBe(73); expect(won.weapon).toBe('W02'); expect(won.growth!.id).toBe('regions-run');
    expect(enterNextRegion(won)).toBe(false); expect(validRun(won)).toBe(true);
    const old = defeated(); delete old.expedition!.region; expect(canEnterNextRegion(old)).toBe(false); expect(validRun(old)).toBe(true);
    const dead = defeated(); dead.player.hp = 0; expect(enterNextRegion(dead)).toBe(false);
  });
  it('retains past treasure choices in saved snapshots and offers only unacquired relics in Z2', async () => {
    const s = defeated(), treasure = s.expedition!.dungeon!.rooms[6]; treasure.visited = treasure.cleared = true;
    treasure.reward = { room: 6, candidates: ['R44'], choice: 'R44' };
    s.expedition!.relics = s.expedition!.acquired = ['R44'];
    expect(validRun(s)).toBe(true); expect(enterNextRegion(s)).toBe(true); expect(validRun(s)).toBe(true);
    const store = new SaveStore('second-region-history'); await store.load(); await store.save(s, defaultSettings());
    const restored = (await store.load())!.run!; expect(restored).toEqual(s); expect(restored.expedition!.relics).toContain('R44');
    const bad = structuredClone(s); bad.expedition!.previousDungeon!.rooms[6].reward!.choice = 'skip'; expect(validRun(bad)).toBe(false);
    const invalid = structuredClone(s); invalid.expedition!.region = 3 as any; expect(validRun(invalid)).toBe(false);
  });
  it('creates a second connected maze and 7-10 enemies including ash priests from every combat doorway', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const s = defeated(); s.seed = seed; enterNextRegion(s);
      expect(s.expedition!.dungeon!.rooms.filter(r => r.kind === 'combat').map(r => r.template).sort()).toContain(2);
      for (let id = 1; id <= 5; id++) {
        const copy = structuredClone(s), source = adjacentRooms(copy, id)[0].room;
        copy.expedition!.room = source.id; source.visited = source.cleared = true;
        const direction = adjacentRooms(copy).find(d => d.room.id === id)!.direction;
        expect(travel(copy, direction)).toBe(true); expect(copy.enemies.length).toBeGreaterThanOrEqual(7); expect(copy.enemies.length).toBeLessThanOrEqual(10);
        expect(copy.enemies.some(e => e.kind === 'ashpriest')).toBe(true);
      }
    }
  });
  it('records purchases with distinct region keys and preserves old profile compatibility', () => {
    const s = defeated(); beginGrowthRun(s, emptyInvestment(), 'same-expedition');
    const shop = s.expedition!.dungeon!.rooms[10]; shop.visited = shop.cleared = true;
    shop.shop = { revision: 2, slots: [{ kind: 'heal', relic: null, purchased: true, repairCounter: 0 }] };
    const p = recordGrowth(defaultProfile(), s); expect(p.bossDefeated).toBe(true);
    enterNextRegion(s); const next = s.expedition!.dungeon!.rooms[10]; next.visited = next.cleared = true; next.shop = structuredClone(shop.shop);
    const updated = recordGrowth(p, s); expect(updated.purchases).toHaveLength(2); expect(validProfile(updated)).toBe(true);
    expect(validProfile(defaultProfile())).toBe(true);
  });
});
