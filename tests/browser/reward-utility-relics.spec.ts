import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); }; });
  await page.clock.install({ time: new Date('2026-10-07T00:00:00Z') }); await page.clock.pauseAt(new Date('2026-10-07T00:00:00.032Z'));
});
const saved = (page: Page) => page.evaluate(async () => { const { SaveStore } = await import('/src/persistence/save.ts' as string); return await new SaveStore().load(); });
async function unlockProfile(page: Page) {
  await page.goto('/'); await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string); const { createBoss } = await import('/src/core/boss.ts' as string);
    const { beginGrowthRun, emptyInvestment } = await import('/src/core/growth.ts' as string); const { grantRelic } = await import('/src/core/relic-acquisition.ts' as string);
    const { equipAuxiliary, useAuxiliary } = await import('/src/core/auxiliary.ts' as string); const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const store = new SaveStore(); await store.load(); const prior = createDungeonRun(42); beginGrowthRun(prior, emptyInvestment(), 'utility-boss');
    prior.expedition.room = 8; prior.expedition.dungeon.rooms[8].visited = prior.expedition.dungeon.rooms[8].cleared = true;
    prior.boss = createBoss(prior); prior.boss.hp = 0; prior.phase = 'cleared'; await store.save(prior, defaultSettings());
    const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'utility-casts', false, ['R16']);
    const a = s.expedition.dungeon.rooms[6]; a.visited = a.cleared = true; a.reward = { room: 6, candidates: ['R13'], choice: 'R13' }; grantRelic(s, 'R13');
    const b = s.expedition.dungeon.rooms[7]; b.visited = b.cleared = true; b.reward = { room: 7, candidates: ['R16'], choice: 'R16' }; grantRelic(s, 'R16');
    const c = s.expedition.dungeon.rooms[9]; c.visited = c.cleared = true; c.reward = { room: 9, candidates: ['R38', 'R43'], choice: 'R43' }; grantRelic(s, 'R43');
    s.player.x = 80; s.player.y = 183; useAuxiliary(s, { x: 200, y: 183 }); equipAuxiliary(s, 'R16'); useAuxiliary(s, { x: 160, y: 183 }); equipAuxiliary(s, 'R43'); useAuxiliary(s, { x: 200, y: 183 });
    await store.save(s, defaultSettings()); if (s.growth.relicUnlocks.includes('R33')) throw new Error('Current departure unlock changed');
    await store.save(null, defaultSettings());
  }); await page.reload();
}
async function pendingUtility(page: Page) {
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string); const { beginGrowthRun, growthRelicUnlocks } = await import('/src/core/growth.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string); const store = new SaveStore(); const r = await store.load();
    const s = createDungeonRun(42); beginGrowthRun(s, r.profile.investment, 'utility-pick', false, growthRelicUnlocks(r.profile));
    s.expedition.room = 6; const room = s.expedition.dungeon.rooms[6]; room.visited = room.cleared = true; room.reward = { room: 6, candidates: ['R33', 'R34', 'R49'], choice: null };
    s.phase = 'cleared'; s.player.x = 320; s.player.y = 217; s.view = { yaw: 0, pitch: 0 }; await store.save(s, defaultSettings());
  }); await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
}
test('G08 uses real casts, snapshots the next departure, and frame selection gives four reload-safe chest options in a small window', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await unlockProfile(page);
  await page.getByRole('button', { name: '영구 성장', exact: true }).click(); await expect(page.locator('[data-goal="G08"]')).toContainText('상인의 저울·빈 액자 해금');
  await expect(page.locator('[data-goal="G08"]')).toContainText('달성'); await page.locator('[data-action="close"]').click();
  await page.locator('[data-action="new"]').click(); await expect.poll(async () => (await saved(page)).run?.growth?.relicUnlocks).toEqual(expect.arrayContaining(['R33', 'R34']));
  await pendingUtility(page); await page.locator('[data-action="choose-R34"]').click(); await expect(page.locator('#overlay')).toBeHidden();
  await page.evaluate(async () => {
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string); const store = new SaveStore(); const r = await store.load(), s = r.run;
    s.expedition.room = 7; s.phase = 'explore'; const room = s.expedition.dungeon.rooms[7]; room.visited = room.cleared = true; s.player.x = 320; s.player.y = 217;
    await store.save(s, defaultSettings());
  });
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click(); await page.keyboard.press('e');
  await expect(page.locator('[data-action^="choose-R"]')).toHaveCount(4); await page.screenshot({ path: 'graphics-review/utility/four-choices.png' });
  await page.setViewportSize({ width: 640, height: 480 }); await page.locator('[data-action^="choose-R"]').last().scrollIntoViewIfNeeded();
  await expect(page.locator('[data-action^="choose-R"]').last()).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: '새로고침 · 무료 1회', exact: true }).click(); await expect(page.locator('[data-action^="choose-R"]')).toHaveCount(4);
  await expect.poll(async () => (await saved(page)).run.expedition.dungeon.rooms[7].reward.rerolled).toBe(true);
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click(); await expect(page.locator('[data-action^="choose-R"]')).toHaveCount(4);
  await page.locator('[data-action^="choose-R"]').last().click(); await expect(page.locator('#overlay')).toBeHidden();
  await expect.poll(async () => (await saved(page)).run.expedition.relics.length).toBe(2); expect(errors).toEqual([]); expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false);
});
test('a chosen common scale displays and charges the same discounted gold price and persists purchase', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await unlockProfile(page); await pendingUtility(page);
  await expect(page.locator('[data-action="choose-R33"] .rarity-badge')).toContainText('일반'); await page.locator('[data-action="choose-R33"]').click();
  await page.evaluate(async () => {
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string); const { refreshShop } = await import('/src/core/shop.ts' as string);
    const store = new SaveStore(); const r = await store.load(), s = r.run; s.expedition.room = 10; const room = s.expedition.dungeon.rooms[10]; room.visited = room.cleared = true;
    s.phase = 'explore'; s.player.x = 320; s.player.y = 217; s.player.hp = 80; s.gold = 16; refreshShop(s); await store.save(s, defaultSettings());
  });
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click(); await page.keyboard.press('e');
  await expect(page.locator('#panel')).toContainText('금화 가격 20% 할인'); await page.getByRole('button', { name: '작은 회복약 · 16 금화 · 구매', exact: true }).click();
  await expect.poll(async () => (await saved(page)).run.gold).toBe(0); expect((await saved(page)).run.player.hp).toBe(95);
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click(); await page.keyboard.press('e'); await expect(page.locator('[data-action="buy-2"]')).toContainText('판매 완료');
  await page.setViewportSize({ width: 640, height: 480 }); await page.locator('[data-action="buy-2"]').scrollIntoViewIfNeeded(); await page.screenshot({ path: 'graphics-review/utility/discount.png' });
  expect(await page.locator('#panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true); expect(errors).toEqual([]);
});
