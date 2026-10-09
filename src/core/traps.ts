import { BOUNDS, type Box, type Point, type RunState } from './model';
import { currentRoom } from './dungeon';
import { segmentBox } from './geometry';
import { roomLayout } from './room-layout';

export const SPIKES = { warning: 60, active: 48, rest: 120, damage: 10, height: 12 } as const;
export const DANGER_LINES = { warning: 72, active: 36, rest: 150, damage: 15, height: 16 } as const;
const ZONES: Box[] = [{ x: 40, y: 90, w: 96, h: 44 }, { x: 500, y: 250, w: 80, h: 44 }, { x: 260, y: 310, w: 40, h: 28 }];
// Short lanes leave the center and both outer routes open, in all three layouts.
const LINES: Box[] = [{x:24,y:72,w:116,h:10},{x:496,y:282,w:116,h:10},{x:278,y:330,w:84,h:10}];
export function spikeTraps(s: RunState): readonly Box[] {
  const room = currentRoom(s);
  if (room?.kind !== 'combat') return [];
  const traps = s.expedition?.region === 3
    ? LINES.map((b,i)=>Math.floor(Math.max(0,(s.trapTicks??0)-i*76)/258)%2 ? {...b,y:[310,64,32][i]} : b)
    : s.expedition?.region === 2 ? ZONES : [];
  if (room.structure === undefined || !s.expedition?.dungeon?.layoutVersion) return traps;
  const placed: Box[] = [], obstacles = [...roomLayout(s).obstacles,...(room.pits ?? [])];
  const fits = (box: Box) => ![...obstacles, ...placed].some(b => box.x < b.x + b.w + 3 && box.x + box.w > b.x - 3
    && box.y < b.y + b.h + 3 && box.y + box.h > b.y - 3);
  for (const original of traps) {
    let box = original;
    if (!fits(box)) {
      const candidates: Box[] = [];
      for (let y = BOUNDS.y + 24; y + box.h < BOUNDS.y + BOUNDS.h - 24; y += 48)
        for (let x = BOUNDS.x + 24; x + box.w < BOUNDS.x + BOUNDS.w - 24; x += 64) candidates.push({ ...box, x, y });
      candidates.sort((a, b) => Math.hypot(a.x - box.x, a.y - box.y) - Math.hypot(b.x - box.x, b.y - box.y));
      box = candidates.find(fits) ?? box;
    }
    placed.push(box);
  }
  return placed;
}
const trapRules = (s:RunState) => s.expedition?.region === 3 ? DANGER_LINES : SPIKES;
export function trapStage(s: RunState, index: number): 'warning' | 'active' | 'rest' {
  if (s.phase !== 'combat') return 'rest';
  const elapsed = (s.trapTicks ?? 0) - index * 76;
  if (elapsed < 0) return 'rest';
  const rule=trapRules(s), phase = elapsed % (rule.warning + rule.active + rule.rest);
  return phase < rule.warning ? 'warning' : phase < rule.warning + rule.active ? 'active' : 'rest';
}
export function trapHits(s: RunState, before: Point, height: number): { damage: number; cause: string }[] {
  const p = s.player, nextHeight = p.height ?? 0, rule=trapRules(s);
  return spikeTraps(s).flatMap((box, i) => {
    if (trapStage(s, i) !== 'active') return [];
    const enter = segmentBox(before.x, before.y, p.x, p.y, box, 7);
    if (enter === null) return [];
    const exit = 1 - (segmentBox(p.x, p.y, before.x, before.y, box, 7) ?? 0), dh = nextHeight - height;
    const crosses = Math.abs(dh) < 1e-9 ? height <= rule.height : dh < 0
      ? Math.max(enter, (rule.height - height) / dh) <= exit
      : enter <= Math.min(exit, (rule.height - height) / dh);
    return crosses ? [{ damage: rule.damage, cause: s.expedition?.region === 3 ? '심장부의 위험선' : '회랑의 가시 함정' }] : [];
  });
}
