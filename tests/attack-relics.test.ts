import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDungeonRun, emptyInput, step } from '../src/core/simulation';
import { attackStats } from '../src/core/attack-relics';
import { beginGrowthRun, emptyInvestment, growthStats } from '../src/core/growth';
import { grantRelic } from '../src/core/relic-acquisition';
import { chooseRelic, prepareReward } from '../src/core/expedition';
import { buyFromShop, refreshShop } from '../src/core/shop';
import { WEAPONS } from '../src/core/weapons';
import { advanceBurn, advanceProjectiles } from '../src/core/combat';
import { advanceBombs, placeBomb } from '../src/core/bombs';
import { landingImpact } from '../src/core/jump';
import { defaultSettings, SaveStore, validRun } from '../src/persistence/save';
import type { Enemy, RelicId, WeaponId } from '../src/core/model';

const attackIds = ['R49', 'R50', 'R51'] as const;
function run(ids: RelicId[] = []) {
  const s = createDungeonRun(42); s.weapon = 'W01';
  ids.forEach((id, i) => {
    const room = s.expedition!.dungeon!.rooms[i < 2 ? 6 + i : 10]; room.visited = room.cleared = true;
    if (i < 2) room.reward = { room: room.id, candidates: [id], choice: id };
    else room.shop = { revision: 2, slots: [
      { kind: 'relic', relic: id, purchased: true, repairCounter: 0 },
      { kind: 'relic', relic: null, purchased: false, repairCounter: 0 },
      { kind: 'heal', relic: null, purchased: false, repairCounter: 0 },
      { kind: 'curse', relic: null, purchased: false, repairCounter: 0 },
    ] };
    grantRelic(s, id);
  });
  return s;
}
function enemy(s: ReturnType<typeof run>, x = 350, y = 183): Enemy {
  return { id: s.nextId++, kind: 'rat', x, y, hp: 100, maxHp: 100, angle: 0, mode: 'move', timer: 0, targetX: x, targetY: y, flash: 0 };
}
const fire = () => ({ ...emptyInput(), fire: true, aimX: 600, aimY: 183 });

describe('basic damage relics', () => {
  it.each<readonly [RelicId, number, number]>([['R49', 1.15, 1], ['R50', 1.3, 1.05], ['R51', 1.25, 1]])(
    '%s changes only basic damage and the approved firing interval', (id, multiplier, interval) => {
      const s = run([id]); s.player.hp = 50;
      const base = growthStats(s), actual = attackStats(s);
      expect(actual.damage).toBeCloseTo(base.damage * multiplier);
      expect(actual.fireInterval).toBeCloseTo(base.fireInterval * interval);
      expect(actual.maxHp).toBe(base.maxHp); expect(actual.moveSpeed).toBe(base.moveSpeed);
      expect(actual.dodgeRecharge).toBe(base.dodgeRecharge);
    });
  it.each<WeaponId>(['W01', 'W02', 'W03', 'W04'])('applies an additive 70%% to every %s pellet at firing time', weapon => {
    const s = run([...attackIds]); s.weapon = weapon; s.player.hp = 50;
    step(s, fire());
    expect(s.bullets).toHaveLength(WEAPONS[weapon].pellets);
    s.bullets.forEach(b => expect(b.damage).toBeCloseTo(WEAPONS[weapon].damage * 1.7));
    expect(s.player.fireCooldown).toBeCloseTo(WEAPONS[weapon].interval * 1.05);
    expect(s.stats.shots).toBe(1);
  });
  it('uses half of the invested maximum HP, activates at the boundary and deactivates after healing', () => {
    const s = run(['R51']); beginGrowthRun(s, { ...emptyInvestment(), health: 60 }, 'attack-boundary');
    s.player.hp = 80.001; expect(attackStats(s).fangActive).toBe(false); expect(attackStats(s).damage).toBe(7);
    s.player.hp = 80; expect(attackStats(s).fangActive).toBe(true); expect(attackStats(s).damage).toBe(8.75);
    step(s, fire()); const shot = s.bullets[0];
    s.player.hp = 81; s.player.fireCooldown = 0; step(s, fire());
    expect(attackStats(s).fangActive).toBe(false); expect(shot.damage).toBe(8.75);
    expect(s.bullets.at(-1)!.damage).toBe(7);
  });
  it('composes with attack investment and weakness without changing growth previews', () => {
    const s = run([...attackIds]); beginGrowthRun(s, { ...emptyInvestment(), attack: 60 }, 'attack-growth');
    s.player.hp = 50; s.phase = 'combat'; s.waveDelay = 99999; s.player.weakTicks = 180;
    expect(growthStats(s).damage).toBeCloseTo(9.1);
    step(s, fire()); expect(s.bullets[0].damage).toBeCloseTo(7 * 1.3 * 1.7 * 0.8);
  });
  it('preserves fractional firing cadence with speed investment', () => {
    const s = run(['R50']); beginGrowthRun(s, { ...emptyInvestment(), speed: 60 }, 'attack-speed');
    const times: number[] = [];
    for (let i = 0; i < 120; i++) { const shots = s.stats.shots; step(s, fire()); if (s.stats.shots > shots) times.push(s.tick); }
    expect(times).toEqual([1, 21, 40, 60, 79, 98, 118]);
    expect(attackStats(s).fireInterval).toBeCloseTo(24 * 1.05 / 1.3);
  });
  it.each([false, true])('keeps fixed bomb, burn and stomp damage unchanged (weakness=%s)', weak => {
    const s = run([...attackIds]); s.player.hp = 50; if (weak) s.player.weakTicks = 180;
    for (const id of ['R13', 'R07', 'R46'] as const) grantRelic(s, id);
    const target = enemy(s); s.enemies = [target];
    placeBomb(s, target); s.bombs![0].ticks = 1; advanceBombs(s);
    expect(target.hp).toBeCloseTo(100 - (weak ? 36 : 45));
    target.hp = 100; landingImpact(s); expect(target.hp).toBeCloseTo(100 - (weak ? 9.6 : 12));
    target.hp = 100; s.player.fireCooldown = 0; step(s, fire());
    for (let i = 0; i < 8 && !target.burnTicks; i++) advanceProjectiles(s);
    expect(target.burnTicks).toBe(180); const before = target.hp;
    for (let i = 0; i < 60; i++) advanceBurn(s);
    expect(before - target.hp).toBeCloseTo(weak ? 1.6 : 2);
  });
  it('inherits boosted shot damage in split projectiles without applying the bonus twice', () => {
    const s = run([...attackIds]); s.player.hp = 50; grantRelic(s, 'R03');
    const target = enemy(s); s.enemies = [target]; step(s, fire());
    for (let i = 0; i < 8 && !s.bullets.some(b => b.kind === 'split'); i++) advanceProjectiles(s);
    const split = s.bullets.filter(b => b.kind === 'split'); expect(split).toHaveLength(3);
    split.forEach(b => expect(b.damage).toBeCloseTo(7 * 1.7 * 0.35));
  });
  it('offers each relic in unmodified treasure and shop pools and acquires each only once', () => {
    const treasure = new Set<RelicId>(), shop = new Set<RelicId>();
    for (let seed = 1; seed <= 100; seed++) {
      const s = createDungeonRun(Math.imul(seed, 0x9e3779b1) >>> 0); s.expedition!.room = 6; s.phase = 'cleared';
      const room = s.expedition!.dungeon!.rooms[6]; room.visited = room.cleared = true;
      prepareReward(s); room.reward!.candidates.forEach(id => treasure.add(id));
      s.expedition!.room = 10; s.phase = 'explore'; refreshShop(s);
      s.expedition!.dungeon!.rooms[10].shop!.slots.forEach(slot => { if (slot.relic) shop.add(slot.relic); });
    }
    for (const id of attackIds) {
      expect(treasure.has(id)).toBe(true); expect(shop.has(id)).toBe(true);
      const s = run(); s.expedition!.room = 6; s.phase = 'cleared';
      const room = s.expedition!.dungeon!.rooms[6]; room.visited = room.cleared = true;
      room.reward = { room: 6, candidates: [id], choice: null };
      expect(chooseRelic(s, id)).toBe(true); expect(grantRelic(s, id)).toBe(false); expect(validRun(s)).toBe(true);
      const purchase = run(); purchase.expedition!.room = 10; purchase.gold = 24;
      purchase.expedition!.dungeon!.rooms[10].visited = purchase.expedition!.dungeon!.rooms[10].cleared = true;
      refreshShop(purchase);
      const stock = purchase.expedition!.dungeon!.rooms[10].shop!;
      stock.slots[0].relic = id; if (stock.slots[1].relic === id) stock.slots[1].relic = 'R01';
      expect(buyFromShop(purchase, 0, stock.revision)).toBe('bought'); expect(validRun(purchase)).toBe(true);
      expect(grantRelic(purchase, id)).toBe(false);
    }
    expect(attackStats(run()).damage).toBe(7); expect(run().expedition!.relics).toEqual([]);
  });
  it('restores empowered shots, longer cooldown and HP activation, including cooldown after relic loss', async () => {
    const s = run([...attackIds]); s.player.hp = 50; step(s, fire());
    expect(validRun(s)).toBe(true);
    const store = new SaveStore('attack-relic-save'); await store.load(); await store.save(s, defaultSettings());
    const restored = (await store.load())!.run!; expect(restored).toEqual(s);
    expect(attackStats(restored).damage).toBeCloseTo(11.9);
    restored.expedition!.relics = []; expect(validRun(restored)).toBe(true);
    expect(attackStats(restored).fireInterval).toBe(24); expect(restored.bullets[0].damage).toBeCloseTo(11.9);
    const impossible = structuredClone(s); impossible.player.fireCooldown = 28; expect(validRun(impossible)).toBe(false);
    const legacy = run(); delete legacy.weapon; expect(validRun(legacy)).toBe(true);
    expect(attackStats(legacy).damage).toBe(7); expect(attackStats(legacy).fireInterval).toBe(24);
  });
});
