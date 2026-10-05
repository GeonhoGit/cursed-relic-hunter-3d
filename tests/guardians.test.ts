import { describe, expect, it } from 'vitest';
import { createDungeonRun, createRun, emptyInput, step } from '../src/core/simulation';
import { roomInfo } from '../src/core/expedition';
import { BOUNDS, type Enemy, type RunState } from '../src/core/model';
import { advanceProjectiles } from '../src/core/combat';

function arena(kind: 'guard' | 'shield') {
  const s = createRun(42); s.phase = 'combat'; s.player.x = 320; s.player.y = 180;
  s.enemies = [{ id: s.nextId++, kind, x: 140, y: 180, hp: kind === 'guard' ? 65 : 70, maxHp: kind === 'guard' ? 65 : 70,
    angle: 0, mode: 'move', timer: 0, targetX: 320, targetY: 180, flash: 0 }];
  return s;
}
function shoot(s: RunState, x: number, y: number) {
  s.bullets.push({ id: s.nextId++, x, y, vx: 0, vy: 0, damage: 10, life: 60, owner: 'player', bouncesLeft: 2 });
}

describe('stone guard and shield wraith', () => {
  it('locks the charge lane for a full 0.8 second warning', () => {
    const s = arena('guard'), e = s.enemies[0]; step(s, emptyInput());
    expect(e.mode).toBe('windup'); expect(e.timer).toBe(48);
    const target = { x: e.targetX, y: e.targetY }, angle = e.angle;
    for (let i = 0; i < 47; i++) step(s, { ...emptyInput(), moveY: 1 });
    expect(e.x).toBe(140); expect(e.angle).toBe(angle); expect({ x: e.targetX, y: e.targetY }).toEqual(target);
    step(s, emptyInput()); expect(e.mode).toBe('charge'); expect(e.x).toBe(140);
    step(s, emptyInput()); expect(e.x).toBe(145);
  });
  it('stops a charge at a pillar and leaves a one second opening', () => {
    const s = arena('guard'), e = s.enemies[0]; e.x = 350; e.y = 125; s.player.x = 300; s.player.y = 125;
    step(s, emptyInput()); expect(e.targetX).toBeGreaterThanOrEqual(250);
    for (let i = 0; i < 110 && e.mode !== 'recover'; i++) step(s, emptyInput());
    expect(e.mode).toBe('recover'); expect(e.timer).toBe(180); expect(e.x).toBeCloseTo(250, 1);
    const x = e.x; for (let i = 0; i < 59; i++) step(s, emptyInput()); expect(e.x).toBe(x);
    step(s, emptyInput()); expect(e.x).not.toBe(x);
  });
  it.each([
    { x: 250, y: 125, px: 350, py: 125 },
    { x: 250, y: 125, px: 250, py: 200 },
    { x: 42, y: 180, px: 180, py: 180 },
  ])('can charge away from or along a contact face at $x/$y toward $px/$py', ({ x, y, px, py }) => {
    const s = arena('guard'), e = s.enemies[0]; Object.assign(e, { x, y }); Object.assign(s.player, { x: px, y: py });
    step(s, emptyInput()); expect(e.mode).toBe('windup');
    expect(Math.hypot(e.targetX - x, e.targetY - y)).toBeGreaterThan(Math.hypot(px - x, py - y));
    for (let i = 0; i < 110; i++) step(s, emptyInput());
    expect(s.player.hp).toBe(86); expect(s.stats.hits).toBe(1);
  });
  it('does not repeat charge damage when further body contact occurs', () => {
    const s = arena('guard'), e = s.enemies[0]; e.x = 310; e.mode = 'charge'; e.timer = 50; e.targetX = 500; e.targetY = 180; e.chargeHit = false;
    step(s, emptyInput()); expect(s.player.hp).toBe(86); expect(e.chargeHit).toBe(true);
    s.player.invulnerable = 0; step(s, emptyInput()); expect(s.player.hp).toBe(80); expect(s.stats.hits).toBe(2);
    expect(s.lastDamage).toBe('돌진 파수꾼 접촉 피해');
  });
  it('after an invulnerable charge crossing only body contact can hurt', () => {
    const s = arena('guard'), e = s.enemies[0]; e.x = 310; e.mode = 'charge'; e.timer = 50; e.targetX = 500; e.targetY = 180; e.chargeHit = false;
    s.player.invulnerable = 5; step(s, emptyInput()); s.player.invulnerable = 0; step(s, emptyInput());
    expect(s.player.hp).toBe(94); expect(e.chargeHit).toBe(true);
    expect(s.lastDamage).toBe('돌진 파수꾼 접촉 피해');
  });
  it('can threaten a player standing against the outer wall', () => {
    const s = arena('guard'), e = s.enemies[0]; s.player.x = BOUNDS.x + 7; e.x = BOUNDS.x + 108;
    step(s, emptyInput()); expect(e.mode).toBe('windup');
    for (let i = 0; i < 90; i++) step(s, emptyInput());
    expect(s.player.hp).toBe(86); expect(e.x).toBeGreaterThanOrEqual(BOUNDS.x + 10);
  });
  it.each([0, 49.9, -49.9, 50.1, -50.1, 180])('blocks only the frontal 100 degrees (impact %s)', degrees => {
    const s = arena('shield'), e = s.enemies[0]; e.mode = 'recover'; e.timer = 120;
    s.expedition!.relics = ['R01', 'R02', 'R07']; s.expedition!.acquired = [...s.expedition!.relics];
    const angle = degrees * Math.PI / 180; shoot(s, e.x + Math.cos(angle) * 11, e.y + Math.sin(angle) * 11);
    step(s, emptyInput()); const blocked = Math.abs(degrees) < 50;
    expect(e.hp).toBe(blocked ? 70 : 60); expect(e.burnTicks).toBe(blocked ? undefined : 180);
    if (blocked) expect(s.bullets).toHaveLength(0);
  });
  it('locks the spear direction for 0.7 seconds then damages once', () => {
    const s = arena('shield'), e = s.enemies[0]; s.player.x = 180; step(s, emptyInput());
    expect(e.mode).toBe('windup'); expect(e.timer).toBe(42);
    for (let i = 0; i < 41; i++) step(s, emptyInput()); expect(s.player.hp).toBe(100);
    step(s, emptyInput()); expect(s.player.hp).toBe(88); expect(e.timer).toBe(120);
    for (let i = 0; i < 30; i++) step(s, emptyInput()); expect(s.player.hp).toBe(88);
  });
  it('breaks a shield after five base shots and allows a frontal kill without regenerating', () => {
    const s = arena('shield'), e = s.enemies[0]; e.mode = 'recover'; e.timer = 120;
    for (let i = 0; i < 5; i++) {
      shoot(s, e.x + 11, e.y); s.bullets.at(-1)!.damage = 7; advanceProjectiles(s);
      expect(e.shieldHp).toBe(35 - 7 * (i + 1)); expect(e.hp).toBe(70); expect(s.bullets).toHaveLength(0);
    }
    for (let i = 0; i < 60; i++) step(s, emptyInput()); expect(e.shieldHp).toBe(0);
    for (let i = 0; i < 10; i++) { shoot(s, e.x + Math.cos(e.angle) * 11, e.y + Math.sin(e.angle) * 11); s.bullets.at(-1)!.damage = 7; advanceProjectiles(s); }
    expect(e.hp).toBe(0); expect(s.stats.kills).toBe(1); expect(e.shieldHp).toBe(0);
  });
  it('absorbs the breaking shot without overflow or relic procs, then exposes the body', () => {
    const s = arena('shield'), e = s.enemies[0]; e.shieldHp = 3;
    s.expedition!.relics = ['R01', 'R02', 'R03', 'R07', 'R08']; s.expedition!.acquired = [...s.expedition!.relics];
    shoot(s, e.x + 11, e.y); advanceProjectiles(s);
    expect(e.shieldHp).toBe(0); expect(e.hp).toBe(70); expect(e.burnTicks).toBeUndefined(); expect(e.frost).toBeUndefined(); expect(s.bullets).toHaveLength(0);
    shoot(s, e.x + 11, e.y); advanceProjectiles(s);
    expect(e.hp).toBe(60); expect(e.burnTicks).toBe(180); expect(e.frost!.hits).toHaveLength(1);
    expect(s.bullets.filter(b => b.kind === 'split')).toHaveLength(3);
  });
  it('damages the body from behind while preserving shield durability', () => {
    const s = arena('shield'), e = s.enemies[0]; e.shieldHp = 21;
    shoot(s, e.x - 11, e.y); advanceProjectiles(s); expect(e.hp).toBe(60); expect(e.shieldHp).toBe(21);
  });
  it('lets later pellets of a volley hit the body once earlier pellets break the shield', () => {
    const s = arena('shield'), e = s.enemies[0]; e.shieldHp = 5;
    for (let i = 0; i < 5; i++) { shoot(s, e.x + 11, e.y); s.bullets.at(-1)!.damage = 2.5; s.bullets.at(-1)!.eventId = 1000; }
    advanceProjectiles(s); expect(e.shieldHp).toBe(0); expect(e.hp).toBe(62.5); expect(s.bullets).toHaveLength(0);
  });
  it.each([{ x: 180, y: 207 }, { x: 100, y: 180 }])('allows evading a spear to $x/$y during its tell', point => {
    const s = arena('shield'), e = s.enemies[0]; s.player.x = 180; step(s, emptyInput());
    Object.assign(s.player, point);
    for (let i = 0; i < 42; i++) step(s, emptyInput());
    expect(e.angle).toBe(0); expect(s.player.hp).toBe(100);
  });
  it('turns its shield slowly while pursuing instead of instantly tracking a flank', () => {
    const s = arena('shield'), e = s.enemies[0]; s.player.x = 140; s.player.y = 240;
    step(s, emptyInput()); expect(e.angle).toBeGreaterThan(0); expect(e.angle).toBeLessThanOrEqual(0.035);
  });
  it('keeps an existing burn ticking after the shield faces the player', () => {
    const s = arena('shield'), e = s.enemies[0]; e.burnTicks = 100; e.burnPulse = 1;
    step(s, emptyInput()); expect(e.hp).toBe(68);
  });
  it('mixes both guardians into maze encounters while preserving legacy enemies', () => {
    const s = createDungeonRun(42), kinds = new Set<Enemy['kind']>();
    for (const node of s.expedition!.dungeon!.rooms.filter(r => r.kind === 'combat')) {
      s.expedition!.room = node.id; const waves = roomInfo(s).waves; expect(waves).toHaveLength(1); expect(waves[0]).toHaveLength(3);
      waves[0].forEach(kind => kinds.add(kind));
    }
    expect([...kinds].sort()).toEqual(['archer', 'guard', 'rat', 'shield']);
    expect(createRun(42).enemies.every(e => ['rat', 'archer'].includes(e.kind))).toBe(true);
  });
});
