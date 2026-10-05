import { describe, expect, it } from 'vitest';
import { createRun, step, emptyInput } from '../src/core/simulation';
import { FixedLoop } from '../src/core/loop';
import { segmentCircle, segmentBox, nextWaypoint, distance, visible } from '../src/core/geometry';

function quiet() {
  const s = createRun(42);
  s.phase = 'combat';
  s.enemies = [];
  s.waveDelay = 999999;
  s.player.x = 100;
  s.player.y = 180;
  return s;
}

describe('60Hz combat', () => {
  it('an archer repositions when its bullet radius would clip a pillar corner', () => {
    const s = quiet();
    s.enemies = [{ id: 2, kind: 'archer', x: 273.12990234179927, y: 234.0136422828259,
      hp: 40, maxHp: 40, angle: -2.8456, mode: 'move', timer: 0, targetX: 96, targetY: 180, flash: 0 }];
    s.player.x = 96;
    step(s, emptyInput());
    expect(s.enemies[0].mode).toBe('move');
  });
  it('plays both waves through real shooting and awards the room once', () => {
    const s = createRun(42);
    for (let i = 0; i < 6000 && ['ready', 'combat'].includes(s.phase); i++) {
      const candidates = [...s.enemies].sort((a, b) => Number(visible(s.player, b)) - Number(visible(s.player, a)) || distance(s.player, a) - distance(s.player, b));
      const target = candidates[0] ?? { x: 500, y: 180 };
      step(s, { ...emptyInput(), aimX: target.x, aimY: target.y, fire: true });
    }
    expect(s.phase, JSON.stringify({ hp: s.player.hp, wave: s.wave, kills: s.stats.kills, enemies: s.enemies })).toBe('cleared'); expect(s.stats.kills).toBe(6); expect(s.gold).toBe(8);
  });
  it('diagonal input does not increase movement speed', () => {
    const s = quiet();
    step(s, { ...emptyInput(), moveX: 1, moveY: 1 });
    expect(Math.hypot(s.player.x - 100, s.player.y - 180)).toBeCloseTo(2.5, 8);
  });
  it('dodge travels exactly 72 units, then refuses reuse before cooldown', () => {
    const s = quiet();
    for (let i = 0; i < 15; i++) step(s, { ...emptyInput(), moveX: 1, dodge: i === 0 });
    expect(s.player.x).toBeCloseTo(172, 7);
    step(s, { ...emptyInput(), dodge: true });
    expect(s.player.dodgeRemaining).toBe(0);
  });
  it('walking and dodge cannot cross a pillar', () => {
    const s = quiet();
    s.player.x = 190; s.player.y = 130;
    for (let i = 0; i < 15; i++) step(s, { ...emptyInput(), moveX: 1, dodge: i === 0 });
    expect(s.player.x).toBeLessThanOrEqual(201);
  });
  it('held fire shoots immediately then every 0.4 seconds, regardless of render rate', () => {
    const results = [30, 60, 120, 144].map(fps => {
      const s = quiet(); const clock = new FixedLoop();
      const shotTicks: number[] = [];
      for (let frame = 0; frame < fps * 2; frame++) clock.advance(1000 / fps, () => {
        const shots = s.stats.shots;
        step(s, { ...emptyInput(), fire: true, aimX: 600, aimY: 180 });
        if (s.stats.shots > shots) shotTicks.push(s.tick);
      });
      return { tick: s.tick, shots: s.stats.shots, shotTicks };
    });
    expect(results).toEqual(Array(4).fill({ tick: 120, shots: 5, shotTicks: [1, 25, 49, 73, 97] }));
  });
  it('ready period prevents attacking and damage for 48 ticks', () => {
    const s = createRun(1);
    for (let i = 0; i < 48; i++) step(s, { ...emptyInput(), fire: true });
    expect(s.stats.shots).toBe(0);
    expect(s.player.hp).toBe(100);
    expect(s.phase).toBe('combat');
  });
  it('a serialized combat snapshot produces the same future', () => {
    const s = createRun(31);
    for (let i = 0; i < 100; i++) step(s, { ...emptyInput(), fire: true, aimX: 450, aimY: 180 });
    const restored = JSON.parse(JSON.stringify(s));
    for (let i = 0; i < 180; i++) {
      const input = { ...emptyInput(), moveY: i < 20 ? 1 : 0, fire: true, aimX: 450, aimY: 180 };
      step(s, input); step(restored, input);
    }
    expect(restored).toEqual(s);
  });
  it('multiple hits in one tick deal only the highest damage', () => {
    const s = quiet();
    s.bullets = [8, 10].map((damage, i) => ({ id: i + 100, x: 95, y: 180, vx: 320, vy: 0, life: 60, owner: 'enemy' as const, damage }));
    step(s, emptyInput());
    expect(s.player.hp).toBe(90);
    expect(s.stats.hits).toBe(1);
  });
  it('a kill clears the final wave exactly once', () => {
    const s = quiet(); s.wave = 2; s.waveDelay = 0;
    step(s, emptyInput());
    expect(s.phase).toBe('cleared');
    expect(s.gold).toBe(8);
    for (let i = 0; i < 100; i++) step(s, emptyInput());
    expect(s.gold).toBe(8);
  });
  it('a delayed browser frame never runs more than five simulation steps', () => {
    const clock = new FixedLoop(); let ticks = 0;
    clock.advance(1000, () => ticks++);
    expect(ticks).toBe(5);
    expect(clock.overloaded).toBe(true);
    clock.reset(); expect(clock.alpha).toBe(0);
  });
  it('a final lethal hit takes precedence over clearing the last enemy', () => {
    const s = quiet(); s.wave = 2; s.waveDelay = 0; s.player.hp = 10;
    s.bullets.push({ id: 501, x: 95, y: 180, vx: 320, vy: 0, life: 60, owner: 'enemy', damage: 10 });
    step(s, emptyInput());
    expect(s.phase).toBe('dead'); expect(s.gold).toBe(0);
  });
  it('dodge is vulnerable on its first tick, then protects in the specified window', () => {
    const s = quiet();
    step(s, { ...emptyInput(), dodge: true });
    s.bullets.push({ id: 501, x: s.player.x, y: s.player.y, vx: 0, vy: 300, life: 60, owner: 'enemy', damage: 10 });
    step(s, emptyInput());
    expect(s.player.hp).toBe(100);
    const firstTick = quiet();
    firstTick.bullets.push({ id: 501, x: 100, y: 185, vx: 0, vy: 0, life: 60, owner: 'enemy', damage: 10 });
    step(firstTick, { ...emptyInput(), dodge: true });
    expect(firstTick.player.hp).toBe(90);
  });
});

describe('continuous collision', () => {
  it('an enemy touching a pillar can choose a path away from the wall', () => {
    expect(nextWaypoint({ x: 250, y: 130 }, { x: 100, y: 130 }, 10)).not.toEqual({ x: 250, y: 130 });
  });
  it('an approaching rat goes around a pillar instead of remaining stuck on its edge', () => {
    const s = quiet(); s.player.y = 130;
    s.enemies = [{ id: 3, kind: 'rat', hp: 30, maxHp: 30, x: 260, y: 130, angle: Math.PI,
      mode: 'move', timer: 0, targetX: 100, targetY: 130, flash: 0 }];
    for (let i = 0; i < 450; i++) step(s, emptyInput());
    expect(distance(s.enemies[0], s.player)).toBeLessThan(30);
  });
  it('a fast bullet detects a target between its endpoints', () => {
    expect(segmentCircle(0, 0, 100, 0, 50, 0, 7)).toBeCloseTo(0.43);
    expect(segmentCircle(0, 0, 100, 0, 50, 20, 7)).toBeNull();
  });
  it('the nearest wall is detected before a target beyond it', () => {
    expect(segmentBox(0, 10, 100, 10, { x: 20, y: 0, w: 10, h: 20 }, 0)).toBeCloseTo(0.2);
  });
});
