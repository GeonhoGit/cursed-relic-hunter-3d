import { describe, expect, it } from 'vitest';
import { createRun, emptyInput, step, advanceRoom } from '../src/core/simulation';
import { advanceProjectiles, damageEnemy } from '../src/core/combat';
import { createBoss } from '../src/core/boss';
import { RELIC_IDS } from '../src/core/relics';
import { BOUNDS, type Bullet, type Enemy, type RelicId, type RunState } from '../src/core/model';

function room(relics: RelicId[]) {
  const s = createRun(42); s.phase = 'combat'; s.player.x = 90; s.player.y = 180;
  s.enemies = []; s.waveDelay = 99999;
  s.expedition!.relics = [...relics]; s.expedition!.acquired = [...relics]; return s;
}
function target(s: RunState, x = 150): Enemy {
  const e: Enemy = { id: s.nextId++, kind: 'archer', x, y: 180, hp: 100, maxHp: 100,
    angle: 0, mode: 'windup', timer: 1000, targetX: 90, targetY: 180, flash: 0 };
  s.enemies.push(e); return e;
}
function shot(s: RunState, e: Enemy, overrides: Partial<Bullet> = {}) {
  const id = s.nextId++;
  s.bullets.push({ id, eventId: id, x: e.x - 11, y: e.y, vx: 320, vy: 0,
    life: 75, damage: 7, owner: 'player', hitIds: [], ...overrides });
}

describe('expanded relic combinations', () => {
  it('adds four normal relics to the reward pool while keeping all existing IDs', () => {
    expect(RELIC_IDS).toEqual(expect.arrayContaining(['R01', 'R02', 'R03', 'R04', 'R07', 'R08', 'R13', 'R20']));
  });
  it('splits a lethal impact into three non-recursive children without hitting the source target again', () => {
    const s = room(['R03', 'R07', 'R08', 'R04']), e = target(s); e.hp = 7;
    shot(s, e); advanceProjectiles(s);
    expect(e.hp).toBe(0); expect(s.bullets).toHaveLength(3);
    expect(s.bullets.every(b => b.kind === 'split' && b.life === 36)).toBe(true);
    s.bullets.forEach(b => expect(b.damage).toBeCloseTo(2.45));
    const next = target(s, 150); advanceProjectiles(s);
    expect(next.hp).toBeCloseTo(92.65); expect(next.burnTicks).toBeUndefined(); expect(next.frost).toBeUndefined();
    expect(s.bullets).toHaveLength(0);
  });
  it('splits only once across piercing and does not reserve partial children when the budget is full', () => {
    const s = room(['R02', 'R03']), a = target(s), b = target(s, 190);
    shot(s, a, { vx: 12000 }); advanceProjectiles(s);
    expect(a.hp).toBe(93); expect(b.hp).toBe(93); expect(s.bullets.filter(b => b.kind === 'split')).toHaveLength(3);
    const full = room(['R03']), e = target(full);
    full.bullets = Array.from({ length: 118 }, () => ({ id: full.nextId++, kind: 'split' as const, x: 500, y: 180, vx: 0, vy: 0, life: 20, owner: 'player' as const, damage: 1 }));
    shot(full, e); advanceProjectiles(full); expect(full.bullets.filter(b => b.kind === 'split')).toHaveLength(118);
  });
  it('turns at natural expiry, resets the piercing phase and returns safely to the moving player', () => {
    const s = room(['R02', 'R04']), e = target(s, 450);
    shot(s, e, { x: 250, life: 1, hitIds: [e.id], outboundHits: [{ id: e.id, tick: 0 }] });
    advanceProjectiles(s); expect(s.bullets[0].phase).toBe('return'); expect(s.bullets[0].hitIds).toEqual([]);
    s.player.x = 270; s.player.y = 200;
    for (let i = 0; i < 12; i++) { s.tick++; advanceProjectiles(s); }
    expect(s.bullets).toHaveLength(0); expect(s.player.hp).toBe(100);
  });
  it('does not revive bullets that hit walls or enemies before their lifetime expires', () => {
    const s = room(['R04']), e = target(s); shot(s, e); advanceProjectiles(s); expect(s.bullets).toHaveLength(0);
    shot(s, e, { x: BOUNDS.x + BOUNDS.w - 5, vx: 320 }); advanceProjectiles(s); expect(s.bullets).toHaveLength(0);
  });
  it('permits a return hit only after 15 ticks and never repeats a hit within that phase', () => {
    const s = room(['R02', 'R04']), e = target(s); s.player.x = 90;
    shot(s, e, { x: 160, phase: 'return', outboundHits: [{ id: e.id, tick: 0 }] });
    s.tick = 14; advanceProjectiles(s); expect(e.hp).toBe(100);
    s.tick = 15; advanceProjectiles(s); expect(e.hp).toBe(93);
    advanceProjectiles(s); expect(e.hp).toBe(93);
  });
  it('counts distinct basic shots, freezes for 36 ticks, then resists new stacks', () => {
    const s = room(['R02', 'R08']), e = target(s);
    for (let n = 0; n < 4; n++) { shot(s, e); advanceProjectiles(s); s.bullets = []; s.tick++; }
    expect(e.frost?.freezeTicks).toBe(36); const timer = e.timer;
    for (let n = 0; n < 36; n++) step(s, emptyInput());
    expect(e.timer).toBe(timer); expect(e.frost?.freezeTicks).toBe(0);
    step(s, emptyInput()); expect(e.timer).toBe(timer - 1);
    shot(s, e); advanceProjectiles(s); expect(e.frost?.hits).toEqual([]);
  });
  it('does not count returning shots twice or retain frost hits older than three seconds', () => {
    const s = room(['R08']), e = target(s);
    for (let n = 0; n < 4; n++) { shot(s, e, { eventId: 77 }); advanceProjectiles(s); }
    expect(e.frost?.hits).toHaveLength(1); expect(e.frost?.freezeTicks).toBe(0);
    s.tick = 181; shot(s, e); advanceProjectiles(s); expect(e.frost?.hits).toHaveLength(1);
  });
  it('blocked hits generate no split, burn or frost effects', () => {
    const s = room(['R03', 'R07', 'R08']), e = target(s); e.kind = 'shield'; e.angle = Math.PI;
    shot(s, e); advanceProjectiles(s); expect(e.hp).toBe(100); expect(s.bullets).toHaveLength(0);
    expect(e.burnTicks).toBeUndefined(); expect(e.frost).toBeUndefined();
  });
  it('slows a boss charge by 20% without freezing its pattern timer', () => {
    const s = room(['R08']); s.expedition!.room = 3; s.boss = createBoss(s);
    const b = s.boss; b.x = 320; b.y = 180; b.angle = 0; b.mode = 'charge'; b.pattern = 'charge'; b.timer = 20; b.targetX = 440; b.targetY = 180;
    b.frost = { freezeTicks: 36, resistTicks: 216, hits: [] };
    step(s, emptyInput()); expect(b.x).toBeCloseTo(324.8); expect(b.timer).toBe(19); expect(b.frost.freezeTicks).toBe(35);
  });
  it('preserves frost resistance across the boss half-health transition', () => {
    const s = room(['R08']); s.expedition!.room = 3; s.boss = createBoss(s);
    const b = s.boss; b.hp = 901; b.frost = { hits: [], freezeTicks: 35, resistTicks: 215 };
    damageEnemy(s, b, 7); expect(b.mode).toBe('transition'); expect(b.frost?.resistTicks).toBe(215);
    for (let i = 0; i < 60; i++) step(s, emptyInput());
    expect(b.frost?.resistTicks).toBe(155);
    s.bullets = [{ id: s.nextId++, x: b.x - 25, y: b.y, vx: 320, vy: 0, life: 75, damage: 7, owner: 'player' }];
    advanceProjectiles(s); expect(b.frost?.hits).toEqual([]);
  });
  it('places a bomb once, waits one second, damages enemies only and retains its eight second cooldown', () => {
    const s = room(['R13', 'R03', 'R07', 'R08']), e = target(s, 180);
    step(s, { ...emptyInput(), auxiliary: true, aimX: 210, aimY: 180 });
    expect(s.bombs).toHaveLength(1); expect(s.bombs![0].x).toBe(210); expect(s.player.auxCooldown).toBe(480);
    for (let n = 0; n < 59; n++) step(s, { ...emptyInput(), auxiliary: true });
    expect(e.hp).toBe(100); expect(s.bombs).toHaveLength(1);
    step(s, emptyInput()); expect(e.hp).toBe(55); expect(s.bombs).toHaveLength(0); expect(s.player.hp).toBe(100);
    expect(s.player.auxCooldown).toBe(420); expect(e.burnTicks).toBeUndefined(); expect(e.frost).toBeUndefined(); expect(s.bullets).toHaveLength(0);
  });
  it('clips bomb placement before pillars and blocks blast damage through them', () => {
    const s = room(['R13']); s.player.x = 180; s.player.y = 125;
    const e = target(s, 250); e.y = 125;
    step(s, { ...emptyInput(), auxiliary: true, aimX: 300, aimY: 125 });
    expect(s.bombs![0].x).toBeLessThan(204.01);
    for (let n = 0; n < 60; n++) step(s, emptyInput()); expect(e.hp).toBe(100);
  });
  it('refuses bombs without the relic and cleans pending bombs when changing rooms', () => {
    const s = room([]); step(s, { ...emptyInput(), auxiliary: true }); expect(s.bombs ?? []).toHaveLength(0);
    s.expedition!.relics = ['R13']; s.expedition!.acquired = ['R13'];
    step(s, { ...emptyInput(), auxiliary: true }); expect(s.bombs).toHaveLength(1);
    s.phase = 'cleared'; s.expedition!.reward = { room: 0, candidates: ['R13'], choice: 'R13' };
    expect(advanceRoom(s)).toBe(true); expect(s.bombs ?? []).toHaveLength(0);
  });
  it('counts a bomb final kill once and awards the room', () => {
    const s = room(['R13']), e = target(s, 180); e.hp = 40; s.wave = 2; s.waveDelay = 0;
    step(s, { ...emptyInput(), auxiliary: true, aimX: 180, aimY: 180 });
    for (let n = 0; n < 70; n++) step(s, emptyInput());
    expect(s.phase).toBe('cleared'); expect(s.gold).toBe(8); expect(s.stats.kills).toBe(1);
  });
});
