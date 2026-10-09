import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); }; });
  await page.clock.install({ time: new Date('2026-10-06T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-06T00:00:00.032Z'));
});

test('new relic selection, grades and orbit HUD survive a real save and reload', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const s = createDungeonRun(42); s.expedition.room = 6; s.phase = 'cleared';
    const room = s.expedition.dungeon.rooms[6]; room.visited = room.cleared = true;
    room.reward = { room: 6, candidates: ['R06', 'R10', 'R23'], choice: null }; s.player.x = 320; s.player.y = 217;
    const store = new SaveStore('cursed-relic-hunter-3d-v1'); await store.load(); await store.save(s, defaultSettings());
  });
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.locator('[data-action="choose-R06"] .rarity-badge')).toHaveText('희귀');
  await expect(page.locator('[data-action="choose-R10"] .rarity-badge')).toHaveText('영웅');
  await expect(page.locator('[data-action="choose-R23"] .rarity-badge')).toHaveText('일반');
  await page.locator('[data-action="choose-R06"]').click(); await expect(page.locator('#overlay')).toBeHidden();
  await page.clock.runFor(120); await expect(page.locator('#passive-R06')).toHaveText('궤도 0/4회');
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await page.clock.runFor(120); await expect(page.locator('#passive-R06')).toHaveText('궤도 0/4회');
  await page.keyboard.press('i'); await expect(page.locator('.inventory-grid .relic-card b')).toHaveText('궤도 나침반');
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false); expect(errors).toEqual([]);
});

test('fields render at their combat positions, HUD fits a small window and expired geometry is disposed', async ({ page }) => {
  test.setTimeout(120000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 960, height: 600 }); await page.goto('/');
  await page.evaluate(async () => {
    const { World } = await import('/src/game/world.ts' as string);
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const s = createDungeonRun(42); s.expedition.room = 1; s.expedition.dungeon.rooms[1].visited = true;
    delete s.expedition.dungeon.rooms[1].structure; s.phase = 'combat'; s.enemies = [];
    s.player.x = 280; s.player.y = 180; s.view = { yaw: 0, pitch: -.18 };
    document.getElementById('world')!.style.visibility = 'hidden'; document.getElementById('overlay')!.hidden = true;
    document.getElementById('expedition')!.dataset.ui = ''; document.getElementById('expedition')!.style.zIndex = '1';
    const host = document.createElement('div'); host.id = 'field-preview'; host.style.cssText = 'position:fixed;inset:0;z-index:0'; document.body.append(host);
    const world = new World(host); world.setQuality(0); world.paint(s, 0, -.18, false, true, { reducedMotion: true });
    (window as any).fieldPreview = { world, s };
  });
  await page.waitForFunction(() => (window as any).fieldPreview.world.weaponLoads.get('W01')?.loaded);
  const rendered = await page.evaluate(async () => {
    const { world, s } = (window as any).fieldPreview;
    const { CombatHud } = await import('/src/game/hud.ts' as string);
    const { orbitPoint } = await import('/src/core/relic-fields.ts' as string);
    world.paint(s, 0, -.18, false, true, { reducedMotion: true }); (window as any).fieldPreview.before = { ...world.renderer.info.memory };
    s.expedition.relics = s.expedition.acquired = ['R06', 'R09', 'R10', 'R14', 'R15', 'R19', 'R21', 'R22', 'R23', 'R29'];
    Object.assign(s.player, { orbitCount: 3, gravityCooldown: 300, thornsCooldown: 60 });
    s.orbitShots = [{ id: s.nextId++, eventId: 0, ticks: 21, damage: 3.5, angle: 0, bouncesLeft: 0 }];
    s.gravityWell = { id: s.nextId++, eventId: 0, x: 360, y: 210, ticks: 90 };
    s.thornTrails = [{ id: s.nextId++, ticks: 120, damage: 4, points: [{ x: 300, y: 180 }, { x: 305, y: 180 }, { x: 310, y: 180 }] }];
    s.cues = [{ id: s.nextId++, kind: 'thorns', x: 280, y: 180, tick: s.tick, amount: 60 }];
    const hud = new CombatHud(); (window as any).fieldPreview.hud = hud;
    hud.update(s, { modal: '', yaw: 0, reducedMotion: true, mouseCaptured: true, noticeUntil: 0 });
    world.paint(s, 0, -.18, false, true, { reducedMotion: true });
    const orbit = world.entities.get(`relic-orbit-${s.orbitShots[0].id}`), well = world.entities.get(`relic-gravity-${s.gravityWell.id}`);
    const trail = world.entities.get(`relic-trail-${s.thornTrails[0].id}`), crown = world.entities.get(`relic-cue-${s.cues[0].id}`);
    (window as any).fieldPreview.instanceDisposals = 0;
    trail.children.forEach((mesh: any) => mesh.addEventListener('dispose', () => { (window as any).fieldPreview.instanceDisposals++; }));
    return { orbit: orbit.position.toArray(), point: orbitPoint(s, s.orbitShots[0]), well: well.position.toArray(),
      radius: well.children[0].geometry.parameters.radius, strips: trail.children[0].count, spikes: trail.children[1].count, crownRadius: crown.children[0].geometry.parameters.radius };
  });
  expect(rendered.orbit[0]).toBeCloseTo((rendered.point.x - 320) * .04); expect(rendered.orbit[1]).toBeCloseTo(rendered.point.height * .04);
  expect(rendered.well[0]).toBeCloseTo(40 * .04); expect(rendered.well[2]).toBeCloseTo(27 * .04); expect(rendered.radius).toBeCloseTo(64 * .04);
  expect(rendered.strips).toBe(3); expect(rendered.spikes).toBe(3); expect(rendered.crownRadius).toBeCloseTo(60 * .04);
  await expect(page.locator('#passive-R06')).toHaveText('궤도 3/4회'); await expect(page.locator('#passive-R10')).toHaveText('중력 5.0초');
  await expect(page.locator('#passive-R15')).toHaveText('가시 1/2개'); await expect(page.locator('#passive-R23')).toHaveText('왕관 1.0초');
  await page.screenshot({ path: 'graphics-review/relic-expansion-two/fields.png' });
  await page.setViewportSize({ width: 640, height: 480 }); await expect(page.locator('#passive-status')).toBeInViewport({ ratio: 1 });
  const layout = await page.locator('#passive-status').evaluate(el => {
    const abilities = document.querySelector('.abilities')!.getBoundingClientRect(), map = document.querySelector('.mini-map')!.getBoundingClientRect();
    return { belowMap: abilities.top >= map.bottom, widthFits: el.scrollWidth <= el.clientWidth + 1,
      childrenFit: [...el.children].every(child => child.scrollWidth <= child.clientWidth + 1) };
  });
  expect(layout).toEqual({ belowMap: true, widthFits: true, childrenFit: true });
  await page.screenshot({ path: 'graphics-review/relic-expansion-two/hud-small.png' });
  const cleaned = await page.evaluate(async () => {
    const { world, s, before } = (window as any).fieldPreview;
    const { clearRelicFields } = await import('/src/core/relic-fields.ts' as string);
    for (let i = 0; i < 5; i++) {
      world.paint(s, 0, 0, false, true, { reducedMotion: false });
      clearRelicFields(s); s.cues = []; s.expedition.relics = []; world.paint(s, 0, 0, false, true, { reducedMotion: false });
    }
    const result = { before, after: { ...world.renderer.info.memory }, instanceDisposals: (window as any).fieldPreview.instanceDisposals,
      keys: [...world.entities.keys()].filter((key: string) => key.startsWith('relic-')) };
    world.renderer.dispose(); document.getElementById('field-preview')!.remove(); return result;
  });
  expect(cleaned.keys).toEqual([]); expect(cleaned.instanceDisposals).toBe(2); expect(cleaned.after.geometries).toBeLessThanOrEqual(cleaned.before.geometries + 1);
  expect(cleaned.after.textures).toBeLessThanOrEqual(cleaned.before.textures + 1);
  expect(await page.evaluate(() => !!document.pointerLockElement)).toBe(false); expect(errors).toEqual([]);
});
