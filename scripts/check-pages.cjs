const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');
const prefix = '/play/프로젝트 B/';
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.glb':'model/gltf-binary', '.svg':'image/svg+xml'};
const baseUrl = process.env.DEPLOY_URL;
const full = process.argv.includes('--full');
const root = path.resolve(__dirname, '../dist');
const server = baseUrl ? null : http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (!name.startsWith(prefix)) {res.writeHead(404).end(); return;}
  const file = path.resolve(root, name.slice(prefix.length) || 'index.html');
  if (!file.startsWith(root + path.sep)) {res.writeHead(403).end(); return;}
  try {const bytes = fs.readFileSync(file); res.writeHead(200, {'Content-Type':types[path.extname(file)] || 'application/octet-stream'}).end(bytes);}
  catch {res.writeHead(404).end();}
});
(async () => {
  if (server) await new Promise(resolve => server.listen(5211, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless:true, args:['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
  try {
    const context = await browser.newContext({viewport:{width:960, height:600}});
    await context.addInitScript(() => { HTMLCanvasElement.prototype.requestPointerLock = undefined; });
    const page = await context.newPage();
    const errors = [], responses = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => responses.push({url:r.url(), status:r.status()}));
    page.on('request', r => requests.push(r.url()));
    await page.clock.install({time:new Date('2026-10-05T00:00:00Z')});
    await page.clock.pauseAt(new Date('2026-10-05T00:00:00.032Z'));
    await page.goto(baseUrl || 'http://127.0.0.1:5211' + encodeURI(prefix) + 'index.html');
    await page.getByRole('button', {name:'새 탐험 시작', exact:true}).waitFor();
    await page.getByRole('button', {name:'새 탐험 시작', exact:true}).click();
    await page.clock.runFor(80);
    await expect(page.locator('#overlay')).toBeHidden();
    await expect.poll(() => responses.filter(r => r.url.includes('/models/weapons/w01.glb')).length, {timeout:30000}).toBeGreaterThan(0);
    const model = responses.find(r => r.url.includes('/models/weapons/w01.glb'));
    console.log(JSON.stringify({model, errors},null,2));
    assert.equal(model.status, 200, 'Current weapon GLB must load under the game subdirectory');
    assert.ok(decodeURIComponent(new URL(model.url).pathname).startsWith(prefix), 'Model must be requested under project B');
    assert.equal(errors.length,0,'Game must start without JavaScript errors');
    if (full) {
      await page.clock.runFor(120);
      await page.keyboard.press('Escape');
      await page.getByRole('button', {name:'저장하고 야영지로', exact:true}).click();
      await expect(page.getByRole('button', {name:/^탐험 이어하기/})).toBeVisible();
      await page.getByRole('button', {name:'설정', exact:true}).click();
      await page.getByRole('combobox',{name:'그래픽 품질'}).selectOption('low');
      await expect(page.locator('#settings-status')).toHaveText('설정 저장됨');
      await page.reload();
      await page.getByRole('button',{name:'설정',exact:true}).click();
      await expect(page.getByRole('combobox',{name:'그래픽 품질'})).toHaveValue('low');
      await page.getByRole('button',{name:'돌아가기',exact:true}).click();
      await page.getByRole('button',{name:/^탐험 이어하기/}).click();
      await page.clock.runFor(80);
      await expect(page.locator('#overlay')).toBeHidden();
      const origin = new URL(page.url()).origin;
      for (const id of ['w01','w02','w03','w04']) {
        const response = await context.request.get(origin + encodeURI(prefix) + 'models/weapons/' + id + '.glb');
        assert.equal(response.status(),200);
        const bytes = await response.body();
        assert.equal(bytes.toString('utf8',0,4),'glTF');
      }
      assert.equal(requests.some(url => /monster-review|projectile-review|\.blend/.test(url)),false,'Archived review models must not be loaded by the game');
      assert.equal(responses.filter(r => r.status>=400 && !r.url.endsWith('/favicon.ico')).length,0);
      assert.equal(errors.length,0);
      fs.mkdirSync(path.join(__dirname, '../graphics-review/pages'), {recursive:true});
      await page.screenshot({path:path.join(__dirname, '../graphics-review/pages/', baseUrl ? 'live-game.png' : 'staged-game.png')});
    }
    console.log('PASS: nested game URL, weapon asset loading' + (full ? ', save/resume, settings persistence, all four GLBs, no new model integration' : ''));
  } finally {await browser.close(); if(server) await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
