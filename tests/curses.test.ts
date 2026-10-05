import { describe, expect, it } from 'vitest';
import { createDungeonRun, createRun, emptyInput, step, travel } from '../src/core/simulation';
import { chooseRelic, leaveAltar, prepareReward, roomReward } from '../src/core/expedition';
import { activeAuxiliary, equipAuxiliary, useAuxiliary } from '../src/core/auxiliary';
import { reviveContract } from '../src/core/curses';
import { advanceProjectiles } from '../src/core/combat';
import { adjacentRooms } from '../src/core/dungeon';
import { createBoss } from '../src/core/boss';
import type { RelicId } from '../src/core/model';

function arena(relics: RelicId[] = []) {
  const s = createRun(42); s.phase = 'combat'; s.player.x = 320; s.player.y = 180;
  s.enemies = []; s.waveDelay = 99999;
  s.expedition!.relics = [...relics]; s.expedition!.acquired = [...relics]; return s;
}
function arrow(s: ReturnType<typeof arena>, x: number, boss = false) {
  s.bullets.push({ id: s.nextId++, x, y: 180, vx: -210, vy: 0, life: 100, owner: 'enemy', damage: 10,
    ...(boss ? { source: 'gatekeeper' as const } : {}) });
}
function enemy(s: ReturnType<typeof arena>, x: number) {
  s.enemies.push({ id: s.nextId++, kind: 'archer', x, y: 180, hp: 40, maxHp: 40,
    mode: 'windup', timer: 27, angle: 0, targetX: 320, targetY: 180, flash: 0 });
}

describe('curse altar', () => {
  it('adds one safe optional altar while retaining the existing room ids', () => {
    const s = createDungeonRun(2), rooms = s.expedition!.dungeon!.rooms;
    expect(rooms).toHaveLength(11); expect(rooms[8].kind).toBe('boss'); expect(rooms[9].kind).toBe('altar');
    const from = adjacentRooms(s, 9)[0].room; from.visited = from.cleared = true; s.expedition!.room = from.id;
    expect(travel(s, adjacentRooms(s).find(d => d.room.id === 9)!.direction)).toBe(true);
    expect(s.phase).toBe('cleared'); expect(s.enemies).toHaveLength(0); expect(s.gold).toBe(0);
    expect(roomReward(s)?.candidates).toEqual(['R38', 'R43']);
    expect(chooseRelic(s, 'R38')).toBe(false); expect(leaveAltar(s)).toBe(true); expect(s.phase).toBe('explore');
    expect(roomReward(s)?.choice).toBeNull();
    travel(s, adjacentRooms(s)[0].direction); travel(s, adjacentRooms(s).find(d => d.room.id === 9)!.direction);
    expect(s.phase).toBe('cleared'); s.expedition!.relics = ['R01', 'R02']; s.expedition!.acquired = ['R01', 'R02'];
    expect(chooseRelic(s, 'R38')).toBe(true); expect(s.phase).toBe('explore');
    expect(chooseRelic(s, 'R43')).toBe(false);
  });
  it('never rolls curses in ordinary treasure rewards', () => {
    for (let seed = 1; seed < 32; seed++) {
      const s = createRun(seed); s.phase = 'cleared'; prepareReward(s);
      expect(roomReward(s)!.candidates.some(id => id === 'R38' || id === 'R43')).toBe(false);
    }
  });
});
describe('dead king contract', () => {
  it('revives before resolving a simultaneous fatal hit and boss kill, granting the final reward once', () => {
    const s = arena(['R38', 'R01', 'R02']); s.expedition!.room = 3; s.boss = createBoss(s);
    s.boss.hp = 7; s.boss.mode = 'recover'; s.boss.timer = 60; s.player.hp = 1;
    arrow(s, 320); s.bullets.push({ id: s.nextId++, x: s.boss.x, y: s.boss.y, vx: 0, vy: 0, life: 30, owner: 'player', damage: 7 });
    step(s, emptyInput()); expect(s.phase).toBe('cleared'); expect(s.player.hp).toBe(40);
    expect(s.revival!.lost).toHaveLength(2); expect(s.gold).toBe(40);
    step(s, emptyInput()); expect(s.gold).toBe(40);
  });
  it('consumes bandage before contract, then revives once with deterministic loss', () => {
    const s = arena(['R20', 'R38', 'R01', 'R02', 'R03']); s.player.hp = 1; arrow(s, 320);
    step(s, emptyInput()); expect(s.player.hp).toBe(1); expect(s.expedition!.relics).toContain('R38');
    s.player.invulnerable = 0; arrow(s, 320); step(s, emptyInput());
    expect(s.player.hp).toBe(40); expect(s.player.invulnerable).toBe(120);
    expect(s.revival!.lost).toHaveLength(2); expect(s.expedition!.relics).toHaveLength(1);
    expect(s.expedition!.acquired).toHaveLength(5);
    s.player.hp = 1; s.player.invulnerable = 0; arrow(s, 320); step(s, emptyInput()); expect(s.phase).toBe('dead');
  });
  it('clears a lost auxiliary, its bomb, and excess dodge charges without auto-equipping a replacement', () => {
    const s = arena(['R38', 'R13', 'R25', 'R43']); s.player.equippedAux = 'R13'; s.player.dodgeCharges = 2;
    s.bombs = [{ id: s.nextId++, x: 360, y: 180, ticks: 30 }]; s.player.hp = 0;
    expect(reviveContract(s)).toBe(true); expect(s.revival!.lost.sort()).toEqual(['R13', 'R25']);
    expect(s.bombs).toBeUndefined(); expect(s.player.dodgeCharges).toBe(1); expect(activeAuxiliary(s)).toBeNull();
    expect(s.expedition!.relics).toEqual(['R43']);
  });
  it('still revives when fewer than two normal relics remain, and consumes no extra RNG for missing relics', () => {
    const s = arena(['R38']); s.player.hp = 0; const rng = s.rng;
    expect(reviveContract(s)).toBe(true); expect(s.revival!.lost).toEqual([]); expect(s.rng).toBe(rng);
    expect(reviveContract(s)).toBe(false);
  });
});
describe('time debt and auxiliary equipment', () => {
  it('allows an already-ready bomb during debt, advances its fuse, and keeps its recharge blocked', () => {
    const s = arena(['R13', 'R43']); s.player.equippedAux = 'R13'; s.timeDebt = 5;
    step(s, { ...emptyInput(), auxiliary: true });
    for (let i = 0; i < 4; i++) step(s, emptyInput());
    expect(s.timeDebt).toBe(0); expect(s.player.auxCooldown).toBe(480); expect(s.bombs![0].ticks).toBe(56);
    step(s, emptyInput()); expect(s.player.auxCooldown).toBe(479); expect(s.bombs![0].ticks).toBe(55);
  });
  it('stops only captured normal enemies and bullets, keeping burn clocks and boss arrows running', () => {
    const s = arena(['R43']); s.player.equippedAux = 'R43'; enemy(s, 400); enemy(s, 550);
    s.enemies[0].burnTicks = 60; s.enemies[0].burnPulse = 30;
    arrow(s, 420); arrow(s, 430, true); arrow(s, 560);
    step(s, { ...emptyInput(), auxiliary: true });
    expect(s.timeStop!.ticks).toBe(89); expect(s.enemies[0].timer).toBe(27); expect(s.enemies[1].timer).toBe(26);
    expect(s.enemies[0].burnTicks).toBe(59); expect(s.bullets[0].x).toBe(420); expect(s.bullets[0].life).toBe(100);
    expect(s.bullets[1].x).toBeLessThan(430); expect(s.bullets[2].x).toBeLessThan(560);
    arrow(s, 440); step(s, emptyInput()); expect(s.bullets.at(-1)!.x).toBeLessThan(440);
  });
  it('frozen arrows remain dangerous on contact and can be parried', () => {
    const s = arena(['R43', 'R30']); s.player.equippedAux = 'R43'; arrow(s, 328);
    useAuxiliary(s, s.player); expect(advanceProjectiles(s)).toHaveLength(1);
    arrow(s, 328); s.timeStop!.bulletIds.push(s.bullets[0].id);
    s.player.dodgeRemaining = 0.2; s.player.dodgeX = 1; s.player.dodgeY = 0;
    expect(advanceProjectiles(s)).toHaveLength(0); expect(s.bullets[0].kind).toBe('reflected');
  });
  it('stops for exactly 90 ticks then blocks both recharges for exactly 180 ticks', () => {
    const s = arena(['R43', 'R13']); s.player.equippedAux = 'R43'; s.player.auxCooldown = 400;
    step(s, { ...emptyInput(), auxiliary: true });
    for (let i = 0; i < 89; i++) step(s, emptyInput());
    expect(s.timeStop).toBeUndefined(); expect(s.timeDebt).toBe(180);
    const bomb = s.player.auxCooldown, time = s.player.timeCooldown;
    for (let i = 0; i < 180; i++) step(s, emptyInput());
    expect(s.timeDebt).toBe(0); expect(s.player.auxCooldown).toBe(bomb); expect(s.player.timeCooldown).toBe(time);
    step(s, emptyInput()); expect(s.player.auxCooldown).toBe(bomb! - 1); expect(s.player.timeCooldown).toBe(time! - 1);
  });
  it('preserves debt and cooldowns across swaps and room changes, and forbids combat swaps', () => {
    const s = createDungeonRun(2); s.expedition!.relics = ['R13', 'R43']; s.expedition!.acquired = ['R13', 'R43'];
    expect(activeAuxiliary(s)).toBe('R13'); expect(equipAuxiliary(s, 'R43')).toBe(true);
    expect(useAuxiliary(s, s.player)).toBe(true); s.player.auxCooldown = 123;
    travel(s, adjacentRooms(s)[0].direction); expect(s.timeStop).toBeUndefined(); expect(s.timeDebt).toBe(180);
    expect(s.player.timeCooldown).toBe(1080); expect(equipAuxiliary(s, 'R13')).toBe(false);
    s.phase = 'explore'; expect(equipAuxiliary(s, 'R13')).toBe(true);
    expect(s.player.auxCooldown).toBe(123); expect(s.timeDebt).toBe(180);
  });
  it('auto-equips only the first auxiliary on acquisition', () => {
    const s = arena(); s.phase = 'cleared'; s.expedition!.reward = { room: 0, candidates: ['R43'], choice: null };
    expect(chooseRelic(s, 'R43')).toBe(true); expect(activeAuxiliary(s)).toBe('R43');
    s.expedition!.reward = { room: 0, candidates: ['R13'], choice: null };
    expect(chooseRelic(s, 'R13')).toBe(true); expect(activeAuxiliary(s)).toBe('R43');
  });
});
