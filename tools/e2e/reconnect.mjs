// Two isolated browser pages: reconnecting during map and combat while keeping the page open.
// Requires the local room server (wrangler dev --port 8787) and app server.
// Usage: CHROME=<path> [URL=<app server>] [MODE=standard|daily] node tools/e2e/reconnect.mjs <outDir>
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { viewport, setAspect } from './start.mjs';

const out = process.argv[2] ?? '/tmp/sts2-reconnect';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const contexts = [await browser.newContext({ viewport }), await browser.newContext({ viewport })];
const pages = await Promise.all(contexts.map(c => c.newPage()));
const errors = [];
const mode = process.env.MODE ?? 'daily';
const base = process.env.URL ?? 'http://127.0.0.1:47173/';

try {
  for (const [i, p] of pages.entries()) {
    await p.addInitScript(() => {
      const Native = window.WebSocket;
      window.sockets = [];
      window.WebSocket = class extends Native {
        constructor(...args) {
          super(...args);
          window.sockets.push(this);
        }
      };
    });
    p.on('pageerror', e => errors.push([i, e.message]));
    p.on('console', m => { if (m.type() === 'error') console.log('console', i, m.text().slice(0, 300)); });
    await p.goto(base + '?unlock=all&tutorials=off&seed=RECONNECT');
    await p.waitForFunction(() => window.ui?.screen === 'menu', null, { timeout: 60000 });
    await setAspect(p);
    await p.evaluate(() => {
      const G = window.G;
      const e = G.SaveManager.Instance.Progress.Epochs.find(x => x.Id === 'NEOW_EPOCH');
      if (e) e.State = 0;
      G.SaveManager.Instance.PrefsSave.FastMode = G.FastModeType.Instant;
    });
  }

  await pages[0].evaluate(async m => {
    window.mp = await import('/src/multiplayer.ts');
    await window.mp.connectMultiplayer(undefined, m);
  }, mode);
  await pages[0].waitForFunction(() => window.mp.multiplayer.phase === 'lobby' && window.mp.multiplayer.players.length === 1);
  const code = await pages[0].evaluate(() => window.mp.multiplayer.code);

  await pages[1].evaluate(async c => {
    window.mp = await import('/src/multiplayer.ts');
    await window.mp.connectMultiplayer(c);
  }, code);
  for (const p of pages) await p.waitForFunction(() => window.mp.multiplayer.phase === 'lobby' && window.mp.multiplayer.players.length === 2);
  await pages[0].waitForTimeout(1200);

  for (const p of pages) await p.evaluate(() => window.mp.readyMultiplayer(true));
  for (const p of pages) await p.waitForFunction(() => window.mp.multiplayer.phase === 'playing', null, { timeout: 60000 });
  console.log('Started', mode);

  const snapshot = p => p.evaluate(() => {
    const G = window.G, ui = window.ui;
    const rs = G.RunManager.Instance.State, cm = G.CombatManager.Instance;
    return {
      floor: rs.TotalFloor,
      room: ui.room?.kind,
      choiceIds: Array.from(G.RunManager.Instance.PlayerChoiceSynchronizer.ChoiceIds),
      players: Array.from(rs.Players, player => ({
        id: player.NetId,
        char: player.Character.Id.Entry,
        hp: player.Creature.CurrentHp,
        gold: player.Gold,
        block: player.Creature.Block,
        energy: player.PlayerCombatState?.Energy,
        hand: player.PlayerCombatState?.Hand?.Cards.map(c => c.Id.Entry),
        draw: player.PlayerCombatState?.DrawPile?.Cards.map(c => c.Id.Entry),
        discard: player.PlayerCombatState?.DiscardPile?.Cards.map(c => c.Id.Entry),
      })),
      monsters: cm.IsInProgress ? Array.from(rs.Players[0].Creature.CombatState?.Creatures ?? []).filter(c => c.Monster).map(c => ({
        id: c.Monster.Id.Entry,
        hp: c.CurrentHp,
        block: c.Block,
      })) : [],
    };
  });

  const reconnect = async (index, label) => {
    const before = await snapshot(pages[index]);
    await pages[index].evaluate(() => window.sockets.at(-1).close());
    await pages[index].waitForFunction(() => window.mp.multiplayer.phase === 'reconnecting');
    await pages[1 - index].waitForFunction(() => window.mp.multiplayer.waiting);
    await pages[index].screenshot({ path: out + '/' + label + '-waiting.png' });
    for (const p of pages) await p.waitForFunction(() => window.mp.multiplayer.phase === 'playing' && !window.mp.multiplayer.waiting, null, { timeout: 30000 });
    await pages[index].waitForTimeout(500);
    assert.deepEqual(await snapshot(pages[index]), before);
    assert.deepEqual(await snapshot(pages[0]), await snapshot(pages[1]));
    console.log('Recovered', label);
  };

  for (let n = 0; n < 50 && !await pages[0].evaluate(() => window.ui.mapOpen); n++) {
    for (const p of pages) {
      await p.evaluate(() => {
        const el = document.querySelector('.ftue-confirm') ?? document.querySelector('.event-option:not(.disabled)') ?? document.querySelector('.cr-arrow.right') ?? document.querySelector('.proceed-btn.shown');
        el?.click();
      });
    }
    await pages[0].waitForTimeout(300);
  }
  for (const p of pages) await p.waitForFunction(() => window.ui.mapOpen, null, { timeout: 30000 });
  await reconnect(1, 'guest-map');

  for (const p of pages) await p.locator('.mp.travelable').first().click();
  for (const p of pages) await p.waitForFunction(() => window.ui.room?.kind === 'combat' && window.G.CombatManager.Instance.IsPlayPhase, null, { timeout: 60000 });
  await pages[0].waitForTimeout(1000);

  await reconnect(1, 'guest-combat');
  await reconnect(0, 'host-combat');

  // End a turn after recovery, then compare both original simulations.
  for (const p of pages) await p.locator('.end-turn-btn').click();
  for (const p of pages) await p.waitForFunction(() => window.G.CombatManager.Instance.IsPlayPhase && window.G.RunManager.Instance.State.Players[0].PlayerCombatState.TurnNumber >= 2, null, { timeout: 30000 });
  await pages[0].waitForTimeout(800);

  assert.deepEqual(await snapshot(pages[0]), await snapshot(pages[1]));
  for (const [i, p] of pages.entries()) await p.screenshot({ path: out + '/combat-' + i + '.png' });
  assert.deepEqual(errors, []);
  console.log('OK', JSON.stringify(await snapshot(pages[0])));
} finally {
  await browser.close();
}
