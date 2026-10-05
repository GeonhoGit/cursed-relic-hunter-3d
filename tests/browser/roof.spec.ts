import { expect, test } from '@playwright/test';

test('stone roofs close every regional room at the projectile ceiling and release textures', async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const w = '/src/game/world.ts', s = '/src/core/simulation.ts', t = '/node_modules/three/build/three.module.js';
    const { World } = await import(w), { createDungeonRun } = await import(s), THREE = await import(t);
    const host = document.createElement('div'); host.id = 'roof-preview';
    host.style.cssText = 'position:fixed;inset:0;width:640px;height:400px;z-index:9999'; document.body.append(host);
    const world = new World(host), run = createDungeonRun(42);
    await new Promise(requestAnimationFrame); world.paint(run, 0, 1.1, false, true);
    const before = { ...world.renderer.info.memory }, roofs = [];
    for (let repeat = 0; repeat < 2; repeat++) for (const region of [1, 2, 3]) for (const room of [1, 2, 3]) {
      run.expedition.region = region; run.expedition.room = room;
      world.paint(run, 0, 1.1, false, true);
      const roof = world.room.children.find((o: any) => o.geometry?.type === 'BoxGeometry'
        && o.geometry.parameters.width >= 36.864 && o.position.y > 5.6);
      const heights = [];
      if (roof) for (const [x, z] of [[0, 0], [-18.3, -8.9], [18.3, -8.9], [-18.3, 8.9], [18.3, 8.9]]) {
        const ray = new THREE.Raycaster(new THREE.Vector3(x, 1.36, z), new THREE.Vector3(0, 1, 0));
        heights.push(ray.intersectObject(roof)[0]?.point.y ?? null);
      }
      roofs.push({ heights, textured: !!roof?.material.map && !!roof?.material.normalMap && !!roof?.material.roughnessMap,
        opaque: roof?.material.transparent === false && roof?.material.opacity === 1 });
    }
    run.expedition.region = 1; run.expedition.room = 0; world.paint(run, 0, 1.1, false, true);
    return { before, after: { ...world.renderer.info.memory }, roofs, locked: document.pointerLockElement !== null };
  });
  expect(errors).toEqual([]); expect(result.locked).toBe(false);
  for (const roof of result.roofs) {
    expect(roof.textured).toBe(true); expect(roof.opaque).toBe(true); expect(roof.heights).toHaveLength(5);
    for (const height of roof.heights) expect(height).toBeCloseTo(5.6);
  }
  expect(result.after.geometries).toBeLessThanOrEqual(result.before.geometries + 1);
  expect(result.after.textures).toBeLessThanOrEqual(result.before.textures + 1);
  await page.evaluate(() => { const overlay = document.getElementById('overlay'); if (overlay) overlay.hidden = true; });
  await page.locator('#roof-preview').screenshot({ path: 'test-results/roof-preview.png' });
});
