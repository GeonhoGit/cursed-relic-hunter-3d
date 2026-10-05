import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createRun, emptyInput, step } from '../src/core/simulation';
import { advanceEnemies } from '../src/core/enemy-ai';
import type { Bullet, Enemy, Point, RunState } from '../src/core/model';
import { distance, visible } from '../src/core/geometry';
import { roomLayout } from '../src/core/room-layout';
import { startTimeStop } from '../src/core/time-debt';
import { SaveStore, defaultSettings, validRun } from '../src/persistence/save';
import { advanceProjectiles, advanceBurn } from '../src/core/combat';
import { placeBomb, advanceBombs } from '../src/core/bombs';
import { landingImpact } from '../src/core/jump';
import { parryProjectile } from '../src/core/dodge';

type Shaman = Enemy & { summonPoints?: Point[]; burnDamage?: number };
type Arena = RunState & { riftSummonUsed?: true };
function arena(count = 1) {
  const s: Arena = createRun(42); s.phase = 'combat'; s.readyTicks = 0;
  s.player.x = 500; s.player.y = 180;
  const e: Shaman = { id: s.nextId++, kind: 'riftshaman' as Enemy['kind'], x: 320, y: 180,
    hp: 80, maxHp: 80, angle: 0, mode: 'move', timer: 0, targetX: 500, targetY: 180, flash: 0 };
  s.enemies = [e];
  for (let i = 1; i < count; i++) s.enemies.push({ ...e, id: s.nextId++, kind: 'rat', x: 20 + i * 35, y: 320, hp: 30, maxHp: 30 });
  return { s, e };
}
function seal(s: RunState, damage = 10) {
  s.bullets.push({ id: s.nextId++, x: s.player.x - 1, y: s.player.y, vx: 110, vy: 0,
    owner: 'enemy', source: 'riftshaman' as Bullet['source'], life: 240, damage });
}
const weakTicks = (s: RunState) => (s.player as RunState['player'] & { weakTicks?: number }).weakTicks;
function weaken(s: RunState, ticks = 180) { Object.assign(s.player, { weakTicks: ticks }); }

describe('rift shaman summons', () => {
  it('reserves two safe positions and spawns two pursuing rats after 72 warning ticks', () => {
    const { s, e } = arena(8);
    // Keep the other bodies fixed so this test exercises the full two-rat summon.
    s.timeStop = { x: s.player.x, y: s.player.y, ticks: 90, enemyIds: s.enemies.slice(1).map(q => q.id), bulletIds: [] };
    advanceEnemies(s, { x: 0, y: 0 });
    expect(e.mode).toBe('windup'); expect(e.timer).toBe(72); expect(e.summonPoints).toHaveLength(2);
    expect(s.riftSummonUsed).toBe(true); const points = structuredClone(e.summonPoints!);
    for (const p of points) {
      expect(distance(p, s.player)).toBeGreaterThanOrEqual(96); expect(visible(p, p, 10, roomLayout(s).obstacles)).toBe(true);
    }
    for (let tick = 0; tick < 71; tick++) advanceEnemies(s, { x: 0, y: 0 });
    expect(s.enemies).toHaveLength(8); advanceEnemies(s, { x: 0, y: 0 });
    expect(s.enemies).toHaveLength(10); expect(e.summonPoints).toBeUndefined();
    const children = s.enemies.filter(q => q.spawnTicks === 48);
    expect(children.map(q => ({ x: q.x, y: q.y }))).toEqual(points);
    expect(children.every(q => q.kind === 'rat' && q.hp === 30)).toBe(true);
  });
  it('waits for two free slots while firing, and allows only one summon attempt per room', () => {
    const { s, e } = arena(10); advanceEnemies(s, { x: 0, y: 0 });
    expect(e.summonPoints).toBeUndefined(); expect(e.timer).toBe(42);
    s.enemies.splice(-2); e.mode = 'move'; e.timer = 0; advanceEnemies(s, { x: 0, y: 0 });
    expect(e.summonPoints).toHaveLength(2); e.timer = 1; advanceEnemies(s, { x: 0, y: 0 });
    s.enemies = [e, { ...e, id: s.nextId++, timer: 0, mode: 'move' }]; e.timer = 0; e.mode = 'move';
    advanceEnemies(s, { x: 0, y: 0 });
    expect(s.enemies.every(q => !(q as Shaman).summonPoints)).toBe(true);
    expect(e.timer).toBe(42);
  });
  it('cancels unsafe spawn locations without returning the used attempt', () => {
    const { s, e } = arena(); advanceEnemies(s, { x: 0, y: 0 });
    const p = e.summonPoints![0]; s.player.x = p.x; s.player.y = p.y;
    e.timer = 1; advanceEnemies(s, { x: 0, y: 0 });
    expect(s.enemies.filter(q => q.spawnTicks)).toHaveLength(1); expect(s.riftSummonUsed).toBe(true);
    expect(e.summonPoints).toBeUndefined();
  });
  it('freezes pending summons under frost and time stop and cancels them on death', () => {
    const { s, e } = arena(); s.player.x = 400; advanceEnemies(s, { x: 0, y: 0 });
    e.frost = { hits: [], freezeTicks: 2, resistTicks: 0 }; advanceEnemies(s, { x: 0, y: 0 }); expect(e.timer).toBe(72);
    delete e.frost; startTimeStop(s); advanceEnemies(s, { x: 0, y: 0 }); expect(e.timer).toBe(72);
    delete s.timeStop; e.hp = 0; step(s, emptyInput()); expect(s.enemies).toHaveLength(0);
    expect(s.riftSummonUsed).toBe(true); // The next wave in this same room must not get a fresh attempt.
  });
  it('fires one slow seal shot with a locked aim after the summon attempt', () => {
    const { s, e } = arena(); s.riftSummonUsed = true; advanceEnemies(s, { x: 0, y: 0 });
    expect(e.timer).toBe(42); s.player.y = 300;
    for (let tick = 0; tick < 42; tick++) advanceEnemies(s, { x: 0, y: 0 });
    expect(s.bullets).toHaveLength(1); expect(s.bullets[0]).toMatchObject({ vx: 110, vy: 0, damage: 10, source: 'riftshaman' });
    expect(e.timer).toBe(144);
  });
  it('saves a pending summon and resumes without spawning or spending it twice', async () => {
    const { s, e } = arena(8); advanceEnemies(s, { x: 0, y: 0 });
    for (let tick = 0; tick < 23; tick++) step(s, emptyInput()); expect(validRun(s)).toBe(true);
    const store = new SaveStore('rift-summon'); await store.load(); await store.save(s, defaultSettings());
    const restored = (await store.load())!.run!;
    for (let tick = 0; tick < 100; tick++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s); expect(e.summonPoints).toBeUndefined(); expect(s.enemies.length).toBeLessThanOrEqual(10);
  });
  it('rejects impossible reservations, over-budget summons and non-shaman fields', () => {
    const { s, e } = arena(8); advanceEnemies(s, { x: 0, y: 0 }); expect(validRun(s)).toBe(true);
    const check = (mutate: (bad: any) => void) => { const bad = structuredClone(s); mutate(bad); expect(validRun(bad)).toBe(false); };
    check(b => delete b.riftSummonUsed); check(b => b.riftSummonUsed = false);
    check(b => b.enemies[0].summonPoints = [e.summonPoints![0]]);
    check(b => b.enemies[0].summonPoints[0].x = Infinity);
    check(b => b.enemies[0].summonPoints[1] = b.enemies[0].summonPoints[0]);
    check(b => b.enemies[0].summonPoints[0] = { x: 224, y: 128 });
    check(b => b.enemies[0].mode = 'recover'); check(b => b.enemies[0].timer = 73);
    check(b => b.enemies.push({ ...b.enemies[1], id: b.nextId++ }));
    check(b => b.enemies[1].summonPoints = e.summonPoints);
  });
});

describe('seal weakness', () => {
  it('applies a three-second 20 percent reduction only after real damage, preserving existing shots', () => {
    const { s, e } = arena(); s.riftSummonUsed = true; e.mode = 'recover'; e.timer = 144;
    const old: Bullet = { id: s.nextId++, x: 450, y: 300, vx: 0, vy: 0, life: 240, owner: 'player', damage: 7 };
    s.bullets = [old]; seal(s); step(s, { ...emptyInput(), fire: true });
    expect(s.player.hp).toBe(90); expect(weakTicks(s)).toBe(180); expect(old.damage).toBe(7);
    expect(s.bullets.filter(b => b.owner === 'player').every(b => b.damage === 7)).toBe(true);
    s.player.fireCooldown = 0; step(s, { ...emptyInput(), fire: true });
    expect(s.bullets.at(-1)!.damage).toBeCloseTo(5.6);
    for (let tick = 0; tick < 179; tick++) step(s, emptyInput()); expect(weakTicks(s)).toBeUndefined();
  });
  it.each(['invulnerable', 'dodge', 'bigger-hit'] as const)('does not apply weakness when blocked by %s', blocked => {
    const { s, e } = arena(); e.timer = 144; e.mode = 'recover'; s.riftSummonUsed = true; seal(s);
    if (blocked === 'invulnerable') s.player.invulnerable = 10;
    if (blocked === 'dodge') { s.player.dodgeRemaining = .14; s.player.dodgeX = 1; s.player.dodgeY = 0; }
    if (blocked === 'bigger-hit') seal(s, 20), delete s.bullets[1].source;
    step(s, emptyInput()); expect(weakTicks(s)).toBeUndefined();
    expect(s.player.hp).toBe(blocked === 'bigger-hit' ? 80 : 100);
  });
  it('refreshes duration without stacking damage reduction', () => {
    const { s, e } = arena(); e.timer = 144; e.mode = 'recover'; s.riftSummonUsed = true; weaken(s, 60);
    seal(s); step(s, emptyInput());
    expect(weakTicks(s)).toBe(180); s.player.fireCooldown = 0; step(s, { ...emptyInput(), fire: true });
    expect(s.bullets.at(-1)!.damage).toBeCloseTo(5.6);
  });
  it('snapshots bomb and burn damage and applies weakness to new landing impacts', () => {
    const { s, e } = arena(); s.expedition!.relics = s.expedition!.acquired = ['R13', 'R07', 'R46'];
    s.player.x = 360; weaken(s); placeBomb(s, e); Object.assign(s.bombs![0], { ticks: 1 });
    Object.assign(s.player, { weakTicks: undefined }); advanceBombs(s); expect(e.hp).toBe(44);
    s.player.auxCooldown = 0; placeBomb(s, e); Object.assign(s.bombs![0], { ticks: 1 });
    weaken(s); e.hp = 80; advanceBombs(s); expect(e.hp).toBe(35);
    e.hp = 80; s.bullets = [{ id: s.nextId++, x: 332, y: 180, vx: -340, vy: 0, owner: 'player', life: 75, damage: 7 }];
    advanceProjectiles(s); expect(e.burnDamage).toBeCloseTo(1.6);
    Object.assign(s.player, { weakTicks: undefined }); e.burnPulse = 1; const hp = e.hp; advanceBurn(s); expect(e.hp).toBeCloseTo(hp - 1.6);
    weaken(s); s.player.x = 355; e.hp = 80; landingImpact(s); expect(e.hp).toBeCloseTo(70.4);
  });
  it.each(['R20', 'R38'] as const)('clears weakness on a fatal hit rescued by %s', relic => {
    const { s, e } = arena(); e.timer = 144; s.riftSummonUsed = true;
    s.expedition!.relics = s.expedition!.acquired = [relic]; s.player.hp = 5; weaken(s); seal(s); step(s, emptyInput());
    expect(s.player.hp).toBeGreaterThan(0); expect(weakTicks(s)).toBeUndefined();
  });
  it('clears weakness and pending summons when a room ends or the player dies', () => {
    const clear = arena(); clear.s.wave = 2; clear.s.enemies = []; weaken(clear.s); clear.s.riftSummonUsed = true;
    step(clear.s, emptyInput()); expect(clear.s.phase).toBe('cleared'); expect(weakTicks(clear.s)).toBeUndefined(); expect(clear.s.riftSummonUsed).toBeUndefined();
    const { s, e } = arena(); advanceEnemies(s, { x: 0, y: 0 }); s.player.hp = 5; weaken(s); seal(s);
    step(s, emptyInput()); expect(s.phase).toBe('dead'); expect(weakTicks(s)).toBeUndefined(); expect(e.summonPoints).toBeUndefined();
    expect(validRun(s)).toBe(true);
  });
  it('saves weakened reflected damage without weakening it again after restoration', async () => {
    const { s } = arena(); weaken(s); s.expedition!.relics = s.expedition!.acquired = ['R30'];
    Object.assign(s.player, { dodgeRemaining: .2, dodgeX: -1, dodgeY: 0 });
    const b: Bullet = { id: s.nextId++, x: 492, y: 180, vx: 110, vy: 0, owner: 'enemy', source: 'riftshaman' as Bullet['source'], life: 240, damage: 10 };
    s.bullets = [b]; expect(parryProjectile(s, b)).toBe(true); expect(b.damage).toBe(12);
    expect(validRun(s)).toBe(true);
    const store = new SaveStore('rift-parry'); await store.load(); await store.save(s, defaultSettings());
    const restored = (await store.load())!.run!; expect(restored.bullets[0].damage).toBe(12);
    restored.bullets[0].damage = 13; expect(validRun(restored)).toBe(false);
  });
  it('saves weakness and fractional burn damage, rejects corruption, and accepts legacy saves', async () => {
    const { s, e } = arena(); s.riftSummonUsed = true; e.timer = 100; e.mode = 'recover'; weaken(s, 93);
    e.burnTicks = 150; e.burnPulse = 12; e.burnDamage = 1.6;
    expect(validRun(s)).toBe(true); const store = new SaveStore('rift-weak'); await store.load(); await store.save(s, defaultSettings());
    const restored = (await store.load())!.run!; expect(weakTicks(restored)).toBe(93);
    for (let tick = 0; tick < 60; tick++) { step(s, emptyInput()); step(restored, emptyInput()); }
    expect(restored).toEqual(s);
    for (const invalid of [0, -1, 181, 1.5, Infinity]) { const bad = structuredClone(s); Object.assign(bad.player, { weakTicks: invalid }); expect(validRun(bad)).toBe(false); }
    const bad = structuredClone(s); (bad.enemies[0] as Shaman).burnDamage = 20; expect(validRun(bad)).toBe(false);
    expect(validRun(createRun(42))).toBe(true);
  });
});
