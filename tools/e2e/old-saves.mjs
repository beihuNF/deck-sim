// Import frozen browser saves into isolated contexts, Continue, then Save & Quit / reload / Continue again.
// CHROME=<path> [URL=<dev server>] node tools/e2e/old-saves.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { viewport } from './start.mjs';

const root = fileURLToPath(new URL('../../packages/core/test/fixtures/', import.meta.url));
const out = path.resolve(process.argv[2] ?? '/tmp/sts2-old-saves');
fs.mkdirSync(out, { recursive: true });
const dirs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
const points = dirs(root).filter(v => v.startsWith('saves-v')).flatMap(v => dirs(path.join(root, v)).flatMap(run =>
  fs.readdirSync(path.join(root, v, run)).filter(f => f.endsWith('.json')).map(f => path.join(v, run, f.slice(0, -5)))))
  .filter(p => fs.readdirSync(path.join(root, p), { recursive: true }).some(f => f.endsWith('/current_run.save')));
assert.ok(points.length, 'no ongoing saves found');
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const menu = page => page.waitForFunction(() => window.ui?.screen === 'menu', null, { timeout: 60000 });
const stats = page => page.evaluate(() => {
  const run = window.G.RunManager.Instance.State, me = run.Players[0];
  return { floor: run.TotalFloor, hp: me.Creature.CurrentHp, maxHp: me.Creature.MaxHp, gold: me.Gold, deck: me.Deck.Cards.length, relics: me.Relics.length };
});
async function resume(page) {
  await page.waitForSelector('.mm-continue', { timeout: 10000 });
  await page.click('.mm-continue');
  await page.waitForFunction(() => window.ui?.screen === 'run' && window.G.RunManager.Instance.State?.CurrentRoom && window.ui.room, null, { timeout: 60000 });
  // Room entry exposes State before the character transition and reward window have finished opening.
  await page.waitForTimeout(1800);
}
let failed = false;
try {
  for (const point of points) {
    // A fresh browser context has its own IndexedDB/localStorage; existing player data is never opened.
    const context = await browser.newContext({ viewport });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const dir = path.join(root, point), name = point.replaceAll(path.sep, '-');
    try {
      const files = fs.readdirSync(dir, { recursive: true }).filter(f => fs.statSync(path.join(dir, f)).isFile())
        .map(f => [`user://${f.split(path.sep).join('/')}`, fs.readFileSync(path.join(dir, f), 'utf8')]);
      const facts = JSON.parse(fs.readFileSync(`${dir}.json`, 'utf8'));
      const expected = Object.fromEntries(['floor', 'hp', 'maxHp', 'gold', 'deck', 'relics'].map(k => [k, facts[k]]));
      await page.goto((process.env.URL ?? 'http://127.0.0.1:47173/') + '?tutorials=off');
      await menu(page);
      assert.equal(await page.evaluate(() => window.G.$.vfs.backend), 'indexeddb');
      await page.evaluate(files => window.G.$.vfs.restore(files), files);
      await page.reload();
      await menu(page);
      await resume(page);
      const first = await stats(page);
      assert.deepEqual(first, expected, 'old run changed on first continuation');
      await page.click('.tb-settings');
      await page.waitForSelector('.pause-menu');
      await page.click('.pause-btn >> nth=-1');
      await menu(page);
      await page.evaluate(() => window.G.$.vfs.flush());
      await page.reload();
      await menu(page);
      await resume(page);
      assert.deepEqual(await stats(page), first, 'old run changed after re-saving with the beta');
      assert.deepEqual(errors, [], 'page errors');
      await page.screenshot({ path: path.join(out, `${name}.png`) });
      console.log('OK', point, JSON.stringify(first));
    } catch (e) {
      failed = true;
      console.error('FAIL', point, e.message, errors);
      await page.screenshot({ path: path.join(out, `${name}-fail.png`) });
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
if (failed) process.exitCode = 1;
else console.log('OK', points.length, 'old runs continued and re-saved');
