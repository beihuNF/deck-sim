// Custom keyboard bindings, gamepad input polling, live hints, and device switching in isolated browser profiles.
// Gamepad API is simulated; this does not replace a physical-controller check.
// Usage: CHROME=<path> [URL=<server>] [LANG_UI=eng|zhs] node tools/e2e/input-hints.mjs <outDir>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { startRun, travel, viewport, setAspect } from './start.mjs';
import { pauseButton } from './pause.mjs';

const out = process.argv[2] ?? '/tmp/sts2-input-hints';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/GL Driver|WebGL/.test(m.text())) { errors.push(m.text()); console.error('browser console', m.text()); } });
await page.addInitScript(() => {
  localStorage.setItem('sts2_input_bindings', JSON.stringify({
    keys: { viewDeck: 'Tab', viewMap: 'F6', viewDraw: 'q', viewDiscard: 'w', viewExhaust: 'r', endTurn: 't', peek: 'p', confirm: 'f', cancel: 'Backspace', selectCard1: 'z' },
    // Legacy saved bindings remain authoritative even after the defaults change.
    gamepad: { viewDeck: 7, viewMap: 6, viewDraw: 14, viewDiscard: 15, viewExhaust: 13, handPrev: 4, handNext: 5, peek: 2, topPanel: null, confirm: 0, endTurn: 3, selectCard1: 9 },
  }));
  window.__pad = { connected: false, index: 0, id: 'E2E Controller', mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  Object.defineProperty(navigator, 'getGamepads', { value: () => window.__pad.connected ? [window.__pad] : [] });
});
const title = async expected => {
  await page.waitForFunction(expected => [...document.querySelectorAll('.hover-tip-title')].some(el => el.textContent.includes(expected)), expected, { timeout: 15000 });
  console.log('tip', await page.locator('.hover-tip-title').allTextContents());
};
const tip = async (selector, expected) => { await page.mouse.move(5, 5); await page.locator(selector).hover(); await title(expected); };
const padTap = async button => {
  await page.evaluate(async button => {
    window.__pad.buttons[button] = { pressed: true, touched: true, value: 1 };
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
    window.__pad.buttons[button] = { pressed: false, touched: false, value: 0 };
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
  }, button);
};
const closed = async () => { await page.waitForFunction(() => !window.ui.cardsView && !window.ui.pauseOpen); await page.waitForTimeout(150); };
const deck = async () => {
  await page.waitForFunction(() => window.ui.cardsView?.kind === 'deck');
  await page.waitForFunction(() => parseFloat(getComputedStyle(document.querySelector('.capstone-backstop')).opacity) > .99);
};
const selectHand = () => page.evaluate(() => {
  const G = window.G, me = G.RunManager.Instance.State.Players[0];
  const prefs = new G.CardSelectorPrefs().$ctor_CardSelectorPrefs$3(G.CardSelectorPrefs.ExhaustSelectionPrompt, 0, 1);
  prefs.RequireManualConfirmation = true;
  window.__selectedCount = null;
  void (async () => { const cards = await G.CardSelectCmd.FromHand(new G.BlockingPlayerChoiceContext().$ctor_BlockingPlayerChoiceContext(), me, prefs, null, null); window.__selectedCount = [...cards].length; })();
});
const virtualHover = async (selector, expected) => {
  await padTap(10);
  await page.waitForTimeout(400); // Let animated popups settle before the cursor first reaches their buttons.
  // Adjust once per browser frame: separate Playwright round trips can leave an axis held
  // for many frames on a busy renderer and overshoot an entire button.
  await page.evaluate(async selector => {
    for (let i = 0; i < 240; i++) {
      const r = document.querySelector(selector).getBoundingClientRect(), s = document.querySelector('.stage-root').getBoundingClientRect(), k = 1920 / s.width;
      const cursor = document.querySelector('.gamepad-cursor');
      const delta = [(r.left + r.width / 2 - s.left) * k - parseFloat(cursor.style.left), (r.top + r.height / 2 - s.top) * k - parseFloat(cursor.style.top)];
      if (delta.every(v => Math.abs(v) < 12)) break;
      window.__pad.axes = delta.map(v => Math.abs(v) < 12 ? 0 : Math.sign(v) * Math.max(0.24, Math.min(0.8, Math.abs(v) / 90))).concat([0, 0]);
      await new Promise(requestAnimationFrame);
    }
    window.__pad.axes = [0, 0, 0, 0];
  }, selector);
  try { await title(expected); } catch (error) {
    console.log('virtual hover state', await page.evaluate(selector => {
      const cursor = document.querySelector('.gamepad-cursor'), root = document.querySelector('.stage-root')?.getBoundingClientRect();
      const pos = cursor ? [parseFloat(cursor.style.left), parseFloat(cursor.style.top)] : null;
      const hit = pos && root ? document.elementFromPoint(root.left + pos[0] * root.width / 1920, root.top + pos[1] * root.width / 1920) : null;
      const target = document.querySelector(selector)?.getBoundingClientRect();
      return { pos, root: root && [root.x, root.y, root.width, root.height], target: target && [target.x, target.y, target.width, target.height], hit: hit?.className, tips: [...document.querySelectorAll('.hover-tip-title')].map(el => el.textContent), focused: [...document.querySelectorAll('.input-focus')].map(el => el.className), connected: window.__pad.connected, axes: window.__pad.axes };
    }, selector));
    throw error;
  }
};

try {
  await page.goto((process.env.URL ?? 'http://127.0.0.1:47173/') + '?seed=CONTINUE1&unlock=all&tutorials=off&lang=' + (process.env.LANG_UI ?? 'eng'));
  await page.waitForFunction(() => window.ui?.screen === 'menu', null, { timeout: 60000 });
  await setAspect(page);
  await page.evaluate(() => { window.G.SaveManager.Instance.PrefsSave.FastMode = window.G.FastModeType.Instant; window.G.SaveManager.Instance.PrefsSave.ShowCardIndices = true; });
  await startRun(page);
  await tip('.tb-deck', 'Tab');
  await page.evaluate(() => { window.__pad.connected = true; });
  await page.waitForTimeout(200);
  await title('Tab'); // Connection alone is not gamepad input.
  await page.keyboard.press('d');
  assert.equal(await page.evaluate(() => window.ui.cardsView), null);
  await page.keyboard.press('Tab'); await deck();
  await page.screenshot({ path: `${out}/deck-background.png` });
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.ui.cardsView?.kind), 'deck');
  await tip('.cards-screen .back-btn', 'Backspace');
  await page.keyboard.press('Backspace'); await closed();
  await padTap(12); // Old deck button must no longer open it.
  assert.equal(await page.evaluate(() => window.ui.cardsView), null);
  await padTap(7); await deck();
  await padTap(1); await closed();
  assert.equal(await page.locator('.gamepad-cursor').count(), 0, 'map uses controller node focus');
  await page.waitForSelector('.mp.travelable.input-focus');
  await tip('.tb-deck', 'Tab'); await padTap(10); await title('RT');
  await page.waitForSelector('.hover-tip-title [data-glyph$="xbox_one/rt.tres"]');
  for (const [id, family, label] of [['Sony DualSense (054c)', 'ps4', 'R2'], ['Nintendo Switch Pro (057e)', 'switch', 'ZR'], ['E2E Controller', 'xbox_one', 'RT']]) {
    await page.evaluate(id => { window.__pad.id = id; }, id);
    await title(label);
    await page.waitForSelector(`.hover-tip-title [data-glyph$="${family}/rt.tres"]`);
  }
  await page.keyboard.press('Shift'); await title('Tab');
  assert.equal(await page.locator('.hover-tip-title .rt-controller-icon').count(), 0);
  await travel(page);
  await page.waitForSelector('.end-turn-btn.shown:not(.disabled)', { timeout: 30000 });
  await page.evaluate(async () => {
    const G = window.G, me = G.RunManager.Instance.State.Players[0];
    await G.CardCmd.Exhaust(new G.BlockingPlayerChoiceContext().$ctor_BlockingPlayerChoiceContext(), me.PlayerCombatState.Hand.Cards.at(-1), false, false);
    await G.CardPileCmd.Add$CardModel_PileType_CardPilePosition_AbstractModel_Boolean(me.PlayerCombatState.Hand.Cards.at(-1), G.PileType.Discard, G.CardPilePosition.Bottom, null, false);
  });
  await tip('.tb-deck', 'Tab');
  await padTap(10); await title('RT'); // Update the already-visible tip without moving the mouse.
  await page.keyboard.press('Shift'); await title('Tab');
  await padTap(10); await title('RT');
  await page.mouse.move(8, 8); await page.locator('.tb-deck').hover(); await title('Tab');
  const hints = [['.tb-map', 'F6', 'LT'], ['.tb-settings', 'Backspace', 'B'], ['.pile-btn.draw', 'Q', 'D-Pad Left'], ['.pile-btn.discard', 'W', 'D-Pad Right'], ['.pile-btn.exhaust', 'R', 'D-Pad Down'], ['.end-turn-btn', 'T', 'Y']];
  for (const [selector, key, button] of hints) {
    await tip(selector, key); await padTap(10); await title(button);
    await page.waitForSelector(`.hover-tip-title .rt-controller-icon[aria-label="${button}"]`);
  }
  await page.keyboard.press('Shift');
  await page.waitForFunction(() => [...document.querySelectorAll('.hand-index')].some(el => el.textContent === 'Z' && getComputedStyle(el).display !== 'none'));
  await padTap(10);
  await page.waitForFunction(() => [...document.querySelectorAll('.hand-index')].some(el => getComputedStyle(el).display !== 'none' && el.querySelector('[data-glyph$="xbox_one/start.tres"]')));
  assert.equal(await page.locator('.hand-index:visible').count(), 1, 'unassigned controller card buttons stay hidden');
  for (const [key, kind, old] of [['q', 'draw', 'a'], ['w', 'discard', 's'], ['r', 'exhaust', 'x']]) {
    await page.keyboard.press(old); await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.ui.cardsView), null);
    await page.keyboard.press(key);
    await page.waitForFunction(kind => window.ui.cardsView?.kind === kind, kind);
    await page.keyboard.press('Backspace'); await closed();
  }
  await padTap(14); await page.waitForFunction(() => window.ui.cardsView?.kind === 'draw');
  await padTap(1); await closed();
  await padTap(15); await page.waitForFunction(() => window.ui.cardsView?.kind === 'discard');
  await padTap(1); await closed();
  await padTap(13); await page.waitForFunction(() => window.ui.cardsView?.kind === 'exhaust');
  await padTap(1); await closed();
  await padTap(7); await deck(); await padTap(1); await closed();
  await selectHand();
  await tip('.peek-button', 'P'); await padTap(10); await title('X');
  const peeking = () => page.evaluate(() => window.G.$.ext('MegaCrit.Sts2.Core.Nodes.Rooms.NCombatRoom').Instance.Ui.Hand.select.peeking);
  await page.keyboard.press('p'); assert.equal(await peeking(), true);
  await page.keyboard.press('p'); assert.equal(await peeking(), false);
  await padTap(2); assert.equal(await peeking(), true);
  await padTap(2); assert.equal(await peeking(), false);
  await tip('.combat .confirm-btn.shown', 'F'); await padTap(10); await title('A');
  await page.keyboard.press('f');
  await page.waitForFunction(() => window.__selectedCount === 0);
  await selectHand();
  await page.waitForSelector('.combat .confirm-btn.shown');
  await page.waitForTimeout(150);
  await padTap(0); await page.waitForFunction(() => window.__selectedCount === 0);
  await padTap(1); await page.waitForSelector('.pause-menu');
  await (await pauseButton(page, 'GIVE_UP')).click();
  await tip('.vp-btn.yes', 'F'); await virtualHover('.vp-btn.yes', 'A');
  await page.keyboard.press('Backspace'); await page.waitForSelector('.vpopup', { state: 'detached' });
  await (await pauseButton(page, 'GIVE_UP')).click();
  await page.waitForSelector('.vpopup');
  await padTap(1); await page.waitForSelector('.vpopup', { state: 'detached' });
  assert.ok(await page.locator('.gamepad-cursor').count(), 'modal cancel must preserve controller mode');
  await (await pauseButton(page, 'RESUME')).click();
  await tip('.tb-deck', 'Tab'); await padTap(10); await title('RT');
  await page.screenshot({ path: `${out}/controller-hints.png` });
  await page.evaluate(() => { window.__pad.connected = false; }); await title('Tab');
  await page.evaluate(() => { window.G.SaveManager.Instance.PrefsSave.IsLongPressEnabled = false; });
  const round = () => page.evaluate(() => window.G.CombatManager.Instance.DebugOnlyGetState().RoundNumber);
  let beforeRound = await round();
  await page.keyboard.press('e'); await page.waitForTimeout(150); assert.equal(await round(), beforeRound);
  await page.keyboard.press('t');
  await page.waitForFunction(round => window.G.CombatManager.Instance.IsPlayPhase && window.G.CombatManager.Instance.DebugOnlyGetState().RoundNumber > round, beforeRound);
  beforeRound = await round();
  await page.evaluate(() => { window.__pad.connected = true; });
  await padTap(3);
  await page.waitForFunction(round => window.G.CombatManager.Instance.IsPlayPhase && window.G.CombatManager.Instance.DebugOnlyGetState().RoundNumber > round, beforeRound);
  await page.keyboard.press('Backspace'); await page.waitForSelector('.pause-menu');
  await (await pauseButton(page, 'SETTINGS')).click();
  await page.locator('.settings-tab').nth(3).click();
  await page.locator('.bind-row').nth(5).locator('.st-bind-btn').nth(1).click();
  await padTap(0);
  await page.waitForSelector('[data-rebinding]', { state: 'detached' });
  assert.equal(await page.locator('.bind-row').nth(8).locator('[data-glyph]').getAttribute('data-glyph'), 'xbox_one/left');
  assert.equal(await page.locator('.bind-row').nth(9).locator('[data-glyph]').getAttribute('data-glyph'), 'xbox_one/left');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${out}/hints.png` });
  console.log('OK custom keyboard/controller bindings, live hints, idle connection, device changes, disconnect, piles, hand labels, peek, confirmation, modal cancel, end turn');
} catch (error) {
  await page.screenshot({ path: `${out}/fail.png` }).catch(() => {});
  console.error(error, errors);
  process.exitCode = 1;
} finally { await browser.close(); }
