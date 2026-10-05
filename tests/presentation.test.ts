import { describe, expect, it } from 'vitest';
import { FixedLoop } from '../src/core/loop';
import { RenderTiming } from '../src/core/render-timing';
import { captureMotion, interpolateMotion } from '../src/game/render-motion';
import { createDungeonRun } from '../src/core/simulation';

describe('sustained simulation overload', () => {
  it('tolerates a single stall and normal frames reset the overload streak', () => {
    const loop = new FixedLoop();
    expect(loop.advance(4000, () => {})).toBe(5);
    expect(loop.shouldPause).toBe(false);
    for (let i = 0; i < 10; i++) loop.advance(120, () => {});
    loop.advance(16, () => {});
    for (let i = 0; i < 10; i++) loop.advance(120, () => {});
    expect(loop.shouldPause).toBe(false);
  });
  it('pauses after sustained overload, drops debt and restarts without catching up', () => {
    const loop = new FixedLoop(); let ticks = 0;
    for (let i = 0; i < 17; i++) expect(loop.advance(120, () => ticks++)).toBe(5);
    expect(loop.shouldPause).toBe(true); expect(ticks).toBe(85);
    loop.reset(); expect(loop.shouldPause).toBe(false);
    expect(loop.advance(17, () => ticks++)).toBe(1);
  });
  it('stops the remaining steps when a menu opens during a catch-up frame', () => {
    const loop = new FixedLoop(); let ticks = 0;
    expect(loop.advance(80, () => { ticks++; return false; })).toBe(1);
    expect(ticks).toBe(1); expect(loop.alpha).toBe(0);
  });
});

describe('render pacing and measured FPS', () => {
  it.each([60, 120, 144])('renders about 30 times per second on %i Hz without slowing the simulation', hz => {
    const timing = new RenderTiming(), sim = new FixedLoop(); let frames = 0, ticks = 0;
    timing.reset(0);
    for (let i = 1; i <= hz * 2; i++) {
      sim.advance(1000 / hz, () => ticks++);
      if (timing.due(i * 1000 / hz, 30)) { timing.rendered(i * 1000 / hz); frames++; }
    }
    expect(frames).toBe(60); expect(ticks).toBe(120); expect(timing.fps).toBeCloseTo(30, 0);
  });
  it('unlimited rendering measures the actual frame count and changing limits clears old time', () => {
    const timing = new RenderTiming(); timing.reset(0);
    for (let i = 1; i <= 120; i++) { expect(timing.due(i * 1000 / 120, 0)).toBe(true); timing.rendered(i * 1000 / 120); }
    expect(timing.fps).toBeCloseTo(120, 0);
    timing.reset(1000); expect(timing.fps).toBe(0);
    expect(timing.due(1010, 30)).toBe(false); expect(timing.due(1034, 30)).toBe(true);
  });
  it.each([[30, 60], [60, 120], [120, 240], [144, 288], [0, 288]])('a %i FPS limit keeps identical combat time over two seconds', (limit, expectedFrames) => {
    const timing = new RenderTiming(), sim = new FixedLoop(); let frames = 0, ticks = 0; timing.reset(0);
    for (let i = 1; i <= 288; i++) {
      sim.advance(1000 / 144, () => ticks++);
      if (timing.due(i * 1000 / 144, limit)) frames++;
    }
    expect(frames).toBe(expectedFrames); expect(ticks).toBe(120);
  });
});

describe('visual interpolation preserves simulation state', () => {
  it('smooths camera, jumping bodies and projectiles between the last two ticks', () => {
    const s = createDungeonRun(42); s.player.x = 100; s.player.y = 200; s.player.height = 10;
    s.enemies = [{ id: 99, kind: 'archer', x: 200, y: 200, angle: Math.PI - .1, hp: 40, maxHp: 40, mode: 'move', timer: 0, targetX: 100, targetY: 200, flash: 0 }];
    s.bullets = [{ id: 100, x: 120, y: 200, height: 30, vx: 400, vy: 0, owner: 'player', damage: 7, life: 60 }];
    const previous = captureMotion(s); s.tick++; s.player.x = 104; s.player.height = 14;
    s.enemies[0].x = 206; s.enemies[0].angle = -Math.PI + .1;
    s.bullets[0].x = 128; s.bullets[0].height = 34;
    const unchanged = structuredClone(s), visual = interpolateMotion(s, previous, .25);
    expect(visual.player.x).toBe(101); expect(visual.player.height).toBe(11);
    expect(visual.enemies.get(99)?.x).toBe(201.5);
    expect(visual.enemies.get(99)?.angle).toBeCloseTo(Math.PI - .05);
    expect(visual.bullets.get(100)?.x).toBe(122); expect(visual.bullets.get(100)?.height).toBe(31);
    expect(s).toEqual(unchanged);
  });
  it('does not interpolate room changes, teleports, missing entities or stale history', () => {
    const s = createDungeonRun(42), previous = captureMotion(s); s.tick++; s.player.x += 100;
    expect(interpolateMotion(s, previous, .5).player.x).toBe(s.player.x);
    s.expedition!.room = 1; s.player.x -= 96;
    expect(interpolateMotion(s, previous, .5).player.x).toBe(s.player.x);
    s.expedition!.room = 0; s.tick += 2;
    expect(interpolateMotion(s, previous, .5).player.x).toBe(s.player.x);
    expect(interpolateMotion(s, null, .5).player.x).toBe(s.player.x);
  });
  it('uses the current position for a newly spawned bullet and drops removed bullets', () => {
    const s = createDungeonRun(42), previous = captureMotion(s); s.tick++;
    s.bullets = [{ id: 100, x: 120, y: 200, height: 30, vx: 400, vy: 0, owner: 'player', damage: 7, life: 60 }];
    expect(interpolateMotion(s, previous, .25).bullets.get(100)?.x).toBe(120);
    const withBullet = captureMotion(s); s.tick++; s.bullets = [];
    expect(interpolateMotion(s, withBullet, .25).bullets.size).toBe(0);
  });
});
