// Exercise the actual potion popup: area, self and aimed targets.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { startRun, travel, viewport } from './start.mjs';

const out = process.argv[2] ?? '/tmp/sts2-potion-use';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport }), errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/WebGL|GL Driver/.test(m.text())) errors.push(m.text()); });
try {
  await page.goto((process.env.URL ?? 'http://127.0.0.1:47174/') + '?seed=HANDPILES&unlock=all&tutorials=off');
  await page.waitForFunction(() => window.ui?.screen === 'menu');
    console.log('menu');
    await page.evaluate(() => { window.G.SaveManager.Instance.PrefsSave.FastMode = window.G.FastModeType.Instant; });
  await startRun(page); console.log('map'); await travel(page); console.log('travel');
  await page.evaluate(async () => {
    const G = window.G;
    await G.RunManager.Instance.EnterRoomDebug(G.RoomType.Monster, G.MapPointType.Unassigned,
      G.ModelDb.Encounter(G.BowlbugsNormal).ToMutable(), false);
  });
  await page.waitForSelector('.end-turn-btn.shown:not(.disabled)', { timeout: 60000 });
  for (const name of ['ExplosiveAmpoule', 'EnergyPotion', 'FirePotion']) {
    const before = await page.evaluate(async name => {
      const G = window.G, player = G.RunManager.Instance.State.Players[0];
      for (const p of [...player.Potions].filter(Boolean)) await G.PotionCmd.Discard(p);
      await G.PotionCmd.TryToProcure$3(G.ModelDb.Potion(G[name]).ToMutable(), player, -1);
      return { energy: player.PlayerCombatState.Energy,
        hp: G.CombatManager.Instance.DebugOnlyGetState().Enemies.map(e => e.CurrentHp) };
    }, name);
    await page.locator('.tb-potion:not(.empty)').first().click();
    await page.locator('.potion-popup-btn:not(.disabled)').first().click();
    if (name === 'FirePotion') {
      await page.waitForSelector('.combat.targeting');
      await page.locator('.creature[data-side="enemy"]:not(.dead) .cr-hitbox').first().click();
    }
    await page.mouse.move(5, 5);
    await page.waitForFunction(() => ![...window.G.RunManager.Instance.State.Players[0].Potions].some(Boolean)
      && !window.G.RunManager.Instance.ActionExecutor.IsRunning, null, { timeout: 30000 });
    const after = await page.evaluate(() => {
      const G = window.G;
      return { energy: G.RunManager.Instance.State.Players[0].PlayerCombatState.Energy,
        hp: G.CombatManager.Instance.DebugOnlyGetState().Enemies.map(e => e.CurrentHp) };
    });
    if (name === 'EnergyPotion') assert.equal(after.energy, before.energy + 2);
    else assert.ok(after.hp.length < before.hp.length || after.hp.some((hp, i) => hp < before.hp[i]), name + ' damages an enemy');
    if (name === 'ExplosiveAmpoule') { assert.ok(before.hp.length > 1); assert.ok(after.hp.every((hp, i) => hp < before.hp[i]), 'area potion damages all enemies'); }
    console.log('OK', name, JSON.stringify({ before, after }));
  }
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `${out}/potions.png` });
  console.log('OK: potion popup consumes area, self and aimed potions with their effects');
} finally { await browser.close(); }
