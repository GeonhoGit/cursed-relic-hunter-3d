import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); };
  });
  await page.clock.install({ time: new Date('2026-10-05T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-05T00:00:00.032Z'));
});
async function visibleBounds(page: Page, selector: string) {
  return page.locator(selector).evaluateAll(nodes => nodes.map(node => {
    const r = node.getBoundingClientRect(), c = getComputedStyle(node);
    return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height,
      font: Number.parseFloat(c.fontSize), background: c.backgroundColor };
  }));
}

test('menus use readable type and reachable controls at desktop and short window sizes', async ({ page }) => {
  for (const size of [{ width: 1440, height: 900 }, { width: 960, height: 600 }, { width: 640, height: 480 }]) {
    await page.setViewportSize(size); await page.goto('/');
    await page.getByRole('button', { name: '설정', exact: true }).click();
    const panel = (await visibleBounds(page, '#panel'))[0];
    expect(panel.background).not.toContain('rgba(');
    expect(panel.x).toBeGreaterThanOrEqual(0); expect(panel.right).toBeLessThanOrEqual(size.width);
    expect(panel.y).toBeGreaterThanOrEqual(0); expect(panel.bottom).toBeLessThanOrEqual(size.height);
    const text = await visibleBounds(page, '#sensitivity-description, #effects-description');
    expect(text.every(t => t.font >= 14)).toBe(true);
    const buttons = await visibleBounds(page, '#panel button');
    expect(buttons.every(b => b.height >= 44 && b.font >= 14)).toBe(true);
    await page.getByRole('button', { name: '돌아가기', exact: true }).click();
    await expect(page.getByRole('button', { name: '새 탐험 시작' })).toBeVisible();
    await page.getByRole('button', { name: '영구 성장', exact: true }).click();
    expect((await visibleBounds(page, '.growth-row span, .growth-goal span')).every(t => t.font >= 13)).toBe(true);
    expect(await page.locator('#panel').evaluate(p => p.scrollWidth <= p.clientWidth + 1)).toBe(true);
    await page.getByRole('button', { name: '야영지로 돌아가기', exact: true }).click();
    await page.getByRole('button', { name: '출발 무기', exact: true }).click();
    expect((await visibleBounds(page, '.weapon-card p, .weapon-card dl')).every(t => t.font >= 14)).toBe(true);
    expect(await page.locator('#panel').evaluate(p => p.scrollWidth <= p.clientWidth + 1)).toBe(true);
    if (size.width === 1440) await page.screenshot({ path: 'graphics-review/ui-polish/weapons.png' });
  }
});

test('combat HUD and contextual prompts stay readable and do not overlap', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 600 }); await page.goto('/');
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const s = createDungeonRun(42); s.expedition.room = 6;
    const room = s.expedition.dungeon.rooms[6]; room.visited = room.cleared = true;
    s.phase = 'explore'; s.player.x = 320; s.player.y = 217; s.view = { yaw: -Math.PI / 2, pitch: 0 };
    const store = new SaveStore('cursed-relic-hunter-3d-v1'); await store.load(); await store.save(s, defaultSettings());
  });
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.locator('#overlay')).toBeHidden(); await page.clock.runFor(80);
  const sections = await visibleBounds(page, '.vitals, .abilities, .weapon-hud');
  for (let i = 0; i < sections.length; i++) {
    expect(sections[i].x).toBeGreaterThanOrEqual(0); expect(sections[i].right).toBeLessThanOrEqual(960);
    if (i) expect(sections[i].x).toBeGreaterThanOrEqual(sections[i - 1].right);
  }
  expect((await visibleBounds(page, '.abilities, .resources, .weapon-hud button')).every(t => t.font >= 13)).toBe(true);
  await expect(page.locator('#interact')).toBeVisible(); await expect(page.locator('#capture-hint')).toBeVisible();
  const prompt = (await visibleBounds(page, '#interact'))[0], hint = (await visibleBounds(page, '#capture-hint'))[0];
  expect(prompt.bottom).toBeLessThanOrEqual(Math.min(...sections.map(s => s.y)) - 6);
  expect(hint.bottom).toBeLessThanOrEqual(prompt.y - 6);
  await page.screenshot({ path: 'graphics-review/ui-polish/hud.png' });
  await page.keyboard.press('e'); await expect(page.getByRole('heading', { name: '유물을 하나 선택하세요.' })).toBeVisible();
  expect((await visibleBounds(page, '.relic-card p')).every(t => t.font >= 14)).toBe(true);
  expect(await page.locator('#panel').evaluate(p => p.scrollWidth <= p.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: 'graphics-review/ui-polish/rewards.png' });
  await page.locator('button[data-action^="choose-R"]').first().click(); await expect(page.locator('#overlay')).toBeHidden();
});

test('FPS measurement stays separate from boss warnings', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 600 }); await page.goto('/');
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { createBoss } = await import('/src/core/boss.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const s = createDungeonRun(42); s.expedition.room = 8; s.expedition.dungeon.rooms[8].visited = true;
    s.phase = 'combat'; s.waveDelay = 0; s.boss = createBoss(s); s.view = { yaw: -Math.PI / 2, pitch: 0 };
    const store = new SaveStore('cursed-relic-hunter-3d-v1'); await store.load();
    await store.save(s, { ...defaultSettings(), showFps: true });
  });
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.locator('#overlay')).toBeHidden(); await page.clock.runFor(80);
  await expect(page.locator('#fps-counter')).toBeVisible(); await expect(page.locator('#boss-hud')).toBeVisible();
  const fps = (await visibleBounds(page, '#fps-counter'))[0], boss = (await visibleBounds(page, '#boss-hud'))[0];
  expect(fps.bottom).toBeLessThanOrEqual(boss.y - 8);
  const compass = (await visibleBounds(page, '.compass'))[0];
  expect(fps.x).toBeGreaterThanOrEqual(compass.right + 8);
  await page.screenshot({ path: 'graphics-review/ui-polish/boss.png' });
});
