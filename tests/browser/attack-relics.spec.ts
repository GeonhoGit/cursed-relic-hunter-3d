import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); };
  });
  await page.clock.install({ time: new Date('2026-10-05T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-05T00:00:00.032Z'));
});

for (const relic of [
  { id: 'R49', name: '붉은 숫돌', damage: '8.05', interval: '0.40' },
  { id: 'R50', name: '거인의 인장', damage: '9.1', interval: '0.42' },
  { id: 'R51', name: '결사의 송곳니', damage: '8.75', interval: '0.40' },
]) test(`${relic.name} can be chosen from a chest, updates weapon stats and survives reload`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const s = createDungeonRun(42); s.weapon = 'W01'; s.player.hp = 50; s.expedition.room = 6;
    const room = s.expedition.dungeon.rooms[6]; room.visited = room.cleared = true;
    room.reward = { room: 6, candidates: ['R49', 'R50', 'R51'], choice: null };
    s.phase = 'cleared'; s.player.x = 320; s.player.y = 217; s.view = { yaw: -Math.PI / 2, pitch: 0 };
    const store = new SaveStore('cursed-relic-hunter-3d-v1'); await store.load(); await store.save(s, defaultSettings());
  });
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.getByRole('button', { name: `${relic.name} 선택`, exact: true })).toBeVisible();
  if (relic.id === 'R50') await expect(page.getByRole('button', { name: `${relic.name} 선택`, exact: true })).toContainText('발사 간격 +5%');
  await page.locator(`button[data-action="choose-${relic.id}"]`).click();
  await expect(page.locator('#overlay')).toBeHidden(); await page.clock.runFor(50);
  await expect(page.locator('#weapon-stats')).toContainText(`탄환당 피해 ${relic.damage}`);
  await expect(page.locator('#weapon-stats')).toContainText(`발사 간격 ${relic.interval}초`);
  if (relic.id === 'R51') await expect(page.locator('#fang-status')).toHaveText('결사의 송곳니 · 발동 중 +25%');
  else await expect(page.locator('#fang-status')).toBeHidden();
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.locator('#overlay')).toBeHidden(); await page.clock.runFor(50);
  await expect(page.locator('#weapon-stats')).toContainText(`탄환당 피해 ${relic.damage}`);
  await page.keyboard.press('i');
  await expect(page.locator('#panel .relic-card b').filter({ hasText: relic.name })).toHaveText(relic.name);
  expect(errors).toEqual([]);
});

test('healing above half of invested HP disables the fang and keeps the HUD readable', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 600 }); await page.goto('/');
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { grantRelic } = await import('/src/core/relic-acquisition.ts' as string);
    const { beginGrowthRun, emptyInvestment } = await import('/src/core/growth.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const s = createDungeonRun(42); s.weapon = 'W01';
    s.expedition.dungeon.rooms[1].visited = s.expedition.dungeon.rooms[1].cleared = true;
    beginGrowthRun(s, { ...emptyInvestment(), health: 5 }, 'attack-hud'); s.player.hp = 52.5;
    for (const [i, id] of ['R49', 'R50', 'R51'].entries()) {
      const room = s.expedition.dungeon.rooms[i < 2 ? 6 + i : 10]; room.visited = room.cleared = true;
      if (i < 2) room.reward = { room: room.id, candidates: [id], choice: id };
      else room.shop = { revision: 2, slots: [
        { kind: 'relic', relic: id, purchased: true, repairCounter: 0 },
        { kind: 'relic', relic: null, purchased: false, repairCounter: 0 },
        { kind: 'heal', relic: null, purchased: false, repairCounter: 0 },
        { kind: 'curse', relic: null, purchased: false, repairCounter: 0 },
      ] };
      grantRelic(s, id);
    }
    s.expedition.room = 10; s.gold = 20; s.player.x = 320; s.player.y = 245; s.view = { yaw: -Math.PI / 2, pitch: 0 };
    const store = new SaveStore('cursed-relic-hunter-3d-v1'); await store.load(); await store.save(s, defaultSettings());
  });
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.locator('#overlay')).toBeHidden(); await page.clock.runFor(80);
  await expect(page.locator('#weapon-stats')).toContainText('탄환당 피해 11.9 (+70%)');
  await expect(page.locator('#fang-status')).toHaveText('결사의 송곳니 · 발동 중 +25%');
  for (const size of [{ width: 960, height: 600 }, { width: 640, height: 480 }]) {
    await page.setViewportSize(size); await page.clock.runFor(50);
    const bounds = await page.locator('.weapon-hud').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(size.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(size.height);
    expect(await page.locator('.weapon-hud').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    const prompt = await page.locator('#interact').boundingBox(), hud = await page.locator('.bottom-hud').boundingBox();
    const clearance = size.width <= 760 ? (await page.locator('.abilities').boundingBox())! : hud!;
    expect(prompt!.y + prompt!.height).toBeLessThanOrEqual(clearance.y - 6);
  }
  await page.setViewportSize({ width: 960, height: 600 }); await page.clock.runFor(50);
  await page.screenshot({ path: 'graphics-review/attack-relics/active.png' });
  await page.keyboard.press('e'); await page.locator('button[data-action="buy-2"]').click();
  await expect(page.locator('#overlay')).toBeHidden(); await page.clock.runFor(50);
  await expect(page.locator('#hp')).toHaveText('67.5');
  await expect(page.locator('#weapon-stats')).toContainText('탄환당 피해 10.15 (+45%)');
  await expect(page.locator('#fang-status')).toHaveText('결사의 송곳니 · 생명력 50% 이하에서 발동');
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.locator('#overlay')).toBeHidden(); await page.clock.runFor(50);
  await expect(page.locator('#fang-status')).toHaveText('결사의 송곳니 · 생명력 50% 이하에서 발동');
  await expect(page.locator('#weapon-stats')).toContainText('탄환당 피해 10.15');
});
