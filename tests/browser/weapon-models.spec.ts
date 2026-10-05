import { expect, test } from '@playwright/test';

test('the four first-person weapons load as distinct three-dimensional assets', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  const sizes = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js' as string);
    const { GLTFLoader } = await import('/node_modules/three/examples/jsm/loaders/GLTFLoader.js' as string);
    const loader = new GLTFLoader();
    const result: Record<string, { width: number; height: number; depth: number; meshes: number }> = {};
    for (const id of ['W01', 'W02', 'W03', 'W04']) {
      const asset = await loader.loadAsync(`/models/weapons/${id.toLowerCase()}.glb`);
      const size = new THREE.Box3().setFromObject(asset.scene).getSize(new THREE.Vector3());
      let meshes = 0;
      asset.scene.traverse(object => { if (object instanceof THREE.Mesh) meshes++; });
      result[id] = { width: size.x, height: size.y, depth: size.z, meshes };
    }
    return result;
  });
  for (const id of ['W01', 'W02', 'W03', 'W04']) {
    expect(sizes[id].meshes).toBeGreaterThan(8);
    expect(sizes[id].depth).toBeGreaterThan(0.6);
  }
  expect(sizes.W02.width).toBeGreaterThan(sizes.W01.width);
  expect(sizes.W03.width).toBeGreaterThan(sizes.W02.width);
  expect(sizes.W04.height).toBeGreaterThan(sizes.W01.height);
});

test('selecting a weapon shows its own model in the first-person view', async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { World } = await import('/src/game/world.ts' as string);
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;width:960px;height:600px';
    document.body.append(host);
    const world = new World(host), run = createDungeonRun(42);
    const visible: string[][] = [];
    for (const id of ['W01', 'W02', 'W03', 'W04']) {
      run.weapon = id as typeof run.weapon;
      world.paint(run, -Math.PI / 2, 0, false, false);
      await new Promise<void>(resolve => {
        const check = () => world.weaponViews[id].getObjectByName('weapon-model') ? resolve() : setTimeout(check, 25);
        check();
      });
      visible.push(world.gun.children.filter((weapon: any) => weapon.visible && weapon.name.startsWith('weapon-')).map((weapon: any) => weapon.name));
    }
    host.remove();
    return { visible, loadedBolt: world.bolt.name };
  });
  expect(result.visible).toEqual([['weapon-W01'], ['weapon-W02'], ['weapon-W03'], ['weapon-W04']]);
  expect(result.loadedBolt).toBe('loaded_bolt');
});

test('the game requests only the weapon currently in use', async ({ page }) => {
  test.setTimeout(90000);
  const requested: string[] = [];
  page.on('request', request => {
    if (request.url().includes('/models/weapons/')) requested.push(request.url().split('/').at(-1)!);
  });
  await page.goto('/');
  const firstModelRequest = page.waitForRequest(request => request.url().endsWith('/models/weapons/w01.glb'));
  await page.evaluate(async () => {
    const { World } = await import('/src/game/world.ts' as string);
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const host = document.createElement('div'); host.style.cssText = 'width:320px;height:200px'; document.body.append(host);
    const world = new World(host), run = createDungeonRun(42);
    await new Promise(requestAnimationFrame);
    world.paint(run, -Math.PI / 2, 0, false, false);
  });
  await firstModelRequest;
  expect([...new Set(requested)]).toEqual(['w01.glb']);
});
