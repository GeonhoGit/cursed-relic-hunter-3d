import {expect,test,type Page} from '@playwright/test';
test.beforeEach(async({page})=>{await page.addInitScript(()=>{HTMLCanvasElement.prototype.requestPointerLock=()=>{throw new Error('Mouse capture forbidden');};});await page.clock.install({time:new Date('2026-10-09T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-09T00:00:00.032Z'));});
const disk=(page:Page)=>page.evaluate(async()=>{const{SaveStore}=await import('/src/persistence/save.ts' as string);return new SaveStore().load();});
async function seed(page:Page){await page.goto('/');await page.evaluate(async()=>{const{createDungeonRun}=await import('/src/core/simulation.ts' as string),{SaveStore,defaultSettings}=await import('/src/persistence/save.ts' as string),store=new SaveStore();await store.load();const s=createDungeonRun(42,3);s.player.hp=80;await store.save(s,{...defaultSettings(),graphicsQuality:'low'});});await page.reload();}
test('a temporarily failed startup read reloads the existing run without issuing a null write',async({page})=>{
 await seed(page);const before=await disk(page);
 await page.route('**/src/persistence/save.ts*',async route=>{const response=await route.fetch(),body=await response.text();await route.fulfill({response,body:body+'\nwindow.__reportReadFails??=1;const originalRead=SaveStore.prototype.load;SaveStore.prototype.load=async function(...args){if(window.__reportReadFails-->0)throw new Error("Temporary read unavailable");return originalRead.apply(this,args);};'});});
 await page.reload();await expect(page.locator('#overlay')).toHaveAttribute('data-mode','storage-error');await page.locator('[data-action="retry-save"]').click();await expect(page.locator('#overlay')).toHaveAttribute('data-mode','home');
 const after=await disk(page);expect(after.run?.player.hp).toBe(80);expect(after.revision).toBe(before.revision);expect(after.run).toEqual(before.run);await expect(page.getByRole('button',{name:'탐험 이어하기'})).toBeVisible();
});
test('a stale tab conflict reloads the latest run without overwriting its revision or health',async({page})=>{
 await seed(page);await page.getByRole('button',{name:'탐험 이어하기'}).click();await page.clock.runFor(100);
 await page.evaluate(async()=>{const{SaveStore}=await import('/src/persistence/save.ts' as string),writer=new SaveStore(),r=await writer.load();r.run.player.hp=61;await writer.save(r.run,r.settings);});const latest=await disk(page);
 await page.locator('#pause-button').click();await expect(page.locator('#overlay')).toHaveAttribute('data-mode','storage-error');await page.locator('[data-action="retry-save"]').click();
 await expect(page.locator('#overlay')).toHaveAttribute('data-mode','home');const after=await disk(page);expect(after.run?.player.hp).toBe(61);expect(after.revision).toBe(latest.revision);expect(after.run).toEqual(latest.run);
});
