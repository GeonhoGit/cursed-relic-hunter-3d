import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); }; });
  await page.clock.install({ time: new Date('2026-10-08T00:00:00Z') }); await page.clock.pauseAt(new Date('2026-10-08T00:00:00.032Z'));
});
const saved = (page: Page) => page.evaluate(async () => { const { SaveStore } = await import('/src/persistence/save.ts' as string); return await new SaveStore().load(); });
async function seed(page: Page) {
  await page.goto('/'); await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string); const { beginGrowthRun, emptyInvestment } = await import('/src/core/growth.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string); const store = new SaveStore(); await store.load();
    const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'feather-browser'); s.expedition.room = 6; const r = s.expedition.dungeon.rooms[6];
    r.visited = r.cleared = true; r.reward = { room: 6, candidates: ['R24', 'R06', 'R23'], choice: null }; s.phase = 'cleared'; s.player.x = 80; s.player.y = 183; s.view = { yaw: 0, pitch: 0 };
    await store.save(s, defaultSettings());
  }); await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.locator('[data-action="choose-R24"] .rarity-badge')).toContainText('영웅'); await page.locator('[data-action="choose-R24"]').click(); await page.clock.runFor(120);
}
test('a chosen epic feather evacuates after a real hit once, explains the effect, and cannot refill through pause/reload', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await seed(page);
  await expect(page.locator('#passive-R24')).toContainText('준비 1/1'); await page.evaluate(async () => {
    const { SaveStore } = await import('/src/persistence/save.ts' as string); const store = new SaveStore(), r = await store.load(), s = r.run;
    s.expedition.room = 1; s.expedition.dungeon.rooms[1].visited = true; s.expedition.dungeon.rooms[1].structure = 0; s.phase = 'combat'; s.player.x = 80; s.player.y = 183;
    s.enemies = [{ id: s.nextId++, kind: 'rat', x: 80, y: 183, hp: 30, maxHp: 30, angle: 0, mode: 'move', timer: 0, targetX: 80, targetY: 183, flash: 0 }]; await store.save(s, r.settings);
  }); await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click(); await page.clock.runFor(120);
  await expect(page.locator('#notice')).toContainText('대피의 깃털 발동'); await expect(page.locator('#passive-R24')).toContainText('남은 기회 0/1'); await expect(page.locator('#hp')).toHaveText('94');
  await page.screenshot({ path: 'graphics-review/evacuation/used.png' }); await page.keyboard.press('Escape'); await expect.poll(async () => (await saved(page)).run.expedition.dungeon.rooms[1].featherUsed).toBe(true);
  const before = await saved(page), gap = Math.hypot(before.run.player.x - 80, before.run.player.y - 183); expect(gap).toBeGreaterThanOrEqual(80 - .001); expect(gap).toBeLessThanOrEqual(120 + .001);
  expect(before.run.stats.hits).toBe(1); expect(before.profile.auxiliaryUsed).toBeUndefined(); await page.clock.fastForward(5000); expect((await saved(page)).run).toEqual(before.run);
  await page.evaluate(async () => {
    const { SaveStore } = await import('/src/persistence/save.ts' as string); const store = new SaveStore(), r = await store.load(), s = r.run;
    s.player.invulnerable = 0; s.enemies[0].x = s.player.x; s.enemies[0].y = s.player.y; await store.save(s, r.settings);
  }); await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click(); await page.clock.runFor(120); await expect(page.locator('#hp')).toHaveText('88');
  await expect(page.locator('#passive-R24')).toContainText('남은 기회 0/1'); await page.keyboard.press('Escape'); const after = await saved(page);
  expect(after.run.player.x).toBe(before.run.player.x); expect(after.run.player.y).toBe(before.run.player.y); expect(after.run.stats.hits).toBe(2);
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false); expect(errors).toEqual([]);
});
test('low-quality escape marks keep both endpoints, expire without leaking resources and show a dense short HUD allowance', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await page.setViewportSize({ width: 640, height: 480 }); await page.goto('/');
  await page.evaluate(async () => {
    const { World } = await import('/src/game/world.ts' as string); const { CombatHud } = await import('/src/game/hud.ts' as string);
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string); const { beginGrowthRun, emptyInvestment } = await import('/src/core/growth.ts' as string);
    const { grantRelic } = await import('/src/core/relic-acquisition.ts' as string); const { evacuateOnHurt } = await import('/src/core/evacuation.ts' as string);
    const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'feather-render'); grantRelic(s, 'R24'); s.expedition.room = 1; s.expedition.dungeon.rooms[1].visited = true;
    s.expedition.dungeon.rooms[1].structure = 0; s.phase = 'combat'; s.player.x = 80; s.player.y = 183;
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:0'; document.body.append(host);
    document.getElementById('world').style.display = 'none'; document.getElementById('overlay').hidden = true; document.getElementById('expedition').dataset.ui = ''; document.getElementById('expedition').style.zIndex = '1';
    const world = new World(host); world.setQuality(0); const hud = new CombatHud(); world.paint(s, 0, 0, false, true, { reducedMotion: true }); (window as any).featherPreview = { s, world, hud, evacuateOnHurt };
  }); await page.waitForFunction(() => (window as any).featherPreview.world.weaponLoads.get('W01')?.loaded);
  const result = await page.evaluate(() => {
    const { s, world, hud, evacuateOnHurt } = (window as any).featherPreview, paint = () => world.paint(s, 0, 0, false, true, { reducedMotion: true }); paint();
    const before = { ...world.renderer.info.memory }; evacuateOnHurt(s, 6); s.player.x = 80; paint(); const cue = s.cues.find((c: any) => c.kind === 'evade'), marker = world.scene.getObjectByName('evacuation-trace');
    let disposed = 0; marker.traverse((o: any) => { if (o.geometry) o.geometry.addEventListener('dispose', () => disposed++); });
    const from = marker.position.toArray(), destination = marker.getObjectByName('escape-destination').position.toArray(), delta = [cue.end.x - cue.x, cue.end.y - cue.y];
    // Keep the camera pose fixed: moving it can upload newly visible permanent room geometry.
    s.tick += 30; paint(); for (let i = 0; i < 5; i++) { s.cues = []; delete s.expedition.dungeon.rooms[1].featherUsed; s.player.x = 80; s.player.y = 183; evacuateOnHurt(s, 6); s.player.x = 80; s.player.y = 183; paint(); s.tick += 30; paint(); }
    const after = { ...world.renderer.info.memory }; s.expedition.relics = s.expedition.acquired = ['R24', 'R06', 'R09', 'R10', 'R14', 'R15', 'R19', 'R21', 'R22', 'R23', 'R27', 'R29', 'R31', 'R32']; s.diceRerolls = 2;
    hud.update(s, { modal: '', yaw: 0, reducedMotion: true, mouseCaptured: true, noticeUntil: 0 }); return { before, after, disposed, from, destination, delta };
  });
  expect(result.from[0]).toBeCloseTo(-9.6); expect(result.from.slice(1)).toEqual([0, 0]); expect(result.destination[0]).toBeCloseTo(result.delta[0] * .04); expect(result.destination[2]).toBeCloseTo(result.delta[1] * .04);
  expect(result.disposed).toBeGreaterThan(0); expect(result.after.geometries).toBeLessThanOrEqual(result.before.geometries); expect(result.after.textures).toBeLessThanOrEqual(result.before.textures);
  await expect(page.locator('#passive-R24')).toBeInViewport({ ratio: 1 }); await expect(page.locator('#passive-R24')).toContainText('남은 기회 0/1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await page.screenshot({ path: 'graphics-review/evacuation/small-hud.png' }); expect(errors).toEqual([]);
});
