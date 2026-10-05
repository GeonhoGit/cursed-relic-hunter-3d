import { describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { createDungeonRun, createRun, emptyInput, step } from '../src/core/simulation';
import { advanceProjectiles, damageEnemy } from '../src/core/combat';
import { advanceEnemies } from '../src/core/enemy-ai';
import { createBoss, advanceBoss, startBossPattern } from '../src/core/boss';
import { beginGrowthRun, emptyInvestment } from '../src/core/growth';
import { canAcquireRelic, grantRelic } from '../src/core/relic-acquisition';
import { blocksGuardShot } from '../src/core/enemy-special';
import { prepareReward } from '../src/core/expedition';
import { RELIC_IDS } from '../src/core/relics';
import { SaveStore, defaultSettings, validRun } from '../src/persistence/save';
import { clearCombatEffects } from '../src/core/player-effects';
import type { Bullet, Enemy, RelicId, RunState } from '../src/core/model';

const R12 = 'R12' as RelicId;
function arena() {
  const s = createRun(42); s.phase = 'combat'; s.player.x = 90; s.player.y = 180;
  s.expedition!.relics = s.expedition!.acquired = [R12];
  const e: Enemy = { id: s.nextId++, kind: 'shield', x: 150, y: 180, hp: 70, maxHp: 70,
    mode: 'recover', timer: 120, angle: Math.PI, targetX: 90, targetY: 180, flash: 0 };
  s.enemies = [e]; return { s, e };
}
function hit(s: RunState, e: { x: number; y: number }, extra: Partial<Bullet> = {}) {
  const id = s.nextId++;
  s.bullets.push({ id, eventId: id, owner: 'player', x: e.x - 11, y: e.y, vx: 320, vy: 0,
    damage: 7, life: 75, hitIds: [], ...extra }); advanceProjectiles(s);
}
function boss() {
  const s = createDungeonRun(42); s.expedition!.room = 8; s.expedition!.dungeon!.rooms[8].visited = true;
  const treasure = s.expedition!.dungeon!.rooms[6]; treasure.visited = treasure.cleared = true;
  treasure.reward = { room: 6, candidates: [R12], choice: R12 };
  s.expedition!.relics = s.expedition!.acquired = [R12]; s.phase = 'combat'; s.player.x = 90; s.player.y = 180;
  s.boss = createBoss(s); startBossPattern(s, 'shield'); return { s, b: s.boss };
}

describe('rift lens', () => {
  it('uses the existing G01 unlock and rejects acquisition before any combat clear', () => {
    expect(RELIC_IDS).toContain(R12); const s = createDungeonRun(42);
    expect(canAcquireRelic(s, R12)).toBe(false); expect(grantRelic(s, R12)).toBe(false);
    const room = s.expedition!.dungeon!.rooms[1]; room.visited = room.cleared = true;
    expect(grantRelic(s, R12)).toBe(true); expect(grantRelic(s, R12)).toBe(false);
    const next = createDungeonRun(1); beginGrowthRun(next, emptyInvestment(), 'lens-unlock', true);
    expect(canAcquireRelic(next, R12)).toBe(true);
  });
  it('offers the lens as the remaining normal reward after G01', () => {
    const s = createRun(42); s.phase = 'cleared';
    s.expedition!.acquired = s.expedition!.relics = RELIC_IDS.filter(id => !['R12','R38','R43'].includes(id));
    prepareReward(s); expect(s.expedition!.reward!.candidates).toEqual([R12]);
  });
  it('disables a front shield before damage and preserves its durability', () => {
    const { s, e } = arena(); e.shieldHp = 28; hit(s, e);
    expect(e.hp).toBe(63); expect(e.shieldHp).toBe(28); expect(e.shieldDisabledTicks).toBe(120); expect(e.lensCooldown).toBe(300);
    hit(s, e); expect(e.hp).toBe(56); expect(e.shieldDisabledTicks).toBe(120); expect(e.lensCooldown).toBe(300);
  });
  it('restores the shield on tick120 and reopens the lens on tick300 independently of attack cooldowns', () => {
    const { s, e } = arena(); hit(s, e);
    for (let i = 0; i < 119; i++) advanceEnemies(s, { x: 0, y: 0 });
    expect(blocksGuardShot(e, { x: e.x + Math.cos(e.angle), y: e.y + Math.sin(e.angle) })).toBe(false);
    advanceEnemies(s, { x: 0, y: 0 }); expect(e.shieldDisabledTicks).toBeUndefined(); expect(e.lensCooldown).toBe(180);
    e.angle = Math.PI; hit(s, e); expect(e.hp).toBe(63); expect(e.shieldHp).toBe(28);
    for (let i = 0; i < 179; i++) advanceEnemies(s, { x: 0, y: 0 });
    expect(e.lensCooldown).toBe(1); e.angle = Math.PI; hit(s, e); expect(e.hp).toBe(63);
    advanceEnemies(s, { x: 0, y: 0 }); expect(e.lensCooldown).toBeUndefined();
    e.angle = Math.PI; hit(s, e); expect(e.hp).toBe(56); expect(e.shieldDisabledTicks).toBe(120);
  });
  it('keeps cooldowns per enemy and does not consume the lens on rear hits or broken shields', () => {
    const { s, e } = arena(); const other = { ...e, id: s.nextId++, x: 190 }; s.enemies.push(other);
    hit(s, e); hit(s, other); expect(e.hp).toBe(63); expect(other.hp).toBe(63); expect(other.lensCooldown).toBe(300);
    const rear = arena(); rear.e.angle = 0; hit(rear.s, rear.e);
    expect(rear.e.hp).toBe(63); expect(rear.e.lensCooldown).toBeUndefined();
    const broken = arena(); broken.e.shieldHp = 0; hit(broken.s, broken.e);
    expect(broken.e.hp).toBe(63); expect(broken.e.shieldDisabledTicks).toBeUndefined(); expect(broken.e.lensCooldown).toBeUndefined();
  });
  it.each(['split', 'reflected'] as const)('keeps %s projectiles blocked and damaging shield durability', kind => {
    const { s, e } = arena(); hit(s, e, { kind }); expect(e.hp).toBe(70); expect(e.shieldHp).toBe(28);
    expect(e.lensCooldown).toBeUndefined(); expect(s.bullets).toEqual([]);
  });
  it('lets the release shot apply burn, frost, split and piercing effects after direct damage', () => {
    const { s, e } = arena(); s.expedition!.relics = s.expedition!.acquired = [R12, 'R02', 'R03', 'R07', 'R08'];
    hit(s, e); expect(e.hp).toBe(63); expect(e.burnTicks).toBe(180); expect(e.frost?.hits).toHaveLength(1);
    expect(s.bullets.filter(b => b.kind === 'split')).toHaveLength(3); expect(s.bullets.find(b => !b.kind)?.hitIds).toEqual([e.id]);
  });
  it('preserves normal shield breaking without the lens and gives no extra damage to unshielded targets', () => {
    const absent = arena(); absent.s.expedition!.relics = []; absent.e.shieldHp = 7; hit(absent.s, absent.e);
    expect(absent.e.hp).toBe(70); expect(absent.e.shieldHp).toBe(0); expect(absent.e.lensCooldown).toBeUndefined();
    hit(absent.s, absent.e); expect(absent.e.hp).toBe(63);
    const ordinary = arena(); ordinary.e.kind = 'archer'; hit(ordinary.s, ordinary.e);
    expect(ordinary.e.hp).toBe(63); expect(ordinary.e.lensCooldown).toBeUndefined();
  });
  it('ends the gatekeeper shield stance into full recovery, then resumes the fan pattern', () => {
    const { s, b } = boss(); hit(s, b); expect(b.hp).toBe(1793); expect(b.mode).toBe('recover'); expect(b.timer).toBe(72);
    expect(b.pattern).toBe('shield'); expect(b.lensCooldown).toBe(300);
    for (let i = 0; i < 71; i++) advanceBoss(s); expect(b.mode).toBe('recover');
    advanceBoss(s); expect(b.mode).toBe('windup'); expect(b.pattern).toBe('fan'); expect(b.lensCooldown).toBe(228);
  });
  it('cannot remove phase immunity or the heart pillar shield and keeps the cooldown through phase transitions', () => {
    const { s, b } = boss(); b.hp = 901; hit(s, b);
    expect(b.mode).toBe('transition'); expect(b.lensCooldown).toBe(300); const hp = b.hp;
    hit(s, b); expect(b.hp).toBe(hp); expect(b.lensCooldown).toBe(300);
    const fresh = boss(); fresh.b.mode = 'transition'; fresh.b.stage = 2; hit(fresh.s, fresh.b);
    expect(fresh.b.hp).toBe(1800); expect(fresh.b.lensCooldown).toBeUndefined();
    const heart = boss(); Object.assign(heart.b, { kind: 'relicheart', mode: 'windup', pattern: 'pulse', stage: 2, pillarIndex: 0, pillarHp: 100 });
    hit(heart.s, heart.b); expect(heart.b.hp).toBe(1800); expect(heart.b.lensCooldown).toBeUndefined();
  });
  it('does not let bomb or burn damage activate the lens', () => {
    const { s, e } = arena(); damageEnemy(s, e, 2); expect(e.hp).toBe(68);
    expect(e.shieldDisabledTicks).toBeUndefined(); expect(e.lensCooldown).toBeUndefined();
  });
  it('allows returning basic shots but consumes no cooldown on rear boss hits', () => {
    const returning = arena(); returning.s.player.x = 200;
    hit(returning.s, returning.e, { x: 139, phase: 'return', outboundHits: [] });
    expect(returning.e.hp).toBe(63); expect(returning.e.shieldDisabledTicks).toBe(120);
    const rear = boss(); rear.b.angle = 0; hit(rear.s, rear.b);
    expect(rear.b.hp).toBe(1793); expect(rear.b.mode).toBe('shield'); expect(rear.b.lensCooldown).toBeUndefined();
  });
  it('does not propagate burn or split from a block while the target lens is cooling down', () => {
    const { s, e } = arena(); hit(s, e);
    for (let i = 0; i < 120; i++) advanceEnemies(s, { x: 0, y: 0 });
    s.expedition!.relics.push('R03', 'R07'); e.angle = Math.PI; hit(s, e);
    expect(e.hp).toBe(63); expect(e.burnTicks).toBeUndefined(); expect(s.bullets).toEqual([]);
    expect(e.shieldHp).toBe(28); expect(e.lensCooldown).toBe(180);
  });
  it('keeps an active lens effect and cooldown after the relic is lost, without granting it again', () => {
    const { s, e } = arena(); hit(s, e); s.expedition!.relics = [];
    expect(validRun(s)).toBe(true); advanceEnemies(s, { x: 0, y: 0 });
    expect(e.shieldDisabledTicks).toBe(119); expect(e.lensCooldown).toBe(299);
    expect(grantRelic(s, R12)).toBe(false);
  });
  it('pauses shield timers during enemy freeze and time stop, then resumes them', () => {
    const { s, e } = arena(); hit(s, e); e.frost = { hits: [], freezeTicks: 1, resistTicks: 1 };
    advanceEnemies(s, { x: 0, y: 0 }); expect(e.shieldDisabledTicks).toBe(120); expect(e.lensCooldown).toBe(300);
    s.timeStop = { x: 90, y: 180, ticks: 2, enemyIds: [e.id], bulletIds: [] };
    advanceEnemies(s, { x: 0, y: 0 }); expect(e.lensCooldown).toBe(300);
    delete s.timeStop; advanceEnemies(s, { x: 0, y: 0 }); expect(e.shieldDisabledTicks).toBe(119); expect(e.lensCooldown).toBe(299);
  });
  it('clears temporary shield state on death/cleanup but restores the old durability', () => {
    const { s, e } = arena(); hit(s, e); clearCombatEffects(s);
    expect(e.shieldDisabledTicks).toBeUndefined(); expect(e.lensCooldown).toBeUndefined(); expect(e.shieldHp).toBeUndefined();
    const dead = arena(); hit(dead.s, dead.e); damageEnemy(dead.s, dead.e, 100);
    expect(dead.e.shieldDisabledTicks).toBeUndefined(); expect(dead.e.lensCooldown).toBeUndefined();
  });
  it.each(['disabled', 'cooldown', 'boss'] as const)('saves %s and resumes identical future combat', async phase => {
    const s = phase === 'boss' ? boss().s : arena().s; hit(s, s.boss ?? s.enemies[0]);
    if (phase === 'cooldown') for (let i = 0; i < 120; i++) step(s, emptyInput());
    expect(validRun(s)).toBe(true);
    const store = new SaveStore(`lens-${phase}`); await store.load(); await store.save(s, defaultSettings());
    const copy = (await store.load())!.run!;
    for (let i = 0; i < 310; i++) { step(s, emptyInput()); step(copy, emptyInput()); }
    expect(copy).toEqual(s);
  });
  it('accepts legacy snapshots and rejects malformed timers, wrong targets or missing acquisition history', () => {
    expect(validRun(createRun(42))).toBe(true); const { s } = arena(); hit(s, s.enemies[0]); expect(validRun(s)).toBe(true);
    for (const [field, max] of [['lensCooldown', 300], ['shieldDisabledTicks', 120]] as const) for (const n of [-1, 0, max + 1, .5, NaN]) {
      const copy = structuredClone(s); copy.enemies[0][field] = n; expect(validRun(copy)).toBe(false);
    }
    const mismatch = structuredClone(s); mismatch.enemies[0].lensCooldown--; expect(validRun(mismatch)).toBe(false);
    const noHistory = structuredClone(s); noHistory.expedition!.acquired = noHistory.expedition!.relics = []; expect(validRun(noHistory)).toBe(false);
    const ordinary = createRun(42); ordinary.enemies[0].lensCooldown = 300; expect(validRun(ordinary)).toBe(false);
  });
});
