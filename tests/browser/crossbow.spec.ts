import {expect,test,type Page} from '@playwright/test';

async function setup(page:Page,kind:'gate'|'priest'|'old-priest') {
  await page.goto('/');await page.clock.install({time:new Date('2026-10-04T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-04T00:00:01Z'));
  await page.evaluate(async kind=> {
    const a='/src/core/simulation.ts',b='/src/core/boss.ts',c='/src/core/region.ts',d='/src/core/growth.ts',e='/src/persistence/save.ts';
    const sim=await import(a),boss=await import(b),region=await import(c),growth=await import(d),save=await import(e);
    const s=sim.createDungeonRun(42);growth.beginGrowthRun(s,growth.emptyInvestment(),'crossbow-browser');s.expedition.room=8;
    s.expedition.dungeon.rooms[8].visited=s.expedition.dungeon.rooms[8].cleared=true;s.boss=boss.createBoss(s);s.boss.hp=0;s.phase='cleared';
    if(kind!=='gate') {
      region.enterNextRegion(s);s.expedition.room=8;s.expedition.dungeon.rooms[8].visited=true;
      s.boss=boss.createBoss(s);s.boss.hp=kind==='old-priest'?0:7;s.boss.stage=2;s.boss.mode='recover';s.boss.timer=72;
      s.phase=kind==='old-priest'?'cleared':'combat';s.expedition.dungeon.rooms[8].cleared=kind==='old-priest';s.player.y=280;s.view={yaw:-Math.PI/2,pitch:0};
    }
    const store=new save.SaveStore();await store.load();const record=await store.save(s,save.defaultSettings());
    if(kind==='old-priest') {
      delete record.profile.priestDefeated;
      const db=await new Promise<IDBDatabase>(resolve=>{const q=indexedDB.open('cursed-relic-hunter-3d-v1',1);q.onsuccess=()=>resolve(q.result);});
      await new Promise<void>(resolve=>{const tx=db.transaction('save','readwrite');tx.objectStore('save').put(record,'current');tx.oncomplete=()=>resolve();});db.close();
    }
  },kind);await page.reload();
}
async function saved(page:Page) {return page.evaluate(async()=> {const p='/src/persistence/save.ts',m=await import(p);return new m.SaveStore().load();});}
async function capture(page:Page) {await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);await page.clock.runFor(80);}

test('crossbow remains locked after the gatekeeper and all four weapon cards are visible',async({page})=> {
  await setup(page,'gate');await page.getByRole('button',{name:'출발 무기',exact:true}).click();
  await expect(page.locator('.weapon-card')).toHaveCount(4);
  await expect(page.getByRole('button',{name:'산탄 성물 선택'})).toBeEnabled();
  await expect(page.getByRole('button',{name:'관측자의 쇠뇌 선택'})).toBeDisabled();
  await expect(page.getByText('사슬의 사제 첫 처치 시 해금')).toBeVisible();
});
test('priest defeat unlocks the crossbow and next-run shooting uses a distinct saved weapon',async({page})=> {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await setup(page,'priest');
  await page.getByRole('button',{name:'탐험 이어하기'}).click();await capture(page);
  await page.mouse.down();await page.clock.runFor(600);await page.mouse.up();
  await expect(page.getByText('관측자의 쇠뇌가 영구 해금되었습니다.')).toBeVisible();
  await page.getByRole('button',{name:'야영지로',exact:true}).click();
  expect((await saved(page)).profile.priestDefeated).toBe(true);
  await page.getByRole('button',{name:'출발 무기',exact:true}).click();
  await page.getByRole('button',{name:'관측자의 쇠뇌 선택'}).click();await page.getByRole('button',{name:'선택 저장',exact:true}).click();
  await expect(page.getByRole('button',{name:'새 탐험 시작',exact:true})).toBeVisible();expect((await saved(page)).profile.selectedWeapon).toBe('W03');
  await page.reload();await page.getByRole('button',{name:'새 탐험 시작',exact:true}).click();await capture(page);
  await expect(page.locator('#weapon-name')).toHaveText('관측자의 쇠뇌');await expect(page.locator('#weapon-id')).toHaveText('W03 / OBSERVER CROSSBOW');
  await page.screenshot({path:'test-results/fps-crossbow.png'});
  await page.mouse.down();await page.clock.runFor(800);await page.mouse.up();await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'저장하고 야영지로'}).click();const s=(await saved(page)).run;
  expect(s.weapon).toBe('W03');expect(s.stats.shots).toBe(2);
  const bolts=s.bullets.filter((b:any)=>b.owner==='player');expect(bolts.length).toBeGreaterThan(0);
  expect(bolts[0].damage).toBe(14);expect(Math.hypot(bolts[0].vx,bolts[0].vy,bolts[0].heightVelocity??0)).toBeCloseTo(440);
  await page.reload();await page.getByRole('button',{name:'탐험 이어하기'}).click();await capture(page);
  await expect(page.locator('#weapon-name')).toHaveText('관측자의 쇠뇌');expect(errors).toEqual([]);
});
test('previous-version priest victories grant the crossbow and five points without replaying the boss',async({page})=> {
  await setup(page,'old-priest');await page.getByRole('button',{name:'영구 성장',exact:true}).click();
  await expect(page.locator('#growth-budget')).toContainText('10 P');await expect(page.getByText('사슬을 끊는 자')).toBeVisible();
  await page.getByRole('button',{name:'야영지로 돌아가기',exact:true}).click();await page.getByRole('button',{name:'출발 무기',exact:true}).click();
  await expect(page.getByRole('button',{name:'관측자의 쇠뇌 선택'})).toBeEnabled();await page.getByRole('button',{name:'관측자의 쇠뇌 선택'}).click();
  await page.getByRole('button',{name:'선택 저장',exact:true}).click();expect((await saved(page)).profile.selectedWeapon).toBe('W03');
  expect((await saved(page)).profile.priestDefeated).toBe(true);
});
test('changing the departure weapon after reload preserves the saved expedition and its crossbow',async({page})=> {
  await setup(page,'old-priest');await page.getByRole('button',{name:'출발 무기',exact:true}).click();
  await page.getByRole('button',{name:'관측자의 쇠뇌 선택'}).click();await page.getByRole('button',{name:'선택 저장',exact:true}).click();
  await expect(page.getByRole('button',{name:'새 탐험 시작',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'새 탐험 시작',exact:true}).click();await capture(page);
  await page.keyboard.down('w');await page.clock.runFor(300);await page.keyboard.up('w');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'저장하고 야영지로'}).click();await expect(page.getByRole('button',{name:'탐험 이어하기'})).toBeVisible();
  const checkpoint=(await saved(page)).run;await page.reload();
  await page.getByRole('button',{name:'출발 무기',exact:true}).click();await page.getByRole('button',{name:'유물 사수기 선택'}).click();
  await page.getByRole('button',{name:'선택 저장',exact:true}).click();await expect(page.getByRole('button',{name:'새 탐험 시작',exact:true})).toBeVisible();
  const record=await saved(page);expect(record.profile.selectedWeapon).toBe('W01');expect(record.run).toEqual(checkpoint);
  await page.getByRole('button',{name:'탐험 이어하기'}).click();await capture(page);await expect(page.locator('#weapon-name')).toHaveText('관측자의 쇠뇌');
  await page.keyboard.press('Escape');await page.getByRole('button',{name:'저장하고 야영지로'}).click();
  await expect(page.getByRole('button',{name:'새 탐험 시작',exact:true})).toBeVisible();await page.getByRole('button',{name:'새 탐험 시작',exact:true}).click();
  await capture(page);await expect(page.locator('#weapon-name')).toHaveText('유물 사수기');
});
