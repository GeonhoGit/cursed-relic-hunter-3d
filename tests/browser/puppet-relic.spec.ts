import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); }; });
  await page.clock.install({ time: new Date('2026-10-06T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-06T00:00:00.032Z'));
});
const saved = (page: Page) => page.evaluate(async () => {
  const { SaveStore } = await import('/src/persistence/save.ts' as string); return await new SaveStore().load();
});
async function seed(page: Page) {
  await page.goto('/'); await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { beginGrowthRun, emptyInvestment } = await import('/src/core/growth.ts' as string);
    const { createBoss } = await import('/src/core/boss.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const store = new SaveStore(); await store.load(); const prior = createDungeonRun(42); beginGrowthRun(prior, emptyInvestment(), 'puppet-unlock');
    prior.expedition.room = 8; prior.expedition.dungeon.rooms[8].visited = prior.expedition.dungeon.rooms[8].cleared = true;
    prior.boss = createBoss(prior); prior.boss.hp = 0; prior.phase = 'cleared'; await store.save(prior, defaultSettings());
    const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'puppet-browser', false, ['R17']);
    s.expedition.room = 6; const room = s.expedition.dungeon.rooms[6]; room.visited = room.cleared = true;
    room.reward = { room: 6, candidates: ['R17', 'R06', 'R23'], choice: null }; s.phase = 'cleared'; s.player.x = 80; s.player.y = 183; s.view = { yaw: 0, pitch: 0 };
    await store.save(s, defaultSettings());
  }); await page.reload();
}
async function encounter(page: Page) {
  await page.evaluate(async () => {
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string); const store = new SaveStore(); const r = await store.load(), s = r.run;
    s.expedition.room = 1; const room = s.expedition.dungeon.rooms[1]; room.visited = true; room.structure = 0;
    s.phase = 'combat'; s.player.x = 80; s.player.y = 183; s.view = { yaw: 0, pitch: 0 };
    s.enemies = [{ id: s.nextId++, kind: 'rat', x: 200, y: 183, hp: 30, maxHp: 30, angle: Math.PI, mode: 'move', timer: 0, targetX: 80, targetY: 183, flash: 0 }];
    await store.save(s, defaultSettings());
  }); await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
}
async function rightClick(page: Page) {
  await page.locator('#world canvas').dispatchEvent('mousedown', { button: 2, bubbles: true });
  await page.locator('#world canvas').dispatchEvent('mouseup', { button: 2, bubbles: true }); await page.clock.runFor(240);
}
test('real epic selection equips the puppet, conversion persists through pause/reload, and the last ally returns without a free clear', async ({ page }) => {
  test.setTimeout(Math.max(test.info().timeout, 90000));
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await seed(page);
  await page.getByRole('button', { name: '영구 성장', exact: true }).click(); await expect(page.locator('[data-goal="G03"]')).toContainText('꼭두각시 실 해금');
  await page.locator('[data-action="close"]').click(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.locator('[data-action="choose-R17"] .rarity-badge')).toContainText('영웅'); await page.locator('[data-action="choose-R17"]').click();
  await page.clock.runFor(120); await expect(page.locator('#aux')).toContainText('꼭두각시 실 · 준비됨');
  await encounter(page); await rightClick(page); await expect(page.locator('#puppet-status')).toContainText('아군 돌쥐 30/30');
  await expect(page.locator('#objective')).toContainText('아군만 남음'); await page.screenshot({ path: 'graphics-review/puppet/converted.png' });
  await page.keyboard.press('Escape'); await expect.poll(async () => (await saved(page)).run.enemies[0].charm?.ticks).toBeGreaterThan(0);
  const before = await saved(page); expect(before.profile.auxiliaryUsed).toEqual(['R17']);
  await page.clock.fastForward(5000); expect((await saved(page)).run).toEqual(before.run);
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click(); await page.clock.runFor(120);
  await expect(page.locator('#puppet-status')).toContainText('아군 돌쥐'); await page.clock.runFor(4100); await expect(page.locator('#puppet-status')).toBeHidden();
  await page.keyboard.press('Escape'); await expect.poll(async () => (await saved(page)).run.enemies[0].charm).toBeUndefined();
  const after = await saved(page); expect(after.run.phase).toBe('combat'); expect(after.run.enemies[0].id).toBe(before.run.enemies[0].id);
  expect(after.run.expedition.dungeon.rooms[1].cleared).toBe(false); expect(after.run.player.auxCooldowns.R17).toBeLessThan(before.run.player.auxCooldowns.R17);
  expect(after.profile.auxiliaryUsed).toEqual(['R17']); expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false); expect(errors).toEqual([]);
});
test('an invalid cast explains failure without charging, and inventory describes the safe-only equipment rule', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await seed(page); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await page.locator('[data-action="choose-R17"]').click(); await page.clock.runFor(120); await rightClick(page);
  await expect(page.locator('#notice')).toContainText('전투 중인 일반 몬스터'); await page.keyboard.press('Escape'); const idle = await saved(page);
  expect(idle.run.player.auxCooldowns).toBeUndefined(); expect(idle.profile.auxiliaryUsed).toBeUndefined();
  await encounter(page); await page.keyboard.press('i'); await expect(page.getByRole('button', { name: '꼭두각시 실 장착', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '꼭두각시 실 장착', exact: true }).locator('..')).toContainText('4초간 아군'); await page.locator('[data-action="close"]').click();
  expect(errors).toEqual([]);
});
test('friendly marks, health and telegraphs restore colors and release resources at low quality while the small HUD fits', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await page.setViewportSize({ width: 640, height: 480 }); await page.goto('/');
  await page.evaluate(async () => {
    const { World } = await import('/src/game/world.ts' as string); const { CombatHud } = await import('/src/game/hud.ts' as string);
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string); const { beginGrowthRun, emptyInvestment } = await import('/src/core/growth.ts' as string);
    const { grantRelic } = await import('/src/core/relic-acquisition.ts' as string); const { charmEnemy, releaseCharm } = await import('/src/core/allegiance.ts' as string);
    const s = createDungeonRun(42); beginGrowthRun(s, emptyInvestment(), 'puppet-render', false, ['R17']); grantRelic(s, 'R17'); s.expedition.room = 1;
    s.expedition.dungeon.rooms[1].visited = true; s.expedition.dungeon.rooms[1].structure = 0; s.phase = 'combat'; s.player.x = 80; s.player.y = 183;
    s.enemies = [{ id: s.nextId++, kind: 'archer', x: 200, y: 183, hp: 39, maxHp: 40, angle: Math.PI, mode: 'windup', timer: 10, targetX: 80, targetY: 183, flash: 0 }];
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;z-index:0'; document.body.append(host);
    document.getElementById('world').style.display = 'none'; document.getElementById('overlay').hidden = true; document.getElementById('expedition').dataset.ui = '';
    document.getElementById('expedition').style.zIndex = '1'; const world = new World(host); world.setQuality(0); const hud = new CombatHud();
    world.paint(s, 0, 0, false, true, { reducedMotion: true }); (window as any).puppetPreview = { world, hud, s, charmEnemy, releaseCharm };
  });
  await page.waitForFunction(() => (window as any).puppetPreview.world.weaponLoads.get('W01')?.loaded);
  const result = await page.evaluate(() => {
    const { world, hud, s, charmEnemy, releaseCharm } = (window as any).puppetPreview, e = s.enemies[0];
    const paint = () => world.paint(s, 0, 0, false, true, { reducedMotion: true }); paint(); const before = { ...world.renderer.info.memory };
    const body = () => world.entities.get(`enemy-${e.id}`) ?? world.scene.children.find((o: any) => o.getObjectByName?.('fill'));
    const fill = body().getObjectByName('fill'), originalColor = fill.material.color.getHex();
    charmEnemy(s, e); e.mode = 'windup'; e.timer = 10; e.targetX = 80; e.targetY = 183; paint();
    const marker = world.scene.getObjectByName('puppet-mark'); let disposed = 0; marker.traverse((o: any) => { if (o.geometry) o.geometry.addEventListener('dispose', () => disposed++); });
    const friendlyColor = fill.material.color.getHex(), tell = [...world.entities.entries()].find(([k]: any) => k.startsWith(`tell-${e.id}`));
    const friendlyTell = tell[1].children[0].material.color.getHex(), markerPos = marker.position.toArray();
    releaseCharm(e); e.mode = 'windup'; e.timer = 10; e.targetX = 80; e.targetY = 183; paint(); const restoredColor = fill.material.color.getHex();
    const hostileTell = [...world.entities.entries()].find(([k]: any) => k.startsWith(`tell-${e.id}`))[1].children[0].material.color.getHex();
    for (let i = 0; i < 5; i++) { delete s.player.auxCooldowns; charmEnemy(s, e); paint(); releaseCharm(e); paint(); }
    const after = { ...world.renderer.info.memory }; delete s.player.auxCooldowns; charmEnemy(s, e);
    s.expedition.relics = s.expedition.acquired = ['R17', 'R06', 'R09', 'R10', 'R14', 'R15', 'R19', 'R21', 'R22', 'R23', 'R29', 'R31', 'R32']; s.diceRerolls = 2;
    paint(); hud.update(s, { modal: '', yaw: 0, reducedMotion: true, mouseCaptured: true, noticeUntil: 0 });
    return { before, after, disposed, friendlyColor, friendlyTell, hostileTell, originalColor, restoredColor, markerPos };
  });
  expect(result.friendlyColor).toBe(0x83e4bd); expect(result.friendlyTell).toBe(0x83e4bd); expect(result.hostileTell).not.toBe(0x83e4bd);
  expect(result.restoredColor).toBe(result.originalColor); expect(result.markerPos).toEqual([-4.8, 0, 0]); expect(result.disposed).toBeGreaterThan(0);
  expect(result.after.geometries).toBeLessThanOrEqual(result.before.geometries); expect(result.after.textures).toBeLessThanOrEqual(result.before.textures);
  await expect(page.locator('#puppet-status')).toBeInViewport({ ratio: 1 }); await expect(page.locator('#passive-status')).toBeInViewport({ ratio: 1 });
  expect(await page.locator('.weapon-hud').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: 'graphics-review/puppet/small-hud.png' }); expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false);
  await page.evaluate(() => (window as any).puppetPreview.world.renderer.dispose()); expect(errors).toEqual([]);
});
