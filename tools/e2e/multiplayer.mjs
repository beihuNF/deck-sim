// Two or four isolated browser profiles: locked-character preview, shared drawings, map votes and room entry.
// Requires the local room server (wrangler dev --port 8787) and app server.
// CHROME=<path> [PLAYERS=2|4] [VIEW=...] [ASPECT=Auto] node tools/e2e/multiplayer.mjs <outDir>
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { viewport, setAspect } from './start.mjs';
const out = process.argv[2] ?? '/tmp/sts2-multiplayer';
fs.mkdirSync(out, { recursive: true });
const count = Number(process.env.PLAYERS ?? 2);
assert.ok(count === 2 || count === 4);
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const pages = [], errors = [];
const base = process.env.URL ?? 'http://127.0.0.1:47173/';
const blank = p => p.evaluate(() => {
  const c = document.querySelector('.map-drawings');
  return !c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0);
});
async function stroke(p, y, button = 'right') {
  const box = await p.locator('.stage-root').first().boundingBox();
  await p.mouse.move(box.x + box.width * 0.38, box.y + box.height * y);
  await p.mouse.down({ button });
  await p.mouse.move(box.x + box.width * 0.48, box.y + box.height * y, { steps: 12 });
  await p.mouse.up({ button });
}
try {
  for (let i = 0; i < count; i++) {
    const page = await browser.newPage({ viewport }); pages.push(page);
    page.on('pageerror', e => errors.push(`${i}: ${e.message}`));
    await page.goto(base + '?lang=eng&tutorials=off');
    await page.waitForFunction(() => window.ui?.screen === 'menu', null, { timeout: 60000 });
    await setAspect(page);
    if (await page.locator('.ea-proceed').count()) await page.click('.ea-proceed');
    await page.evaluate(() => { window.G.SaveManager.Instance.PrefsSave.FastMode = window.G.FastModeType.Instant; });
    await page.click('.mm-multiplayer');
  }
  const host = pages[0], guest = pages[1];
  await host.locator('.submenu-btn').nth(0).click(); // Host
  await host.locator('.submenu-btn').nth(0).click(); // Standard
  await host.waitForSelector('.invite-code-btn');
  const code = (await host.locator('.invite-code-btn').innerText()).match(/[A-F0-9]{12}/)[0];
  for (const p of pages.slice(1)) {
    await p.locator('.submenu-btn').nth(1).click();
    await p.fill('.mp-dialog-input', code);
    await p.press('.mp-dialog-input', 'Enter');
    await p.waitForSelector('.invite-code-btn');
  }
  await host.waitForFunction(n => document.querySelectorAll('.remote-lobby-player').length === n, count);
  // Original behavior: a locked character can be previewed, but cannot replace the lobby choice or ready up.
  await guest.locator('.chs-buttons > :nth-child(2)').click();
  await guest.waitForFunction(() => !document.querySelector('.mp-lobby-screen .confirm-btn.shown'));
  assert.match(await guest.locator('.remote-lobby-player.is-me .rlp-char-title').innerText(), /Ironclad/);
  assert.equal(await guest.locator('.remote-lobby-player.is-me .rlp-ready-tick').count(), 0);
  await guest.locator('.chs-buttons > :nth-child(1)').click();
  // Unlock Silent in this isolated test profile and verify that an unlocked selection reaches the roster.
  await guest.evaluate(() => {
    window.G.SaveManager.Instance.ObtainEpochOverride('SILENT1_EPOCH', window.G.EpochState.Revealed);
    window.invalidate();
  });
  await guest.locator('.chs-buttons > :nth-child(2)').click();
  await guest.waitForFunction(() => document.querySelector('.remote-lobby-player.is-me .rlp-char-title')?.textContent.includes('Silent'));
  for (const p of pages) await p.click('.mp-lobby-screen .confirm-btn.shown');
  for (const p of pages) await p.waitForFunction(() => window.ui?.mapOpen && document.querySelector('.mp.travelable'), null, { timeout: 60000 });
  assert.ok(await blank(host));
  await stroke(host, 0.43);
  await guest.waitForFunction(() => {
    const c = document.querySelector('.map-drawings');
    return c && c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0);
  });
  await stroke(guest, 0.43, 'middle');
  assert.equal(await blank(guest), false, 'A guest eraser must preserve the host drawing');
  // Quantization changes subpixel coordinates, so check visible layers and clearing rather than exact local/remote bytes.
  await stroke(guest, 0.55);
  await host.waitForTimeout(150);
  await host.screenshot({ path: `${out}/drawings-host.png` });
  await guest.screenshot({ path: `${out}/drawings-guest.png` });
  await host.click('.md-clear');
  assert.equal(await blank(host), false, 'Clearing host drawings must preserve guest drawings');
  await guest.click('.md-clear');
  for (const p of pages) await p.waitForFunction(() => {
    const c = document.querySelector('.map-drawings');
    return !c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((v, i) => i % 4 === 3 && v > 0);
  });
  for (let i = 0; i < count; i++) {
    await pages[i].locator('.mp.travelable').first().click();
    if (i < count - 1) {
      for (const p of pages) await p.waitForSelector(`.mp.travelable .map-vote[data-player-id="${i + 1}"]`);
      assert.equal(await host.evaluate(() => window.ui.room.kind), 'maproom', 'Travel must wait for every player');
      await pages[i].screenshot({ path: `${out}/vote-${i + 1}.png` });
    }
  }
  for (const p of pages) await p.waitForFunction(() => window.ui.room?.kind === 'combat', null, { timeout: 30000 });
  const coords = await Promise.all(pages.map(p => p.evaluate(() => window.G.RunManager.Instance.State.MapLocation.ToString())));
  assert.equal(new Set(coords).size, 1);
  for (let i = 0; i < count; i++) await pages[i].screenshot({ path: `${out}/combat-${i + 1}.png` });
  // A single ready player must be visible to peers, and may undo before the whole team ends the turn.
  for (const p of pages) await p.waitForSelector('.end-turn-btn.shown:not(.disabled)');
  await host.click('.end-turn-btn.shown:not(.disabled)');
  for (const p of pages) await p.waitForSelector('.mp-player-state[data-player-id="1"][data-ready="true"]');
  await host.click('.end-turn-btn.shown:not(.disabled)');
  for (const p of pages) await p.waitForSelector('.mp-player-state[data-player-id="1"][data-ready="false"]');
  // Play hand cards through real mouse drags until combat rewards appear.
  for (let step = 0; step < 200; step++) {
    if ((await Promise.all(pages.map(p => p.locator('.rewards-screen').count()))).every(Boolean)) break;
    for (const p of pages) {
      const next = await p.evaluate(() => {
        if (document.querySelector('.rewards-screen')) return null;
        const cr = window.G.$.ext('MegaCrit.Sts2.Core.Nodes.Rooms.NCombatRoom').Instance;
        const hand = cr?.Ui?.Hand;
        const target = document.querySelector('.creature[data-side="enemy"]:not(.dead) .cr-hitbox');
        const center = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
        const stage = document.querySelector('.stage-root').getBoundingClientRect(), scale = stage.width / 1920;
        const point = (x, y) => [stage.left + x * scale, stage.top + y * scale];
        if (hand?.IsInCardSelection) {
          const confirm = document.querySelector('.combat-ui .confirm-btn.shown');
          const h = hand.ActiveHolders[0];
          return confirm ? { tap: center(confirm) } : h ? { tap: point(h.GlobalPosition.X, h.GlobalPosition.Y - 60) } : null;
        }
        if (hand?.currentPlay && target) return { tap: center(target) };
        const end = document.querySelector('.end-turn-btn.shown:not(.disabled)');
        if (!end || window.G.CombatManager.Instance.IsPlayerReadyToEndTurn(window.G.RunManager.Instance.State.GetPlayer(window.G.LocalContext.NetId))) return null;
        const h = hand?.ActiveHolders.find(x => x.hitboxEnabled && x.CardModel?.CanPlay$0?.());
        if (!h) return { tap: center(end) };
        return { from: point(h.GlobalPosition.X, h.GlobalPosition.Y - 60), up: point(h.GlobalPosition.X, 500), target: h.CardModel.TargetType === window.G.TargetType.AnyEnemy && target ? center(target) : null };
      });
      if (!next) continue;
      if (next.tap) await p.mouse.click(...next.tap);
      else {
        await p.mouse.move(...next.from); await p.mouse.down(); await p.mouse.move(...next.up, { steps: 6 });
        if (next.target) await p.mouse.move(...next.target, { steps: 6 });
        await p.mouse.up();
      }
      await p.waitForTimeout(80);
    }
  }
  for (const p of pages) await p.waitForSelector('.rewards-screen', { timeout: 20000 });
  const combatStates = await Promise.all(pages.map(p => p.evaluate(() => window.G.RunManager.Instance.State.Players.map(x => [x.NetId, x.Creature.CurrentHp, x.Gold]))));
  for (const state of combatStates) assert.deepEqual(state, combatStates[0], 'Combat results must agree');
  // One player can finish rewards and open the map while another is still reviewing rewards.
  await host.click('.rewards-screen .proceed-btn.shown');
  await guest.waitForFunction(() => document.querySelector('.mp-player-state[data-player-id="1"]')?.textContent.includes('Map'));
  for (const p of pages.slice(1)) await p.click('.rewards-screen .proceed-btn.shown');
  for (const p of pages) await p.waitForFunction(() => window.ui.mapOpen);
  // Test-only jump to a treasure node through the original vote/action queue, keeping every simulation synchronized.
  for (const p of pages) await p.evaluate(() => {
    const G = window.G, rm = G.RunManager.Instance, rs = rm.State;
    const treasure = Array.from(rs.Map.GetAllMapPoints()).find(p => p.PointType === G.MapPointType.Treasure);
    const vote = new G.MapVote().$zero_MapVote(); vote.coord = treasure.coord; vote.mapGenerationCount = rm.MapSelectionSynchronizer.MapGenerationCount;
    rm.ActionQueueSynchronizer.RequestEnqueue(new G.VoteForMapCoordAction().$ctor_VoteForMapCoordAction(rs.GetPlayer(G.LocalContext.NetId), rs.MapLocation, vote));
  });
  for (const p of pages) { await p.waitForSelector('.chest-btn'); await p.click('.chest-btn'); }
  for (const p of pages) {
    await p.waitForFunction(n => document.querySelectorAll('.relic-holder-t').length === n && window.ui.room.clickable, count, { timeout: 30000 });
  }
  await host.locator('.relic-holder-t').nth(0).click();
  for (const p of pages) await p.waitForSelector('.relic-holder-t[data-relic-index="0"] .treasure-votes [data-player-id="1"]');
  assert.equal(await host.locator('.treasure .proceed-btn.shown').count(), 0, 'Relic allocation waits for every vote');
  // A skip must not try to grant a relic to a null player.
  await guest.click('.treasure-skip');
  for (let i = 2; i < count; i++) await pages[i].locator('.relic-holder-t').nth(i).click();
  for (const p of pages) await p.waitForSelector('.treasure .proceed-btn.shown', { timeout: 30000 });
  const relicStates = await Promise.all(pages.map(p => p.evaluate(() => window.G.RunManager.Instance.State.Players.map(x => [x.NetId, Array.from(x.Relics, r => r.Id.Entry)]))));
  for (const state of relicStates) assert.deepEqual(state, relicStates[0], 'Relic allocation must agree');
  for (let i = 0; i < count; i++) await pages[i].screenshot({ path: `${out}/treasure-${i + 1}.png` });
  assert.deepEqual(errors, []);
  console.log(`OK: ${count} players, locked preview, unlocked selection, shared drawings, eraser/clear ownership, voting avatars, unanimous travel, combat/rewards, peer ready/screen state, shared relic selection/skip`, coords);
} catch (e) {
  for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: `${out}/failure-${i + 1}.png` }).catch(() => {});
  throw e;
} finally { await browser.close(); }
