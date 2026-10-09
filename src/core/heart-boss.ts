import { BOUNDS, PILLARS, type Boss, type BossPattern, type Point, type RunState } from './model';
import { roomLayout } from './room-layout';
import { segmentBox, visible } from './geometry';
import { clearRelicFields } from './relic-fields';
import { blastStoneWall, strikeStoneWall } from './masonry';

export const HEART = { hp:3600, pillarHp:100, relink:480, transition:60, recovery:60,
  pulse:48, laser:72, shockwave:60, bulletSpeed:150, waveTicks:72, waveStride:8, waveHalfWidth:6, waveHeight:16 } as const;
export function createHeart(s: RunState): Boss {
  const x=BOUNDS.x+BOUNDS.w/2,y=BOUNDS.y+BOUNDS.h/2;
  return { id:s.nextId++, kind:'relicheart', x,y,hp:HEART.hp,maxHp:HEART.hp,stage:1,pattern:'pulse',mode:'windup',
    angle:Math.atan2(s.player.y-y,s.player.x-x),flash:0,timer:HEART.pulse,targetX:s.player.x,targetY:s.player.y,
    rocks:[],impactTicks:0,chargeHit:false,summonsDone:false,transitionTick:-1,shieldLinks:0 };
}
export function clearHeartShield(b: Boss) {
  delete b.pillarIndex;delete b.pillarHp;delete b.relinkTicks;delete b.shockRadius;delete b.shockHit;
}
export const heartProtected = (b:Boss) => b.kind==='relicheart' && b.pillarIndex!==undefined;
export function startHeartPattern(s:RunState, pattern:BossPattern) {
  if(!['pulse','laser','shockwave'].includes(pattern)) return;
  const b=s.boss!;b.pattern=pattern;b.mode='windup';b.timer=HEART[pattern as 'pulse'|'laser'|'shockwave'];
  b.targetX=s.player.x;b.targetY=s.player.y;b.angle=Math.atan2(b.targetY-b.y,b.targetX-b.x);
  b.impactTicks=0;delete b.shockRadius;delete b.shockHit;
}
function prepare(s:RunState, link:boolean) {
  const b=s.boss!;b.mode='transition';b.timer=HEART.transition;b.transitionTick=s.tick;b.impactTicks=0;
  b.rocks=[];delete b.shockRadius;delete b.shockHit;s.bullets=[];
  clearRelicFields(s);
  if(link) { b.pillarIndex=b.shieldLinks ?? 0;b.pillarHp=HEART.pillarHp;b.shieldLinks=(b.shieldLinks??0)+1;delete b.relinkTicks; }
}
export function checkHeartTransition(s:RunState) {
  const b=s.boss!;if(b.hp<=0) {clearHeartShield(b);return;}
  const stage=b.hp<=b.maxHp*.3?3:b.hp<=b.maxHp*.65?2:1;
  if(stage<=b.stage)return;
  b.stage=stage as Boss['stage'];clearHeartShield(b);prepare(s,stage===2);
}
export function damageHeartPillar(s:RunState,index:number,damage:number):boolean {
  const b=s.boss;if(!b || b.kind!=='relicheart' || b.hp<=0 || b.stage!==2 || b.pillarIndex!==index || !(damage>0))return false;
  b.pillarHp=Math.max(0,(b.pillarHp??0)-damage);
  if(b.pillarHp===0) { delete b.pillarIndex;delete b.pillarHp;if(b.shieldLinks===1)b.relinkTicks=HEART.relink; }
  return true;
}
export const linkedPillar = (b:Boss) => b.pillarIndex===undefined ? undefined : PILLARS[b.pillarIndex];
// Clip the displayed and damaging beam to its first solid obstacle.
export function heartLaserEnd(s:RunState):Point {
  const b=s.boss!, end={x:b.x+Math.cos(b.angle)*1400,y:b.y+Math.sin(b.angle)*1400};let stop=1;
  for(const wall of roomLayout(s).walls){const t=segmentBox(b.x,b.y,end.x,end.y,wall,0);if(t!==null)stop=Math.min(stop,t);}
  return {x:b.x+(end.x-b.x)*stop,y:b.y+(end.y-b.y)*stop};
}
function recover(b:Boss){b.mode='recover';b.timer=HEART.recovery;}
// Partition a swept player segment at its intersections with the expanding ring.
// This handles dashes crossing both edges as well as vertical jump/landing paths.
export function sweptWave(s:RunState,before:Point,height:number,oldRadius:number,radius:number,bodyRadius=7):boolean {
  const b=s.boss!,p=s.player,dx=p.x-before.x,dy=p.y-before.y,x=before.x-b.x,y=before.y-b.y,dr=radius-oldRadius;
  const cuts=[0,1], half=HEART.waveHalfWidth+bodyRadius;
  for(const sign of [-1,1]) {
    const r=oldRadius+sign*half,A=dx*dx+dy*dy-dr*dr,B=2*(x*dx+y*dy-r*dr),C=x*x+y*y-r*r;
    const roots=Math.abs(A)<1e-9 ? Math.abs(B)<1e-9?[]:[-C/B] : B*B-4*A*C<0?[]:[(-B-Math.sqrt(B*B-4*A*C))/(2*A),(-B+Math.sqrt(B*B-4*A*C))/(2*A)];
    cuts.push(...roots.filter(t=>t>=0&&t<=1&&r+dr*t>=0));
  }
  const dh=(p.height??0)-height;
  if(Math.abs(dh)>1e-9){const t=(HEART.waveHeight-height)/dh;if(t>=0&&t<=1)cuts.push(t);}
  cuts.sort((a,c)=>a-c);const samples=[...cuts,...cuts.slice(1).map((t,i)=>(t+cuts[i])/2)];
  return samples.some(t=>height+dh*t<=HEART.waveHeight+1e-9
    && Math.abs(Math.hypot(x+dx*t,y+dy*t)-(oldRadius+dr*t))<=half+1e-9
    && visible(b,{x:before.x+dx*t,y:before.y+dy*t},0,roomLayout(s).walls));
}
export function advanceHeart(s:RunState,before:Point=s.player,height=s.player.height??0):{damage:number;cause:string}[] {
  const b=s.boss!,hits:{damage:number;cause:string}[]=[];
  b.flash=Math.max(0,b.flash-1);if(b.frost?.freezeTicks)b.frost.freezeTicks--;
  if(b.impactTicks>0)b.impactTicks--;
  if(b.relinkTicks!==undefined)b.relinkTicks=Math.max(0,b.relinkTicks-1);
  if(b.stage===2 && b.relinkTicks===0 && b.mode==='recover' && b.impactTicks===0){prepare(s,true);return hits;}
  // Preserve the full warning when time debt affects the boss. Fixed simulation tick gives deterministic saves.
  if(s.timeStop && s.tick%4===0)return hits;
  if(b.mode==='transition') {
    if(s.tick>b.transitionTick && --b.timer<=0)startHeartPattern(s,b.stage===3?'laser':'pulse');return hits;
  }
  if(b.mode==='wave') {
    const old=b.shockRadius??0;b.shockRadius=old+HEART.waveStride;
    if(!b.shockHit&&sweptWave(s,before,height,old,b.shockRadius)){b.shockHit=true;hits.push({damage:18,cause:'유물 심장의 충격파'});}
    if (s.stoneWall) {
      const wall = s.stoneWall, dx = Math.max(wall.x - b.x, 0, b.x - wall.x - wall.w), dy = Math.max(wall.y - b.y, 0, b.y - wall.y - wall.h);
      const near = Math.hypot(dx, dy) - HEART.waveHalfWidth;
      if ((old === 0 && near <= 0) || near > old && near <= b.shockRadius) blastStoneWall(s, b, b.shockRadius + HEART.waveHalfWidth, 18);
    }
    if(--b.timer<=0){delete b.shockRadius;delete b.shockHit;delete b.allyShockHit;delete b.decoyShockHit;recover(b);}return hits;
  }
  if(--b.timer>0)return hits;
  if(b.mode==='recover') {
    const next=b.stage===3?(b.pattern==='laser'?'pulse':'laser'):b.pattern==='pulse'?'laser':b.pattern==='laser'?'shockwave':'pulse';
    startHeartPattern(s,next);return hits;
  }
  if(b.pattern==='pulse') {
    for(let i=0;i<8;i++){const a=b.angle+i*Math.PI/4;s.bullets.push({id:s.nextId++,x:b.x,y:b.y,vx:Math.cos(a)*HEART.bulletSpeed,
      vy:Math.sin(a)*HEART.bulletSpeed,damage:15,owner:'enemy',source:'relicheart',life:240});}recover(b);
  } else if(b.pattern==='laser') {
    const end=heartLaserEnd(s),length=Math.hypot(end.x-b.x,end.y-b.y),c=Math.cos(b.angle),sn=Math.sin(b.angle);
    const local=(p:Point)=>({x:(p.x-b.x)*c+(p.y-b.y)*sn,y:-(p.x-b.x)*sn+(p.y-b.y)*c});
    const a=local(before),z=local(s.player);
    if(segmentBox(a.x,a.y,z.x,z.y,{x:0,y:-6,w:length,h:12},7)!==null)hits.push({damage:22,cause:'유물 심장의 레이저'});
    strikeStoneWall(s, b, { x: b.x + c * 1000, y: b.y + sn * 1000 }, 22);
    b.impactTicks=12;recover(b);
  } else { b.mode='wave';b.timer=HEART.waveTicks;b.shockRadius=0;b.shockHit=false;delete b.allyShockHit;delete b.decoyShockHit; }
  return hits;
}
