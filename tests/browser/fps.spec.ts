import { expect, test, type Page } from '@playwright/test';

async function clock(page: Page) {
  await page.goto('/'); await page.clock.install({ time: new Date('2026-10-03T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-03T00:00:01Z'));
}
async function seed(page: Page, kind: string) {
  await clock(page);
  await page.evaluate(async kind => {
    const a = '/src/core/simulation.ts', b = '/src/persistence/save.ts', c = '/src/core/expedition.ts';
    const d = '/src/core/boss.ts', e = '/src/core/shop.ts', f = '/src/core/growth.ts';
    const sim = await import(a), saves = await import(b), expedition = await import(c), boss = await import(d), shop = await import(e), growth = await import(f);
    const s = sim.createDungeonRun(42); growth.beginGrowthRun(s, growth.emptyInvestment(), 'browser-fps-run');
    const id = kind === 'altar' ? 9 : ['start', 'jump-relics', 'treasure-entry'].includes(kind) ? 0 : kind.startsWith('terrain') ? Number(kind.slice(7)) : ['treasure', 'jump-treasure'].includes(kind) ? 6 : kind === 'shop' ? 10 : kind.startsWith('boss') ? 8 : 1;
    s.expedition.room = id; const room = s.expedition.dungeon.rooms[id]; room.visited = true;
    if (kind.startsWith('terrain')) {
      // Keep the three base terrain themes deterministic; room-structures.spec covers generated structures.
      room.template = id % 3; delete room.structure;
    }
    s.player.x = 320; s.player.y = ['treasure', 'shop', 'altar'].includes(kind) ? 240 : 280;
    s.view = { yaw: -Math.PI / 2, pitch: kind === 'rat' ? -0.26 : 0 };
    s.phase = 'combat'; s.waveDelay = 0; s.enemies = [];
    if (kind === 'start' || kind === 'jump-relics' || kind === 'treasure-entry') {
      s.expedition.room = 0; s.phase = 'explore'; s.player.y = 183;
      if (kind === 'treasure-entry') { const {BOUNDS}=await import('/src/core/model.ts'); s.player.x=BOUNDS.x+16; s.view.yaw=Math.PI; }
    }
    else if (kind === 'treasure') { room.cleared = true; s.phase = 'explore'; }
    else if (kind === 'jump-treasure' || kind === 'altar') {
      s.player.y = 240; room.cleared = true; s.phase = 'cleared'; expedition.prepareReward(s);
      if (kind === 'jump-treasure') room.reward.candidates = ['R44', 'R45', 'R46'];
    }
    else if (kind === 'shop') { room.cleared = true; s.phase = 'explore'; s.player.hp = 70; s.gold = 80; shop.refreshShop(s); }
    else if (kind.startsWith('boss')) {
      s.boss = boss.createBoss(s); s.boss.mode = 'recover'; s.boss.timer = 72;
      if (kind === 'boss-transition') s.boss.hp = 907;
      if (kind === 'boss-win') { s.boss.hp = 7; s.boss.stage = 2; s.boss.summonsDone = true; }
    } else {
      const rat = kind === 'rat', shield = kind === 'shield';
      s.enemies = [{ id: s.nextId++, kind: rat ? 'rat' : shield ? 'shield' : 'archer', x: 320, y: 180,
        hp: rat ? 30 : shield ? 70 : 40, maxHp: rat ? 30 : shield ? 70 : 40,
        angle: Math.PI / 2, mode: 'recover', timer: shield ? 120 : rat ? 42 : 66,
        targetX: 320, targetY: 280, flash: 0, frost: { freezeTicks: 36, resistTicks: 216, hits: [] } }];
    }
    if (kind === 'aux') {
      s.expedition.relics = ['R13', 'R43']; s.expedition.acquired = ['R13', 'R43']; s.player.equippedAux = 'R13';
      const treasure = s.expedition.dungeon.rooms[6], altar = s.expedition.dungeon.rooms[9];
      treasure.visited = treasure.cleared = true; treasure.reward = { room: 6, candidates: ['R13'], choice: 'R13' };
      altar.visited = altar.cleared = true; altar.reward = { room: 9, candidates: ['R38', 'R43'], choice: 'R43' };
    }
    if (kind === 'jump-relics') {
      s.expedition.relics = ['R44', 'R45', 'R46']; s.expedition.acquired = ['R44', 'R45', 'R46'];
      for (const [id, relic] of [[6, 'R44'], [7, 'R45']] as const) {
        const node = s.expedition.dungeon.rooms[id]; node.visited = node.cleared = true;
        node.reward = { room: id, candidates: [relic], choice: relic };
      }
      const shopRoom = s.expedition.dungeon.rooms[10]; shopRoom.visited = shopRoom.cleared = true;
      shopRoom.shop = { revision: 2, slots: [
        { kind: 'relic', relic: 'R46', purchased: true, repairCounter: 0 },
        { kind: 'relic', relic: null, purchased: false, repairCounter: 0 },
        { kind: 'heal', relic: null, purchased: false, repairCounter: 0 },
        { kind: 'curse', relic: null, purchased: false, repairCounter: 0 },
      ] };
    }
    // Gameplay checks use the deterministic low tier; graphics tiers have dedicated tests.
    const store = new saves.SaveStore('cursed-relic-hunter-3d-v1'); await store.load(); await store.save(s, { ...saves.defaultSettings(), graphicsQuality: 'low' });
  }, kind);
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click();
}
async function saved(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>(resolve => { const q = indexedDB.open('cursed-relic-hunter-3d-v1', 1); q.onsuccess = () => resolve(q.result); });
    const data = await new Promise<any>(resolve => { const q = db.transaction('save').objectStore('save').get('current'); q.onsuccess = () => resolve(q.result); });
    db.close(); return data;
  });
}
async function saveHome(page: Page) {
  await page.keyboard.press('Escape'); await expect(page.getByRole('heading', { name: '잠시 숨을 고릅니다.' })).toBeVisible();
  // Pump the paused mock clock so pending UI/save tasks can settle without combat ticks.
  await expect.poll(async () => { await page.clock.fastForward(20); return page.locator('#save-status').textContent(); }).toBe('탐험 저장됨');
  await page.getByRole('button', { name: '저장하고 야영지로' }).click();
  await expect.poll(async () => { await page.clock.fastForward(20); return page.getByRole('button', { name: '탐험 이어하기' }).isVisible(); }).toBe(true); return (await saved(page)).run;
}
async function capture(page: Page) {
  await expect.poll(() => page.evaluate(() => !!document.pointerLockElement)).toBe(true);
  await page.clock.runFor(80);
}
for (const locked of [true, false]) {
  test(`mouse sensitivity applies to both axes, persists and resets (pointer lock ${locked})`, async ({ page }) => {
    if (!locked) await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = undefined!; });
    await seed(page, 'start'); if (locked) await capture(page); else await page.clock.runFor(80);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '설정', exact: true }).click();
    const slider = page.getByRole('slider', { name: '마우스 감도', exact: true });
    await expect(slider).toHaveValue('1');
    await slider.evaluate((input: HTMLInputElement) => {
      input.value = '2'; input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(page.locator('#sensitivity-value')).toHaveText('2.00배');
    await expect(page.locator('#settings-status')).toHaveText('설정 저장됨');
    expect((await saved(page)).settings.mouseSensitivity).toBe(2);
    await page.getByRole('button', { name: '돌아가기', exact: true }).click();
    await expect(page.getByRole('heading', { name: '잠시 숨을 고릅니다.' })).toBeVisible();
    await page.getByRole('button', { name: '전투 재개' }).click();
    if (locked) {
      await capture(page);
      await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementX: 100, movementY: -40 })));
    } else {
      await page.mouse.move(600, 450); await page.mouse.move(700, 410);
    }
    await page.clock.runFor(80); const s = await saveHome(page);
    expect(s.view.yaw).toBeCloseTo(-Math.PI / 2 + 100 * 0.0022 * 2);
    expect(s.view.pitch).toBeCloseTo(40 * 0.0022 * 2);
    await page.reload(); await page.getByRole('button', { name: '설정', exact: true }).click();
    await expect(slider).toHaveValue('2'); await slider.focus(); await page.keyboard.press('Home');
    await expect(slider).toHaveValue('0.2');
    await page.keyboard.press('End'); await expect(slider).toHaveValue('3');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: '기본 감도로 복원' })).toBeFocused();
    await page.getByRole('button', { name: '기본 감도로 복원' }).click();
    await expect(slider).toHaveValue('1');
    await expect(page.locator('#settings-status')).toHaveText('설정 저장됨');
    expect((await saved(page)).settings.mouseSensitivity).toBe(1);
    await page.screenshot({ path: `test-results/fps-sensitivity-${locked}.png` });
    await page.getByRole('button', { name: '돌아가기', exact: true }).click();
    await expect(page.getByRole('button', { name: '탐험 이어하기' })).toBeVisible();
  });
}

test('jump relic combination preserves an air jump, lands with a visible shockwave and saves recharge', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await seed(page, 'jump-relics'); await capture(page);
  await expect(page.locator('#jump-status')).toContainText('2단 점프');
  await expect(page.locator('#jump-status')).toContainText('1.5m');
  await page.keyboard.press('Space'); await page.clock.runFor(400);
  await page.keyboard.press('Space'); await page.clock.runFor(100);
  const airborne = await saveHome(page);
  expect(airborne.player.height * 0.04).toBeGreaterThan(2);
  expect(airborne.player.height * 0.04).toBeLessThanOrEqual(2.5); expect(airborne.player.airJumpUsed).toBe(true);
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click(); await capture(page);
  await expect(page.locator('#jump-status')).toContainText('공중 점프 소모');
  await page.keyboard.press('Space');
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementY: 300 })));
  await page.clock.runFor(650);
  await expect(page.locator('#stomp-status')).toContainText('초');
  await page.screenshot({ path: 'test-results/fps-landing-shockwave.png' });
  const landed = await saveHome(page);
  expect(landed.player.height).toBe(0); expect(landed.player.airJumpUsed).toBeUndefined();
  expect(landed.player.stompCooldown).toBeGreaterThan(0); expect(landed.stats.dodges).toBe(0); expect(landed.player.hp).toBe(100);
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click(); await capture(page);
  expect((await saveHome(page)).player.stompCooldown).toBeLessThan(landed.player.stompCooldown);
  expect(errors).toEqual([]);
});

for (const [id, name] of [['R44', '바람 깃털'], ['R45', '도약의 장화'], ['R46', '진동의 발굽']] as const) {
  test(`jump treasure ${name} can be chosen, resumes immediately and appears in inventory`, async ({ page }) => {
    await seed(page, 'jump-treasure');
    await page.locator(`button[data-action="choose-${id}"]`).click();
    await expect(page.locator('#overlay')).toBeHidden(); await capture(page);
    await page.keyboard.press('i'); await expect(page.getByRole('dialog')).toContainText(name);
    await page.getByRole('button', { name: '유물 목록 닫기' }).click(); await capture(page);
    expect((await saveHome(page)).expedition.relics).toContain(id);
  });
}

test('Space jumps once per press, restores airborne saves and lands without using dodge', async ({ page }) => {
  await seed(page, 'start'); await capture(page);
  await page.keyboard.down('Space'); await page.clock.runFor(200);
  await page.screenshot({ path: 'test-results/fps-jump.png' });
  await page.keyboard.down('Space'); await page.clock.runFor(80);
  const airborne = await saveHome(page); await page.keyboard.up('Space');
  expect(airborne.player.height).toBeGreaterThan(24); expect(airborne.stats.dodges).toBe(0);
  expect(airborne.player.y).toBe(183);
  await page.getByRole('button', { name: '탐험 이어하기' }).click(); await capture(page);
  // Another press in midair must not reset the falling trajectory.
  await page.keyboard.press('Space'); await page.clock.runFor(550);
  const landed = await saveHome(page);
  expect(landed.player.height).toBe(0); expect(landed.player.jumpVelocity).toBe(0);
  expect(landed.stats.dodges).toBe(0);
  await page.getByRole('button', { name: '탐험 이어하기' }).click(); await capture(page);
  await page.keyboard.press('Space'); await page.clock.runFor(120);
  expect((await saveHome(page)).player.height).toBeGreaterThan(0);
});

for (const key of ['ShiftLeft', 'ShiftRight']) {
  test(`${key} performs a directional dodge and Space does not`, async ({ page }) => {
    await seed(page, 'start'); await capture(page);
    await page.keyboard.press('Space'); await page.clock.runFor(80);
    const idle = await saveHome(page); expect(idle.stats.dodges).toBe(0); expect(idle.player.y).toBe(183);
    await page.getByRole('button', { name: '탐험 이어하기' }).click(); await capture(page);
    await page.keyboard.down('w'); await page.clock.runFor(80);
    await page.keyboard.press(key); await page.clock.runFor(300); await page.keyboard.up('w');
    await expect(page.locator('.abilities kbd').first()).toHaveText('Shift');
    const s = await saveHome(page);
    expect(s.stats.dodges).toBe(1); expect(s.player.y).toBeLessThan(125);
    expect(s.player.dodgeCooldown).toBeGreaterThan(0);
  });
}

for (const failure of ['rejected', 'throws', 'unavailable'] as const) {
  test(`real mouse movement and shooting work when pointer lock is ${failure}`, async ({ page }) => {
    await page.addInitScript(failure => {
      HTMLCanvasElement.prototype.requestPointerLock = failure === 'unavailable' ? undefined! : () => {
        const error = new DOMException('Pointer lock unavailable', 'NotSupportedError');
        if (failure === 'throws') throw error;
        return Promise.reject(error);
      };
    }, failure);
    await seed(page, 'start'); await page.clock.runFor(80);
    expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
    await page.mouse.move(600, 450); await page.mouse.move(800, 410); await page.clock.runFor(80);
    await expect(page.locator('#compass')).toContainText('북동');
    await page.mouse.down(); await page.clock.runFor(120); await page.mouse.up();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('heading', { name: '잊힌 유적의 길' })).toBeVisible();
    await page.mouse.move(850, 480);
    await page.keyboard.press('Tab'); await expect(page.locator('#overlay')).toBeHidden();
    // Resuming establishes a new origin instead of jumping toward the menu cursor.
    await page.mouse.move(650, 450); await page.mouse.move(670, 470); await page.clock.runFor(80);
    await page.screenshot({ path: `test-results/fps-mouse-${failure}.png` });
    const s = await saveHome(page);
    expect(s.view.yaw).toBeCloseTo(-Math.PI / 2 + 220 * 0.0022);
    expect(s.view.pitch).toBeCloseTo(20 * 0.0022);
    expect(s.stats.shots).toBeGreaterThan(0);
  });
}

test('3D scene starts, moves with WASD, toggles Tab and restores view and position', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await clock(page);
  await expect(page.getByRole('heading', { name: '저주받은 유물 사냥꾼' })).toBeVisible();
  await page.screenshot({ path: 'test-results/fps-camp.png', fullPage: true });
  await page.getByRole('button', { name: '새 탐험 시작', exact: true }).click(); await capture(page);
  await page.keyboard.down('w'); await page.clock.runFor(350); await page.keyboard.up('w');
  await page.keyboard.press('Tab'); await expect(page.getByRole('heading', { name: '잊힌 유적의 길' })).toBeVisible();
  await page.keyboard.press('Tab'); await expect(page.locator('#overlay')).toBeHidden(); await capture(page);
  await page.clock.runFor(80);
  await page.screenshot({ path: 'test-results/fps-start-room.png', fullPage: true });
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementX: 20, movementY: -8 })));
  await page.clock.runFor(80);
  const checkpoint = await saveHome(page); expect(checkpoint.player.y).toBeLessThan(155); expect(checkpoint.view.yaw).not.toBe(-Math.PI / 2);
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click(); await capture(page);
  await page.clock.runFor(80); const restored = await saveHome(page);
  expect(restored.player.x).toBe(checkpoint.player.x); expect(restored.player.y).toBe(checkpoint.player.y);
  expect(restored.view).toEqual(checkpoint.view); expect(errors).toEqual([]);
});
test('a first person shot damages a standing enemy with height-aware bullets', async ({ page }) => {
  await seed(page, 'archer'); await capture(page);
  await page.mouse.down(); await page.clock.runFor(800); await page.mouse.up();
  await page.screenshot({ path: 'test-results/fps-combat.png', fullPage: true });
  const s = await saveHome(page); expect(s.stats.shots).toBeGreaterThan(0);
  expect(s.enemies[0].hp, JSON.stringify({ tick: s.tick, stats: s.stats, bullets: s.bullets })).toBeLessThan(40);
  expect(s.bullets.every((b: any) => b.owner !== 'player' || typeof b.height === 'number')).toBe(true);
});
test('looking down hits a low rat', async ({ page }) => {
  await seed(page, 'rat'); await capture(page);
  await page.mouse.down(); await page.clock.runFor(800); await page.mouse.up();
  const s = await saveHome(page); expect(s.stats.shots).toBeGreaterThan(0);
  expect(s.enemies[0].hp, JSON.stringify({ tick: s.tick, shots: s.stats.shots, bullets: s.bullets, view: s.view })).toBeLessThan(30); expect(s.view.pitch).toBeCloseTo(-0.26);
});
test('rats keep pursuing without bite windup and only hurt on contact', async ({ page }) => {
  await seed(page, 'rat'); await capture(page);
  await page.clock.runFor(2400);
  const s = await saveHome(page), rat = s.enemies[0];
  expect(rat.kind).toBe('rat'); expect(rat.mode).toBe('move'); expect(rat.timer).toBe(0);
  expect(Math.hypot(rat.x - s.player.x, rat.y - s.player.y)).toBeLessThan(17);
  expect(s.player.hp).toBeLessThan(100); expect((100 - s.player.hp) % 6).toBe(0);
  expect(s.lastDamage).toContain('접촉'); expect(s.bullets).toHaveLength(0);
  await page.getByRole('button', { name: '탐험 이어하기' }).click(); await capture(page);
  await page.clock.runFor(300);
  const resumed = await saveHome(page);
  expect(resumed.enemies[0].mode).toBe('move'); expect(resumed.enemies[0].timer).toBe(0);
});
test('entering a treasure room only offers relics after opening its nearby chest and restores unopened saves', async ({ page }) => {
  test.setTimeout(Math.max(45000, test.info().project.timeout));
  await seed(page, 'treasure-entry'); await capture(page);
  await page.keyboard.down('w'); await page.clock.runFor(200); await page.keyboard.up('w');
  await expect(page.locator('#room-name')).toHaveText('유물의 안식처'); await expect(page.locator('#overlay')).toBeHidden();
  await page.keyboard.press('e'); await page.clock.runFor(80); await expect(page.locator('#overlay')).toBeHidden();
  await expect(page.locator('#interact')).toBeHidden();
  const closed = await saveHome(page); expect(closed.phase).toBe('explore'); expect(closed.expedition.dungeon.rooms[7].reward).toBeNull();
  await page.reload(); await page.getByRole('button', { name: '탐험 이어하기' }).click(); await capture(page);
  await expect(page.locator('#overlay')).toBeHidden();
  await page.keyboard.down('w'); await page.clock.runFor(3000); await page.keyboard.up('w');
  await expect(page.getByRole('button', { name: 'E 유물 상자 열기' })).toBeVisible();
  await page.screenshot({ path: 'test-results/fps-treasure-chest.png' });
  await page.keyboard.press('e'); await expect(page.getByRole('heading', { name: '유물을 하나 선택하세요.' })).toBeVisible();
  await page.locator('button[data-action^="choose-R"]').first().click(); await expect(page.locator('#overlay')).toBeHidden(); await capture(page);
  await expect.poll(async () => { await page.clock.runFor(20); return page.locator('#interact').isVisible(); }).toBe(false);
  const claimed = await saveHome(page); expect(claimed.expedition.acquired).toHaveLength(1);
  expect(claimed.expedition.dungeon.rooms[7].reward.choice).not.toBeNull();
});
test('opening a chest and choosing a relic resumes immediately and blocks first person walking', async ({ page }) => {
  await seed(page, 'treasure'); await capture(page);
  await expect(page.locator('#overlay')).toBeHidden();
  await page.keyboard.down('w'); await page.clock.runFor(200); await page.keyboard.up('w'); await page.keyboard.press('e');
  await expect(page.getByRole('heading', { name: '유물을 하나 선택하세요.' })).toBeVisible();
  await page.locator('button[data-action^="choose-R"]').first().click();
  await expect(page.locator('#overlay')).toBeHidden(); await capture(page);
  await page.keyboard.down('w'); await page.clock.runFor(500); await page.keyboard.up('w');
  await page.screenshot({ path: 'test-results/fps-relic-room.png', fullPage: true });
  const s = await saveHome(page); expect(s.expedition.relics).toHaveLength(1); expect(s.player.y).toBeGreaterThanOrEqual(198);
  expect(s.player.y).toBeLessThan(220); expect(s.phase).toBe('explore');
});
test('merchant purchase resumes and its counter is solid in 3D', async ({ page }) => {
  await seed(page, 'shop'); await capture(page); await page.keyboard.press('e');
  await expect(page.getByRole('heading', { name: '다음 전투를 준비하세요.' })).toBeVisible();
  await page.getByRole('button', { name: '작은 회복약 · 20 금화 · 구매' }).click();
  await expect(page.locator('#overlay')).toBeHidden(); await capture(page);
  await page.keyboard.down('w'); await page.clock.runFor(400); await page.keyboard.up('w');
  await page.screenshot({ path: 'test-results/fps-shop.png', fullPage: true });
  const s = await saveHome(page); expect(s.player.hp).toBe(85); expect(s.gold).toBe(60);
  expect(s.player.y).toBeGreaterThanOrEqual(210); expect(s.player.y).toBeLessThan(230);
});
test('boss pursues and announces the next attack in the first person room', async ({ page }) => {
  await seed(page, 'boss'); await capture(page); await page.clock.runFor(1400);
  await expect(page.locator('#boss-pattern')).toContainText('돌진');
  await page.screenshot({ path: 'test-results/fps-boss.png', fullPage: true });
  const s = await saveHome(page); expect(s.boss.y).toBeGreaterThan(183); expect(s.boss.pattern).toBe('charge');
});
test('first person shooting triggers the second phase and summons', async ({ page }) => {
  await seed(page, 'boss-transition'); await capture(page);
  await page.mouse.down(); await page.clock.runFor(800); await page.mouse.up();
  const halfway = await saveHome(page);
  expect(halfway.boss.stage, JSON.stringify({ tick: halfway.tick, stats: halfway.stats, boss: halfway.boss, bullets: halfway.bullets })).toBe(2);
  await page.getByRole('button', { name: '탐험 이어하기' }).click(); await capture(page);
  await page.clock.runFor(1200);
  const s = await saveHome(page); expect(s.boss.summonsDone).toBe(true); expect(s.enemies).toHaveLength(2);
});
test('boss defeat saves permanent progression and unlocks the shotgun', async ({ page }) => {
  await seed(page, 'boss-win'); await capture(page);
  await page.mouse.down(); await page.clock.runFor(600); await page.mouse.up();
  await expect(page.getByRole('heading', { name: '봉인이 풀렸습니다.' })).toBeVisible();
  await page.getByRole('button', { name: '야영지로', exact: true }).click();
  expect((await saved(page)).profile.bossDefeated).toBe(true);
  await page.getByRole('button', { name: '출발 무기', exact: true }).click();
  await expect(page.getByRole('button', { name: '산탄 성물 선택' })).toBeEnabled();
});
test('an open doorway leads into a maze room with five to ten monsters', async ({ page }) => {
  await seed(page, 'start'); await capture(page);
  await page.keyboard.down('w'); await page.clock.runFor(1800); await page.keyboard.up('w');
  const s = await saveHome(page); expect(s.expedition.room).not.toBe(0);
  expect(s.enemies.length).toBeGreaterThanOrEqual(5); expect(s.enemies.length).toBeLessThanOrEqual(10);
  expect(s.expedition.dungeon.rooms.filter((r: any) => r.visited)).toHaveLength(2);
});
test('all three distinct terrains render as 3D rooms', async ({ page }) => {
  const names = ['모래빛 회랑', '이끼 낀 폐허', '봉인의 석실'];
  for (let id = 1; id <= 3; id++) {
    await seed(page, `terrain${id}`); await capture(page); await page.clock.runFor(80);
    await expect(page.locator('#room-name')).toHaveText(names[id - 1]);
    await page.screenshot({ path: `test-results/fps-terrain-${id}.png`, fullPage: true });
  }
});
test('shield durability can be broken by first person frontal shooting', async ({ page }) => {
  await seed(page, 'shield'); await capture(page);
  await page.mouse.down(); await page.clock.runFor(2500); await page.mouse.up();
  const s = await saveHome(page); expect(s.enemies[0].shieldHp).toBe(0); expect(s.enemies[0].hp).toBeGreaterThan(0);
  expect(s.stats.shots).toBeGreaterThanOrEqual(5);
});
test('right click bomb, safe auxiliary switching and time stop work in 3D', async ({ page }) => {
  await seed(page, 'aux'); await capture(page);
  await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await page.clock.runFor(120);
  let s = await saveHome(page); expect(s.bombs).toHaveLength(1); expect(s.player.auxCooldown).toBeGreaterThan(0);
  await page.getByRole('button', { name: '탐험 이어하기' }).click(); await capture(page);
  await page.clock.runFor(1600); s = await saveHome(page);
  expect(s.phase, JSON.stringify({ tick: s.tick, bombs: s.bombs, enemies: s.enemies })).toBe('explore'); expect(s.stats.kills).toBe(1);
  await page.getByRole('button', { name: '탐험 이어하기' }).click(); await capture(page); await page.keyboard.press('i');
  await page.getByRole('button', { name: '시간의 빚 장착', exact: true }).click();
  await page.getByRole('button', { name: '유물 목록 닫기' }).click(); await capture(page);
  await page.mouse.down({ button: 'right' }); await page.mouse.up({ button: 'right' }); await page.clock.runFor(120);
  s = await saveHome(page); expect(s.player.equippedAux).toBe('R43'); expect(s.timeStop.ticks).toBeGreaterThan(0);
});
test('curse selection resumes and the altar blocks walking', async ({ page }) => {
  await seed(page, 'altar'); await expect(page.getByRole('heading', { name: '힘에는 대가가 따릅니다.' })).toBeVisible();
  await page.getByRole('button', { name: '시간의 빚 선택', exact: true }).click(); await capture(page);
  await page.keyboard.down('w'); await page.clock.runFor(550); await page.keyboard.up('w');
  await page.screenshot({ path: 'test-results/fps-altar.png', fullPage: true });
  const s = await saveHome(page); expect(s.phase).toBe('explore'); expect(s.expedition.relics).toContain('R43');
  expect(s.player.y).toBeGreaterThanOrEqual(207); expect(s.player.y).toBeLessThan(220);
});
test('graphics interruption pauses the run and can resume after context restoration', async ({ page }) => {
  await seed(page, 'start'); await capture(page);
  await page.evaluate(() => document.querySelector('canvas')!.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await expect(page.getByRole('heading', { name: '3D 화면이 중단되었습니다.' })).toBeVisible();
  await expect(page.locator('#save-status')).toHaveText('탐험 저장됨');
  const frozen = (await saved(page)).run; await page.clock.runFor(500);
  expect((await saved(page)).run.tick).toBe(frozen.tick);
  await page.evaluate(() => document.querySelector('canvas')!.dispatchEvent(new Event('webglcontextrestored')));
  await page.getByRole('button', { name: '탐험 재개', exact: true }).click(); await capture(page);
  expect((await saveHome(page)).tick).toBeGreaterThan(frozen.tick);
});
