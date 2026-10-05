import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { createDungeonRun, emptyInput, step } from '../src/core/simulation';
import { advanceBoss, checkBossTransition, createBoss, startBossPattern } from '../src/core/boss';
import { enterNextRegion } from '../src/core/region';
import { damageEnemy, advanceProjectiles } from '../src/core/combat';
import { damageHeartPillar } from '../src/core/heart-boss';
import { PILLARS } from '../src/core/model';
import { parryProjectile } from '../src/core/dodge';
import { startTimeStop, stoppedBullet } from '../src/core/time-debt';
import { defaultSettings, SaveStore, validRun } from '../src/persistence/save';
import { advanceBombs } from '../src/core/bombs';
import { landingImpact } from '../src/core/jump';
import { advanceBurn } from '../src/core/combat';
import { beginGrowthRun, emptyInvestment, growthStats } from '../src/core/growth';
import { inventoryMarkup } from '../src/game/expedition-ui';

function heart() {
  const s=createDungeonRun(42);
  for(let i=0;i<2;i++) {s.expedition!.room=8;const r=s.expedition!.dungeon!.rooms[8];r.visited=r.cleared=true;
    s.boss=createBoss(s);s.boss.hp=0;s.phase='cleared';enterNextRegion(s);}
  s.expedition!.room=8;s.expedition!.dungeon!.rooms[8].visited=true;s.phase='combat';s.player.y=340;s.boss=createBoss(s);return s;
}
it('creates a centered 3600 HP final boss and eight ordinary bullets with a full tell',()=> {
  const s=heart();expect(s.boss).toMatchObject({kind:'relicheart',hp:3600,x:320,y:183,timer:48});
  expect(validRun(s)).toBe(true);s.boss!.timer=1;advanceBoss(s);expect(s.bullets).toHaveLength(8);
  expect(s.bullets.every(b=>b.source==='relicheart' && b.damage===15)).toBe(true);
});
it('locks a laser direction, respects pillars, and offers a full 72 tick tell',()=> {
  const s=heart();startBossPattern(s,'laser');expect(s.boss!.timer).toBe(72);
  s.player.x=500;s.boss!.timer=1;expect(advanceBoss(s)).toEqual([]);
  s.player.x=320;startBossPattern(s,'laser');s.boss!.timer=1;
  expect(advanceBoss(s)).toContainEqual({damage:22,cause:'유물 심장의 레이저'});
  s.boss!.x=250;s.boss!.y=128;s.player.x=180;s.player.y=128;startBossPattern(s,'laser');s.boss!.timer=1;
  expect(advanceBoss(s)).toEqual([]);
});
it('uses an expanding annulus instead of an unavoidable full disk and lets jumps clear it',()=> {
  const s=heart();s.player.y=213;startBossPattern(s,'shockwave');expect(s.boss!.timer).toBe(60);
  s.boss!.timer=1;expect(advanceBoss(s)).toEqual([]);expect(s.boss!.mode).toBe('wave');
  const hits=[];for(let i=0;i<10;i++)hits.push(...advanceBoss(s));expect(hits).toContainEqual({damage:18,cause:'유물 심장의 충격파'});
  expect(hits).toHaveLength(1);
  startBossPattern(s,'shockwave');s.boss!.timer=1;s.player.height=30;advanceBoss(s);
  for(let i=0;i<10;i++)expect(advanceBoss(s)).toEqual([]);
});
it('blocks all body damage while linked, destroys the pillar by normal shots and keeps the ongoing pattern',()=> {
  const s=heart(),b=s.boss!;damageEnemy(s,b,1260);expect(b).toMatchObject({stage:2,mode:'transition',pillarIndex:0,pillarHp:100,shieldLinks:1});
  for(let i=0;i<60;i++){s.tick++;advanceBoss(s);}startBossPattern(s,'laser');
  const hp=b.hp,timer=b.timer;damageEnemy(s,b,50);expect(b.hp).toBe(hp);
  const p=PILLARS[0];s.bullets=[{id:s.nextId++,x:p.x+p.w/2,y:p.y-12,vx:0,vy:1200,life:60,damage:100,owner:'player',height:34}];
  advanceProjectiles(s);expect(b.pillarIndex).toBeUndefined();expect(b.relinkTicks).toBe(480);expect(b.timer).toBe(timer);expect(b.pattern).toBe('laser');
  damageEnemy(s,b,7);expect(b.hp).toBe(hp-7);
});
it('waits eight simulation seconds plus the current attack and never links a third pillar',()=> {
  const s=heart(),b=s.boss!;damageEnemy(s,b,1260);for(let i=0;i<60;i++){s.tick++;advanceBoss(s);}
  damageHeartPillar(s,0,100);b.relinkTicks=1;startBossPattern(s,'laser');b.timer=2;
  s.tick++;advanceBoss(s);expect(b.shieldLinks).toBe(1);s.tick++;advanceBoss(s);expect(b.mode).toBe('recover');
  for(let i=0;i<12;i++){s.tick++;advanceBoss(s);}expect(b).toMatchObject({mode:'transition',shieldLinks:2,pillarIndex:1,pillarHp:100});
  for(let i=0;i<60;i++){s.tick++;advanceBoss(s);}damageHeartPillar(s,1,100);
  for(let i=0;i<1000;i++){s.tick++;advanceBoss(s);}expect(b.shieldLinks).toBe(2);expect(b.pillarIndex).toBeUndefined();
});
it('skips the middle stage on a large hit and cancels shield/relink on stage three or death',()=> {
  const s=heart(),b=s.boss!;damageEnemy(s,b,2600);expect(b.stage).toBe(3);expect(b.shieldLinks).toBe(0);expect(b.pillarIndex).toBeUndefined();
  for(let i=0;i<60;i++){s.tick++;advanceBoss(s);}expect(b.pattern).toBe('laser');b.timer=1;advanceBoss(s);b.timer=1;advanceBoss(s);expect(b.pattern).toBe('pulse');
  const linked=heart(),lb=linked.boss!;damageEnemy(linked,lb,1260);damageHeartPillar(linked,0,100);
  lb.hp=1080;checkBossTransition(linked);expect(lb.relinkTicks).toBeUndefined();expect(lb.pillarIndex).toBeUndefined();
});
it('reflects/stops heart bullets but leaves lasers outside those mechanics, slows pattern time 25%',()=> {
  const s=heart();s.expedition!.relics=['R30','R43'];s.player.dodgeRemaining=.24;s.player.dodgeX=1;s.player.dodgeY=0;
  const b:any={id:s.nextId++,x:s.player.x+10,y:s.player.y,vx:-100,vy:0,life:120,damage:15,owner:'enemy',source:'relicheart'};
  expect(parryProjectile(s,b)).toBe(true);expect(b.owner).toBe('player');
  b.owner='enemy';b.kind=undefined;b.source='relicheart';s.bullets=[b];startTimeStop(s);expect(stoppedBullet(s,b)).toBe(true);
  startBossPattern(s,'laser');for(let i=0;i<4;i++){s.tick++;advanceBoss(s);}expect(s.boss!.timer).toBe(69);
});
it('restores protected, unprotected waiting, wave and stage-three snapshots deterministically',async()=> {
  for(const state of ['linked','waiting','wave','third'] as const) {
    const s=heart();if(state==='linked'||state==='waiting'){damageEnemy(s,s.boss!,1260);if(state==='waiting')damageHeartPillar(s,0,100);}
    if(state==='wave'){startBossPattern(s,'shockwave');s.boss!.timer=1;advanceBoss(s);}
    if(state==='third')damageEnemy(s,s.boss!,2600);
    expect(validRun(s),state).toBe(true);const store=new SaveStore(`heart-${state}`);await store.load();await store.save(s,defaultSettings());
    const copy=(await store.load())!.run!;
    for(let i=0;i<650;i++){step(s,emptyInput(s));step(copy,emptyInput(copy));expect(validRun(s),`${state}: ${s.tick}`).toBe(true);}
    expect(copy).toEqual(s);
  }
});
it('cleans shield and wave state at final death and gives no additional boss or relic screen',()=> {
  const s=heart(),b=s.boss!;damageEnemy(s,b,1260);s.player.hp=0;step(s,emptyInput(s));
  expect(s.phase).toBe('dead');expect(b.pillarIndex).toBeUndefined();expect(b.relinkTicks).toBeUndefined();
  const won=heart();won.boss!.hp=0;step(won,emptyInput(won));expect(won.phase).toBe('cleared');expect(won.expedition!.reward).toBeNull();expect(won.enemies).toEqual([]);
});
it('shield absorbs bomb, landing, burn and projectile status effects while attacks continue',()=> {
  const s=heart(),b=s.boss!;damageEnemy(s,b,1260);for(let i=0;i<60;i++){s.tick++;advanceBoss(s);}
  s.expedition!.relics=['R13','R46','R07','R08'];s.player.x=320;s.player.y=216;
  s.bombs=[{id:s.nextId++,x:320,y:210,ticks:1}];advanceBombs(s);landingImpact(s);
  b.burnTicks=120;b.burnPulse=1;advanceBurn(s);
  s.bullets=[{id:s.nextId++,x:320,y:218,vx:0,vy:-1200,owner:'player',damage:7,life:75}];advanceProjectiles(s);
  expect(b.hp).toBe(2340);expect(b.frost).toBeUndefined();expect(b.burnTicks).toBe(119);
  b.timer=1;advanceBoss(s);expect(s.bullets.filter(x=>x.source==='relicheart')).toHaveLength(8);
});
it('uses actual 480 active ticks before the second link, leaving an attack to finish',()=> {
  const s=heart(),b=s.boss!;damageEnemy(s,b,1260);for(let i=0;i<60;i++){s.tick++;advanceBoss(s);}damageHeartPillar(s,0,100);
  for(let i=0;i<479;i++){s.tick++;advanceBoss(s);}expect(b.shieldLinks).toBe(1);expect(b.relinkTicks).toBe(1);
  s.tick++;advanceBoss(s);expect(b.relinkTicks).toBe(0);
  for(let i=0;i<160 && b.shieldLinks===1;i++){s.tick++;advanceBoss(s);}expect(b.shieldLinks).toBe(2);expect(b.pillarIndex).toBe(1);
});
it('counts swept radial crossings during a dash even if neither endpoint is in the ring',()=> {
  const s=heart(),b=s.boss!;startBossPattern(s,'shockwave');b.timer=1;advanceBoss(s);b.shockRadius=80;b.timer=62;
  s.player.x=320;s.player.y=303;
  expect(advanceBoss(s,{x:320,y:223},0)).toContainEqual({damage:18,cause:'유물 심장의 충격파'});
});
it('rejects damaged archive/shield/timer states without throwing',()=> {
  const s=heart();damageEnemy(s,s.boss!,1260);
  for(const mutate of [
    (s:any)=>{s.expedition.earlierDungeon=null;},(s:any)=>{s.expedition.previousDungeon.rooms[8].cleared=false;},
    (s:any)=>{s.boss.pillarIndex=3;},(s:any)=>{s.boss.pillarHp=101;},(s:any)=>{s.boss.shieldLinks=3;},
    (s:any)=>{s.boss.relinkTicks=480;},(s:any)=>{s.boss.stage=3;},
  ]){const bad=structuredClone(s);mutate(bad);expect(()=>validRun(bad)).not.toThrow();expect(validRun(bad)).toBe(false);}
});
it('saves fractional pillar health from attack investments and split projectiles',async()=> {
  const s=heart();beginGrowthRun(s,{...emptyInvestment(),attack:1},'fractional-pillar');
  damageEnemy(s,s.boss!,1260);expect(validRun(s)).toBe(true);
  const pillar=PILLARS[0];s.bullets=[{id:s.nextId++,x:pillar.x+pillar.w/2,y:pillar.y-12,vx:0,vy:1200,life:60,damage:growthStats(s).damage,owner:'player',height:34}];
  advanceProjectiles(s);expect(s.boss!.pillarHp).toBeCloseTo(92.965);
  expect(validRun(s)).toBe(true);
  const store=new SaveStore('fractional-pillar');await store.load();await store.save(s,defaultSettings());expect((await store.load())!.run).toEqual(s);
  damageHeartPillar(s,0,growthStats(s).damage*.35);expect(s.boss!.pillarHp).toBeCloseTo(90.50275);expect(validRun(s)).toBe(true);
  for(const hp of [0,-.1,100.1,NaN,Infinity]){const bad=structuredClone(s);bad.boss!.pillarHp=hp;expect(validRun(bad)).toBe(false);}
});
it('inventory explains the heart-bullet exception and the time-debt boss delay before the player chooses tactics',()=> {
  const s=heart();s.expedition!.relics=s.expedition!.acquired=['R30','R43'];
  const markup=inventoryMarkup(s);
  expect(markup).toContain('유물 심장의 일반 탄환은 반사 가능');
  expect(markup).toContain('유물 심장의 일반 탄환은 정지 가능');expect(markup).toContain('패턴 진행을 25% 늦춥니다');
});
it('rejects malformed third-region archives and relic arrays even when a live bomb requests room geometry',()=> {
  const s=heart();const room=s.expedition!.dungeon!.rooms[6];room.visited=room.cleared=true;
  room.reward={room:6,candidates:['R13'],choice:'R13'};s.expedition!.relics=['R13'];s.expedition!.acquired=['R13'];
  s.player.auxCooldown=60;s.bombs=[{id:s.nextId++,x:320,y:280,ticks:60}];expect(validRun(s)).toBe(true);
  for(const mutate of [(s:any)=>{s.expedition.relics=null;},(s:any)=>{s.expedition.dungeon.rooms=null;},
    (s:any)=>{s.expedition.earlierDungeon.rooms=null;},(s:any)=>{s.expedition.previousDungeon.rooms=null;}]){
    const bad=structuredClone(s);mutate(bad);expect(()=>validRun(bad)).not.toThrow();expect(validRun(bad)).toBe(false);
  }
});
it('resolves same-tick final boss and player fatality before declaring victory, allowing last-breath survival',()=> {
  for(const survive of [false,true]) {
    const s=heart(),b=s.boss!;b.stage=3;b.hp=7;b.pattern='laser';b.mode='windup';b.timer=1;
    s.player.x=320;s.player.y=280;s.player.hp=1;
    if(survive)s.expedition!.relics=['R20'];
    s.bullets=[{id:s.nextId++,x:320,y:212,vx:0,vy:-1200,owner:'player',damage:7,life:75}];
    step(s,emptyInput(s));expect(b.hp).toBe(0);expect(s.phase).toBe(survive?'cleared':'dead');expect(s.player.hp).toBe(survive?1:0);
  }
});
