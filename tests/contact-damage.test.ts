import { describe, expect, it } from 'vitest';
import { createRun, emptyInput, step } from '../src/core/simulation';
import { createBoss } from '../src/core/boss';
import type { Enemy } from '../src/core/model';

function arena(kind: Enemy['kind'] = 'rat', gap = 16) {
  const s = createRun(42); s.phase = 'combat'; s.waveDelay = 99999;
  s.player.x = 100; s.player.y = 180;
  s.enemies = [{ id: s.nextId++, kind, x: 100 + gap, y: 180, hp: 70, maxHp: 70,
    angle: Math.PI, mode: 'recover', timer: 9999, targetX: 100, targetY: 180, flash: 0,
    frost: { freezeTicks: 9999, resistTicks: 0, hits: [] } }];
  return s;
}

describe('monster body contact', () => {
  it.each<Enemy['kind']>(['rat', 'archer', 'guard', 'shield'])('%s deals damage on body contact', kind => {
    const s = arena(kind); step(s, emptyInput());
    expect(s.player.hp).toBe(94); expect(s.stats.hits).toBe(1);
    expect(s.lastDamage).toContain('접촉'); expect(s.player.invulnerable).toBe(45);
  });
  it('uses body radii rather than the attack range', () => {
    const touching = arena('rat', 17), outside = arena('rat', 17.01);
    step(touching, emptyInput()); step(outside, emptyInput());
    expect(touching.player.hp).toBe(94); expect(outside.player.hp).toBe(100);
  });
  it('damages sustained overlap only once per 45 ticks', () => {
    const s = arena(); step(s, emptyInput());
    for (let i = 0; i < 44; i++) step(s, emptyInput());
    expect(s.player.hp).toBe(94); expect(s.stats.hits).toBe(1);
    step(s, emptyInput()); expect(s.player.hp).toBe(88); expect(s.stats.hits).toBe(2);
  });
  it('combines several contacts and projectiles into one strongest hit', () => {
    const s = arena(); s.enemies.push({ ...s.enemies[0], id: s.nextId++ });
    s.bullets.push({ id: s.nextId++, x: 100, y: 180, vx: 0, vy: 0, life: 10, owner: 'enemy', damage: 10 });
    step(s, emptyInput()); expect(s.player.hp).toBe(90); expect(s.stats.hits).toBe(1);
  });
  it('keeps charge damage stronger than simultaneous body contact', () => {
    const s = arena('guard', 18), e = s.enemies[0]; delete e.frost;
    e.mode = 'charge'; e.timer = 20; e.chargeHit = false; e.targetX = 80; e.targetY = 180;
    step(s, emptyInput()); expect(s.player.hp).toBe(86); expect(s.stats.hits).toBe(1);
    expect(s.lastDamage).toContain('돌진');
  });
  it('detects a moving monster grazing between its endpoints', () => {
    const s = arena('guard', 0), e = s.enemies[0]; delete e.frost;
    e.x = 97.5; e.y = 196.99; e.mode = 'charge'; e.timer = 20; e.angle = 0;
    e.targetX = 150; e.targetY = e.y; e.chargeHit = true;
    step(s, emptyInput()); expect(s.player.hp).toBe(94);
    expect(Math.hypot(e.x - 100, e.y - 180)).toBeGreaterThan(17);
  });
  it('detects a grazing contact between movement endpoints', () => {
    const s = arena('rat', 0); s.player.x = 97.5; s.player.y = 196.99;
    step(s, { ...emptyInput(), moveX: 1, dodge: true });
    expect(Math.hypot(s.player.x - 100, s.player.y - 180)).toBeGreaterThan(17);
    expect(s.player.hp).toBe(94);
  });
  it('protects during dodge invulnerability and exposes the first and final portions', () => {
    const safe = arena('rat', 0); safe.player.dodgeRemaining = 0.2; safe.player.dodgeX = 1;
    step(safe, emptyInput()); expect(safe.player.hp).toBe(100);
    const start = arena('rat', 0); step(start, { ...emptyInput(), moveX: 1, dodge: true });
    expect(start.player.hp).toBe(94);
    const end = arena('rat', 0); end.player.dodgeRemaining = 0.03; end.player.dodgeX = 1;
    step(end, emptyInput()); expect(end.player.hp).toBe(94);
  });
  it('does not hurt during room preparation or summon spawn grace', () => {
    const ready = arena(); ready.phase = 'ready'; ready.readyTicks = 2;
    step(ready, emptyInput()); step(ready, emptyInput()); expect(ready.player.hp).toBe(100);
    const spawned = arena(); spawned.enemies[0].frost = undefined; spawned.enemies[0].spawnTicks = 1;
    step(spawned, emptyInput()); expect(spawned.player.hp).toBe(100);
    step(spawned, emptyInput()); expect(spawned.player.hp).toBe(94);
  });
  it('ignores monsters killed in the same tick', () => {
    const s = arena('rat', 0); s.enemies[0].hp = 1;
    s.bullets.push({ id: s.nextId++, x: 100, y: 180, vx: 0, vy: 0, life: 10, owner: 'player', damage: 7 });
    step(s, emptyInput()); expect(s.enemies).toHaveLength(0); expect(s.player.hp).toBe(100);
  });
  it('uses the existing fatal-hit and revival handling', () => {
    const dead = arena(); dead.player.hp = 6; step(dead, emptyInput()); expect(dead.phase).toBe('dead');
    const s = arena(); s.player.hp = 1; s.expedition!.relics = ['R20', 'R38'];
    step(s, emptyInput()); expect(s.player.hp).toBe(1); expect(s.expedition!.relics).toEqual(['R38']);
    s.player.invulnerable = 0; step(s, emptyInput());
    expect(s.player.hp).toBe(40); expect(s.player.invulnerable).toBe(120);
  });
  it('preserves contact cooldown across snapshot restore', () => {
    const s = arena(); step(s, emptyInput()); const restored = JSON.parse(JSON.stringify(s));
    for (let i = 0; i < 50; i++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s); expect(s.player.hp).toBe(88);
  });
  it('boss contact uses its larger body and stronger damage', () => {
    const s = arena(); s.enemies = []; s.boss = createBoss(s);
    s.boss.x = 127; s.boss.y = 180; s.boss.mode = 'recover'; s.boss.timer = 72;
    step(s, emptyInput()); expect(s.player.hp).toBe(88); expect(s.lastDamage).toContain('접촉');
    s.player.invulnerable = 0; s.boss.x = 127.01;
    step(s, emptyInput()); expect(s.player.hp).toBe(88);
  });
  it('boss phase transition suppresses contact including the triggering tick', () => {
    const s = arena(); s.enemies = []; s.boss = createBoss(s);
    s.boss.x = 100; s.boss.y = 180; s.boss.hp = 901;
    s.bullets.push({ id: s.nextId++, x: 100, y: 180, vx: 0, vy: 0, life: 10, owner: 'player', damage: 7 });
    step(s, emptyInput()); expect(s.boss.mode).toBe('transition'); expect(s.player.hp).toBe(100);
    step(s, emptyInput()); expect(s.player.hp).toBe(100);
  });
});
