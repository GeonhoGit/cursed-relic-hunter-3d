import type { Point, RunState } from './model';
import { hasRelic } from './relics';
import { currentRoom } from './dungeon';
import { anchorDestinationIssue } from './anchor';
import { groundObstacles as bodyObstacles } from './room-layout';
import { spikeTraps } from './traps';
import { distance, segmentBox, visible } from './geometry';
import { isAlly } from './allegiance';
import { teleportPlayer } from './teleport';

export const EVACUATION = { minRange: 80, maxRange: 120, cueTicks: 30 } as const;
export function featherAvailable(s: RunState): boolean {
  const room = currentRoom(s);
  return hasRelic(s, 'R24') && !(room ? room.featherUsed : s.featherRooms?.includes(s.expedition?.room ?? 0));
}
export function evacuationTarget(s: RunState): Point | undefined {
  const p = s.player, threats = [...s.enemies.filter(e => e.hp > 0 && !isAlly(e)), ...(s.boss?.hp ? [s.boss] : [])];
  threats.sort((a, b) => distance(p, a) - distance(p, b) || a.id - b.id);
  const away = threats[0] ? Math.atan2(p.y - threats[0].y, p.x - threats[0].x) : p.aim + Math.PI;
  const traps = spikeTraps(s), obstacles = bodyObstacles({ ...s, player: { ...p, height: 0 } });
  for (const radius of [120, 100, 80]) for (let i = 0; i < 32; i++) {
    const offset = i === 0 ? 0 : Math.ceil(i / 2) * (i % 2 ? 1 : -1) * Math.PI / 16;
    const point = { x: p.x + Math.cos(away + offset) * radius, y: p.y + Math.sin(away + offset) * radius };
    if (!anchorDestinationIssue(s, point) && visible(p, point, 6.999, obstacles)
      && !traps.some(b => segmentBox(point.x, point.y, point.x, point.y, b, 7) !== null)) return point;
  }
}
export function evacuateOnHurt(s: RunState, damage: number): boolean {
  const room = currentRoom(s);
  if (!(damage > 0) || s.phase !== 'combat' || s.player.hp <= 0 || !featherAvailable(s)
    || room && !['combat', 'boss'].includes(room.kind)) return false;
  const end = evacuationTarget(s); if (!end) return false;
  const from = { x: s.player.x, y: s.player.y }, height = s.player.height ?? 0;
  teleportPlayer(s, end);
  if (room) room.featherUsed = true; else (s.featherRooms ??= []).push(s.expedition?.room ?? 0);
  s.cues.push({ id: s.nextId++, kind: 'evade', ...from, end, height, endHeight: 0, tick: s.tick, amount: distance(from, end) });
  return true;
}
