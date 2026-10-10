// Original input defaults, three-column rebinding, pure-keyboard navigation, and actual controller actions.
// Uses isolated browser contexts and a simulated standard Gamepad API; no user profile is touched.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { startRun, travel, viewport, setAspect, toCharSelect } from './start.mjs';
const out = process.argv[2] ?? '/tmp/sts2-input-settings';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport });
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.addInitScript(() => {
  window.__pad = { connected: false, index: 0, id: 'E2E Xbox Controller', mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  Object.defineProperty(navigator, 'getGamepads', { value: () => window.__pad.connected ? [window.__pad] : [] });
});
const url = (process.env.URL ?? 'http://127.0.0.1:47173/') + '?seed=CONTINUE1&unlock=all&tutorials=off&lang=zhs';
const settings = async () => {
  await page.evaluate(() => { window.ui.menuStack = ['settings']; window.invalidate(); });
  await page.locator('.settings-tab').nth(3).click();
  await page.waitForSelector('.input-settings');
  await page.waitForTimeout(600);
};
const row = name => page.locator('.bind-row').filter({ has: page.locator('.sr-label', { hasText: name }) });
const cell = (name, col) => row(name).locator('.st-bind-btn').nth(col);
const tap = async button => {
  await page.evaluate(async button => {
    window.__pad.buttons[button] = { pressed: true, touched: true, value: 1 };
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
    window.__pad.buttons[button] = { pressed: false, touched: false, value: 0 };
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
  }, button);
};
try {
  await page.goto(url);
  await page.waitForFunction(() => window.ui?.screen === 'menu', null, { timeout: 60000 });
  await setAspect(page);
  await settings();
  assert.deepEqual(await page.locator('.srb-header-col').allTextContents(), ['操作指令', '鼠标+键盘', '控制器', '纯键盘']);
  assert.equal(await cell('查看地图', 0).textContent(), 'M');
  assert.equal(await cell('查看地图', 2).textContent(), 'Tab');
  assert.equal(await cell('查看牌组', 0).textContent(), 'D');
  assert.equal(await cell('查看牌组', 2).textContent(), 'Q');
  assert.equal(await cell('确认', 0).textContent(), 'E');
  assert.equal(await cell('确认', 2).textContent(), 'Enter');
  assert.ok(await cell('选择', 0).isDisabled());
  assert.equal(await cell('查看牌组', 1).locator('[data-glyph]').getAttribute('data-glyph'), 'xbox_one/lb');
  assert.equal(await cell('确认', 1).locator('[data-glyph]').getAttribute('data-glyph'), 'xbox_one/y');
  await cell('查看地图', 0).click(); await page.keyboard.press('F6'); await page.waitForSelector('[data-rebinding]', { state: 'detached' });
  assert.equal(await cell('查看地图', 0).textContent(), 'F6');
  await cell('查看地图', 2).click(); await page.keyboard.press('F7'); await page.waitForSelector('[data-rebinding]', { state: 'detached' });
  assert.equal(await cell('查看地图', 2).textContent(), 'F7');
  assert.equal(await cell('查看地图', 0).textContent(), 'F6');
  await cell('确认', 0).click(); await page.keyboard.press('t'); await page.waitForSelector('[data-rebinding]', { state: 'detached' });
  assert.equal(await cell('结束回合', 0).textContent(), 'T');
  await page.evaluate(() => { window.__pad.connected = true; });
  await cell('查看牌组', 1).click(); await tap(6);
  assert.equal(await cell('查看牌组', 1).locator('[data-glyph]').getAttribute('data-glyph'), 'xbox_one/lt');
  assert.equal(await cell('查看抽牌堆', 1).locator('[data-glyph]').getAttribute('data-glyph'), 'xbox_one/lb');
  await cell('确认', 1).click(); await tap(7);
  assert.equal(await cell('结束回合', 1).locator('[data-glyph]').getAttribute('data-glyph'), 'xbox_one/rt');
  await cell('查看地图', 0).click(); await page.keyboard.press('Escape');
  assert.equal(await cell('查看地图', 0).textContent(), 'F6');
  await page.mouse.move(5, 5); await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/bindings.png` });
  console.log('OK rebinding and linked actions');
  await page.reload(); await page.waitForFunction(() => window.ui?.screen === 'menu', null, { timeout: 60000 });
  await setAspect(page); await settings();
  assert.equal(await cell('查看地图', 0).textContent(), 'F6');
  assert.equal(await cell('查看地图', 2).textContent(), 'F7');
  await page.locator('.input-reset .st-button').click();
  assert.equal(await cell('确认', 0).textContent(), 'E');
  assert.equal(await cell('查看地图', 2).textContent(), 'Tab');
  await page.locator('.input-settings .st-tick').click();
  await page.keyboard.press('ArrowDown');
  assert.ok(await page.locator('.input-focus').count());
  for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowDown');
  await page.waitForFunction(() => parseFloat(document.querySelector('.settings-panel').style.top) < 0);
  console.log('OK keyboard scrolling reaches lower binding rows');
  await page.keyboard.press('q');
  await page.waitForSelector('.input-settings', { state: 'detached' });
  await page.keyboard.press('f'); await page.waitForSelector('.input-settings'); await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/keyboard-only.png` });
  await page.keyboard.press('Escape');
  await page.evaluate(() => { window.ui.menuStack = []; window.invalidate(); });
  await toCharSelect(page);
  await page.keyboard.press('ArrowRight');
  await page.waitForSelector('.charselect .input-button-hint');
  await page.screenshot({ path: `${out}/character-keyboard.png` });
  await page.evaluate(() => { window.__pad.connected = true; });
  await tap(11);
  await page.waitForSelector('.confirm-btn .input-button-hint [data-glyph$="xbox_one/a.tres"]');
  await page.waitForSelector('.back-btn .input-button-hint [data-glyph$="xbox_one/b.tres"]');
  await page.screenshot({ path: `${out}/character-controller.png` });
  await page.keyboard.press('Escape');
  console.log('OK settings persistence, reset, keyboard navigation and character hints');
  assert.deepEqual(errors, []);
  if (!process.env.SETTINGS_ONLY) {
  await page.evaluate(() => { window.G.SaveManager.Instance.PrefsSave.FastMode = window.G.FastModeType.Instant; });
  await startRun(page);
  await travel(page);
  await page.waitForSelector('.end-turn-btn.shown:not(.disabled)', { timeout: 30000 });
  await page.evaluate(async () => {
    const G = window.G, me = G.RunManager.Instance.State.Players[0];
    await G.CardCmd.Exhaust(new G.BlockingPlayerChoiceContext().$ctor_BlockingPlayerChoiceContext(), me.PlayerCombatState.Hand.Cards.at(-1), false, false);
    await G.CardPileCmd.Add$CardModel_PileType_CardPilePosition_AbstractModel_Boolean(me.PlayerCombatState.Hand.Cards.at(-1), G.PileType.Discard, G.CardPilePosition.Bottom, null, false);
  });
  // Pure keyboard has its own actual deck shortcut; mouse movement restores normal D.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('q'); await page.waitForFunction(() => window.ui.cardsView?.kind === 'deck');
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !window.ui.cardsView); await page.waitForTimeout(200);
  await page.mouse.move(7, 7); await page.keyboard.press('d');
  await page.waitForFunction(() => window.ui.cardsView?.kind === 'deck');
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !window.ui.cardsView); await page.waitForTimeout(200);
  await tap(6); await page.waitForFunction(() => window.ui.cardsView?.kind === 'draw');
  await tap(1); await page.waitForFunction(() => !window.ui.cardsView); await page.waitForTimeout(200);
  await tap(7); await page.waitForFunction(() => window.ui.cardsView?.kind === 'discard');
  await tap(1); await page.waitForFunction(() => !window.ui.cardsView); await page.waitForTimeout(200);
  await tap(4); await page.waitForFunction(() => window.ui.cardsView?.kind === 'deck');
  await tap(1); await page.waitForFunction(() => !window.ui.cardsView); await page.waitForTimeout(200);
  await tap(5); await page.waitForFunction(() => window.ui.cardsView?.kind === 'exhaust');
  await tap(1); await page.waitForFunction(() => !window.ui.cardsView); await page.waitForTimeout(200);
  const round = await page.evaluate(() => window.G.CombatManager.Instance.DebugOnlyGetState().RoundNumber);
  await tap(3);
  await page.waitForFunction(round => window.G.CombatManager.Instance.IsPlayPhase && window.G.CombatManager.Instance.DebugOnlyGetState().RoundNumber > round, round);
  assert.deepEqual(errors, []);
  console.log('OK original columns/defaults, independent maps, linked confirm/end turn, swapping, cancel, persistence, reset, keyboard navigation, device hints, controller piles/deck/end turn');
  }
} catch (e) { await page.screenshot({ path: `${out}/fail.png` }).catch(() => {}); console.error(e, errors); process.exitCode = 1; }
finally { await browser.close(); }
