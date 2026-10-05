import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createRun, createDungeonRun, emptyInput, step, travel } from '../src/core/simulation';
import { advanceEnemies } from '../src/core/enemy-ai';
import { advanceSpecialEnemy } from '../src/core/enemy-special';
import { damageEnemy } from '../src/core/combat';
import { clearCombatEffects } from '../src/core/player-effects';
import { startTimeStop } from '../src/core/time-debt';
import { createBoss } from '../src/core/boss';
import { enterNextRegion } from '../src/core/region';
import { adjacentRooms } from '../src/core/dungeon';
import { SaveStore, defaultSettings, validRun } from '../src/persistence/save';
import type { Enemy } from '../src/core/model';

type Reader = Enemy & { laserTicks?: number };
function arena() {
  const s = createRun(42); s.phase = 'combat'; s.readyTicks = 0; s.player.x = 500; s.player.y = 180;
  const e: Reader = { id: s.nextId++, kind: 'readerstatue' as Enemy['kind'], x: 320, y: 180,
    hp: 100, maxHp: 100, mode: 'move', timer: 0, angle: 0, targetX: 500, targetY: 180, flash: 0 };
  s.enemies = [e]; return { s, e, p: s.player };
}
function fire() { const a = arena(); a.e.mode = 'windup'; a.e.timer = 1; return a; }

describe('reader statue horizontal laser', () => {
  it('warns for 1.2 seconds with a fixed facing, fires once and never creates a reflectable projectile', () => {
    const { s, e, p } = arena(); advanceEnemies(s, { x: 0, y: 0 });
    expect(e.mode).toBe('windup'); expect(e.timer).toBe(72); p.y = 185;
    for (let i = 0; i < 71; i++) expect(advanceEnemies(s, { x: 0, y: 0 })).toEqual([]);
    expect([e.x, e.y, e.angle, e.targetX, e.targetY]).toEqual([320, 180, 0, 500, 180]);
    expect(advanceEnemies(s, { x: 0, y: 0 })).toEqual([{ damage: 18, cause: '독서 석상의 레이저' }]);
    expect(e.mode).toBe('recover'); expect(e.timer).toBe(240); expect(e.laserTicks).toBe(12); expect(s.bullets).toEqual([]);
    for (let i = 0; i < 12; i++) expect(advanceEnemies(s, { x: 0, y: 0 })).toEqual([]);
    expect(e.laserTicks).toBeUndefined();
  });
  it.each(['side', 'behind', 'range', 'wall', 'above'] as const)('provides safety to a player at %s', protection => {
    const { s, e, p } = fire();
    if (protection === 'side') p.y = 194;
    if (protection === 'behind') p.x = 300;
    if (protection === 'range') p.x = 750;
    if (protection === 'wall') { Object.assign(e, { x: 220, y: 180, angle: Math.PI / 2 }); Object.assign(p, { x: 220, y: 280 }); }
    if (protection === 'above') Object.assign(p, { height: 40, jumpVelocity: 0 });
    expect(advanceSpecialEnemy(s, e).hits).toEqual([]); expect(e.mode).toBe('recover'); expect(e.timer).toBe(240);
  });
  it('hits the exact player-radius edge and still reaches a normal jump at chest height', () => {
    const edge = fire(); edge.p.y = 193; expect(advanceSpecialEnemy(edge.s, edge.e).hits).toHaveLength(1);
    const jump = fire(); jump.p.height = 25; expect(advanceSpecialEnemy(jump.s, jump.e).hits).toHaveLength(1);
  });
  it('detects a swept crossing on the firing tick while respecting vertical clearance', () => {
    const a = fire(); a.p.y = 195;
    expect(advanceSpecialEnemy(a.s, a.e, { x: 500, y: 165 }, 0).hits).toHaveLength(1);
    const b = fire(); b.p.y = 195; b.p.height = 40;
    expect(advanceSpecialEnemy(b.s, b.e, { x: 500, y: 165 }, 40).hits).toEqual([]);
  });
  it.each(['dodge', 'hurt'] as const)('honors %s protection through the common damage gate', protection => {
    const { s, p } = fire();
    if (protection === 'dodge') Object.assign(p, { dodgeRemaining: .14, dodgeX: 0, dodgeY: 0 });
    else p.invulnerable = 20;
    step(s, emptyInput()); expect(p.hp).toBe(100);
  });
  it('does not let the projectile parry window reflect or absorb its laser', () => {
    const { s, p } = fire(); s.expedition!.relics = s.expedition!.acquired = ['R30'];
    Object.assign(p, { dodgeRemaining: .24, dodgeX: 0, dodgeY: 0, parryUsed: false });
    step(s, emptyInput()); expect(p.hp).toBe(82); expect(p.parryUsed).toBe(false);
    expect(s.bullets).toEqual([]); expect(s.cues.some(c => c.kind === 'parry')).toBe(false);
  });
  it('remains stationary through its cooldown and starts the next warning only after four seconds', () => {
    const { s, e } = fire(); advanceEnemies(s, { x: 0, y: 0 });
    for (let i = 0; i < 239; i++) { advanceEnemies(s, { x: 0, y: 0 }); expect(e.mode).toBe('recover'); expect([e.x, e.y]).toEqual([320, 180]); }
    advanceEnemies(s, { x: 0, y: 0 }); expect(e.mode).toBe('windup'); expect(e.timer).toBe(72);
  });
  it('waits without firing when the target is too far away or hidden behind a wall', () => {
    const far = arena(); far.p.x = 750; advanceEnemies(far.s, { x: 0, y: 0 });
    expect(far.e.mode).toBe('move'); expect([far.e.x, far.e.y]).toEqual([320, 180]);
    const wall = arena(); Object.assign(wall.e, { x: 220, y: 180 }); Object.assign(wall.p, { x: 220, y: 280 });
    advanceEnemies(wall.s, { x: 0, y: 0 }); expect(wall.e.mode).toBe('move'); expect(wall.e.timer).toBe(0);
  });
  it('pauses its warning and visible shot during frost or time stop', () => {
    const { s, e } = arena(); advanceEnemies(s, { x: 0, y: 0 });
    e.frost = { hits: [], freezeTicks: 2, resistTicks: 0 }; advanceEnemies(s, { x: 0, y: 0 }); expect(e.timer).toBe(72);
    delete e.frost; s.player.x = 480; startTimeStop(s); advanceEnemies(s, { x: 0, y: 0 }); expect(e.timer).toBe(72);
    delete s.timeStop; e.timer = 1; advanceEnemies(s, { x: 0, y: 0 }); startTimeStop(s);
    advanceEnemies(s, { x: 0, y: 0 }); expect(e.timer).toBe(240); expect(e.laserTicks).toBe(12);
  });
  it('cancels a warning or visible shot on death and combat cleanup', () => {
    const a = fire(); damageEnemy(a.s, a.e, 100); expect(advanceSpecialEnemy(a.s, a.e).hits).toEqual([]);
    expect(a.e.mode).toBe('recover'); expect(a.e.timer).toBe(240); expect(a.e.laserTicks).toBeUndefined();
    const b = fire(); advanceEnemies(b.s, { x: 0, y: 0 }); clearCombatEffects(b.s);
    expect(b.e.laserTicks).toBeUndefined(); expect(b.e.timer).toBe(240);
  });
  it.each(['warning', 'shot', 'recover'] as const)('saves %s and resumes identical future combat', async state => {
    const { s, e } = arena(); advanceEnemies(s, { x: 0, y: 0 });
    if (state !== 'warning') { e.timer = 1; step(s, emptyInput()); }
    if (state === 'recover') for (let i = 0; i < 20; i++) step(s, emptyInput());
    expect(validRun(s)).toBe(true);
    const store = new SaveStore(`reader-${state}`); await store.load(); await store.save(s, defaultSettings());
    const restored = (await store.load())!.run!;
    for (let i = 0; i < 340; i++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s);
  });
  it('accepts older snapshots and rejects invalid statue health, modes, timers and shot lifetime', () => {
    expect(validRun(createRun(42))).toBe(true); const { s } = fire(); expect(validRun(s)).toBe(true);
    for (const patch of [{ hp: 101 }, { hp: 0 }, { maxHp: 99 }, { mode: 'charge' }, { timer: 0 }, { timer: 73 }, { targetX: Infinity }, { laserTicks: 1 }]) {
      const copy = structuredClone(s); Object.assign(copy.enemies[0], patch); expect(validRun(copy)).toBe(false);
    }
    const a = fire(); step(a.s, emptyInput()); expect(validRun(a.s)).toBe(true);
    for (const patch of [{ laserTicks: 0 }, { laserTicks: 13 }, { laserTicks: .5 }, { timer: 239 }]) {
      const copy = structuredClone(a.s); Object.assign(copy.enemies[0], patch); expect(validRun(copy)).toBe(false);
    }
    const old = createRun(42); Object.assign(old.enemies[0], { laserTicks: 12 }); expect(validRun(old)).toBe(false);
  });
  it('adds statues while retaining the other regional enemies and encounter limits', () => {
    const s = createDungeonRun(42); s.expedition!.room = 8; const bossRoom = s.expedition!.dungeon!.rooms[8]; bossRoom.visited = bossRoom.cleared = true;
    s.boss = createBoss(s); s.boss.hp = 0; s.phase = 'cleared'; enterNextRegion(s);
    for (let id = 1; id <= 5; id++) {
      const copy = structuredClone(s), from = adjacentRooms(copy, id)[0].room; copy.expedition!.room = from.id; from.visited = from.cleared = true;
      travel(copy, adjacentRooms(copy).find(d => d.room.id === id)!.direction);
      expect(copy.enemies.some(e => e.kind === ('readerstatue' as Enemy['kind']) && e.hp === 100)).toBe(true);
      expect(copy.enemies.some(e => e.kind === 'chainhound')).toBe(true); expect(copy.enemies.some(e => e.kind === 'sealcaster')).toBe(true);
      expect(copy.enemies.length).toBeGreaterThanOrEqual(7); expect(copy.enemies.length).toBeLessThanOrEqual(10); expect(validRun(copy)).toBe(true);
    }
  });
});
