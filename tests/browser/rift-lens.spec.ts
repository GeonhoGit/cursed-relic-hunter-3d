import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.requestPointerLock = () => { throw new Error('Mouse capture forbidden'); };
  });
});

test('disabled shields and lens marks match collision state, return after two seconds and release GPU resources', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await page.evaluate(async () => {
    const { World } = await import('/src/game/world.ts' as string);
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const run = createDungeonRun(42); run.expedition.room = 1;
    const room = run.expedition.dungeon.rooms[1]; room.visited = true; delete room.structure; room.template = 0;
    run.phase = 'combat'; run.player.x = 440; run.player.y = 210;
    run.expedition.relics = run.expedition.acquired = ['R12'];
    const host = document.createElement('div'); host.id = 'lens-preview';
    host.style.cssText = 'position:fixed;inset:0;width:960px;height:600px;z-index:9999'; document.body.append(host);
    const world = new World(host); await new Promise(requestAnimationFrame);
    world.paint(run, Math.atan2(-30, -120), -.13, false, true);
    (window as any).lensPreview = { world, run }; document.getElementById('overlay')!.hidden = true;
  });
  const result = await page.evaluate(async () => {
    const { world, run } = (window as any).lensPreview;
    const { advanceProjectiles } = await import('/src/core/combat.ts' as string);
    const { advanceEnemies } = await import('/src/core/enemy-ai.ts' as string);
    world.paint(run, Math.atan2(-30, -120), -.13, false, true);
    const before = { ...world.renderer.info.memory }, phases = [];
    for (let i = 0; i < 5; i++) {
      const e = { id: run.nextId++, kind: 'shield', x: 320, y: 180, hp: 70, maxHp: 70, shieldHp: 28,
        mode: 'recover', timer: 120, targetX: 440, targetY: 210, angle: Math.PI, flash: 0 };
      run.enemies = [e]; world.paint(run, Math.atan2(-30, -120), -.13, false, true);
      const body = world.entities.get(`enemy-${e.id}`), visibleBefore = body.getObjectByName('shield').visible;
      const id = run.nextId++;
      run.bullets = [{ id, eventId: id, owner: 'player', x: 309, y: 180, vx: 320, vy: 0, damage: 7, life: 75 }];
      advanceProjectiles(run); world.paint(run, Math.atan2(-30, -120), -.13, false, true);
      const phase: any = { visibleBefore, disabled: !body.getObjectByName('shield').visible,
        barGone: !world.entities.get(`shield-bar-${e.id}`), mark: world.entities.get(`lens-${e.id}`)?.name, hp: e.hp, durability: e.shieldHp };
      if (i === 4) { phases.push(phase); break; }
      for (let n = 0; n < 120; n++) advanceEnemies(run, { x: 0, y: 0 });
      world.paint(run, Math.atan2(-30, -120), -.13, false, true);
      phase.restored = body.getObjectByName('shield').visible && !!world.entities.get(`shield-bar-${e.id}`);
      phase.markGone = !world.entities.get(`lens-${e.id}`); phases.push(phase);
      run.enemies = []; run.cues = []; world.paint(run, Math.atan2(-30, -120), -.13, false, true);
    }
    return { phases, before, locked: !!document.pointerLockElement };
  });
  for (const [index, phase] of result.phases.entries()) {
    expect(phase.visibleBefore).toBe(true); expect(phase.disabled).toBe(true); expect(phase.barGone).toBe(true);
    expect(phase.mark).toBe('lens-break'); expect(phase.hp).toBe(63); expect(phase.durability).toBe(28);
    if (index < 4) { expect(phase.restored).toBe(true); expect(phase.markGone).toBe(true); }
  }
  await page.locator('#lens-preview').screenshot({ path: 'test-results/lens-disabled.png' });
  const after = await page.evaluate(async () => {
    const { world, run } = (window as any).lensPreview; run.enemies = []; run.cues = [];
    world.paint(run, Math.atan2(-30, -120), -.13, false, true); return { ...world.renderer.info.memory };
  });
  expect(after.geometries).toBeLessThanOrEqual(result.before.geometries + 1);
  expect(after.textures).toBeLessThanOrEqual(result.before.textures + 1);
  expect(result.locked).toBe(false); expect(errors).toEqual([]);
});

test('mob and gatekeeper lens state survive continue, pause-save and reload with shield-release HUD', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  for (const kind of ['mob', 'boss']) {
    await page.evaluate(async kind => {
      const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
      const { createBoss, startBossPattern } = await import('/src/core/boss.ts' as string);
      const { advanceProjectiles } = await import('/src/core/combat.ts' as string);
      const { beginGrowthRun, emptyInvestment } = await import('/src/core/growth.ts' as string);
      const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
      const run = createDungeonRun(42); beginGrowthRun(run, emptyInvestment(), `lens-${kind}`);
      const rooms = run.expedition.dungeon.rooms; rooms[2].visited = rooms[2].cleared = true;
      rooms[6].visited = rooms[6].cleared = true; rooms[6].reward = { room: 6, candidates: ['R12'], choice: 'R12' };
      run.expedition.relics = run.expedition.acquired = ['R12']; run.phase = 'combat'; run.player.x = 90; run.player.y = 180;
      run.expedition.room = kind === 'boss' ? 8 : 1;
      const node = rooms[run.expedition.room]; node.visited = true; delete node.structure; node.template = 0;
      if (kind === 'boss') { run.boss = createBoss(run); startBossPattern(run, 'shield'); }
      else run.enemies = [{ id: run.nextId++, kind: 'shield', x: 150, y: 180, hp: 70, maxHp: 70, angle: Math.PI,
        mode: 'recover', timer: 120, targetX: 90, targetY: 180, flash: 0, shieldHp: 28 }];
      const target = run.boss ?? run.enemies[0], id = run.nextId++;
      run.bullets = [{ id, eventId: id, owner: 'player', x: target.x - 11, y: target.y, vx: 320, vy: 0, damage: 7, life: 75 }];
      advanceProjectiles(run);
      const store = new SaveStore(); await store.load(); await store.save(run, defaultSettings());
    }, kind);
    if (kind === 'mob') {
      await page.clock.install({ time: new Date('2026-10-05T00:00:00Z') });
      await page.clock.pauseAt(new Date('2026-10-05T00:01:00Z'));
    }
    await page.reload(); await page.clock.runFor(100);
    await page.getByRole('button', { name: '탐험 이어하기' }).evaluate((el: HTMLElement) => el.click());
    await page.clock.runFor(32);
    if (kind === 'boss') await expect(page.locator('#boss-pattern')).toContainText('방패 해제');
    await page.locator('#pause-button').evaluate((el: HTMLElement) => el.click());
    await expect(page.locator('#save-status')).toContainText('탐험 저장됨');
    const read = () => page.evaluate(async () => {
      const { SaveStore } = await import('/src/persistence/save.ts' as string);
      const record = await new SaveStore().load(); return { enemy: record.run.boss ?? record.run.enemies[0], locked: !!document.pointerLockElement };
    });
    const saved = await read(); expect(saved.enemy.lensCooldown).toBeGreaterThan(290); expect(saved.locked).toBe(false);
    if (kind === 'mob') { expect(saved.enemy.shieldDisabledTicks).toBeGreaterThan(110); expect(saved.enemy.shieldHp).toBe(28); }
    else { expect(saved.enemy.mode).toBe('recover'); expect(saved.enemy.pattern).toBe('shield'); }
    await expect(page.locator('#overlay')).toHaveAttribute('data-mode', 'pause');
    await page.clock.fastForward(2000); expect(await read()).toEqual(saved);
    await page.screenshot({ path: `test-results/lens-${kind}-pause.png` });
    await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).evaluate((el: HTMLElement) => el.click());
    await page.clock.runFor(32); await page.locator('#pause-button').evaluate((el: HTMLElement) => el.click());
    await expect(page.locator('#save-status')).toContainText('탐험 저장됨');
    const restored = await read(); expect(restored.enemy.lensCooldown).toBeGreaterThanOrEqual(saved.enemy.lensCooldown - 2);
    expect(restored.enemy.lensCooldown).toBeLessThanOrEqual(saved.enemy.lensCooldown);
  }
  expect(errors).toEqual([]);
});

test('legacy G01 record allows selecting the lens and carries both G01 relic unlocks into a new expedition', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { createDungeonRun } = await import('/src/core/simulation.ts' as string);
    const { beginGrowthRun, emptyInvestment } = await import('/src/core/growth.ts' as string);
    const { SaveStore, defaultSettings } = await import('/src/persistence/save.ts' as string);
    const run = createDungeonRun(42); beginGrowthRun(run, emptyInvestment(), 'lens-legacy');
    const rooms = run.expedition.dungeon.rooms; rooms[1].visited = rooms[1].cleared = true;
    rooms[6].visited = rooms[6].cleared = true; rooms[6].reward = { room: 6, candidates: ['R12'], choice: null };
    run.expedition.room = 6; run.phase = 'cleared';
    const store = new SaveStore(); await store.load(); await store.save(run, defaultSettings());
  });
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).evaluate((el: HTMLElement) => el.click());
  await page.locator('[data-action="choose-R12"]').evaluate((el: HTMLElement) => el.click());
  await expect(page.locator('#overlay')).toBeHidden(); await expect(page.locator('#save-status')).toContainText('탐험 저장됨');
  const acquired = await page.evaluate(async () => {
    const { SaveStore } = await import('/src/persistence/save.ts' as string); const record = await new SaveStore().load();
    return { relics: record.run.expedition.relics, history: record.profile.relics };
  });
  expect(acquired.relics).toContain('R12'); expect(acquired.history).toContain('R12');
  await page.locator('#pause-button').evaluate((el: HTMLElement) => el.click());
  await page.locator('[data-action="save-home"]').evaluate((el: HTMLElement) => el.click());
  await page.getByRole('button', { name: '새 탐험 시작' }).evaluate((el: HTMLElement) => el.click());
  await expect(page.locator('#save-status')).toContainText('탐험 저장됨');
  const result = await page.evaluate(async () => {
    const { SaveStore } = await import('/src/persistence/save.ts' as string);
    const { canAcquireRelic } = await import('/src/core/relic-acquisition.ts' as string);
    const record = await new SaveStore().load();
    return { bell: canAcquireRelic(record.run, 'R11'), lens: canAcquireRelic(record.run, 'R12'), locked: !!document.pointerLockElement };
  });
  expect(result).toEqual({ bell: true, lens: true, locked: false });
});
