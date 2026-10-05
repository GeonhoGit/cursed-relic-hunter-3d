import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); };
  });
  await page.clock.install({ time: new Date('2026-10-05T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-05T00:00:00.032Z'));
});

test('tracker eye can be chosen as a rare relic and its description and inventory survive reload', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 640, height: 480 }); await page.goto('/');
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const s = createDungeonRun(42); s.expedition.room = 6; s.phase = 'cleared';
    const room = s.expedition.dungeon.rooms[6]; room.visited = room.cleared = true;
    room.reward = { room: 6, candidates: ['R05', 'R52', 'R56'], choice: null };
    s.player.x = 320; s.player.y = 217; s.view = { yaw: -Math.PI / 2, pitch: 0 };
    const store = new SaveStore('cursed-relic-hunter-3d-v1'); await store.load(); await store.save(s, defaultSettings());
  });
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  const card = page.locator('button[data-action="choose-R05"]');
  await expect(card.locator('.rarity-badge')).toHaveText('희귀');
  await expect(card).toContainText('6m'); await expect(card).toContainText('60°');
  await expect(card).toContainText('벽 너머');
  expect(await page.locator('#panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await card.click(); await expect(page.locator('#overlay')).toBeHidden(); await page.clock.runFor(50);
  await expect(page.locator('#weapon-stats')).toContainText('탄환당 피해 7');
  await expect(page.locator('#weapon-stats')).toContainText('발사 간격 0.40초');
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await page.keyboard.press('i');
  await expect(page.locator('.inventory-grid .relic-card b')).toHaveText('추적자의 눈');
  await expect(page.locator('.inventory-grid .rarity-badge')).toHaveText('희귀');
  await expect(page.locator('.inventory-grid .relic-card')).toContainText('귀환 중에는 플레이어');
  await page.locator('.inventory-grid .relic-card p').scrollIntoViewIfNeeded();
  await expect(page.locator('.inventory-grid .relic-card b')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.inventory-grid .relic-card p')).toBeInViewport({ ratio: .8 });
  await page.setViewportSize({ width: 960, height: 700 }); await page.clock.runFor(50);
  await page.screenshot({ path: 'graphics-review/tracker-eye/inventory.png' });
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false); expect(errors).toEqual([]);
});

test('golden guided projectiles render along their curved positions, hit normally and release GPU resources', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 960, height: 600 }); await page.goto('/');
  const rendered = await page.evaluate(async () => {
    const { World } = await import('/src/game/world.ts' as string);
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { advanceProjectiles } = await import('/src/core/combat.ts' as string);
    const s = createDungeonRun(42); s.expedition.room = 1;
    const room = s.expedition.dungeon.rooms[1]; room.visited = true; room.template = 0; delete room.structure;
    s.phase = 'combat'; s.expedition.relics = s.expedition.acquired = ['R05'];
    s.player.x = 280; s.player.y = 180; s.view = { yaw: 0, pitch: -.06 };
    document.getElementById('overlay')!.hidden = true;
    const host = document.createElement('div'); host.id = 'homing-preview';
    host.style.cssText = 'position:fixed;inset:0;width:960px;height:600px;z-index:9999'; document.body.append(host);
    const world = new World(host); world.paint(s, 0, -.06, false, true);
    const before = { ...world.renderer.info.memory };
    const enemy = { id: s.nextId++, kind: 'archer', x: 400, y: 200, hp: 40, maxHp: 40,
      mode: 'recover', timer: 0, angle: Math.PI, targetX: 280, targetY: 180, flash: 0 };
    s.enemies = [enemy];
    const b = { id: s.nextId++, x: 300, y: 180, vx: 320, vy: 0, height: 34, heightVelocity: 0,
      owner: 'player', damage: 7, life: 75, hitIds: [] };
    s.bullets = [b];
    for (let i = 0; i < 7; i++) { s.tick++; advanceProjectiles(s); }
    world.paint(s, 0, -.06, false, true);
    const group = world.entities.get(`bullet-${b.id}`), mesh = group.children.find((o: any) => o.isMesh);
    (window as any).homingPreview = { world, s, enemy, before };
    return { color: mesh.material.color.getHex(), y: b.y, vy: b.vy,
      renderedX: group.position.x, renderedY: group.position.y, renderedZ: group.position.z,
      x: b.x, height: b.height };
  });
  expect(rendered.color).toBe(0xffd98a); expect(rendered.vy).toBeGreaterThan(0); expect(rendered.y).toBeGreaterThan(180);
  expect(rendered.renderedX).toBeCloseTo((rendered.x - 320) * .04);
  expect(rendered.renderedY).toBeCloseTo(rendered.height * .04);
  expect(rendered.renderedZ).toBeCloseTo((rendered.y - 183) * .04);
  await page.clock.runFor(50);
  await page.evaluate(() => {
    const { world, s } = (window as any).homingPreview;
    world.paint(s, 0, -.06, false, true);
  });
  await page.locator('#homing-preview').screenshot({ path: 'graphics-review/tracker-eye/guided-shot.png' });
  const final = await page.evaluate(async () => {
    const { world, s, enemy, before } = (window as any).homingPreview;
    const { advanceProjectiles } = await import('/src/core/combat.ts' as string);
    for (let i = 0; i < 20; i++) { s.tick++; advanceProjectiles(s); }
    const hp = enemy.hp;
    for (let cycle = 0; cycle < 5; cycle++) {
      s.bullets = Array.from({ length: 10 }, (_, i) => ({ id: s.nextId++, x: 300, y: 180 + i,
        vx: 320, vy: 0, height: 34, heightVelocity: 0, owner: 'player', damage: 7, life: 75 }));
      world.paint(s, 0, -.06, false, true); s.bullets = []; s.enemies = []; s.cues = [];
      world.paint(s, 0, -.06, false, true);
    }
    const result = { hp, bulletsGone: [...world.entities.keys()].every((key: any) => !key.startsWith('bullet-')),
      before, after: { ...world.renderer.info.memory }, locked: !!document.pointerLockElement };
    world.renderer.dispose(); document.getElementById('homing-preview')!.remove(); return result;
  });
  expect(final.hp).toBe(33); expect(final.bulletsGone).toBe(true);
  expect(final.after.geometries).toBeLessThanOrEqual(final.before.geometries + 1);
  expect(final.after.textures).toBeLessThanOrEqual(final.before.textures + 1);
  expect(final.locked).toBe(false); expect(errors).toEqual([]);
});
