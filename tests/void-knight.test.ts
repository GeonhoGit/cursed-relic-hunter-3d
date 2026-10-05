import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createRun, createDungeonRun, emptyInput, step, travel } from '../src/core/simulation';
import { advanceSpecialEnemy } from '../src/core/enemy-special';
import { advanceEnemies } from '../src/core/enemy-ai';
import { BOUNDS, type Enemy, type Point } from '../src/core/model';
import { distance, visible } from '../src/core/geometry';
import { roomLayout } from '../src/core/room-layout';
import { startTimeStop } from '../src/core/time-debt';
import { damageEnemy } from '../src/core/combat';
import { clearCombatEffects } from '../src/core/player-effects';
import { SaveStore, defaultSettings, validRun } from '../src/persistence/save';
import { createBoss } from '../src/core/boss';
import { enterNextRegion } from '../src/core/region';
import { adjacentRooms } from '../src/core/dungeon';
import { spikeTraps } from '../src/core/traps';

type Knight = Enemy & { blinkTarget?: Point; blinkTick?: number };
function arena(near = false) {
  const s = createRun(42); s.phase = 'combat'; s.readyTicks = 0;
  s.player.x = near ? 360 : 500; s.player.y = 180;
  const e: Knight = { id: s.nextId++, kind: 'voidknight' as Enemy['kind'], x: 320, y: 180,
    hp: 140, maxHp: 140, angle: 0, mode: 'move', timer: 0, targetX: s.player.x, targetY: 180, flash: 0 };
  s.enemies = [e]; return { s, e };
}

describe('void knight', () => {
  it('warns for one second at a fixed safe destination, then gives a separate slash warning', () => {
    const { s, e } = arena(), origin = { x: e.x, y: e.y };
    advanceSpecialEnemy(s, e); expect(e.mode).toBe('windup'); expect(e.timer).toBe(60);
    const target = { ...e.blinkTarget! }; expect(target.x).toBeTypeOf('number');
    expect(distance(target, s.player)).toBeGreaterThan(72);
    expect(visible(target, target, 10, roomLayout(s).walls)).toBe(true);
    for (let i = 0; i < 59; i++) expect(advanceSpecialEnemy(s, e).hits).toEqual([]);
    expect({ x: e.x, y: e.y }).toEqual(origin); expect(e.blinkTarget).toEqual(target);
    expect(advanceSpecialEnemy(s, e).hits).toEqual([]);
    expect({ x: e.x, y: e.y }).toEqual(target); expect(e.blinkTarget).toBeUndefined(); expect(e.timer).toBe(24);
    for (let i = 0; i < 23; i++) expect(advanceSpecialEnemy(s, e).hits).toEqual([]);
    expect(advanceSpecialEnemy(s, e).hits).toEqual([{ damage: 20, cause: '공허 기사의 원형 베기' }]);
    expect(e.mode).toBe('recover'); expect(e.timer).toBe(240);
  });

  it('prioritizes a nearby circular slash and pursues after its short recovery without restarting the attack', () => {
    const { s, e } = arena(true); advanceEnemies(s, { x: 0, y: 0 });
    expect(e.mode).toBe('windup'); expect(e.timer).toBe(24); expect(e.blinkTarget).toBeUndefined();
    e.timer = 1; step(s, emptyInput()); expect(s.player.hp).toBe(80);
    const origin = { x: e.x, y: e.y };
    for (let i = 0; i < 24; i++) advanceEnemies(s, { x: 0, y: 0 });
    expect(e.x).toBe(origin.x);
    advanceEnemies(s, { x: 0, y: 0 }); expect(e.x).toBeGreaterThan(origin.x);
    expect(e.mode).toBe('recover'); expect(e.timer).toBe(215);
  });

  it.each(['player', 'enemy', 'wall'] as const)('cancels an unsafe landing occupied by $0 and spends its cooldown', blocker => {
    const { s, e } = arena(); advanceSpecialEnemy(s, e);
    const origin = { x: e.x, y: e.y }, point = e.blinkTarget!;
    if (blocker === 'player') s.player.x = point.x; else if (blocker === 'enemy') s.enemies.push({ ...e, id: s.nextId++, kind: 'rat', x: point.x, y: point.y });
    else { e.blinkTarget = { x: 224, y: 128 }; e.targetX = 224; e.targetY = 128; }
    if (blocker === 'player') s.player.y = point.y;
    e.timer = 1; expect(advanceSpecialEnemy(s, e).hits).toEqual([]);
    expect({ x: e.x, y: e.y }).toEqual(origin); expect(e.blinkTarget).toBeUndefined();
    expect(e.mode).toBe('recover'); expect(e.timer).toBe(240);
  });

  it('does not teleport to the 72u exclusion boundary or reselect a target during its warning', () => {
    const { s, e } = arena(); advanceSpecialEnemy(s, e);
    e.blinkTarget = { x: s.player.x - 72, y: s.player.y }; e.targetX = e.blinkTarget.x; e.targetY = e.blinkTarget.y;
    const origin = { x: e.x, y: e.y }; e.timer = 1;
    advanceSpecialEnemy(s, e); expect({ x: e.x, y: e.y }).toEqual(origin); expect(e.timer).toBe(240);
  });

  it('reserves different destinations for two knights and avoids body and trap occupancy', () => {
    const { s, e } = arena(), other: Knight = { ...e, id: s.nextId++ };
    s.enemies.push(other); advanceSpecialEnemy(s, e); advanceSpecialEnemy(s, other);
    expect(e.blinkTarget).toBeDefined(); expect(other.blinkTarget).toBeDefined();
    expect(distance(e.blinkTarget!, other.blinkTarget!)).toBeGreaterThanOrEqual(28);
    for (const knight of [e, other]) {
      expect(visible(knight.blinkTarget!, knight.blinkTarget!, 10, spikeTraps(s))).toBe(true);
      expect(s.enemies.every(body => body.id === knight.id || distance(body, knight.blinkTarget!) >= 28)).toBe(true);
    }
  });

  it('accepts a newly occupied reservation on disk and cancels it safely after resume', async () => {
    const { s, e } = arena(); advanceSpecialEnemy(s, e);
    Object.assign(s.player, e.blinkTarget); e.timer = 1; expect(validRun(s)).toBe(true);
    const store = new SaveStore('void-occupied'); await store.load(); await store.save(s, defaultSettings());
    const restored = (await store.load())!.run!, knight = restored.enemies[0];
    advanceSpecialEnemy(restored, knight);
    expect([knight.x, knight.y]).toEqual([e.x, e.y]); expect(knight.blinkTarget).toBeUndefined(); expect(knight.timer).toBe(240);
  });

  it('does not treat the teleport path through the player as moving contact damage', () => {
    const { s, e } = arena(); s.player.x = 320; e.x = 200;
    Object.assign(e, { mode: 'windup', timer: 1, blinkTarget: { x: 404, y: 180 }, targetX: 404, targetY: 180 });
    step(s, emptyInput()); expect(e.x).toBe(404); expect(s.player.hp).toBe(100); expect(s.stats.hits).toBe(0);
    expect(e.blinkTick).toBe(s.tick);
  });

  it.each([
    { name: 'outside the circle', ex: 320, ey: 180, px: 417, py: 180, height: 0 },
    { name: 'behind a wall', ex: 220, ey: 96, px: 220, py: 157, height: 0 },
    { name: 'above the blade', ex: 320, ey: 180, px: 360, py: 180, height: 60 },
  ])('does not hit a player $name', p => {
    const { s, e } = arena(true); Object.assign(e, { x: p.ex, y: p.ey, mode: 'windup', timer: 1 });
    Object.assign(s.player, { x: p.px, y: p.py, height: p.height });
    expect(advanceSpecialEnemy(s, e).hits).toEqual([]);
  });

  it('hits behind itself with a circular attack but honors actual dodge and hurt invulnerability', () => {
    const { s, e } = arena(true); s.player.x = 280; e.mode = 'windup'; e.timer = 1;
    expect(advanceSpecialEnemy(s, e).hits).toEqual([{ damage: 20, cause: '공허 기사의 원형 베기' }]);
    for (const immunity of ['dodge', 'hurt'] as const) {
      const a = arena(true); a.e.mode = 'windup'; a.e.timer = 1;
      if (immunity === 'dodge') Object.assign(a.s.player, { dodgeRemaining: .14, dodgeX: 0, dodgeY: 1 }); else a.s.player.invulnerable = 20;
      step(a.s, emptyInput()); expect(a.s.player.hp).toBe(100);
    }
  });

  it('holds its exact reservation while frozen, time-stopped or preparing to spawn', () => {
    const { s, e } = arena(); advanceSpecialEnemy(s, e); const before = structuredClone(e);
    e.frost = { hits: [], freezeTicks: 2, resistTicks: 0 }; advanceEnemies(s, { x: 0, y: 0 }); expect(e.timer).toBe(60);
    delete e.frost; s.player.x = 360; startTimeStop(s); advanceEnemies(s, { x: 0, y: 0 }); expect(e.timer).toBe(60);
    delete s.timeStop; e.spawnTicks = 2; advanceEnemies(s, { x: 0, y: 0 }); expect(e.timer).toBe(60);
    expect(e.blinkTarget).toEqual(before.blinkTarget); expect([e.x, e.y]).toEqual([before.x, before.y]);
  });

  it('clears pending landings when the knight dies or combat ends and never attacks after death', () => {
    const { s, e } = arena(); advanceSpecialEnemy(s, e); damageEnemy(s, e, 140);
    expect(e.blinkTarget).toBeUndefined(); expect(advanceSpecialEnemy(s, e).hits).toEqual([]);
    const other = arena(); advanceSpecialEnemy(other.s, other.e); clearCombatEffects(other.s);
    expect(other.e.blinkTarget).toBeUndefined(); expect(other.e.mode).toBe('recover'); expect(other.e.timer).toBe(240);
  });

  it.each(['blink', 'slash', 'recover'] as const)('saves and resumes the $0 phase with the same future', async phase => {
    const { s, e } = arena(); advanceSpecialEnemy(s, e);
    if (phase !== 'blink') { e.timer = 1; advanceSpecialEnemy(s, e); }
    if (phase === 'recover') { e.timer = 1; advanceSpecialEnemy(s, e); }
    expect(validRun(s)).toBe(true);
    const store = new SaveStore(`void-knight-${phase}`); await store.load(); await store.save(s, defaultSettings());
    const restored = (await store.load())!.run!;
    for (let i = 0; i < 180; i++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s);
  });

  it('rejects invalid timers, coordinates, cross-kind reservations and future teleport ticks', () => {
    const { s, e } = arena(); advanceSpecialEnemy(s, e); expect(validRun(s)).toBe(true);
    for (const patch of [
      { timer: 61 }, { timer: 0 }, { mode: 'recover' }, { hp: 0 }, { maxHp: 139 },
      { blinkTarget: { x: NaN, y: 180 } }, { blinkTarget: { x: BOUNDS.x, y: 180 } },
      { blinkTarget: { x: 224, y: 128 }, targetX: 224, targetY: 128 }, { targetX: -500 }, { blinkTick: 1 }, { kind: 'rat' },
    ]) {
      const copy = structuredClone(s); Object.assign(copy.enemies[0], patch); expect(validRun(copy), JSON.stringify(patch)).toBe(false);
    }
    const legacy = createRun(42); expect(validRun(legacy)).toBe(true);
    Object.assign(legacy.enemies[0], { blinkTick: 0 }); expect(validRun(legacy)).toBe(false);
  });

  it('adds the knight only to new third-region encounters and keeps destinations clear in all room structures', () => {
    const s = createDungeonRun(42);
    for (let i = 0; i < 2; i++) {
      const boss = s.expedition!.dungeon!.rooms[8]; s.expedition!.room = 8; boss.visited = boss.cleared = true;
      s.boss = createBoss(s); s.boss.hp = 0; s.phase = 'cleared'; enterNextRegion(s);
    }
    for (let id = 1; id <= 5; id++) {
      const copy = structuredClone(s), from = adjacentRooms(copy, id)[0].room;
      copy.expedition!.room = from.id; from.visited = from.cleared = true;
      travel(copy, adjacentRooms(copy).find(d => d.room.id === id)!.direction);
      expect(copy.enemies.some(e => e.kind === ('voidknight' as Enemy['kind']) && e.hp === 140)).toBe(true);
      expect(copy.enemies.length).toBeGreaterThanOrEqual(8); expect(copy.enemies.length).toBeLessThanOrEqual(10); expect(validRun(copy)).toBe(true);
    }
    for (let structure = 0; structure < 10; structure++) {
      const copy = structuredClone(s); copy.expedition!.room = 1; copy.expedition!.dungeon!.rooms[1].structure = structure;
      copy.player.x = 500; copy.player.y = 180; copy.phase = 'combat';
      const knight = { ...arena().e, id: copy.nextId++ }; copy.enemies = [knight];
      advanceEnemies(copy, { x: 0, y: 0 }); expect(knight.blinkTarget).toBeDefined();
      const point = knight.blinkTarget!;
      expect(visible(point, point, 10, roomLayout(copy).walls)).toBe(true);
      expect(visible(point, point, 10, spikeTraps(copy))).toBe(true); expect(distance(point, copy.player)).toBeGreaterThan(72);
    }
  });
});
