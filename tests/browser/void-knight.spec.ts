import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); };
  });
});

test('void sword, fixed destination and full circular slash render and release GPU resources', async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(async () => {
    const { World } = await import('/src/game/world.ts' as string);
    const { createRun } = await import('/src/core/simulation.ts' as string);
    const host = document.createElement('div'); host.id = 'void-preview';
    host.style.cssText = 'position:fixed;inset:0;width:960px;height:600px;z-index:9999'; document.body.append(host);
    const world = new World(host), run = createRun(42); run.phase = 'combat'; run.enemies = [];
    run.player.x = 500; run.player.y = 180;
    await new Promise(requestAnimationFrame); world.paint(run, Math.PI, -.12, false, true);
    (window as any).voidPreview = { world, run }; document.getElementById('overlay')!.hidden = true;
  });
  const result = await page.evaluate(async () => {
    const { world, run } = (window as any).voidPreview;
    const { advanceSpecialEnemy } = await import('/src/core/enemy-special.ts' as string);
    world.paint(run, Math.PI, -.12, false, true);
    const before = { ...world.renderer.info.memory }, phases = [];
    for (let i = 0; i < 5; i++) {
      const e = { id: run.nextId++, kind: 'voidknight', x: 320, y: 180, hp: 140, maxHp: 140,
        angle: 0, mode: 'move', timer: 0, targetX: 500, targetY: 180, flash: 0, blinkTarget: undefined };
      run.enemies = [e]; advanceSpecialEnemy(run, e); world.paint(run, Math.PI, -.12, false, true);
      const point = { ...e.blinkTarget }, figure = world.entities.get(`enemy-${e.id}`);
      let blink: any, slash: any;
      for (const g of world.entities.values()) g.traverse((o: any) => { if (o.name === 'void-blink-zone') blink = o; });
      const blinkData = { x: blink.parent.position.x / .04 + 320, y: blink.parent.position.z / .04 + 183,
        radius: blink.geometry.parameters.radius, color: blink.material.color.getHex() };
      e.timer = 1; advanceSpecialEnemy(run, e); world.paint(run, Math.PI, -.12, false, true);
      for (const g of world.entities.values()) g.traverse((o: any) => { if (o.name === 'void-slash-zone') slash = o; });
      phases.push({ sword: !!figure.getObjectByName('void-sword'), point, blink: blinkData,
        slash: { x: slash.parent.position.x / .04 + 320, y: slash.parent.position.z / .04 + 183,
          radius: slash.geometry.parameters.radius, sweep: slash.geometry.parameters.thetaLength, color: slash.material.color.getHex() },
        blinkGone: ![...world.entities.keys()].some((key: string) => key.endsWith('-blink')) });
      run.enemies = []; world.paint(run, Math.PI, -.12, false, true);
    }
    return { before, after: { ...world.renderer.info.memory }, phases, locked: !!document.pointerLockElement };
  });
  expect(errors).toEqual([]); expect(result.locked).toBe(false);
  for (const phase of result.phases) {
    expect(phase.sword).toBe(true); expect(phase.blinkGone).toBe(true);
    expect(phase.blink.x).toBeCloseTo(phase.point.x); expect(phase.blink.y).toBeCloseTo(phase.point.y);
    expect(phase.slash.x).toBeCloseTo(phase.point.x); expect(phase.slash.y).toBeCloseTo(phase.point.y);
    expect(phase.blink.radius).toBeCloseTo(96 * .04); expect(phase.slash.radius).toBeCloseTo(96 * .04);
    expect(phase.slash.sweep).toBeCloseTo(Math.PI * 2); expect(phase.slash.color).not.toBe(phase.blink.color);
  }
  expect(result.after.geometries).toBeLessThanOrEqual(result.before.geometries + 1);
  expect(result.after.textures).toBeLessThanOrEqual(result.before.textures + 1);
  for (const phase of ['blink', 'slash']) {
    await page.evaluate(async phase => {
      const { world, run } = (window as any).voidPreview;
      const { advanceSpecialEnemy } = await import('/src/core/enemy-special.ts' as string);
      run.player.x = 500; run.player.y = 180;
      const e = { id: run.nextId++, kind: 'voidknight', x: 320, y: 180, hp: 140, maxHp: 140, angle: 0,
        mode: 'move', timer: 0, targetX: 500, targetY: 180, flash: 0 };
      run.enemies = [e]; advanceSpecialEnemy(run, e);
      if (phase === 'slash') { e.timer = 1; advanceSpecialEnemy(run, e); }
      const point = e.blinkTarget ?? e;
      run.player.x = point.x + 125; run.player.y = point.y;
      world.paint(run, Math.PI, -.14, false, true);
    }, phase);
    await page.locator('#void-preview').screenshot({ path: `test-results/void-${phase}.png` });
  }
});

test('pending teleport survives the real continue and pause-save flow without capturing the mouse', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const target = await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { advanceSpecialEnemy } = await import('/src/core/enemy-special.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const { createBoss } = await import('/src/core/boss.ts' as string);
    const { enterNextRegion } = await import('/src/core/region.ts' as string);
    const run = createDungeonRun(42);
    for (let i = 0; i < 2; i++) {
      run.expedition.room = 8; const bossRoom = run.expedition.dungeon.rooms[8]; bossRoom.visited = bossRoom.cleared = true;
      run.boss = createBoss(run); run.boss.hp = 0; run.phase = 'cleared'; enterNextRegion(run);
    }
    run.expedition.room = 1;
    run.expedition.dungeon.rooms[1].visited = true; run.phase = 'combat'; run.player.x = 500; run.player.y = 180;
    const e = { id: run.nextId++, kind: 'voidknight', x: 320, y: 180, hp: 140, maxHp: 140, angle: 0,
      mode: 'move', timer: 0, targetX: 500, targetY: 180, flash: 0, blinkTarget: undefined };
    run.enemies = [e]; advanceSpecialEnemy(run, e);
    const store = new SaveStore(); await store.load(); await store.save(run, defaultSettings()); return e.blinkTarget;
  });
  await page.clock.install({ time: new Date('2026-10-04T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-04T00:01:00Z')); await page.reload(); await page.clock.runFor(100);
  await page.getByRole('button', { name: '탐험 이어하기' }).evaluate((el: HTMLElement) => el.click());
  await page.clock.runFor(100); await page.locator('#pause-button').evaluate((el: HTMLElement) => el.click());
  await expect(page.locator('#save-status')).toContainText('탐험 저장됨');
  const saved = await page.evaluate(async () => {
    const { SaveStore } = await import('/src/persistence/save.ts' as string);
    const store = new SaveStore(), record = await store.load();
    return { enemy: record.run.enemies[0], locked: !!document.pointerLockElement };
  });
  expect(saved.enemy.kind).toBe('voidknight'); expect(saved.enemy.mode).toBe('windup');
  expect(saved.enemy.blinkTarget).toEqual(target); expect(saved.enemy.timer).toBeGreaterThan(0);
  expect(saved.enemy.timer).toBeLessThanOrEqual(60); expect(saved.locked).toBe(false); expect(errors).toEqual([]);
});
