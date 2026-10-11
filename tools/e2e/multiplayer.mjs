// Two or four isolated browser profiles: locked-character preview, shared drawings, map votes and room entry.
// Requires the local room server (wrangler dev --port 8787) and app server.
// CHROME=<path> [URL=<host app>] [GUEST_URL=<guest app sharing the room service>] [INVITE=1] [PASTE_INVITE=1] [PLAYERS=2|4] [MODE=standard|daily] [PARITY=1] [FORMATION=1] [DIFFERENT_SPEED=1|guest] [DIVERGENCE=1] [KEYBOARD_PING=1] [VIEW=...] [ASPECT=Auto] node tools/e2e/multiplayer.mjs <outDir>
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { viewport, setAspect } from './start.mjs';
const out = process.argv[2] ?? '/tmp/sts2-multiplayer';
fs.mkdirSync(out, { recursive: true });
const mode = process.env.MODE ?? 'standard';
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
    await page.addInitScript(() => performance.setResourceTimingBufferSize(10000));
    page.on('pageerror', e => errors.push(`${i}: ${e.message}`));
    const url = new URL(i ? process.env.GUEST_URL ?? base : base);
    url.searchParams.set('lang', 'eng');
    url.searchParams.set('tutorials', 'off');
    await page.goto(url.href);
    await page.waitForFunction(() => window.ui?.screen === 'menu', null, { timeout: 60000 });
    await setAspect(page);
    if (await page.locator('.ea-proceed').count()) await page.click('.ea-proceed');
    await page.evaluate(mode => { window.G.SaveManager.Instance.PrefsSave.FastMode = window.G.FastModeType.Instant; if (mode === 'daily') { window.G.SaveManager.Instance.ObtainEpochOverride('DAILY_RUN_EPOCH', window.G.EpochState.Revealed); window.G.SaveManager.Instance.ObtainEpochOverride('NEOW_EPOCH', window.G.EpochState.Revealed); } window.invalidate(); }, mode);
    if (!i || !process.env.INVITE) await page.click('.mm-multiplayer');
  }
  const host = pages[0], guest = pages[1];
  console.log(`Loaded ${count} isolated ${mode} profiles`);
  await host.locator('.submenu-btn').nth(0).click(); // Host
  await host.locator('.submenu-btn').nth(mode === 'daily' ? 1 : 0).click(); // Original standard/daily lobby
  await host.waitForSelector('.invite-code-btn');
  const code = (await host.locator('.invite-code-btn').innerText()).match(/[A-F0-9]{12}/)[0];
  // Different origins may share a deployment; different builds must be rejected before allocating a player slot.
  const wrongBuild = await guest.evaluate(async code => {
    const res = await fetch(`/api/multiplayer/rooms/${code}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 'e2e-incompatible-build' }),
    });
    return { status: res.status, body: await res.json() };
  }, code);
  assert.equal(wrongBuild.status, 409);
  assert.equal(wrongBuild.body.error, 'version');
  for (const p of pages.slice(1)) {
    if (process.env.INVITE) {
      const invite = new URL(p.url()); invite.searchParams.set('room', code);
      await p.goto(invite.href);
    } else {
      await p.locator('.submenu-btn').nth(1).click();
      if (p === guest) await p.screenshot({ path: `${out}/join-dialog.png` });
      if (process.env.PASTE_INVITE) {
        const invitation = new URL(host.url()); invitation.searchParams.set('room', code);
        await p.locator('.mp-dialog-input').evaluate((el, text) => {
          const data = new DataTransfer(); data.setData('text/plain', text);
          el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
        }, invitation.href);
        assert.equal(await p.inputValue('.mp-dialog-input'), code);
      } else await p.fill('.mp-dialog-input', code);
      await p.press('.mp-dialog-input', 'Enter');
    }
    await p.waitForSelector('.invite-code-btn');
    if (process.env.INVITE) {
      await p.reload();
      await p.waitForSelector('.invite-code-btn');
      const id = await p.evaluate(code => JSON.parse(sessionStorage.getItem(`sts2_mp_${code}`)).id, code);
      assert.equal(id, pages.indexOf(p) + 1, 'Refreshing an invitation preserves the authenticated lobby slot');
    }
  }
  await host.waitForFunction(n => document.querySelectorAll('.remote-lobby-player').length === n, mode === 'daily' ? count - 1 : count);
  console.log('Build mismatch rejected; compatible peers joined from', await Promise.all(pages.map(p => p.evaluate(() => location.origin))));
  if (mode !== 'daily') {
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
  if (process.env.FORMATION) {
    await host.evaluate(() => { window.G.SaveManager.Instance.ObtainEpochOverride('SILENT1_EPOCH', window.G.EpochState.Revealed); window.invalidate(); });
    await host.locator('.chs-buttons > :nth-child(2)').click();
    await guest.evaluate(() => { window.G.SaveManager.Instance.ObtainEpochOverride('NECROBINDER1_EPOCH', window.G.EpochState.Revealed); window.invalidate(); });
    await guest.locator('.chs-buttons > :nth-child(4)').click();
    await guest.waitForFunction(() => document.querySelector('.remote-lobby-player.is-me .rlp-char-title')?.textContent.includes('Necrobinder'));
  }
  }
  for (const p of pages) await p.click('.mp-lobby-screen .confirm-btn.shown');
  if (mode === 'daily') {
    for (const p of pages) await p.waitForFunction(() => window.ui?.screen === 'run' && window.ui.room, null, {timeout:60000});
    for (let step = 0; step < 100; step++) {
      if ((await Promise.all(pages.map(p => p.evaluate(() => window.ui.mapOpen)))).every(Boolean)) break;
      for (const p of pages) {
        if (await p.evaluate(() => window.ui.mapOpen)) continue;
        const action = await p.evaluate(() => {
          const el = document.querySelector('.ftue-confirm, .ancient-next, .card-reward-screen .gh-card, .choose-card-screen .gh-card, .anc-hitbox, .event-option:not(.disabled), .rewards-screen .proceed-btn.shown');
          if (!el) return null;
          const r = el.getBoundingClientRect(); return [r.left+r.width/2,r.top+r.height/2];
        });
        if (action) await p.mouse.click(...action);
        await p.waitForTimeout(150);
      }
    }
  }
  if (process.env.DIFFERENT_SPEED) await (process.env.DIFFERENT_SPEED === 'guest' ? guest : host).evaluate(() => { window.G.SaveManager.Instance.PrefsSave.FastMode = window.G.FastModeType.Normal; });
  for (const p of pages) await p.waitForFunction(() => window.ui?.mapOpen && document.querySelector('.mp.travelable'), null, { timeout: 60000 });
  console.log('All peers reached the initial map');
  // Travelable points exist during the original act intro, which still rejects drawing input.
  for (const p of pages) await p.waitForFunction(() => {
    const map = document.querySelector('.map-scroll');
    return map && Math.abs(new DOMMatrix(getComputedStyle(map).transform).m42 + 600) < .01;
  });
  for (const p of pages) {
    assert.equal(await p.locator('.coop-status').count(), 0);
    assert.equal(await p.locator('.mp-player-state').first().getAttribute('data-player-id'), String(pages.indexOf(p) + 1), 'Local player belongs first');
    await p.evaluate(() => {
      window.__mapPings = [];
      new MutationObserver(records => { for (const r of records) for (const node of r.addedNodes) if (node.classList?.contains('map-ping')) window.__mapPings.push([node.dataset.playerColor, node.style.maskImage]); }).observe(document.body, { childList: true, subtree: true });
    });
  }
  for (const p of pages) await p.evaluate(() => {
    window.__checksums = []; window.__divergences = [];
    const G = window.G, tracker = G.RunManager.Instance.ChecksumTracker;
    tracker.ChecksumGenerated = G.$.dcombine(tracker.ChecksumGenerated, (data, context) => window.__checksums.push({id:data.id, checksum:data.checksum, context}));
    tracker.StateDiverged = G.$.dcombine(tracker.StateDiverged, id => window.__divergences.push(id));
  });
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
  const initialRoom = await host.evaluate(() => window.ui.room.kind);
  for (let i = 0; i < count; i++) {
    await pages[i].locator('.mp.travelable').first().click();
    if (i < count - 1) {
      for (const p of pages) await p.waitForSelector(`.mp.travelable .map-vote[data-player-id="${i + 1}"]`);
      assert.equal(await host.evaluate(() => window.ui.room.kind), initialRoom, 'Travel must wait for every player');
      await pages[i].screenshot({ path: `${out}/vote-${i + 1}.png` });
      if (i === 0) {
        await host.locator('.mp.travelable').first().click();
        for (const p of pages) {
          await p.waitForFunction(() => window.__mapPings.length > 0);
          assert.ok(await p.evaluate(() => window.__mapPings[0][1].includes('map_ping')), 'Original ping texture is present');
          assert.equal(await p.evaluate(() => window.ui.room.kind), initialRoom, 'Pinging cannot submit a teammate vote');
        }
      }
    }
  }
  for (const p of pages) await p.waitForFunction(() => window.ui.room?.kind === 'combat', null, { timeout: 30000 });
  const coords = await Promise.all(pages.map(p => p.evaluate(() => window.G.RunManager.Instance.State.MapLocation.ToString())));
  assert.equal(new Set(coords).size, 1);
  for (let i = 0; i < count; i++) await pages[i].screenshot({ path: `${out}/combat-${i + 1}.png` });
  if (process.env.FORMATION) for (const p of pages) {
    const formation = await p.evaluate(() => {
      const G = window.G, cr = G.$.ext('MegaCrit.Sts2.Core.Nodes.Rooms.NCombatRoom').Instance;
      return [...cr.creatures].filter(([c]) => c.IsPlayer || c.PetOwner).map(([c,n]) => ({ owner: c.Player?.NetId ?? c.PetOwner.NetId, player: c.IsPlayer, local: c.IsPlayer ? G.LocalContext.IsMe$Creature(c) : G.LocalContext.IsMe$Player(c.PetOwner), ...n.slot, ostyK: n.OstyK }));
    });
    const mine = formation.find(c => c.player && c.local), theirs = formation.filter(c => c.player && !c.local), osty = formation.find(c => !c.player);
    assert.equal(osty.hideBounds, !osty.local);
    assert.equal(osty.ostyK != null, osty.local, 'Only local Osty follows its owner');
    if (osty.local) { assert.ok(osty.x > mine.x); assert.ok(osty.y < mine.y); }
    else { const owner = theirs.find(c => c.owner === osty.owner); assert.ok(Math.abs(osty.y - owner.y) < 30); }
    if (count === 4) { assert.equal(new Set(formation.filter(c => c.player).map(c => c.y)).size, 2); assert.ok(theirs.some(c => c.dim === .5)); }
    fs.writeFileSync(`${out}/formation-${pages.indexOf(p) + 1}.json`, JSON.stringify(formation, null, 2));
  }
  // A single ready player must be visible to peers, and may undo before the whole team ends the turn.
  for (const p of pages) await p.waitForSelector('.end-turn-btn.shown:not(.disabled)');
  console.log('All peers reached the first player turn');
  if (process.env.PARITY) {
    // Original compact-player click -> read-only expanded deck / relic / potion capstone.
    const before = await host.evaluate(() => window.G.RunManager.Instance.State.Players.map(p => ({ id:p.NetId, cards:p.Deck.Cards.map(c => c.Id.Entry), relics:p.Relics.map(r=>r.Id.Entry), potions:Array.from(window.G.$.iter(p.Potions),x=>x.Id.Entry) })));
    await host.locator('.mp-player-state[data-player-id="2"]').click({position:{x:22,y:22}});
    await host.waitForSelector('.mp-expanded[data-player-id="2"] .rhs-entry');
    await guest.waitForFunction(() => window.G.RunManager.Instance.InputSynchronizer.GetScreenType(1) === window.G.NetScreenType.RemotePlayerExpandedState);
    assert.equal(await host.locator('.mp-expanded-relic').count(), before[1].relics.length);
    assert.equal(await host.locator('.mp-expanded-potion').count(), before[1].potions.length);
    await host.screenshot({ path: `${out}/expanded-player.png` });
    const aspect = await host.evaluate(() => window.G.SaveManager.Instance.SettingsSave.AspectRatioSetting);
    for (const [width,height,name] of [[2580,1080,'wide'],[1680,1260,'tall']]) {
      await host.setViewportSize({width,height});
      await host.evaluate(() => { window.G.SaveManager.Instance.SettingsSave.AspectRatioSetting=window.G.AspectRatioSetting.Auto; window.dispatchEvent(new Event('resize')); window.invalidate(); });
      await host.waitForTimeout(200);
      const r=await host.locator('.mp-expanded-content').boundingBox();
      assert.ok(r.x>=0 && r.y>=0 && r.x+r.width<=width+1 && r.y+r.height<=height+1,'Expanded state stays inside the viewport');
      await host.screenshot({path:`${out}/expanded-player-${name}.png`});
    }
    await host.setViewportSize(viewport);
    await host.evaluate(aspect => { window.G.SaveManager.Instance.SettingsSave.AspectRatioSetting=aspect; window.dispatchEvent(new Event('resize')); window.invalidate(); },aspect);
    await host.locator('.mp-expanded .rhs-entry').first().click();
    await host.waitForSelector('.inspect-backstop');
    await host.keyboard.press('Escape');
    await host.waitForTimeout(300);
    assert.equal(await host.locator('.mp-expanded').count(), 1, 'Inspect closes back to the expanded state');
    await host.keyboard.press('Escape');
    await host.waitForSelector('.mp-expanded', { state: 'detached' });
    await host.evaluate(async () => {
      const entry=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/cardnodes.ts');
      const nodes=await import(entry.name), G=window.G;
      window.__panelTarget=null;
      nodes.targetManager.StartTargeting(G.TargetType.AnyAlly,new G.$.Vector2(960,800),2,null).then(n=>window.__panelTarget=n?.Entity?.Player?.NetId);
    });
    await host.locator('.mp-player-state[data-player-id="2"]').hover();
    await host.locator('.mp-player-state[data-player-id="2"]').click({position:{x:22,y:22}});
    await host.waitForFunction(()=>window.__panelTarget===2);
    assert.equal(await host.locator('.mp-expanded').count(),0,'The targeting release must not open a player inventory');
    assert.deepEqual(await host.evaluate(() => window.G.RunManager.Instance.State.Players.map(p => ({ id:p.NetId, cards:p.Deck.Cards.map(c=>c.Id.Entry), relics:p.Relics.map(r=>r.Id.Entry), potions:Array.from(window.G.$.iter(p.Potions),x=>x.Id.Entry) }))), before, 'Inspecting a teammate must not mutate any inventory');
    await host.locator('.relic-holder').first().hover();
    await guest.waitForSelector('.mp-combat-intent[data-player-id="1"]');
    const relic = await host.evaluate(() => window.G.RunManager.Instance.State.Players[0].Relics[0].Id.Entry);
    assert.equal(await guest.locator('.mp-combat-intent[data-player-id="1"]').getAttribute('data-model-id'), relic);
    await host.mouse.move(960, 500);
    await guest.waitForSelector('.mp-combat-intent[data-player-id="1"]', { state: 'detached' });
    const card = await host.evaluate(() => {
      const G=window.G, hand=G.$.ext('MegaCrit.Sts2.Core.Nodes.Rooms.NCombatRoom').Instance.Ui.Hand;
      const h=hand.ActiveHolders.find(h=>h.hitboxEnabled && h.CardModel.CanPlay$0() && h.CardModel.TargetType===G.TargetType.AnyEnemy);
      const r=document.querySelector('.stage-root').getBoundingClientRect(), s=r.width/1920;
      return h ? { id:h.CardModel.Id.Entry, from:[r.left+h.GlobalPosition.X*s,r.top+(h.GlobalPosition.Y-60)*s], up:[r.left+h.GlobalPosition.X*s,r.top+500*s] } : null;
    });
    if (!card) assert.equal(mode, 'daily', 'Standard fixture has a playable targeted card');
    if (card) {
    await host.mouse.move(...card.from); await host.mouse.down(); await host.mouse.move(...card.up, {steps:6});
    const target=await host.locator('.creature[data-side="enemy"]:not(.dead) .cr-hitbox').first().boundingBox();
    const to=[target.x+target.width/2,target.y+target.height/2];
    await host.mouse.move(...to, {steps:6});
    await guest.waitForFunction(id => document.querySelector('.mp-combat-intent[data-player-id="1"]')?.dataset.modelId===id, card.id);
    await guest.waitForFunction(() => document.querySelector('.mp-targeting-line[data-player-id="1"]')?.style.display==='');
    await guest.screenshot({ path: `${out}/remote-targeting.png` });
    await host.mouse.up();
    await guest.waitForFunction(() => document.querySelector('.mp-targeting-line[data-player-id="1"]')?.style.display==='none');
    }
    console.log(`Expanded inventories and remote hover previews passed${card ? ', including real mouse targeting' : ' (daily opening hand has no targeted card)'}`);
  }
  await host.click('.end-turn-btn.shown:not(.disabled)');
  for (const p of pages) await p.waitForSelector('.mp-player-state[data-player-id="1"][data-ready="true"]');
  for (const p of pages) await p.waitForSelector('.etb-player-vote[data-player-id="1"]');
  await host.waitForSelector('.ping-btn.shown:not(:disabled)');
  assert.equal(await guest.locator('.ping-btn.shown').count(), 0);
  await host.click('.ping-btn.shown');
  await guest.waitForFunction(() => Number(document.querySelector('.speech-bubble')?.style.opacity) > .1);
  await guest.waitForFunction(() => document.querySelector('.mp-player-state[data-player-id="1"] .mp-state-ready').getAnimations().length > 0);
  await host.screenshot({ path: `${out}/end-turn-waiting-host.png` });
  await guest.screenshot({ path: `${out}/end-turn-waiting-guest.png` });
  if (process.env.KEYBOARD_PING) {
    await guest.evaluate(() => {
      const flavor = window.G.RunManager.Instance.FlavorSynchronizer;
      window.__keyboardPings = 0;
      flavor.OnEndTurnPingReceived = window.G.$.dcombine(flavor.OnEndTurnPingReceived, () => window.__keyboardPings++);
    });
    await host.waitForTimeout(1100); // Original flavor ping cooldown.
    await host.evaluate(() => { window.G.SaveManager.Instance.PrefsSave.KeyboardMode = true; });
    await host.keyboard.press('ArrowLeft');
    await host.keyboard.press('Space');
    await guest.waitForFunction(() => window.__keyboardPings === 1);
    await host.evaluate(() => { window.G.SaveManager.Instance.PrefsSave.KeyboardMode = false; });
    console.log('Pure keyboard Select uses the controller waiting-ping path');
  }
  await host.click('.end-turn-btn.shown:not(.disabled)');
  for (const p of pages) {
    await p.waitForSelector('.mp-player-state[data-player-id="1"][data-ready="false"]');
    await p.waitForFunction(() => !document.querySelector('.etb-player-vote[data-player-id="1"]'));
  }
  assert.equal(await host.locator('.ping-btn.shown').count(), 0);
  console.log('Waiting ping, ready portraits and undo passed');
  if (process.env.DIVERGENCE) {
    await host.waitForTimeout(500);
    const ids = await Promise.all(pages.map(p => p.evaluate(() => window.G.RunManager.Instance.ChecksumTracker.NextId)));
    assert.equal(new Set(ids).size, 1);
    await guest.evaluate(() => { window.G.RunManager.Instance.State.GetPlayer(2).Creature.CurrentHp -= 1; });
    for (const p of [host, guest]) await p.evaluate(() => window.G.RunManager.Instance.ChecksumTracker.GenerateChecksum$2('e2e forced mismatch', null));
    for (const p of pages) await p.waitForSelector('.mp-join-dialog');
    assert.match(await guest.locator('.mp-dialog-desc').innerText(), /diverged/);
    console.log('OK: original checksum mismatch stops all peers and displays a sync error');
    process.exitCode = 0;
  } else {
  // Play hand cards through real mouse drags until combat rewards appear.
  let choiceFeedbackChecked = false;
  for (let step = 0; step < 400; step++) {
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
          return confirm ? { tap: center(confirm), choice: true } : h ? { tap: point(h.GlobalPosition.X, h.GlobalPosition.Y - 60), choice: true } : null;
        }
        if (hand?.currentPlay && target) return { tap: center(target) };
        const end = document.querySelector('.end-turn-btn.shown:not(.disabled)');
        if (!end || window.G.CombatManager.Instance.IsPlayerReadyToEndTurn(window.G.RunManager.Instance.State.GetPlayer(window.G.LocalContext.NetId))) return null;
        const h = hand?.ActiveHolders.find(x => x.hitboxEnabled && x.CardModel?.CanPlay$0?.());
        if (!h) return { tap: center(end) };
        return { from: point(h.GlobalPosition.X, h.GlobalPosition.Y - 60), up: point(h.GlobalPosition.X, 500), target: h.CardModel.TargetType === window.G.TargetType.AnyEnemy && target ? center(target) : null };
      });
      if (!next) { await p.waitForTimeout(80); continue; }
      if (process.env.PARITY && next.choice && !choiceFeedbackChecked) {
        const playerId = pages.indexOf(p) + 1;
        for (const peer of pages) await peer.waitForSelector(`.mp-combat-intent[data-player-id="${playerId}"][data-waiting="true"]`);
        await pages.find(peer => peer !== p).screenshot({ path: `${out}/remote-player-choice.png` });
        choiceFeedbackChecked = true;
      }
      if (next.tap) await p.mouse.click(...next.tap);
      else {
        await p.mouse.move(...next.from); await p.mouse.down(); await p.mouse.move(...next.up, { steps: 6 });
        if (next.target) await p.mouse.move(...next.target, { steps: 6 });
        await p.mouse.up();
      }
      await p.waitForTimeout(80);
    }
  }
  if (process.env.PARITY && mode === 'standard') assert.ok(choiceFeedbackChecked, 'Original player-choice pause is visible to peers');
  for (const p of pages) await p.waitForSelector('.rewards-screen', { timeout: 20000 });
  const combatStates = await Promise.all(pages.map(p => p.evaluate(() => window.G.RunManager.Instance.State.Players.map(x => [x.NetId, x.Creature.CurrentHp, x.Gold]))));
  for (const state of combatStates) assert.deepEqual(state, combatStates[0], 'Combat results must agree');
  const checksums = await Promise.all(pages.map(p => p.evaluate(() => ({ checksums:window.__checksums, divergences:window.__divergences }))));
  fs.writeFileSync(`${out}/checksums.json`, JSON.stringify(checksums, null, 2));
  for (const c of checksums) {
    assert.deepEqual(c.divergences, [], 'No state divergence during combat');
    for (const remote of c.checksums) {
      const local = checksums[0].checksums.find(x => x.id === remote.id);
      if (local) assert.equal(remote.checksum, local.checksum, `Original checksum ${remote.id}: ${remote.context}`);
    }
  }
  // One player can finish rewards and open the map while another is still reviewing rewards.
  await host.click('.rewards-screen .proceed-btn.shown');
  await guest.waitForFunction(() => document.querySelector('.mp-player-state[data-player-id="1"]')?.querySelector('[data-screen="Map"]'));
  for (const p of pages.slice(1)) await p.click('.rewards-screen .proceed-btn.shown');
  for (const p of pages) await p.waitForFunction(() => window.ui.mapOpen);
  for (const p of pages) {
    assert.equal(await p.locator('.proceed-btn.shown:visible').count(), 0, 'Room proceed button is hidden under the map');
    await p.screenshot({ path: `${out}/map-after-rewards-${pages.indexOf(p) + 1}.png` });
  }
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
  if (process.env.PARITY) {
    for (const p of pages) await p.click('.treasure .proceed-btn.shown');
    const enterEvent = async id => {
      // Debug room entry still constructs each event through the original EventSynchronizer.
      for (const p of pages) await p.evaluate(async id => {
        const G=window.G, rm=G.RunManager.Instance;
        G.$.ext('MegaCrit.Sts2.Core.Nodes.Screens.Map.NMapScreen').Instance.Close();
        const ev=Array.from(G.ModelDb.AllEvents).find(e=>e.Id.Entry===id);
        rm.State.AppendToMapPointHistory(G.MapPointType.Unknown,G.RoomType.Event,ev.Id);
        await rm.EnterRoom(new G.EventRoom().$ctor_EventRoom$EventModel(ev));
      }, id);
      for (const p of pages) await p.waitForFunction(id => window.ui.room?.event?.Id.Entry===id && window.ui.room.ready && !window.ui.mapOpen, id);
    };
    await enterEvent('MORPHIC_GROVE');
    await host.locator('.event-option').nth(1).click();
    for (const p of pages) await p.waitForSelector('.event-option:nth-child(2) .event-votes [data-player-id="1"]');
    await host.locator('.event-option').nth(0).click();
    for (const p of pages) await p.waitForSelector('.event-option:nth-child(1) .event-votes [data-player-id="1"]');
    await host.locator('.event-option').nth(1).click();
    await host.screenshot({path:`${out}/shared-event-vote.png`});
    for (const p of pages.slice(1)) await p.locator('.event-option').nth(1).click();
    for (const p of pages) await p.waitForFunction(() => window.ui.room.event.IsFinished);
    const health=await Promise.all(pages.map(p=>p.evaluate(()=>window.G.RunManager.Instance.State.Players.map(x=>[x.NetId,x.Creature.CurrentHp,x.Creature.MaxHp]))));
    for (const state of health) assert.deepEqual(state,health[0],'Shared event outcome agrees');
    await enterEvent('TRIAL');
    for (const p of pages) await p.locator('.event-option').nth(1).click();
    for (const p of pages) await p.waitForFunction(() => window.ui.room.options[1]?.WillKillPlayer(window.ui.room.event.Owner));
    for (const p of pages) {
      await p.locator('.event-option').nth(1).click();
      await p.waitForFunction(() => Number(document.querySelector('.thought-bubble')?.style.opacity) > .1);
      assert.equal(await p.locator('.modal-viewport.open').count(),0,'Lethal co-op option must not open abandon confirmation');
      assert.equal(await p.evaluate(()=>window.ui.room.options[1].TextKey),'TRIAL.pages.REJECT.options.DOUBLE_DOWN');
      if (p === host) await p.screenshot({path:`${out}/event-death-prevention.png`});
    }
    for (const p of pages) await p.locator('.event-option').nth(0).click();
    for (const p of pages) {
      await p.waitForFunction(() => window.ui.room.portraitVfxGen===2 && window.ui.room.portraitVfx.length===1);
      assert.match(await p.evaluate(()=>window.ui.room.portraitVfx[0].path),/trial_(merchant|noble|nondescript)_vfx/);
      assert.match(await p.evaluate(()=>window.ui.room.portrait),/trial_started/);
    }
    await host.screenshot({path:`${out}/trial-dynamic-portrait.png`});
    console.log('Shared event votes, original outcomes, lethal choice prevention and dynamic portrait effects passed');
  }
  assert.deepEqual(errors, []);
  console.log(`OK: ${mode}, ${count} players, ${mode === 'standard' ? 'locked preview, unlocked selection, ' : ''}shared drawings, eraser/clear ownership, voting avatars, repeated-vote pings, all-player vote resolution, waiting pings and ready portraits, combat/rewards, peer ready/screen state, shared relic selection/skip`, coords);
  }
} catch (e) {
  for (let i = 0; i < pages.length; i++) {
    const state = await pages[i].evaluate(() => ({checksums:window.__checksums, divergences:window.__divergences, enemies:window.ui?.room?.combatState?.Enemies?.map(c => [c.Monster.Id.Entry,c.CurrentHp]), phase:window.G?.RunManager.Instance.ActionQueueSynchronizer?.CombatState, errors:[]})).catch(() => null);
    fs.writeFileSync(`${out}/failure-state-${i + 1}.json`, JSON.stringify({state, errors}, null, 2));
  }
  for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: `${out}/failure-${i + 1}.png` }).catch(() => {});
  throw e;
} finally { await browser.close(); }
