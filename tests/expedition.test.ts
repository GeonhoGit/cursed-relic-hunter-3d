import { describe, expect, it } from 'vitest';
import { createRun, step, emptyInput, advanceRoom } from '../src/core/simulation';
import { chooseRelic, canContinue, roomInfo } from '../src/core/expedition';
import type { RunState } from '../src/core/model';

function clearRoom(s: RunState) {
  s.phase = 'combat'; s.wave = 2; s.waveDelay = 0; s.enemies = []; s.bullets = [];
  step(s, emptyInput());
}

describe('three-room expedition', () => {
  it('locks three distinct candidates at clear and rejects premature, invalid or duplicate choices', () => {
    const s = createRun(42);
    expect(chooseRelic(s, 'R01')).toBe(false); expect(advanceRoom(s)).toBe(false);
    clearRoom(s);
    const offer = structuredClone(s.expedition!.reward!);
    expect(offer.candidates).toHaveLength(3); expect(new Set(offer.candidates).size).toBe(3);
    expect(canContinue(s)).toBe(true); expect(advanceRoom(s)).toBe(false);
    for (let i = 0; i < 100; i++) step(s, emptyInput());
    expect(s.expedition!.reward).toEqual(offer); expect(s.gold).toBe(8);
    const absent = ['R01', 'R02', 'R07', 'R20'].find(id => !offer.candidates.includes(id as never))!;
    expect(chooseRelic(s, absent as never)).toBe(false);
    expect(chooseRelic(s, offer.candidates[0])).toBe(true);
    expect(chooseRelic(s, offer.candidates[1])).toBe(false);
    expect(s.expedition!.relics).toEqual([offer.candidates[0]]);
  });
  it('carries the build, HP and gold across three rooms and finishes once', () => {
    const s = createRun(42); delete s.expedition!.route; s.player.hp = 63;
    clearRoom(s); const relic = s.expedition!.reward!.candidates[0]; chooseRelic(s, relic);
    const restored = structuredClone(s);
    expect(advanceRoom(s)).toBe(true); expect(advanceRoom(restored)).toBe(true);
    expect(restored).toEqual(s); expect(roomInfo(s).index).toBe(1);
    expect(s.phase).toBe('ready'); expect(s.readyTicks).toBe(48); expect(s.enemies).toHaveLength(3);
    expect(s.player.hp).toBe(63); expect(s.gold).toBe(8); expect(s.expedition!.relics).toContain(relic);
    expect(advanceRoom(s)).toBe(false);
    clearRoom(s); expect(s.expedition!.reward!.candidates).not.toContain(relic);
    expect(chooseRelic(s, 'skip')).toBe(true); expect(advanceRoom(s)).toBe(true);
    clearRoom(s); expect(s.gold).toBe(24); expect(canContinue(s)).toBe(false);
    expect(s.expedition!.reward).toBeNull(); expect(advanceRoom(s)).toBe(false);
  });
  it('keeps consumed relics out of later offers', () => {
    const s = createRun(9); s.expedition!.acquired = ['R20']; s.expedition!.room = 1;
    clearRoom(s);
    expect(s.expedition!.reward!.candidates).toHaveLength(3);
    expect(new Set(s.expedition!.reward!.candidates).size).toBe(3);
    expect(s.expedition!.reward!.candidates).not.toContain('R20');
  });
  it('preserves the original single-room ending for a legacy snapshot', () => {
    const s = createRun(8); delete s.expedition;
    clearRoom(s); expect(s.gold).toBe(8); expect(canContinue(s)).toBe(false);
    expect(advanceRoom(s)).toBe(false); expect(roomInfo(s).total).toBe(1);
  });
  it('new expeditions reach the boss after three rooms without a third relic reward', () => {
    const s = createRun(42);
    expect(roomInfo(s).total).toBe(4);
    for (let i = 0; i < 2; i++) { clearRoom(s); chooseRelic(s, 'skip'); expect(advanceRoom(s)).toBe(true); }
    clearRoom(s); expect(s.expedition!.reward).toBeNull(); expect(canContinue(s)).toBe(true);
    expect(advanceRoom(s)).toBe(true); expect(s.boss?.hp).toBe(1800); expect(s.enemies).toHaveLength(0);
    expect(s.phase).toBe('ready'); expect(s.gold).toBe(24);
    s.phase = 'combat'; s.boss!.hp = 10;
    s.bullets.push({ id: s.nextId++, x: s.boss!.x, y: s.boss!.y, vx: 0, vy: 0, owner: 'player', damage: 10, life: 60 });
    step(s, emptyInput()); expect(canContinue(s)).toBe(false); expect(s.gold).toBe(64);
  });
});
