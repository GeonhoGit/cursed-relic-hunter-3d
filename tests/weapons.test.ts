import { describe, expect, it } from 'vitest';
import { createDungeonRun, emptyInput, step } from '../src/core/simulation';
import { defaultProfile, beginGrowthRun, emptyInvestment, growthStats } from '../src/core/growth';
import { WEAPONS, selectedWeapon, weaponUnlocked } from '../src/core/weapons';
import { frostHit, splitShot } from '../src/core/projectile-effects';
import type { Bullet, Enemy } from '../src/core/model';

const fire = { ...emptyInput(), fire: true, aimX: 500, aimY: 180 };
function shotgun() { const s = createDungeonRun(42); s.weapon = 'W02' as const; s.player.x = 96; s.player.y = 180; return s; }
const target = (): Enemy => ({ id: 900, kind: 'archer', x: 150, y: 180, hp: 100, maxHp: 100, angle: 0, mode: 'windup', timer: 999, targetX: 0, targetY: 0, flash: 0 });

describe('weapon selection and volleys', () => {
  it('unlocks only after a recorded gatekeeper victory and defaults legacy preferences to W01', () => {
    const p = defaultProfile(); expect(selectedWeapon(p)).toBe('W01'); expect(weaponUnlocked(p, 'W02')).toBe(false);
    p.bossDefeated = true; expect(weaponUnlocked(p, 'W02')).toBe(true); p.selectedWeapon = 'W02'; expect(selectedWeapon(p)).toBe('W02');
    p.bossDefeated = false; expect(selectedWeapon(p)).toBe('W01');
  });
  it('fires five unique pellets in one event with a symmetric 22 degree spread and 36 tick cadence', () => {
    const s = shotgun(); step(s, fire);
    expect(s.bullets).toHaveLength(5); expect(new Set(s.bullets.map(b => b.id)).size).toBe(5);
    expect(new Set(s.bullets.map(b => b.eventId)).size).toBe(1); expect(s.stats.shots).toBe(1);
    s.bullets.forEach((b, i) => { expect(b.damage).toBe(2.5); expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(280); expect(Math.atan2(b.vy, b.vx) * 180 / Math.PI).toBeCloseTo(-11 + i * 5.5); });
    for (let t = 0; t < 35; t++) step(s, fire); expect(s.stats.shots).toBe(1);
    step(s, fire); expect(s.stats.shots).toBe(2);
  });
  it('preserves W01 and applies investment to the selected weapon without rounding away low speed investment', () => {
    expect(growthStats(createDungeonRun(42))).toMatchObject({ damage: 7, fireInterval: 24 });
    const s = shotgun(); beginGrowthRun(s, { ...emptyInvestment(), attack: 1, speed: 1 }, 'weapon-growth');
    step(s, fire); expect(s.bullets[0].damage).toBeCloseTo(2.5125);
    expect(growthStats(s).fireInterval).toBeCloseTo(36 / 1.005);
    for (let t = 1; t < 3600; t++) step(s, fire); expect(s.stats.shots).toBe(101);
    expect(WEAPONS.W02.damage * 5 / 0.6).toBeLessThan(1.25 * 7 / 0.4);
  });
  it('counts frost once per target per volley even when all pellets and their return hit', () => {
    const s = shotgun(), e = target(); s.expedition!.relics = ['R08']; step(s, fire);
    for (const b of s.bullets) { frostHit(s, e, b); frostHit(s, e, { ...b, phase: 'return' }); }
    expect(e.frost!.hits).toHaveLength(1); expect(e.frost!.freezeTicks).toBe(0);
    for (let volley = 1; volley < 4; volley++) {
      s.player.fireCooldown = 0; step(s, fire); for (const b of s.bullets) frostHit(s, e, b);
    }
    expect(e.frost!.freezeTicks).toBe(36);
  });
  it('allows only three split children per volley across different ticks, targets and a snapshot restore', () => {
    const s = shotgun(); s.expedition!.relics = ['R03', 'R02', 'R01']; step(s, fire);
    const pending: Bullet[] = []; splitShot(s, s.bullets[0], target(), pending);
    expect(pending).toHaveLength(3); expect(pending[0].damage).toBeCloseTo(0.875); expect(pending[0].bouncesLeft).toBe(2);
    const restored = structuredClone(s); restored.bullets.shift(); restored.tick++;
    const later: Bullet[] = []; for (const b of restored.bullets) splitShot(restored, b, { ...target(), id: 901 }, later);
    expect(later).toHaveLength(0);
    restored.player.fireCooldown = 0; step(restored, fire);
    for (const b of restored.bullets) splitShot(restored, b, target(), later); expect(later).toHaveLength(3);
  });
  it('makes close shots stronger while spread reduces hits at range', () => {
    const damages = [32, 170].map(distance => {
      const s = shotgun(); s.phase = 'combat'; s.waveDelay = 99999;
      const e = target(); e.x = s.player.x + distance; s.enemies = [e]; step(s, fire);
      for (let tick = 0; tick < 42; tick++) step(s, emptyInput());
      return 100 - e.hp;
    });
    expect(damages[0]).toBe(12.5); expect(damages[1]).toBeLessThan(damages[0]); expect(damages[1]).toBeGreaterThan(0);
  });
});
