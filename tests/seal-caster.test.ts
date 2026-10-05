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
import { SaveStore, defaultSettings, validRun } from '../src/persistence/save';
import type { Enemy, RunState } from '../src/core/model';

type SlowedPlayer = RunState['player'] & { slowTicks?: number };
function arena() {
  const s = createRun(42); s.phase = 'combat'; s.readyTicks = 0; s.player.x = 500; s.player.y = 180;
  const e: Enemy = { id: s.nextId++, kind: 'sealcaster' as Enemy['kind'], x: 320, y: 180,
    hp: 55, maxHp: 55, mode: 'move', timer: 0, angle: 0, targetX: 500, targetY: 180, flash: 0 };
  s.enemies = [e]; return { s, e, p: s.player as SlowedPlayer };
}
function blast() { const a = arena(); a.e.mode = 'windup'; a.e.timer = 1; return a; }

describe('seal caster and walking slow', () => {
  it('locks a one-second warning at the original target and attacks only after it ends', () => {
    const { s, e } = arena(); advanceEnemies(s, { x: 0, y: 0 });
    expect(e.mode).toBe('windup'); expect(e.timer).toBe(60); s.player.x = 510;
    for (let i = 0; i < 59; i++) expect(advanceEnemies(s, { x: 0, y: 0 })).toEqual([]);
    expect([e.x, e.y, e.targetX, e.targetY]).toEqual([320, 180, 500, 180]);
    expect(advanceEnemies(s, { x: 0, y: 0 })).toEqual([{ damage: 16, cause: '봉인술사의 봉인 폭발', slow: true }]);
    expect(e.mode).toBe('recover'); expect(e.timer).toBe(210); expect(s.cues.some(c => c.kind === 'blast')).toBe(true);
  });
  it.each(['outside', 'wall', 'jump'] as const)('does not hit a player protected by $0', protection => {
    const { s, e, p } = blast();
    if (protection === 'outside') p.x = 555;
    if (protection === 'wall') Object.assign(e, { targetX: 220, targetY: 100 }), Object.assign(p, { x: 220, y: 151 });
    if (protection === 'jump') p.height = 20;
    expect(advanceSpecialEnemy(s, e).hits).toEqual([]);
  });
  it('applies the slow only when the blast wins damage selection and actually hurts the player', () => {
    const a = blast(); step(a.s, emptyInput()); expect(a.p.hp).toBe(84); expect(a.p.slowTicks).toBe(120);
    for (const protection of ['dodge', 'hurt', 'stronger'] as const) {
      const b = blast();
      if (protection === 'dodge') Object.assign(b.p, { dodgeRemaining: .14, dodgeX: 0, dodgeY: 1 });
      if (protection === 'hurt') b.p.invulnerable = 20;
      if (protection === 'stronger') b.s.bullets.push({ id: b.s.nextId++, x: b.p.x, y: b.p.y, vx: 0, vy: 0, damage: 22, owner: 'enemy', life: 10 });
      step(b.s, emptyInput()); expect(b.p.slowTicks).toBeUndefined(); expect(b.p.hp).toBe(protection === 'stronger' ? 78 : 100);
    }
  });
  it('reduces only walking speed for two seconds and restores it without slowing dodge movement', () => {
    const a = arena(), b = arena(); a.e.mode = b.e.mode = 'recover'; a.e.timer = b.e.timer = 210;
    a.p.slowTicks = 120;
    const move = { ...emptyInput(), moveX: 1 }; step(a.s, move); step(b.s, move);
    expect(a.p.x - 500).toBeCloseTo((b.p.x - 500) * .8); expect(a.p.slowTicks).toBe(119);
    for (let i = 0; i < 119; i++) step(a.s, emptyInput()); expect(a.p.slowTicks).toBeUndefined();
    const slow = arena(), normal = arena(); slow.p.slowTicks = 120;
    for (const game of [slow, normal]) Object.assign(game.p, { dodgeRemaining: .2, dodgeX: 1, dodgeY: 0 });
    step(slow.s, emptyInput()); step(normal.s, emptyInput()); expect(slow.p.x).toBe(normal.p.x);
    expect(slow.p.dodgeRemaining).toBe(normal.p.dodgeRemaining);
  });
  it('freezes the fixed warning during frost or time stop and never attacks after death', () => {
    const { s, e } = arena(); advanceEnemies(s, { x: 0, y: 0 });
    e.frost = { hits: [], freezeTicks: 2, resistTicks: 0 }; advanceEnemies(s, { x: 0, y: 0 }); expect(e.timer).toBe(60);
    delete e.frost; s.player.x = 360; startTimeStop(s); advanceEnemies(s, { x: 0, y: 0 }); expect(e.timer).toBe(60);
    delete s.timeStop; damageEnemy(s, e, 55); expect(advanceSpecialEnemy(s, e).hits).toEqual([]); expect(e.mode).toBe('recover');
  });
  it('clears slowing and prepared blasts at combat end and after a fatal rescue', () => {
    const a = arena(); advanceEnemies(a.s, { x: 0, y: 0 }); a.p.slowTicks = 93; clearCombatEffects(a.s);
    expect(a.p.slowTicks).toBeUndefined(); expect(a.e.mode).toBe('recover'); expect(a.e.timer).toBe(210);
    const b = blast(); b.p.hp = 8; b.p.slowTicks = 25; b.s.expedition!.relics = ['R20'];
    step(b.s, emptyInput()); expect(b.p.hp).toBe(1); expect(b.p.slowTicks).toBeUndefined();
  });
  it.each(['warning', 'slow'] as const)('saves and resumes the $0 state with identical combat', async state => {
    const { s, e, p } = arena(); advanceEnemies(s, { x: 0, y: 0 });
    if (state === 'slow') { e.timer = 1; step(s, emptyInput()); } else { p.slowTicks = 83; }
    expect(validRun(s)).toBe(true); const store = new SaveStore(`seal-${state}`); await store.load(); await store.save(s, defaultSettings());
    const restored = (await store.load())!.run!;
    for (let i = 0; i < 140; i++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s);
  });
  it('rejects invalid slow duration, caster health, modes and out-of-bounds warning targets', () => {
    const { s, e, p } = arena(); advanceEnemies(s, { x: 0, y: 0 }); p.slowTicks = 120; expect(validRun(s)).toBe(true);
    for (const value of [0, 121, -1, 1.5, Infinity]) {
      const copy = structuredClone(s); Object.assign(copy.player, { slowTicks: value }); expect(validRun(copy)).toBe(false);
    }
    for (const patch of [{ timer: 61 }, { timer: 0 }, { maxHp: 56 }, { mode: 'charge' }, { targetX: -1000 }, { targetY: Infinity }]) {
      const copy = structuredClone(s); Object.assign(copy.enemies[0], patch); expect(validRun(copy)).toBe(false);
    }
    const old = createRun(42); expect(validRun(old)).toBe(true);
    Object.assign(old.player, { slowTicks: 60 }); expect(validRun(old)).toBe(false); expect(e.targetX).toBe(500);
  });
  it('adds seal casters to new second-region encounters while preserving encounter limits', () => {
    const s = createDungeonRun(42); s.expedition!.room = 8; s.expedition!.dungeon!.rooms[8].visited = s.expedition!.dungeon!.rooms[8].cleared = true;
    s.boss = createBoss(s); s.boss.hp = 0; s.phase = 'cleared'; enterNextRegion(s);
    for (let id = 1; id <= 5; id++) {
      const copy = structuredClone(s), from = adjacentRooms(copy, id)[0].room;
      copy.expedition!.room = from.id; from.visited = from.cleared = true;
      travel(copy, adjacentRooms(copy).find(d => d.room.id === id)!.direction);
      expect(copy.enemies.some(e => e.kind === ('sealcaster' as Enemy['kind']) && e.hp === 55)).toBe(true);
      expect(copy.enemies.length).toBeGreaterThanOrEqual(7); expect(copy.enemies.length).toBeLessThanOrEqual(10); expect(validRun(copy)).toBe(true);
    }
  });
});
