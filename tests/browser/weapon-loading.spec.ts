import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

async function weaponWorld(page: Page, weapon: string) {
  await page.clock.install({ time: new Date('2026-10-05T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-05T00:00:00.032Z'));
  // A minimal host runs the real renderer without a second game's animation loop.
  await page.route('**/weapon-loading-test', route => route.fulfill({
    contentType: 'text/html', body: '<div id="host" style="width:320px;height:200px"></div>',
  }));
  await page.goto('/weapon-loading-test');
  await page.evaluate(async weapon => {
    const { World } = await import('/src/game/world.ts' as string);
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const world = new World(document.getElementById('host')!), run = createDungeonRun(42);
    world.setQuality(0); run.weapon = weapon;
    (window as any).weaponTest = { world, run };
    world.paint(run, -Math.PI / 2, 0, false, false, { reducedMotion: true });
  }, weapon);
}

async function paint(page: Page, elapsed = 0) {
  if (elapsed) await page.clock.runFor(elapsed);
  await page.evaluate(() => {
    const { world, run } = (window as any).weaponTest;
    world.paint(run, -Math.PI / 2, 0, false, false, { reducedMotion: true });
  });
}

async function displayed(page: Page) {
  return page.evaluate(() => {
    const { world, run } = (window as any).weaponTest;
    const view = world.weaponViews[run.weapon];
    const fallback = view.getObjectByName('weapon-fallback');
    let meshes = 0;
    fallback?.traverse((object: any) => { if (object.isMesh) meshes++; });
    return { fallbackMeshes: meshes, visible: view.visible && world.gun.visible,
      loaded: !!view.getObjectByName('weapon-model'), bolt: world.bolt.name };
  });
}

test('a failed crossbow model keeps a visible fallback and recovers on retry', async ({ page }) => {
  test.setTimeout(90000);
  let requests = 0;
  await page.route('**/models/weapons/w03.glb', route => ++requests === 1 ? route.abort() : route.continue());
  await weaponWorld(page, 'W03');
  await expect.poll(() => requests).toBe(1);
  await expect.poll(async () => (await displayed(page)).fallbackMeshes).toBeGreaterThan(0);
  expect((await displayed(page)).visible).toBe(true);
  const preview = await page.evaluate(() => {
    const { world, run } = (window as any).weaponTest;
    // Capture immediately after rendering: a resize can clear an idle WebGL canvas.
    world.paint(run, -Math.PI / 2, 0, false, false, { reducedMotion: true });
    return world.renderer.domElement.toDataURL('image/png') as string;
  });
  await mkdir('graphics-review/weapon-loading', { recursive: true });
  await writeFile('graphics-review/weapon-loading/crossbow-fallback.png', Buffer.from(preview.split(',')[1], 'base64'));
  await expect.poll(() => page.evaluate(() => (window as any).weaponTest.world.weaponLoads.get('W03')?.loading)).toBe(false);
  await paint(page, 1000);
  await expect.poll(async () => (await displayed(page)).loaded).toBe(true);
  expect(await displayed(page)).toMatchObject({ fallbackMeshes: 0, visible: true, bolt: 'loaded_bolt' });
  await paint(page, 10000);
  expect(requests).toBe(2);
});

test('a permanently unavailable model keeps its fallback and stops after three attempts', async ({ page }) => {
  test.setTimeout(90000);
  let requests = 0;
  await page.route('**/models/weapons/w02.glb', route => { requests++; return route.abort(); });
  await weaponWorld(page, 'W02');
  await expect.poll(async () => (await displayed(page)).fallbackMeshes).toBeGreaterThan(0);
  // Wait for each aborted response to be handled before advancing the retry clock.
  await expect.poll(() => page.evaluate(() => (window as any).weaponTest.world.weaponLoads.get('W02')?.loading)).toBe(false);
  await paint(page, 1000);
  await expect.poll(() => requests).toBe(2);
  await expect.poll(() => page.evaluate(() => (window as any).weaponTest.world.weaponLoads.get('W02')?.loading)).toBe(false);
  await paint(page, 2000);
  await expect.poll(() => requests).toBe(3);
  await expect.poll(() => page.evaluate(() => (window as any).weaponTest.world.weaponLoads.get('W02')?.loading)).toBe(false);
  await paint(page, 10000); await paint(page, 10000);
  expect(requests).toBe(3);
  expect((await displayed(page)).fallbackMeshes).toBeGreaterThan(0);
  expect(await displayed(page)).toMatchObject({ visible: true, loaded: false });
});

test('slow staff downloads keep a visible fallback without duplicate requests', async ({ page }) => {
  test.setTimeout(90000);
  let requests = 0, release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/models/weapons/w04.glb', async route => {
    requests++; await pending; await route.continue();
  });
  try {
    await weaponWorld(page, 'W04');
    await expect.poll(() => requests).toBe(1);
    expect((await displayed(page)).fallbackMeshes).toBeGreaterThan(0);
    expect((await displayed(page)).visible).toBe(true);
    await paint(page, 10000); await paint(page, 10000);
    expect(requests).toBe(1);
  } finally { release(); }
  await expect.poll(async () => (await displayed(page)).loaded).toBe(true);
  expect(await displayed(page)).toMatchObject({ fallbackMeshes: 0, visible: true });
});
