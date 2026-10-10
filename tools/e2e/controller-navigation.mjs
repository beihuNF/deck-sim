// Actual map navigation and card play with a simulated standard pad, independent of mouse position.
// Fresh browser profile; VIEW/ASPECT use the same options as the other browser regressions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { startRun, viewport, setAspect } from './start.mjs';
const out = process.argv[2] ?? '/tmp/sts2-controller-navigation';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.setDefaultTimeout(15000);
await page.addInitScript(() => {
  performance.setResourceTimingBufferSize(10000);
  window.__pad = { connected: false, index: 0, id: 'E2E Xbox Controller', mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })) };
  Object.defineProperty(navigator, 'getGamepads', { value: () => window.__pad.connected ? [window.__pad] : [] });
});
const tap = button => page.evaluate(async button => {
  window.__pad.buttons[button] = { pressed: true, touched: true, value: 1 };
  for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
  window.__pad.buttons[button] = { pressed: false, touched: false, value: 0 };
  for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
}, button);
const tilt = (x, y = 0) => page.evaluate(async ([x, y]) => {
  window.__pad.axes = [x, y, 0, 0];
  await new Promise(requestAnimationFrame);
  window.__pad.axes = [0, 0, 0, 0];
  for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
}, [x, y]);
const hand = () => page.evaluate(() => {
  const h = window.G.$.ext('MegaCrit.Sts2.Core.Nodes.Rooms.NCombatRoom').Instance.Ui.Hand;
  return { focused: h.ActiveHolders.indexOf(h.FocusedHolder), count: h.ActiveHolders.length, playing: !!h.currentPlay };
});
const aimed = () => page.evaluate(() => {
  const tm = window.__nodes.targetManager, room = window.G.$.ext('MegaCrit.Sts2.Core.Nodes.Rooms.NCombatRoom').Instance;
  const top = tm.hovered?.GetTopOfHitbox(), bottom = tm.hovered?.GetBottomOfHitbox();
  return { selecting: tm.IsInSelection, index: room.CreatureNodes.indexOf(tm.hovered), id: tm.hovered?.Entity?.Monster?.Id.Entry,
    reticles: room.CreatureNodes.filter(n => n.reticle).length, arrow: [window.__nodes.arrow.to.X, window.__nodes.arrow.to.Y], center: top && bottom ? [top.X, (top.Y + bottom.Y) / 2] : null };
});
const focusCard = async index => {
  const prev = await page.evaluate(async () => (await window.__loadModule('/src/input/bindings.ts')).getBindings().gamepad.handPrev);
  for (let n = 0; n < 12 && (await hand()).focused !== index; n++) await tap(prev);
  assert.equal((await hand()).focused, index);
};
try {
  await page.goto((process.env.URL ?? 'http://127.0.0.1:47173/') + '?seed=CONTINUE1&unlock=all&tutorials=off&lang=eng');
  await page.waitForFunction(() => window.ui?.screen === 'menu', null, { timeout: 60000 });
  await setAspect(page);
  await page.evaluate(() => { window.G.SaveManager.Instance.PrefsSave.FastMode = window.G.FastModeType.Instant; });
  await startRun(page);
  await page.mouse.move(viewport.width - 5, viewport.height - 5);
  await page.evaluate(async () => {
    // Vite adds an HMR timestamp to imports; reuse that exact URL to avoid a second copy of node singletons.
    window.__loadModule = path => import(performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === path).name);
    window.__nodes = await window.__loadModule('/src/cardnodes.ts'); window.__pad.connected = true;
  });
  await tap(11);
  await page.waitForSelector('.map-screen .mp.travelable.input-focus');
  assert.equal(await page.locator('.gamepad-cursor').count(), 0);
  const first = await page.locator('.mp.travelable.input-focus').evaluate(el => el.style.left);
  if (await page.locator('.mp.travelable').count() > 1) {
    await tilt(0.8);
    assert.notEqual(await page.locator('.mp.travelable.input-focus').evaluate(el => el.style.left), first);
    await tap(14);
    assert.equal(await page.locator('.mp.travelable.input-focus').evaluate(el => el.style.left), first);
  }
  const scrollY = () => page.locator('.map-screen .map-scroll').first().evaluate(el => Number(el.style.transform.match(/translateY\(([-.\d]+)px/)[1]));
  const originalY = await scrollY();
  await tilt(0, -0.8);
  assert.ok(await scrollY() > originalY + 10, 'up scrolls the map');
  await tap(14);
  await page.waitForFunction(y => Math.abs(Number(document.querySelector('.map-screen .map-scroll').style.transform.match(/translateY\(([-.\d]+)px/)[1]) - y) < 2, originalY);
  await page.screenshot({ path: `${out}/map-focus.png` });
  await tap(0);
  await page.waitForSelector('.end-turn-btn.shown:not(.disabled)', { timeout: 30000 });
  await page.waitForFunction(() => window.G.CombatManager.Instance.IsPlayPhase && window.G.RunManager.Instance.State.Players[0].PlayerCombatState.Hand.Cards.length >= 5 && !window.G.RunManager.Instance.ActionExecutor.IsRunning);
  await page.evaluate(async () => {
    const G = window.G;
    await G.RunManager.Instance.EnterRoomDebug(G.RoomType.Monster, G.MapPointType.Unassigned, G.ModelDb.Encounter(G.BowlbugsNormal).ToMutable(), false);
  });
  await page.waitForSelector('.end-turn-btn.shown:not(.disabled)', { timeout: 30000 });
  await page.waitForFunction(() => window.G.CombatManager.Instance.IsPlayPhase && window.G.RunManager.Instance.State.Players[0].PlayerCombatState.Hand.Cards.length >= 5 && !window.G.RunManager.Instance.ActionExecutor.IsRunning);
  await page.evaluate(async () => {
    const G = window.G, me = G.RunManager.Instance.State.Players[0], pcs = me.PlayerCombatState, cs = G.CombatManager.Instance.DebugOnlyGetState();
    for (const card of [...pcs.Hand.Cards]) await G.CardPileCmd.Add$CardModel_CardPile_CardPilePosition_AbstractModel_Boolean(card, pcs.DiscardPile);
    window.__cards = [];
    for (const model of [G.StrikeIronclad, G.StrikeIronclad, G.StrikeIronclad, G.DefendIronclad]) {
      const card = cs.CreateCard$CardModel_Player(G.ModelDb.Card(model), me);
      window.__cards.push(card);
      await G.CardPileCmd.Add$CardModel_CardPile_CardPilePosition_AbstractModel_Boolean(card, pcs.Hand);
    }
    pcs.Energy = 10;
  });
  await page.waitForFunction(() => {
    const h = window.G.$.ext('MegaCrit.Sts2.Core.Nodes.Rooms.NCombatRoom').Instance.Ui.Hand;
    return h.ActiveHolders.length === 4 && h.ActiveHolders.every(x => window.__cards.includes(x.CardModel));
  });
  await tap(11);
  await page.waitForFunction(() => window.G.$.ext('MegaCrit.Sts2.Core.Nodes.Rooms.NCombatRoom').Instance.Ui.Hand.FocusedHolder);
  assert.equal(await page.locator('.gamepad-cursor').count(), 0);
  await focusCard(0);
  assert.equal(await page.evaluate(() => window.G.$.ext('MegaCrit.Sts2.Core.Nodes.Rooms.NCombatRoom').Instance.Ui.Hand.FocusedHolder.CardModel.Id.Entry), 'STRIKE_IRONCLAD');
  await tap(0);
  await page.waitForFunction(() => window.__nodes.targetManager.IsInSelection && window.__nodes.targetManager.hovered);
  const initial = await aimed();
  assert.deepEqual(initial.arrow, initial.center, 'aim must snap to target, regardless of mouse position');
  assert.equal(initial.reticles, 1);
  await tilt(0.8);
  const changed = await aimed();
  assert.notEqual(changed.index, initial.index);
  assert.equal(changed.reticles, 1, 'old target must lose its reticle');
  // Remapped directions must also steer targets (no hardcoded physical D-pad buttons).
  await page.evaluate(async () => { const bindings = await window.__loadModule('/src/input/bindings.ts'); bindings.setGamepadBinding('handPrev', 11); });
  await tap(11);
  assert.equal((await aimed()).index, initial.index);
  await tilt(0.8);
  await page.screenshot({ path: `${out}/enemy-focus.png` });
  await tap(1);
  await page.waitForFunction(() => !window.__nodes.targetManager.IsInSelection && !window.G.$.ext('MegaCrit.Sts2.Core.Nodes.Rooms.NCombatRoom').Instance.Ui.Hand.currentPlay);
  assert.equal(await page.evaluate(() => window.__cards[0].Pile.Type), await page.evaluate(() => window.G.PileType.Hand));
  await tap(0);
  await page.waitForFunction(() => window.__nodes.targetManager.hovered);
  await tilt(0.8);
  const target = (await aimed()).index;
  const before = await page.evaluate(() => ({ hp: window.__nodes.targetManager.hovered.Entity.CurrentHp, energy: window.G.RunManager.Instance.State.Players[0].PlayerCombatState.Energy }));
  await tap(0);
  await page.waitForFunction(() => window.__cards[0].Pile.Type === window.G.PileType.Discard && !window.G.RunManager.Instance.ActionExecutor.IsRunning);
  assert.equal(await page.evaluate(() => window.G.RunManager.Instance.State.Players[0].PlayerCombatState.Energy), before.energy - 1);
  assert.ok(await page.evaluate(([target, hp]) => window.G.$.ext('MegaCrit.Sts2.Core.Nodes.Rooms.NCombatRoom').Instance.CreatureNodes[target].Entity.CurrentHp < hp, [target, before.hp]));
  await tap(0);
  await page.waitForFunction(() => window.__nodes.targetManager.hovered);
  assert.equal((await aimed()).index, target, 'next card remembers the last living target');
  await page.evaluate(async () => { window.__deadTarget = window.__nodes.targetManager.hovered.Entity; await window.G.CreatureCmd.Kill$Creature_Boolean(window.__deadTarget, true); });
  await page.waitForFunction(() => window.__nodes.targetManager.hovered && window.__nodes.targetManager.hovered.Entity !== window.__deadTarget && window.__nodes.targetManager.hovered.Entity.IsHittable);
  await tap(1);
  await focusCard((await hand()).count - 1);
  const block = await page.evaluate(() => window.G.RunManager.Instance.State.Players[0].Creature.Block);
  await tap(0);
  assert.equal((await hand()).playing, true, 'self-target card previews before confirmation');
  assert.equal(await page.evaluate(() => window.G.RunManager.Instance.State.Players[0].Creature.Block), block);
  await tap(0);
  await page.waitForFunction(() => window.__cards[3].Pile.Type === window.G.PileType.Discard && !window.G.RunManager.Instance.ActionExecutor.IsRunning);
  assert.ok(await page.evaluate(block => window.G.RunManager.Instance.State.Players[0].Creature.Block > block, block));
  // Pure keyboard directional play uses the same controller path.
  await page.evaluate(() => { window.G.SaveManager.Instance.PrefsSave.KeyboardMode = true; });
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__nodes.targetManager.hovered);
  await page.keyboard.press('ArrowRight');
  assert.deepEqual((await aimed()).arrow, (await aimed()).center);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__cards[1].Pile.Type === window.G.PileType.Discard && !window.G.RunManager.Instance.ActionExecutor.IsRunning);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${out}/played.png` });
  console.log('OK map stick/D-pad snap, scroll/restore and travel, automatic hand focus, enemy snap/arrow, remapped directions, cancel, damage/energy, remembered target, dead-target fallback, self-card preview/confirm, pure-keyboard play');
} catch (error) {
  console.error(error, errors);
  console.error('hand', await hand().catch(() => null), 'aimed', await aimed().catch(() => null));
  console.error('cards', await page.evaluate(() => {
    const G = window.G, h = G.$.ext('MegaCrit.Sts2.Core.Nodes.Rooms.NCombatRoom').Instance.Ui.Hand;
    return { holders: h.ActiveHolders.map(x => [x.CardModel.Id.Entry, x.CardModel.Pile?.Type, window.__cards?.indexOf(x.CardModel)]), pile: G.RunManager.Instance.State.Players[0].PlayerCombatState.Hand.Cards.map(x => x.Id.Entry), play: h.currentPlay?.card?.Id.Entry };
  }).catch(() => null));
  await page.screenshot({ path: `${out}/failed.png` }).catch(() => {});
  process.exitCode = 1;
} finally { await browser.close(); }
