// Doom's completed clipping animation must remain safe to render until the creature is removed.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { startRun, travel, viewport } from './start.mjs';
const out = process.argv[2] ?? '/tmp/sts2-doom-vfx';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport }), errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/WebGL|GL Driver/.test(m.text())) errors.push(m.text()); });
try {
  await page.goto((process.env.URL ?? 'http://127.0.0.1:47174/') + '?seed=DOOMVFX&unlock=all&tutorials=off');
  await page.waitForFunction(() => window.ui?.screen === 'menu');
  await page.evaluate(() => { window.G.SaveManager.Instance.PrefsSave.FastMode = window.G.FastModeType.Instant; });
  await startRun(page, { char: 4 }); await travel(page);
  await page.waitForSelector('.end-turn-btn.shown:not(.disabled)', { timeout: 60000 });
  await page.waitForTimeout(2000);
  // Exercise the actual rule animation and leave its creature present for the following render frames.
  // Kill commands can finish the animation before the room's next render removes the actor.
  await page.evaluate(async () => {
    const G = window.G, room = G.$.ext('MegaCrit.Sts2.Core.Nodes.Rooms.NCombatRoom').Instance;
    const enemy = G.CombatManager.Instance.DebugOnlyGetState().Enemies.find(e => !e.IsDead);
    const node = room.GetCreatureNode(enemy);
    G.DoomPower.StartDoomAnim(node, true);
    await node.DeathAnimationTask;
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${out}/completed.png` });
  assert.deepEqual(errors, [], 'Doom animation completion must not leave an invalid render mask');
  console.log('OK: completed Doom animation renders without a destroyed clipping mask');
} catch (error) {
  console.error(errors);
  await page.screenshot({ path: `${out}/failed.png` });
  throw error;
} finally { await browser.close(); }
