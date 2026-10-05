import { describe, expect, it } from 'vitest';
import { createRun, emptyInput, step } from '../src/core/simulation';
import { advanceBoss, createBoss, startBossPattern } from '../src/core/boss';
import { distance, visible } from '../src/core/geometry';

function arena() {
  const s = createRun(42); s.phase = 'combat'; s.enemies = []; s.expedition!.room = 3;
  s.player.x = 96; s.player.y = 183; s.boss = createBoss(s);
  return s;
}
function advance(s: ReturnType<typeof arena>, ticks: number) {
  for (let tick = 0; tick < ticks; tick++) { s.tick++; advanceBoss(s); }
}

describe('boss pursuit', () => {
  it('rests briefly after attacking, pursues and starts the next attack on schedule', () => {
    const s = arena(), b = s.boss!; b.mode = 'recover'; b.timer = 72;
    advance(s, 12); expect(b.x).toBe(320);
    advance(s, 59); expect(b.x).toBeLessThan(260); expect(b.mode).toBe('recover');
    advance(s, 1); expect(b.pattern).toBe('charge'); expect(b.mode).toBe('windup'); expect(b.timer).toBe(60);
  });

  it('approaches while preparing a fan, then stops for the final part of its fixed aim tell', () => {
    const s = arena(), b = s.boss!, angle = b.angle;
    advance(s, 36); expect(b.x).toBeLessThan(300); expect(b.angle).toBe(angle);
    const position = { x: b.x, y: b.y }; advance(s, 11);
    expect(b).toMatchObject(position); expect(s.bullets).toHaveLength(0);
    advance(s, 1); expect(s.bullets).toHaveLength(5); expect(b).toMatchObject(position);
  });

  it('approaches during shield defense without rotating its protected direction', () => {
    const s = arena(), b = s.boss!; startBossPattern(s, 'shield'); const angle = b.angle;
    advance(s, 60); expect(b.x).toBeLessThan(285); expect(b.angle).toBe(angle); expect(b.mode).toBe('shield');
  });

  it.each(['charge', 'rocks'] as const)('keeps the %s warning position and target fixed', pattern => {
    const s = arena(), b = s.boss!; startBossPattern(s, pattern);
    const warning = { x: b.x, y: b.y, angle: b.angle, targetX: b.targetX, targetY: b.targetY, rocks: structuredClone(b.rocks) };
    advance(s, b.timer - 1); expect(b).toMatchObject(warning);
  });

  it('stays still during the phase transition', () => {
    const s = arena(), b = s.boss!; b.stage = 2; b.mode = 'transition'; b.timer = 60; b.transitionTick = s.tick;
    advance(s, 59); expect(b).toMatchObject({ x: 320, y: 183, mode: 'transition' });
  });

  it('stops outside body contact when already close', () => {
    const s = arena(), b = s.boss!; s.player.x = 250; b.mode = 'recover'; b.timer = 50;
    advance(s, 40); expect(distance(b, s.player)).toBeCloseTo(64); expect(s.player.hp).toBe(100);
  });

  it('routes its large body around pillars to reach the player', () => {
    const s = arena(), b = s.boss!; b.x = 300; b.y = 125; s.player.x = 100; s.player.y = 125;
    startBossPattern(s, 'shield');
    for (let tick = 0; tick < 450; tick++) {
      advance(s, 1); expect(visible(b, b, 19.999)).toBe(true);
    }
    expect(distance(b, s.player)).toBeLessThan(100);
  });

  it('keeps pursuing a player pressed into a corner instead of choosing an unreachable destination', () => {
    const s = arena(), b = s.boss!; s.player.x = 39; s.player.y = 49;
    const initial = distance(b, s.player);
    for (let tick = 0; tick < 120; tick++) { b.mode = 'recover'; b.timer = 50; advance(s, 1); expect(visible(b, b, 19.999)).toBe(true); }
    expect(distance(b, s.player)).toBeLessThan(initial - 90);
  });

  it('pursues faster in stage two and applies the existing frost slow', () => {
    const first = arena(), second = arena(), frozen = arena();
    for (const s of [first, second, frozen]) { s.boss!.mode = 'recover'; s.boss!.timer = 50; }
    second.boss!.stage = 2; second.boss!.summonsDone = true;
    frozen.boss!.frost = { hits: [], freezeTicks: 2, resistTicks: 20 };
    advance(first, 1); advance(second, 1); advance(frozen, 1);
    expect(320 - second.boss!.x).toBeGreaterThan(320 - first.boss!.x);
    expect(320 - frozen.boss!.x).toBeCloseTo((320 - first.boss!.x) * 0.8);
  });

  it('preserves the pursuit and following attacks across a saved position', () => {
    const s = arena(); s.boss!.mode = 'recover'; s.boss!.timer = 60; advance(s, 20);
    const restored = JSON.parse(JSON.stringify(s)) as typeof s;
    for (let tick = 0; tick < 250; tick++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s);
  });
});
