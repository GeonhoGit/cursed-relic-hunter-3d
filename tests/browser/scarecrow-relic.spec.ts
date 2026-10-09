import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); }; });
  await page.clock.install({ time: new Date('2026-10-07T00:00:00Z') }); await page.clock.pauseAt(new Date('2026-10-07T00:00:00.032Z'));
});
const saved = (page: Page) => page.evaluate(async () => {
  const { SaveStore } = await import('/src/persistence/save.ts' as string); return await new SaveStore().load();
});
async function seed(page: Page) {
  await page.goto('/'); await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { beginGrowthRun, emptyInvestment } = await import('/src/core/growth.ts' as string);
    const { createBoss } = await import('/src/core/boss.ts' as string); const { enterNextRegion } = await import('/src/core/region.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string); const store = new SaveStore(); await store.load();
    const prior = createDungeonRun(42); beginGrowthRun(prior, emptyInvestment(), 'lure-unlock'); prior.expedition.room = 8;
    prior.expedition.dungeon.rooms[8].visited = prior.expedition.dungeon.rooms[8].cleared = true; prior.boss = createBoss(prior); prior.boss.hp = 0; prior.phase = 'cleared';
    enterNextRegion(prior); prior.expedition.room = 8; prior.expedition.dungeon.rooms[8].visited = prior.expedition.dungeon.rooms[8].cleared = true;
    prior.boss = createBoss(prior); prior.boss.hp = 0; prior.phase = 'cleared'; await store.save(prior, defaultSettings());
    const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'lure-browser', false, ['R18']); s.expedition.room = 6;
    const room = s.expedition.dungeon.rooms[6]; room.visited = room.cleared = true; room.reward = { room: 6, candidates: ['R18', 'R06', 'R23'], choice: null };
    s.phase = 'cleared'; s.player.x = 80; s.player.y = 183; s.view = { yaw: 0, pitch: 0 }; await store.save(s, defaultSettings());
  }); await page.reload();
}
async function encounter(page: Page, blocked = false) {
  await page.evaluate(async blocked => {
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string); const store = new SaveStore(), r = await store.load(), s = r.run;
    s.expedition.room = 1; s.expedition.dungeon.rooms[1].visited = true; s.expedition.dungeon.rooms[1].structure = 0; s.phase = 'combat';
    s.player.x = blocked ? 180 : 80; s.player.y = blocked ? 120 : 183; s.view = { yaw: 0, pitch: 0 };
    s.enemies = [{ id: s.nextId++, kind: 'rat', x: 700, y: 183, hp: 30, maxHp: 30, angle: Math.PI, mode: 'move', timer: 0, targetX: s.player.x, targetY: s.player.y, flash: 0 }];
    await store.save(s, defaultSettings());
  }, blocked); await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
}
async function rightClick(page: Page) {
  await page.locator('#world canvas').dispatchEvent('mousedown', { button: 2, bubbles: true });
  await page.locator('#world canvas').dispatchEvent('mouseup', { button: 2, bubbles: true }); await page.clock.runFor(240);
}
test('real rare selection installs a lure, saves successful use and resumes the same timer and enemy target after pause/reload', async ({ page }) => {
  test.setTimeout(Math.max(test.info().timeout, 90000)); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await seed(page);
  await page.getByRole('button', { name: '영구 성장', exact: true }).click(); await expect(page.locator('[data-goal="G04"]')).toContainText('허수아비 인형 해금');
  await page.locator('[data-action="close"]').click(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.locator('[data-action="choose-R18"] .rarity-badge')).toContainText('희귀'); await page.locator('[data-action="choose-R18"]').click(); await page.clock.runFor(120);
  await expect(page.locator('#aux')).toContainText('허수아비 인형 · 준비됨'); await encounter(page); await rightClick(page);
  await expect(page.locator('#decoy-status')).toContainText('허수아비 30/30'); await page.screenshot({ path: 'graphics-review/scarecrow/installed.png' });
  await page.keyboard.press('Escape'); await expect.poll(async () => (await saved(page)).run.decoy?.ticks).toBeGreaterThan(0); const before = await saved(page);
  expect(before.run.enemies[0].targetId).toBe(before.run.decoy.id); expect(before.run.enemies).toHaveLength(1); expect(before.profile.auxiliaryUsed).toEqual(['R18']);
  await page.clock.fastForward(5000); expect((await saved(page)).run).toEqual(before.run); await page.reload();
  await page.getByRole('button', { name: '탐험 이어하기' }).click(); await page.clock.runFor(120); await expect(page.locator('#decoy-status')).toBeVisible();
  await page.clock.runFor(5100); await expect(page.locator('#decoy-status')).toBeHidden(); await page.keyboard.press('Escape');
  await expect.poll(async () => (await saved(page)).run.decoy).toBeUndefined(); const after = await saved(page);
  expect(after.run.phase).toBe('combat'); expect(after.run.enemies).toHaveLength(1); expect(after.run.stats.kills).toBe(0); expect(after.run.player.auxCooldowns.R18).toBeGreaterThan(0);
  expect(after.profile.auxiliaryUsed).toEqual(['R18']); expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false); expect(errors).toEqual([]);
});
test('an occluded placement gives a reason without charging or recording progress and combat equipment is disabled', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await seed(page); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await page.locator('[data-action="choose-R18"]').click(); await page.clock.runFor(120); await encounter(page, true); await rightClick(page);
  await expect(page.locator('#notice')).toContainText('벽'); await page.keyboard.press('Escape'); const r = await saved(page);
  expect(r.run.decoy).toBeUndefined(); expect(r.run.player.auxCooldowns).toBeUndefined(); expect(r.profile.auxiliaryUsed).toBeUndefined();
  await page.locator('[data-action="resume"]').click(); await page.keyboard.press('i'); await expect(page.getByRole('button', { name: '허수아비 인형 장착', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '허수아비 인형 장착', exact: true }).locator('..')).toContainText('재사용 12초'); expect(errors).toEqual([]);
});
test('a low-quality lure has the physical body height and health bar, fits the short HUD and releases resources repeatedly', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await page.setViewportSize({ width: 640, height: 480 }); await page.goto('/');
  await page.evaluate(async () => {
    const { World } = await import('/src/game/world.ts' as string); const { CombatHud } = await import('/src/game/hud.ts' as string);
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string); const { beginGrowthRun, emptyInvestment } = await import('/src/core/growth.ts' as string);
    const { grantRelic } = await import('/src/core/relic-acquisition.ts' as string); const { placeScarecrow, clearScarecrow } = await import('/src/core/scarecrow.ts' as string);
    const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'lure-render', false, ['R18']); grantRelic(s, 'R18'); s.expedition.room = 1;
    s.expedition.dungeon.rooms[1].visited = true; s.expedition.dungeon.rooms[1].structure = 0; s.phase = 'combat'; s.player.x = 80; s.player.y = 183;
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:0'; document.body.append(host);
    document.getElementById('world').style.display = 'none'; document.getElementById('overlay').hidden = true; document.getElementById('expedition').dataset.ui = '';
    document.getElementById('expedition').style.zIndex = '1'; const world = new World(host); world.setQuality(0); const hud = new CombatHud();
    world.paint(s, 0, 0, false, true, { reducedMotion: true }); (window as any).lurePreview = { world, hud, s, placeScarecrow, clearScarecrow };
  }); await page.waitForFunction(() => (window as any).lurePreview.world.weaponLoads.get('W01')?.loaded);
  const result = await page.evaluate(() => {
    const { world, hud, s, placeScarecrow, clearScarecrow } = (window as any).lurePreview, paint = () => world.paint(s, 0, 0, false, true, { reducedMotion: true });
    paint(); const before = { ...world.renderer.info.memory }; placeScarecrow(s, { x: 180, y: 183 }); paint();
    const body = world.scene.getObjectByName('scarecrow-body'), bar = world.scene.getObjectByName('scarecrow-health');
    let disposed = 0; body.traverse((o: any) => { if (o.geometry) o.geometry.addEventListener('dispose', () => disposed++); });
    const position = body.position.toArray(), height = body.userData.height; s.decoy.hp = 15; paint(); const ratio = bar.getObjectByName('fill').scale.x;
    clearScarecrow(s); paint(); for (let i = 0; i < 5; i++) { delete s.player.auxCooldowns; placeScarecrow(s, { x: 180, y: 183 }); paint(); clearScarecrow(s); paint(); }
    const after = { ...world.renderer.info.memory }; delete s.player.auxCooldowns; placeScarecrow(s, { x: 180, y: 183 });
    s.expedition.relics = s.expedition.acquired = ['R18', 'R06', 'R09', 'R10', 'R14', 'R15', 'R19', 'R21', 'R22', 'R23', 'R29', 'R31', 'R32']; s.diceRerolls = 2;
    paint(); hud.update(s, { modal: '', yaw: 0, reducedMotion: true, mouseCaptured: true, noticeUntil: 0 }); return { before, after, disposed, position, height, ratio };
  });
  expect(result.position[0]).toBeCloseTo(-5.6); expect(result.position.slice(1)).toEqual([0, 0]); expect(result.height).toBeCloseTo(1.76); expect(result.ratio).toBe(.5); expect(result.disposed).toBeGreaterThan(0);
  expect(result.after.geometries).toBeLessThanOrEqual(result.before.geometries); expect(result.after.textures).toBeLessThanOrEqual(result.before.textures);
  await expect(page.locator('#decoy-status')).toBeInViewport({ ratio: 1 }); await expect(page.locator('#aux')).toContainText('12.0초');
  const rects = await page.evaluate(() => ['decoy-status', 'mini-map'].map(id => { const r = document.getElementById(id)!.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }));
  expect(rects[0].right <= rects[1].x || rects[0].x >= rects[1].right || rects[0].bottom <= rects[1].y || rects[0].y >= rects[1].bottom).toBe(true);
  await page.screenshot({ path: 'graphics-review/scarecrow/small-hud.png' }); expect(errors).toEqual([]);
});
