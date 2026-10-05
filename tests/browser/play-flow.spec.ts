import { expect, test } from '@playwright/test';

test('saving camp growth after reload preserves the expedition for continuing', async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = undefined!; });
  await page.clock.install({ time: new Date('2026-10-05T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-05T00:00:00.032Z'));
  await page.goto('/');
  await page.getByRole('button', { name: '새 탐험 시작', exact: true }).click();
  await expect(page.locator('#overlay')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#save-status')).toHaveText('탐험 저장됨');
  await page.getByRole('button', { name: '저장하고 야영지로', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: '탐험 이어하기' })).toBeVisible();
  const before = await savedRun();
  expect(before).not.toBeNull();
  await page.getByRole('button', { name: '영구 성장', exact: true }).click();
  await page.getByRole('button', { name: '투자 저장', exact: true }).click();
  await expect(page.getByRole('button', { name: '영구 성장', exact: true })).toBeVisible();
  expect(await savedRun()).toEqual(before);
  await page.reload();
  await page.getByRole('button', { name: '탐험 이어하기' }).click();
  await expect(page.locator('#overlay')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '잠시 숨을 고릅니다.' })).toBeVisible();
  await expect(page.locator('#save-status')).toHaveText('탐험 저장됨');
  expect(await savedRun()).toEqual(before);
  expect(errors).toEqual([]);

  async function savedRun() {
    return page.evaluate(async () => {
      const { SaveStore } = await import('/src/persistence/save.ts' as string);
      return (await new SaveStore('cursed-relic-hunter-3d-v1').load())?.run;
    });
  }
});
