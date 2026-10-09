import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); }; });
  await page.clock.install({ time: new Date('2026-10-06T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-06T00:00:00.032Z'));
});

test('choosing the lantern reveals current neighbours immediately and survives reload without marking visits', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await page.goto('/');
  const neighbours = await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { adjacentRooms } = await import('/src/core/dungeon.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const s = createDungeonRun(42,2); s.expedition.room = 6; s.phase = 'cleared';
    const room = s.expedition.dungeon.rooms[6]; room.visited = room.cleared = true;
    room.reward = { room: 6, candidates: ['R31', 'R06', 'R23'], choice: null }; s.player.x = 320; s.player.y = 217;
    const store = new SaveStore('cursed-relic-hunter-3d-v1'); await store.load(); await store.save(s, defaultSettings());
    return adjacentRooms(s).map((d: any) => d.room.id);
  });
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click(); await page.clock.runFor(120);
  for (const id of neighbours) {const node=page.locator(`#mini-map [data-room-id="${id}"]`);await expect(node.locator('text')).toHaveText(await node.getAttribute('data-locked')==='true'?'⚿':'?');}
  await expect(page.locator('[data-action="choose-R31"] .rarity-badge')).toHaveText('일반');
  await page.locator('[data-action="choose-R31"]').click(); await page.clock.runFor(120);
  await expect(page.locator('#overlay')).toBeHidden(); await expect(page.locator('#passive-R31')).toHaveText('길잡이 방 공개');
  for (const id of neighbours) { await expect(page.locator(`#mini-map [data-room-id="${id}"] text`)).not.toHaveText('?'); await expect(page.locator(`#mini-map [data-room-id="${id}"]`)).toHaveAttribute('data-visited', 'false'); }
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click(); await page.clock.runFor(120);
  await page.keyboard.press('Tab'); await expect(page.locator('#panel')).toContainText('길잡이 등불 · 연결된 미방문 방의 종류를 공개합니다.');
  for (const id of neighbours) await expect(page.locator(`.dungeon-map [data-room-id="${id}"] text`)).not.toHaveText('?');
  await page.screenshot({ path: 'graphics-review/relic-expansion-three/lantern-map.png' });
  await page.keyboard.press('Tab'); await expect(page.locator('#overlay')).toBeHidden();
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false); expect(errors).toEqual([]);
});

test('free refresh precedes two shared die uses and saving/reloading cannot refill the die', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await page.setViewportSize({ width: 640, height: 480 }); await page.goto('/');
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { beginGrowthRun, defaultProfile } = await import('/src/core/growth.ts' as string);
    const { grantRelic } = await import('/src/core/relic-acquisition.ts' as string);
    const { RELIC_IDS } = await import('/src/core/relics.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const name = 'cursed-relic-hunter-3d-v1', store = new SaveStore(name); await store.load(); const profile = defaultProfile();
    profile.relics = RELIC_IDS.filter((id: string) => id !== 'R32').slice(0, 24);
    const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open(name, 1); request.onsuccess = () => resolve(request.result); });
    await new Promise<void>(resolve => { const tx = db.transaction('save', 'readwrite'); tx.objectStore('save').put({ schema: 1, content: 'prototype-0.13', revision: 0, savedAt: '2026-10-06', run: null, settings: defaultSettings(), profile }, 'current'); tx.oncomplete = () => resolve(); }); db.close(); await store.load();
    const s = createDungeonRun(42); beginGrowthRun(s, profile.investment, 'browser-die', false, ['R32']); grantRelic(s, 'R32');
    s.expedition.room = 6; s.phase = 'cleared'; s.player.x = 320; s.player.y = 217;
    const room = s.expedition.dungeon.rooms[6]; room.visited = room.cleared = true; room.reward = { room: 6, candidates: ['R31', 'R06', 'R23'], choice: null };
    const acquired = s.expedition.dungeon.rooms[7]; acquired.visited = acquired.cleared = true; acquired.reward = { room: 7, candidates: ['R32'], choice: 'R32' };
    await store.save(s, defaultSettings());
  });
  const saved = () => page.evaluate(async () => { const { SaveStore } = await import('/src/persistence/save.ts' as string); return (await new SaveStore('cursed-relic-hunter-3d-v1').load()).run; });
  await page.reload(); await page.getByRole('button', { name: '영구 성장', exact: true }).click();
  await expect(page.locator('[data-goal="G07"]')).toContainText('운명의 주사위 해금'); await expect(page.locator('[data-goal="G07"]')).toContainText('달성');
  await page.locator('[data-action="close"]').click(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await page.getByRole('button', { name: '새로고침 · 무료 1회', exact: true }).click();
  await expect.poll(async () => (await saved()).diceRerolls).toBe(2);
  await page.getByRole('button', { name: '새로고침 · 주사위 2회', exact: true }).click();
  await expect.poll(async () => (await saved()).diceRerolls).toBe(1);
  const before = await saved(); expect(before.expedition.dungeon.rooms[6].reward.diceRerolls).toBe(1);
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await page.getByRole('button', { name: '새로고침 · 주사위 1회', exact: true }).click();
  await expect.poll(async () => (await saved()).diceRerolls).toBe(0); await expect(page.getByRole('button', { name: '새로고침 사용 완료', exact: true })).toBeDisabled();
  const final = await saved(); expect(final.rng).not.toBe(before.rng); expect(final.expedition.dungeon.rooms[6].reward.diceRerolls).toBe(2);
  await page.locator('[data-action^="choose-R"]').first().click(); await expect(page.locator('#overlay')).toBeHidden(); await page.clock.runFor(120);
  await expect(page.locator('#passive-R32')).toHaveText('주사위 0/2회'); await page.keyboard.press('i');
  await expect(page.locator('.dice-remaining')).toHaveText('추가 새로고침 0/2회'); await page.locator('.dice-remaining').scrollIntoViewIfNeeded();
  await expect(page.locator('.dice-remaining')).toBeInViewport({ ratio: 1 });
  expect(await page.locator('#panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: 'graphics-review/relic-expansion-three/die-inventory.png' });
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false); expect(errors).toEqual([]);
});

test('lantern changes door information and HUD caches without changing passages or leaking room graphics', async ({ page }) => {
  test.setTimeout(120000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await page.setViewportSize({ width: 960, height: 600 }); await page.goto('/');
  await page.evaluate(async () => {
    const { World } = await import('/src/game/world.ts' as string); const { CombatHud } = await import('/src/game/hud.ts' as string);
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string); const s = createDungeonRun(42,2);
    document.getElementById('world')!.style.visibility = 'hidden'; document.getElementById('overlay')!.hidden = true; document.getElementById('expedition')!.dataset.ui = '';
    const host = document.createElement('div'); host.id = 'lantern-preview'; host.style.cssText = 'position:fixed;inset:0;z-index:0'; document.body.append(host);
    document.getElementById('expedition')!.style.zIndex = '1'; const world = new World(host); world.setQuality(0); const hud = new CombatHud();
    world.paint(s, 0, 0, false, true, { reducedMotion: true }); hud.update(s, { modal: '', yaw: 0, reducedMotion: true, mouseCaptured: true, noticeUntil: 0 });
    (window as any).lanternPreview = { world, hud, s };
  });
  await page.waitForFunction(() => (window as any).lanternPreview.world.weaponLoads.get('W01')?.loaded);
  const result = await page.evaluate(async () => {
    const { world, hud, s } = (window as any).lanternPreview; world.paint(s, 0, 0, false, true, { reducedMotion: true });
    const before = { ...world.renderer.info.memory }, unlit = world.doors.map((d: any) => ({ kind: d.userData.roomKind, position: d.position.toArray() }));
    const { grantRelic } = await import('/src/core/relic-acquisition.ts' as string); grantRelic(s, 'R31');
    world.paint(s, 0, 0, false, true, { reducedMotion: true }); hud.update(s, { modal: '', yaw: 0, reducedMotion: true, mouseCaptured: true, noticeUntil: 0 });
    const lit = world.doors.map((d: any) => ({ kind: d.userData.roomKind, position: d.position.toArray() }));
    const peeked = [...document.querySelectorAll('#mini-map .map-node text')].map(t => t.textContent);
    for (let i = 0; i < 5; i++) { s.expedition.relics = []; world.paint(s, 0, 0, false, true, { reducedMotion: true }); s.expedition.relics = ['R31']; world.paint(s, 0, 0, false, true, { reducedMotion: true }); }
    s.expedition.relics = []; world.paint(s, 0, 0, false, true, { reducedMotion: true }); hud.update(s, { modal: '', yaw: 0, reducedMotion: true, mouseCaptured: true, noticeUntil: 0 });
    const lost = world.doors.map((d: any) => d.userData.roomKind), hidden = [...document.querySelectorAll('#mini-map .map-node text')].filter(t => t.textContent === '?').length;
    const after = { ...world.renderer.info.memory }; s.expedition.relics = s.expedition.acquired = ['R06', 'R09', 'R10', 'R14', 'R15', 'R19', 'R21', 'R22', 'R23', 'R29', 'R31', 'R32']; s.diceRerolls = 2;
    hud.update(s, { modal: '', yaw: 0, reducedMotion: true, mouseCaptured: true, noticeUntil: 0 }); return { unlit, lit, lost, peeked, hidden, before, after };
  });
  expect(result.unlit.every((d: any) => d.kind === 'unknown')).toBe(true); expect(result.lit.every((d: any) => d.kind !== 'unknown')).toBe(true);
  expect(result.lit.map((d: any) => d.position)).toEqual(result.unlit.map((d: any) => d.position)); expect(result.peeked).not.toContain('?');
  expect(result.lost.every((kind: string) => kind === 'unknown')).toBe(true); expect(result.hidden).toBe(result.lost.length);
  expect(result.after.geometries).toBeLessThanOrEqual(result.before.geometries + 1); expect(result.after.textures).toBeLessThanOrEqual(result.before.textures + 1);
  await page.setViewportSize({ width: 640, height: 480 }); await expect(page.locator('#passive-status')).toBeInViewport({ ratio: 1 });
  const layout = await page.locator('#passive-status').evaluate(el => ({ fits: el.scrollWidth <= el.clientWidth + 1,
    belowMap: document.querySelector('.abilities')!.getBoundingClientRect().top >= document.querySelector('.mini-map')!.getBoundingClientRect().bottom,
    childrenFit: [...el.children].every(child => child.scrollWidth <= child.clientWidth + 1) }));
  expect(layout).toEqual({ fits: true, belowMap: true, childrenFit: true }); await expect(page.locator('#passive-R32')).toHaveText('주사위 2/2회');
  await page.screenshot({ path: 'graphics-review/relic-expansion-three/hud-small.png' });
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false); expect(errors).toEqual([]);
});
