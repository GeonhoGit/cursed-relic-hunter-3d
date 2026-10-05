import { expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { createDungeonRun, emptyInput, step } from '../src/core/simulation';
import { advanceBoss, checkBossTransition, createBoss, startBossPattern } from '../src/core/boss';
import { enterNextRegion } from '../src/core/region';
import { defaultSettings, SaveStore, validRun } from '../src/persistence/save';
import { startTimeStop, stoppedBullet } from '../src/core/time-debt';
import { parryProjectile } from '../src/core/dodge';

function priest() {
  const s = createDungeonRun(22); s.expedition!.room = 8;
  s.expedition!.dungeon!.rooms[8].visited = s.expedition!.dungeon!.rooms[8].cleared = true;
  s.boss = createBoss(s); s.boss.hp = 0; s.phase = 'cleared'; enterNextRegion(s);
  s.expedition!.room = 8; s.expedition!.dungeon!.rooms[8].visited = true; s.phase = 'combat'; s.boss = createBoss(s);
  return s;
}
it('creates the second boss at the center with a separate health pool and valid save', () => {
  const s = priest(); expect(s.boss).toMatchObject({kind: 'chainpriest', hp: 2600, x: 320, y: 183, pattern: 'chains'});
  expect(validRun(s)).toBe(true);
});
it('announces fixed chains, allows jumping, and clears hazards at the 60% transition', () => {
  const s = priest(); s.player.x = 320; s.player.y = 280; startBossPattern(s, 'chains');
  expect(s.boss!.chains).toHaveLength(2); s.boss!.timer = 1;
  expect(advanceBoss(s)).toContainEqual({ damage: 16, cause: '사슬의 사제의 사슬' });
  startBossPattern(s, 'chains'); s.boss!.timer = 1; s.player.height = 25;
  expect(advanceBoss(s)).toEqual([]);
  s.boss!.hp = 1560; checkBossTransition(s);
  expect(s.boss!.mode).toBe('transition'); expect(s.boss!.chains).toEqual([]);
  for(let i=0;i<60;i++) { s.tick++; advanceBoss(s); }
  expect(s.boss!.chains).toHaveLength(3);
});
it('fires eight ring bullets leaving two adjacent safe sectors', () => {
  const s = priest(); startBossPattern(s, 'ring'); s.boss!.timer = 1; advanceBoss(s);
  expect(s.bullets).toHaveLength(8); expect(s.bullets.every(b=>b.source==='chainpriest' && b.damage===14)).toBe(true);
  expect(validRun(s)).toBe(true);
});
it('limits rituals to two attempts and preserves attempts when a transition interrupts one', () => {
  const s = priest(); s.player.y = 340; startBossPattern(s, 'ritual');
  expect(s.boss!.ritualAttempts).toBe(1); expect(validRun(s)).toBe(true);
  s.boss!.hp = 1560; checkBossTransition(s); expect(s.boss!.reservedSummons).toBeUndefined();
  expect(s.boss!.ritualAttempts).toBe(1);
  startBossPattern(s, 'ritual'); s.boss!.timer=1; advanceBoss(s);
  expect(s.enemies).toHaveLength(2); expect(s.enemies.every(e=>e.kind==='ashpriest' && e.spawnTicks===48)).toBe(true);
  startBossPattern(s, 'ritual'); expect(s.boss!.pattern).toBe('chains'); expect(s.boss!.ritualAttempts).toBe(2);
  expect(validRun(s)).toBe(true);
});
it('stops regular priest projectiles but excludes both bosses from time stop', () => {
  const s=priest(); s.expedition!.relics.push('R43');
  s.bullets=['ashpriest','chainpriest','gatekeeper'].map((source,i)=>({id:s.nextId++,x:320,y:183,vx:100,vy:0,life:120,damage:12,owner:'enemy' as const,source:source as any}));
  startTimeStop(s); expect(s.timeStop!.bulletIds).toEqual([s.bullets[0].id]);
  expect(stoppedBullet(s,s.bullets[0])).toBe(true);
});
it('rejects corrupt boss counters and region mismatch', () => {
  const s=priest(); s.boss!.ritualAttempts=3; expect(validRun(s)).toBe(false);
  s.boss!.ritualAttempts=0; s.boss!.kind='gatekeeper'; expect(validRun(s)).toBe(false);
});
it('rejects a missing ritual position list without throwing from the save validator', () => {
  const s=priest(); startBossPattern(s,'ritual'); s.boss!.rocks=null as any;
  expect(validRun(s)).toBe(false);
});
it('saves every priest pattern and resumes the exact deterministic simulation', async () => {
  for(const pattern of ['chains','ring','ritual'] as const) {
    const s=priest(); s.player.y=340; s.view={yaw:-Math.PI/2,pitch:0}; startBossPattern(s,pattern);
    const store=new SaveStore(`priest-${pattern}`); await store.load(); await store.save(s,defaultSettings());
    const copy=(await store.load())!.run!;
    for(let i=0;i<480;i++) {
      step(s,emptyInput(s)); step(copy,emptyInput(copy));
      expect(validRun(s),`${pattern}: tick ${s.tick}, phase ${s.phase}`).toBe(true);
    }
    expect(copy).toEqual(s);
  }
});
it('does not reserve a ritual above the encounter cap or hit through a pillar', () => {
  const s=priest(); s.player.y=340;
  s.enemies=Array.from({length:9},(_,i)=>({id:s.nextId++,kind:'rat' as const,x:100+i*25,y:350,hp:30,maxHp:30,angle:0,mode:'move' as const,timer:0,targetX:320,targetY:340,flash:0}));
  startBossPattern(s,'ritual'); expect(s.boss!.reservedSummons).toBeUndefined(); expect(s.boss!.ritualAttempts).toBe(0);
  s.player.x=190; s.player.y=100; s.boss!.x=260; s.boss!.y=180;
  startBossPattern(s,'chains'); s.boss!.timer=1; expect(advanceBoss(s)).toEqual([]);
});
it('parries ash priest shots while keeping boss shots immune', () => {
  const s=priest(); s.expedition!.relics=['R30']; s.player.dodgeRemaining=0.22; s.player.dodgeX=1; s.player.dodgeY=0;
  const b={id:s.nextId++,x:s.player.x+5,y:s.player.y,vx:-160,vy:0,owner:'enemy' as const,source:'chainpriest' as const,life:240,damage:14};
  expect(parryProjectile(s,b)).toBe(false);
  const ash={...b,source:'ashpriest' as const}; expect(parryProjectile(s,ash)).toBe(true); expect(ash.source).toBeUndefined();
});
it('cleans ritual reservations on player death or boss defeat and leaves valid saves',()=> {
  for(const death of [true,false]) {
    const s=priest(); s.player.y=340; startBossPattern(s,'ritual');
    if(death) { s.player.hp=0; } else s.boss!.hp=0;
    step(s,emptyInput(s)); expect(s.phase).toBe(death?'dead':'cleared'); expect(s.boss!.reservedSummons).toBeUndefined(); expect(validRun(s)).toBe(true);
  }
});
