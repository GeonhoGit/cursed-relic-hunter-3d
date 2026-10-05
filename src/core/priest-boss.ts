import { BOUNDS, DT, type Boss, type BossPattern, type RunState } from './model';
import { distance, moveBody, nextWaypoint, segmentCircle, visible } from './geometry';
import { roomLayout } from './room-layout';
import { advanceSilence } from './silence';

export const PRIEST = { hp: 2600, chains: 60, ring: 54, ritual: 90, recovery: 72, transition: 60 } as const;
export function createPriest(s: RunState): Boss {
  const b: Boss = { id: s.nextId++, kind: 'chainpriest', x: 320, y: 183, hp: PRIEST.hp, maxHp: PRIEST.hp,
    angle: 0, flash: 0, stage: 1, pattern: 'chains', mode: 'windup', timer: PRIEST.chains,
    targetX: s.player.x, targetY: s.player.y, chargeHit: false, rocks: [], impactTicks: 0,
    summonsDone: false, transitionTick: -1, chains: [], ringGap: 0, ritualAttempts: 0 };
  // Pattern initialization only needs the boss, and does not mutate the caller's boss slot.
  startPriestPattern({ ...s, boss: b }, 'chains'); return b;
}
export function startPriestPattern(s: RunState, requested: BossPattern) {
  const b = s.boss!;
  let pattern = ['chains','ring','ritual'].includes(requested) ? requested as 'chains'|'ring'|'ritual' : 'chains';
  const positions = [{x:100,y:90},{x:100,y:275},{x:320,y:80},{x:320,y:280},{x:540,y:90},{x:540,y:275}]
    .filter(p=>distance(p,s.player)>=96 && distance(p,b)>=45 && visible(p,p,11,roomLayout(s).obstacles)
      && s.enemies.every(e=>distance(p,e)>=24)).sort((a,c)=>distance(c,s.player)-distance(a,s.player));
  if (pattern==='ritual' && ((b.ritualAttempts??0)>=2 || s.enemies.length>8 || positions.length<2)) pattern='chains';
  b.pattern=pattern; b.mode='windup'; b.timer=PRIEST[pattern]; b.targetX=s.player.x; b.targetY=s.player.y;
  delete b.silenceTicks;
  b.angle=Math.atan2(b.targetY-b.y,b.targetX-b.x); b.chains=[]; b.rocks=[]; b.impactTicks=0; delete b.reservedSummons;
  if(pattern==='chains') {
    const offsets=b.stage===1?[0,40]:[-40,0,40], dx=Math.cos(b.angle),dy=Math.sin(b.angle);
    const clampX=(x:number)=>Math.max(BOUNDS.x+7,Math.min(BOUNDS.x+BOUNDS.w-7,x));
    const clampY=(y:number)=>Math.max(BOUNDS.y+7,Math.min(BOUNDS.y+BOUNDS.h-7,y));
    b.chains=offsets.map(o=>({x:clampX(b.targetX-dy*o-dx*180),y:clampY(b.targetY+dx*o-dy*180),
      tx:clampX(b.targetX-dy*o+dx*180),ty:clampY(b.targetY+dx*o+dy*180)}));
  } else if(pattern==='ring') {
    if(b.stage===2) b.ringGap=((b.ringGap??0)+3)%10;
  } else { b.ritualAttempts=(b.ritualAttempts??0)+1; b.reservedSummons=2; b.rocks=positions.slice(0,2); }
}
export function advancePriest(s: RunState): {damage:number;cause:string}[] {
  const b=s.boss!, hits: {damage:number;cause:string}[]=[];
  const scale=b.frost?.freezeTicks?0.8:1; if(b.frost?.freezeTicks) b.frost.freezeTicks--;
  b.flash=Math.max(0,b.flash-1);
  if(b.impactTicks>0 && --b.impactTicks===0) b.chains=[];
  if(b.mode==='transition') {
    if(s.tick>b.transitionTick && --b.timer<=0) startPriestPattern(s,'chains'); return hits;
  }
  if (advanceSilence(b)) return hits;
  if(b.mode==='recover' && b.timer<=PRIEST.recovery-12) {
    const obstacles=roomLayout(s).obstacles, near=distance(b,s.player);
    if(near>100 || !visible(b,s.player,0,obstacles)) {
      const goal={x:s.player.x,y:s.player.y}; moveBody(goal,0,0,21,obstacles);
      const next=nextWaypoint(b,goal,20,obstacles),gap=distance(b,next);
      if(gap>0.001) { const stride=Math.min((b.stage===1?64:80)*DT*scale,gap);
        moveBody(b,(next.x-b.x)/gap*stride,(next.y-b.y)/gap*stride,20,obstacles); }
    }
    b.angle=Math.atan2(s.player.y-b.y,s.player.x-b.x);
  }
  if(--b.timer>0) return hits;
  if(b.mode==='recover') {
    startPriestPattern(s,b.pattern==='chains'?'ring':b.pattern==='ring'?'ritual':'chains'); return hits;
  }
  if(b.pattern==='chains') {
    if((s.player.height??0)<=12 && visible(b,s.player,0,roomLayout(s).walls)
      && b.chains!.some(c=>segmentCircle(c.x,c.y,c.tx,c.ty,s.player.x,s.player.y,14)!==null)) {
      hits.push({damage:16,cause:'사슬의 사제의 사슬'});
    }
    b.impactTicks=18;
  } else if(b.pattern==='ring') {
    for(let i=0;i<10;i++) {
      if(i===b.ringGap || i===((b.ringGap??0)+1)%10) continue;
      const a=b.angle+i*Math.PI*2/10;
      s.bullets.push({id:s.nextId++,x:b.x,y:b.y,vx:Math.cos(a)*160,vy:Math.sin(a)*160,
        owner:'enemy',source:'chainpriest',damage:14,life:240});
    }
  } else if(b.pattern==='ritual') {
    for(const p of b.rocks.slice(0,Math.min(b.reservedSummons??0,10-s.enemies.length))) {
      s.enemies.push({id:s.nextId++,kind:'ashpriest',...p,hp:65,maxHp:65,angle:Math.atan2(s.player.y-p.y,s.player.x-p.x),
        mode:'move',timer:0,targetX:s.player.x,targetY:s.player.y,flash:0,spawnTicks:48});
    }
    b.rocks=[]; delete b.reservedSummons;
  }
  b.mode='recover'; b.timer=PRIEST.recovery; return hits;
}
