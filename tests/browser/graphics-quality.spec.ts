import { expect, test } from '@playwright/test';

test('low graphics quality reduces 3D render cost while keeping the scene available', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const [{ World }, { createDungeonRun }] = await Promise.all([
      import('/src/game/world.ts' as string), import('/src/core/simulation.ts' as string),
    ]);
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:960px;height:540px';
    document.body.append(host);
    const world = new World(host);
    await new Promise(requestAnimationFrame);
    const run = createDungeonRun(42);
    world.paint(run, -Math.PI / 2, 0, false, false);
    const before = { width: world.renderer.domElement.width, shadows: world.renderer.shadowMap.enabled,
      bloom: (world as any).bloom.enabled };
    if (typeof (world as any).setQuality !== 'function') return { supported: false, before };
    (world as any).setQuality(0);
    world.paint(run, -Math.PI / 2, 0, false, false);
    const after = { width: world.renderer.domElement.width, shadows: world.renderer.shadowMap.enabled,
      bloom: (world as any).bloom.enabled, ready: world.ready };
    host.remove();
    return { supported: true, before, after };
  });
  expect(result.supported).toBe(true);
  if (!result.supported) return;
  expect(result.before.width).toBeGreaterThan(result.after.width);
  expect(result.before.shadows).toBe(true);
  expect(result.after.shadows).toBe(false);
  expect(result.before.bloom).toBe(true);
  expect(result.after.bloom).toBe(false);
  expect(result.after.ready).toBe(true);
});

test('graphics mode applies immediately and survives reload', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 960, height: 540 });
  await page.clock.install({ time: new Date('2026-10-05T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-05T00:00:00.032Z'));
  await page.goto('/');
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('combobox', { name: '그래픽 품질' }).selectOption('low');
  await expect.poll(() => page.locator('#world canvas').evaluate(canvas => (canvas as HTMLCanvasElement).width)).toBe(576);
  await page.reload();
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '그래픽 품질' })).toHaveValue('low');
  await expect.poll(() => page.locator('#world canvas').evaluate(canvas => (canvas as HTMLCanvasElement).width)).toBe(576);
});
