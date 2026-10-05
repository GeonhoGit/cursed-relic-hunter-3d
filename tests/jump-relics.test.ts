import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDungeonRun, emptyInput, step, travel } from '../src/core/simulation';
import { grantRelic } from '../src/core/relic-acquisition';
import { chooseRelic, prepareReward } from '../src/core/expedition';
import { adjacentRooms } from '../src/core/dungeon';
import { buyFromShop, refreshShop } from '../src/core/shop';
import { defaultSettings, SaveStore, validRun } from '../src/persistence/save';
import type { Enemy, RelicId } from '../src/core/model';
import { createBoss } from '../src/core/boss';

const jumpIds = ['R44', 'R45', 'R46'] as const;
function run(ids: RelicId[] = []) {
  const s = createDungeonRun(42); s.view = { yaw: 0, pitch: 0 };
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
const input = () => ({ ...emptyInput(), jump: true });
function enemy(id: number, x: number, y: number, hp = 30): Enemy {
  return { id, kind: 'rat', x, y, hp, maxHp: 30, angle: 0, mode: 'recover', timer: 300, targetX: x, targetY: y, flash: 0 };
}
function falling(s: ReturnType<typeof run>) { s.player.height = 0.1; s.player.jumpVelocity = -10; }

describe('jump relics', () => {
  it('boots reach 1.5m without changing movement or granting invulnerability', () => {
    const s = run(['R45']); let apex = 0;
    for (let i = 0; i < 60; i++) { step(s, { ...emptyInput(), moveX: 1, jump: i === 0 }); apex = Math.max(apex, s.player.height ?? 0); }
    expect(apex * 0.04).toBeCloseTo(1.5, 1); expect(s.player.x).toBeCloseTo(470);
    expect(s.player.invulnerable).toBe(0); expect(s.stats.dodges).toBe(0);
  });
  it('feather allows exactly one air jump and recharges only on landing', () => {
    const s = run(['R44']); step(s, input());
    for (let i = 0; i < 22; i++) step(s, emptyInput());
    expect(s.player.jumpVelocity).toBeLessThan(0); step(s, input());
    expect(s.player.jumpVelocity).toBeGreaterThan(140); expect(s.player.airJumpUsed).toBe(true);
    const ordinary = structuredClone(s); step(s, input()); step(ordinary, emptyInput()); expect(s.player).toEqual(ordinary.player);
    for (let i = 0; i < 80; i++) step(s, emptyInput());
    expect(s.player.height).toBe(0); expect(s.player.airJumpUsed).toBeUndefined();
    step(s, input()); step(s, input()); expect(s.player.airJumpUsed).toBe(true);
  });
  it('caps the combined height at 2.5m and keeps the full fall and relic loss saveable', () => {
    const s = run(['R44', 'R45']); let apex = 0, fastFall = false;
    for (let i = 0; i < 90; i++) {
      step(s, { ...emptyInput(), jump: i === 0 || i === 24 });
      apex = Math.max(apex, s.player.height ?? 0);
      if (i === 35) s.expedition!.relics = []; // Losing the relics in midair must not invalidate the flight.
      fastFall ||= (s.player.jumpVelocity ?? 0) < -194;
      expect(validRun(s), `tick ${i}`).toBe(true); expect(s.player.height! * 0.04).toBeLessThanOrEqual(2.5);
    }
    expect(apex * 0.04).toBeCloseTo(2.5); expect(fastFall).toBe(true); expect(s.player.height).toBe(0);
  });
  it('lands with damage 12 in 1.5m, excludes targets behind walls or outside range, and awards kills once', () => {
    const s = run(['R46']); s.phase = 'combat'; s.expedition!.room = 1;
    s.expedition!.dungeon!.rooms[1].template = 0;
    delete s.expedition!.dungeon!.rooms[1].structure; // Four-pillar occlusion fixture.
    s.player.x = 201; s.player.y = 115; s.enemies = [enemy(s.nextId++, 190, 140, 12), enemy(s.nextId++, 201, 77), enemy(s.nextId++, 217, 104)];
    falling(s); step(s, emptyInput());
    expect(s.stats.kills).toBe(1); expect(s.stats.damage).toBe(12);
    expect(s.enemies.map(e => e.hp)).toEqual([30, 30]);
    expect(s.cues.filter(c => c.kind === 'stomp')).toHaveLength(1); expect(s.player.stompCooldown).toBe(180);
    expect(s.player.hp).toBe(100);
  });
  it('uses the landing position after movement, with no burn, freeze or shield requirement', () => {
    const s = run(['R46', 'R07', 'R08']); s.phase = 'combat'; s.expedition!.room = 1;
    const e = { ...enemy(s.nextId++, 360, 183), kind: 'shield' as const, hp: 70, maxHp: 70, shieldHp: 35 };
    s.enemies = [e]; falling(s); step(s, { ...emptyInput(), moveX: 1 });
    expect(e.hp).toBe(58); expect(e.shieldHp).toBe(35); expect(e.burnTicks).toBeUndefined(); expect(e.frost).toBeUndefined();
  });
  it('does not fire while grounded or on a room transition and keeps a 3s recharge', () => {
    const s = run(['R46']); step(s, emptyInput()); expect(s.cues).toHaveLength(0);
    falling(s); step(s, emptyInput()); expect(s.player.stompCooldown).toBe(180);
    for (let i = 0; i < 20; i++) step(s, emptyInput());
    falling(s); step(s, emptyInput()); expect(s.player.stompCooldown).toBe(159); expect(s.cues.filter(c => c.kind === 'stomp')).toHaveLength(1);
    for (let i = 0; i < 159; i++) step(s, emptyInput());
    falling(s); step(s, emptyInput()); expect(s.player.stompCooldown).toBe(180);
    step(s, input()); travel(s, adjacentRooms(s)[0].direction);
    expect(s.player.height).toBeUndefined(); expect(s.player.airJumpUsed).toBeUndefined(); expect(s.cues).toHaveLength(0);
    expect(s.player.stompCooldown).toBe(179);
  });
  it('damages the boss, respects transition immunity, and completes a landing kill once', () => {
    const s = run(['R46']); s.phase = 'combat'; s.expedition!.room = 8;
    s.boss = createBoss(s); Object.assign(s.boss, { x: 350, y: 183, hp: 907, mode: 'recover', timer: 72 });
    falling(s); step(s, emptyInput()); expect(s.boss.hp).toBe(895); expect(s.boss.mode).toBe('transition');
    expect(s.stats.damage).toBe(12); expect(s.player.hp).toBe(100);
    s.player.stompCooldown = 0; falling(s); step(s, emptyInput()); expect(s.boss.hp).toBe(895); expect(s.stats.damage).toBe(12);
    Object.assign(s.boss, { hp: 10, mode: 'recover', timer: 72, summonsDone: true });
    s.player.stompCooldown = 0; falling(s); step(s, emptyInput());
    expect(s.phase).toBe('cleared'); expect(s.stats.kills).toBe(1); expect(s.gold).toBe(40);
    step(s, emptyInput()); expect(s.stats.kills).toBe(1); expect(s.gold).toBe(40);
  });
  it('restores airborne usage and recharge without allowing an extra jump', async () => {
    const s = run([...jumpIds]); step(s, input());
    for (let i = 0; i < 24; i++) step(s, emptyInput()); step(s, input());
    s.player.stompCooldown = 120;
    const store = new SaveStore('jump-relic-air'); await store.load(); await store.save(s, defaultSettings());
    const restored = (await store.load())!.run!, baseline = structuredClone(s);
    step(restored, input()); step(baseline, emptyInput()); expect(restored).toEqual(baseline);
    for (let i = 0; i < 90; i++) step(restored, emptyInput());
    expect(restored.player.height).toBe(0); expect(restored.player.stompCooldown).toBeGreaterThan(0);
    for (const invalid of [{ airJumpUsed: 'yes' }, { airJumpUsed: true, height: 0, jumpVelocity: 0 }, { stompCooldown: -1 }, { stompCooldown: 181 }, { height: 63, jumpVelocity: 0 }]) {
      const bad = structuredClone(restored); Object.assign(bad.player, invalid); expect(validRun(bad)).toBe(false);
    }
  });
  it('offers all three in treasure pools and grants them through treasure choice and shop purchase', () => {
    const offered = new Set<RelicId>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = createDungeonRun(seed); s.expedition!.room = 6; s.phase = 'cleared';
      const room = s.expedition!.dungeon!.rooms[6]; room.visited = room.cleared = true;
      prepareReward(s); room.reward!.candidates.forEach(id => offered.add(id));
    }
    expect(jumpIds.every(id => offered.has(id))).toBe(true);
    for (const id of jumpIds) {
      const s = run(); s.expedition!.room = 6; s.phase = 'cleared'; const room = s.expedition!.dungeon!.rooms[6];
      room.visited = room.cleared = true; room.reward = { room: 6, candidates: [id], choice: null };
      expect(chooseRelic(s, id)).toBe(true); expect(validRun(s)).toBe(true);
      const shopRun = run(); shopRun.expedition!.room = 10; const shopRoom = shopRun.expedition!.dungeon!.rooms[10]; shopRoom.visited = shopRoom.cleared = true;
      shopRun.gold = 24; refreshShop(shopRun); const shop = shopRoom.shop!;
      shop.slots[0].relic = id; if (shop.slots[1].relic === id) shop.slots[1].relic = 'R01';
      expect(buyFromShop(shopRun, 0, shop.revision)).toBe('bought'); expect(shopRun.expedition!.relics).toContain(id); expect(validRun(shopRun)).toBe(true);
    }
  });
});
