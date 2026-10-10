// Retired boss in existing saves: open/close the door and cycle all three body
// textures through the original monster moves, then end the combat.
// CHROME=<path> [URL=<preview>] node tools/e2e/doormaker.mjs <outDir>
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { startRun, viewport } from './start.mjs';

const out = process.argv[2] ?? '/tmp/sts2-doormaker';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport }), errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/WebGL|GL Driver/.test(m.text())) errors.push(m.text()); });
try {
  await page.goto((process.env.URL ?? 'http://127.0.0.1:47174/') + '?seed=LEGACYDOOR&unlock=all&tutorials=off');
  await page.waitForFunction(() => window.ui?.screen === 'menu');
  await startRun(page);
  await page.evaluate(async () => {
    const G = window.G;
    await G.RunManager.Instance.EnterRoomDebug(G.RoomType.Boss, G.MapPointType.Unassigned,
      G.ModelDb.Encounter(G.DoormakerBoss).ToMutable(), false);
  });
  await page.waitForFunction(() => window.G.CombatManager.Instance.IsPlayPhase);
  for (const texture of [2, 3, 4]) {
    await page.evaluate(async () => {
      const G = window.G, state = G.CombatManager.Instance.DebugOnlyGetState();
      const door = state.Enemies.find(e => e.Monster instanceof G.Door);
      await G.CreatureCmd.Kill$Creature_Boolean(door, true);
      await G.CombatManager.Instance.CheckWinCondition();
    });
    await page.waitForFunction(texture => {
      const G = window.G, room = G.$.ext('MegaCrit.Sts2.Core.Nodes.Rooms.NCombatRoom').Instance;
      const boss = G.CombatManager.Instance.DebugOnlyGetState()?.Enemies.find(e => e.Monster instanceof G.Doormaker);
      return room?.GetCreatureNode(boss)?.LegacyBody?.Texture?.ResourcePath?.endsWith(`door_maker_placeholder_${texture}.png`);
    }, texture);
    await page.waitForTimeout(1500); // original body fade/scale tween, independent of Instant card speed
    const visual = await page.evaluate(() => {
      const G = window.G, room = G.$.ext('MegaCrit.Sts2.Core.Nodes.Rooms.NCombatRoom').Instance;
      const state = G.CombatManager.Instance.DebugOnlyGetState();
      const boss = state.Enemies.find(e => e.Monster instanceof G.Doormaker);
      const door = state.Enemies.find(e => e.Monster instanceof G.Door);
      const body = room.GetCreatureNode(boss).LegacyBody, node = room.GetCreatureNode(door);
      return { scale: [body.Scale.X, body.Scale.Y], color: [body.Modulate.R, body.Modulate.G, body.Modulate.B, body.Modulate.A],
        doorVisible: node.LegacyVisible, overlayVisibility: getComputedStyle(node.overlay).visibility };
    });
    assert.deepEqual(visual, { scale: [1, 1], color: [1, 1, 1, 1], doorVisible: false, overlayVisibility: 'hidden' });
    await page.screenshot({ path: `${out}/form-${texture}.png` });
    console.log('OK body texture', texture, JSON.stringify(visual));
    if (texture === 4) break;
    for (let turn = 0; turn < 3; turn++) {
      const round = await page.evaluate(() => {
        const G = window.G, state = G.CombatManager.Instance.DebugOnlyGetState(), player = G.RunManager.Instance.State.Players[0];
        player.Creature.SetCurrentHpInternal(player.Creature.MaxHp);
        G.RunManager.Instance.ActionQueueSynchronizer.RequestEnqueue(new G.EndPlayerTurnAction().$ctor_EndPlayerTurnAction(player, player.PlayerCombatState.TurnNumber));
        return state.RoundNumber;
      });
      await page.waitForFunction(round => window.G.CombatManager.Instance.IsPlayPhase
        && window.G.CombatManager.Instance.DebugOnlyGetState()?.RoundNumber > round, round, { timeout: 30000 });
    }
    const closed = await page.evaluate(() => {
      const G = window.G, state = G.CombatManager.Instance.DebugOnlyGetState();
      const door = state.Enemies.find(e => e.Monster instanceof G.Door);
      return door.IsAlive && G.$.ext('MegaCrit.Sts2.Core.Nodes.Rooms.NCombatRoom').Instance.GetCreatureNode(door).LegacyVisible;
    });
    assert.equal(closed, true, 'the door must revive and become visible again');
  }
  await page.evaluate(async () => {
    const G = window.G, state = G.CombatManager.Instance.DebugOnlyGetState();
    await G.CreatureCmd.Kill$Creature_Boolean(state.Enemies.find(e => e.Monster instanceof G.Doormaker), true);
    await G.CombatManager.Instance.CheckWinCondition();
  });
  await page.waitForFunction(() => !window.G.CombatManager.Instance.IsInProgress);
  assert.deepEqual(errors, []);
  console.log('OK: old Doormaker cycles, door revival, body rendering and combat completion');
} catch (e) {
  console.error(errors);
  await page.screenshot({ path: `${out}/failed.png` });
  throw e;
} finally { await browser.close(); }
