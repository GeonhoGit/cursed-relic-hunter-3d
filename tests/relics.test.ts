import { describe, expect, it } from 'vitest';
import { createRun, emptyInput, step } from '../src/core/simulation';
import { BOUNDS, type Enemy, type RelicId } from '../src/core/model';

function room(relics: RelicId[]) {
  const s = createRun(3); s.phase = 'combat'; s.enemies = []; s.waveDelay = 99999;
  s.expedition!.relics = [...relics]; s.expedition!.acquired = [...relics];
  s.player.x = 90; s.player.y = 180; return s;
}
function enemy(x: number, id = 30): Enemy {
  return { id, kind: 'archer', x, y: 180, hp: 100, maxHp: 100, angle: 0,
    mode: 'windup', timer: 99999, targetX: 0, targetY: 0, flash: 0 };
}

describe('relic combat effects', () => {
  it('mirror bullets bounce twice at walls and disappear on their next wall collision', () => {
    const s = room(['R01']);
    s.bullets = [{ id: 100, x: BOUNDS.x + BOUNDS.w - 18, y: 180, vx: 12000, vy: 0, owner: 'player', damage: 10, life: 60, bouncesLeft: 2 }];
    step(s, emptyInput()); expect(s.bullets).toHaveLength(1);
    expect(s.bullets[0].vx).toBe(-12000); expect(s.bullets[0].bouncesLeft).toBe(1);
    const crossingTicks = Math.ceil(BOUNDS.w / (12000 / 60));
    for (let i = 0; i < crossingTicks; i++) step(s, emptyInput());
    expect(s.bullets[0].bouncesLeft).toBe(0); expect(s.bullets[0].vx).toBe(12000);
    for (let i = 0; i < crossingTicks; i++) step(s, emptyInput());
    expect(s.bullets).toHaveLength(0);
  });
  it('piercing hits four enemies in order within one fast sweep, then ends', () => {
    const s = room(['R02']); s.enemies = [150, 200, 260, 320, 370].map((x, i) => enemy(x, 30 + i));
    s.bullets = [{ id: 100, x: 90, y: 180, vx: 18000, vy: 0, owner: 'player', damage: 10, life: 60 }];
    step(s, emptyInput()); expect(s.enemies.map(e => e.hp)).toEqual([90, 90, 90, 90, 100]);
    expect(s.bullets).toHaveLength(0);
  });
  it('mirror and piercing never hit the same enemy twice on the return path', () => {
    const s = room(['R01', 'R02']); s.enemies = [enemy(550)];
    s.bullets = [{ id: 100, x: 500, y: 180, vx: 8000, vy: 0, owner: 'player', damage: 10, life: 60, bouncesLeft: 2 }];
    for (let i = 0; i < 4; i++) step(s, emptyInput());
    expect(s.enemies[0].hp).toBe(90); expect(s.stats.damage).toBe(10);
  });
  it('a mirror bullet reflects off a pillar instead of damaging an enemy behind it', () => {
    const s = room(['R01']); s.enemies = [enemy(260)]; s.enemies[0].y = 125;
    s.bullets = [{ id: 100, x: 190, y: 125, vx: 6000, vy: 0, owner: 'player', damage: 10, life: 60, bouncesLeft: 2 }];
    step(s, emptyInput()); expect(s.enemies[0].hp).toBe(100);
    expect(s.bullets[0].vx).toBe(-6000); expect(s.bullets[0].x).toBeLessThan(206);
  });
  it('burn refresh extends duration without stacking damage or postponing its next pulse', () => {
    const s = room(['R07']); s.enemies = [enemy(150)];
    const hit = () => s.bullets.push({ id: s.nextId++, x: 150, y: 180, vx: 0, vy: 0, owner: 'player', damage: 10, life: 60 });
    hit(); step(s, emptyInput());
    for (let i = 0; i < 29; i++) step(s, emptyInput());
    hit(); step(s, emptyInput());
    for (let i = 0; i < 30; i++) step(s, emptyInput());
    expect(s.enemies[0].hp).toBe(78);
    for (let i = 0; i < 150; i++) step(s, emptyInput());
    expect(s.enemies[0].hp).toBe(74); expect(s.enemies[0].burnTicks).toBe(0);
  });
  it('burn kills count once and can complete the final wave', () => {
    const s = room(['R07']); s.wave = 2; s.waveDelay = 0;
    const target = enemy(150); target.hp = 12; s.enemies = [target];
    s.bullets = [{ id: 100, x: 150, y: 180, vx: 0, vy: 0, owner: 'player', damage: 10, life: 60 }];
    for (let i = 0; i < 65; i++) step(s, emptyInput());
    expect(s.phase).toBe('cleared'); expect(s.stats.kills).toBe(1); expect(s.gold).toBe(8);
  });
  it('bandage prevents one lethal hit before clear and preserves consumed acquisition history', () => {
    const s = room(['R20']); s.player.hp = 8; s.wave = 2; s.waveDelay = 0;
    const fatal = () => s.bullets.push({ id: 100, x: s.player.x, y: 180, vx: 0, vy: 0, owner: 'enemy', damage: 10, life: 60 });
    fatal(); step(s, emptyInput());
    expect(s.player.hp).toBe(1); expect(s.player.invulnerable).toBe(90); expect(s.phase).toBe('cleared');
    expect(s.expedition!.relics).not.toContain('R20'); expect(s.expedition!.acquired).toContain('R20');
    s.phase = 'combat'; s.player.invulnerable = 0; fatal(); step(s, emptyInput());
    expect(s.phase).toBe('dead');
  });
  it('saving an active combined effect preserves the same subsequent combat', () => {
    const s = room(['R01', 'R02', 'R07', 'R20']); s.enemies = [enemy(150), enemy(400, 32)];
    step(s, { ...emptyInput(), fire: true });
    for (let i = 0; i < 20; i++) step(s, emptyInput());
    const restored = JSON.parse(JSON.stringify(s));
    for (let i = 0; i < 120; i++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s);
  });
});
