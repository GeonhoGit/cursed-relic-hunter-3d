import { describe, expect, it } from 'vitest';
import { createRun, emptyInput, step } from '../src/core/simulation';
import { chooseRelic } from '../src/core/expedition';
import { advanceProjectiles } from '../src/core/combat';
import type { RelicId } from '../src/core/model';

function room(relics: RelicId[] = []) {
  const s = createRun(42); s.phase = 'combat'; s.player.x = 320; s.player.y = 180;
  s.enemies = []; s.waveDelay = 99999;
  s.expedition!.relics = [...relics]; s.expedition!.acquired = [...relics]; return s;
}
function acquire(s: ReturnType<typeof room>) {
  s.phase = 'cleared'; s.expedition!.reward = { room: 0, candidates: ['R25'], choice: null };
  expect(chooseRelic(s, 'R25')).toBe(true); s.expedition!.reward = null; s.phase = 'combat';
}
function arrow(s: ReturnType<typeof room>, degrees = 0, boss = false) {
  const a = degrees * Math.PI / 180;
  s.bullets.push({ id: s.nextId++, x: s.player.x + Math.cos(a) * 8, y: s.player.y + Math.sin(a) * 8,
    vx: -Math.cos(a) * 210, vy: -Math.sin(a) * 210, owner: 'enemy', damage: 10, life: 100,
    ...(boss ? { source: 'gatekeeper' as const } : {}) });
}

describe('dodge relics', () => {
  it('preserves an available charge on acquisition and earns the second only after 96 ticks', () => {
    const s = room(); acquire(s);
    expect(s.player.dodgeCharges).toBe(1); expect(s.player.dodgeCooldown).toBe(96);
    for (let i = 0; i < 95; i++) step(s, emptyInput());
    expect(s.player.dodgeCharges).toBe(1); step(s, emptyInput());
    expect(s.player.dodgeCharges).toBe(2); expect(s.player.dodgeCooldown).toBe(0);
  });
  it('does not give a charge or reset a partially completed recharge on acquisition', () => {
    const s = room(); s.player.dodgeCooldown = 37; acquire(s);
    expect(s.player.dodgeCharges).toBe(0); expect(s.player.dodgeCooldown).toBe(37);
    for (let i = 0; i < 37; i++) step(s, emptyInput());
    expect(s.player.dodgeCharges).toBe(1); expect(s.player.dodgeCooldown).toBe(96);
  });
  it('allows two separate dodges, blocks a third, and recharges one at a time without restarting the timer', () => {
    const s = room(); acquire(s); for (let i = 0; i < 96; i++) step(s, emptyInput());
    step(s, { ...emptyInput(), dodge: true, moveX: 1 }); const start = s.player.x;
    expect(s.player.dodgeCharges).toBe(1); expect(s.player.dodgeCooldown).toBe(96);
    for (let i = 0; i < 14; i++) step(s, { ...emptyInput(), dodge: true });
    expect(s.stats.dodges).toBe(1); expect(s.player.x - start).toBeCloseTo(67);
    step(s, { ...emptyInput(), dodge: true, moveX: -1 });
    expect(s.stats.dodges).toBe(2); expect(s.player.dodgeCharges).toBe(0); expect(s.player.dodgeCooldown).toBe(81);
    for (let i = 0; i < 20; i++) step(s, { ...emptyInput(), dodge: true });
    expect(s.stats.dodges).toBe(2);
    for (let i = 0; i < 61; i++) step(s, emptyInput());
    expect(s.player.dodgeCharges).toBe(1); expect(s.player.dodgeCooldown).toBe(96);
    for (let i = 0; i < 96; i++) step(s, emptyInput());
    expect(s.player.dodgeCharges).toBe(2); expect(s.player.dodgeCooldown).toBe(0);
  });
  it('keeps the original single-charge cooldown when the relic is absent', () => {
    const s = room(); step(s, { ...emptyInput(), dodge: true });
    for (let i = 0; i < 95; i++) step(s, { ...emptyInput(), dodge: true });
    expect(s.stats.dodges).toBe(1); step(s, { ...emptyInput(), dodge: true }); expect(s.stats.dodges).toBe(2);
  });
  it.each([0, 45, -45, 45.1, -45.1, 180])('reflects only the forward 90 degrees of the dodge, angle %s', degrees => {
    const s = room(['R30']); s.player.dodgeRemaining = 0.2; s.player.dodgeX = 1; s.player.dodgeY = 0; s.player.aim = Math.PI;
    arrow(s, degrees); const hits = advanceProjectiles(s), reflected = Math.abs(degrees) <= 45;
    expect(hits).toHaveLength(reflected ? 0 : 1);
    expect(s.player.parryUsed ?? false).toBe(reflected);
    if (reflected) { expect(s.bullets[0].kind).toBe('reflected'); expect(s.bullets[0].damage).toBe(15); }
  });
  it.each([0, 0.1, 0.10001])('respects the opening 0.10 second parry window at %s seconds', elapsed => {
    const s = room(['R30']); s.player.dodgeRemaining = 0.24 - elapsed; s.player.dodgeX = 1; s.player.dodgeY = 0;
    arrow(s); expect(advanceProjectiles(s)).toHaveLength(elapsed <= 0.1 ? 0 : 1);
  });
  it('reflects only one arrow per dodge, resets on the next dodge and excludes boss projectiles', () => {
    const s = room(['R30']); s.player.dodgeRemaining = 0.2; s.player.dodgeX = 1; s.player.dodgeY = 0;
    arrow(s); arrow(s); expect(advanceProjectiles(s)).toHaveLength(1); expect(s.bullets).toHaveLength(1);
    s.bullets = []; s.player.dodgeRemaining = 0; step(s, { ...emptyInput(), dodge: true, moveX: 1 });
    expect(s.player.parryUsed).toBe(false); arrow(s, 0, true);
    expect(advanceProjectiles(s)).toHaveLength(1); expect(s.player.parryUsed).toBe(false);
  });
  it('hits once for 15 without applying any projectile relic effects', () => {
    const s = room(['R01', 'R02', 'R03', 'R04', 'R07', 'R08', 'R30']);
    s.player.dodgeRemaining = 0.2; s.player.dodgeX = 1; s.player.dodgeY = 0;
    s.enemies = [360, 390].map(x => ({ id: s.nextId++, kind: 'archer', x, y: 180, hp: 40, maxHp: 40,
      angle: 0, mode: 'move', timer: 0, targetX: 320, targetY: 180, flash: 0 }));
    arrow(s); advanceProjectiles(s);
    for (let i = 0; i < 30; i++) { s.tick++; advanceProjectiles(s); }
    expect(s.enemies.map(e => e.hp)).toEqual([25, 40]); expect(s.stats.damage).toBe(15);
    expect(s.enemies[0].burnTicks).toBeUndefined(); expect(s.enemies[0].frost).toBeUndefined(); expect(s.bullets).toHaveLength(0);
  });
  it('does not reflect outside a dodge even while facing an arrow', () => {
    const s = room(['R30']); arrow(s); expect(advanceProjectiles(s)).toHaveLength(1);
  });
});
