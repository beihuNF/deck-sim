// Drag from a card's inline image: native HTML image dragging must not cancel the game's pointer input.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { startRun, travel, viewport } from './start.mjs';
const out = process.argv[2] ?? '/tmp/sts2-card-drag';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport }), errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/WebGL|GL Driver/.test(m.text())) errors.push(m.text()); });
try {
  await page.goto((process.env.URL ?? 'http://127.0.0.1:47174/') + '?seed=CARDDRAG&lang=eng&unlock=all&tutorials=off');
  await page.waitForFunction(() => window.ui?.screen === 'menu');
  await page.evaluate(() => { window.G.SaveManager.Instance.PrefsSave.FastMode = window.G.FastModeType.Instant; });
  await startRun(page, { char: 4 }); await travel(page);
  await page.waitForSelector('.end-turn-btn.shown:not(.disabled)', { timeout: 60000 });
  const before = await page.evaluate(async () => {
    const G = window.G, me = G.RunManager.Instance.State.Players[0], pcs = me.PlayerCombatState;
    for (const card of [...pcs.Hand.Cards]) await G.CardPileCmd.Add$CardModel_CardPile_CardPilePosition_AbstractModel_Boolean(card, pcs.DiscardPile);
    const cs = G.CombatManager.Instance.DebugOnlyGetState();
    const card = cs.CreateCard$CardModel_Player(G.ModelDb.Card(G.Wisp), me);
    window.__dragCard = card;
    await G.CardPileCmd.Add$CardModel_CardPile_CardPilePosition_AbstractModel_Boolean(card, pcs.Hand);
    return pcs.Energy;
  });
  const card = page.locator('.card-node .card').filter({ has: page.locator('.card-title', { hasText: 'Wisp' }) });
  await card.hover(); await page.waitForTimeout(600);
  const icon = await card.locator('.rt-icon').first().boundingBox();
  assert.ok(icon, 'inline energy icon');
  const end = await page.locator('.stage-root').first().boundingBox();
  await page.mouse.move(icon.x + icon.width / 2, icon.y + icon.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height * 0.4, { steps: 12 });
  await page.waitForTimeout(300); await page.mouse.up(); await page.mouse.move(5, 5);
  await page.waitForFunction(() => window.__dragCard.Pile?.Type === window.G.PileType.Exhaust, null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => window.G.RunManager.Instance.State.Players[0].PlayerCombatState.Energy), before + 1);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${out}/played.png` });
  console.log('OK: dragging Wisp from its energy icon plays it, gains energy and exhausts it');
} catch (error) {
  console.error(errors);
  await page.screenshot({ path: `${out}/failed.png` });
  throw error;
} finally { await browser.close(); }
