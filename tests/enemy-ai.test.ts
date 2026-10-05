import { describe, expect, it } from 'vitest';
import { createRun, emptyInput, step } from '../src/core/simulation';
import { distance, visible } from '../src/core/geometry';
import { BOUNDS, type Enemy } from '../src/core/model';
import { advanceEnemies } from '../src/core/enemy-ai';

function enemy(kind: Enemy['kind'], x: number, y: number, id = 30): Enemy {
  return { id, kind, x, y, hp: kind === 'rat' ? 30 : 40, maxHp: kind === 'rat' ? 30 : 40,
    angle: Math.PI, mode: 'move', timer: 0, targetX: 320, targetY: 180, flash: 0 };
}
function room(enemies: Enemy[]) {
  const state = createRun(42); state.phase = 'combat'; state.enemies = enemies;
  state.player.x = 320; state.player.y = 180;
  return state;
}

describe('enemy roles and movement', () => {
  it('a rat saved in recovery immediately resumes pursuit without attack cooldown', () => {
    const rat = enemy('rat', 470, 180); rat.mode = 'recover'; rat.timer = 28;
    const state = room([rat]);
    for (let i = 0; i < 20; i++) step(state, emptyInput());
    expect(distance(rat, state.player)).toBeLessThan(125);
    expect(rat.mode).toBe('move'); expect(rat.timer).toBe(0);
  });
  it('an archer retreats when approached instead of firing at point blank', () => {
    const archer = enemy('archer', 365, 180); const state = room([archer]);
    for (let i = 0; i < 30; i++) step(state, emptyInput());
    expect(distance(archer, state.player)).toBeGreaterThan(65);
    expect(state.bullets.filter(b => b.owner === 'enemy')).toHaveLength(0);
  });
  it('an archer changes its firing angle while its attack is cooling down', () => {
    const archer = enemy('archer', 500, 180); archer.mode = 'recover'; archer.timer = 48;
    const state = room([archer]);
    for (let i = 0; i < 30; i++) step(state, emptyInput());
    expect(Math.abs(archer.y - 180)).toBeGreaterThan(10);
    expect(state.bullets.filter(b => b.owner === 'enemy')).toHaveLength(0);
  });
  it('two overlapping rats separate rather than forming a single stack', () => {
    const a = enemy('rat', 490, 180, 30), b = enemy('rat', 490, 180, 31);
    const state = room([a, b]);
    for (let i = 0; i < 45; i++) step(state, emptyInput());
    expect(distance(a, b)).toBeGreaterThan(18);
    expect(a.x).toBeLessThan(460); expect(b.x).toBeLessThan(460);
  });
  it('all rats pursue directly without assigning a rear attack route', () => {
    const front = enemy('rat', 450, 180, 30), flank = enemy('rat', 480, 180, 32);
    const state = room([flank, front]);
    for (let i = 0; i < 40; i++) step(state, emptyInput());
    expect(distance(front, state.player)).toBeLessThan(70);
    expect(distance(flank, state.player)).toBeLessThan(100);
    expect(Math.abs(front.y - state.player.y)).toBeLessThan(1);
    expect(Math.abs(flank.y - state.player.y)).toBeLessThan(1);
  });
  it('a nearby rat closes the gap without entering attack windup', () => {
    const front = enemy('rat', 450, 180, 30), flank = enemy('rat', 351, 180, 32);
    const state = room([front, flank]);
    step(state, emptyInput());
    expect(flank.mode).toBe('move'); expect(flank.timer).toBe(0);
    expect(flank.x).toBeLessThan(351); expect(flank.y).toBe(180);
  });
  it('a rat follows a player who moves away after body contact', () => {
    const front = enemy('rat', 450, 180, 30), flank = enemy('rat', 364, 180, 32);
    const state = room([front, flank]);
    for (let i = 0; i < 25; i++) step(state, emptyInput());
    expect(state.lastDamage).toContain('접촉');
    const before = flank.x;
    for (let i = 0; i < 20; i++) step(state, { ...emptyInput(), moveX: -1 });
    expect(flank.x).toBeLessThan(before - 25); expect(flank.mode).toBe('move');
  });
  it.each(['move', 'windup', 'recover', 'charge'] as const)('a rat restored in %s never deals a separate attack', mode => {
    const rat = enemy('rat', 340, 180); rat.mode = mode; rat.timer = 1;
    const state = room([rat]);
    for (let i = 0; i < 180; i++) {
      expect(advanceEnemies(state, { x: 0, y: 0 })).toEqual([]);
      expect(rat.mode).toBe('move'); expect(rat.timer).toBe(0);
    }
    expect(state.bullets).toHaveLength(0);
    expect(distance(rat, state.player)).toBeLessThan(17);
  });
  it('rats approach a player with a wall behind them without circling', () => {
    const front = enemy('rat', BOUNDS.x + 68, 180, 30), flank = enemy('rat', BOUNDS.x + 98, 180, 32);
    const state = room([front, flank]); state.player.x = BOUNDS.x + 7;
    for (let i = 0; i < 60; i++) step(state, emptyInput());
    expect(flank.mode).toBe('move');
    expect(Math.abs(flank.y - state.player.y)).toBeLessThan(5);
    expect(distance(flank, state.player)).toBeLessThan(35);
    expect(flank.x).toBeGreaterThanOrEqual(BOUNDS.x + 10);
  });
  it('a surviving rat keeps pursuing regardless of its ID', () => {
    const front = enemy('rat', 450, 180, 30), flank = enemy('rat', 480, 180, 32);
    const state = room([front, flank]);
    for (let i = 0; i < 60; i++) step(state, emptyInput());
    state.enemies = [flank];
    const alone = structuredClone(state);
    alone.enemies[0].id = 1;
    for (let i = 0; i < 60; i++) { step(state, emptyInput()); step(alone, emptyInput()); }
    expect(flank.x).toBeCloseTo(alone.enemies[0].x);
    expect(flank.y).toBeCloseTo(alone.enemies[0].y);
    expect(flank.mode).toBe(alone.enemies[0].mode);
  });
  it.each([
    { name: 'pillar', player: { x: 110, y: 125 }, front: { x: 270, y: 125 }, flank: { x: 300, y: 125 } },
    { name: 'room corner', player: { x: 39, y: 49 }, front: { x: 100, y: 65 }, flank: { x: 130, y: 65 } },
  ])('pursues around a $name without an attack state', ({ player, front, flank }) => {
    const lead = enemy('rat', front.x, front.y, 30), rear = enemy('rat', flank.x, flank.y, 32);
    const state = room([lead, rear]); Object.assign(state.player, player);
    for (let i = 0; i < 600 && distance(rear, state.player) >= 32; i++) step(state, emptyInput());
    expect(rear.mode).toBe('move');
    expect(visible(rear, state.player)).toBe(true);
    expect(distance(rear, state.player)).toBeLessThan(32);
  });
  it('a rat can approach a player standing flush against the outer wall', () => {
    const rat = enemy('rat', 320, BOUNDS.y + 48); rat.angle = -Math.PI / 2;
    const state = room([rat]); state.player.y = BOUNDS.y + 7;
    for (let i = 0; i < 120; i++) step(state, emptyInput());
    expect(distance(rat, state.player)).toBeLessThan(17);
    expect(rat.y).toBeGreaterThanOrEqual(BOUNDS.y + 10);
  });
  it('an archer gives a full 0.45 second tell and fires faster along the announced line', () => {
    const archer = enemy('archer', 480, 180); const state = room([archer]);
    step(state, emptyInput());
    expect(archer.mode).toBe('windup');
    const aimed = { x: archer.targetX, y: archer.targetY };
    for (let i = 0; i < 26; i++) step(state, { ...emptyInput(), moveY: 1 });
    expect(state.bullets).toHaveLength(0);
    expect({ x: archer.targetX, y: archer.targetY }).toEqual(aimed);
    step(state, emptyInput());
    const shot = state.bullets.find(b => b.owner === 'enemy');
    expect(shot).toBeDefined(); expect(shot!.vy).toBeCloseTo(0); expect(shot!.vx).toBeCloseTo(-210);
    expect(shot!.damage).toBe(10);
  });
  it('a pursuing rat only deals contact damage with the existing immunity interval', () => {
    const state = room([enemy('rat', 340, 180)]);
    const hitTicks: number[] = [];
    for (let i = 0; i < 180; i++) {
      const hp = state.player.hp; step(state, emptyInput());
      if (state.player.hp < hp) {
        hitTicks.push(state.tick); expect(hp - state.player.hp).toBe(6);
        expect(state.lastDamage).toContain('접촉');
      }
      expect(state.enemies[0].mode).toBe('move');
    }
    expect(hitTicks.length).toBeGreaterThan(2);
    expect(hitTicks.slice(1).map((tick, i) => tick - hitTicks[i])).toEqual([45, 45, 45]);
  });
  it('an archer repeats a clear shot after 1.55 seconds', () => {
    const state = room([enemy('archer', 320, 100)]); state.player.y = 280;
    const seen = new Set<number>(), shotTicks: number[] = [];
    for (let i = 0; i < 125; i++) {
      step(state, emptyInput());
      for (const shot of state.bullets) if (shot.owner === 'enemy' && !seen.has(shot.id)) {
        seen.add(shot.id); shotTicks.push(state.tick);
      }
    }
    expect(shotTicks).toEqual([28, 121]);
  });
  it('a cornered archer takes a side exit while keeping its body inside the room', () => {
    const archer = enemy('archer', BOUNDS.x + BOUNDS.w - 16, 180); const state = room([archer]); state.player.x = BOUNDS.x + BOUNDS.w - 58;
    for (let i = 0; i < 40; i++) step(state, emptyInput());
    expect(Math.abs(archer.y - 180)).toBeGreaterThan(20);
    expect(archer.x).toBeLessThanOrEqual(BOUNDS.x + BOUNDS.w - 10);
  });
  it('archers find a clear shot around pillars instead of walking into them', () => {
    const archer = enemy('archer', 270, 125); const state = room([archer]); state.player.x = 110; state.player.y = 125;
    for (let i = 0; i < 360 && archer.mode !== 'windup'; i++) step(state, emptyInput());
    expect(archer.mode).toBe('windup'); expect(visible(archer, state.player, 2)).toBe(true);
  });
  it('restores movement decisions deterministically from an in-combat save', () => {
    const state = room([enemy('rat', 480, 180), enemy('archer', 550, 95, 31), enemy('rat', 520, 180, 32)]);
    for (let i = 0; i < 80; i++) step(state, { ...emptyInput(), moveX: -1 });
    const restored = structuredClone(state);
    for (let i = 0; i < 180; i++) {
      const input = { ...emptyInput(), moveY: i < 30 ? 1 : 0 };
      step(state, input); step(restored, input);
    }
    expect(restored).toEqual(state);
  });
});
