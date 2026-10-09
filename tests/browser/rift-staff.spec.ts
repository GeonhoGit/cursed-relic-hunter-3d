import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); };
  });
});

test('staff is locked in a fresh camp, unlocks after the heart victory and preserves the continue weapon', async ({ page }) => {
  test.setTimeout(60000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-10-04T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-04T00:01:00Z')); await page.goto('/'); await page.clock.runFor(100);
  const click = async (name: string) => page.getByRole('button', { name, exact: name !== '탐험 이어하기' }).evaluate((el: HTMLElement) => el.click());
  const saved = () => page.evaluate(async () => {
    const { SaveStore } = await import('/src/persistence/save.ts' as string); return new SaveStore().load();
  });
  await click('출발 무기'); await expect(page.locator('.weapon-card')).toHaveCount(4);
  const staff = page.locator('[data-weapon="W04"]'); await expect(staff).toContainText('유물 심장 첫 처치 시 해금');
  await expect(staff.locator('dd').first()).toHaveText('12'); await expect(staff).toContainText('0.700초');
  await expect(page.getByRole('button', { name: '균열 지팡이 선택' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '산탄 성물 선택' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '관측자의 쇠뇌 선택' })).toBeDisabled();
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { createBoss } = await import('/src/core/boss.ts' as string);
    const { enterNextRegion } = await import('/src/core/region.ts' as string);
    const { beginGrowthRun, emptyInvestment } = await import('/src/core/growth.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const run = createDungeonRun(42); beginGrowthRun(run, emptyInvestment(), 'browser-staff-winner');
    for (let i = 0; i < 3; i++) {
      run.expedition.room = 8; const room = run.expedition.dungeon.rooms[8]; room.visited = room.cleared = true;
      run.boss = createBoss(run); run.boss.hp = 0; run.phase = 'cleared'; if (i < 2) enterNextRegion(run);
    }
    const store = new SaveStore(); await store.load(); await store.save(run, defaultSettings());
  });
  await page.reload(); await page.clock.runFor(100); await click('출발 무기');
  await expect(page.getByRole('button', { name: '균열 지팡이 선택' })).toBeEnabled();
  await expect(page.locator('[data-weapon="W04"]')).toContainText('유물 심장 처치 · 영구 해금 완료');
  await click('균열 지팡이 선택'); await click('선택 저장'); expect((await saved()).profile.selectedWeapon).toBe('W04');
  await page.reload(); await page.clock.runFor(100); await click('새 탐험 시작'); await page.clock.runFor(100);
  await expect(page.locator('#weapon-name')).toHaveText('균열 지팡이'); await expect(page.locator('#weapon-id')).toHaveText('W04 / RIFT STAFF');
  await page.locator('#pause-button').evaluate((el: HTMLElement) => el.click()); await click('저장하고 야영지로');
  const checkpoint = (await saved()).run; expect(checkpoint.weapon).toBe('W04');
  await click('출발 무기'); await click('유물 사수기 선택'); await click('선택 저장');
  expect((await saved()).profile.selectedWeapon).toBe('W01'); expect((await saved()).run).toEqual(checkpoint);
  await click('탐험 이어하기'); await page.clock.runFor(100); await expect(page.locator('#weapon-name')).toHaveText('균열 지팡이');
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false); expect(errors).toEqual([]);
});

test('pre-lock staff saves continue normally while a new departure falls back to the sidearm', async ({ page }) => {
  test.setTimeout(60000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { beginGrowthRun, emptyInvestment, defaultProfile } = await import('/src/core/growth.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const store = new SaveStore(); await store.load(); const run = createDungeonRun(42); run.weapon = 'W04';
    beginGrowthRun(run, emptyInvestment(), 'browser-legacy-staff');
    const record = { schema: 1, content: 'prototype-0.13', revision: 1, savedAt: new Date().toISOString(),
      run, profile: { ...defaultProfile(), selectedWeapon: 'W04' }, settings: defaultSettings() };
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('cursed-relic-hunter-3d-v1', 1); request.onsuccess = () => resolve(request.result); });
    await new Promise<void>(resolve => { const tx = db.transaction('save', 'readwrite'); tx.objectStore('save').put(record, 'current'); tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.clock.install({ time: new Date('2026-10-04T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-04T00:01:00Z')); await page.reload(); await page.clock.runFor(100);
  const click = async (name: string) => page.getByRole('button', { name, exact: name !== '탐험 이어하기' }).evaluate((el: HTMLElement) => el.click());
  await click('출발 무기'); await expect(page.getByRole('button', { name: '균열 지팡이 선택' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '유물 사수기 선택' })).toHaveAttribute('aria-pressed', 'true');
  await click('야영지로 돌아가기'); await click('탐험 이어하기'); await page.clock.runFor(100);
  await expect(page.locator('#weapon-name')).toHaveText('균열 지팡이');
  await page.locator('#pause-button').evaluate((el: HTMLElement) => el.click()); await click('저장하고 야영지로');
  await page.reload(); await page.clock.runFor(100); await click('탐험 이어하기'); await page.clock.runFor(100);
  await expect(page.locator('#weapon-name')).toHaveText('균열 지팡이');
  await page.locator('#pause-button').evaluate((el: HTMLElement) => el.click()); await click('저장하고 야영지로');
  await click('새 탐험 시작'); await page.clock.runFor(100); await expect(page.locator('#weapon-name')).toHaveText('유물 사수기');
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false); expect(errors).toEqual([]);
});

test('staff crystal, spell and flash render distinctly and repeated weapon changes release projectile resources', async ({ page }) => {
  test.setTimeout(180000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(async () => {
    const { World } = await import('/src/game/world.ts' as string);
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const host = document.createElement('div'); host.id = 'staff-preview';
    host.style.cssText = 'position:fixed;inset:0;width:640px;height:400px;z-index:9999'; document.body.append(host);
    const world = new World(host), run = createDungeonRun(42);
    await new Promise(requestAnimationFrame); world.paint(run, -Math.PI / 2, 0, false, false);
    (window as any).staffPreview = { world, run }; document.getElementById('overlay')!.hidden = true;
  });
  const result = await page.evaluate(async () => {
    const { world, run } = (window as any).staffPreview;
    const { step, emptyInput } = await import('/src/core/simulation.ts' as string);
    // Permanent weapon meshes are uploaded only on their first visible frame.
    // Warm every model and flash before measuring allocations from transient shots.
    for (const id of ['W01', 'W02', 'W03', 'W04']) {
      run.weapon = id; run.cues = []; run.bullets = []; run.player.fireCooldown = 0;
      world.paint(run, -Math.PI / 2, 0, false, false);
      await new Promise<void>(resolve => {
        const check = () => world.weaponViews[id].getObjectByName('weapon-model') ? resolve() : setTimeout(check, 25);
        check();
      });
      step(run, { ...emptyInput(run), fire: true, aimX: run.player.x, aimY: run.player.y - 150, aimPitch: 0 });
      world.paint(run, -Math.PI / 2, 0, false, false);
    }
    run.weapon = 'W01'; run.bullets = []; run.cues = [];
    world.paint(run, -Math.PI / 2, 0, false, false); const before = { ...world.renderer.info.memory };
    let crystal = false, color = 0, flash = false, weapons = [];
    for (let repeat = 0; repeat < 3; repeat++) {
      for (const id of ['W01', 'W02', 'W03', 'W04']) {
        run.weapon = id; run.cues = []; run.bullets = []; run.player.fireCooldown = 0;
        step(run, { ...emptyInput(run), fire: true, aimX: run.player.x, aimY: run.player.y - 150, aimPitch: 0 });
        world.paint(run, -Math.PI / 2, 0, false, false);
        const visible = world.gun.children.filter((o: any) => o.visible && o.name.startsWith('weapon-'));
        if (repeat === 0) weapons.push({ id, names: visible.map((o: any) => o.name), count: visible.length });
        if (id === 'W04') {
          crystal = !!world.weaponViews.W04.getObjectByName('floating_rift_crystal'); flash = world.staffFlash.visible;
          const b = run.bullets[0]; color = world.entities.get(`bullet-${b.id}`).children[0].material.color.getHex();
        }
      }
      run.weapon = 'W01'; run.bullets = []; run.cues = []; world.paint(run, -Math.PI / 2, 0, false, false);
    }
    const after = { ...world.renderer.info.memory };
    run.weapon = 'W04'; run.cues = []; world.paint(run, -Math.PI / 2, 0, false, false);
    return { before, after, crystal, color, flash, weapons, locked: !!document.pointerLockElement };
  });
  expect(result.crystal).toBe(true); expect(result.flash).toBe(true); expect(result.color).toBe(0xcdabf5);
  expect(result.weapons.find(w => w.id === 'W04')?.names).toEqual(['weapon-W04']);
  expect(result.weapons.find(w => w.id === 'W03')?.names).toEqual(['weapon-W03']);
  expect(result.after.geometries).toBeLessThanOrEqual(result.before.geometries + 1);
  expect(result.after.textures).toBeLessThanOrEqual(result.before.textures + 1);
  expect(result.locked).toBe(false); expect(errors).toEqual([]);
  await page.locator('#staff-preview').screenshot({ path: 'test-results/rift-staff.png' });
});
