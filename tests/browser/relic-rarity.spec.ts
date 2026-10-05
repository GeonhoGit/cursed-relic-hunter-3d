import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); };
  });
  await page.clock.install({ time: new Date('2026-10-05T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-05T00:00:00.032Z'));
});

test('grades, colors and the probability table are readable and persist through selection and reroll', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const s = createDungeonRun(42); s.expedition.room = 6; s.phase = 'cleared';
    const room = s.expedition.dungeon.rooms[6]; room.visited = room.cleared = true;
    room.reward = { room: 6, candidates: ['R49', 'R50', 'R25'], choice: null };
    s.player.x = 320; s.player.y = 217; s.view = { yaw: -Math.PI / 2, pitch: 0 };
    const store = new SaveStore('cursed-relic-hunter-3d-v1'); await store.load(); await store.save(s, defaultSettings());
  });
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.locator('.reward-options .rarity-badge')).toHaveText(['일반', '영웅', '전설']);
  const colors = await page.locator('.reward-options .rarity-badge').evaluateAll(nodes => nodes.map(n => getComputedStyle(n).color));
  expect(new Set(colors).size).toBe(3);
  for (const size of [{ width: 1440, height: 900 }, { width: 640, height: 480 }]) {
    await page.setViewportSize(size);
    const details = page.locator('.rarity-guide');
    if (!await details.evaluate(el => (el as HTMLDetailsElement).open)) await details.locator('summary').click();
    await expect(page.locator('.rarity-table tbody tr')).toHaveText(['일반55%', '희귀30%', '영웅12%', '전설3%']);
    await expect(details).toContainText('후보가 없는 등급은 제외');
    expect(await page.locator('#panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    expect(await page.locator('.rarity-badge').evaluateAll(nodes => nodes.every(n => Number.parseFloat(getComputedStyle(n).fontSize) >= 12))).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'graphics-review/relic-rarity/rewards.png' });
  await page.getByRole('button', { name: '두 번째 발걸음 선택', exact: true }).click();
  await expect(page.locator('#overlay')).toBeHidden(); await page.clock.runFor(50);
  await page.keyboard.press('i'); await expect(page.locator('.inventory-grid .rarity-badge')).toHaveText(['전설']);
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.locator('#overlay')).toBeHidden(); await page.clock.runFor(50);
  await page.keyboard.press('i'); await expect(page.locator('.inventory-grid .rarity-badge')).toHaveText(['전설']);
  await page.evaluate(async () => {
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const store = new SaveStore('cursed-relic-hunter-3d-v1'); const data = await store.load();
    const s = data.run; s.expedition.room = 7; s.phase = 'cleared';
    const room = s.expedition.dungeon.rooms[7]; room.visited = room.cleared = true;
    room.reward = { room: 7, candidates: ['R49', 'R50', 'R13'], choice: null };
    await store.save(s, defaultSettings());
  });
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await page.getByRole('button', { name: '새로고침 · 무료 1회', exact: true }).click();
  await expect(page.getByRole('button', { name: '새로고침 사용 완료', exact: true })).toBeDisabled();
  const grades = await page.locator('.reward-options .rarity-badge').allTextContents(); expect(grades).toHaveLength(3);
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.locator('.reward-options .rarity-badge')).toHaveText(grades);
  expect(errors).toEqual([]);
});

test('shop relics and fixed healing stock display grades with the same probability guide', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { refreshShop } = await import('/src/core/shop.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const s = createDungeonRun(42); s.expedition.room = 10;
    s.expedition.dungeon.rooms[10].visited = s.expedition.dungeon.rooms[10].cleared = true;
    s.player.x = 320; s.player.y = 245; s.view = { yaw: -Math.PI / 2, pitch: 0 }; refreshShop(s);
    const store = new SaveStore('cursed-relic-hunter-3d-v1'); await store.load(); await store.save(s, defaultSettings());
  });
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.locator('#overlay')).toBeHidden(); await page.clock.runFor(50); await page.keyboard.press('e');
  await expect(page.locator('.shop-item .rarity-badge')).toHaveCount(4);
  await expect(page.locator('.shop-item.heal .rarity-badge')).toHaveText('일반');
  await expect(page.locator('.shop-item.curse .rarity-badge')).toHaveText('전설');
  await page.locator('.rarity-guide summary').click();
  await expect(page.locator('.rarity-guide')).toContainText('저주 진열대·회복약은 별도');
  await page.screenshot({ path: 'graphics-review/relic-rarity/shop.png' });
});
