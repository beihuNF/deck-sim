// Instant-speed ambient animation must yield; exercise both actual event choices.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { startRun, travel, viewport } from './start.mjs';

const out = process.argv[2] ?? '/tmp/sts2-punch-off';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME });
try {
  for (const branch of [0, 1]) {
    const page = await browser.newPage({ viewport }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/WebGL|GL Driver/.test(m.text())) errors.push(m.text()); });
    await page.goto((process.env.URL ?? 'http://127.0.0.1:47174/') + '?seed=HANDPILES&unlock=all&tutorials=off');
    await page.waitForFunction(() => window.ui?.screen === 'menu');
    await page.evaluate(() => { window.G.SaveManager.Instance.PrefsSave.FastMode = window.G.FastModeType.Instant; });
    await startRun(page);
    await page.evaluate(async () => {
      const G = window.G, rm = G.RunManager.Instance;
      G.SaveManager.Instance.PrefsSave.FastMode = G.FastModeType.Instant;
      rm.State.AppendToMapPointHistory(G.MapPointType.Unknown, G.RoomType.Event, G.ModelDb.Event(G.PunchOff).Id);
      await rm.EnterRoom(new G.EventRoom().$ctor_EventRoom$EventModel(G.ModelDb.Event(G.PunchOff)));
      G.$.ext('MegaCrit.Sts2.Core.Nodes.Screens.Map.NMapScreen').Instance.Close();
    });
    const choose = async (index, suffix) => {
      await page.waitForFunction(([index, suffix]) => {
        const v = window.ui.room, live = window.G.RunManager.Instance.EventSynchronizer.GetLocalEvent();
        return !window.ui.mapOpen && !v?.disabled && !v?.choosing
          && v?.options?.[index] === live?.CurrentOptions?.[index]
          && v.options[index].TextKey.endsWith(suffix);
      }, [index, suffix], { timeout: 30000 });
      await page.locator('.event-option').nth(index).click();
      await page.mouse.move(5, 5);
    };
    await choose(branch, branch ? '.I_CAN_TAKE_THEM' : '.NAB');
    if (branch) {
      await choose(0, '.FIGHT');
      await page.waitForFunction(() => window.G.CombatManager.Instance.IsPlayPhase);
      await page.evaluate(async () => {
        const G = window.G;
        for (const e of [...G.CombatManager.Instance.DebugOnlyGetState().Enemies]) await G.CreatureCmd.Kill$Creature_Boolean(e, true);
        await G.CombatManager.Instance.CheckWinCondition();
      });
    }
    // Relic/card rewards are selected with the mouse. Proceed resumes the event/map.
    for (let i = 0; i < 60; i++) {
      if (await page.evaluate(() => window.ui.mapOpen || (window.G.RunManager.Instance.EventSynchronizer.GetLocalEvent()?.IsFinished && !window.ui.overlays.length))) break;
      const ftue = page.locator('.ftue-confirm, .ftue .cr-arrow.right').first();
      if (await ftue.count()) { await ftue.click(); await page.mouse.move(5, 5); await page.waitForTimeout(150); continue; }
      const card = page.locator('.card-reward-screen .gh-card, .choose-card-screen .gh-card').first();
      const button = (await card.count()) ? card : page.locator('.rewards-screen .reward-btn, .proceed-btn.shown').first();
      if (await button.count()) await button.click();
      await page.mouse.move(5, 5); await page.waitForTimeout(150);
    }
    await page.screenshot({ path: `${out}/rewards-${branch}.png` });
    await page.waitForFunction(() => window.ui.mapOpen || (window.G.RunManager.Instance.EventSynchronizer.GetLocalEvent()?.IsFinished && !window.ui.overlays.length));
    if (!(await page.evaluate(() => window.ui.mapOpen))) {
      await page.locator('.event-option').last().click();
      await page.waitForFunction(() => window.ui.mapOpen);
    }
    await page.waitForTimeout(1500); // cancellation lets the original ambient loop exit
    await page.waitForSelector('.mp.travelable', { timeout: 10000 });
    assert.equal(await page.evaluate(() => window.ui.overlays.some(o => o.kind === 'rewards' && o.buttons.length)), false, 'all rewards claimed');
    const floor = await page.evaluate(() => window.G.RunManager.Instance.State.TotalFloor);
    await travel(page);
    await page.waitForFunction(floor => window.G.RunManager.Instance.State.TotalFloor > floor && !window.ui.mapOpen, floor);
    await page.waitForTimeout(1500);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${out}/branch-${branch}.png` });
    console.log('OK', branch ? 'take them → fight → rewards → map → next floor' : 'nab → rewards → map → next floor');
    await page.close();
  }
  console.log('OK: both Punch Off branches finish at Instant speed');
} finally { await browser.close(); }
