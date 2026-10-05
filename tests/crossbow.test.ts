import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createDungeonRun, emptyInput, step } from '../src/core/simulation';
import { beginGrowthRun, defaultProfile, earnedPoints, emptyInvestment, growthStats, recordGrowth, validProfile } from '../src/core/growth';
import { createBoss } from '../src/core/boss';
import { enterNextRegion } from '../src/core/region';
import { currentWeapon, selectedWeapon, weaponUnlocked } from '../src/core/weapons';
import { CorruptSaveError, defaultSettings, SaveStore, validRun } from '../src/persistence/save';
import { frostHit, splitShot } from '../src/core/projectile-effects';
import type { Bullet, Enemy } from '../src/core/model';

function victory() {
  const s=createDungeonRun(42); beginGrowthRun(s,emptyInvestment(),'crossbow-winner'); s.expedition!.room=8;
  s.expedition!.dungeon!.rooms[8].visited=s.expedition!.dungeon!.rooms[8].cleared=true;
  s.boss=createBoss(s);s.boss.hp=0;s.phase='cleared';enterNextRegion(s);
  s.expedition!.room=8;s.expedition!.dungeon!.rooms[8].visited=s.expedition!.dungeon!.rooms[8].cleared=true;
  s.boss=createBoss(s);s.boss.hp=0;s.phase='cleared';return s;
}
describe('observer crossbow and priest progression',()=> {
  it('requires a living second-boss victory and awards G04 only once, including old profiles',()=> {
    const p=defaultProfile();expect(weaponUnlocked(p,'W03')).toBe(false);
    p.bossDefeated=true;expect(weaponUnlocked(p,'W03')).toBe(false);
    const s=victory(), won=recordGrowth(p,s);expect(won.priestDefeated).toBe(true);
    expect(earnedPoints(won)).toBe(10);expect(weaponUnlocked(won,'W03')).toBe(true);expect(recordGrowth(won,s)).toEqual(won);
    won.selectedWeapon='W03';expect(selectedWeapon(won)).toBe('W03');expect(validProfile(won)).toBe(true);
    const dead=structuredClone(s);dead.phase='dead';dead.player.hp=0;expect(recordGrowth(p,dead).priestDefeated??false).toBe(false);
    const legacy=defaultProfile();delete legacy.priestDefeated;expect(validProfile(legacy)).toBe(true);expect(weaponUnlocked(legacy,'W03')).toBe(false);
    expect(validProfile({...won,priestDefeated:'yes'})).toBe(false);
  });
  it('fires one accurate fast bolt at 45-tick intervals without innate relic effects',()=> {
    const s=createDungeonRun(42);s.weapon='W03';s.player.x=96;s.player.y=180;
    const fire={...emptyInput(s),fire:true,aimX:700,aimY:180};step(s,fire);
    expect(s.bullets).toHaveLength(1);expect(s.bullets[0]).toMatchObject({damage:14,vx:440,vy:0,life:74,bouncesLeft:0,hitIds:[]});
    for(let i=0;i<44;i++)step(s,fire);expect(s.stats.shots).toBe(1);
    step(s,fire);expect(s.stats.shots).toBe(2);
    expect(currentWeapon(s).damage*60/currentWeapon(s).interval).toBeLessThan(21);
  });
  it('applies fractional growth, pitch, and existing split/frost effects to the crossbow',()=> {
    const s=createDungeonRun(42);s.weapon='W03';beginGrowthRun(s,{...emptyInvestment(),attack:1,speed:1},'crossbow-growth');
    s.expedition!.relics=['R03','R08'];step(s,{...emptyInput(s),fire:true,aimX:500,aimY:183,aimPitch:0.2});
    const b=s.bullets[0];expect(b.damage).toBeCloseTo(14.07);expect(Math.hypot(b.vx,b.vy,b.heightVelocity!)).toBeCloseTo(440);
    expect(growthStats(s).fireInterval).toBeCloseTo(45/1.005);
    const e:Enemy={id:900,kind:'archer',x:400,y:183,hp:40,maxHp:40,angle:0,mode:'move',timer:0,targetX:0,targetY:0,flash:0};
    frostHit(s,e,b);frostHit(s,e,{...b,phase:'return'});expect(e.frost!.hits).toHaveLength(1);
    const pending:Bullet[]=[];splitShot(s,b,e,pending);expect(pending).toHaveLength(3);expect(pending[0].damage).toBeCloseTo(14.07*0.35);
  });
  it('rejects locked choices, then saves the unlocked preference and in-flight bolts exactly',async()=> {
    const store=new SaveStore('crossbow-save');await store.load();const start=createDungeonRun(42);
    const before=await store.save(start,defaultSettings());await expect(store.save(start,defaultSettings(),undefined,'W03')).rejects.toBeInstanceOf(CorruptSaveError);
    expect(await store.load()).toEqual(before);await store.save(victory(),defaultSettings(),undefined,'W03');
    const s=createDungeonRun(42);s.weapon='W03';beginGrowthRun(s,emptyInvestment(),'crossbow-next');
    step(s,{...emptyInput(s),fire:true,aimPitch:0.1});expect(validRun(s)).toBe(true);
    await store.save(s,defaultSettings());const restored=(await store.load())!.run!;expect(restored).toEqual(s);
    for(let i=0;i<60;i++){step(s,emptyInput(s));step(restored,emptyInput(restored));}expect(restored).toEqual(s);
  });
  it('reconciles an already saved priest victory before replacing it with a new run or settings',async()=> {
    const name='crossbow-pre-feature',store=new SaveStore(name);await store.load();const won=await store.save(victory(),defaultSettings());
    // Reproduce a previous version's completed run with the new flag absent.
    delete won.profile!.priestDefeated;
    const db=await new Promise<IDBDatabase>(resolve=>{const q=indexedDB.open(name,1);q.onsuccess=()=>resolve(q.result);});
    await new Promise<void>(resolve=>{const tx=db.transaction('save','readwrite');tx.objectStore('save').put(won,'current');tx.oncomplete=()=>resolve();});db.close();
    await store.load();const next=createDungeonRun(99);beginGrowthRun(next,emptyInvestment(),'next-after-old-win');
    const saved=await store.save(next,defaultSettings(),undefined,'W03');expect(saved.profile!.priestDefeated).toBe(true);expect(selectedWeapon(saved.profile!)).toBe('W03');
    expect(saved.run!.weapon).toBeUndefined();expect(earnedPoints(saved.profile!)).toBe(10);
  });
});
