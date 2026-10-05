import { describe, expect, it } from 'vitest';
import { createRun, emptyInput, step } from '../src/core/simulation';
import { createBoss, startBossPattern } from '../src/core/boss';
import type { BossPattern, RunState } from '../src/core/model';

function arena(pattern: BossPattern = 'fan') {
  const s = createRun(42); s.phase = 'combat'; s.enemies = []; s.waveDelay = 0;
  s.expedition!.room = 3; s.boss = createBoss(s);
  s.boss.x = 450; s.boss.y = 180; s.player.x = 100; s.player.y = 180;
  startBossPattern(s, pattern); return s;
}
function shoot(s: RunState, x: number, y: number, damage = 10, vx = 0) {
  s.bullets.push({ id: s.nextId++, x, y, vx, vy: 0, owner: 'player', damage, life: 60 });
}

describe('gatekeeper boss', () => {
  it('locks aim for a full 0.8s tell then fires five stones', () => {
    const s = arena(); const angle = s.boss!.angle;
    for (let i = 0; i < 47; i++) step(s, { ...emptyInput(), moveY: 1 });
    expect(s.bullets).toHaveLength(0); expect(s.boss!.angle).toBe(angle);
    step(s, emptyInput()); expect(s.bullets.filter(b => b.owner === 'enemy')).toHaveLength(5);
    expect(s.bullets.every(b => b.damage === 12)).toBe(true); expect(s.boss!.timer).toBe(72);
  });
  it('transitions once at half health, cancels threats, stays immune and summons two rats', () => {
    const s = arena('rocks'); s.boss!.hp = 905;
    shoot(s, s.boss!.x, s.boss!.y); step(s, emptyInput());
    expect(s.boss!.stage).toBe(2); expect(s.boss!.mode).toBe('transition'); expect(s.boss!.timer).toBe(60);
    expect(s.boss!.rocks).toHaveLength(0); expect(s.bullets).toHaveLength(0);
    shoot(s, s.boss!.x, s.boss!.y, 100); step(s, emptyInput()); expect(s.boss!.hp).toBe(895);
    for (let i = 0; i < 59; i++) step(s, emptyInput());
    expect(s.enemies).toHaveLength(2); expect(s.enemies.every(e => e.kind === 'rat')).toBe(true);
    expect(s.boss!.pattern).toBe('fan'); expect(s.boss!.mode).toBe('windup');
    s.boss!.hp = 700; shoot(s, s.boss!.x, s.boss!.y); step(s, emptyInput());
    expect(s.boss!.mode).not.toBe('transition'); expect(s.enemies).toHaveLength(2);
  });
  it('stage two fan fires seven stones after its full tell', () => {
    const s = arena(); s.boss!.stage = 2; s.boss!.summonsDone = true;
    for (let i = 0; i < 48; i++) step(s, emptyInput());
    expect(s.bullets).toHaveLength(7);
  });
  it.each(['stone-before', 'stone-after', 'rocks', 'charge'])('cancels same-tick %s damage when entering stage two', attack => {
    const s = arena(attack === 'rocks' ? 'rocks' : 'fan');
    s.boss!.hp = 910; s.player.hp = 10;
    if (attack === 'rocks') s.boss!.timer = 1;
    if (attack === 'charge') {
      s.boss!.x = s.player.x + 25; startBossPattern(s, 'charge'); s.boss!.mode = 'charge'; s.boss!.timer = 5;
    }
    shoot(s, s.boss!.x, s.boss!.y);
    if (attack.startsWith('stone')) {
      const stone = { id: s.nextId++, x: s.player.x, y: s.player.y, vx: 0, vy: 0, owner: 'enemy' as const, source: 'gatekeeper' as const, damage: 12, life: 60 };
      if (attack === 'stone-before') s.bullets.unshift(stone); else s.bullets.push(stone);
    }
    step(s, emptyInput());
    expect(s.boss!.stage).toBe(2); expect(s.boss!.mode).toBe('transition');
    expect(s.player.hp).toBe(10); expect(s.stats.hits).toBe(0); expect(s.phase).toBe('combat');
  });
  it('the frontal shield stops piercing and burn while its rear takes damage', () => {
    const s = arena('shield'); s.expedition!.relics = ['R02', 'R07']; s.expedition!.acquired = ['R02', 'R07'];
    shoot(s, s.boss!.x - 24, 180); step(s, emptyInput());
    expect(s.boss!.hp).toBe(1800); expect(s.boss!.burnTicks).toBeUndefined(); expect(s.bullets).toHaveLength(0);
    shoot(s, s.boss!.x + 24, 180); step(s, emptyInput());
    expect(s.boss!.hp).toBe(1790); expect(s.boss!.burnTicks).toBe(180);
  });
  it('the shield neither tracks the player nor skips its two second duration', () => {
    const s = arena('shield'), angle = s.boss!.angle;
    for (let i = 0; i < 119; i++) step(s, { ...emptyInput(), moveY: 1 });
    expect(s.boss!.mode).toBe('shield'); expect(s.boss!.angle).toBe(angle);
    step(s, emptyInput()); expect(s.boss!.mode).toBe('recover'); expect(s.boss!.timer).toBe(72);
    for (let i = 0; i < 72; i++) step(s, emptyInput());
    expect(s.boss!.pattern).toBe('fan'); expect(s.boss!.timer).toBe(48);
  });
  it('charge gives a one second tell and stops before a pillar', () => {
    const s = arena(); s.boss!.x = 350; s.boss!.y = 125; s.player.x = 100; s.player.y = 125;
    startBossPattern(s, 'charge');
    for (let i = 0; i < 59; i++) step(s, emptyInput()); expect(s.boss!.x).toBe(350);
    for (let i = 0; i < 100 && s.boss!.mode !== 'recover'; i++) step(s, emptyInput());
    expect(s.boss!.x).toBeGreaterThanOrEqual(260); expect(s.player.hp).toBe(100);
  });
  it('a charge only damages the player once and stage two recovers in 0.4s', () => {
    const s = arena(); s.player.x = 330; s.boss!.stage = 2; s.boss!.summonsDone = true;
    startBossPattern(s, 'charge');
    for (let i = 0; i < 150 && s.boss!.mode !== 'recover'; i++) step(s, emptyInput());
    expect(s.player.hp).toBe(82); expect(s.boss!.timer).toBe(24);
    for (let i = 0; i < 24; i++) step(s, emptyInput());
    expect(s.boss!.pattern).toBe('rocks'); expect(s.boss!.timer).toBe(72);
  });
  it('three fixed rock tells strike once after 1.2s', () => {
    const s = arena('rocks'), marks = structuredClone(s.boss!.rocks);
    expect(marks).toHaveLength(3);
    for (let i = 0; i < 71; i++) step(s, emptyInput()); expect(s.player.hp).toBe(100);
    expect(s.boss!.rocks).toEqual(marks);
    step(s, emptyInput()); expect(s.player.hp).toBe(84);
    for (let i = 0; i < 12; i++) step(s, emptyInput()); expect(s.player.hp).toBe(84);
  });
  it('boss death removes surviving summons and awards 40 gold once', () => {
    const s = arena(); s.boss!.hp = 10; s.gold = 24;
    s.enemies = createRun(2).enemies; shoot(s, s.boss!.x, s.boss!.y);
    step(s, emptyInput()); expect(s.phase).toBe('cleared'); expect(s.gold).toBe(64);
    expect(s.enemies).toHaveLength(0); expect(s.bullets).toHaveLength(0);
    for (let i = 0; i < 10; i++) step(s, emptyInput()); expect(s.gold).toBe(64);
  });
  it.each([false, true])('resolves simultaneous lethal damage before victory (bandage=%s)', bandage => {
    const s = arena(); s.boss!.hp = 10; s.player.hp = 10;
    if (bandage) { s.expedition!.relics = ['R20']; s.expedition!.acquired = ['R20']; }
    shoot(s, s.boss!.x, s.boss!.y);
    s.bullets.push({ id: s.nextId++, x: s.player.x, y: s.player.y, vx: 0, vy: 0, owner: 'enemy', damage: 12, life: 60 });
    step(s, emptyInput()); expect(s.phase).toBe(bandage ? 'cleared' : 'dead'); expect(s.gold).toBe(bandage ? 40 : 0);
  });
  it('restores an in-flight pattern and its future deterministically', () => {
    const s = arena('charge'); for (let i = 0; i < 68; i++) step(s, emptyInput());
    const restored = JSON.parse(JSON.stringify(s));
    for (let i = 0; i < 400; i++) { const input = { ...emptyInput(), moveY: i < 50 ? 1 : 0 }; step(s, input); step(restored, input); }
    expect(restored).toEqual(s);
  });
});
