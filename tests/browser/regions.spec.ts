import { expect, test, type Page } from '@playwright/test';

async function seed(page:Page, kind:'gate-win'|'priest'|'combat'='gate-win') {
  await page.goto('/'); await page.clock.install({time:new Date('2026-10-04T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-10-04T00:00:01Z'));
  await page.evaluate(async kind=> {
    const simPath='/src/core/simulation.ts',savePath='/src/persistence/save.ts',bossPath='/src/core/boss.ts',regionPath='/src/core/region.ts';
    const growthPath='/src/core/growth.ts',growth=await import(growthPath);
    const sim=await import(simPath), saves=await import(savePath), boss=await import(bossPath), region=await import(regionPath);
    const s=sim.createDungeonRun(42); s.expedition.room=8;
    growth.beginGrowthRun(s,growth.emptyInvestment(),'browser-regions-run');
    s.expedition.dungeon.rooms[8].visited=s.expedition.dungeon.rooms[8].cleared=true;
    s.boss=boss.createBoss(s); s.boss.hp=0; s.phase='cleared'; s.player.hp=61; s.gold=73;
    s.expedition.relics=['R44']; s.expedition.acquired=['R44'];
    const t=s.expedition.dungeon.rooms[6]; t.visited=t.cleared=true; t.reward={room:6,candidates:['R44'],choice:'R44'};
    if(kind!=='gate-win') {
      region.enterNextRegion(s); s.expedition.room=kind==='priest'?8:1;
      s.expedition.dungeon.rooms[s.expedition.room].visited=true;
      s.phase='combat'; s.player.y=280; s.view={yaw:-Math.PI/2,pitch:0};
      if(kind==='priest') { s.boss=boss.createBoss(s); s.boss.hp=7; s.boss.stage=2; s.boss.mode='recover';s.boss.timer=72; }
      else { s.trapTicks=0; s.enemies=[{id:s.nextId++,kind:'ashpriest',x:320,y:180,hp:65,maxHp:65,angle:Math.PI/2,mode:'move',timer:0,targetX:320,targetY:280,flash:0}]; }
    }
    const store=new saves.SaveStore(); await store.load(); await store.save(s,saves.defaultSettings());
  },kind);
  await page.reload(); await page.getByRole('button',{name:'탐험 이어하기'}).click();
}
async function saved(page:Page) {
  return page.evaluate(async()=> {
    const p='/src/persistence/save.ts',m=await import(p); return new m.SaveStore().load();
  });
}
async function capture(page:Page) {
  await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true); await page.clock.runFor(80);
}
test('first boss result resumes after reload and travels to a saved second maze without healing',async({page})=> {
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  await seed(page); await expect(page.getByRole('heading',{name:'봉인이 풀렸습니다.'})).toBeVisible();
  await page.getByRole('button',{name:'두 번째 지역으로'}).click();
  await expect(page.getByText('남겨 둔 기회 · 보물방 1곳 · 제단 1곳 · 상점 1곳')).toBeVisible();
  await page.getByRole('button',{name:'돌아가기',exact:true}).click();
  await page.getByRole('button',{name:'야영지로',exact:true}).click(); await page.reload();
  await page.getByRole('button',{name:'탐험 이어하기'}).click();
  await page.getByRole('button',{name:'두 번째 지역으로'}).click();
  await page.getByRole('button',{name:'회랑으로 이동'}).click(); await capture(page);
  await expect(page.locator('#region-name')).toContainText('저주받은 회랑');
  await page.screenshot({path:'test-results/fps-region-2.png'});
  const record=await saved(page); expect(record.run.expedition.region).toBe(2); expect(record.run.player.hp).toBe(61);
  expect(record.run.gold).toBe(73); expect(record.run.expedition.relics).toEqual(['R44']); expect(record.profile.bossDefeated).toBe(true);
  await page.keyboard.press('Escape'); await page.getByRole('button',{name:'저장하고 야영지로'}).click();
  await page.reload(); await page.getByRole('button',{name:'탐험 이어하기'}).click(); await capture(page);
  await page.keyboard.press('Tab'); await expect(page.getByRole('heading',{name:'저주받은 회랑의 길'})).toBeVisible();
  await page.keyboard.press('Tab'); await capture(page);
  // Seed 42's second start has a northern doorway: walk through the real FPS controls.
  await page.keyboard.down('w'); await page.clock.runFor(1800); await page.keyboard.up('w');
  await page.keyboard.press('Escape');
  const combat=(await saved(page)).run; expect(combat.expedition.room).not.toBe(0);
  expect(combat.enemies.length).toBeGreaterThanOrEqual(7); expect(combat.enemies.some((e:any)=>e.kind==='ashpriest')).toBe(true);
  expect(errors).toEqual([]);
});
test('failed second-region save retains the first victory on disk and can retry the carried run',async({page})=> {
  await seed(page);
  await page.evaluate(()=> {
    const transaction=IDBDatabase.prototype.transaction; let writes=0;
    IDBDatabase.prototype.transaction=function(...args:any[]) {
      if(args[1]==='readwrite' && ++writes===2) throw new Error('region-save-test');
      return transaction.apply(this,args as any);
    };
  });
  await page.getByRole('button',{name:'두 번째 지역으로'}).click(); await page.getByRole('button',{name:'회랑으로 이동'}).click();
  await expect(page.getByText('region-save-test')).toBeVisible(); expect((await saved(page)).run.expedition.region).toBe(1);
  await page.getByRole('button',{name:'저장 다시 시도'}).click();
  await expect(page.getByRole('button',{name:'전투 재개'})).toBeVisible();
  expect((await saved(page)).run.expedition.region).toBe(2); expect((await saved(page)).run.player.hp).toBe(61);
});
test('cursed room renders ash priest and spike telegraphs without runtime errors',async({page})=> {
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message)); await seed(page,'combat'); await capture(page);
  await page.clock.runFor(500); await page.screenshot({path:'test-results/fps-cursed-combat.png'});
  await page.keyboard.press('Escape'); const s=(await saved(page)).run;
  expect(s.enemies[0].kind).toBe('ashpriest'); expect(s.trapTicks).toBeGreaterThan(0); expect(errors).toEqual([]);
});
test('shooting the chain priest unlocks a saved third maze and its map',async({page})=> {
  const errors:string[]=[]; page.on('pageerror',e=>errors.push(e.message)); await seed(page,'priest'); await capture(page);
  await expect(page.locator('#boss-name')).toHaveText('사슬의 사제');
  await page.screenshot({path:'test-results/fps-chain-priest.png'});
  await page.mouse.down(); await page.clock.runFor(600); await page.mouse.up();
  await expect(page.getByText('사슬의 사제를 쓰러뜨렸습니다.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'세 번째 지역으로'})).toBeVisible();
  const s=(await saved(page)).run; expect(s.boss.hp).toBe(0); expect(s.phase).toBe('cleared'); expect(s.enemies).toEqual([]);
  await page.getByRole('button',{name:'야영지로',exact:true}).click(); await page.reload();
  await page.getByRole('button',{name:'탐험 이어하기'}).click();
  await page.getByRole('button',{name:'세 번째 지역으로'}).click();
  await page.getByRole('button',{name:'심장부로 이동'}).click();await capture(page);
  await expect(page.locator('#region-name')).toContainText('유물의 심장');
  const third=(await saved(page)).run;expect(third.expedition.region).toBe(3);expect(third.expedition.earlierDungeon.rooms[8].cleared).toBe(true);
  expect(third.expedition.previousDungeon.rooms[8].cleared).toBe(true);expect(third.expedition.relics).toEqual(['R44']);
  await page.screenshot({path:'test-results/fps-region-3.png'});
  await page.keyboard.press('Tab');await expect(page.getByRole('heading',{name:'심장부의 길'})).toBeVisible();
  expect(errors).toEqual([]);
});

async function seedHeart(page:Page,kind:'shield'|'fractional'|'final'|'watcher'|'wave'|'laser') {
  await page.goto('/');await page.clock.install({time:new Date('2026-10-04T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-04T00:00:01Z'));
  await page.evaluate(async kind=>{
    const sp='/src/core/simulation.ts',bp='/src/core/boss.ts',rp='/src/core/region.ts',gp='/src/core/growth.ts',vp='/src/persistence/save.ts',hp='/src/core/heart-boss.ts';
    const sim=await import(sp),boss=await import(bp),region=await import(rp),growth=await import(gp),saves=await import(vp),heart=await import(hp);
    const s=sim.createDungeonRun(42);growth.beginGrowthRun(s,growth.emptyInvestment(),'browser-heart-run');
    for(let i=0;i<2;i++){s.expedition.room=8;const r=s.expedition.dungeon.rooms[8];r.visited=r.cleared=true;s.boss=boss.createBoss(s);s.boss.hp=0;s.phase='cleared';region.enterNextRegion(s);}
    s.expedition.room=kind==='watcher'?1:8;s.expedition.dungeon.rooms[s.expedition.room].visited=true;s.phase='combat';s.player.y=280;s.view={yaw:-Math.PI/2,pitch:0};
    if(kind==='watcher'){s.trapTicks=40;s.enemies=[{id:s.nextId++,kind:'watcher',x:320,y:180,hp:90,maxHp:90,angle:Math.PI/2,mode:'windup',timer:40,targetX:320,targetY:280,flash:0}];}
    else {
      if(kind==='shield'||kind==='fractional'){s.player.x=224;s.player.y=190;}
      s.boss=boss.createBoss(s);
      if(kind==='shield'||kind==='fractional'){s.boss.hp=2340;boss.checkBossTransition(s);s.boss.mode='recover';s.boss.timer=60;s.boss.pillarHp=kind==='shield'?14:100;}
      if(kind==='fractional')s.growth.investment.attack=1;
      if(kind==='final'){s.boss.hp=7;s.boss.stage=3;s.boss.mode='recover';s.boss.timer=60;}
      if(kind==='wave'){boss.startBossPattern(s,'shockwave');s.boss.timer=1;boss.advanceBoss(s);s.boss.shockRadius=70;s.boss.timer=63;}
      if(kind==='laser')boss.startBossPattern(s,'laser');
    }
    const store=new saves.SaveStore();await store.load();await store.save(s,saves.defaultSettings());
  },kind);
  await page.reload();await page.getByRole('button',{name:'탐험 이어하기'}).click();await capture(page);
}
test('default shots break the connected pillar and a paused reload retains its relink countdown',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await seedHeart(page,'shield');
  await expect(page.locator('#boss-name')).toHaveText('유물 심장');await expect(page.locator('#boss-pattern')).toContainText('빛나는 기둥 1');
  await page.screenshot({path:'test-results/fps-heart-shield.png'});
  await page.mouse.down();await page.clock.runFor(800);await page.mouse.up();await page.keyboard.press('Escape');
  const s=(await saved(page)).run;expect(s.boss.pillarIndex).toBeUndefined();expect(s.boss.hp).toBe(2340);
  expect(s.boss.relinkTicks).toBeGreaterThan(400);await expect(page.locator('#overlay')).toHaveAttribute('data-mode','pause');
  await page.clock.fastForward(3000);expect((await saved(page)).run).toEqual(s);
  await page.reload();await page.getByRole('button',{name:'탐험 이어하기'}).click();await capture(page);await page.keyboard.press('Escape');
  const resumed=(await saved(page)).run;expect(resumed.boss.shieldLinks).toBe(1);expect(resumed.boss.pillarIndex).toBeUndefined();expect(errors).toEqual([]);
});
test('invested weapon damage saves fractional pillar health before the shield is broken',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await seedHeart(page,'fractional');
  await page.mouse.down();await page.clock.runFor(180);await page.mouse.up();await page.clock.runFor(100);await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'전투 재개'})).toBeVisible();
  const s=(await saved(page)).run;expect(s.boss.pillarHp).toBeCloseTo(92.965);expect(s.boss.pillarIndex).toBe(0);
  await page.reload();await page.getByRole('button',{name:'탐험 이어하기'}).click();await capture(page);await page.keyboard.press('Escape');
  expect((await saved(page)).run.boss.pillarHp).toBeCloseTo(92.965);expect(errors).toEqual([]);
});
test('third-region watcher and danger lines render without runtime errors',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await seedHeart(page,'watcher');
  await page.clock.runFor(800);await page.screenshot({path:'test-results/fps-heart-watcher.png'});await page.keyboard.press('Escape');
  expect((await saved(page)).run.bullets.some((b:any)=>b.source==='watcher')).toBe(true);
  expect(errors).toEqual([]);
});
test('heart laser has a visible fixed warning',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await seedHeart(page,'laser');
  await expect(page.locator('#boss-pattern')).toContainText('반사/정지 불가');await page.screenshot({path:'test-results/fps-heart-laser.png'});expect(errors).toEqual([]);
});
test('heart shockwave appears as an expanding floor ring',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await seedHeart(page,'wave');
  await expect(page.locator('#boss-pattern')).toContainText('점프로');await page.screenshot({path:'test-results/fps-heart-wave.png'});expect(errors).toEqual([]);
});
test('final heart kill ends all three regions and persists the one-time growth goal',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await seedHeart(page,'final');
  await page.mouse.down();await page.clock.runFor(600);await page.mouse.up();
  await expect(page.getByRole('heading',{name:'유물 심장을 정복했습니다.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'세 번째 지역으로'})).toHaveCount(0);
  const record=await saved(page);expect(record.run.phase).toBe('cleared');expect(record.run.boss.hp).toBe(0);expect(record.profile.heartDefeated).toBe(true);
  await page.screenshot({path:'test-results/fps-heart-victory.png'});await page.getByRole('button',{name:'야영지로',exact:true}).click();await page.reload();
  await expect(page.getByRole('button',{name:'탐험 이어하기'})).toHaveCount(0);expect((await saved(page)).profile.heartDefeated).toBe(true);expect(errors).toEqual([]);
});
