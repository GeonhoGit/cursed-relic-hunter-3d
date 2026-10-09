import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); }; });
  await page.clock.install({ time: new Date('2026-10-06T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-06T00:00:00.032Z'));
});
const saved = (page: Page) => page.evaluate(async () => {
  const { SaveStore } = await import('/src/persistence/save.ts' as string); return (await new SaveStore().load()).run;
});
async function seed(page: Page, pending: boolean) {
  await page.goto('/'); await page.evaluate(async pending => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { beginGrowthRun, emptyInvestment } = await import('/src/core/growth.ts' as string);
    const { createBoss } = await import('/src/core/boss.ts' as string);
    const { grantRelic } = await import('/src/core/relic-acquisition.ts' as string);
    const { BOUNDS } = await import('/src/core/model.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const store = new SaveStore(); await store.load();
    const prior = createDungeonRun(42); beginGrowthRun(prior, emptyInvestment(), 'wall-boss-unlock'); prior.expedition.room = 8;
    prior.expedition.dungeon.rooms[8].visited = prior.expedition.dungeon.rooms[8].cleared = true;
    prior.boss = createBoss(prior); prior.boss.hp = 0; prior.phase = 'cleared'; await store.save(prior, defaultSettings());
    const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'wall-browser', false, ['R16']);
    const room = s.expedition.dungeon.rooms[6]; room.visited = room.cleared = true;
    room.reward = { room: 6, candidates: ['R16', 'R06', 'R23'], choice: pending ? null : 'R16' };
    if (pending) { s.expedition.room = 6; s.phase = 'cleared'; s.player.x = 80; s.player.y = 183; s.view = { yaw: 0, pitch: 0 }; }
    else {
      const other = s.expedition.dungeon.rooms[7]; other.visited = other.cleared = true; other.reward = { room: 7, candidates: ['R13'], choice: 'R13' };
      grantRelic(s, 'R13'); grantRelic(s, 'R16'); s.player.x = 320; s.player.y = BOUNDS.y + 100; s.view = { yaw: -Math.PI / 2, pitch: 0 };
    }
    await store.save(s, defaultSettings());
  }, pending); await page.reload();
}
async function rightClick(page: Page) {
  await page.locator('#world canvas').dispatchEvent('mousedown', { button: 2, bubbles: true });
  await page.locator('#world canvas').dispatchEvent('mouseup', { button: 2, bubbles: true }); await page.clock.runFor(240);
}
test('real relic selection equips masonry, right-click places collision, and pause/reload retains durability and cooldown', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await seed(page, true);
  await page.getByRole('button', { name: '영구 성장', exact: true }).click(); await expect(page.locator('[data-goal="G03"]')).toContainText('석공의 손 해금');
  await page.locator('[data-action="close"]').click(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await page.locator('[data-action="choose-R16"]').click(); await page.clock.runFor(120);
  await expect(page.locator('#aux')).toContainText('석공의 손 · 준비됨'); await rightClick(page);
  await expect(page.locator('#stone-status')).toContainText('돌벽 40/40'); await expect(page.locator('#aux')).toContainText('석공의 손 · 9.');
  await page.keyboard.press('Escape'); await expect(page.locator('#overlay')).toBeVisible();
  await expect.poll(async () => (await saved(page)).stoneWall?.hp).toBe(40); const before = await saved(page);
  await page.clock.fastForward(5000); expect((await saved(page)).stoneWall).toEqual(before.stoneWall);
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click(); await page.clock.runFor(120);
  await expect(page.locator('#stone-status')).toContainText('돌벽 40/40'); await page.keyboard.down('w'); await page.clock.runFor(600); await page.keyboard.up('w');
  await page.keyboard.press('Escape'); await expect.poll(async () => (await saved(page)).tick).toBeGreaterThan(before.tick);
  const after = await saved(page); expect(after.player.x).toBeCloseTo(149, 4); expect(after.stoneWall.hp).toBe(40);
  expect(after.player.auxCooldowns.R16).toBeLessThan(before.player.auxCooldowns.R16); expect(after.stoneWall.id).toBe(before.stoneWall.id);
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false); expect(errors).toEqual([]);
});
test('unsafe placement explains its rejection and swapping real auxiliary cards never resets recharge', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await seed(page, false); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await page.keyboard.press('i'); await page.getByRole('button', { name: '석공의 손 장착', exact: true }).click(); await page.locator('[data-action="close"]').click();
  await rightClick(page); await expect(page.locator('#notice')).toContainText('출구 앞'); await page.keyboard.press('Escape');
  const before = await saved(page); expect(before.stoneWall).toBeUndefined(); expect(before.player.auxCooldowns).toBeUndefined();
  await page.evaluate(async () => {
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string); const store = new SaveStore(); const r = await store.load();
    r.run.player.x = 80; r.run.player.y = 183; r.run.view = { yaw: 0, pitch: 0 }; await store.save(r.run, defaultSettings());
  });
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click(); await rightClick(page); await page.keyboard.press('i');
  await page.getByRole('button', { name: '시한 화약 장착', exact: true }).click(); const cooldown = (await saved(page)).player.auxCooldowns.R16;
  await page.getByRole('button', { name: '석공의 손 장착', exact: true }).click(); expect((await saved(page)).player.auxCooldowns.R16).toBe(cooldown);
  await page.locator('[data-action="close"]').click(); await page.clock.runFor(100); await expect(page.locator('#aux')).toContainText('석공의 손 · 9.');
  await expect(page.locator('#stone-status')).toContainText('돌벽 40/40'); expect(errors).toEqual([]);
});
test('low-quality wall matches its collision dimensions, exposes health, releases graphics and fits the short HUD', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await page.setViewportSize({ width: 640, height: 480 }); await page.goto('/');
  await page.evaluate(async () => {
    const { World } = await import('/src/game/world.ts' as string);
    const { CombatHud } = await import('/src/game/hud.ts' as string); const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { beginGrowthRun, emptyInvestment } = await import('/src/core/growth.ts' as string); const { grantRelic } = await import('/src/core/relic-acquisition.ts' as string);
    const { useAuxiliary } = await import('/src/core/auxiliary.ts' as string);
    const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'wall-render', false, ['R16']); grantRelic(s, 'R16'); s.player.x = 80; s.player.y = 183;
    const host = document.createElement('div'); host.id = 'masonry-preview'; host.style.cssText = 'position:fixed;inset:0;z-index:0'; document.body.append(host);
    document.getElementById('overlay').hidden = true; document.getElementById('world').style.display = 'none'; document.getElementById('expedition').hidden = false;
    document.getElementById('expedition').style.zIndex = '1'; document.getElementById('expedition').dataset.ui = '';
    const world = new World(host); world.setQuality(0); const hud = new CombatHud();
    world.paint(s, 0, 0, false, true, { reducedMotion: true }); (window as any).masonryPreview = { world, hud, s, useAuxiliary };
  });
  await page.waitForFunction(() => (window as any).masonryPreview.world.weaponLoads.get('W01')?.loaded);
  const result = await page.evaluate(() => {
    const { world, hud, s, useAuxiliary } = (window as any).masonryPreview;
    const paint = () => world.paint(s, 0, 0, false, true, { reducedMotion: true }); paint(); const before = { ...world.renderer.info.memory };
    if (!useAuxiliary(s, { x: 160, y: 183 })) throw new Error('Expected wall installation'); paint();
    const wall = world.scene.getObjectByName('masonry-wall'), mesh = wall.children[0]; mesh.geometry.computeBoundingBox();
    const size = mesh.geometry.boundingBox.getSize(mesh.position.clone()).toArray(); const center = wall.position.toArray();
    s.stoneWall.hp = 20; s.stoneWall.ticks = 120; paint(); const bar = world.scene.getObjectByName('masonry-durability');
    const health = { hp: bar.userData.hp, ticks: bar.userData.ticks, scale: bar.children[0].scale.x };
    let disposed = 0; wall.traverse((o: any) => { if (o.geometry) o.geometry.addEventListener('dispose', () => disposed++); });
    for (let i = 0; i < 5; i++) { delete s.stoneWall; delete s.player.auxCooldowns; paint(); useAuxiliary(s, { x: 160, y: 183 }); paint(); }
    delete s.stoneWall; paint(); const after = { ...world.renderer.info.memory };
    delete s.player.auxCooldowns; useAuxiliary(s, { x: 160, y: 183 });
    s.expedition.relics = s.expedition.acquired = ['R16', 'R06', 'R09', 'R10', 'R14', 'R15', 'R19', 'R21', 'R22', 'R23', 'R29', 'R31', 'R32']; s.diceRerolls = 2;
    paint(); hud.update(s, { modal: '', yaw: 0, reducedMotion: true, mouseCaptured: true, noticeUntil: 0 }); return { size, center, health, disposed, before, after };
  });
  expect(result.size[0]).toBeCloseTo(.32, 4); expect(result.size[1]).toBeCloseTo(2.4, 4); expect(result.size[2]).toBeCloseTo(1.92, 4);
  expect(result.center).toEqual([-6.4, 0, 0]); expect(result.health).toEqual({ hp: 20, ticks: 120, scale: .5 }); expect(result.disposed).toBeGreaterThan(0);
  expect(result.after.geometries).toBeLessThanOrEqual(result.before.geometries + 1); expect(result.after.textures).toBeLessThanOrEqual(result.before.textures + 1);
  await expect(page.locator('#stone-status')).toBeInViewport({ ratio: 1 }); await expect(page.locator('#passive-status')).toBeInViewport({ ratio: 1 });
  const layout = await page.locator('.abilities').evaluate(el => ({ fits: el.scrollWidth <= el.clientWidth + 1,
    belowMap: el.getBoundingClientRect().top >= document.querySelector('.mini-map')!.getBoundingClientRect().bottom,
    childrenFit: [...document.querySelectorAll('#passive-status span')].every(c => c.scrollWidth <= c.clientWidth + 1) }));
  expect(layout).toEqual({ fits: true, belowMap: true, childrenFit: true });
  await page.screenshot({ path: 'graphics-review/masonry/wall-small.png' }); expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false);
  await page.evaluate(() => { (window as any).masonryPreview.world.renderer.dispose(); }); expect(errors).toEqual([]);
});
