import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDungeonRun, createRun, emptyInput, step } from '../src/core/simulation';
import { attackStats } from '../src/core/attack-relics';
import { beginGrowthRun, emptyInvestment } from '../src/core/growth';
import { grantRelic } from '../src/core/relic-acquisition';
import { chooseRelic, prepareReward, roomReward } from '../src/core/expedition';
import { refreshShop, buyFromShop } from '../src/core/shop';
import { damageEnemy, advanceBurn } from '../src/core/combat';
import { createBoss } from '../src/core/boss';
import { advanceBombs, placeBomb } from '../src/core/bombs';
import { landingImpact } from '../src/core/jump';
import { WEAPONS } from '../src/core/weapons';
import { RELICS } from '../src/core/relics';
import { SaveStore, defaultSettings, validRun } from '../src/persistence/save';
import type { Enemy, RelicId, WeaponId } from '../src/core/model';

const newIds = ['R52', 'R53', 'R54', 'R55', 'R56', 'R57'] as const;
function run(ids: RelicId[] = []) { const s = createDungeonRun(42); for (const id of ids) grantRelic(s, id); return s; }
const fire = () => ({ ...emptyInput(), fire: true, aimX: 600, aimY: 183 });
function enemy(s: ReturnType<typeof run>, hp = 30, x = 350, y = 183): Enemy {
  return { id: s.nextId++, kind: 'rat', x, y, hp, maxHp: 30, angle: Math.PI, mode: 'move', timer: 0, targetX: x, targetY: y, flash: 0 };
}
function touching(ids: RelicId[] = []) {
  const s = createRun(42); s.phase = 'combat'; s.waveDelay = 99999; s.player.x = 100; s.player.y = 180;
  s.enemies = [{ ...enemy(s, 30, 116, 180), frost: { freezeTicks: 999, resistTicks: 0, hits: [] } }];
  ids.forEach(id => grantRelic(s, id)); return s;
}

describe('six new graded relics', () => {
  it('assigns two common, two rare, one epic and one legendary effect without changing old rarity weights', () => {
    expect(newIds.map(id => RELICS[id].rarity)).toEqual(['common', 'common', 'rare', 'rare', 'epic', 'legendary']);
  });
  it('reduces firing interval by 10%, retains fractional cadence and composes with the giant seal', () => {
    const s = run(['R52']); const times: number[] = [];
    for (let i = 0; i < 120; i++) { const shots = s.stats.shots; step(s, fire()); if (s.stats.shots > shots) times.push(s.tick); }
    expect(times).toEqual([1, 23, 45, 66, 88, 109]); expect(attackStats(s).damage).toBe(7);
    const combined = run(['R52', 'R50']); step(combined, fire());
    expect(combined.player.fireCooldown).toBeCloseTo(24 * 1.05 * 0.9);
    const before = combined.player.fireCooldown; combined.expedition!.relics = ['R50'];
    step(combined, fire()); expect(combined.player.fireCooldown).toBeCloseTo(before - 1);
  });
  it.each<WeaponId>(['W01', 'W02', 'W03', 'W04'])('increases every %s basic projectile speed by 20% including vertical velocity', weapon => {
    const s = run(['R55']); s.weapon = weapon;
    step(s, { ...fire(), aimPitch: 0.3 });
    expect(s.bullets).toHaveLength(WEAPONS[weapon].pellets);
    for (const b of s.bullets) {
      expect(Math.hypot(b.vx, b.vy, b.heightVelocity!)).toBeCloseTo(WEAPONS[weapon].speed * 1.2);
      expect(b.damage).toBe(WEAPONS[weapon].damage); expect(b.life).toBe(74);
    }
  });
  it('reduces actual contact and projectile damage, keeps the strongest-hit rule and preserves invulnerability', () => {
    const s = touching(['R53']); step(s, emptyInput());
    expect(s.player.hp).toBeCloseTo(94.9); expect(s.player.invulnerable).toBe(45);
    step(s, emptyInput()); expect(s.player.hp).toBeCloseTo(94.9); expect(s.stats.hits).toBe(1);
    s.player.invulnerable = 0;
    s.bullets = [{ id: s.nextId++, x: 100, y: 180, vx: 0, vy: 0, life: 10, owner: 'enemy', damage: 10 }];
    step(s, emptyInput()); expect(s.player.hp).toBeCloseTo(86.4);
    expect(s.cues.filter(c => c.kind === 'hurt').at(-1)!.amount).toBeCloseTo(8.5);
  });
  it('reduces boss contact and resolves fatal hits using reduced damage', () => {
    const s = touching(['R53']); s.enemies = []; s.boss = createBoss(s);
    Object.assign(s.boss, { x: 127, y: 180, mode: 'recover', timer: 72 });
    step(s, emptyInput()); expect(s.player.hp).toBeCloseTo(89.8);
    const survives = touching(['R53']); survives.player.hp = 5.2; step(survives, emptyInput());
    expect(survives.player.hp).toBeCloseTo(0.1); expect(survives.phase).toBe('combat');
    const dies = touching(['R53']); dies.player.hp = 5; step(dies, emptyInput()); expect(dies.phase).toBe('dead');
    const rescued = touching(['R53', 'R20']); rescued.player.hp = 5; step(rescued, emptyInput());
    expect(rescued.player.hp).toBe(1); expect(rescued.player.invulnerable).toBe(90);
  });
  it('heals 5 once on a normal combat clear, caps at maximum HP and does not heal on exploration or boss clears', () => {
    for (const hp of [50, 98]) {
      const s = run(['R54']); s.phase = 'combat'; s.expedition!.room = 1; s.wave = 1; s.waveDelay = 0; s.player.hp = hp;
      step(s, emptyInput()); expect(s.phase).toBe('explore'); expect(s.player.hp).toBe(Math.min(100, hp + 5));
      for (let i = 0; i < 10; i++) step(s, emptyInput()); expect(s.player.hp).toBe(Math.min(100, hp + 5));
    }
    const boss = run(['R54']); boss.expedition!.room = 8; boss.phase = 'combat'; boss.player.hp = 50;
    boss.boss = createBoss(boss); boss.boss.hp = 0; step(boss, emptyInput()); expect(boss.player.hp).toBe(50);
    const oldRoute = createRun(42); grantRelic(oldRoute, 'R54'); oldRoute.phase = 'combat'; oldRoute.wave = 2;
    oldRoute.waveDelay = 0; oldRoute.enemies = []; oldRoute.player.hp = 50;
    step(oldRoute, emptyInput()); expect(oldRoute.player.hp).toBe(55); step(oldRoute, emptyInput()); expect(oldRoute.player.hp).toBe(55);
  });
  it('heals 2 per real kill from shots, burns, bombs and landing, without healing on nonfatal or repeated hits', () => {
    const s = run(['R56', 'R13', 'R46']); s.player.hp = 50;
    const direct = enemy(s); damageEnemy(s, direct, 5); expect(s.player.hp).toBe(50);
    damageEnemy(s, direct, 25); damageEnemy(s, direct, 25); expect(s.player.hp).toBe(52); expect(s.stats.kills).toBe(1);
    const burning = enemy(s, 2); burning.burnTicks = 60; burning.burnPulse = 1; s.enemies = [burning];
    advanceBurn(s); expect(s.player.hp).toBe(54);
    const bombed = enemy(s, 30); s.enemies = [bombed]; placeBomb(s, bombed); s.bombs![0].ticks = 1;
    advanceBombs(s); expect(s.player.hp).toBe(56);
    const stomped = enemy(s, 12); s.enemies = [stomped]; landingImpact(s); expect(s.player.hp).toBe(58);
    const capped = enemy(s, 1); s.player.hp = 99; damageEnemy(s, capped, 1); expect(s.player.hp).toBe(100);
    const corpse = enemy(s, 1); s.player.hp = 0; damageEnemy(s, corpse, 1); expect(s.player.hp).toBe(0);
  });
  it('does not grant kill healing for boss transitions, but heals for an actual boss kill', () => {
    const s = run(['R56']); s.player.hp = 50; const boss = createBoss(s); boss.mode = 'transition';
    damageEnemy(s, boss, boss.hp); expect(s.player.hp).toBe(50);
    boss.mode = 'recover'; damageEnemy(s, boss, boss.hp); expect(s.player.hp).toBe(52);
    damageEnemy(s, boss, 9999); expect(s.player.hp).toBe(52);
  });
  it('uses the invested HP boundary for crown damage, adds other bonuses and snapshots damage at firing time', () => {
    const s = run(['R57', 'R49', 'R50']); beginGrowthRun(s, { ...emptyInvestment(), health: 10 }, 'crown-boundary');
    s.player.hp = 88; expect(attackStats(s).crownActive).toBe(true); expect(attackStats(s).damage).toBeCloseTo(7 * 1.8);
    step(s, fire()); const shot = s.bullets[0]; s.player.hp = 87.999; s.player.fireCooldown = 0; step(s, fire());
    expect(attackStats(s).crownActive).toBe(false); expect(s.bullets.at(-1)!.damage).toBeCloseTo(7 * 1.45);
    expect(shot.damage).toBeCloseTo(7 * 1.8);
    grantRelic(s, 'R51'); s.player.hp = 55; expect(attackStats(s).damage).toBeCloseTo(7 * 1.7);
    expect(attackStats(s).fangActive).toBe(true); expect(attackStats(s).crownActive).toBe(false);
  });
  it.each(newIds)('%s can be selected, bought once and restored without carrying into a new expedition', async id => {
    const s = createDungeonRun(42); s.weapon = 'W01'; s.player.hp = 80; s.phase = 'cleared'; s.expedition!.room = 6;
    const room = s.expedition!.dungeon!.rooms[6]; room.visited = room.cleared = true;
    room.reward = { room: 6, candidates: [id], choice: null };
    expect(chooseRelic(s, id)).toBe(true); expect(grantRelic(s, id)).toBe(false); step(s, fire()); expect(validRun(s)).toBe(true);
    const store = new SaveStore('new-relic-' + id); await store.load(); await store.save(s, defaultSettings());
    const restored = (await store.load())!.run!; expect(restored).toEqual(s); expect(attackStats(restored)).toEqual(attackStats(s));
    const purchase = createDungeonRun(42); purchase.expedition!.room = 10; purchase.gold = 24;
    const shopRoom = purchase.expedition!.dungeon!.rooms[10]; shopRoom.visited = shopRoom.cleared = true; refreshShop(purchase);
    const shop = shopRoom.shop!; shop.slots[0].relic = id; if (shop.slots[1].relic === id) shop.slots[1].relic = 'R01';
    expect(buyFromShop(purchase, 0, shop.revision)).toBe('bought'); expect(grantRelic(purchase, id)).toBe(false);
    expect(validRun(purchase)).toBe(true); expect(createDungeonRun(42).expedition!.relics).toEqual([]);
  });
  it('includes all six in actual weighted treasure and shop pools', () => {
    const treasures = new Set<RelicId>(), shops = new Set<RelicId>();
    for (let seed = 1; seed <= 500; seed++) {
      const s = createDungeonRun(Math.imul(seed, 0x9e3779b1) >>> 0); s.phase = 'cleared'; s.expedition!.room = 6;
      const room = s.expedition!.dungeon!.rooms[6]; room.visited = room.cleared = true; prepareReward(s);
      roomReward(s)!.candidates.forEach(id => treasures.add(id)); s.phase = 'explore'; s.expedition!.room = 10;
      refreshShop(s); s.expedition!.dungeon!.rooms[10].shop!.slots.forEach(slot => { if (slot.relic) shops.add(slot.relic); });
    }
    for (const id of newIds) { expect(treasures.has(id)).toBe(true); expect(shops.has(id)).toBe(true); }
  });
});
