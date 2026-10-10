// CardPileCmd updates the model's pile before finding its old visual node.
// Verify real browser holders after discard, redraw, exhaust and player turns.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { startRun, travel, viewport } from './start.mjs';

const out = process.argv[2] ?? '/tmp/sts2-hand-piles';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport }), errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/WebGL|GL Driver/.test(m.text())) errors.push(m.text()); });
try {
  await page.goto((process.env.URL ?? 'http://127.0.0.1:47174/') + '?seed=HANDPILES&unlock=all&tutorials=off');
  await page.waitForFunction(() => window.ui?.screen === 'menu');
  await page.evaluate(() => { window.G.SaveManager.Instance.PrefsSave.FastMode = window.G.FastModeType.Instant; });
  await startRun(page); await travel(page);
  await page.waitForSelector('.end-turn-btn.shown:not(.disabled)', { timeout: 60000 });
  const check = async label => {
    await page.waitForTimeout(700);
    const result = await page.evaluate(() => {
      const G = window.G, me = G.RunManager.Instance.State.Players[0];
      const ui = G.$.ext('MegaCrit.Sts2.Core.Nodes.Rooms.NCombatRoom').Instance.Ui, hand = ui.Hand;
      const models = hand.ActiveHolders.map(h => h.CardModel), cards = me.PlayerCombatState.Hand.Cards;
      return { cards: cards.length, holders: models.length,
        missing: cards.filter(c => !models.includes(c)).map(c => c.Id.Entry),
        stale: models.filter(c => !cards.includes(c)).map(c => c.Id.Entry),
        duplicates: models.length - new Set(models).size,
        stalePlayed: ui.PlayContainerCards.filter(n => n.Model.Pile?.Type !== G.PileType.Play).map(n => n.Model.Id.Entry) };
    });
    assert.deepEqual(result, { cards: result.cards, holders: result.cards, missing: [], stale: [], duplicates: 0, stalePlayed: [] }, label);
    console.log(label, JSON.stringify(result));
  };
  await check('initial hand');
  // The first seeded card is a targeted attack. Use the actual keyboard and
  // targeting UI, then wait for its action to finish before checking the nodes.
  await page.keyboard.press('1');
  await page.waitForFunction(() => document.querySelector('.combat.targeting'));
  await page.locator('.creature[data-side="enemy"]:not(.dead) .cr-hitbox').first().click();
  await page.mouse.move(5, 5);
  await page.waitForFunction(() => !window.G.RunManager.Instance.ActionExecutor.IsRunning
    && !window.G.$.ext('MegaCrit.Sts2.Core.Nodes.Rooms.NCombatRoom').Instance.Ui.Hand.currentPlay);
  await check('manual attack to discard');
  await page.evaluate(async () => {
    const G = window.G, pcs = G.RunManager.Instance.State.Players[0].PlayerCombatState;
    window.__movedCard = pcs.Hand.Cards[0];
    await G.CardPileCmd.Add$CardModel_CardPile_CardPilePosition_AbstractModel_Boolean(window.__movedCard, pcs.DiscardPile);
  });
  await check('hand to discard');
  await page.evaluate(async () => {
    const G = window.G, pcs = G.RunManager.Instance.State.Players[0].PlayerCombatState;
    await G.CardPileCmd.Add$CardModel_CardPile_CardPilePosition_AbstractModel_Boolean(window.__movedCard, pcs.Hand);
  });
  await check('discard to hand');
  await page.evaluate(async () => {
    const G = window.G, pcs = G.RunManager.Instance.State.Players[0].PlayerCombatState;
    await G.CardPileCmd.Add$CardModel_CardPile_CardPilePosition_AbstractModel_Boolean(window.__movedCard, pcs.ExhaustPile);
  });
  await check('hand to exhaust');
  for (let i = 0; i < 3; i++) {
    const round = await page.evaluate(() => window.G.CombatManager.Instance.DebugOnlyGetState().RoundNumber);
    await page.locator('.end-turn-btn.shown:not(.disabled)').click();
    await page.mouse.move(5, 5);
    await page.waitForFunction(round => window.G.CombatManager.Instance.IsPlayPhase
      && window.G.CombatManager.Instance.DebugOnlyGetState()?.RoundNumber > round, round, { timeout: 30000 });
    await check('player turn ' + (i + 2));
  }
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${out}/hand.png` });
  console.log('OK: hand holders match their pile after moves and three turns');
} catch (error) {
  await page.screenshot({ path: `${out}/failed.png` });
  console.error(errors);
  throw error;
} finally { await browser.close(); }
