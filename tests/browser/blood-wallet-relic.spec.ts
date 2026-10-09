import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); }; });
  await page.clock.install({ time: new Date('2026-10-08T00:00:00Z') }); await page.clock.pauseAt(new Date('2026-10-08T00:00:00.032Z'));
});
const saved = (page: Page) => page.evaluate(async () => { const { SaveStore } = await import('/src/persistence/save.ts' as string); return await new SaveStore().load(); });
async function seed(page: Page, held = false) {
  await page.goto('/'); await page.evaluate(async held => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string); const { beginGrowthRun, emptyInvestment } = await import('/src/core/growth.ts' as string);
    const { grantRelic } = await import('/src/core/relic-acquisition.ts' as string); const { refreshShop } = await import('/src/core/shop.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string); const store = new SaveStore(); await store.load();
    const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'blood-wallet-browser');
    if (held) { const chest = s.expedition.dungeon.rooms[6]; chest.visited = chest.cleared = true; chest.reward = { room: 6, candidates: ['R37'], choice: 'R37' }; grantRelic(s, 'R37'); }
    s.expedition.room = 10; const r = s.expedition.dungeon.rooms[10]; r.visited = r.cleared = true; s.phase = 'explore'; s.player.x = 320; s.player.y = 238;
    s.gold = held ? 100 : 24; s.player.hp = held ? 20.5 : 100; s.view = { yaw: -Math.PI / 2, pitch: 0 }; refreshShop(s);
    r.shop.slots[0].relic = held ? 'R01' : 'R37'; r.shop.slots[1].relic = 'R24'; r.shop.slots[3].relic = 'R43'; await store.save(s, defaultSettings());
  }, held); await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click(); await page.clock.runFor(120); await page.keyboard.press('e');
}
test('buying the legendary wallet uses gold first, then real health payments preserve hit records and survive reload', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await seed(page);
  await expect(page.locator('[data-action="buy-0"]')).toContainText('24 금화'); await expect(page.locator('[data-action="buy-0"]').locator('..').locator('.rarity-badge')).toContainText('전설');
  await page.locator('[data-action="buy-0"]').click(); await expect(page.locator('#overlay')).toBeHidden(); await expect.poll(async () => (await saved(page)).run.expedition.relics).toContain('R37');
  const wallet = await saved(page); expect(wallet.run.player.hp).toBe(100); expect(wallet.run.gold).toBe(0);
  await page.keyboard.press('e'); await expect(page.locator('#panel')).toContainText('결제 후 생명력 1 이상'); await expect(page.locator('[data-action="buy-1"]')).toContainText('20 생명력');
  await expect(page.locator('[data-action="buy-3"]')).toContainText('15 생명력'); await expect(page.locator('[data-action="buy-2"]')).toBeDisabled();
  await expect(page.locator('[data-action="buy-2"]')).toContainText('회복품 구매 불가'); await page.locator('[data-action="buy-1"]').click(); await expect(page.locator('#overlay')).toBeHidden();
  await expect.poll(async () => (await saved(page)).run.player.hp).toBe(80); const paid = await saved(page); expect(paid.run.gold).toBe(0); expect(paid.run.stats.hits).toBe(0);
  expect(paid.run.player.invulnerable).toBe(0); expect(paid.run.player.teleportTick).toBeUndefined(); expect(paid.run.growth.auxiliaryUsed).toBeUndefined(); expect(paid.profile.purchases).toHaveLength(2);
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click(); await page.clock.runFor(120); await page.keyboard.press('e');
  await expect(page.locator('[data-action="buy-1"]')).toBeDisabled(); await expect(page.locator('[data-action="buy-1"]')).toContainText('판매 완료');
  await page.screenshot({ path: 'graphics-review/blood-wallet/payment.png' }); expect((await saved(page)).run.player.hp).toBe(80); expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false); expect(errors).toEqual([]);
});
test('a small shop explains the fractional health boundary, allows exactly one HP and keeps currency intact', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await page.setViewportSize({ width: 640, height: 480 }); await seed(page, true);
  await expect(page.locator('.shop-wallet')).toContainText('20.5 / 100'); await expect(page.locator('[data-action="buy-0"]')).toBeDisabled(); await expect(page.locator('[data-action="buy-0"]')).toContainText('21 이상 필요');
  expect((await saved(page)).run.player.hp).toBe(20.5); await page.locator('[data-action="close"]').click();
  await page.evaluate(async () => { const { SaveStore } = await import('/src/persistence/save.ts' as string); const store = new SaveStore(), r = await store.load(); r.run.player.hp = 21; await store.save(r.run, r.settings); });
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click(); await page.clock.runFor(120); await page.keyboard.press('e');
  await expect(page.locator('[data-action="buy-0"]')).toBeEnabled(); await page.locator('[data-action="buy-0"]').click(); await expect.poll(async () => (await saved(page)).run.player.hp).toBe(1);
  const r = await saved(page); expect(r.run.gold).toBe(100); expect(r.run.stats.hits).toBe(0); expect(r.run.phase).toBe('explore');
  await page.keyboard.press('e'); await page.locator('[data-action="buy-3"]').scrollIntoViewIfNeeded(); await expect(page.locator('[data-action="buy-3"]')).toBeDisabled();
  await expect(page.locator('[data-action="buy-3"]')).toContainText('16 이상 필요'); await page.locator('[data-action="close"]').scrollIntoViewIfNeeded(); await expect(page.locator('[data-action="close"]')).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: 'graphics-review/blood-wallet/small-shop.png' }); expect(errors).toEqual([]);
});
