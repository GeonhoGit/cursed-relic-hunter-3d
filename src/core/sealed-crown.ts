import type { CrownTarget, Expedition, RelicId, RunState } from './model';
import { createDungeon } from './dungeon';
import { canOfferRelic } from './relic-acquisition';
import { regionDungeonSeed } from './room-structures';

export interface CrownPlan { a: CrownTarget; b: CrownTarget; ids: RelicId[] }
type Dungeon = NonNullable<Expedition['dungeon']>;
const NORMAL_IDS = Array.from({ length: 30 }, (_, i) => `R${String(i + 1).padStart(2, '0')}` as RelicId);

function storedDungeon(s: RunState, region: number): Dungeon | undefined {
  const e = s.expedition;
  if (!e) return;
  const offset = (e.region ?? 1) - region;
  return offset === 0 ? e.dungeon : offset === 1 ? e.previousDungeon : offset === 2 ? e.earlierDungeon : undefined;
}

function pathIndices(dungeon: Dungeon): Map<number, number> {
  const start = dungeon.rooms.find(r => r.kind === 'start');
  const indices = new Map<number, number>();
  if (!start) return indices;
  const queue = [start]; indices.set(start.id, 0);
  for (let i = 0; i < queue.length; i++) {
    const from = queue[i];
    for (const room of dungeon.rooms) if (!indices.has(room.id)
      && Math.abs(from.x - room.x) + Math.abs(from.y - room.y) === 1) {
      indices.set(room.id, indices.get(from.id)! + 1); queue.push(room);
    }
  }
  return indices;
}

export function crownPlan(s: RunState): CrownPlan | null {
  const e = s.expedition;
  if (s.crown || e?.route !== 'maze' || (e.dungeon?.layoutVersion ?? 0)<2) return null;
  // The fixed normal pool avoids recursion through R47's own acquisition predicate.
  const ids = NORMAL_IDS.filter(id => canOfferRelic(s, id)).slice(0, 2);
  if (ids.length < 2) return null;
  const currentRegion = e.region ?? 1, targets: CrownTarget[] = [];
  for (let value = currentRegion; value <= 3; value++) {
    const region = value as 1 | 2 | 3;
    const dungeon = value === currentRegion ? e.dungeon! : createDungeon(regionDungeonSeed(s.seed, value), e.dungeon!.layoutVersion!);
    const indices = pathIndices(dungeon);
    for (const room of dungeon.rooms) if (room.mainReward && room.kind === 'combat' && room.reward === null
      && (value !== currentRegion || room.id !== e.room) && indices.has(room.id)) {
      targets.push({ region, room: room.id, mainPathIndex: indices.get(room.id)! });
    }
  }
  targets.sort((a, b) => a.region - b.region || a.mainPathIndex - b.mainPathIndex || a.room - b.room);
  return targets.length >= 2 ? { a: targets[0], b: targets[1], ids } : null;
}

function sameTarget(a: CrownTarget, b: CrownTarget): boolean {
  return a.region === b.region && a.room === b.room && a.mainPathIndex === b.mainPathIndex;
}

export function reserveCrown(s: RunState, expected?: CrownPlan): boolean {
  const plan = crownPlan(s);
  if (!plan || expected && (!sameTarget(plan.a, expected.a) || !sameTarget(plan.b, expected.b)
    || plan.ids.length !== expected.ids.length || plan.ids.some((id, i) => id !== expected.ids[i]))) return false;
  s.crown = { a: { ...plan.a }, b: { ...plan.b }, ids: [...plan.ids], selectedIds: [], state: 'reserved' };
  const dungeon = storedDungeon(s, plan.b.region);
  if (dungeon) applyCrownForfeit(s, dungeon, plan.b.region);
  return true;
}

export function applyCrownForfeit(s: RunState, dungeon: Dungeon, region: 1 | 2 | 3): void {
  const target = s.crown?.b;
  if (!target || target.region !== region) return;
  const room = dungeon.rooms.find(r => r.id === target.room);
  if (!room || room.reward?.forfeited) return;
  room.reward = { room: room.id, candidates: [], choice: 'skip', forfeited: true,
    revision: (room.reward?.revision ?? 0) + 1, slots: 0 };
}

export function crownOwner(s: RunState): boolean {
  const reservation = s.crown, e = s.expedition;
  return reservation?.state === 'reserved' && e?.route === 'maze'
    && (e.region ?? 1) === reservation.a.region && e.room === reservation.a.room;
}

export function crownReserved(s: RunState, id: RelicId): boolean {
  return s.crown?.state === 'reserved' && s.crown.ids.includes(id) && !crownOwner(s);
}

export function abandonCrown(s: RunState): boolean {
  const reservation = s.crown;
  if (reservation?.state !== 'reserved') return false;
  reservation.state = 'abandoned';
  const reward = storedDungeon(s, reservation.a.region)?.rooms.find(r => r.id === reservation.a.room)?.reward;
  if (reward?.choice === null) {
    reward.choice = 'skip'; reward.revision = (reward.revision ?? 0) + 1;
  }
  return true;
}

export function crownSelected(s: RunState, id: RelicId): void {
  if (!crownOwner(s) || !s.expedition?.acquired.includes(id)) return;
  const reservation = s.crown!;
  if (reservation.selectedIds.includes(id) || reservation.selectedIds.length >= 2) return;
  reservation.selectedIds.push(id);
  if (reservation.selectedIds.length === 2) reservation.state = 'complete';
}
