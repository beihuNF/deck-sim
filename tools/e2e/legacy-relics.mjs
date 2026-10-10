// Load a copy of a frozen run with shipped relic DTOs, re-save, and advance a floor.
// The frozen fixture and the user's browser storage are never modified.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { viewport, travel } from './start.mjs';
import { pauseButton } from './pause.mjs';

const root = fileURLToPath(new URL('../../packages/core/test/fixtures/saves-v0.98.3/ironclad-new-profile/f25/', import.meta.url));
const out = process.argv[2] ?? '/tmp/sts2-legacy-relics';
fs.mkdirSync(out, { recursive: true });
const files = fs.readdirSync(root, { recursive: true }).filter(f => fs.statSync(path.join(root, f)).isFile())
  .map(f => [`user://${f.split(path.sep).join('/')}`, fs.readFileSync(path.join(root, f), 'utf8')]);
const savedRun = files.find(([f]) => f.endsWith('/current_run.save'));
const raw = JSON.parse(savedRun[1]);
for (const [entry, name, value] of [['LASTING_CANDY', 'CombatsSeen', 3], ['PUMPKIN_CANDLE', 'ActiveAct', raw.CurrentActIndex]]) {
  assert.ok(!raw.Players[0].Relics.some(r => r.Id.$_Entry === entry));
  raw.Players[0].Relics.push({
    $t: 'MegaCrit.Sts2.Core.Saves.Runs.SerializableRelic',
    Id: { $t: 'MegaCrit.Sts2.Core.Models.ModelId', $_Category: 'RELIC', $_Entry: entry },
    Props: { $t: 'MegaCrit.Sts2.Core.Saves.Runs.SavedProperties', ints: [
      { $t: 'MegaCrit.Sts2.Core.Saves.Runs.SavedProperties+SavedProperty`1', name, value },
    ] }, FloorAddedToDeck: 5,
  });
}
savedRun[1] = JSON.stringify(raw);
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const menu = () => page.waitForFunction(() => window.ui?.screen === 'menu', null, { timeout: 60000 });
const resume = async () => {
  await page.click('.mm-continue');
  await page.waitForFunction(() => window.ui?.screen === 'run' && window.ui.room, null, { timeout: 60000 });
  await page.waitForTimeout(1800);
};
const check = () => page.evaluate(() => {
  const run = window.G.RunManager.Instance.State, owner = run.Players[0];
  const candy = owner.Relics.find(r => r.Id.Entry === 'LASTING_CANDY');
  const candle = owner.Relics.find(r => r.Id.Entry === 'PUMPKIN_CANDLE');
  return {
    floor: run.TotalFloor, combats: candy.CombatsSeen, act: candle.ActiveAct,
    energy: candle.ModifyMaxEnergy(owner, 3),
    description: candle.DynamicDescription.GetFormattedText(),
    props: owner.Relics.filter(r => ['LASTING_CANDY', 'PUMPKIN_CANDLE'].includes(r.Id.Entry))
      .map(r => window.G.$.snapshot(r.ToSerializable()).Props.ints),
  };
});
try {
  await page.goto((process.env.URL ?? 'http://127.0.0.1:47174/') + '?lang=eng&tutorials=off');
  await menu();
  await page.evaluate(files => window.G.$.vfs.restore(files), files);
  await page.reload(); await menu(); await resume();
  const before = await check();
  assert.equal(before.combats, 3); assert.equal(before.act, raw.CurrentActIndex);
  assert.equal(before.energy, 4); assert.match(before.description, /Extinguishes/);
  await page.click('.tb-settings');
  await page.waitForSelector('.pause-menu');
  await (await pauseButton(page, 'SAVE_AND_QUIT')).click();
  await menu(); await page.evaluate(() => window.G.$.vfs.flush());
  await page.reload(); await menu(); await resume();
  assert.deepEqual(await check(), before);
  // If continuation reconstructed a fight, finish it with the coverage
  // driver's rule commands, so the legacy relic hooks run too.
  await page.evaluate(async () => {
    const G = window.G, cm = G.CombatManager.Instance;
    for (let i = 0; i < 6 && cm.IsInProgress; i++) {
      for (const enemy of [...cm.DebugOnlyGetState().Enemies]) if (enemy.IsAlive) await G.CreatureCmd.Kill$Creature_Boolean(enemy, true);
      await cm.CheckWinCondition();
    }
  });
  await page.waitForTimeout(1800);
  // Resolve the completed room's rewards, then travel through the actual map UI.
  for (let i = 0; i < 30 && !(await page.evaluate(() => window.ui.mapOpen)); i++) {
    if (await page.locator('.event-option').count()) {
      await page.locator('.event-option').last().click();
      await page.waitForTimeout(500);
      continue;
    }
    await page.evaluate(() => {
      const top = window.ui.overlays.at(-1);
      if (top?.kind === 'rewards') top.proceed();
      else if (top?.kind === 'cardreward') top.skip();
      else document.querySelector('.proceed-btn.shown, .proceed:not([disabled])')?.click();
    });
    await page.waitForTimeout(250);
  }
  await page.waitForFunction(() => window.ui.mapOpen);
  await page.waitForTimeout(1500);
  await travel(page);
  await page.waitForFunction(f => window.G.RunManager.Instance.State.TotalFloor > f, before.floor, { timeout: 30000 });
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${out}/continued-next-floor.png` });
  console.log('OK: shipped relic counters/effects survive browser re-save and the old run advances a floor', JSON.stringify(await check()));
} catch (error) {
  await page.screenshot({ path: `${out}/failed.png` });
  throw error;
} finally { await browser.close(); }
