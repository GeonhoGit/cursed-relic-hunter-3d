import { expect, test } from '@playwright/test';

test('different room structures render their actual collision bounds and release resources', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); };
  });
  await page.goto('/');
  await page.evaluate(async () => {
    const { World } = await import('/src/game/world.ts' as string);
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const host = document.createElement('div'); host.id = 'structure-preview';
    host.style.cssText = 'position:fixed;inset:0;width:960px;height:600px;z-index:9999'; document.body.append(host);
    const world = new World(host), run = createDungeonRun(42);
    run.player.x = 320; run.player.y = 344;
    await new Promise(requestAnimationFrame); world.paint(run, -Math.PI / 2, .04, false, true);
    (window as any).structurePreview = { world, run };
    document.getElementById('overlay')!.hidden = true;
  });
  const result = await page.evaluate(async () => {
    const { world, run } = (window as any).structurePreview;
    const { roomLayout } = await import('/src/core/room-layout.ts' as string);
    const THREE = await import('/node_modules/three/build/three.module.js' as string);
    // ResizeObserver settles after the first animation frame. Warm the final viewport
    // before comparing allocations, otherwise newly visible meshes look like a leak.
    const cold = { ...world.renderer.info.memory };
    world.paint(run, -Math.PI / 2, .04, false, true);
    const before = { ...world.renderer.info.memory }, pairs = [];
    for (const region of [1, 2, 3]) for (const room of run.expedition.dungeon.rooms) {
      run.expedition.region = region; run.expedition.room = room.id;
      world.paint(run, -Math.PI / 2, .04, false, true);
      const body = world.room.getObjectByName('wall-body'), bounds = roomLayout(run).obstacles, distances = [];
      for (const b of bounds) for (const fraction of [.17, .5, .83]) {
        for (const [x, y, dx, dy] of [
          [b.x - 2, b.y + b.h * fraction, 1, 0], [b.x + b.w + 2, b.y + b.h * fraction, -1, 0],
          [b.x + b.w * fraction, b.y - 2, 0, 1], [b.x + b.w * fraction, b.y + b.h + 2, 0, -1],
        ]) {
          if (bounds.some((other: any) => x > other.x && x < other.x + other.w && y > other.y && y < other.y + other.h)) continue;
          const ray = new THREE.Raycaster(new THREE.Vector3((x - 320) * .04, 2, (y - 183) * .04), new THREE.Vector3(dx, 0, dy));
          distances.push(ray.intersectObject(body)[0]?.distance ?? -1);
        }
      }
      pairs.push(distances);
    }
    run.expedition.region = 1; run.expedition.room = 0;
    world.paint(run, -Math.PI / 2, .04, false, true);
    return { pairs, cold, before, after: { ...world.renderer.info.memory }, locked: !!document.pointerLockElement };
  });
  expect(errors).toEqual([]); expect(result.locked).toBe(false);
  for (const distances of result.pairs) {
    expect(distances.length).toBeGreaterThan(0);
    for (const distance of distances) expect(distance).toBeCloseTo(.08, 5);
  }
  expect(result.after.geometries).toBeLessThanOrEqual(result.before.geometries + 1);
  expect(result.after.textures).toBeLessThanOrEqual(result.before.textures + 1);
  for (const room of [1, 3, 6]) {
    await page.evaluate(room => {
      const { world, run } = (window as any).structurePreview;
      run.expedition.room = room; world.paint(run, -Math.PI / 2 - .22, .04, false, true);
    }, room);
    await page.locator('#structure-preview').screenshot({ path: `test-results/structure-room-${room}.png` });
  }
});
