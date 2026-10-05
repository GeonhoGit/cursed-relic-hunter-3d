import { describe, expect, it } from 'vitest';
import { createDungeonRun, emptyInput, step } from '../src/core/simulation';
import { enterNextRegion } from '../src/core/region';
import { createBoss } from '../src/core/boss';
import { spikeTraps, trapStage, trapHits } from '../src/core/traps';
import { advanceEnemies } from '../src/core/enemy-ai';
import { roomLayout } from '../src/core/room-layout';

function corridor() {
  const s = createDungeonRun(42); s.expedition!.room = 8; const b = s.expedition!.dungeon!.rooms[8]; b.visited = b.cleared = true;
  s.boss = createBoss(s); s.boss.hp = 0; s.phase = 'cleared'; enterNextRegion(s);
  s.expedition!.room = 1; s.expedition!.dungeon!.rooms[1].visited = true; s.phase = 'combat'; s.trapTicks = 0;
  s.enemies = [{ id: s.nextId++, kind: 'archer', x: 600, y: 350, hp: 40, maxHp: 40, angle: 0, mode: 'recover', timer: 300, targetX: 320, targetY: 183, flash: 0 }];
  return s;
}
describe('cursed corridor terrain and enemies', () => {
  it('gives every offset spike its full warning before the first activation after room entry', () => {
    const s=corridor();
    for(let index=0;index<3;index++) {
      s.trapTicks=index*76; expect(trapStage(s,index)).toBe('warning');
      s.trapTicks=index*76+59; expect(trapStage(s,index)).toBe('warning');
      s.trapTicks=index*76+60; expect(trapStage(s,index)).toBe('active');
    }
    s.trapTicks=0; expect(trapStage(s,1)).toBe('rest'); expect(trapStage(s,2)).toBe('rest');
  });
  it('has three distinct cursed layouts while old first-region saves retain their terrain', () => {
    const s = corridor(), keys = new Set();
    for (const template of [0, 1, 2]) { s.expedition!.dungeon!.rooms[1].template = template; keys.add(roomLayout(s).id); expect(roomLayout(s).id).toBeGreaterThanOrEqual(3); }
    expect(keys.size).toBe(3); const old = createDungeonRun(42); delete old.expedition!.region; expect(roomLayout(old).id).toBeLessThan(3);
  });
  it('cycles a full 1s warning, 0.8s active and 2s rest without using wall-clock time', () => {
    const s = corridor();
    for (const [tick, expected] of [[0, 'warning'], [59, 'warning'], [60, 'active'], [107, 'active'], [108, 'rest'], [227, 'rest'], [228, 'warning']] as const) {
      s.trapTicks = tick; expect(trapStage(s, 0)).toBe(expected);
    }
    expect(spikeTraps(s)).toHaveLength(3); s.expedition!.room = 8; expect(spikeTraps(s)).toHaveLength(0);
  });
  it('detects swept floor contact and lets a high jump pass over the same zone', () => {
    const s = corridor(), trap = spikeTraps(s)[0]; s.trapTicks = 60;
    const before = { x: trap.x - 20, y: trap.y + 10 }; s.player.x = trap.x + trap.w + 20; s.player.y = before.y;
    expect(trapHits(s, before, 0)).toHaveLength(1); s.player.height = 25; expect(trapHits(s, before, 25)).toHaveLength(0);
  });
  it('uses ordinary damage priority, dodge and hit invulnerability', () => {
    const s = corridor(), trap = spikeTraps(s)[0]; s.trapTicks = 60; s.player.x = trap.x + trap.w / 2; s.player.y = trap.y + trap.h / 2;
    step(s, emptyInput()); expect(s.player.hp).toBe(90); step(s, emptyInput()); expect(s.player.hp).toBe(90);
    s.player.invulnerable = 0; s.player.dodgeRemaining = 0.2; s.player.dodgeX = 0; s.player.dodgeY = 0;
    step(s, emptyInput()); expect(s.player.hp).toBe(90);
    s.player.dodgeRemaining = 0; s.bullets = [{ id: s.nextId++, x: s.player.x, y: s.player.y, vx: 0, vy: 0, damage: 18, owner: 'enemy', life: 60 }];
    step(s, emptyInput()); expect(s.player.hp).toBe(72);
  });
  it('ash priests announce a fixed target then fire three separated projectiles', () => {
    const s = corridor(); s.player.x = 320; s.player.y = 280;
    const e = { id: s.nextId++, kind: 'ashpriest' as const, x: 320, y: 180, hp: 65, maxHp: 65,
      angle: Math.PI / 2, mode: 'windup' as const, timer: 1, targetX: 320, targetY: 280, flash: 0 };
    s.enemies = [e]; s.player.x = 400; advanceEnemies(s, { x: 0, y: 0 });
    expect(s.bullets).toHaveLength(3); expect(s.bullets.every(b => b.damage === 12)).toBe(true);
    expect(s.bullets[1].vx).toBeCloseTo(0); expect(s.bullets[1].vy).toBeGreaterThan(0); expect(e.timer).toBe(144);
  });
});
