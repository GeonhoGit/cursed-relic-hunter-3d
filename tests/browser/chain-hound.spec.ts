import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); };
  });
});

test('armored hound and inward pull warning match combat geometry and release GPU resources', async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(async () => {
    const { World } = await import('/src/game/world.ts' as string);
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { createBoss } = await import('/src/core/boss.ts' as string);
    const { enterNextRegion } = await import('/src/core/region.ts' as string);
    const run = createDungeonRun(42);
    run.expedition.room = 8; run.expedition.dungeon.rooms[8].visited = run.expedition.dungeon.rooms[8].cleared = true;
    run.boss = createBoss(run); run.boss.hp = 0; run.phase = 'cleared'; enterNextRegion(run);
    run.expedition.room = 1; const room = run.expedition.dungeon.rooms[1]; room.visited = true;
    delete room.structure; room.template = 0; run.phase = 'combat'; run.enemies = [];
    run.player.x = 500; run.player.y = 180;
    const host = document.createElement('div'); host.id = 'hound-preview';
    host.style.cssText = 'position:fixed;inset:0;width:960px;height:600px;z-index:9999'; document.body.append(host);
    const world = new World(host); await new Promise(requestAnimationFrame); world.paint(run, Math.PI, -.22, false, true);
    (window as any).houndPreview = { world, run }; document.getElementById('overlay')!.hidden = true;
  });
  const result = await page.evaluate(async () => {
    const { world, run } = (window as any).houndPreview;
    const { advanceEnemies } = await import('/src/core/enemy-ai.ts' as string);
    const { step, emptyInput } = await import('/src/core/simulation.ts' as string);
    world.paint(run, Math.PI, -.22, false, true);
    const before = { ...world.renderer.info.memory }, phases = [];
    for (let i = 0; i < 5; i++) {
      run.player.x = 500; run.player.y = 180; run.player.invulnerable = 0; run.player.hp = 100;
      const e = { id: run.nextId++, kind: 'chainhound', x: 440, y: 180, hp: 85, maxHp: 85,
        angle: 0, mode: 'move', timer: 0, targetX: 500, targetY: 180, flash: 0 };
      run.enemies = [e]; advanceEnemies(run, { x: 0, y: 0 }); world.paint(run, Math.PI, -.22, false, true);
      const figure = world.entities.get(`enemy-${e.id}`); let zone: any, arrows: any;
      for (const g of world.entities.values()) g.traverse((o: any) => {
        if (o.name === 'hound-pull-zone') zone = o; if (o.name === 'hound-pull-arrows') arrows = o;
      });
      const fixed = zone.parent.position.clone(), facing = zone.parent.rotation.y;
      run.player.y = 185; advanceEnemies(run, { x: 0, y: 0 }); world.paint(run, Math.PI, -.22, false, true);
      const phase: any = { body: !!figure.getObjectByName('chain-hound-body'), collar: !!figure.getObjectByName('hound-collar'),
        feet: [0, 1, 2, 3].every(n => !!figure.getObjectByName(`foot-${n}`)), radius: zone.geometry.parameters.radius,
        sweep: zone.geometry.parameters.thetaLength, paths: arrows.children.length,
        fixed: zone.parent.position.equals(fixed) && zone.parent.rotation.y === facing,
        x: zone.parent.position.x / .04 + 320, y: zone.parent.position.z / .04 + 183 };
      run.player.y = 180; e.timer = 1; step(run, emptyInput()); world.paint(run, Math.PI, -.22, false, true);
      let warningGone = true;
      for (const g of world.entities.values()) g.traverse((o: any) => { if (o.name === 'hound-pull-zone') warningGone = false; });
      phase.warningGone = warningGone; phase.hp = run.player.hp; phase.pulledX = run.player.x; phases.push(phase);
      run.enemies = []; run.cues = []; world.paint(run, Math.PI, -.22, false, true);
    }
    return { before, after: { ...world.renderer.info.memory }, phases, locked: !!document.pointerLockElement };
  });
  expect(errors).toEqual([]); expect(result.locked).toBe(false);
  for (const phase of result.phases) {
    expect(phase.body).toBe(true); expect(phase.collar).toBe(true); expect(phase.feet).toBe(true);
    expect(phase.radius).toBeCloseTo(84 * .04); expect(phase.sweep).toBeCloseTo(100 * Math.PI / 180);
    expect(phase.paths).toBe(3); expect(phase.fixed).toBe(true); expect(phase.x).toBeCloseTo(440); expect(phase.y).toBeCloseTo(180);
    expect(phase.warningGone).toBe(true); expect(phase.hp).toBe(86); expect(phase.pulledX).toBeCloseTo(470);
  }
  expect(result.after.geometries).toBeLessThanOrEqual(result.before.geometries + 1);
  expect(result.after.textures).toBeLessThanOrEqual(result.before.textures + 1);
  await page.evaluate(async () => {
    const { world, run } = (window as any).houndPreview;
    const { advanceEnemies } = await import('/src/core/enemy-ai.ts' as string);
    run.player.x = 500; run.player.y = 180;
    run.enemies = [{ id: run.nextId++, kind: 'chainhound', x: 440, y: 180, hp: 85, maxHp: 85,
      angle: 0, mode: 'move', timer: 0, targetX: 500, targetY: 180, flash: 0 }];
    advanceEnemies(run, { x: 0, y: 0 }); run.player.x = 570;
    world.paint(run, Math.PI, -.3, false, true);
  });
  await page.locator('#hound-preview').screenshot({ path: 'test-results/hound-warning.png' });
  await page.evaluate(() => {
    const { world, run } = (window as any).houndPreview; run.player.x = 530;
    world.paint(run, Math.PI, -.22, false, true);
  });
  await page.locator('#hound-preview').screenshot({ path: 'test-results/chain-hound.png' });
});

test('a pending bite survives continue, pause-save and reload without capturing the mouse', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { createBoss } = await import('/src/core/boss.ts' as string);
    const { enterNextRegion } = await import('/src/core/region.ts' as string);
    const { advanceEnemies } = await import('/src/core/enemy-ai.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const run = createDungeonRun(42);
    run.expedition.room = 8; run.expedition.dungeon.rooms[8].visited = run.expedition.dungeon.rooms[8].cleared = true;
    run.boss = createBoss(run); run.boss.hp = 0; run.phase = 'cleared'; enterNextRegion(run);
    run.expedition.room = 1; const room = run.expedition.dungeon.rooms[1]; room.visited = true; delete room.structure; room.template = 0;
    run.phase = 'combat'; run.player.x = 500; run.player.y = 180;
    run.enemies = [{ id: run.nextId++, kind: 'chainhound', x: 440, y: 180, hp: 85, maxHp: 85,
      angle: 0, mode: 'move', timer: 0, targetX: 500, targetY: 180, flash: 0 }];
    advanceEnemies(run, { x: 0, y: 0 }); const store = new SaveStore(); await store.load(); await store.save(run, defaultSettings());
  });
  await page.clock.install({ time: new Date('2026-10-04T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-04T00:01:00Z')); await page.reload(); await page.clock.runFor(100);
  await page.getByRole('button', { name: '탐험 이어하기' }).evaluate((el: HTMLElement) => el.click());
  await page.clock.runFor(100); await page.locator('#pause-button').evaluate((el: HTMLElement) => el.click());
  await expect(page.locator('#save-status')).toContainText('탐험 저장됨');
  const read = () => page.evaluate(async () => {
    const { SaveStore } = await import('/src/persistence/save.ts' as string);
    const store = new SaveStore(), record = await store.load();
    return { enemy: record.run.enemies[0], playerX: record.run.player.x, locked: !!document.pointerLockElement };
  });
  const saved = await read(); expect(saved.enemy.kind).toBe('chainhound'); expect(saved.enemy.mode).toBe('windup');
  expect(saved.enemy.timer).toBeGreaterThan(0); expect(saved.enemy.timer).toBeLessThanOrEqual(48);
  expect(saved.enemy.targetX).toBe(500); expect(saved.enemy.targetY).toBe(180); expect(saved.playerX).toBe(500);
  await page.clock.runFor(2000); expect(await read()).toEqual(saved);
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).evaluate((el: HTMLElement) => el.click());
  await page.clock.runFor(100); await page.locator('#pause-button').evaluate((el: HTMLElement) => el.click());
  await expect(page.locator('#save-status')).toContainText('탐험 저장됨');
  const restored = await read(); expect(restored.enemy.kind).toBe('chainhound'); expect(restored.enemy.mode).toBe('windup');
  expect(restored.enemy.angle).toBe(saved.enemy.angle); expect(restored.enemy.timer).toBeLessThanOrEqual(saved.enemy.timer);
  expect(restored.enemy.targetX).toBe(saved.enemy.targetX); expect(restored.locked).toBe(false); expect(errors).toEqual([]);
});
