import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); }; });
  await page.clock.install({ time: new Date('2026-10-06T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-06T00:00:00.032Z'));
});

test('new relic cards, automatic exploration, ward HUD and inventory survive reload', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 640, height: 480 }); await page.goto('/');
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const s = createDungeonRun(42); s.expedition.room = 6; s.phase = 'cleared';
    const room = s.expedition.dungeon.rooms[6]; room.visited = room.cleared = true;
    room.reward = { room: 6, candidates: ['R19', 'R09', 'R21'], choice: null };
    s.player.x = 320; s.player.y = 217;
    const store = new SaveStore('cursed-relic-hunter-3d-v1'); await store.load(); await store.save(s, defaultSettings());
  });
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  const card = page.locator('[data-action="choose-R19"]');
  await expect(card.locator('.rarity-badge')).toHaveText('희귀'); await expect(card).toContainText('3초');
  await expect(page.locator('[data-action="choose-R09"] .rarity-badge')).toHaveText('영웅');
  await expect(page.locator('[data-action="choose-R21"]')).toContainText('3개마다');
  await card.click(); await expect(page.locator('#overlay')).toBeHidden(); await page.clock.runFor(50);
  await expect(page.locator('#passive-R19')).toHaveText('수호 준비');
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click(); await page.clock.runFor(50);
  await expect(page.locator('#passive-R19')).toHaveText('수호 준비'); await page.keyboard.press('i');
  await expect(page.locator('.inventory-grid .relic-card b')).toHaveText('수호석');
  await page.locator('.inventory-grid .relic-card p').scrollIntoViewIfNeeded();
  await expect(page.locator('.inventory-grid .relic-card p')).toBeInViewport({ ratio: .8 });
  expect(await page.locator('#panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: 'graphics-review/relic-expansion-one/inventory.png' });
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false); expect(errors).toEqual([]);
});

test('G02 and G06 explain and snapshot their unlocks when starting an expedition', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const { defaultProfile } = await import('/src/core/growth.ts' as string);
    const { RELIC_IDS } = await import('/src/core/relics.ts' as string);
    const store = new SaveStore('cursed-relic-hunter-3d-v1'); await store.load();
    const profile = defaultProfile(); profile.rooms = Array.from({ length: 5 }, (_, i) => ({ runId: `prior-${i}`, room: 1 }));
    profile.relics = RELIC_IDS.filter((id: string) => !['R14', 'R29'].includes(id)).slice(0, 12);
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('cursed-relic-hunter-3d-v1', 1); r.onsuccess = () => resolve(r.result); });
    await new Promise<void>(resolve => { const tx = db.transaction('save', 'readwrite');
      tx.objectStore('save').put({ schema: 1, content: 'prototype-0.13', revision: 0, savedAt: '2026-10-06', run: null, settings: defaultSettings(), profile }, 'current');
      tx.oncomplete = () => resolve(); }); db.close();
  });
  await page.reload(); await page.getByRole('button', { name: '영구 성장', exact: true }).click();
  await expect(page.locator('.growth-goal').filter({ hasText: '유적의 탐험가' })).toContainText('별빛 바늘·가시 장화 해금');
  await expect(page.locator('.growth-goal').filter({ hasText: '유물 수집가' })).toContainText('뿌리 장화 해금');
  await page.locator('[data-action="close"]').click(); await page.getByRole('button', { name: '새 탐험 시작', exact: true }).click();
  await expect(page.locator('#overlay')).toBeHidden();
  const saved = await page.evaluate(async () => {
    const { SaveStore } = await import('/src/persistence/save.ts' as string);
    return (await new SaveStore('cursed-relic-hunter-3d-v1').load()).run.growth.relicUnlocks;
  });
  expect(saved).toEqual(['R14', 'R15', 'R29']); expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false);
});

test('combat effects stay at their real coordinates in low quality and release resources; six HUD states fit', async ({ page }) => {
  test.setTimeout(120000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 960, height: 600 }); await page.goto('/');
  await page.evaluate(async () => {
    const { World } = await import('/src/game/world.ts' as string);
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const s = createDungeonRun(42); s.expedition.room = 1; s.expedition.dungeon.rooms[1].visited = true;
    delete s.expedition.dungeon.rooms[1].structure; s.phase = 'combat'; s.enemies = [];
    s.player.x = 280; s.player.y = 180; s.view = { yaw: 0, pitch: -.04 };
    document.getElementById('world')!.style.visibility = 'hidden'; document.getElementById('overlay')!.hidden = true;
    document.getElementById('expedition')!.dataset.ui = ''; document.getElementById('expedition')!.style.zIndex = '1';
    const host = document.createElement('div'); host.id = 'relic-preview'; host.style.cssText = 'position:fixed;inset:0;z-index:0'; document.body.append(host);
    const world = new World(host); world.setQuality(0); world.paint(s, 0, -.04, false, true, { reducedMotion: true });
    (window as any).relicPreview = { world, s };
  });
  await page.waitForFunction(() => (window as any).relicPreview.world.weaponLoads.get('W01')?.loaded);
  const rendered = await page.evaluate(async () => {
    const { world, s } = (window as any).relicPreview;
    const { wardPoint } = await import('/src/core/relic-combat.ts' as string);
    const { CombatHud } = await import('/src/game/hud.ts' as string);
    world.paint(s, 0, -.04, false, true, { reducedMotion: true });
    const before = { ...world.renderer.info.memory }; (window as any).relicPreview.before = before;
    s.expedition.relics = s.expedition.acquired = ['R09', 'R14', 'R19', 'R21', 'R22', 'R29'];
    Object.assign(s.player, { lightningCooldown: 72, starlightCooldown: 240, cleanseCooldown: 480 }); s.mossClears = 2;
    s.cues = [
      { id: s.nextId++, kind: 'lightning', x: 350, y: 180, height: 23, end: { x: 400, y: 200 }, endHeight: 23, tick: s.tick, amount: 3.5 },
      { id: s.nextId++, kind: 'starlight', x: 280, y: 180, height: 34, end: { x: 500, y: 180 }, endHeight: 34, tick: s.tick, amount: 10.5 },
      { id: s.nextId++, kind: 'cleanse', x: 280, y: 180, tick: s.tick, amount: 0 },
    ];
    const hud = new CombatHud(); hud.update(s, { modal: '', yaw: 0, reducedMotion: true, mouseCaptured: true, noticeUntil: 0 });
    world.paint(s, 0, -.04, false, true, { reducedMotion: true });
    const ward = world.entities.get('relic-ward'), point = wardPoint(s);
    const beam = world.entities.get(`relic-cue-${s.cues[1].id}`);
    return { ward: ward.position.toArray(), point, beam: beam.position.toArray(), length: beam.scale.z,
      lines: [...world.entities.keys()].filter((key: string) => key.startsWith('relic-cue-')).length };
  });
  expect(rendered.ward[0]).toBeCloseTo((rendered.point.x - 320) * .04);
  expect(rendered.ward[1]).toBeCloseTo(rendered.point.height * .04);
  expect(rendered.ward[2]).toBeCloseTo((rendered.point.y - 183) * .04);
  expect(rendered.beam[0]).toBeCloseTo((390 - 320) * .04); expect(rendered.length).toBeCloseTo(220 * .04);
  expect(rendered.lines).toBe(3); await expect(page.locator('#passive-R09')).toHaveText('폭풍 1.2초');
  await expect(page.locator('#passive-R14')).toHaveText('별빛 4.0초'); await expect(page.locator('#passive-R21')).toHaveText('이끼 2/3방');
  await page.screenshot({ path: 'graphics-review/relic-expansion-one/effects.png' });
  await page.setViewportSize({ width: 640, height: 480 });
  await page.evaluate(() => { const { world, s } = (window as any).relicPreview; world.paint(s, 0, -.04, false, true, { reducedMotion: true }); });
  await page.locator('#passive-status').evaluate(el => el.getBoundingClientRect());
  await expect(page.locator('#passive-status')).toBeInViewport({ ratio: 1 });
  const layout = await page.locator('#passive-status').evaluate(el => {
    const a = el.getBoundingClientRect(), map = document.querySelector('.mini-map')!.getBoundingClientRect();
    return { widthFits: el.scrollWidth <= el.clientWidth + 1, belowMap: a.top >= map.bottom,
      childrenFit: [...el.children].every(child => child.scrollWidth <= child.clientWidth + 1) };
  });
  expect(layout).toEqual({ widthFits: true, belowMap: true, childrenFit: true });
  await page.screenshot({ path: 'graphics-review/relic-expansion-one/hud-small.png' });
  const cleaned = await page.evaluate(() => {
    const { world, s, before } = (window as any).relicPreview;
    for (let i = 0; i < 5; i++) {
      world.paint(s, 0, 0, false, true, { reducedMotion: true });
      s.tick += 24; s.cues = []; s.expedition.relics = []; world.paint(s, 0, 0, false, true, { reducedMotion: true });
      s.expedition.relics = ['R19'];
    }
    s.expedition.relics = []; world.paint(s, 0, 0, false, true);
    const result = { before, after: { ...world.renderer.info.memory }, keys: [...world.entities.keys()].filter((key: string) => key.startsWith('relic-')) };
    world.renderer.dispose(); document.getElementById('relic-preview')!.remove(); return result;
  });
  expect(cleaned.keys).toEqual([]); expect(cleaned.after.geometries).toBeLessThanOrEqual(cleaned.before.geometries + 1);
  expect(cleaned.after.textures).toBeLessThanOrEqual(cleaned.before.textures + 1);
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false); expect(errors).toEqual([]);
});
