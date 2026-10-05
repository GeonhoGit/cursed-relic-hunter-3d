import { expect, test } from '@playwright/test';

test('rift staff, reserved portals and violet seal shots render without leaking GPU resources', async ({ page }) => {
  test.setTimeout(60000); const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const w = '/src/game/world.ts', s = '/src/core/simulation.ts', a = '/src/core/enemy-ai.ts';
    const { World } = await import(w), { createRun } = await import(s), { advanceEnemies } = await import(a);
    const host = document.createElement('div'); host.style.cssText = 'width:640px;height:400px'; document.body.append(host);
    const world = new World(host), run = createRun(42); run.phase = 'combat'; run.enemies = [];
    run.player.x = 500; run.player.y = 180; await new Promise(requestAnimationFrame);
    world.paint(run, Math.PI, 0, false, false); const before = { ...world.renderer.info.memory };
    let staff = false, portals = 0, sealColor = 0;
    for (let repeat = 0; repeat < 5; repeat++) {
      delete run.riftSummonUsed;
      const e = { id: run.nextId++, kind: 'riftshaman', x: 320, y: 180, hp: 80, maxHp: 80,
        angle: 0, mode: 'move', timer: 0, targetX: 500, targetY: 180, flash: 0 };
      run.enemies = [e]; advanceEnemies(run, { x: 0, y: 0 }); world.paint(run, Math.PI, 0, false, false);
      staff = !!world.entities.get(`enemy-${e.id}`)?.getObjectByName('rift-staff');
      portals = 0; for (const g of world.entities.values()) g.traverse((o: any) => { if (o.name === 'rift-spawn') portals++; });
      e.timer = 1; advanceEnemies(run, { x: 0, y: 0 }); world.paint(run, Math.PI, 0, false, false);
      e.mode = 'move'; e.timer = 0; advanceEnemies(run, { x: 0, y: 0 }); e.timer = 1; advanceEnemies(run, { x: 0, y: 0 });
      world.paint(run, Math.PI, 0, false, false);
      const b = run.bullets.find((b: any) => b.source === 'riftshaman');
      sealColor = b ? world.entities.get(`bullet-${b.id}`).children[0].material.color.getHex() : 0;
      run.enemies = []; run.bullets = []; world.paint(run, Math.PI, 0, false, false);
    }
    const after = { ...world.renderer.info.memory }; host.remove(); return { before, after, staff, portals, sealColor, locked: !!document.pointerLockElement };
  });
  expect(errors).toEqual([]); expect(result.locked).toBe(false); expect(result.staff).toBe(true);
  expect(result.portals).toBe(2); expect(result.sealColor).toBe(0xd09cef);
  expect(result.after.geometries).toBeLessThanOrEqual(result.before.geometries + 1);
  expect(result.after.textures).toBeLessThanOrEqual(result.before.textures + 1);
});

test('weakness HUD and reserved summons survive pause and reload without locking the mouse', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = function () { throw new Error('Background test does not capture the mouse'); };
  });
  await page.goto('/');
  await page.evaluate(async () => {
    const s = '/src/core/simulation.ts', b = '/src/core/boss.ts', r = '/src/core/region.ts', a = '/src/core/enemy-ai.ts', p = '/src/persistence/save.ts';
    const { createDungeonRun } = await import(s), { createBoss } = await import(b), { enterNextRegion } = await import(r), { advanceEnemies } = await import(a), { SaveStore, defaultSettings } = await import(p);
    const run = createDungeonRun(42);
    for (let i = 0; i < 2; i++) {
      run.expedition.room = 8; run.expedition.dungeon.rooms[8].visited = run.expedition.dungeon.rooms[8].cleared = true;
      run.boss = createBoss(run); run.boss.hp = 0; run.phase = 'cleared'; enterNextRegion(run);
    }
    run.expedition.room = 1; run.expedition.dungeon.rooms[1].visited = true; run.phase = 'combat'; run.player.x = 500; run.player.y = 180;
    run.player.weakTicks = 123;
    run.enemies = [{ id: run.nextId++, kind: 'riftshaman', x: 320, y: 180, hp: 80, maxHp: 80, angle: 0, mode: 'move', timer: 0, targetX: 500, targetY: 180, flash: 0 }];
    advanceEnemies(run, { x: 0, y: 0 }); const store = new SaveStore(); await store.load(); await store.save(run, defaultSettings());
  });
  await page.clock.install({ time: new Date('2026-10-04T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-04T00:01:00Z')); await page.reload();
  await page.clock.runFor(100);
  await page.getByRole('button', { name: '탐험 이어하기' }).evaluate((el: HTMLElement) => el.click());
  await page.clock.runFor(100);
  await expect(page.locator('#weak-status')).toBeVisible(); await expect(page.locator('#weak-status')).toContainText('피해 −20%');
  await page.locator('#pause-button').evaluate((el: HTMLElement) => el.click());
  await expect(page.locator('#save-status')).toContainText('탐험 저장됨');
  const paused = await page.locator('#weak-status').textContent(); await page.clock.runFor(2000);
  expect(await page.locator('#weak-status').textContent()).toBe(paused);
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).evaluate((el: HTMLElement) => el.click());
  await page.clock.runFor(100); await expect(page.locator('#weak-status')).toBeVisible();
  const saved = await page.evaluate(async () => {
    const p = '/src/persistence/save.ts'; const { SaveStore } = await import(p); const store = new SaveStore(); const record = await store.load();
    return { weak: record.run.player.weakTicks, points: record.run.enemies[0].summonPoints.length, used: record.run.riftSummonUsed, locked: !!document.pointerLockElement };
  });
  expect(saved.weak).toBeGreaterThan(0); expect(saved.points).toBe(2); expect(saved.used).toBe(true); expect(saved.locked).toBe(false);
});
