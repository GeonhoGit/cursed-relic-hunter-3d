import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{HTMLCanvasElement.prototype.requestPointerLock=()=>{throw new Error('Mouse capture forbidden');};});
 await page.clock.install({time:new Date('2026-10-08T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-08T00:00:00.032Z'));
});
const saved=(page:Page)=>page.evaluate(async()=>{const {SaveStore}=await import('/src/persistence/save.ts' as string);return new SaveStore().load();});
async function seed(page:Page,scenario:'recovery'|'portal'|'absorb'|'key'|'crown'|'replay'){
 await page.goto('/');await page.evaluate(async scenario=>{
  const {createDungeonRun,step,emptyInput,travel}=await import('/src/core/simulation.ts' as string);
  const {beginGrowthRun,emptyInvestment,growthRelicUnlocks}=await import('/src/core/growth.ts' as string);
  const {chooseRelic}=await import('/src/core/expedition.ts' as string);
  const {refreshShop,buyFromShop}=await import('/src/core/shop.ts' as string);
  const {createBoss}=await import('/src/core/boss.ts' as string);
  const {enterNextRegion}=await import('/src/core/region.ts' as string);
  const {useAuxiliary}=await import('/src/core/auxiliary.ts' as string);
  const {adjacentRooms}=await import('/src/core/dungeon.ts' as string);
  const {createFloorReward}=await import('/src/core/terrain.ts' as string);
  const {SaveStore,defaultSettings}=await import('/src/persistence/save.ts' as string);
  const store=new SaveStore();await store.load();
  if(scenario==='key')for(let i=0;i<5;i++){
   const prior=createDungeonRun(i+1,2);beginGrowthRun(prior,emptyInvestment(),`purchase-${i}`);prior.expedition.room=10;const shop=prior.expedition.dungeon.rooms[10];shop.visited=shop.cleared=true;prior.gold=24;refreshShop(prior);shop.shop.slots[0].relic='R01';buyFromShop(prior,0,shop.shop.revision);await store.save(prior,defaultSettings());
  }
  if(scenario==='crown'||scenario==='replay'){
   const prior=createDungeonRun(42,2);beginGrowthRun(prior,emptyInvestment(),'pure-victory');
   for(let region=1;region<=3;region++){
    prior.expedition.room=8;const node=prior.expedition.dungeon.rooms[8];node.visited=node.cleared=true;prior.phase='cleared';prior.boss=createBoss(prior);prior.boss.hp=0;await store.save(prior,defaultSettings());if(region<3)enterNextRegion(prior);
   }
  }
  const profile=(await store.load())?.profile;
  const s=createDungeonRun(42,2);beginGrowthRun(s,emptyInvestment(),`remaining-${scenario}`,false,profile?growthRelicUnlocks(profile):[]);
  const grant=(id:string,roomId:number)=>{const node=s.expedition.dungeon.rooms[roomId];s.expedition.room=roomId;node.visited=node.cleared=true;s.phase='cleared';node.reward={room:roomId,candidates:roomId===9?[id,'R43']:[id],choice:null};if(!chooseRelic(s,id))throw new Error(`Grant failed ${id}`);};
  if(scenario==='recovery'){
   grant('R39',9);s.expedition.room=3;const node=s.expedition.dungeon.rooms[3];node.visited=node.cleared=true;s.phase='explore';createFloorReward(s);s.player.x=355;s.player.y=183;s.player.hp=70;
  }else if(scenario==='portal'){
   grant('R40',9);s.expedition.room=10;const node=s.expedition.dungeon.rooms[10];node.visited=node.cleared=true;s.phase='explore';s.gold=30;refreshShop(s);node.shop.slots[3].relic='R41';buyFromShop(s,3,node.shop.revision);s.expedition.room=0;
  }else if(scenario==='absorb'){
   grant('R13',6);grant('R42',9);s.expedition.room=0;s.phase='explore';s.player.equippedAux='R13';useAuxiliary(s,{x:350,y:183});for(let i=0;i<60;i++)step(s,emptyInput());s.player.equippedAux='R42';
   s.bullets=Array.from({length:5},(_,i)=>({id:s.nextId++,x:355+i,y:183,vx:-120,vy:0,life:90,owner:'enemy',damage:1,height:22,heightVelocity:0}));
  }else if(scenario==='key'){
   grant('R35',6);const rooms=s.expedition.dungeon.rooms,locked=rooms[11],parent=rooms.find((r:any)=>Math.abs(r.x-locked.x)+Math.abs(r.y-locked.y)===1);parent.visited=parent.cleared=true;s.expedition.room=parent.id;s.phase='explore';
   const {BOUNDS}=await import('/src/core/model.ts' as string);s.player.x=320+(locked.x-parent.x)*(BOUNDS.w/2-20);s.player.y=183+(locked.y-parent.y)*(BOUNDS.h/2-20);
  }else if(scenario==='crown'){
   s.expedition.room=9;const node=s.expedition.dungeon.rooms[9];node.visited=node.cleared=true;s.phase='cleared';node.reward={room:9,candidates:['R47','R43'],choice:null,revision:1,slots:2};
  }else{
   grant('R48',9);s.expedition.room=0;s.phase='explore';const door=adjacentRooms(s).find((d:any)=>d.room.kind==='combat');travel(s,door.direction);s.phase='combat';s.enemies.forEach((e:any)=>e.hp=0);step(s,emptyInput());
   if(s.phase==='cleared')chooseRelic(s,'skip');travel(s,adjacentRooms(s).find((d:any)=>d.room.id===0).direction);travel(s,door.direction);
  }
  s.view={yaw:-Math.PI/2,pitch:0};await store.save(s,defaultSettings());
 },scenario);await page.reload();await page.getByRole('button',{name:'탐험 이어하기'}).click();
}

test('new departures expose twelve rooms and all twelve growth goals',async({page})=>{
 await page.goto('/');await expect(page.locator('#panel')).toContainText('유물 57종');await page.getByRole('button',{name:'영구 성장',exact:true}).click();
 await expect(page.locator('[data-goal]')).toHaveCount(12);await expect(page.locator('#growth-budget')).toContainText('60P');await page.locator('[data-action="close"]').click();
 await page.locator('[data-action="new"]').click();await expect.poll(async()=> (await saved(page)).run.expedition.dungeon.rooms.length).toBe(12);expect(await page.evaluate(()=>!!document.pointerLockElement)).toBe(false);
});
test('floor healing is stored, F casts survive reload, and the small inventory remains usable',async({page})=>{
 await seed(page,'recovery');await expect.poll(async()=>{await page.clock.runFor(50);return page.locator('#recovery-status').textContent();}).toContain('1/3');expect((await saved(page)).run.player.hp).toBe(70);
 await page.keyboard.press('f');await expect.poll(async()=>{await page.clock.runFor(25);return page.locator('#recovery-status').textContent();},{intervals:[20]}).toContain('사용 중');await page.keyboard.press('Escape');
 await expect.poll(async()=>!!(await saved(page)).run.recoveryCast).toBe(true);await page.reload();await page.getByRole('button',{name:'탐험 이어하기'}).click();
 await expect.poll(async()=>{await page.clock.runFor(50);return (await saved(page)).run.player.hp;},{intervals:[20]}).toBe(80);await page.setViewportSize({width:640,height:480});await page.keyboard.press('i');
 await expect(page.locator('#panel')).toContainText('휴대 회복품 0/3');await page.locator('[data-action="close"]').scrollIntoViewIfNeeded();await expect(page.locator('[data-action="close"]')).toBeInViewport({ratio:1});
 await page.screenshot({path:'graphics-review/remaining/recovery-inventory.png'});expect(await page.evaluate(()=>!!document.pointerLockElement)).toBe(false);
});
test('right click builds real portal pairs and Esc only cancels the unfinished first door',async({page})=>{
 await seed(page,'portal');await page.locator('canvas').first().click({button:'right'});await page.clock.runFor(50);await expect(page.locator('#portal-status')).toContainText('출구 설치 필요');
 await page.keyboard.press('Escape');await expect(page.locator('#overlay')).toBeHidden();await expect.poll(async()=>(await saved(page)).run.portals).toBeUndefined();
 await page.locator('canvas').first().click({button:'right'});await page.clock.runFor(50);await page.mouse.move(10,450);await page.mouse.move(724,450);await page.clock.runFor(50);await expect(page.locator('#compass')).toContainText('동쪽');
 await page.locator('canvas').first().click({button:'right'});await expect.poll(async()=>{await page.clock.runFor(25);return page.locator('#portal-status').textContent();},{intervals:[20]}).toContain('한 쌍 유지');await page.keyboard.press('Escape');
 await expect(page.locator('#overlay')).toBeVisible();await expect.poll(async()=>!!(await saved(page)).run.portals?.second).toBe(true);const before=(await saved(page)).run.portals.ticks;await page.clock.fastForward(2000);expect((await saved(page)).run.portals.ticks).toBe(before);
 await page.reload();await page.getByRole('button',{name:'탐험 이어하기'}).click();await expect.poll(async()=>{await page.clock.runFor(25);return page.locator('#portal-status').textContent();},{intervals:[20]}).toContain('한 쌍 유지');await page.screenshot({path:'graphics-review/remaining/portal.png'});
});
test('absorption earns real energy and the safe skill panel spends it once',async({page})=>{
 await seed(page,'absorb');await page.locator('canvas').first().click({button:'right'});await page.clock.runFor(120);await page.keyboard.press('i');
 await expect(page.locator('#panel')).toContainText('에너지 5/5');await expect(page.locator('[data-action="energy-R13"]')).toBeEnabled();
 await page.locator('[data-action="energy-R13"]').click();await expect(page.locator('#panel')).toContainText('에너지 4/5');await expect.poll(async()=>(await saved(page)).run.player.cooldownCredits.R13).toBe(30);
 await page.screenshot({path:'graphics-review/remaining/absorb-panel.png'});
});
test('E opens a nearby lock atomically and the map records permanent access',async({page})=>{
 await seed(page,'key');await page.clock.runFor(50);await expect(page.locator('#interact')).toContainText('열쇠로 개방');await page.keyboard.press('e');
 await expect.poll(async()=>(await saved(page)).run.expedition.dungeon.rooms[11].keyOpened).toBe(true);const r=await saved(page);expect(r.run.expedition.relics).not.toContain('R35');expect(r.run.expedition.acquired).toContain('R35');expect(r.profile.lockedRooms).toHaveLength(1);
 await page.keyboard.press('Tab');await expect(page.locator('.dungeon-map [data-room-id="11"]')).toHaveAttribute('data-locked','false');await page.screenshot({path:'graphics-review/remaining/unlocked-map.png'});
});
test('crown confirmation, first selection, reload and second selection preserve the permanent price',async({page})=>{
 await seed(page,'crown');await page.locator('[data-action="choose-R47"]').click();await expect(page.locator('#panel')).toContainText('예약 유물');await expect(page.locator('#panel')).toContainText('지금 영구 포기');
 await page.locator('[data-action="crown-confirm"]').click();await expect(page.locator('#overlay')).toBeHidden();await expect.poll(async()=>(await saved(page)).run.crown?.state).toBe('reserved');
 await page.evaluate(async()=>{
  const {SaveStore}=await import('/src/persistence/save.ts' as string),store=new SaveStore(),r=await store.load(),s=r.run;
  const {prepareReward}=await import('/src/core/expedition.ts' as string);s.expedition.room=s.crown.a.room;const node=s.expedition.dungeon.rooms[s.expedition.room];node.visited=node.cleared=true;s.phase='cleared';prepareReward(s);await store.save(s,r.settings);
 });await page.reload();await page.getByRole('button',{name:'탐험 이어하기'}).click();await expect(page.locator('#modal-title')).toContainText('2개 더');
 const first=page.locator('[data-action^="choose-R"]').first();const id=(await first.getAttribute('data-action'))!.slice(7);await first.click();await expect(page.locator('#modal-title')).toContainText('1개 더');
 await page.reload();await page.getByRole('button',{name:'탐험 이어하기'}).click();await expect(page.locator(`[data-action="choose-${id}"]`)).toBeDisabled();await page.screenshot({path:'graphics-review/remaining/crown-partial.png'});
 await page.locator('[data-action^="choose-R"]:not([disabled])').first().click();await expect(page.locator('#overlay')).toBeHidden();await expect.poll(async()=>(await saved(page)).run.crown.state).toBe('complete');expect((await saved(page)).run.crown.selectedIds).toHaveLength(2);
});
test('inverted map exposes every room and starts a reload-safe two-enemy replay',async({page})=>{
 await seed(page,'replay');await page.keyboard.press('Tab');await expect(page.locator('.dungeon-map [data-room-id]')).toHaveCount(12);await expect(page.locator('#panel')).toContainText('모든 방 공개');
 await page.keyboard.press('Tab');await page.clock.runFor(900);await expect(page.locator('#objective')).toContainText('추가 보상 없음');await page.keyboard.press('Escape');await expect(page.locator('#overlay')).toBeVisible();await page.clock.fastForward(50);
 await expect.poll(async()=>!!(await saved(page)).run.replay).toBe(true);expect((await saved(page)).run.enemies).toHaveLength(2);await page.screenshot({path:'graphics-review/remaining/replay.png'});
});
