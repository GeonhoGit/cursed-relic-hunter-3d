import { describe, expect, it } from 'vitest';
import * as timing from '../src/core/render-timing';

// A missing controller must fail as an assertion before any use of it.
const create = () => {
  expect((timing as any).AdaptiveQuality).toBeTypeOf('function');
  return new (timing as any).AdaptiveQuality();
};

describe('adaptive graphics quality', () => {
  it('lowers detail after repeated slow samples and recovers only after sustained smooth frames', () => {
    const quality = create();
    expect(quality.level).toBe(2);
    quality.sample(500, 42, true, 60);
    expect(quality.level).toBe(2);
    quality.sample(1000, 42, true, 60);
    expect(quality.level).toBe(1);
    quality.sample(1500, 35, true, 60);
    quality.sample(2000, 35, true, 60);
    expect(quality.level).toBe(0);
    quality.sample(2500, 60, true, 60);
    expect(quality.level).toBe(0);
    for (let time = 3000; time <= 31500; time += 500) {
      quality.sample(time, 60, true, 60);
      expect(quality.level).toBe(0);
    }
    quality.sample(32000, 60, true, 60);
    expect(quality.level).toBe(1);
  });

  it('backs off repeated upgrades that immediately drop below the frame target', () => {
    const quality = create(), upgrades: number[] = [];
    for (let time = 500; time <= 334000; time += 500) {
      const before = quality.level;
      // A borderline GPU sustains 60 FPS at level 1 and 45 FPS at higher detail.
      quality.sample(time, before >= 2 ? 45 : 60, true, 60);
      if (quality.level > before) upgrades.push(time);
    }
    expect(upgrades).toEqual([31000, 92000, 213000, 334000]);
  });

  it('does not count a long unsampled tab pause as sustained smooth play', () => {
    const quality = create();
    for (let time = 500; time <= 10500; time += 500) quality.sample(time, 60, true, 60);
    expect(quality.level).toBe(2);
    quality.sample(90500, 60, true, 60);
    expect(quality.level).toBe(2);
    for (let time = 91000; time <= 102000; time += 500) quality.sample(time, 60, true, 60);
    expect(quality.level).toBe(2);
    quality.sample(102500, 60, true, 60);
    expect(quality.level).toBe(3);
  });

  it('does not combine slow samples on opposite sides of a long sampling gap', () => {
    const quality = create();
    quality.sample(500, 45, true, 60);
    quality.sample(10000, 45, true, 60);
    expect(quality.level).toBe(2);
    quality.sample(10500, 45, true, 60);
    expect(quality.level).toBe(1);
  });

  it('requires a fresh smooth window after even a brief explicit menu pause', () => {
    const quality = create();
    for (let time = 500; time <= 11500; time += 500) quality.sample(time, 60, true, 60);
    quality.resetSamples();
    for (let time = 12000; time <= 23500; time += 500) {
      quality.sample(time, 60, true, 60);
      expect(quality.level).toBe(2);
    }
    quality.sample(24000, 60, true, 60);
    expect(quality.level).toBe(3);
  });

  it('preserves the recovery cooldown when a menu resets frame sampling', () => {
    const quality = create();
    quality.sample(500, 45, true, 60); quality.sample(1000, 45, true, 60);
    for (let time = 1500; time <= 10500; time += 500) quality.sample(time, 60, true, 60);
    quality.resetSamples();
    for (let time = 11000; time <= 30500; time += 500) {
      quality.sample(time, 60, true, 60);
      expect(quality.level).toBe(1);
    }
    quality.sample(31000, 60, true, 60);
    expect(quality.level).toBe(2);
  });

  it('starts sustained smooth timing at zero and supports an unlimited FPS cap', () => {
    const quality = create();
    for (let time = 0; time <= 11500; time += 500) quality.sample(time, 60, true, 0);
    quality.sample(11999, 60, true, 0);
    expect(quality.level).toBe(2);
    quality.sample(12000, 60, true, 0);
    expect(quality.level).toBe(3);
  });

  it('clears the learned retry delay when the player reselects automatic mode', () => {
    const quality = create();
    for (let time = 500; time <= 32000; time += 500) {
      quality.sample(time, quality.level >= 2 ? 45 : 60, true, 60);
    }
    expect(quality.level).toBe(1);
    quality.setMode('high');
    expect(quality.level).toBe(3);
    quality.setMode('auto');
    for (let time = 32500; time <= 44500; time += 500) quality.sample(time, 60, true, 60);
    expect(quality.level).toBe(3);
  });

  it('honors manual modes and ignores capped or inactive frame samples', () => {
    const quality = create();
    quality.setMode('low');
    expect(quality.level).toBe(0);
    quality.sample(500, 20, true, 60);
    expect(quality.level).toBe(0);
    quality.setMode('high');
    expect(quality.level).toBe(3);
    quality.setMode('auto');
    expect(quality.level).toBe(2);
    quality.sample(500, 20, false, 60);
    quality.sample(1000, 20, false, 60);
    quality.sample(1500, 20, true, 30);
    quality.sample(2000, 20, true, 30);
    expect(quality.level).toBe(2);
  });
});
