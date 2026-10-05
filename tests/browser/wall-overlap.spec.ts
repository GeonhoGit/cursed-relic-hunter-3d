import { expect, test } from '@playwright/test';

test('joined walls and trim have one exterior surface at their overlapping corners', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); };
  });
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { World } = await import('/src/game/world.ts' as string);
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const THREE = await import('/node_modules/three/build/three.module.js' as string);
    const host = document.createElement('div'); host.id = 'wall-preview';
    host.style.cssText = 'position:fixed;inset:0;width:960px;height:600px;z-index:9999'; document.body.append(host);
    const world = new World(host), run = createDungeonRun(42), counts = [];
    await new Promise(requestAnimationFrame);
    for (const structure of [6, 8]) {
      run.expedition.dungeon.rooms[0].structure = structure;
      run.player.x = -48; run.player.y = 10;
      world.paint(run, Math.atan2(35, 28), .18, false, true); world.room.updateMatrixWorld(true);
      const meshes: any[] = []; world.room.traverse((o: any) => { if (o.isMesh) meshes.push(o); });
      const x = structure === 6 ? -5.3 : 144.3, y = structure === 6 ? 20 : 180;
      const direction = structure === 6 ? 1 : -1;
      for (const height of [2, 1.3]) {
        const z = (structure === 6 ? height === 2 ? 45 : 43.25 : height === 2 ? 135 : 136.75) - 183;
        const ray = new THREE.Raycaster(new THREE.Vector3((x - 320) * .04, height, (y - 183) * .04), new THREE.Vector3(0, 0, direction));
        const hits = ray.intersectObjects(meshes, false).filter((hit: any) => Math.abs(hit.point.z - z * .04) < 1e-5);
        counts.push({ structure, height, count: hits.length });
      }
    }
    run.expedition.dungeon.rooms[0].structure = 6;
    world.paint(run, Math.atan2(35, 28), .18, false, true);
    (window as any).wallPreview = { world, run };
    document.getElementById('overlay')!.hidden = true;
    return { counts, locked: !!document.pointerLockElement };
  });
  // Render once more after ResizeObserver has settled the preview viewport.
  await page.evaluate(() => {
    const { world, run } = (window as any).wallPreview;
    world.paint(run, Math.atan2(35, 28), .18, false, true);
  });
  await page.locator('#wall-preview').screenshot({ path: 'test-results/wall-overlap.png' });
  expect(result.locked).toBe(false);
  expect(result.counts.map(entry => entry.count)).toEqual([1, 1, 1, 1]);
});
