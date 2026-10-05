import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); };
  });
});

test('stone reader, fixed warning and clipped horizontal laser render and release GPU resources', async ({ page }) => {
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
    const host = document.createElement('div'); host.id = 'reader-preview';
    host.style.cssText = 'position:fixed;inset:0;width:960px;height:600px;z-index:9999'; document.body.append(host);
    const world = new World(host); await new Promise(requestAnimationFrame); world.paint(run, Math.PI, -.15, false, true);
    (window as any).readerPreview = { world, run }; document.getElementById('overlay')!.hidden = true;
  });
  const result = await page.evaluate(async () => {
    const { world, run } = (window as any).readerPreview;
    const { advanceEnemies } = await import('/src/core/enemy-ai.ts' as string);
    const { step, emptyInput } = await import('/src/core/simulation.ts' as string);
    const { statueLaserEnd } = await import('/src/core/reader-statue.ts' as string);
    world.paint(run, Math.PI, -.15, false, true);
    const before = { ...world.renderer.info.memory }, phases = [];
    const find = (name: string) => {
      let found: any; for (const g of world.entities.values()) g.traverse((o: any) => { if (o.name === name) found = o; }); return found;
    };
    for (let i = 0; i < 5; i++) {
      run.player.x = 500; run.player.y = 180; run.player.invulnerable = 0; run.player.hp = 100;
      const e = { id: run.nextId++, kind: 'readerstatue', x: 320, y: 180, hp: 100, maxHp: 100,
        angle: 0, mode: 'move', timer: 0, targetX: 500, targetY: 180, flash: 0, laserTicks: undefined };
      run.enemies = [e]; advanceEnemies(run, { x: 0, y: 0 }); world.paint(run, Math.PI, -.15, false, true);
      const figure = world.entities.get(`enemy-${e.id}`), warning = find('reader-warning'), aim = find('reader-aim-ray');
      const pos = aim.position.clone(), facing = aim.rotation.y;
      run.player.y = 190; advanceEnemies(run, { x: 0, y: 0 }); world.paint(run, Math.PI, -.15, false, true);
      const phase: any = { book: !!figure.getObjectByName('reader-book'), focus: !!figure.getObjectByName('reader-focus'),
        warningWidth: warning.geometry.parameters.depth, fixed: aim.position.equals(pos) && aim.rotation.y === facing };
      run.player.y = 180; e.timer = 1; step(run, emptyInput()); world.paint(run, Math.PI, -.15, false, true);
      const beam = find('reader-laser');
      phase.beam = { length: beam.geometry.parameters.width, height: beam.position.y, thickness: beam.geometry.parameters.height,
        width: beam.geometry.parameters.depth, x: beam.position.x / .04 + 320, y: beam.position.z / .04 + 183 };
      phase.end = statueLaserEnd(run, e); phase.warningGone = !find('reader-warning'); phase.hp = run.player.hp;
      for (let tick = 0; tick < 12; tick++) advanceEnemies(run, { x: 0, y: 0 }); world.paint(run, Math.PI, -.15, false, true);
      phase.beamGone = !find('reader-laser'); phases.push(phase);
      run.enemies = []; run.cues = []; world.paint(run, Math.PI, -.15, false, true);
    }
    const e = { id: run.nextId++, kind: 'readerstatue', x: 220, y: 180, hp: 100, maxHp: 100,
      angle: Math.PI / 2, mode: 'windup', timer: 1, targetX: 220, targetY: 210, flash: 0 };
    run.player.x = 220; run.player.y = 210; run.enemies = [e];
    advanceEnemies(run, { x: 0, y: 0 }); world.paint(run, Math.PI, -.15, false, true);
    const clipped = { end: statueLaserEnd(run, e), length: find('reader-laser').geometry.parameters.width };
    run.enemies = []; run.cues = []; world.paint(run, Math.PI, -.15, false, true);
    return { before, after: { ...world.renderer.info.memory }, phases, clipped, locked: !!document.pointerLockElement };
  });
  expect(errors).toEqual([]); expect(result.locked).toBe(false);
  for (const phase of result.phases) {
    expect(phase.book).toBe(true); expect(phase.focus).toBe(true); expect(phase.fixed).toBe(true);
    expect(phase.warningWidth).toBeCloseTo(12 * .04); expect(phase.beam.width).toBeCloseTo(phase.warningWidth);
    expect(phase.beam.height).toBeCloseTo(34 * .04); expect(phase.beam.thickness).toBeCloseTo(4 * .04);
    expect(phase.beam.length).toBeCloseTo(420 * .04); expect(phase.beam.x).toBeCloseTo(530); expect(phase.beam.y).toBeCloseTo(180);
    expect(phase.end.x).toBeCloseTo(740); expect(phase.end.y).toBeCloseTo(180);
    expect(phase.warningGone).toBe(true); expect(phase.beamGone).toBe(true); expect(phase.hp).toBe(82);
  }
  expect(result.clipped.end.x).toBeCloseTo(220); expect(result.clipped.end.y).toBeCloseTo(224);
  expect(result.clipped.length).toBeCloseTo(44 * .04);
  expect(result.after.geometries).toBeLessThanOrEqual(result.before.geometries + 1);
  expect(result.after.textures).toBeLessThanOrEqual(result.before.textures + 1);
  for (const phase of ['warning', 'laser']) {
    await page.evaluate(async phase => {
      const { world, run } = (window as any).readerPreview;
      const { advanceEnemies } = await import('/src/core/enemy-ai.ts' as string);
      run.player.x = 500; run.player.y = 180;
      const e = { id: run.nextId++, kind: 'readerstatue', x: 320, y: 180, hp: 100, maxHp: 100,
        angle: 0, mode: 'move', timer: 0, targetX: 500, targetY: 180, flash: 0 };
      run.enemies = [e]; advanceEnemies(run, { x: 0, y: 0 });
      if (phase === 'laser') { e.timer = 1; advanceEnemies(run, { x: 0, y: 0 }); }
      run.player.x = 440; run.player.y = 210; world.paint(run, Math.atan2(-30, -120), -.13, false, true);
    }, phase);
    await page.locator('#reader-preview').screenshot({ path: `test-results/reader-${phase}.png` });
  }
});

test('prepared and visible lasers survive real continue, pause-save and reload without mouse capture', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  for (const phase of ['warning', 'laser']) {
    await page.evaluate(async phase => {
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
      const e = { id: run.nextId++, kind: 'readerstatue', x: 320, y: 180, hp: 100, maxHp: 100,
        angle: 0, mode: 'move', timer: 0, targetX: 500, targetY: 180, flash: 0 };
      run.enemies = [e]; advanceEnemies(run, { x: 0, y: 0 });
      if (phase === 'laser') { e.timer = 1; advanceEnemies(run, { x: 0, y: 0 }); }
      const store = new SaveStore(); await store.load(); await store.save(run, defaultSettings());
    }, phase);
    if (phase === 'warning') {
      await page.clock.install({ time: new Date('2026-10-05T00:00:00Z') });
      await page.clock.pauseAt(new Date('2026-10-05T00:01:00Z'));
    }
    await page.reload(); await page.clock.runFor(100);
    await page.getByRole('button', { name: '탐험 이어하기' }).evaluate((el: HTMLElement) => el.click());
    await page.clock.runFor(32); await page.locator('#pause-button').evaluate((el: HTMLElement) => el.click());
    await expect(page.locator('#save-status')).toContainText('탐험 저장됨');
    const read = () => page.evaluate(async () => {
      const { SaveStore } = await import('/src/persistence/save.ts' as string);
      const store = new SaveStore(), record = await store.load(); return { enemy: record.run.enemies[0], locked: !!document.pointerLockElement };
    });
    const saved = await read(); expect(saved.enemy.kind).toBe('readerstatue'); expect(saved.locked).toBe(false);
    expect(saved.enemy.mode).toBe(phase === 'warning' ? 'windup' : 'recover'); expect(saved.enemy.angle).toBe(0);
    expect(saved.enemy.targetX).toBe(500); expect(saved.enemy.targetY).toBe(180);
    if (phase === 'laser') expect(saved.enemy.laserTicks).toBeGreaterThan(0);
    await expect(page.locator('#overlay')).toHaveAttribute('data-mode', 'pause');
    await page.clock.fastForward(2000); expect(await read()).toEqual(saved);
    await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).evaluate((el: HTMLElement) => el.click());
    await page.clock.runFor(32); await page.locator('#pause-button').evaluate((el: HTMLElement) => el.click());
    await expect(page.locator('#save-status')).toContainText('탐험 저장됨');
    const restored = await read(); expect(restored.enemy.mode).toBe(saved.enemy.mode); expect(restored.enemy.timer).toBeLessThanOrEqual(saved.enemy.timer);
    expect(restored.enemy.angle).toBe(saved.enemy.angle); expect(restored.enemy.targetX).toBe(saved.enemy.targetX);
    if (phase === 'laser') expect(restored.enemy.laserTicks).toBeGreaterThan(0);
  }
  expect(errors).toEqual([]);
});
