import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

for (const quality of [0, 3] as const) test(`weapon parts occlude each other independently of mesh draw order at quality ${quality}`, async ({ page }) => {
  test.setTimeout(90000);
  await page.goto('/');
  const result = await page.evaluate(async quality => {
    const { World } = await import('/src/game/world.ts' as string);
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;width:640px;height:400px;z-index:9999';
    document.body.append(host);
    const world = new World(host), run = createDungeonRun(42);
    world.setQuality(quality);
    await new Promise(requestAnimationFrame);
    world.paint(run, -Math.PI / 2, 0, false, false, { reducedMotion: true });
    await new Promise<void>(resolve => {
      const check = () => world.weaponViews.W01.getObjectByName('weapon-model') ? resolve() : setTimeout(check, 25);
      check();
    });
    const meshes: any[] = [];
    world.weaponViews.W01.traverse((object: any) => { if (object.isMesh) meshes.push(object); });
    const pixels = () => {
      world.paint(run, -Math.PI / 2, 0, false, false);
      const gl = world.renderer.getContext(), canvas = world.renderer.domElement;
      const buffer = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
      return buffer;
    };
    meshes.forEach((mesh, i) => { mesh.renderOrder = 1000 + i; });
    const normal = pixels();
    const preview = world.renderer.domElement.toDataURL('image/png');
    meshes.forEach((mesh, i) => { mesh.renderOrder = 2000 - i; });
    const reversed = pixels();
    let changed = 0;
    for (let i = 0; i < normal.length; i += 4) {
      if (Math.max(...[0, 1, 2].map(channel => Math.abs(normal[i + channel] - reversed[i + channel]))) > 8) changed++;
    }
    return { changedFraction: changed / (normal.length / 4), preview };
  }, quality);
  await mkdir('graphics-review/weapon-view-fix', { recursive: true });
  await writeFile(`graphics-review/weapon-view-fix/sidearm-quality-${quality}.png`, Buffer.from(result.preview.split(',')[1], 'base64'));
  expect(result.changedFraction).toBeLessThan(.002);
});
