import { BOUNDS, type Box, type EnemyHit, type Point, type RunState } from './model';
import { adjacentRooms, currentRoom, DIRECTIONS } from './dungeon';
import { distance, segmentBox, visible } from './geometry';
import { bodyObstacles } from './room-layout';
import { hasRelic } from './relics';
import { receiveRecovery } from './recovery';
import { spikeTraps } from './traps';
import { teleportPlayer } from './teleport';

export const pitBoxes = (s: RunState): Box[] => currentRoom(s)?.pits ?? [];
export const onPit = (s: RunState, p: Point, radius = 0) => pitBoxes(s).some(b => segmentBox(p.x,p.y,p.x,p.y,b,radius)!==null);
export const enemyGroundObstacles = (s: RunState) => [...bodyObstacles({ ...s, player: { ...s.player, height: 0 } }), ...pitBoxes(s)];
export function pitDodgeAvailable(s: RunState, direction: Point): boolean {
  if (!hasRelic(s,'R28') || (s.player.height ?? 0)>0 || onPit(s,s.player)) return false;
  const end={x:s.player.x+direction.x*108,y:s.player.y+direction.y*108};
  return !onPit(s,end,7) && pitBoxes(s).some(b=>segmentBox(s.player.x,s.player.y,end.x,end.y,b,0)!==null)
    && visible(s.player,end,7,bodyObstacles(s)) && !spikeTraps(s).some(b=>segmentBox(end.x,end.y,end.x,end.y,b,7)!==null)
    && !s.enemies.some(e=>e.hp>0&&distance(end,e)<17);
}
export function checkGround(s: RunState): EnemyHit | null {
  const p=s.player;
  if (!onPit(s,p,7)) { p.safeGround={x:p.x,y:p.y}; if(p.dodgeRemaining===0)delete p.pitDodge;return null; }
  if ((p.height ?? 0)>0 || p.dodgeRemaining>0) return null;
  const safe=p.safeGround ?? {x:320,y:183}; teleportPlayer(s,safe); delete p.pitDodge;
  s.notice='구덩이에 떨어져 마지막 안전한 땅으로 돌아왔습니다.';
  return {damage:10,cause:'구덩이 낙하'};
}
export function collectPickups(s: RunState) {
  const room=currentRoom(s);if(!room?.pickups || (s.player.height ?? 0)>12)return;
  const obstacles=[...bodyObstacles(s),...pitBoxes(s),...(s.phase==='combat'?spikeTraps(s):[])];
  room.pickups=room.pickups.filter(p=>{
    if(distance(s.player,p)>(hasRelic(s,'R36')?90:20)||!visible(s.player,p,0,obstacles))return true;
    if(p.kind==='heal'&&!receiveRecovery(s,p.id,p.amount,'floor'))return true;
    if(p.kind==='gold')s.gold+=p.amount;
    s.notice=p.kind==='gold'?`금화 +${p.amount}`:hasRelic(s,'R39')?`회복품 ${p.amount} 보관`:`생명력 +${p.amount}`;
    return false;
  });
}
export function createFloorReward(s: RunState, boss=false) {
  const node=currentRoom(s);
  if(s.replay || (s.expedition?.dungeon?.layoutVersion ?? 0)<2 || !node)return false;
  const prefix=`${s.seed}-${s.expedition!.region ?? 1}-${node.id}`;
  // Clear center ground is guaranteed by all room structures; no spawn RNG is consumed.
  node.pickups=[{id:`${prefix}-gold`,kind:'gold',amount:boss?40:node.kind==='elite'?20:8,x:320,y:245},
    ...(!boss&&node.id===3?[{id:`${prefix}-heal`,kind:'heal' as const,amount:10,x:355,y:183}]:[])];
  return true;
}
export function discardFloorItems(s: RunState) {
  const node=currentRoom(s);if(node?.pickups?.length){s.notice=`미수집 바닥 보상 ${node.pickups.length}개를 두고 이동했습니다.`;node.pickups=[];}
}
export function lockedDoorNearby(s: RunState) {
  if(s.phase!=='explore')return;
  return adjacentRooms(s).find(({direction,room})=>{
    const d=DIRECTIONS[direction],point={x:320+d.x*(BOUNDS.w/2-12),y:183+d.y*(BOUNDS.h/2-12)};
    return room.locked&&distance(s.player,point)<=55;
  });
}
export function unlockDoor(s: RunState): boolean {
  const door=lockedDoorNearby(s);if(!door)return false;
  if(!hasRelic(s,'R35')){s.notice='비밀의 열쇠가 필요합니다.';return false;}
  door.room.locked=false;door.room.keyOpened=true;s.expedition!.relics=s.expedition!.relics.filter(id=>id!=='R35');
  s.notice='잠금 보물방을 개방했습니다. 열쇠가 소모되었습니다.';return true;
}
