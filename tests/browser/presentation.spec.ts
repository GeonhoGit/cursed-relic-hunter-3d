import { expect, test, type Page } from '@playwright/test';
test.use({ viewport: { width: 960, height: 600 } });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); };
  });
});
async function saved(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const q = indexedDB.open('cursed-relic-hunter-3d-v1', 1); q.onsuccess = () => resolve(q.result); });
    const record = await new Promise<any>(resolve => { const q = db.transaction('save').objectStore('save').get('current'); q.onsuccess = () => resolve(q.result); });
    db.close(); return record;
  });
}
async function controlledClock(page: Page) {
  await page.clock.install({ time: new Date('2026-10-05T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-05T00:00:00.032Z'));
  await page.goto('/');
}

test('graphics options save without losing the current run, show measured FPS and restore after reload', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await controlledClock(page); await page.getByRole('button', { name: '새 탐험 시작' }).click();
  await expect(page.locator('#overlay')).toBeHidden();
  await page.keyboard.press('Escape'); const before = (await saved(page)).run;
  await expect(page.getByRole('heading', { name: '잠시 숨을 고릅니다.' })).toBeVisible();
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('combobox', { name: '최대 FPS' }).selectOption('30');
  await page.getByRole('checkbox', { name: 'FPS 표시', exact: true }).check();
  await page.getByRole('checkbox', { name: '효과 감소', exact: true }).check();
  await expect(page.locator('#settings-status')).toHaveText('설정 저장됨');
  await expect.poll(async () => (await saved(page)).settings).toMatchObject({ fps: 30, showFps: true, reducedMotion: true });
  expect((await saved(page)).run.tick).toBe(before.tick);
  await page.screenshot({ path: 'graphics-review/performance/settings.png' });
  await expect(page.locator('#fps-counter')).toBeVisible();
  await page.clock.runFor(600);
  await expect.poll(async () => Number((await page.locator('#fps-counter').textContent())?.match(/\d+/)?.[0])).toBeGreaterThan(0);
  await page.reload(); await page.getByRole('button', { name: '설정', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '최대 FPS' })).toHaveValue('30');
  await expect(page.getByRole('checkbox', { name: 'FPS 표시', exact: true })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: '효과 감소', exact: true })).toBeChecked();
  await page.getByRole('checkbox', { name: 'FPS 표시', exact: true }).uncheck();
  await expect(page.locator('#fps-counter')).toBeHidden();
  expect(errors).toEqual([]);
});

test('sustained slow frames pause and save; graphics settings return to the warning and resume clears input debt', async ({ page }) => {
  await controlledClock(page); await page.getByRole('button', { name: '새 탐험 시작' }).click();
  await expect(page.locator('#overlay')).toBeHidden();
  await page.evaluate(() => {
    // Wrap the clock's RAF after installation so only the elapsed-time boundary is controlled.
    const raf = window.requestAnimationFrame.bind(window); let offset = 0;
    (window as any).frameDelay = 120;
    window.requestAnimationFrame = callback => raf(now => {
      offset += (window as any).frameDelay; callback(now + offset);
    });
  });
  await page.clock.runFor(400);
  await expect(page.getByRole('heading', { name: '프레임 저하로 탐험을 멈췄습니다.' })).toBeVisible();
  await expect(page.locator('#save-status')).toHaveText('탐험 저장됨');
  const frozen = (await saved(page)).run;
  await page.screenshot({ path: 'graphics-review/performance/overload-pause.png' });
  await page.clock.runFor(100); await page.keyboard.press('Tab');
  await expect(page.getByRole('heading', { name: '프레임 저하로 탐험을 멈췄습니다.' })).toBeVisible();
  expect((await saved(page)).run.tick).toBe(frozen.tick);
  await page.getByRole('button', { name: '그래픽 설정' }).click();
  await page.getByRole('checkbox', { name: '효과 감소', exact: true }).check();
  await expect(page.locator('#settings-status')).toHaveText('설정 저장됨');
  await page.getByRole('button', { name: '돌아가기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '프레임 저하로 탐험을 멈췄습니다.' })).toBeVisible();
  await page.evaluate(() => { (window as any).frameDelay = 0; });
  await page.getByRole('button', { name: '전투 재개', exact: true }).click();
  await expect(page.locator('#overlay')).toBeHidden();
  await page.clock.runFor(100); await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '잠시 숨을 고릅니다.' })).toBeVisible();
  await expect(page.locator('#save-status')).toHaveText('탐험 저장됨');
  await expect.poll(async () => (await saved(page)).run.tick).toBeGreaterThan(frozen.tick);
});

test('effect reduction removes decorative flashes and particles while keeping attack warnings and interpolated bodies', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { World } = await import('/src/game/world.ts' as string);
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { captureMotion, interpolateMotion } = await import('/src/game/render-motion.ts' as string);
    const s = createDungeonRun(42); s.expedition.room = 1; s.phase = 'combat';
    s.tick = 10; s.player.x = 100; s.player.y = 280; s.player.fireCooldown = 30;
    s.enemies = [{ id: 99, kind: 'archer', x: 200, y: 200, hp: 40, maxHp: 40, angle: 0,
      mode: 'windup', timer: 10, targetX: 100, targetY: 280, flash: 0 }];
    s.cues = [{ id: 101, kind: 'shot', tick: 10, x: 100, y: 280, amount: 1 }, { id: 102, kind: 'hit', tick: 10, x: 200, y: 200, amount: 7 }];
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;width:640px;height:400px'; document.body.append(host);
    const world = new World(host); await new Promise(requestAnimationFrame);
    world.paint(s, 0, 0, true, false);
    const normal = { muzzle: world.muzzle.visible, dust: world.dust.visible, particle: world.entities.has('cue-102'), bloom: world.bloom.enabled, bob: world.camera.position.y };
    const previous = captureMotion(s); s.tick++; s.player.x = 104; s.enemies[0].x = 206;
    world.paint(s, 0, 0, true, false, { reducedMotion: true, motion: interpolateMotion(s, previous, .5) });
    const reduced = { muzzle: world.muzzle.visible, dust: world.dust.visible, particle: world.entities.has('cue-102'), bloom: world.bloom.enabled,
      cameraX: world.camera.position.x, bob: world.camera.position.y, enemyX: world.entities.get('enemy-99').position.x,
      tells: [...world.entities.keys()].filter((key: string) => key.startsWith('tell-')).length };
    world.paint(s, 0, 0, true, false, { reducedMotion: false });
    const restored = world.muzzle.visible && world.dust.visible && world.bloom.enabled && world.entities.has('cue-102');
    host.remove(); return { normal, reduced, restored, tick: s.tick, x: s.player.x };
  });
  expect(result.normal).toMatchObject({ muzzle: true, dust: true, particle: true, bloom: true });
  expect(result.reduced).toMatchObject({ muzzle: false, dust: false, particle: false, bloom: false, tells: 1 });
  expect(result.reduced.cameraX).toBeCloseTo(-8.72); expect(result.reduced.enemyX).toBeCloseTo(-4.68);
  expect(result.reduced.bob).toBeCloseTo(1.36); expect(result.normal.bob).not.toBeCloseTo(1.36, 5);
  expect(result.restored).toBe(true); expect(result.tick).toBe(11); expect(result.x).toBe(104);
});
