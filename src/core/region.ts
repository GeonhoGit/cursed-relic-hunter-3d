import type { RunState } from './model';
import { createDungeon, currentRoom } from './dungeon';
import { endTimeStop } from './time-debt';
import { resetJump } from './jump';
import { clearCombatEffects } from './player-effects';
import { regionDungeonSeed } from './room-structures';
import { clearAnchor } from './anchor';
import { discardFloorItems } from './terrain';
import { cancelRecovery } from './recovery';
import { abandonCrown, applyCrownForfeit } from './sealed-crown';

export const regionName = (s: RunState) => s.expedition?.region === 3 ? '유물의 심장' : s.expedition?.region === 2 ? '저주받은 회랑' : '무너진 입구';
export function canEnterNextRegion(s: RunState): boolean {
  return s.expedition?.route === 'maze' && [1,2].includes(s.expedition.region ?? 0) && (s.phase === 'cleared'||s.phase==='explore')
    && s.boss?.kind === (s.expedition.region === 2 ? 'chainpriest' : 'gatekeeper')
    && s.player.hp > 0 && s.boss?.hp === 0 && currentRoom(s)?.kind === 'boss' && !!currentRoom(s)?.cleared;
}
export function enterNextRegion(s: RunState): boolean {
  if (!canEnterNextRegion(s)) return false;
  const e = s.expedition!; endTimeStop(s); delete s.trapTicks;
  if(s.crown?.state==='reserved'&&s.crown.a.region===e.region)abandonCrown(s);
  discardFloorItems(s);cancelRecovery(s);
  clearCombatEffects(s);
  clearAnchor(s); delete s.player.clawUsed;
  if (e.region === 2) e.earlierDungeon = e.previousDungeon;
  e.previousDungeon = structuredClone(e.dungeon!);
  e.region = e.region === 2 ? 3 : 2; e.room = 0; e.reward = null;
  e.dungeon = createDungeon(regionDungeonSeed(s.seed, e.region), e.dungeon?.layoutVersion ?? 1);
  applyCrownForfeit(s,e.dungeon,e.region);
  s.phase = 'explore'; s.wave = 1; s.waveDelay = 0; s.readyTicks = 0;
  s.enemies = []; s.bullets = []; s.cues = []; delete s.boss; delete s.bombs;
  s.player.x = 320; s.player.y = 183; s.player.dodgeRemaining = 0; s.player.invulnerable = 0; resetJump(s.player);
  s.player.safeGround={x:320,y:183};delete s.player.pitDodge;
  return true;
}
