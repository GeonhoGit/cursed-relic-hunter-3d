import { describe, expect, it } from 'vitest';
import { createDungeonRun, emptyInput, step } from '../src/core/simulation';
import { defaultProfile, emptyInvestment, earnedPoints, recordGrowth, changeInvestment, beginGrowthRun, growthStats, validInvestment } from '../src/core/growth';
import { growthMarkup } from '../src/game/growth-ui';
import { advanceDodgeRecharge } from '../src/core/dodge';
import { refreshShop, buyFromShop } from '../src/core/shop';

describe('permanent growth', () => {
  it('awards first clear and five unique room clears once across retries, revisits and runs', () => {
    let p = defaultProfile(); const s = createDungeonRun(42); beginGrowthRun(s, p.investment, 'run-a');
    const rooms = s.expedition!.dungeon!.rooms;
    rooms[1].visited = rooms[1].cleared = true;
    p = recordGrowth(p, s); expect(earnedPoints(p)).toBe(5); expect(p.rooms).toHaveLength(1);
    expect(recordGrowth(p, s)).toEqual(p);
    const t = createDungeonRun(42); beginGrowthRun(t, p.investment, 'run-b');
    t.expedition!.dungeon!.rooms[1].visited = t.expedition!.dungeon!.rooms[1].cleared = true;
    p = recordGrowth(p, t); expect(p.rooms).toHaveLength(2);
    p = recordGrowth(p, s); expect(p.rooms).toHaveLength(2);
    for (const r of rooms.filter(r => r.kind === 'combat')) r.visited = r.cleared = true;
    p = recordGrowth(p, s); expect(earnedPoints(p)).toBe(10); expect(p.rooms).toHaveLength(5);
    expect(recordGrowth(p, t)).toEqual(p);
  });
  it('counts actual acquisitions, purchases and a living boss victory; preserves records after death', () => {
    let p = defaultProfile(); const s = createDungeonRun(42); beginGrowthRun(s, p.investment, 'goals');
    s.expedition!.acquired = ['R01', 'R02', 'R03', 'R04', 'R07', 'R08', 'R13', 'R20', 'R25', 'R30', 'R38', 'R43'];
    s.expedition!.room = 10; s.expedition!.dungeon!.rooms[10].visited = s.expedition!.dungeon!.rooms[10].cleared = true;
    refreshShop(s); s.player.hp = 80; s.gold = 20; buyFromShop(s, 2, s.expedition!.dungeon!.rooms[10].shop!.revision);
    p = recordGrowth(p, s); expect(earnedPoints(p)).toBe(5); expect(p.purchases).toHaveLength(1);
    s.phase = 'dead'; expect(recordGrowth(p, s)).toEqual(p);
    for (let i = 0; i < 4; i++) { s.growth!.id = `buy-${i}`; p = recordGrowth(p, s); }
    expect(earnedPoints(p)).toBe(10); expect(p.purchases).toHaveLength(5);
    s.expedition!.dungeon!.rooms[8].cleared = true; s.phase = 'cleared'; s.player.hp = 40;
    p = recordGrowth(p, s); expect(earnedPoints(p)).toBe(15); expect(recordGrowth(p, s)).toEqual(p);
  });
  it('enforces budget, per-stat limits and free redistribution without changing earned points', () => {
    const p = defaultProfile(); p.bossDefeated = true;
    let draft = emptyInvestment();
    for (let i = 0; i < 5; i++) draft = changeInvestment(draft, 'health', 1, earnedPoints(p));
    expect(draft.health).toBe(5); expect(changeInvestment(draft, 'attack', 1, 5)).toEqual(draft);
    draft = changeInvestment(draft, 'health', -1, 5); draft = changeInvestment(draft, 'attack', 1, 5);
    expect(draft).toMatchObject({ health: 4, attack: 1 });
    const max = { ...emptyInvestment(), movement: 60 }; expect(changeInvestment(max, 'movement', 1, 60)).toEqual(max);
    expect(changeInvestment(emptyInvestment(), 'health', -1, 5)).toEqual(emptyInvestment()); expect(earnedPoints(p)).toBe(5);
  });
  it.each(['health', 'attack', 'speed', 'movement', 'dodge'] as const)('allows %s up to 60 while rejecting 61', stat => {
    const draft = { ...emptyInvestment(), [stat]: 59 };
    const max = changeInvestment(draft, stat, 1, 60);
    expect(max[stat]).toBe(60); expect(validInvestment(max)).toBe(true);
    expect(changeInvestment(max, stat, 1, 100)).toEqual(max);
    expect(validInvestment({ ...max, [stat]: 61 }, 100)).toBe(false);
    expect(validInvestment({ ...max, [stat === 'health' ? 'attack' : 'health']: 1 })).toBe(false);
  });
  it('shows a maximum of 60 for every investment control', () => {
    const markup = growthMarkup(defaultProfile(), emptyInvestment(), '');
    for (const stat of ['health', 'attack', 'speed', 'movement', 'dodge']) {
      expect(markup).toMatch(new RegExp(`id="growth-value-${stat}"[^>]*>0<small>/60</small>`));
    }
  });
  it('freezes departure stats without changing base runs or granting repeated health', () => {
    const s = createDungeonRun(42), investment = { health: 20, attack: 20, speed: 0, movement: 10, dodge: 10 };
    expect(growthStats(s)).toEqual({ maxHp: 100, damage: 7, fireInterval: 24, moveSpeed: 150, dodgeRecharge: 96 });
    beginGrowthRun(s, investment, 'snapshot'); investment.health = 0;
    expect(s.player.hp).toBe(120); expect(growthStats(s)).toMatchObject({ maxHp: 120, moveSpeed: 154.5 });
    expect(growthStats(s).damage).toBeCloseTo(7.7); expect(growthStats(s).dodgeRecharge).toBeCloseTo(91.2);
    s.player.hp = 64; expect(beginGrowthRun(s, emptyInvestment(), 'replacement')).toBe(false); expect(s.player.hp).toBe(64);
  });
  it('applies small fire speed investments with fractional carry and snapshots weapon damage', () => {
    const s = createDungeonRun(42); beginGrowthRun(s, { ...emptyInvestment(), speed: 1, attack: 1 }, 'fire');
    const input = { ...emptyInput(), fire: true }; step(s, input); expect(s.bullets[0].damage).toBeCloseTo(7.035);
    for (let i = 1; i < 2400; i++) step(s, input);
    expect(s.stats.shots).toBe(101); // Base fire rate gives 100; one point must not be rounded away.
  });
  it('recharges a fractional dodge timer and caps shop healing at the frozen maximum', () => {
    const s = createDungeonRun(42); beginGrowthRun(s, { ...emptyInvestment(), health: 5, dodge: 1 }, 'heal');
    step(s, { ...emptyInput(), dodge: true }); expect(s.player.dodgeCooldown).toBeCloseTo(95.52);
    for (let i = 0; i < 96; i++) advanceDodgeRecharge(s);
    expect(s.player.dodgeCharges).toBe(1); expect(s.player.dodgeCooldown).toBe(0);
    s.expedition!.room = 10; refreshShop(s); s.player.hp = 101; s.gold = 20;
    expect(buyFromShop(s, 2, s.expedition!.dungeon!.rooms[10].shop!.revision)).toBe('bought'); expect(s.player.hp).toBe(105);
  });
  it('carries fractional dodge recharge across repeated uses so one point has its promised average effect', () => {
    const s = createDungeonRun(42); beginGrowthRun(s, { ...emptyInvestment(), dodge: 1 }, 'dodge-average');
    let ticks = 0;
    for (let use = 0; use < 10; use++) {
      step(s, { ...emptyInput(), dodge: true });
      while (s.player.dodgeCooldown > 0) { step(s, emptyInput()); ticks++; }
      // Waiting at full charge must not erase the sub-tick credit or create more charges.
      for (let wait = 0; wait < 10; wait++) step(s, emptyInput());
    }
    expect(ticks).toBe(Math.ceil(10 * 95.52)); expect(s.player.dodgeCharges).toBe(1);
  });
});
