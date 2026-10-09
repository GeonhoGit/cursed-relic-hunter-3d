import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{HTMLCanvasElement.prototype.requestPointerLock=()=>{throw new Error('Mouse capture forbidden');};});
 await page.clock.install({time:new Date('2026-10-08T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-08T00:00:00.032Z'));
});
const saved=(page:Page)=>page.evaluate(async()=>{const {SaveStore}=await import('/src/persistence/save.ts' as string);return new SaveStore().load();});

test('camp codex previews 57 relics, searches without losing focus, and filters actual locks',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.getByRole('button',{name:'유물 도감',exact:true}).click();
 await expect(page.locator('.codex-entry')).toHaveCount(57);await expect(page.locator('.codex-progress')).toContainText('발견 0 / 57');
 const input=page.getByRole('searchbox',{name:'이름·ID·효과 검색'});await input.fill('R47');await expect(input).toBeFocused();await expect(page.locator('.codex-entry')).toHaveCount(1);
 await page.locator('.codex-entry summary').click();await expect(page.locator('[data-relic-id="R47"]')).toContainText('피의 지갑도 저주 이력으로 계산');await expect(page.locator('[data-relic-id="R47"]')).toContainText('미발견');
 await input.fill('');await page.getByLabel('기록 필터',{exact:true}).selectOption('locked');await expect(page.locator('.codex-entry')).toHaveCount(18);
 await page.getByLabel('등급 필터',{exact:true}).selectOption('legendary');await expect(page.locator('.codex-entry')).toHaveCount(2);
 await input.fill('없는유물');await expect(page.locator('#codex-results')).toContainText('검색 결과가 없습니다');await page.keyboard.press('Escape');
 await expect(page.locator('#overlay')).toHaveAttribute('data-mode','home');expect((await saved(page))).toBeNull();expect(errors).toEqual([]);expect(await page.evaluate(()=>!!document.pointerLockElement)).toBe(false);
});

async function seedAcquired(page:Page){
 await page.goto('/');await page.evaluate(async()=>{
  const {createDungeonRun}=await import('/src/core/simulation.ts' as string),{beginGrowthRun,emptyInvestment}=await import('/src/core/growth.ts' as string);
  const {chooseRelic}=await import('/src/core/expedition.ts' as string),{SaveStore,defaultSettings}=await import('/src/persistence/save.ts' as string);
  const s=createDungeonRun(42,2);beginGrowthRun(s,emptyInvestment(),'codex-acquired');s.expedition.room=6;s.phase='cleared';const room=s.expedition.dungeon.rooms[6];room.visited=room.cleared=true;room.reward={room:6,candidates:['R01'],choice:null};chooseRelic(s,'R01');
  s.view={yaw:-Math.PI/2,pitch:0};const store=new SaveStore();await store.load();await store.save(s,{...defaultSettings(),graphicsQuality:'low'});
 });await page.reload();await page.getByRole('button',{name:'탐험 이어하기'}).click();
}
test('inventory and pause return to their original screen while codex browsing keeps the run unchanged',async({page})=>{
 await seedAcquired(page);await page.keyboard.press('i');await page.getByRole('button',{name:'유물 도감',exact:true}).click();
 await expect(page.locator('.codex-progress')).toContainText('발견 1 / 57');await page.getByLabel('기록 필터',{exact:true}).selectOption('discovered');await expect(page.locator('.codex-entry')).toHaveCount(1);
 await page.locator('.codex-entry summary').click();await expect(page.locator('[data-relic-id="R01"]')).toContainText('이번 탐험 보유');const before=await saved(page);
 await page.clock.fastForward(10000);await page.keyboard.press('Escape');await expect(page.locator('#overlay')).toHaveAttribute('data-mode','inventory');expect(await saved(page)).toEqual(before);
 await page.locator('[data-action="close"]').click();await page.keyboard.press('Escape');await expect(page.locator('#overlay')).toHaveAttribute('data-mode','pause');await page.getByRole('button',{name:'유물 도감',exact:true}).click();
 await page.getByRole('button',{name:'도감 닫기',exact:true}).click();await expect(page.locator('#overlay')).toHaveAttribute('data-mode','pause');
 await page.getByRole('button',{name:'보유 유물',exact:true}).click();await page.getByRole('button',{name:'유물 도감',exact:true}).click();await page.getByRole('button',{name:'도감 닫기',exact:true}).click();
 await expect(page.locator('#overlay')).toHaveAttribute('data-mode','inventory');await page.locator('[data-action="close"]').click();await expect(page.locator('#overlay')).toHaveAttribute('data-mode','pause');
 await page.reload();await page.getByRole('button',{name:'유물 도감',exact:true}).click();await expect(page.locator('.codex-progress')).toContainText('발견 1 / 57');
});

test('IME Escape cancels composition without dismissing the codex, then ordinary Escape closes it',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'유물 도감',exact:true}).click();const search=page.getByRole('searchbox');await search.focus();
 await search.evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',isComposing:true,bubbles:true,cancelable:true})));
 await expect(page.locator('#overlay')).toHaveAttribute('data-mode','codex');await expect(search).toBeFocused();
 await search.evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',keyCode:229,bubbles:true,cancelable:true})));
 await expect(page.locator('#overlay')).toHaveAttribute('data-mode','codex');await page.keyboard.press('Escape');await expect(page.locator('#overlay')).toHaveAttribute('data-mode','home');
});

test('a small codex supports keyboard detail reading, long locked descriptions and closing',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width:640,height:480});await page.goto('/');await page.getByRole('button',{name:'유물 도감',exact:true}).click();
 await page.getByRole('searchbox').fill('R47');await page.keyboard.press('Tab');await expect(page.getByLabel('기록 필터',{exact:true})).toBeFocused();
 await page.keyboard.press('Tab');await expect(page.getByLabel('등급 필터',{exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(page.locator('[data-relic-id="R47"] summary')).toBeFocused();await page.keyboard.press('Enter');
 await expect(page.locator('[data-relic-id="R47"]')).toHaveAttribute('open','');await page.locator('.codex-detail').scrollIntoViewIfNeeded();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('#panel').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await page.screenshot({path:'graphics-review/codex/small-details.png'});await page.getByRole('button',{name:'도감 닫기',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'도감 닫기',exact:true})).toBeInViewport({ratio:1});expect(errors).toEqual([]);
});
