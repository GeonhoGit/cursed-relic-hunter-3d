import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createRun, emptyInput, step } from '../src/core/simulation';
import type { Enemy } from '../src/core/model';
import { advanceSpecialEnemy } from '../src/core/enemy-special';
import { advanceEnemies } from '../src/core/enemy-ai';
import { startTimeStop } from '../src/core/time-debt';
import { SaveStore, defaultSettings, validRun } from '../src/persistence/save';

type Guardian = Enemy & { comboStrike?: 1 | 2 };
function encounter() {
  const s = createRun(42); s.phase = 'combat'; s.readyTicks = 0;
  s.player.x = 360; s.player.y = 180;
  const e: Guardian = { id: s.nextId++, kind: 'heartguard' as Enemy['kind'], x: 320, y: 180,
    hp: 120, maxHp: 120, angle: 0, mode: 'move', timer: 0, targetX: 360, targetY: 180, flash: 0 };
  s.enemies = [e]; return { s, e };
}

describe('heart guardian', () => {
  it('warns before each strike and leaves a full three-second cooldown after the combo', () => {
    const { s, e } = encounter();
    advanceSpecialEnemy(s, e); expect(e.mode).toBe('windup'); expect(e.timer).toBe(42);
    const origin = { x: e.x, y: e.y };
    for (let tick = 0; tick < 41; tick++) expect(advanceSpecialEnemy(s, e).hits).toEqual([]);
    expect(advanceSpecialEnemy(s, e).hits).toEqual([{ damage: 16, cause: '심장 수호병의 첫 베기' }]);
    expect({ x: e.x, y: e.y }).toEqual(origin); expect(e.mode).toBe('recover'); expect(e.timer).toBe(18);
    for (let tick = 0; tick < 18; tick++) expect(advanceSpecialEnemy(s, e).hits).toEqual([]);
    expect(e.mode).toBe('windup'); expect(e.timer).toBe(30);
    for (let tick = 0; tick < 29; tick++) expect(advanceSpecialEnemy(s, e).hits).toEqual([]);
    expect(advanceSpecialEnemy(s, e).hits).toEqual([{ damage: 16, cause: '심장 수호병의 후속 베기' }]);
    expect(e.mode).toBe('recover'); expect(e.timer).toBe(180); expect(e.comboStrike).toBeUndefined();
    for (let tick = 0; tick < 179; tick++) expect(advanceSpecialEnemy(s, e).hits).toEqual([]);
    expect(e.timer).toBe(1);
  });
  it('locks the first aim but reacquires the player before the follow-up warning', () => {
    const { s, e } = encounter(); advanceSpecialEnemy(s, e);
    s.player.x = 280; e.timer = 1;
    expect(advanceSpecialEnemy(s, e).hits).toEqual([]);
    for (let tick = 0; tick < 18; tick++) advanceSpecialEnemy(s, e);
    expect(e.targetX).toBe(280); expect(Math.abs(e.angle)).toBeCloseTo(Math.PI);
    e.timer = 1; expect(advanceSpecialEnemy(s, e).hits[0]?.damage).toBe(16);
  });
  it.each([
    { name: 'beyond the blade', ex: 320, ey: 180, px: 400, py: 180, angle: 0, height: 0 },
    { name: 'behind the guardian', ex: 320, ey: 180, px: 280, py: 180, angle: 0, height: 0 },
    { name: 'behind a pillar', ex: 220, ey: 96, px: 220, py: 157, angle: Math.PI / 2, height: 0 },
    { name: 'above the blade', ex: 320, ey: 180, px: 360, py: 180, angle: 0, height: 60 },
  ])('does not hit a player $name', p => {
    const { s, e } = encounter(); Object.assign(e, { x: p.ex, y: p.ey, angle: p.angle, mode: 'windup', timer: 1, comboStrike: 1 });
    Object.assign(s.player, { x: p.px, y: p.py, height: p.height });
    expect(advanceSpecialEnemy(s, e).hits).toEqual([]);
  });
  it('pursues during normal recovery but stays still during the combo and time stop', () => {
    const { s, e } = encounter(); e.mode = 'recover'; e.timer = 120; s.player.x = 500;
    advanceEnemies(s, { x: 0, y: 0 }); expect(e.x).toBeGreaterThan(320);
    e.mode = 'windup'; e.timer = 20; e.comboStrike = 1;
    const x = e.x; advanceEnemies(s, { x: 0, y: 0 }); expect(e.x).toBe(x); expect(e.timer).toBe(19);
    s.player.x = 360; startTimeStop(s); advanceEnemies(s, { x: 0, y: 0 }); expect(e.timer).toBe(19);
    delete s.timeStop; e.frost = { hits: [], freezeTicks: 3, resistTicks: 0 };
    advanceEnemies(s, { x: 0, y: 0 }); expect(e.timer).toBe(19); expect(e.frost.freezeTicks).toBe(2);
  });
  it('can damage twice despite normal hit invulnerability and honors dodge invulnerability', () => {
    const { s, e } = encounter();
    for (let tick = 0; tick < 91; tick++) step(s, emptyInput());
    expect(s.player.hp).toBe(68); expect(s.stats.hits).toBe(2);
    const dodging = encounter(); Object.assign(dodging.e, { mode: 'windup', timer: 1, comboStrike: 1 });
    dodging.s.player.dodgeRemaining = 0.14; dodging.s.player.dodgeX = 0; dodging.s.player.dodgeY = 1;
    step(dodging.s, emptyInput()); expect(dodging.s.player.hp).toBe(100);
    e.hp = 0; e.mode = 'windup'; e.timer = 1; e.comboStrike = 1;
    expect(advanceSpecialEnemy(s, e).hits).toEqual([]);
  });
  it.each([
    { mode: 'windup', timer: 21, comboStrike: 1 },
    { mode: 'recover', timer: 9, comboStrike: 2 },
    { mode: 'windup', timer: 15, comboStrike: 2 },
    { mode: 'recover', timer: 150 },
  ] as const)('saves and resumes $mode with timer $timer exactly', async phase => {
    const { s, e } = encounter(); Object.assign(e, phase);
    expect(validRun(s)).toBe(true);
    const store = new SaveStore(`heart-guardian-${phase.mode}-${phase.timer}`); await store.load();
    await store.save(s, defaultSettings()); const restored = (await store.load())!.run!;
    for (let tick = 0; tick < 100; tick++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s);
  });
  it('rejects impossible combo state and keeps old enemy snapshots valid', () => {
    const { s, e } = encounter();
    expect(validRun(s)).toBe(true);
    for (const phase of [
      { mode: 'windup', timer: 42, comboStrike: undefined },
      { mode: 'windup', timer: 31, comboStrike: 2 },
      { mode: 'recover', timer: 19, comboStrike: 2 },
      { mode: 'recover', timer: 9, comboStrike: 1 },
      { mode: 'move', timer: 0, comboStrike: 2 },
      { mode: 'charge', timer: 1, comboStrike: undefined },
    ]) {
      Object.assign(e, phase); expect(validRun(s)).toBe(false);
    }
    const legacy = createRun(42); expect(validRun(legacy)).toBe(true);
    (legacy.enemies[0] as Guardian).comboStrike = 1; expect(validRun(legacy)).toBe(false);
  });
});
