import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); }; });
  await page.clock.install({ time: new Date('2026-10-07T00:00:00Z') }); await page.clock.pauseAt(new Date('2026-10-07T00:00:00.032Z'));
});
const saved = (page: Page) => page.evaluate(async () => { const { SaveStore } = await import('/src/persistence/save.ts' as string); return await new SaveStore().load(); });
async function seed(page: Page) {
  await page.goto('/'); await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string); const { beginGrowthRun, emptyInvestment } = await import('/src/core/growth.ts' as string);
    const { createBoss } = await import('/src/core/boss.ts' as string); const { enterNextRegion } = await import('/src/core/region.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string); const store = new SaveStore(); await store.load();
    const won = createDungeonRun(42); beginGrowthRun(won, emptyInvestment(), 'movement-unlock');
    for (let region = 1; region <= 3; region++) { won.expedition.room = 8; won.expedition.dungeon.rooms[8].visited = won.expedition.dungeon.rooms[8].cleared = true;
      won.boss = createBoss(won); won.boss.hp = 0; won.phase = 'cleared'; if (region < 3) enterNextRegion(won); }
    await store.save(won, defaultSettings()); const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'movement-browser', false, ['R26', 'R27']);
    s.expedition.room = 6; const room = s.expedition.dungeon.rooms[6]; room.visited = room.cleared = true; room.reward = { room: 6, candidates: ['R26', 'R27', 'R06'], choice: null };
    s.phase = 'cleared'; s.player.x = 80; s.player.y = 183; s.view = { yaw: 0, pitch: 0 }; await store.save(s, defaultSettings());
  }); await page.reload();
}
async function encounter(page: Page, claw = false) {
  await page.evaluate(async claw => {
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string); const store = new SaveStore(), r = await store.load(), s = r.run;
    s.expedition.room = 1; s.expedition.dungeon.rooms[1].visited = true; s.expedition.dungeon.rooms[1].structure = 0; s.phase = 'combat';
    s.player.x = claw ? 199 : 80; s.player.y = claw ? 120 : 183; s.view = { yaw: 0, pitch: 0 };
    s.enemies = [{ id: s.nextId++, kind: 'rat', x: 700, y: 183, hp: 30, maxHp: 30, angle: Math.PI, mode: 'move', timer: 0, targetX: s.player.x, targetY: s.player.y, flash: 0 }];
    await store.save(s, defaultSettings());
  }, claw); await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
}
async function rightClick(page: Page) {
  await page.locator('#world canvas').dispatchEvent('mousedown', { button: 2, bubbles: true });
  await page.locator('#world canvas').dispatchEvent('mouseup', { button: 2, bubbles: true }); await page.clock.runFor(120);
}
test('G05 unlocks the next real departure and a chosen anchor survives pause/reload, movement and an actual recall', async ({ page }) => {
  test.setTimeout(Math.max(test.info().timeout, 90000)); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await seed(page);
  await page.getByRole('button', { name: '영구 성장', exact: true }).click(); await expect(page.locator('[data-goal="G05"]')).toContainText('유랑자의 닻·거미 발톱 해금'); await page.locator('[data-action="close"]').click();
  await page.locator('[data-action="new"]').click(); await expect.poll(async () => (await saved(page)).run.growth.relicUnlocks).toEqual(expect.arrayContaining(['R26', 'R27']));
  await page.evaluate(async () => {
    const { SaveStore } = await import('/src/persistence/save.ts' as string); const store = new SaveStore(), r = await store.load(), s = r.run;
    s.expedition.room = 6; const room = s.expedition.dungeon.rooms[6]; room.visited = room.cleared = true; room.reward = { room: 6, candidates: ['R26', 'R27', 'R06'], choice: null };
    s.phase = 'cleared'; s.player.x = 80; s.player.y = 183; s.view = { yaw: 0, pitch: 0 }; await store.save(s, r.settings);
  }); await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.locator('[data-action="choose-R26"] .rarity-badge')).toContainText('희귀'); await page.locator('[data-action="choose-R26"]').click(); await page.clock.runFor(120);
  await encounter(page); await rightClick(page); await expect(page.locator('#anchor-status')).toContainText('우클릭 귀환'); await expect(page.locator('#aux')).toContainText('귀환 준비');
  await page.keyboard.press('Escape'); await expect.poll(async () => (await saved(page)).run.anchor?.id).toBeGreaterThan(0); const before = await saved(page);
  expect(before.run.player.auxCooldowns?.R26).toBeUndefined(); expect(before.profile.auxiliaryUsed).toEqual(['R26']); await page.clock.fastForward(5000); expect((await saved(page)).run).toEqual(before.run);
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click(); await page.clock.runFor(120); await expect(page.locator('#anchor-status')).toBeVisible();
  await page.keyboard.down('w'); await page.clock.runFor(800); await page.keyboard.up('w'); await page.screenshot({ path: 'graphics-review/movement/anchor-ready.png' });
  await rightClick(page); await expect(page.locator('#anchor-status')).toBeHidden(); await page.keyboard.press('Escape'); await expect.poll(async () => (await saved(page)).run.anchor).toBeUndefined();
  const recalled = await saved(page); expect(recalled.run.player.x).toBeCloseTo(before.run.anchor.x); expect(recalled.run.player.hp).toBe(100); expect(recalled.run.stats.dodges).toBe(0);
  expect(recalled.run.player.auxCooldowns.R26).toBeGreaterThan(570); expect(recalled.profile.auxiliaryUsed).toEqual(['R26']);
  await page.locator('[data-action="resume"]').click(); await rightClick(page); await expect(page.locator('#notice')).toContainText('유랑자의 닻이 아직 재사용');
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false); expect(errors).toEqual([]);
});
test('a chosen claw extends a real diagonal Shift dodge once and preserves the spent flag on reload', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await seed(page); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await page.locator('[data-action="choose-R27"]').click(); await page.clock.runFor(120); await encounter(page, true);
  await page.keyboard.down('w'); await page.keyboard.down('d'); await page.keyboard.press('Shift'); await page.clock.runFor(32); await page.keyboard.up('w'); await page.keyboard.up('d');
  await expect(page.locator('#passive-R27')).toContainText('이번 회피 사용'); await page.screenshot({ path: 'graphics-review/movement/wall-slide.png' });
  await page.keyboard.press('Escape'); await expect.poll(async () => (await saved(page)).run.player.clawUsed).toBe(true); const before = await saved(page);
  expect(before.run.player.y).toBeGreaterThan(160); expect(before.run.stats.dodges).toBe(1); expect(before.profile.auxiliaryUsed).toBeUndefined();
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click(); await page.clock.runFor(32); await page.keyboard.press('Escape');
  const after = await saved(page); expect(after.run.player.clawUsed).toBe(true); expect(after.run.player.y - before.run.player.y).toBeLessThan(15); expect(after.run.player.dodgeRemaining).toBeLessThan(before.run.player.dodgeRemaining);
  expect(after.run.player.invulnerable).toBe(0); expect(errors).toEqual([]);
});
test('the low-quality anchor shows its saved position, releases resources and both movement states fit a dense small HUD', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 480 }); await page.goto('/');
  await page.evaluate(async () => {
    const { World } = await import('/src/game/world.ts' as string); const { CombatHud } = await import('/src/game/hud.ts' as string);
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string); const { beginGrowthRun, emptyInvestment } = await import('/src/core/growth.ts' as string);
    const { grantRelic } = await import('/src/core/relic-acquisition.ts' as string); const { useAnchor, clearAnchor } = await import('/src/core/anchor.ts' as string);
    const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'movement-render', false, ['R26', 'R27']); grantRelic(s, 'R26'); grantRelic(s, 'R27');
    s.expedition.room = 1; s.expedition.dungeon.rooms[1].visited = true; s.expedition.dungeon.rooms[1].structure = 0; s.player.x = 180; s.player.y = 183;
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:0'; document.body.append(host);
    document.getElementById('world').style.display = 'none'; document.getElementById('overlay').hidden = true; document.getElementById('expedition').dataset.ui = ''; document.getElementById('expedition').style.zIndex = '1';
    const world = new World(host); world.setQuality(0); const hud = new CombatHud(); world.paint(s, 0, 0, false, true, { reducedMotion: true }); (window as any).movementPreview = { world, hud, s, useAnchor, clearAnchor };
  }); await page.waitForFunction(() => (window as any).movementPreview.world.weaponLoads.get('W01')?.loaded);
  const result = await page.evaluate(() => {
    const { world, hud, s, useAnchor, clearAnchor } = (window as any).movementPreview, paint = () => world.paint(s, 0, 0, false, true, { reducedMotion: true });
    paint(); const before = { ...world.renderer.info.memory }; useAnchor(s); paint(); const marker = world.scene.getObjectByName('anchor-marker'); let disposed = 0;
    marker.traverse((o: any) => { if (o.geometry) o.geometry.addEventListener('dispose', () => disposed++); }); const position = marker.position.toArray();
    clearAnchor(s); paint(); for (let i = 0; i < 5; i++) { useAnchor(s); paint(); clearAnchor(s); paint(); } const after = { ...world.renderer.info.memory }; useAnchor(s); s.player.x = 80;
    s.expedition.relics = s.expedition.acquired = ['R26', 'R27', 'R06', 'R09', 'R10', 'R14', 'R15', 'R19', 'R21', 'R22', 'R23', 'R29', 'R31', 'R32']; s.diceRerolls = 2;
    paint(); hud.update(s, { modal: '', yaw: 0, reducedMotion: true, mouseCaptured: true, noticeUntil: 0 }); return { before, after, disposed, position };
  });
  expect(result.position[0]).toBeCloseTo(-5.6); expect(result.position.slice(1)).toEqual([0, 0]); expect(result.disposed).toBeGreaterThan(0);
  expect(result.after.geometries).toBeLessThanOrEqual(result.before.geometries); expect(result.after.textures).toBeLessThanOrEqual(result.before.textures);
  await expect(page.locator('#anchor-status')).toBeInViewport({ ratio: 1 }); await expect(page.locator('#passive-R27')).toBeInViewport({ ratio: 1 }); await expect(page.locator('#anchor-status')).toContainText('4.0m');
  await expect(page.locator('#aux')).toContainText('귀환 준비'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'graphics-review/movement/small-hud.png' });
});
