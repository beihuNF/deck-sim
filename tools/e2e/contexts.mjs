// Auxiliary canvases can detach and reattach before their context-lost event is delivered (screen changes / Continue).
// Verify that their GPU context recovers and the run remains visible. Uses an isolated browser profile.
// CHROME=<path> [URL=<build>] node tools/e2e/contexts.mjs <outDir>
import { chromium } from 'playwright';
import { startRun, viewport } from './start.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const out = process.argv[2] ?? '/tmp/sts2-contexts';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME });
try {
  const page = await browser.newPage({ viewport }), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto((process.env.URL ?? 'http://127.0.0.1:47173/') + '?seed=CONTEXT1&unlock=all&tutorials=off');
  await page.waitForFunction(() => window.ui?.screen === 'menu', null, { timeout: 60000 });
  await page.evaluate(() => { window.G.SaveManager.Instance.PrefsSave.FastMode = window.G.FastModeType.Instant; });
  await startRun(page);
  await page.waitForSelector('.global-cards canvas');
  await page.waitForFunction(() => {
    const canvas = document.querySelector('.global-cards canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    return gl && !gl.isContextLost();
  });
  for (let i = 0; i < 3; i++) {
    const lost = await page.evaluate(async () => {
      const canvas = document.querySelector('.global-cards canvas'), parent = canvas.parentElement;
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      canvas.remove();
      // Give the detached-canvas observer a microtask, then remount before the context-lost event's task.
      await Promise.resolve();
      const lost = gl.isContextLost();
      parent.append(canvas);
      return lost;
    });
    assert.ok(lost, 'the detached canvas did not release its context');
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.global-cards canvas');
      return !(canvas.getContext('webgl2') ?? canvas.getContext('webgl')).isContextLost();
    }, null, { timeout: 10000 });
    console.log('restored context', i + 1);
  }
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${out}/restored.png` });
  console.log('OK');
} finally { await browser.close(); }
