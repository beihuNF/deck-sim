// Lobby settings and original daily generation in isolated profiles. Requires app + room server.
// CHROME=<path> [VIEW=...] [ASPECT=Auto] node tools/e2e/multiplayer-modes.mjs <outDir>
import { chromium } from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { viewport, setAspect } from './start.mjs';
const out = process.argv[2] ?? '/tmp/sts2-multiplayer-modes';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const base = process.env.URL ?? 'http://127.0.0.1:47173/';
const errors = [];
try {
  for (const [index, mode] of ['standard', 'daily', 'custom'].entries()) {
    const pages = [];
    try {
      for (let i = 0; i < 2; i++) {
        const p = await browser.newPage({ viewport }); pages.push(p);
        p.on('pageerror', e => errors.push(`${mode}/${i}: ${e.message}`));
        await p.goto(base + '?lang=eng&tutorials=off');
        await p.waitForFunction(() => window.ui?.screen === 'menu', null, { timeout: 60000 });
        await setAspect(p);
        if (await p.locator('.ea-proceed').count()) await p.click('.ea-proceed');
        await p.evaluate(i => {
          const G = window.G;
          G.SaveManager.Instance.PrefsSave.FastMode = G.FastModeType.Instant;
          G.SaveManager.Instance.ObtainEpochOverride('DAILY_RUN_EPOCH', G.EpochState.Revealed);
          G.SaveManager.Instance.ObtainEpochOverride('CUSTOM_AND_SEEDS_EPOCH', G.EpochState.Revealed);
          G.SaveManager.Instance.Progress.MaxMultiplayerAscension = i === 0 ? 10 : 3;
        }, i);
        await p.click('.mm-multiplayer');
      }
      const [host, guest] = pages;
      await host.locator('.submenu-btn').nth(0).click();
      await host.locator('.submenu-btn').nth(index).click();
      await host.waitForSelector('.invite-code-btn');
      const code = (await host.locator('.invite-code-btn').innerText()).match(/[A-F0-9]{12}/)[0];
      await guest.locator('.submenu-btn').nth(1).click();
      await guest.fill('.mp-dialog-input', code); await guest.press('.mp-dialog-input', 'Enter');
      await guest.waitForSelector('.invite-code-btn');
      await host.waitForFunction(() => document.querySelectorAll('.remote-lobby-player').length === 2);
      if (mode !== 'daily') {
        await host.locator('.chs-arrow.right').click();
        await guest.waitForFunction(() => document.querySelector('.chs-asc-level')?.textContent === '1');
        await host.locator('.chs-arrow.right').click();
        await guest.waitForFunction(() => document.querySelector('.chs-asc-level')?.textContent === '2');
        assert.equal(await guest.locator('.chs-arrow').count(), 0, 'Guests cannot change the shared difficulty');
        await host.locator('.chs-arrow.right').click();
        await host.waitForFunction(() => !document.querySelector('.chs-arrow.right'));
        await host.fill('.mp-seed-input', 'COOPSETTINGS'); await host.locator('.mp-seed-input').blur();
        await guest.waitForFunction(() => document.querySelector('.mp-seed-input')?.value === 'COOPSETTINGS');
        if (mode === 'custom') {
          await host.click('.mp-settings-button');
          // Flight changes map travel without requiring a starting draft/selection.
          await host.locator('.mp-mod-row').filter({ hasText: 'Flight' }).locator('input').check();
          await host.click('.mp-settings-close');
          await guest.click('.mp-settings-button');
          assert.equal(await guest.locator('.mp-mod-row').filter({ hasText: 'Flight' }).locator('input').isChecked(), true);
          await guest.click('.mp-settings-close');
        }
      } else {
        assert.equal(await host.locator('.chs-buttons').count(), 0, 'Daily characters are assigned by the original daily roll');
        assert.equal(await guest.locator('.chs-arrow').count(), 0);
        await host.click('.mp-settings-button');
        assert.equal(await host.locator('.mp-mod-row').count(), 3);
        await host.click('.mp-settings-close');
      }
      for (const p of pages) await p.click('.mp-lobby-screen .confirm-btn.shown');
      for (const p of pages) await p.waitForFunction(() => window.G.RunManager.Instance.State != null && document.querySelector('.mp-player-states'), null, { timeout: 60000 });
      const states = await Promise.all(pages.map(p => p.evaluate(() => {
        const rm = window.G.RunManager.Instance, rs = rm.State;
        return { seed: rs.Rng.StringSeed, ascension: rs.AscensionLevel, mode: rs.GameMode, daily: rm.DailyTime?.ToString() ?? null, characters: rs.Players.map(x => x.Character.Id.Entry), modifiers: Array.from(rs.Modifiers, m => m.Id.Entry) };
      })));
      assert.deepEqual(states[0], states[1]);
      if (mode !== 'daily') {
        assert.equal(states[0].seed, 'COOPSETTINGS');
        assert.equal(states[0].ascension, 3);
        assert.equal(states[0].daily, null);
        assert.deepEqual(states[0].modifiers, mode === 'custom' ? ['FLIGHT'] : []);
      } else assert.equal(states[0].modifiers.length, 3);
      await host.screenshot({ path: `${out}/${mode}.png` });
      console.log(`OK: ${mode}`, states[0]);
    } catch (e) {
      for (let i = 0; i < pages.length; i++) await pages[i].screenshot({ path: `${out}/${mode}-failure-${i}.png` }).catch(() => {});
      throw e;
    } finally { for (const p of pages) await p.close(); }
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
