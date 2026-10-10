// A hovered power must not refresh after the player's combat state is torn down.
import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { startRun, travel, viewport } from './start.mjs';
const out = process.argv[2] ?? '/tmp/sts2-combat-exit';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport }), errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/WebGL|GL Driver/.test(m.text())) errors.push(m.text()); });
try {
  await page.goto((process.env.URL ?? 'http://127.0.0.1:47174/') + '?seed=EXITCOMBAT&unlock=all&tutorials=off');
  await page.waitForFunction(() => window.ui?.screen === 'menu');
  await page.evaluate(() => { window.G.SaveManager.Instance.PrefsSave.FastMode = window.G.FastModeType.Instant; });
  await startRun(page); await travel(page);
  await page.waitForSelector('.end-turn-btn.shown:not(.disabled)', { timeout: 60000 });
  await page.evaluate(async () => {
    const G = window.G, me = G.RunManager.Instance.State.Players[0];
    await G.PowerCmd.Apply$PlayerChoiceContext_Creature_Decimal_Creature_CardModel_Boolean_T1(
      G.StrengthPower, new G.ThrowingPlayerChoiceContext().$ctor_ThrowingPlayerChoiceContext(), me.Creature, 1, me.Creature, null, true);
  });
  await page.locator('.creature[data-side="ally"] .power').first().hover();
  await page.evaluate(async () => {
    const G = window.G, me = G.RunManager.Instance.State.Players[0];
    await G.CreatureCmd.Kill$Creature_Boolean(me.Creature, true);
    await G.CombatManager.Instance.CheckWinCondition();
  });
  await page.waitForSelector('.gameover', { timeout: 60000 });
  await page.waitForTimeout(2000);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${out}/loss.png` });
  console.log('OK: combat loss with a hovered power has no stale-state or deferred-refresh errors');
} catch (error) {
  await page.screenshot({ path: `${out}/failed.png` });
  console.error(errors);
  throw error;
} finally { await browser.close(); }
