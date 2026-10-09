import type { RunState } from './model';
import { hasRelic } from './relics';
import { currentRoom } from './dungeon';
import { growthStats } from './growth';

export const CLEANSE = { cooldown: 480 } as const;
export function cleanseStatus(s: RunState) {
  const p = s.player;
  if (!hasRelic(s, 'R22') || p.cleanseCooldown || !(p.slowTicks || p.weakTicks)) return;
  if ((p.slowTicks ?? 0) >= (p.weakTicks ?? 0)) delete p.slowTicks; else delete p.weakTicks;
  p.cleanseCooldown = CLEANSE.cooldown;
  s.cues.push({ id: s.nextId++, kind: 'cleanse', x: p.x, y: p.y, tick: s.tick, amount: 0 });
}
export function mossAfterCombat(s: RunState) {
  if (!hasRelic(s, 'R21') || s.boss || s.player.hp <= 0) return;
  const room = currentRoom(s);
  if (room ? room.kind !== 'combat' || room.cleared || room.mossCounted : s.mossRooms?.includes(s.expedition?.room ?? 0)) return;
  if (room) room.mossCounted = true;
  else (s.mossRooms ??= []).push(s.expedition?.room ?? 0);
  s.mossClears = ((s.mossClears ?? 0) + 1) % 3;
  if (s.mossClears !== 0) return;
  const before = s.player.hp; s.player.hp = Math.min(growthStats(s).maxHp, before + 5);
  if (s.player.hp > before) s.cues.push({ id: s.nextId++, kind: 'moss', x: s.player.x, y: s.player.y,
    tick: s.tick, amount: s.player.hp - before });
}
export const enemyDisplacement = (s: RunState, length: number) => length * (hasRelic(s, 'R29') ? .2 : 1);
export function advanceRelicTimers(s: RunState, firing: boolean) {
  for (const key of ['lightningCooldown', 'starlightCooldown', 'wardCooldown', 'cleanseCooldown', 'gravityCooldown', 'thornsCooldown'] as const)
    if (s.player[key] && --s.player[key]! <= 0) delete s.player[key];
  if (hasRelic(s, 'R14')) s.player.starlightRest = firing ? 0 : Math.min(60, (s.player.starlightRest ?? 0) + 1);
  else delete s.player.starlightRest;
}
