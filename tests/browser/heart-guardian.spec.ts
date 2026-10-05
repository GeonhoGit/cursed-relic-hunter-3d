import { expect, test } from '@playwright/test';

test('heart guardian shows both directional slash warnings and releases their GPU resources', async ({ page }) => {
  test.setTimeout(60000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const w = '/src/game/world.ts', s = '/src/core/simulation.ts', a = '/src/core/enemy-special.ts';
    const { World } = await import(w), { createRun } = await import(s), { advanceSpecialEnemy } = await import(a);
    const host = document.createElement('div'); host.style.cssText = 'width:640px;height:400px'; document.body.append(host);
    const world = new World(host), run = createRun(42); run.phase = 'combat'; run.enemies = [];
    run.player.x = 360; run.player.y = 180; await new Promise(requestAnimationFrame);
    world.paint(run, Math.PI, 0, false, false); const before = { ...world.renderer.info.memory };
    const guardian = { id: run.nextId++, kind: 'heartguard', x: 320, y: 180, hp: 120, maxHp: 120,
      angle: 0, mode: 'move', timer: 0, targetX: 360, targetY: 180, flash: 0 };
    const warnings = []; let sword = false;
    for (let repeat = 0; repeat < 4; repeat++) {
      run.enemies = [guardian]; Object.assign(guardian, { mode: 'move', timer: 0, comboStrike: undefined });
      for (let strike = 1; strike <= 2; strike++) {
        if (strike === 1) advanceSpecialEnemy(run, guardian);
        else { for (let tick = 0; tick < 18; tick++) advanceSpecialEnemy(run, guardian); }
        world.paint(run, Math.PI, 0, false, false);
        const figure = world.entities.get(`enemy-${guardian.id}`);
        sword = !!figure?.getObjectByName('guardian-sword');
        const tell = [...world.entities.entries()].find(([key]: [string]) => key.startsWith(`tell-${guardian.id}-`))?.[1];
        const sector = tell?.getObjectByName('guardian-slash');
        warnings.push(sector ? { radius: sector.geometry.parameters.radius, span: sector.geometry.parameters.thetaLength,
          angle: sector.parent.rotation.y, color: sector.material.color.getHex() } : null);
        guardian.timer = 1; advanceSpecialEnemy(run, guardian); world.paint(run, Math.PI, 0, false, false);
      }
      run.enemies = []; world.paint(run, Math.PI, 0, false, false);
    }
    const after = { ...world.renderer.info.memory }, locked = document.pointerLockElement !== null;
    host.remove(); return { before, after, warnings, sword, locked };
  });
  expect(errors).toEqual([]); expect(result.locked).toBe(false); expect(result.sword).toBe(true);
  for (const warning of result.warnings) {
    expect(warning).not.toBeNull(); expect(warning!.radius).toBeCloseTo(2.56);
    expect(warning!.span).toBeCloseTo(130 * Math.PI / 180); expect(warning!.angle).toBeCloseTo(0);
  }
  expect(result.warnings[0]!.color).not.toBe(result.warnings[1]!.color);
  expect(result.after.geometries).toBeLessThanOrEqual(result.before.geometries + 1);
  expect(result.after.textures).toBeLessThanOrEqual(result.before.textures + 1);
});
