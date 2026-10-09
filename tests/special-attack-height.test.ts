import { describe, expect, it } from 'vitest';
import { createRun } from '../src/core/simulation';
import { advanceEnemies } from '../src/core/enemy-ai';
import { advanceSpecialEnemy } from '../src/core/enemy-special';
import type { Enemy } from '../src/core/model';

function attack(kind: 'guard' | 'shield', height: number) {
  const s = createRun(42); s.phase = 'combat';
  Object.assign(s.player, { x: 320, y: 183, height });
  const e: Enemy = { id: s.nextId++, kind, x: 298, y: 183, hp: 70, maxHp: 70, angle: 0,
    mode: kind === 'guard' ? 'charge' : 'windup', timer: 1, targetX: 346, targetY: 183, flash: 0 };
  s.enemies = [e]; return { s, e };
}

describe('special melee attack height', () => {
  it.each([
    ['guard', 0, 14], ['guard', 54, 14], ['guard', 54.01, 0], ['guard', 60, 0], ['guard', 62.5, 0],
    ['shield', 0, 12], ['shield', 50, 12], ['shield', 50.01, 0], ['shield', 60, 0], ['shield', 62.5, 0],
  ] as const)('%s at foot height %s deals %s damage', (kind, height, damage) => {
    const { s, e } = attack(kind, height);
    const hits = advanceSpecialEnemy(s, e);
    expect(hits.hits.reduce((sum, hit) => sum + hit.damage, 0)).toBe(damage);
    expect(e.mode).toBe('recover'); expect(e.timer).toBe(kind === 'guard' ? 180 : 120);
    if (kind === 'guard') expect(!!e.chargeHit).toBe(damage > 0);
  });
  it('keeps elite charge damage and cooldown when the player is on the ground', () => {
    const { s, e } = attack('guard', 0); e.elite = true;
    expect(advanceSpecialEnemy(s, e).hits[0].damage).toBeCloseTo(16.8);
    expect(e.timer).toBe(162);
  });
  it('detects the player crossing a charge between the two end positions', () => {
    const { s, e } = attack('guard', 0); e.x = 304; e.timer = 2; s.player.y = 203;
    expect(advanceEnemies(s, { x: 0, y: 2400 }, { x: 320, y: 163 }, 0)).toHaveLength(1);
  });
  it('requires horizontal and vertical charge contact at the same time', () => {
    const { s, e } = attack('guard', 55);
    expect(advanceEnemies(s, { x: 0, y: 0 }, { x: 320, y: 183 }, 53)).toEqual([]);
    expect(e.chargeHit).toBeFalsy();
  });
  it('still hits when descending into the charge before the horizontal contact', () => {
    const { s } = attack('guard', 53);
    expect(advanceEnemies(s, { x: 0, y: 0 }, { x: 320, y: 183 }, 55)).toHaveLength(1);
  });
});
