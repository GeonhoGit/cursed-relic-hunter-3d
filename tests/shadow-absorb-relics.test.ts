import { describe, expect, it } from 'vitest';
import type { AuxiliaryId, Bullet, RelicId, RunState } from '../src/core/model';
import { absorbBullet, absorptionFailure, ageShadowAbsorb, breakStealth, clearAbsorption,
  spendAbsorbEnergy, startAbsorption } from '../src/core/shadow-absorb';

function arena(relics: RelicId[] = []): RunState {
  return {
    version: 1, seed: 42, rng: 42, tick: 0, nextId: 1,
    phase: 'combat', readyTicks: 0, wave: 1, waveDelay: 99999,
    player: { x: 320, y: 180, hp: 100, aim: 0, lastX: 0, lastY: 1,
      dodgeRemaining: 0, dodgeX: 0, dodgeY: 1, dodgeCooldown: 0, invulnerable: 0, fireCooldown: 0 },
    enemies: [], bullets: [], cues: [], gold: 0, lastDamage: '',
    expedition: { route: 'gatekeeper', room: 0, relics: [...relics], acquired: [...relics], reward: null },
    stats: { shots: 0, hits: 0, kills: 0, damage: 0, dodges: 0 },
  };
}

function bullet(overrides: Partial<Bullet> = {}): Bullet {
  return { id: 1, x: 320, y: 180, vx: 200, vy: 0, life: 120, damage: 10, owner: 'enemy', ...overrides };
}

describe('R41 quiet time and stealth', () => {
  it('requires ninety quiet simulation ticks and keeps the quiet count bounded while stealthed', () => {
    const s = arena(['R41']);
    for (let i = 0; i < 89; i++) ageShadowAbsorb(s);
    expect(s.player.quietTicks).toBe(89); expect(s.player.stealthed).toBeUndefined();
    ageShadowAbsorb(s); expect(s.player.stealthed).toBe(true);
    for (let i = 0; i < 30; i++) ageShadowAbsorb(s);
    expect(s.player.quietTicks).toBe(90);
  });
  it('restarts the quiet interval on damage without imposing an attack dodge lock', () => {
    const s = arena(['R41']); s.player.quietTicks = 90; s.player.stealthed = true;
    breakStealth(s);
    expect(s.player.stealthed).toBeUndefined(); expect(s.player.quietTicks).toBe(0);
    expect(s.player.dodgeLock).toBeUndefined();
    for (let i = 0; i < 89; i++) ageShadowAbsorb(s);
    expect(s.player.stealthed).toBeUndefined();
    ageShadowAbsorb(s); expect(s.player.stealthed).toBe(true);
  });
  it('locks dodge for thirty ticks only when an attack breaks existing stealth', () => {
    const s = arena(['R41']); s.player.quietTicks = 89;
    breakStealth(s, true); expect(s.player.dodgeLock).toBeUndefined();
    expect(s.player.quietTicks).toBe(0);
    s.player.quietTicks = 90; s.player.stealthed = true;
    breakStealth(s, true);
    expect(s.player.stealthed).toBeUndefined(); expect(s.player.dodgeLock).toBe(30);
    for (let i = 0; i < 29; i++) ageShadowAbsorb(s);
    expect(s.player.dodgeLock).toBe(1);
    breakStealth(s, true); expect(s.player.dodgeLock).toBe(1);
    ageShadowAbsorb(s); expect(s.player.dodgeLock).toBeUndefined();
  });
  it('removes stale stealth and quiet progress after relic loss without granting fresh progress', () => {
    const s = arena(); s.player.quietTicks = 90; s.player.stealthed = true; s.player.dodgeLock = 3;
    ageShadowAbsorb(s);
    expect(s.player.stealthed).toBeUndefined(); expect(s.player.quietTicks).toBeUndefined();
    expect(s.player.dodgeLock).toBe(2);
  });
});

describe('R42 absorption channel', () => {
  it.each(['combat', 'explore'] as const)('starts a ninety-tick channel in %s and preserves banked energy', phase => {
    const s = arena(['R42', 'R13']); s.phase = phase; s.absorbEnergy = 2;
    expect(absorptionFailure(s)).toBeNull(); expect(startAbsorption(s)).toBe(true);
    expect(s.absorption).toEqual({ ticks: 90, absorbed: 0 });
    expect(s.player.auxCooldowns?.R42).toBe(840); expect(s.absorbEnergy).toBe(2);
    for (let i = 0; i < 89; i++) ageShadowAbsorb(s);
    expect(s.absorption?.ticks).toBe(1);
    ageShadowAbsorb(s); expect(s.absorption).toBeUndefined();
    expect(s.player.auxCooldowns?.R42).toBe(840); expect(s.absorbEnergy).toBe(2);
  });
  it.each(['missing relic', 'no other auxiliary', 'ready', 'cleared', 'dead', 'cooldown', 'channel', 'debt'] as const)(
    'rejects %s without consuming state', reason => {
      const s = arena(['R42', 'R13']);
      if (reason === 'missing relic') s.expedition!.relics = ['R13'];
      if (reason === 'no other auxiliary') s.expedition!.relics = ['R42', 'R41'];
      if (reason === 'ready' || reason === 'cleared' || reason === 'dead') s.phase = reason;
      if (reason === 'cooldown') s.player.auxCooldowns = { R42: 1 };
      if (reason === 'channel') s.absorption = { ticks: 20, absorbed: 2 };
      if (reason === 'debt') s.timeDebt = 1;
      const before = structuredClone(s);
      expect(absorptionFailure(s)).toEqual(expect.any(String));
      expect(startAbsorption(s)).toBe(false); expect(s).toEqual(before);
    });
  it('clears the channel and stored energy when R42 is lost while retaining its recharge', () => {
    const s = arena(['R13']); s.absorption = { ticks: 30, absorbed: 2 }; s.absorbEnergy = 4;
    s.player.auxCooldowns = { R42: 500 };
    ageShadowAbsorb(s);
    expect(s.absorption).toBeUndefined(); expect(s.absorbEnergy).toBeUndefined();
    expect(s.player.auxCooldowns.R42).toBe(500);
  });
  it('can clear only the active channel on a room change without losing energy or equipment', () => {
    const s = arena(['R42', 'R13']); startAbsorption(s); s.absorbEnergy = 3; s.player.equippedAux = 'R42';
    clearAbsorption(s);
    expect(s.absorption).toBeUndefined(); expect(s.absorbEnergy).toBe(3);
    expect(s.player.equippedAux).toBe('R42'); expect(s.player.auxCooldowns?.R42).toBe(840);
  });
});

describe('R42 enemy projectile absorption', () => {
  it('absorbs five ordinary enemy bullets per channel and requires a new ready cast for another', () => {
    const s = arena(['R42', 'R13']); expect(startAbsorption(s)).toBe(true);
    for (let i = 0; i < 4; i++) expect(absorbBullet(s, bullet({ id: i + 1 }))).toBe(true);
    expect(s.absorption?.absorbed).toBe(4); expect(s.absorbEnergy).toBe(4);
    expect(absorbBullet(s, bullet({ id: 5 }))).toBe(true);
    expect(s.absorbEnergy).toBe(5); expect(s.absorption).toBeUndefined();
    expect(absorbBullet(s, bullet({ id: 6 }))).toBe(false);
    expect(startAbsorption(s)).toBe(false);
  });
  it('continues to absorb defensively while keeping an existing full bank capped at five', () => {
    const s = arena(['R42', 'R13']); s.absorbEnergy = 5;
    expect(startAbsorption(s)).toBe(true); expect(absorbBullet(s, bullet())).toBe(true);
    expect(s.absorbEnergy).toBe(5); expect(s.absorption?.absorbed).toBe(1);
  });
  it('uses the swept segment even when both endpoints are outside its forty-unit radius', () => {
    const s = arena(['R42', 'R13']); startAbsorption(s);
    const b = bullet({ x: 260 });
    expect(absorbBullet(s, b, { x: 260, y: 180 }, { x: 380, y: 180 })).toBe(true);
    expect(s.absorbEnergy).toBe(1);
    expect(b.x).toBe(260); // The caller owns projectile movement and removal.
  });
  it('includes tangency at forty units and rejects a segment just outside the radius', () => {
    const s = arena(['R42', 'R13']); startAbsorption(s);
    expect(absorbBullet(s, bullet(), { x: 260, y: 220.01 }, { x: 380, y: 220.01 })).toBe(false);
    expect(absorbBullet(s, bullet(), { x: 260, y: 220 }, { x: 380, y: 220 })).toBe(true);
    expect(s.absorbEnergy).toBe(1);
  });
  it.each([
    { source: 'gatekeeper' }, { source: 'chainpriest' }, { source: 'relicheart' },
    { owner: 'player' }, { kind: 'ally', sourceRelicId: 'R17' },
  ] satisfies Partial<Bullet>[])('rejects boss, player, and ally bullets: %j', overrides => {
    const s = arena(['R42', 'R13']); startAbsorption(s);
    expect(absorbBullet(s, bullet(overrides))).toBe(false);
    expect(s.absorption).toEqual({ ticks: 90, absorbed: 0 }); expect(s.absorbEnergy ?? 0).toBe(0);
  });
  it('does not absorb without a live channel or after losing the relic', () => {
    const s = arena(['R42', 'R13']); expect(absorbBullet(s, bullet())).toBe(false);
    s.absorption = { ticks: 0, absorbed: 0 }; expect(absorbBullet(s, bullet())).toBe(false);
    s.absorption!.ticks = 30; s.expedition!.relics = ['R13'];
    expect(absorbBullet(s, bullet())).toBe(false); expect(s.absorbEnergy ?? 0).toBe(0);
  });
});

describe('R42 banked energy', () => {
  it.each(['explore', 'cleared'] as const)('reduces R13 recharge by thirty ticks per energy in %s', phase => {
    const s = arena(['R42', 'R13']); s.phase = phase; s.player.auxCooldown = 70; s.absorbEnergy = 3;
    expect(spendAbsorbEnergy(s, 'R13')).toBe(true);
    expect(s.player.auxCooldown).toBe(40); expect(s.absorbEnergy).toBe(2);
    expect(s.player.cooldownCredits?.R13).toBe(30);
    expect(spendAbsorbEnergy(s, 'R13')).toBe(true);
    expect(s.player.auxCooldown).toBe(10); expect(s.player.cooldownCredits?.R13).toBe(60);
    expect(spendAbsorbEnergy(s, 'R13')).toBe(true);
    expect(s.player.auxCooldown).toBe(0); expect(s.absorbEnergy ?? 0).toBe(0);
    expect(s.player.cooldownCredits?.R13).toBe(70);
  });
  it.each(['R16', 'R17', 'R18', 'R26', 'R40'] as const)('uses the held %s cooldown map without requiring it to be equipped', target => {
    const s = arena(['R42', target]); s.phase = 'explore'; s.player.equippedAux = 'R42';
    s.player.auxCooldowns = { [target]: 45 }; s.absorbEnergy = 2;
    expect(spendAbsorbEnergy(s, target)).toBe(true);
    expect(s.player.auxCooldowns[target]).toBe(15); expect(s.absorbEnergy).toBe(1);
    expect(s.player.cooldownCredits?.[target]).toBe(30);
    expect(spendAbsorbEnergy(s, target)).toBe(true);
    expect(s.player.auxCooldowns?.[target] ?? 0).toBe(0); expect(s.absorbEnergy ?? 0).toBe(0);
    expect(s.player.cooldownCredits?.[target]).toBe(45);
  });
  it('reduces the R43 legacy timer while preserving unrelated cooldowns and credits', () => {
    const s = arena(['R42', 'R43', 'R13']); s.phase = 'explore'; s.absorbEnergy = 1;
    s.player.timeCooldown = 10; s.player.auxCooldown = 77; s.player.cooldownCredits = { R13: 60, R43: 30 };
    expect(spendAbsorbEnergy(s, 'R43')).toBe(true);
    expect(s.player.timeCooldown).toBe(0); expect(s.player.auxCooldown).toBe(77);
    expect(s.player.cooldownCredits).toEqual({ R13: 60, R43: 40 });
  });
  it.each(['combat', 'ready', 'dead', 'missing relic', 'no energy', 'debt', 'self', 'ready skill', 'unheld', 'not auxiliary'] as const)(
    'rejects spending for %s without changing the energy or cooldown', reason => {
      const s = arena(['R42', 'R13']); s.phase = 'explore'; s.player.auxCooldown = 45;
      s.player.auxCooldowns = { R42: 200, R16: 100 }; s.absorbEnergy = 2;
      let target: AuxiliaryId = 'R13';
      if (reason === 'combat' || reason === 'ready' || reason === 'dead') s.phase = reason;
      if (reason === 'missing relic') s.expedition!.relics = ['R13'];
      if (reason === 'no energy') s.absorbEnergy = 0;
      if (reason === 'debt') s.timeDebt = 1;
      if (reason === 'self') target = 'R42';
      if (reason === 'ready skill') s.player.auxCooldown = 0;
      if (reason === 'unheld') target = 'R16';
      if (reason === 'not auxiliary') { s.expedition!.relics.push('R01'); target = 'R01' as AuxiliaryId; }
      const before = structuredClone(s);
      expect(spendAbsorbEnergy(s, target)).toBe(false); expect(s).toEqual(before);
    });
});
