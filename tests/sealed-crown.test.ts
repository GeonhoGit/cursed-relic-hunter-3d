import { describe, expect, it } from 'vitest';
import type { RelicId, RunState } from '../src/core/model';
import { createDungeon } from '../src/core/dungeon';
import { regionDungeonSeed } from '../src/core/room-structures';
import { abandonCrown, applyCrownForfeit, crownOwner, crownPlan, crownReserved,
  crownSelected, reserveCrown } from '../src/core/sealed-crown';

function run(): RunState {
  return {
    version: 1, seed: 42, rng: 9876, tick: 0, nextId: 1,
    phase: 'explore', readyTicks: 0, wave: 1, waveDelay: 0,
    player: { x: 320, y: 183, hp: 100, aim: 0, lastX: 0, lastY: 1,
      dodgeRemaining: 0, dodgeX: 0, dodgeY: 1, dodgeCooldown: 0, invulnerable: 0, fireCooldown: 0 },
    enemies: [], bullets: [], cues: [], gold: 23, lastDamage: '',
    expedition: { route: 'maze', region: 1, room: 0, relics: [], acquired: [], reward: null,
      dungeon: createDungeon(42, 2) },
    growth: { id: 'crown', investment: { health: 0, attack: 0, speed: 0, movement: 0, dodge: 0 },
      firstRoomCleared: true, relicUnlocks: ['R47'] },
    stats: { shots: 0, hits: 0, kills: 0, damage: 0, dodges: 0 },
  };
}

function visitA(s: RunState) {
  const a = s.crown!.a;
  s.expedition!.region = a.region;
  s.expedition!.room = a.room;
  const node = s.expedition!.dungeon!.rooms.find(r => r.id === a.room)!;
  node.visited = node.cleared = true;
  node.reward = { room: a.room, candidates: [...s.crown!.ids, 'R03'], choice: null,
    revision: 1, slots: 3, selectedIds: [] };
  s.phase = 'cleared';
  return node.reward;
}

function received(s: RunState, id: RelicId) {
  s.expedition!.relics.push(id); s.expedition!.acquired.push(id);
  crownSelected(s, id);
}

describe('sealed crown reservation', () => {
  it('plans the next two unopened designated rewards without mutating the run', () => {
    const s = run(), before = structuredClone(s);
    expect(crownPlan(s)).toEqual({
      a: { region: 1, room: 5, mainPathIndex: 3 },
      b: { region: 2, room: 5, mainPathIndex: 3 }, ids: ['R01', 'R02'],
    });
    expect(crownPlan(s)).toEqual(crownPlan(s));
    expect(s).toEqual(before);
  });

  it('excludes the current reward room and uses future region seeds', () => {
    const s = run(); s.expedition!.room = 5;
    expect(crownPlan(s)).toEqual({
      a: { region: 2, room: 5, mainPathIndex: 3 },
      b: { region: 3, room: 4, mainPathIndex: 2 }, ids: ['R01', 'R02'],
    });
    s.expedition!.room = 0;
    s.expedition!.dungeon!.rooms[5].reward = { room: 5, candidates: ['R03'], choice: null };
    expect(crownPlan(s)?.a.region).toBe(2);
  });

  it('requires two remaining targets and excludes old layouts and routes', () => {
    const s = run(); s.expedition!.region = 2;
    s.expedition!.dungeon = createDungeon(regionDungeonSeed(s.seed, 2), 2);
    expect(crownPlan(s)?.a.region).toBe(2);
    s.expedition!.room = 5; expect(crownPlan(s)).toBeNull();
    s.expedition!.room = 0; s.expedition!.region = 3; expect(crownPlan(s)).toBeNull();
    s.expedition!.region = 1; s.expedition!.dungeon = createDungeon(42, 1);
    expect(crownPlan(s)).toBeNull();
    s.expedition!.dungeon = createDungeon(42, 2); s.expedition!.route = 'gatekeeper';
    expect(crownPlan(s)).toBeNull();
  });

  it('reserves only unlocked unacquired normal R01 through R30 and needs two', () => {
    const s = run();
    s.expedition!.acquired = Array.from({ length: 30 }, (_, i) => `R${String(i + 1).padStart(2, '0')}` as RelicId)
      .filter(id => !['R14', 'R15', 'R30'].includes(id));
    expect(crownPlan(s)).toBeNull();
    s.growth!.relicUnlocks!.push('R14');
    expect(crownPlan(s)?.ids).toEqual(['R14', 'R30']);
    s.expedition!.acquired.push('R30'); expect(crownPlan(s)).toBeNull();
  });

  it('rejects a stale confirmation atomically when targets or relic eligibility change', () => {
    const s = run(), expected = crownPlan(s)!;
    s.expedition!.dungeon!.rooms[5].reward = { room: 5, candidates: ['R03'], choice: null };
    let before = structuredClone(s);
    expect(reserveCrown(s, expected)).toBe(false); expect(s).toEqual(before);
    s.expedition!.dungeon!.rooms[5].reward = null;
    s.expedition!.acquired.push('R01'); before = structuredClone(s);
    expect(reserveCrown(s, expected)).toBe(false); expect(s).toEqual(before);
  });

  it('copies a confirmed plan and prevents a second reservation', () => {
    const s = run(), expected = crownPlan(s)!;
    expect(reserveCrown(s, expected)).toBe(true);
    expect(s.crown).toEqual({ ...expected, selectedIds: [], state: 'reserved' });
    expected.ids.push('R03'); expected.a.room = 7;
    expect(s.crown!.ids).toEqual(['R01', 'R02']); expect(s.crown!.a.room).toBe(5);
    const before = structuredClone(s);
    expect(reserveCrown(s)).toBe(false); expect(s).toEqual(before);
  });

  it('permanently forfeits B on generation, including after abandonment, without touching gold', () => {
    const s = run(); reserveCrown(s);
    const future = createDungeon(regionDungeonSeed(s.seed, 2), 2);
    applyCrownForfeit(s, future, 3); expect(future.rooms[5].reward).toBeNull();
    applyCrownForfeit(s, future, 2);
    expect(future.rooms[5].reward).toEqual({ room: 5, candidates: [], choice: 'skip',
      forfeited: true, revision: 1, slots: 0 });
    expect(future.rooms[5].visited).toBe(false); expect(s.gold).toBe(23);
    const before = structuredClone(future);
    applyCrownForfeit(s, future, 2); expect(future).toEqual(before);
    abandonCrown(s);
    const regenerated = createDungeon(regionDungeonSeed(s.seed, 2), 2);
    applyCrownForfeit(s, regenerated, 2);
    expect(regenerated.rooms[5].reward?.forfeited).toBe(true);
  });

  it('excludes reserved IDs everywhere except the active A owner', () => {
    const s = run(); reserveCrown(s);
    expect(crownOwner(s)).toBe(false); expect(crownReserved(s, 'R01')).toBe(true);
    expect(crownReserved(s, 'R03')).toBe(false);
    visitA(s);
    expect(crownOwner(s)).toBe(true); expect(crownReserved(s, 'R01')).toBe(false);
    s.expedition!.region = 2;
    expect(crownOwner(s)).toBe(false); expect(crownReserved(s, 'R01')).toBe(true);
  });

  it('keeps distinct partial selections and completes only after two actual grants at A', () => {
    const s = run(); reserveCrown(s); visitA(s);
    crownSelected(s, 'R01'); expect(s.crown!.selectedIds).toEqual([]);
    received(s, 'R01'); crownSelected(s, 'R01');
    expect(s.crown!.selectedIds).toEqual(['R01']); expect(s.crown!.state).toBe('reserved');
    const resumed = structuredClone(s); received(resumed, 'R03');
    expect(resumed.crown!.selectedIds).toEqual(['R01', 'R03']);
    expect(resumed.crown!.state).toBe('complete'); expect(crownOwner(resumed)).toBe(false);
    expect(crownReserved(resumed, 'R02')).toBe(false);
    crownSelected(resumed, 'R02'); expect(resumed.crown!.selectedIds).toEqual(['R01', 'R03']);
  });

  it('ignores selection at a different room and abandons only the pending A offer', () => {
    const s = run(); reserveCrown(s); const reward = visitA(s);
    received(s, 'R01'); reward.selectedIds = ['R01'];
    const other = s.expedition!.dungeon!.rooms[6];
    other.reward = { room: 6, candidates: ['R04'], choice: null, revision: 1 };
    s.expedition!.room = 6; received(s, 'R04');
    expect(s.crown!.selectedIds).toEqual(['R01']);
    expect(abandonCrown(s)).toBe(true);
    expect(s.crown!.state).toBe('abandoned'); expect(s.crown!.selectedIds).toEqual(['R01']);
    expect(reward.choice).toBe('skip'); expect(reward.selectedIds).toEqual(['R01']);
    expect(reward.revision).toBe(2); expect(other.reward.choice).toBeNull();
    expect(crownReserved(s, 'R02')).toBe(false); expect(abandonCrown(s)).toBe(false);
  });

  it('abandons an A offer retained in the previous region while leaving resolved rewards intact', () => {
    const s = run(); reserveCrown(s); const reward = visitA(s);
    s.expedition!.previousDungeon = s.expedition!.dungeon;
    s.expedition!.region = 2; s.expedition!.room = 0;
    s.expedition!.dungeon = createDungeon(regionDungeonSeed(s.seed, 2), 2);
    applyCrownForfeit(s, s.expedition!.dungeon!, 2);
    expect(abandonCrown(s)).toBe(true); expect(reward.choice).toBe('skip');
    expect(s.expedition!.dungeon!.rooms[5].reward?.forfeited).toBe(true);
    const resolved = run(); reserveCrown(resolved); const old = visitA(resolved);
    old.choice = 'R03'; const before = structuredClone(old);
    expect(abandonCrown(resolved)).toBe(true); expect(old).toEqual(before);
  });
});
