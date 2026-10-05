import { expect, test } from '@playwright/test';

test('a chest offers one free refresh, persists it across page reload and resumes after a new choice', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); };
  });
  await page.clock.install({ time: new Date('2026-10-05T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-05T00:00:00.032Z'));
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const s = createDungeonRun(42); s.expedition.room = 6;
    const room = s.expedition.dungeon.rooms[6]; room.visited = room.cleared = true;
    s.phase = 'explore'; s.player.x = 320; s.player.y = 217; s.view = { yaw: -Math.PI / 2, pitch: 0 };
    const store = new SaveStore('cursed-relic-hunter-3d-v1'); await store.load(); await store.save(s, defaultSettings());
  });
  const saved = () => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const q = indexedDB.open('cursed-relic-hunter-3d-v1', 1); q.onsuccess = () => resolve(q.result); });
    const data = await new Promise<any>(resolve => { const q = db.transaction('save').objectStore('save').get('current'); q.onsuccess = () => resolve(q.result); });
    db.close(); return data.run;
  });
  const ids = () => page.locator('button[data-action^="choose-R"]').evaluateAll(buttons => buttons.map(b => (b as HTMLElement).dataset.action));
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.locator('#overlay')).toBeHidden(); await page.clock.runFor(40);
  await page.keyboard.press('e'); await expect(page.getByRole('heading', { name: '유물을 하나 선택하세요.' })).toBeVisible();
  const before = await saved(), old = await ids(); expect(old).toHaveLength(3);
  await page.getByRole('button', { name: '새로고침 · 무료 1회', exact: true }).click();
  await expect(page.getByRole('button', { name: '새로고침 사용 완료', exact: true })).toBeDisabled();
  await expect.poll(async () => (await saved()).expedition.dungeon.rooms[6].reward.rerolled).toBe(true);
  const fresh = await ids(); expect(fresh).toHaveLength(3); expect(fresh.every(id => !old.includes(id))).toBe(true);
  const after = await saved(); expect(after.gold).toBe(before.gold); expect(after.tick).toBe(before.tick);
  expect(after.expedition.acquired).toEqual([]);
  await page.screenshot({ path: 'graphics-review/reward-reroll/refreshed.png' });
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.getByRole('button', { name: '새로고침 사용 완료', exact: true })).toBeDisabled();
  expect(await ids()).toEqual(fresh);
  await page.locator('button[data-action^="choose-R"]').first().click();
  await expect(page.locator('#overlay')).toBeHidden();
  await expect.poll(async () => (await saved()).expedition.acquired.length).toBe(1);
  const selected = await saved(); expect(selected.phase).toBe('explore');
  expect(selected.expedition.dungeon.rooms[6].reward.rerolled).toBe(true);
  expect(errors).toEqual([]);
});
