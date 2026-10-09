import { expect, test } from '@playwright/test';
test('boss floor gold remains collectible before the next region',async({page})=>{
 await page.addInitScript(()=>{HTMLCanvasElement.prototype.requestPointerLock=()=>{throw new Error('Mouse capture forbidden');};});
 await page.clock.install({time:new Date('2026-10-08T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-08T00:00:00.032Z'));await page.goto('/');
 await page.evaluate(async()=>{
  const {createDungeonRun,step,emptyInput}=await import('/src/core/simulation.ts' as string),{createBoss}=await import('/src/core/boss.ts' as string);
  const {beginGrowthRun,emptyInvestment}=await import('/src/core/growth.ts' as string),{SaveStore,defaultSettings}=await import('/src/persistence/save.ts' as string);
  const s=createDungeonRun(42,2);beginGrowthRun(s,emptyInvestment(),'boss-floor-browser');s.expedition.room=8;s.expedition.dungeon.rooms[8].visited=true;s.phase='combat';s.boss=createBoss(s);s.boss.hp=0;step(s,emptyInput());s.view={yaw:-Math.PI/2,pitch:0};
  const store=new SaveStore();await store.load();await store.save(s,defaultSettings());
 });await page.reload();await page.getByRole('button',{name:'탐험 이어하기'}).click();await expect(page.locator('#panel')).toContainText('바닥 보상 1개');
 await page.locator('[data-action="loot-boss"]').click();await expect(page.locator('#overlay')).toBeHidden();await page.keyboard.down('s');
 await expect.poll(async()=>{await page.clock.runFor(50);return page.locator('#gold').textContent();},{intervals:[20]}).toBe('40');await page.keyboard.up('s');
 await page.keyboard.press('e');await expect(page.locator('#panel')).toContainText('바닥 보상 0개');await page.locator('[data-action="next-region"]').click();await page.locator('[data-action="enter-region"]').click();
 await expect.poll(async()=>page.evaluate(async()=>{const {SaveStore}=await import('/src/persistence/save.ts' as string);return (await new SaveStore().load()).run.expedition.region;})).toBe(2);
 await expect(page.locator('#gold')).toHaveText('40');expect(await page.evaluate(()=>!!document.pointerLockElement)).toBe(false);
});
