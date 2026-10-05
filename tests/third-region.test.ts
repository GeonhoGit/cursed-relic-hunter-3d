import 'fake-indexeddb/auto';
import { expect, it } from 'vitest';
import { createDungeonRun, travel, step, emptyInput } from '../src/core/simulation';
import { createBoss } from '../src/core/boss';
import { enterNextRegion, canEnterNextRegion, regionName } from '../src/core/region';
import { validRun, SaveStore, defaultSettings } from '../src/persistence/save';
import { adjacentRooms } from '../src/core/dungeon';
import { roomLayout } from '../src/core/room-layout';
import { trapStage, trapHits, spikeTraps } from '../src/core/traps';
import { advanceEnemies } from '../src/core/enemy-ai';
import { beginGrowthRun, defaultProfile, emptyInvestment, earnedPoints, recordGrowth } from '../src/core/growth';

export function thirdRegion() {
  const s = createDungeonRun(42);
  for(let i=0;i<2;i++) {
    s.expedition!.room=8; const room=s.expedition!.dungeon!.rooms[8]; room.visited=room.cleared=true;
    s.boss=createBoss(s); s.boss.hp=0; s.phase='cleared'; enterNextRegion(s);
  }
  return s;
}
it('carries two region histories and both relic choices into a saved third maze', async()=> {
  const s=createDungeonRun(42); s.player.hp=61; s.gold=73;
  for(const relic of ['R44','R45'] as const) {
    s.expedition!.room=8; const rooms=s.expedition!.dungeon!.rooms;
    rooms[6].visited=rooms[6].cleared=true; rooms[6].reward={room:6,candidates:[relic],choice:relic};
    s.expedition!.acquired.push(relic); s.expedition!.relics.push(relic);
    rooms[8].visited=rooms[8].cleared=true; s.boss=createBoss(s); s.boss.hp=0; s.phase='cleared';
    expect(enterNextRegion(s)).toBe(true);
  }
  expect(s.expedition!.region).toBe(3); expect(regionName(s)).toBe('유물의 심장');
  expect(s.player.hp).toBe(61); expect(s.gold).toBe(73); expect(validRun(s)).toBe(true);
  const store=new SaveStore('third-region-history'); await store.load(); await store.save(s,defaultSettings());
  expect((await store.load())!.run).toEqual(s);
  const bad=structuredClone(s); (bad.expedition as any).earlierDungeon.rooms[6].reward.choice='skip';
  expect(validRun(bad)).toBe(false);
});
it('creates 8-10 enemies with a watcher and distinct third-region terrain',()=> {
  const layouts=new Set<number>();
  for(let seed=1;seed<=12;seed++) {
    const s=thirdRegion(); s.seed=seed;
    for(let id=1;id<=5;id++) {
      const copy=structuredClone(s), source=adjacentRooms(copy,id)[0].room;
      copy.expedition!.room=source.id; source.visited=source.cleared=true;
      expect(travel(copy,adjacentRooms(copy).find(d=>d.room.id===id)!.direction)).toBe(true);
      expect(copy.enemies.length).toBeGreaterThanOrEqual(8); expect(copy.enemies.length).toBeLessThanOrEqual(10);
      expect(copy.enemies.some(e=>(e.kind as string)==='watcher')).toBe(true); layouts.add(roomLayout(copy).id);
      expect(copy.enemies.some(e=>(e.kind as string)==='heartguard' && e.hp===120)).toBe(true);
      expect(copy.enemies.some(e=>(e.kind as string)==='riftshaman' && e.hp===80)).toBe(true);
      expect(validRun(copy)).toBe(true);
    }
  }
  expect([...layouts].sort()).toEqual([6,7,8]);
});
it('warns for 72 ticks before danger lines, supports swept jump avoidance and no boss traps',()=> {
  const s=thirdRegion(); s.expedition!.room=1; s.expedition!.dungeon!.rooms[1].visited=true; s.phase='combat';
  const zone=spikeTraps(s)[0]; expect(zone).toBeDefined(); s.player.x=zone.x+zone.w/2; s.player.y=zone.y+zone.h/2;
  s.trapTicks=71; expect(trapStage(s,0)).toBe('warning'); s.trapTicks=72; expect(trapStage(s,0)).toBe('active');
  expect(trapHits(s,s.player,0)).toContainEqual({damage:15,cause:'심장부의 위험선'});
  s.player.height=30; expect(trapHits(s,s.player,30)).toEqual([]);
  s.trapTicks=108; expect(trapStage(s,0)).toBe('rest');
  s.trapTicks=258;expect(spikeTraps(s)[0].y).not.toBe(zone.y);expect(trapStage(s,0)).toBe('warning');
  s.expedition!.room=8; expect(spikeTraps(s)).toEqual([]);
});
it('watcher announces six slow bullets then remains still during recovery',()=> {
  const s=thirdRegion(); s.phase='combat'; s.player.x=320; s.player.y=320;
  const e:any={id:s.nextId++,kind:'watcher',x:320,y:100,hp:90,maxHp:90,angle:0,mode:'move',timer:0,targetX:320,targetY:320,flash:0};
  s.enemies=[e]; advanceEnemies(s,{x:0,y:0}); expect(e.timer).toBe(54); expect(e.mode).toBe('windup');
  e.timer=1; advanceEnemies(s,{x:0,y:0}); expect(s.bullets).toHaveLength(6); expect(s.bullets.every(b=>b.damage===14)).toBe(true);
  const position={x:e.x,y:e.y}; for(let i=0;i<30;i++) advanceEnemies(s,{x:0,y:0}); expect({x:e.x,y:e.y}).toEqual(position);
});
it('awards final boss goal once and provides no fourth region',()=> {
  const s=thirdRegion(); beginGrowthRun(s,emptyInvestment(),'heart-growth');
  s.expedition!.room=8; s.expedition!.dungeon!.rooms[8].visited=true; s.phase='combat'; s.boss=createBoss(s);
  expect(s.boss!.kind).toBe('relicheart'); s.boss!.hp=0; step(s,emptyInput(s));
  expect(s.phase).toBe('cleared'); expect(canEnterNextRegion(s)).toBe(false);
  const before=recordGrowth(defaultProfile(),thirdRegion()), p=recordGrowth(defaultProfile(),s);
  expect(earnedPoints(p)-earnedPoints(before)).toBe(15); // G03, G04, G05 restored from history/current win.
  expect(earnedPoints(recordGrowth(p,s))).toBe(earnedPoints(p));
});
