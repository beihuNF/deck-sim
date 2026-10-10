// A player's extra turn increments TurnNumber without advancing RoundNumber.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { startRun, travel, viewport } from './start.mjs';
const out = process.argv[2] ?? '/tmp/sts2-extra-turn';
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
  const before = await page.evaluate(async () => {
    const G = window.G, me = G.RunManager.Instance.State.Players[0];
    await G.PowerCmd.Apply$PlayerChoiceContext_Creature_Decimal_Creature_CardModel_Boolean_T1(
      G.AmbergrisPower, new G.ThrowingPlayerChoiceContext().$ctor_ThrowingPlayerChoiceContext(), me.Creature, 1, me.Creature, null, true);
    return { round: me.Creature.CombatState.RoundNumber, turn: me.PlayerCombatState.TurnNumber };
  });
  await page.locator('.end-turn-btn.shown:not(.disabled)').click();
  await page.mouse.move(5, 5);
  await page.waitForFunction(before => {
    const G = window.G, me = G.RunManager.Instance.State.Players[0];
    return G.CombatManager.Instance.IsPlayPhase && me.PlayerCombatState.TurnNumber > before.turn;
  }, before);
  const extra = await page.evaluate(() => {
    const me = window.G.RunManager.Instance.State.Players[0];
    return { round: me.Creature.CombatState.RoundNumber, turn: me.PlayerCombatState.TurnNumber };
  });
  assert.deepEqual(extra, { round: before.round, turn: before.turn + 1 });
  await page.waitForFunction(turn => document.querySelector('.end-turn-btn')?.textContent.includes(String(turn)), extra.turn, { timeout: 5000 });
  await page.locator('.end-turn-btn.shown:not(.disabled)').click();
  await page.mouse.move(5, 5);
  await page.waitForFunction(before => {
    const G = window.G, me = G.RunManager.Instance.State.Players[0];
    return G.CombatManager.Instance.IsPlayPhase && me.Creature.CombatState.RoundNumber > before.round;
  }, before);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${out}/after-extra-turn.png` });
  console.log('OK: end-turn button ends the extra player turn and resumes the normal round', JSON.stringify({ before, extra }));
} finally { await browser.close(); }
