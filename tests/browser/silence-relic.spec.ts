import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); };
  });
});

test('bell cancels the visible blast warning, displays an interruption mark and releases GPU resources', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(async () => {
    const { World } = await import('/src/game/world.ts' as string);
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const run = createDungeonRun(42); run.expedition.room = 1;
    const room = run.expedition.dungeon.rooms[1]; room.visited = true; delete room.structure; room.template = 0;
    run.phase = 'combat'; run.player.x = 440; run.player.y = 210;
    run.expedition.relics = run.expedition.acquired = ['R11'];
    const host = document.createElement('div'); host.id = 'silence-preview';
    host.style.cssText = 'position:fixed;inset:0;width:960px;height:600px;z-index:9999'; document.body.append(host);
    const world = new World(host); await new Promise(requestAnimationFrame);
    world.paint(run, Math.atan2(-30, -120), -.13, false, true);
    (window as any).silencePreview = { world, run }; document.getElementById('overlay')!.hidden = true;
  });
  const result = await page.evaluate(async () => {
    const { world, run } = (window as any).silencePreview;
    const { advanceProjectiles } = await import('/src/core/combat.ts' as string);
    const { advanceEnemies } = await import('/src/core/enemy-ai.ts' as string);
    world.paint(run, Math.atan2(-30, -120), -.13, false, true);
    const before = { ...world.renderer.info.memory }, phases = [];
    const threatCount = () => [...world.entities.keys()].filter((k: any) => k.startsWith('tell-')).length;
    for (let i = 0; i < 5; i++) {
      const e = { id: run.nextId++, kind: 'sealcaster', x: 320, y: 180, hp: 55, maxHp: 55,
        mode: 'windup', timer: 40, targetX: 440, targetY: 210, angle: 0, flash: 0 };
      run.enemies = [e]; delete run.player.silenceCooldown;
      world.paint(run, Math.atan2(-30, -120), -.13, false, true); const warning = threatCount();
      const id = run.nextId++;
      run.bullets = [{ id, eventId: id, owner: 'player', x: 309, y: 180, vx: 320, vy: 0, damage: 7, life: 75 }];
      advanceProjectiles(run); world.paint(run, Math.atan2(-30, -120), -.13, false, true);
      const mark = world.entities.get(`silence-${e.id}`);
      phases.push({ warning, canceled: threatCount() === 0, mark: mark?.name, hp: e.hp, cooldown: run.player.silenceCooldown });
      if (i === 4) break;
      for (let n = 0; n < 60; n++) advanceEnemies(run, { x: 0, y: 0 });
      run.enemies = []; run.cues = []; world.paint(run, Math.atan2(-30, -120), -.13, false, true);
    }
    return { phases, before, locked: !!document.pointerLockElement };
  });
  for (const phase of result.phases) {
    expect(phase.warning).toBeGreaterThan(0); expect(phase.canceled).toBe(true); expect(phase.mark).toBe('silence-mark');
    expect(phase.hp).toBe(48); expect(phase.cooldown).toBe(360);
  }
  await page.locator('#silence-preview').screenshot({ path: 'test-results/silence-mark.png' });
  const after = await page.evaluate(async () => {
    const { world, run } = (window as any).silencePreview;
    const { advanceEnemies } = await import('/src/core/enemy-ai.ts' as string);
    for (let n = 0; n < 60; n++) advanceEnemies(run, { x: 0, y: 0 });
    world.paint(run, Math.atan2(-30, -120), -.13, false, true);
    const gone = !world.entities.get(`silence-${run.enemies[0].id}`);
    run.enemies = []; run.cues = []; world.paint(run, Math.atan2(-30, -120), -.13, false, true);
    return { gone, memory: { ...world.renderer.info.memory } };
  });
  expect(after.gone).toBe(true); expect(after.memory.geometries).toBeLessThanOrEqual(result.before.geometries + 1);
  expect(after.memory.textures).toBeLessThanOrEqual(result.before.textures + 1);
  expect(result.locked).toBe(false); expect(errors).toEqual([]);
});

test('interrupted combat and bell cooldown survive continue, pause-save and reload without mouse capture', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { beginGrowthRun, emptyInvestment } = await import('/src/core/growth.ts' as string);
    const { advanceProjectiles } = await import('/src/core/combat.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const run = createDungeonRun(42); beginGrowthRun(run, emptyInvestment(), 'bell-browser');
    const rooms = run.expedition.dungeon.rooms;
    rooms[2].visited = rooms[2].cleared = true; rooms[6].visited = rooms[6].cleared = true;
    rooms[6].reward = { room: 6, candidates: ['R11'], choice: 'R11' };
    run.expedition.relics = run.expedition.acquired = ['R11'];
    run.expedition.room = 1; rooms[1].visited = true; delete rooms[1].structure; rooms[1].template = 0;
    run.phase = 'combat'; run.player.x = 90; run.player.y = 180;
    const e = { id: run.nextId++, kind: 'sealcaster', x: 150, y: 180, hp: 55, maxHp: 55,
      mode: 'windup', timer: 40, targetX: 90, targetY: 180, angle: Math.PI, flash: 0 };
    run.enemies = [e]; const id = run.nextId++;
    run.bullets = [{ id, eventId: id, owner: 'player', x: 139, y: 180, vx: 320, vy: 0, damage: 7, life: 75 }];
    advanceProjectiles(run);
    const store = new SaveStore(); await store.load(); await store.save(run, defaultSettings());
  });
  await page.clock.install({ time: new Date('2026-10-05T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-05T00:01:00Z'));
  await page.reload(); await page.clock.runFor(100);
  await page.getByRole('button', { name: '탐험 이어하기' }).evaluate((el: HTMLElement) => el.click());
  await page.clock.runFor(32);
  await expect(page.locator('#silence-status')).toBeVisible(); await expect(page.locator('#silence-status')).toContainText('초');
  await page.locator('#pause-button').evaluate((el: HTMLElement) => el.click());
  await expect(page.locator('#save-status')).toContainText('탐험 저장됨');
  const read = () => page.evaluate(async () => {
    const { SaveStore } = await import('/src/persistence/save.ts' as string);
    const record = await new SaveStore().load();
    return { enemy: record.run.enemies[0], cooldown: record.run.player.silenceCooldown,
      unlocked: record.run.growth.firstRoomCleared, locked: !!document.pointerLockElement };
  });
  const saved = await read(); expect(saved.enemy.mode).toBe('recover'); expect(saved.enemy.silenceTicks).toBeGreaterThan(0);
  expect(saved.cooldown).toBeGreaterThan(300); expect(saved.unlocked).toBe(true); expect(saved.locked).toBe(false);
  await page.clock.runFor(2000); expect(await read()).toEqual(saved);
  await page.screenshot({ path: 'test-results/silence-hud.png' });
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).evaluate((el: HTMLElement) => el.click());
  await page.clock.runFor(32); await page.locator('#pause-button').evaluate((el: HTMLElement) => el.click());
  await expect(page.locator('#save-status')).toContainText('탐험 저장됨');
  const restored = await read(); expect(restored.enemy.silenceTicks).toBeGreaterThan(0);
  expect(restored.enemy.timer).toBe(150 + restored.enemy.silenceTicks);
  expect(restored.cooldown).toBeLessThanOrEqual(saved.cooldown);
  expect(restored.cooldown).toBeGreaterThanOrEqual(saved.cooldown - 2);
  expect(errors).toEqual([]);
});

test('a prior combat clear permanently unlocks the bell on a real new expedition', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { beginGrowthRun, emptyInvestment } = await import('/src/core/growth.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const run = createDungeonRun(42); beginGrowthRun(run, emptyInvestment(), 'bell-legacy');
    run.expedition.dungeon.rooms[1].visited = run.expedition.dungeon.rooms[1].cleared = true;
    const store = new SaveStore(); await store.load(); await store.save(run, defaultSettings());
  });
  await page.reload(); await page.getByRole('button', { name: '새 탐험 시작' }).evaluate((el: HTMLElement) => el.click());
  await expect(page.locator('#save-status')).toContainText('탐험 저장됨');
  const result = await page.evaluate(async () => {
    const { SaveStore } = await import('/src/persistence/save.ts' as string);
    const { canAcquireRelic } = await import('/src/core/relic-acquisition.ts' as string);
    const record = await new SaveStore().load();
    return { unlocked: canAcquireRelic(record.run, 'R11'), snapshot: record.run.growth.firstRoomCleared,
      fresh: record.run.expedition.dungeon.rooms.filter((r: any) => r.kind === 'combat' && r.cleared).length, locked: !!document.pointerLockElement };
  });
  expect(result).toEqual({ unlocked: true, snapshot: true, fresh: 0, locked: false });
});
