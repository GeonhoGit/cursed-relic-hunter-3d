import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); };
  });
  await page.clock.install({ time: new Date('2026-10-05T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-05T00:00:00.032Z'));
});

test('new relic cards can be selected, show their grades and restore the crown condition', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const s = createDungeonRun(42); s.expedition.room = 6; s.phase = 'cleared';
    const room = s.expedition.dungeon.rooms[6]; room.visited = room.cleared = true;
    room.reward = { room: 6, candidates: ['R54', 'R56', 'R57'], choice: null };
    s.player.x = 320; s.player.y = 217; s.view = { yaw: -Math.PI / 2, pitch: 0 };
    const store = new SaveStore('cursed-relic-hunter-3d-v1'); await store.load(); await store.save(s, defaultSettings());
  });
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.locator('.reward-options .rarity-badge')).toHaveText(['희귀', '영웅', '전설']);
  await expect(page.getByRole('button', { name: '피의 성배 선택', exact: true })).toContainText('생명력 2');
  await expect(page.getByRole('button', { name: '피의 성배 선택', exact: true })).toContainText('방당 최대 12');
  await page.getByRole('button', { name: '태양의 왕관 선택', exact: true }).click();
  await expect(page.locator('#overlay')).toBeHidden(); await page.clock.runFor(50);
  await expect(page.locator('#weapon-stats')).toContainText('탄환당 피해 9.45 (+35%)');
  await expect(page.locator('#crown-status')).toHaveText('태양의 왕관 · 발동 중 +35%');
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.locator('#overlay')).toBeHidden(); await page.clock.runFor(50);
  await expect(page.locator('#crown-status')).toHaveText('태양의 왕관 · 발동 중 +35%');
  await page.keyboard.press('i'); await expect(page.locator('.inventory-grid .relic-card b')).toHaveText('태양의 왕관');
  await expect(page.locator('.inventory-grid .rarity-badge')).toHaveText('전설');
  await page.screenshot({ path: 'graphics-review/relic-expansion/crown-inventory.png' });
  expect(errors).toEqual([]);
});

test('saved kill healing respects the room cap, stacks clear healing once and buying healing activates the crown', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { grantRelic } = await import('/src/core/relic-acquisition.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const s = createDungeonRun(42);
    for (const [i, id] of ['R54', 'R56'].entries()) {
      const room = s.expedition.dungeon.rooms[6 + i]; room.visited = room.cleared = true;
      room.reward = { room: room.id, candidates: [id], choice: id }; grantRelic(s, id);
    }
    const shopRoom = s.expedition.dungeon.rooms[10]; shopRoom.visited = shopRoom.cleared = true;
    shopRoom.shop = { revision: 3, slots: [
      { kind: 'relic', relic: 'R53', purchased: true, repairCounter: 0 },
      { kind: 'relic', relic: 'R57', purchased: true, repairCounter: 0 },
      { kind: 'heal', relic: null, purchased: false, repairCounter: 0 },
      { kind: 'curse', relic: 'R43', purchased: false, repairCounter: 0 },
    ] };
    grantRelic(s, 'R53'); grantRelic(s, 'R57');
    s.expedition.room = 1; const room = s.expedition.dungeon.rooms[1]; room.visited = true;
    room.chaliceHealed = 11;
    room.template = 0; delete room.structure;
    s.phase = 'combat'; s.wave = 1; s.waveDelay = 0; s.player.hp = 60;
    s.player.x = 320; s.player.y = 183; s.view = { yaw: 0, pitch: 0 };
    s.enemies = [{ id: s.nextId++, kind: 'rat', x: 350, y: 183, hp: 1, maxHp: 30, angle: Math.PI, mode: 'move', timer: 0, targetX: 320, targetY: 183, flash: 0 }];
    s.bullets = [{ id: s.nextId++, x: 341, y: 183, vx: 320, vy: 0, height: 3, heightVelocity: 0,
      life: 75, owner: 'player', damage: 7, bouncesLeft: 0, hitIds: [] }];
    const store = new SaveStore('cursed-relic-hunter-3d-v1'); await store.load(); await store.save(s, defaultSettings());
  });
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.locator('#overlay')).toBeHidden(); await page.clock.runFor(80);
  await expect(page.locator('#hp')).toHaveText('66');
  await expect(page.locator('#crown-status')).toHaveText('태양의 왕관 · 생명력 80% 이상에서 발동');
  await page.clock.runFor(300); await expect(page.locator('#hp')).toHaveText('66');
  await expect(page.locator('#kills')).toHaveText('1 처치');
  const savedHealing = await page.evaluate(async () => {
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const store = new SaveStore('cursed-relic-hunter-3d-v1'); const data = await store.load();
    const s = data.run; s.expedition.room = 10; s.phase = 'explore'; s.gold = 20; s.player.x = 320; s.player.y = 245;
    await store.save(s, defaultSettings());
    return s.expedition.dungeon.rooms[1].chaliceHealed;
  });
  expect(savedHealing).toBe(12);
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.locator('#overlay')).toBeHidden(); await page.clock.runFor(50);
  await page.keyboard.press('e'); await page.locator('button[data-action="buy-2"]').click();
  await expect(page.locator('#overlay')).toBeHidden();
  const savedHp = await page.evaluate(async () => {
    const { SaveStore } = await import('/src/persistence/save.ts' as string);
    return (await new SaveStore('cursed-relic-hunter-3d-v1').load()).run.player.hp;
  });
  expect(savedHp).toBe(81);
  // The imported renderer updates HUD at 10Hz; advance at least one full HUD interval.
  await page.clock.runFor(120);
  await expect(page.locator('#hp')).toHaveText('81');
  await expect(page.locator('#weapon-stats')).toContainText('탄환당 피해 9.45 (+35%)');
  await expect(page.locator('#crown-status')).toHaveText('태양의 왕관 · 발동 중 +35%');
});

test('firing and projectile relics keep the combined HUD and prompts readable in a short window', async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 480 }); await page.goto('/');
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { grantRelic } = await import('/src/core/relic-acquisition.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const s = createDungeonRun(42);
    for (const [i, id] of ['R52', 'R55'].entries()) {
      const room = s.expedition.dungeon.rooms[6 + i]; room.visited = room.cleared = true;
      room.reward = { room: room.id, candidates: [id], choice: id }; grantRelic(s, id);
    }
    const shopRoom = s.expedition.dungeon.rooms[10]; shopRoom.visited = shopRoom.cleared = true;
    shopRoom.shop = { revision: 3, slots: [
      { kind: 'relic', relic: 'R51', purchased: true, repairCounter: 0 },
      { kind: 'relic', relic: 'R57', purchased: true, repairCounter: 0 },
      { kind: 'heal', relic: null, purchased: false, repairCounter: 0 },
      { kind: 'curse', relic: 'R43', purchased: false, repairCounter: 0 },
    ] };
    grantRelic(s, 'R51'); grantRelic(s, 'R57');
    s.expedition.room = 10; s.player.x = 320; s.player.y = 245; s.view = { yaw: -Math.PI / 2, pitch: 0 };
    const store = new SaveStore('cursed-relic-hunter-3d-v1'); await store.load(); await store.save(s, defaultSettings());
  });
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.locator('#overlay')).toBeHidden(); await page.clock.runFor(80);
  await expect(page.locator('#weapon-stats')).toContainText('발사 간격 0.36초');
  await expect(page.locator('#fang-status')).toHaveText('결사의 송곳니 · 생명력 50% 이하에서 발동');
  await expect(page.locator('#crown-status')).toHaveText('태양의 왕관 · 발동 중 +35%');
  const hud = await page.locator('.bottom-hud').boundingBox(), prompt = await page.locator('#interact').boundingBox();
  expect(hud!.y).toBeGreaterThanOrEqual(0); expect(hud!.x + hud!.width).toBeLessThanOrEqual(640);
  const panels = await page.locator('.vitals, .abilities, .weapon-hud, .location, .mini-map').evaluateAll(nodes => nodes.map(n => {
    const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom };
  }));
  for (const panel of panels) expect(prompt!.x + prompt!.width <= panel.x || prompt!.x >= panel.right
    || prompt!.y + prompt!.height <= panel.y || prompt!.y >= panel.bottom).toBe(true);
  await expect(page.locator('#capture-hint')).toBeHidden();
  expect(await page.locator('.weapon-hud').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: 'graphics-review/relic-expansion/short-hud.png' });
  await page.keyboard.press('i');
  await expect(page.locator('.inventory-grid .relic-card b')).toHaveText(['정밀 손목띠', '바람의 화살깃', '결사의 송곳니', '태양의 왕관']);
});
