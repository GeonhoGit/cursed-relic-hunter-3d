import type { RunState } from './model';
import { createDungeon, currentRoom } from './dungeon';
import { endTimeStop } from './time-debt';
import { resetJump } from './jump';
import { clearCombatEffects } from './player-effects';
import { regionDungeonSeed } from './room-structures';

export const regionName = (s: RunState) => s.expedition?.region === 3 ? '유물의 심장' : s.expedition?.region === 2 ? '저주받은 회랑' : '무너진 입구';
export function canEnterNextRegion(s: RunState): boolean {
  return s.expedition?.route === 'maze' && [1,2].includes(s.expedition.region ?? 0) && s.phase === 'cleared'
    && s.boss?.kind === (s.expedition.region === 2 ? 'chainpriest' : 'gatekeeper')
    && s.player.hp > 0 && s.boss?.hp === 0 && currentRoom(s)?.kind === 'boss' && !!currentRoom(s)?.cleared;
}
export function enterNextRegion(s: RunState): boolean {
  if (!canEnterNextRegion(s)) return false;
  const e = s.expedition!; endTimeStop(s); delete s.trapTicks;
  clearCombatEffects(s);
  if (e.region === 2) e.earlierDungeon = e.previousDungeon;
  e.previousDungeon = structuredClone(e.dungeon!);
  e.region = e.region === 2 ? 3 : 2; e.room = 0; e.reward = null;
  e.dungeon = createDungeon(regionDungeonSeed(s.seed, e.region));
  s.phase = 'explore'; s.wave = 1; s.waveDelay = 0; s.readyTicks = 0;
  s.enemies = []; s.bullets = []; s.cues = []; delete s.boss; delete s.bombs;
  s.player.x = 320; s.player.y = 183; s.player.dodgeRemaining = 0; s.player.invulnerable = 0; resetJump(s.player);
  return true;
}
