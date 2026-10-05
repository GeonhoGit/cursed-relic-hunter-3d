import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); };
  });
});

test('seal tablet and fixed circular warning render and release GPU resources', async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(async () => {
    const { World } = await import('/src/game/world.ts' as string);
    const { createRun } = await import('/src/core/simulation.ts' as string);
    const host = document.createElement('div'); host.id = 'seal-preview';
    host.style.cssText = 'position:fixed;inset:0;width:960px;height:600px;z-index:9999'; document.body.append(host);
    const world = new World(host), run = createRun(42); run.phase = 'combat'; run.enemies = [];
    run.player.x = 500; run.player.y = 180;
    await new Promise(requestAnimationFrame); world.paint(run, Math.PI, -.14, false, true);
    (window as any).sealPreview = { world, run }; document.getElementById('overlay')!.hidden = true;
  });
  const result = await page.evaluate(async () => {
    const { world, run } = (window as any).sealPreview;
    const { advanceEnemies } = await import('/src/core/enemy-ai.ts' as string);
    world.paint(run, Math.PI, -.14, false, true);
    const before = { ...world.renderer.info.memory }, phases = [];
    for (let i = 0; i < 5; i++) {
      run.player.x = 500;
      const e = { id: run.nextId++, kind: 'sealcaster', x: 320, y: 180, hp: 55, maxHp: 55,
        angle: 0, mode: 'move', timer: 0, targetX: 500, targetY: 180, flash: 0 };
      run.enemies = [e]; advanceEnemies(run, { x: 0, y: 0 }); world.paint(run, Math.PI, -.14, false, true);
      const figure = world.entities.get(`enemy-${e.id}`);
      let zone: any;
      for (const g of world.entities.values()) g.traverse((o: any) => { if (o.name === 'seal-blast-zone') zone = o; });
      const initialPosition = zone.parent.position.clone();
      run.player.x = 510; advanceEnemies(run, { x: 0, y: 0 }); world.paint(run, Math.PI, -.14, false, true);
      phases.push({ tablet: !!figure.getObjectByName('seal-tablet'), focus: !!figure.getObjectByName('seal-focus'),
        radius: zone.geometry.parameters.radius, sweep: zone.geometry.parameters.thetaLength,
        x: zone.parent.position.x / .04 + 320, y: zone.parent.position.z / .04 + 183,
        fixed: zone.parent.position.equals(initialPosition), targetX: e.targetX });
      e.timer = 1; const hits = advanceEnemies(run, { x: 0, y: 0 }); world.paint(run, Math.PI, -.14, false, true);
      let warningGone = true;
      for (const g of world.entities.values()) g.traverse((o: any) => { if (o.name === 'seal-blast-zone') warningGone = false; });
      phases[phases.length - 1].warningGone = warningGone;
      phases[phases.length - 1].hit = hits[0];
      run.enemies = []; run.cues = []; world.paint(run, Math.PI, -.14, false, true);
    }
    return { before, after: { ...world.renderer.info.memory }, phases, locked: !!document.pointerLockElement };
  });
  expect(errors).toEqual([]); expect(result.locked).toBe(false);
  for (const phase of result.phases) {
    expect(phase.tablet).toBe(true); expect(phase.focus).toBe(true); expect(phase.fixed).toBe(true);
    expect(phase.radius).toBeCloseTo(54 * .04); expect(phase.sweep).toBeCloseTo(Math.PI * 2);
    expect(phase.x).toBeCloseTo(500); expect(phase.y).toBeCloseTo(180); expect(phase.targetX).toBe(500);
    expect(phase.warningGone).toBe(true); expect(phase.hit).toMatchObject({ damage: 16, slow: true });
  }
  expect(result.after.geometries).toBeLessThanOrEqual(result.before.geometries + 1);
  expect(result.after.textures).toBeLessThanOrEqual(result.before.textures + 1);
  await page.evaluate(async () => {
    const { world, run } = (window as any).sealPreview;
    const { advanceEnemies } = await import('/src/core/enemy-ai.ts' as string);
    run.player.x = 500;
    run.enemies = [{ id: run.nextId++, kind: 'sealcaster', x: 320, y: 180, hp: 55, maxHp: 55,
      angle: 0, mode: 'move', timer: 0, targetX: 500, targetY: 180, flash: 0 }];
    advanceEnemies(run, { x: 0, y: 0 }); run.player.x = 625;
    world.paint(run, Math.PI, -.28, false, true);
  });
  await page.locator('#seal-preview').screenshot({ path: 'test-results/seal-warning.png' });
  await page.evaluate(() => {
    const { world, run } = (window as any).sealPreview; run.player.x = 450;
    world.paint(run, Math.PI, -.05, false, true);
  });
  await page.locator('#seal-preview').screenshot({ path: 'test-results/seal-caster.png' });
});

test('slow HUD and prepared blast survive pause and reload without capturing the mouse', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { createBoss } = await import('/src/core/boss.ts' as string);
    const { enterNextRegion } = await import('/src/core/region.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const run = createDungeonRun(42);
    run.expedition.room = 8; run.expedition.dungeon.rooms[8].visited = run.expedition.dungeon.rooms[8].cleared = true;
    run.boss = createBoss(run); run.boss.hp = 0; run.phase = 'cleared'; enterNextRegion(run);
    run.expedition.room = 1; run.expedition.dungeon.rooms[1].visited = true; run.phase = 'combat';
    run.player.x = 500; run.player.y = 180; run.player.slowTicks = 93; run.player.weakTicks = 80;
    run.enemies = [{ id: run.nextId++, kind: 'sealcaster', x: 320, y: 180, hp: 55, maxHp: 55,
      angle: 0, mode: 'windup', timer: 60, targetX: 500, targetY: 180, flash: 0 }];
    const store = new SaveStore(); await store.load(); await store.save(run, defaultSettings());
  });
  await page.clock.install({ time: new Date('2026-10-04T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-04T00:01:00Z')); await page.reload(); await page.clock.runFor(100);
  await page.getByRole('button', { name: '탐험 이어하기' }).evaluate((el: HTMLElement) => el.click());
  await page.clock.runFor(100);
  await expect(page.locator('#slow-status')).toBeVisible(); await expect(page.locator('#slow-status')).toContainText('걷기 −20%');
  await expect(page.locator('#weak-status')).toBeVisible();
  await page.locator('#pause-button').evaluate((el: HTMLElement) => el.click());
  await expect(page.locator('#save-status')).toContainText('탐험 저장됨');
  const paused = await page.locator('#slow-status').textContent(); await page.clock.runFor(2000);
  expect(await page.locator('#slow-status').textContent()).toBe(paused);
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).evaluate((el: HTMLElement) => el.click());
  await page.clock.runFor(100); await expect(page.locator('#slow-status')).toBeVisible();
  const saved = await page.evaluate(async () => {
    const { SaveStore } = await import('/src/persistence/save.ts' as string);
    const store = new SaveStore(), record = await store.load();
    return { slow: record.run.player.slowTicks, enemy: record.run.enemies[0], locked: !!document.pointerLockElement };
  });
  expect(saved.slow).toBeGreaterThan(0); expect(saved.slow).toBeLessThanOrEqual(93);
  expect(saved.enemy.kind).toBe('sealcaster'); expect(saved.enemy.mode).toBe('windup');
  expect(saved.enemy.targetX).toBe(500); expect(saved.enemy.targetY).toBe(180);
  expect(saved.enemy.timer).toBeGreaterThan(0); expect(saved.enemy.timer).toBeLessThanOrEqual(60);
  expect(saved.locked).toBe(false); expect(errors).toEqual([]);
});
