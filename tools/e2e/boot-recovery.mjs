// Fault injection against a production preview, with real module loading and Service Worker fetches.
// CHROME=<path> URL=http://127.0.0.1:47174/ node tools/e2e/boot-recovery.mjs <outDir>
// BROWSER=webkit checks the initial-page recovery with WebKit too. All profiles are isolated.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { chromium, webkit } from 'playwright';

const upstream = process.env.URL ?? 'http://127.0.0.1:47174/';
const out = process.argv[2] ?? '/tmp/sts2-boot-recovery';
fs.mkdirSync(out, { recursive: true });
const html = await (await fetch(upstream)).text();
const entry = html.match(/<script[^>]*type="module"[^>]*src="([^"]+)"/)?.[1];
assert.ok(entry?.includes('/js/'), 'use a production build, not a dev server');
const entryPath = new URL(entry, upstream).pathname;
let fault, requests = [], held = [];
async function forward(req, res) {
  try {
    const response = await fetch(new URL(req.url, upstream));
    // Node fetch decodes the body; do not forward its compressed content-length/encoding.
    for (const [key, value] of response.headers) if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key)) res.setHeader(key, value);
    if (new URL(req.url, upstream).pathname === entryPath) res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.writeHead(response.status);
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { res.destroy(error); }
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (fault?.matches(url)) {
    requests.push({ url: req.url, cache: req.headers['cache-control'], time: Date.now() });
    const failure = fault.failures[Math.min(requests.length - 1, fault.failures.length - 1)];
    if (failure === 'hold') { held.push(() => forward(req, res)); return; }
    if (failure === 'network') { res.destroy(); return; }
    if (failure) {
      // Include the immutable header used on the real site's hashed scripts.
      res.writeHead(failure, { 'Content-Type': 'text/plain', 'Cache-Control': url.pathname === entryPath ? 'public, max-age=2592000, immutable' : 'no-store' });
      res.end('injected resource failure'); return;
    }
  }
  void forward(req, res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await (process.env.BROWSER === 'webkit' ? webkit.launch() : chromium.launch({ executablePath: process.env.CHROME }));
function setFault(matches, failures) { fault = { matches, failures }; requests = []; }
async function fresh(options = {}) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  return { context, page };
}
const menu = page => page.waitForFunction(() => window.ui?.screen === 'menu', null, { timeout: 60000 });
try {
  // First visits have no Service Worker yet: the inline guard must recover the failed entry script itself.
  for (const persistent of [false, true]) {
    const { context, page } = await fresh({ serviceWorkers: 'block' });
    let navigations = 0;
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) navigations++; });
    setFault(url => url.pathname === entryPath, persistent ? [500] : [500, 0]);
    try {
      await page.goto(base + '?lang=zhs&tutorials=off');
      if (persistent) {
        await page.waitForFunction(() => document.querySelector('.boot-recovery-message')?.textContent.includes('请稍后重试'), null, { timeout: 20000 });
        await page.waitForTimeout(4000);
        assert.equal(navigations, 3, 'stop after two automatic page reloads');
        assert.ok(requests.length <= 5, 'script refetches and document reloads are bounded');
        await page.screenshot({ path: `${out}/failed.png` });
        fault.failures = [0];
        await page.locator('#boot-recovery button').click();
        await menu(page);
      } else {
        await menu(page);
        assert.equal(navigations, 2, 'a single failed module request recovers with one automatic reload');
        assert.ok(requests.length <= 3, 'one refetch and one reload are enough');
      }
      assert.equal(await page.locator('#boot-recovery').count(), 0);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('sts2web.boot-retry')), null);
      console.log(`OK initial script ${persistent ? 'bounded failure and manual recovery' : '500 recovery'}`);
    } catch (error) {
      console.error('Initial script failure', { requests, navigations, state: await page.evaluate(() => ({ text: document.body.innerText, retry: sessionStorage.getItem('sts2web.boot-retry') })) });
      throw error;
    } finally { await context.close(); }
  }
  {
    const { context, page } = await fresh({ serviceWorkers: 'block' });
    await context.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('storage unavailable'); } }));
    setFault(url => url.pathname === entryPath, [500]);
    try {
      await page.goto(base + '?lang=eng&tutorials=off');
      await page.waitForFunction(() => document.querySelector('.boot-recovery-message')?.textContent.includes('Please try again'));
      await page.waitForTimeout(4000);
      assert.equal(requests.length, 1, 'no automatic reload without a persistent retry limit');
      fault.failures = [0];
      await page.locator('#boot-recovery button').click();
      await menu(page);
      console.log('OK recovery when session storage is unavailable');
    } finally { await context.close(); }
  }
  // A pending request shows a manual control, without repeatedly reloading a slow connection or mounting saves twice.
  {
    const { context, page } = await fresh({ serviceWorkers: 'block' });
    setFault(url => url.pathname === entryPath, ['hold']);
    try {
      await page.clock.install();
      await page.goto(base + '?lang=eng&tutorials=off', { waitUntil: 'commit' });
      await page.waitForSelector('#app', { state: 'attached' });
      await page.clock.fastForward(46000);
      await page.waitForSelector('#boot-recovery');
      assert.match(await page.locator('.boot-recovery-message').innerText(), /taking longer/);
      assert.equal(requests.length, 1, 'no automatic reload while a request is still pending');
      // WebKit waits for document.fonts.ready until the intentionally held module lets DOMContentLoaded fire.
      if (process.env.BROWSER !== 'webkit') await page.screenshot({ path: `${out}/slow.png` });
      for (const release of held.splice(0)) await release();
      await menu(page);
      assert.equal(await page.locator('#boot-recovery').count(), 0, 'late startup removes the loading warning');
      console.log('OK slow loading and late recovery');
    } finally { await context.close(); }
  }
  // WebKit's automation does not expose Service Worker routing consistently; Chromium checks its real network path.
  if (process.env.BROWSER !== 'webkit') {
    const { context, page } = await fresh();
    fault = null;
    try {
      await page.goto(base + '?lang=eng&tutorials=off'); await menu(page);
      await page.waitForFunction(() => !!navigator.serviceWorker.controller);
      for (const [name, failures, expected, status] of [
        ['500/503 recovery', [500, 503, 0], 3, 200],
        ['network recovery', ['network', 0], 2, 200],
        ['503 exhaustion', [503], 3, 503],
        ['404 is not retried', [404], 1, 404],
      ]) {
        const probe = name.split(' ')[0];
        setFault(url => url.searchParams.get('probe') === probe, failures);
        const resource = 'assets/i18n/index.json?probe=' + encodeURIComponent(probe);
        const load = () => page.evaluate(async url => {
          const response = await fetch(url);
          return { status: response.status, body: await response.text() };
        }, resource);
        assert.equal((await load()).status, status);
        assert.equal(requests.length, expected);
        if (status === 200) {
          assert.equal((await load()).status, 200);
          assert.equal(requests.length, expected, 'successful retry populates the offline cache');
        } else {
          fault.failures = [0];
          assert.equal((await load()).status, 200, 'failed responses do not poison the offline cache');
          assert.equal(requests.length, expected + 1);
        }
        console.log(`OK Service Worker ${name}`);
      }
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
