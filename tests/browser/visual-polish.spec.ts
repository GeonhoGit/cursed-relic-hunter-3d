import { expect, test } from '@playwright/test';

test('regional lighting and reflections remain stable across room revisits', async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const graphicsWarnings: string[] = [];
  page.on('console', message => { if (message.type() === 'warning' && message.text().includes('THREE.')) graphicsWarnings.push(message.text()); });
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture is forbidden in this check'); };
  });
  await page.goto('/');
  await page.evaluate(async () => {
    const { World } = await import('/src/game/world.ts' as string);
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const host = document.createElement('div'); host.id = 'graphics-preview';
    host.style.cssText = 'position:fixed;inset:0;width:960px;height:600px;z-index:9999'; document.body.append(host);
    const world = new World(host), run = createDungeonRun(42);
    run.player.x = 320; run.player.y = 344; run.tick = 180;
    await new Promise(requestAnimationFrame);
    (window as any).graphicsPreview = { world, run };
    document.getElementById('overlay')!.hidden = true;
  });
  const palettes: string[] = [];
  for (const region of [1, 2, 3]) {
    palettes.push(await page.evaluate(region => {
      const { world, run } = (window as any).graphicsPreview;
      run.expedition.region = region; run.expedition.room = 0;
      world.paint(run, -Math.PI / 2, .06, false, false);
      const torch = world.room.children.find((o: any) => o.isPointLight);
      return `${world.scene.fog.color.getHexString()}:${torch.color.getHexString()}`;
    }, region));
    await page.locator('#graphics-preview').screenshot({ path: `test-results/graphics-region-${region}.png` });
  }
  const result = await page.evaluate(() => {
    const { world, run } = (window as any).graphicsPreview;
    run.expedition.region = 1; world.paint(run, -Math.PI / 2, .06, false, false);
    const before = { ...world.renderer.info.memory };
    const torch = world.room.children.find((o: any) => o.isPointLight), intensity = torch.intensity;
    world.paint(run, -Math.PI / 2, .06, false, true);
    const pausedIntensity = torch.intensity;
    for (let i = 0; i < 6; i++) {
      run.expedition.region = i % 3 + 1; run.expedition.room = i % 3 + 1;
      world.paint(run, -Math.PI / 2, 0, false, false);
      run.expedition.region = 1; run.expedition.room = 0;
      world.paint(run, -Math.PI / 2, .06, false, false);
    }
    return { before, after: { ...world.renderer.info.memory }, environment: !!world.scene.environment,
      intensity, pausedIntensity, locked: !!document.pointerLockElement };
  });
  expect(errors).toEqual([]); expect(result.locked).toBe(false);
  expect(result.environment).toBe(true); expect(new Set(palettes).size).toBe(3);
  expect(result.pausedIntensity).toBe(result.intensity);
  expect(result.after.textures).toBeLessThanOrEqual(result.before.textures + 1);
  expect(result.after.geometries).toBeLessThanOrEqual(result.before.geometries + 1);
  const recovery = await page.evaluate(async () => {
    const { world, run } = (window as any).graphicsPreview, canvas = world.renderer.domElement;
    const previous = world.scene.environment.uuid;
    const lost = new Promise(resolve => canvas.addEventListener('webglcontextlost', resolve, { once: true }));
    world.renderer.forceContextLoss(); await lost;
    const stopped = !world.ready;
    await new Promise(resolve => setTimeout(resolve, 1000));
    const restored = new Promise(resolve => canvas.addEventListener('webglcontextrestored', resolve, { once: true }));
    world.renderer.forceContextRestore(); await restored;
    world.paint(run, -Math.PI / 2, .06, false, false);
    return { stopped, ready: world.ready, rebuilt: previous !== world.scene.environment.uuid };
  });
  expect(recovery).toEqual({ stopped: true, ready: true, rebuilt: true });
  expect(graphicsWarnings).toEqual([]); expect(errors).toEqual([]);
});
