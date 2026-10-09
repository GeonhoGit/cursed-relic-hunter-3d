import type { RunState } from '../core/model';

const integer = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
export function validEvacuation(s: RunState): boolean {
  const e = s.expedition, acquired = e?.acquired.includes('R24');
  const rooms = [e?.dungeon, e?.previousDungeon, e?.earlierDungeon].flatMap(d => d?.rooms ?? []);
  if (rooms.some(r => r.featherUsed !== undefined && (r.featherUsed !== true || !acquired || !r.visited || !['combat', 'boss'].includes(r.kind)))) return false;
  const used = s.featherRooms;
  return used === undefined || !!acquired && e?.route !== 'maze' && Array.isArray(used) && used.length > 0 && used.length <= 4
    && new Set(used).size === used.length && used.every(id => integer(id, 0, Math.min(3, e?.room ?? 0)));
}
