import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createRun, createDungeonRun, emptyInput, step, travel } from '../src/core/simulation';
import { advanceEnemies } from '../src/core/enemy-ai';
import { advanceSpecialEnemy } from '../src/core/enemy-special';
import { clearCombatEffects } from '../src/core/player-effects';
import { damageEnemy } from '../src/core/combat';
import { startTimeStop } from '../src/core/time-debt';
import { createBoss } from '../src/core/boss';
import { enterNextRegion } from '../src/core/region';
import { adjacentRooms } from '../src/core/dungeon';
import { distance, visible } from '../src/core/geometry';
import { bodyObstacles } from '../src/core/room-layout';
import { SaveStore, defaultSettings, validRun } from '../src/persistence/save';
import type { Enemy } from '../src/core/model';

function arena() {
  const s = createRun(42); s.phase = 'combat'; s.readyTicks = 0; s.player.x = 500; s.player.y = 180;
  const e: Enemy = { id: s.nextId++, kind: 'chainhound' as Enemy['kind'], x: 440, y: 180,
    hp: 85, maxHp: 85, mode: 'move', timer: 0, angle: 0, targetX: 500, targetY: 180, flash: 0 };
  s.enemies = [e]; return { s, e, p: s.player };
}
function bite() { const a = arena(); a.e.mode = 'windup'; a.e.timer = 1; return a; }

describe('chain hound pull and bite', () => {
  it('locks its facing for 0.8 seconds, then offers a pull-and-bite hit without moving the player during AI', () => {
    const { s, e, p } = arena(); advanceEnemies(s, { x: 0, y: 0 });
    expect(e.mode).toBe('windup'); expect(e.timer).toBe(48);
    p.y = 185;
    for (let i = 0; i < 47; i++) expect(advanceEnemies(s, { x: 0, y: 0 })).toEqual([]);
    expect([e.x, e.y, e.angle, e.targetX, e.targetY]).toEqual([440, 180, 0, 500, 180]);
    expect(advanceEnemies(s, { x: 0, y: 0 })).toEqual([{ damage: 14, cause: '사슬 사냥개의 당김과 물기', pull: { x: 440, y: 180 } }]);
    expect([p.x, p.y]).toEqual([500, 185]); expect(e.mode).toBe('recover'); expect(e.timer).toBe(180);
  });
  it('pulls a successfully bitten player by 30 units and deals one hit', () => {
    const { s, p } = bite(); step(s, emptyInput());
    expect(p.x).toBeCloseTo(470); expect(p.y).toBe(180); expect(p.hp).toBe(86);
    expect(s.stats.hits).toBe(1); expect(p.invulnerable).toBe(45);
  });
  it.each(['outside', 'side', 'behind', 'wall', 'jump'] as const)('misses and does not pull when protected by %s', protection => {
    const { s, e, p } = bite();
    if (protection === 'outside') p.x = 525;
    if (protection === 'side') Object.assign(p, { x: 440, y: 240 });
    if (protection === 'behind') p.x = 400;
    if (protection === 'wall') { Object.assign(e, { x: 220, y: 100, angle: Math.PI / 2 }); Object.assign(p, { x: 220, y: 160 }); }
    if (protection === 'jump') Object.assign(p, { height: 25, jumpVelocity: 0 });
    const before = { x: p.x, y: p.y };
    expect(advanceSpecialEnemy(s, e).hits).toEqual([]); expect({ x: p.x, y: p.y }).toEqual(before);
    expect(e.mode).toBe('recover'); expect(e.timer).toBe(180);
  });
  it.each(['dodge', 'hurt', 'stronger'] as const)('does not pull if %s prevents its damage from being selected', protection => {
    const { s, p } = bite();
    if (protection === 'dodge') Object.assign(p, { dodgeRemaining: .14, dodgeX: 0, dodgeY: 0 });
    if (protection === 'hurt') p.invulnerable = 20;
    if (protection === 'stronger') s.bullets.push({ id: s.nextId++, x: p.x, y: p.y, vx: 0, vy: 0, damage: 22, owner: 'enemy', life: 10 });
    step(s, emptyInput()); expect(p.x).toBe(500); expect(p.y).toBe(180); expect(p.hp).toBe(protection === 'stronger' ? 78 : 100);
  });
  it('stops the pull before overlapping the hound or clipping through a grazing pillar', () => {
    const near = bite(); near.p.x = 463; step(near.s, emptyInput());
    expect(distance(near.p, near.e)).toBeCloseTo(18); expect(near.p.hp).toBe(86);
    const corner = bite(); Object.assign(corner.e, { x: 195, y: 160, angle: Math.atan2(-10, 65) });
    Object.assign(corner.p, { x: 260, y: 150 }); const before = { x: 260, y: 150 };
    step(corner.s, emptyInput()); expect(corner.p.hp).toBe(86);
    expect(distance(before, corner.p)).toBeGreaterThan(0); expect(distance(before, corner.p)).toBeLessThan(30);
    expect(corner.p.x).toBeGreaterThanOrEqual(247);
    expect(visible(corner.p, corner.p, 6.999, bodyObstacles(corner.s))).toBe(true);
  });
  it('rests briefly then pursues during the full three-second cooldown', () => {
    const { s, e } = bite(); advanceEnemies(s, { x: 0, y: 0 });
    for (let i = 0; i < 18; i++) { advanceEnemies(s, { x: 0, y: 0 }); expect(e.x).toBe(440); }
    advanceEnemies(s, { x: 0, y: 0 }); expect(e.x).toBeGreaterThan(440); expect(e.mode).toBe('recover');
    e.x = 440;
    for (let i = 0; i < 160; i++) { advanceEnemies(s, { x: 0, y: 0 }); expect(e.mode).toBe('recover'); }
    advanceEnemies(s, { x: 0, y: 0 }); expect(e.mode).toBe('windup'); expect(e.timer).toBe(48);
  });
  it('pursues distant targets and pauses warnings during frost and time stop', () => {
    const { s, e } = arena(); s.player.x = 600; advanceEnemies(s, { x: 0, y: 0 });
    expect(e.mode).toBe('move'); expect(e.x).toBeGreaterThan(440);
    s.player.x = 500; advanceEnemies(s, { x: 0, y: 0 }); expect(e.timer).toBe(48);
    e.frost = { hits: [], freezeTicks: 2, resistTicks: 0 }; advanceEnemies(s, { x: 0, y: 0 }); expect(e.timer).toBe(48);
    delete e.frost; startTimeStop(s); advanceEnemies(s, { x: 0, y: 0 }); expect(e.timer).toBe(48);
  });
  it('cancels prepared bites on death and combat cleanup', () => {
    const a = bite(); damageEnemy(a.s, a.e, 85);
    expect(advanceSpecialEnemy(a.s, a.e).hits).toEqual([]); expect(a.e.mode).toBe('recover'); expect(a.e.timer).toBe(180);
    const b = bite(); clearCombatEffects(b.s); expect(b.e.mode).toBe('recover'); expect(b.e.timer).toBe(180);
  });
  it.each(['warning', 'recover'] as const)('restores %s and follows identical future combat including displacement', async state => {
    const { s, e } = arena(); advanceEnemies(s, { x: 0, y: 0 });
    if (state === 'recover') { e.timer = 1; step(s, emptyInput()); }
    expect(validRun(s)).toBe(true);
    const store = new SaveStore(`hound-${state}`); await store.load(); await store.save(s, defaultSettings());
    const restored = (await store.load())!.run!;
    for (let i = 0; i < 260; i++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s);
  });
  it('accepts old saves and rejects invalid hound health, mode and timers', () => {
    expect(validRun(createRun(42))).toBe(true);
    const { s } = bite(); expect(validRun(s)).toBe(true);
    for (const patch of [{ hp: 86 }, { maxHp: 84 }, { mode: 'charge' }, { timer: 49 }, { timer: 0 }, { timer: .5 }, { targetX: Infinity }]) {
      const copy = structuredClone(s); Object.assign(copy.enemies[0], patch); expect(validRun(copy)).toBe(false);
    }
    const copy = structuredClone(s); Object.assign(copy.enemies[0], { mode: 'recover', timer: 181 }); expect(validRun(copy)).toBe(false);
  });
  it('includes hounds and seal casters in new second-region rooms with seven to ten enemies', () => {
    const s = createDungeonRun(42); s.expedition!.room = 8; const room = s.expedition!.dungeon!.rooms[8]; room.visited = room.cleared = true;
    s.boss = createBoss(s); s.boss.hp = 0; s.phase = 'cleared'; enterNextRegion(s);
    for (let id = 1; id <= 5; id++) {
      const copy = structuredClone(s), from = adjacentRooms(copy, id)[0].room;
      copy.expedition!.room = from.id; from.visited = from.cleared = true;
      travel(copy, adjacentRooms(copy).find(d => d.room.id === id)!.direction);
      expect(copy.enemies.some(e => e.kind === ('chainhound' as Enemy['kind']) && e.hp === 85)).toBe(true);
      expect(copy.enemies.some(e => e.kind === 'sealcaster')).toBe(true);
      expect(copy.enemies.length).toBeGreaterThanOrEqual(7); expect(copy.enemies.length).toBeLessThanOrEqual(10); expect(validRun(copy)).toBe(true);
    }
  });
});
