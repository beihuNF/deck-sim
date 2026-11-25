// Shared run start for the browser tools: Singleplayer → Standard → (character n) → Confirm, answer the first-embark
// tutorials prompt, then take Neow's first offer (and what it asks for) until the map opens.
/** VIEW=<w>x<h> sizes the browser window (default 1600x900). */
export const viewport = (([width, height]) => ({ width, height }))((process.env.VIEW ?? '1600x900').split('x').map(Number));
/** ASPECT=<AspectRatioSetting: Auto, FourByThree, SixteenByTen, SixteenByNine, TwentyOneByNine> sets the aspect ratio setting once the menu is up. */
export const setAspect = (page) => page.evaluate((a) => {
  if (!a) return;
  window.G.SaveManager.Instance.SettingsSave.AspectRatioSetting = window.G.AspectRatioSetting[a];
  window.dispatchEvent(new Event('resize'));
}, process.env.ASPECT ?? '');
export async function toCharSelect(page, mode = (process.env.MODE ?? 'standard').toLowerCase()) {
  // a fresh profile's first menu opens NEarlyAccessDisclaimer in the modal container
  if (await page.waitForSelector('.ea-proceed', { timeout: 1500 }).catch(() => null)) {
    await page.click('.ea-proceed');
    await page.waitForSelector('.ea-panel', { state: 'detached' });
  }
  if (mode !== 'standard') {
    await page.evaluate(() => {
      const G = window.G;
      const p = G?.SaveManager?.Instance?.Progress;
      if (p && p.NumberOfRuns < 1) {
        const s = p.GetOrCreateCharacterStats(G.ModelDb.Character(G.Ironclad).Id);
        s.TotalLosses = (s.TotalLosses ?? 0) + 1;
      }
    });
  }
  await page.click('.mm-single_player');
  // the first run goes straight to character select; later ones through the singleplayer submenu
  await page.waitForSelector('.charselect, .sp-submenu');
  if (await page.$('.sp-submenu')) {
    const idx = mode === 'blitz' ? 2 : mode === 'dread' ? 3 : 0;
    await page.click(`.submenu-btn >> nth=${idx}`);
  }
  await page.waitForSelector('.charselect .confirm-btn.shown');
}
export async function embark(page, char) {
  // 模式说明弹窗（Blitz / Dread）：有延迟淡入，先等容器出现再点击确认按钮
  if (await page.waitForSelector('.mode-disclaimer', { timeout: 2500 }).catch(() => null)) {
    await page.waitForSelector('.disc-confirm-btn', { state: 'visible', timeout: 6000 });
    await page.waitForTimeout(300);
    await page.click('.disc-confirm-btn');
    await page.waitForSelector('.mode-disclaimer', { state: 'detached' }).catch(() => {});
  }
  // v0.113.1 NCharacterSelectScreen.TryShowAscensionSinglePlayerFtue: 已解锁进阶且开启教程时弹出 FTUE
  if (await page.waitForSelector('.ftue-confirm', { timeout: 1500 }).catch(() => null)) {
    await page.click('.ftue-confirm');
    await page.waitForSelector('.modal-viewport.open', { state: 'detached' }).catch(() => {});
  }
  if (char) { await page.click(`.chs-buttons > :nth-child(${char})`); await page.waitForTimeout(200); }
  await page.click('.charselect .confirm-btn.shown');
}
export async function startRun(page, { char } = {}) {
  await toCharSelect(page);
  await embark(page, char);
  await page.click('.vp-btn.yes', { timeout: 2000 }).catch(() => {}); // NAcceptTutorialsFtue
  await page.waitForFunction(() => window.ui?.screen === 'run' && window.ui.room, null, { timeout: 60000 });
  for (let i = 0; i < 40 && !(await page.evaluate(() => window.ui.mapOpen)); i++) {
    // buttons take clicks; the overlay screens (card grids, choices, rewards) take the mouse like NButtons
    const at = await page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const click = q('.ftue-confirm') ?? q('.cr-arrow.right');
      const top = window.ui.overlays[window.ui.overlays.length - 1];
      const pick = !top ? null : top.kind === 'bundle' ? (top.picked < 0 ? q('.bundle') : q('.bundle-preview .confirm-btn.shown'))
        : top.preview ? q('.grid-preview .confirm-btn.shown')
        : q('.grid-screen') ? (top.selected.length < Math.max(1, top.min) ? q('.card-grid .gh-card') : q('.grid-screen > .confirm-btn.shown'))
        : q('.choose-card-screen .gh-card') ?? q('.card-reward-screen .gh-card') ?? q('.reward-btn') ?? q('.proceed-btn.shown');
      const room = window.ui.room;
      const opt = !click && !pick && room?.kind === 'event' && !room.disabled
        ? (q('.anc-hitbox') ?? document.querySelectorAll('.event-option')[room.options.findIndex((o) => !o.IsLocked)]) : null;
      if (click) { const r = click.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
      if (opt) { const r = opt.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
      if (pick) { const r = pick.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
      q('.proceed:not([disabled])')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return null;
    });
    if (at) { await page.mouse.move(at[0], at[1]); await page.waitForTimeout(60); await page.mouse.down(); await page.mouse.up(); await page.mouse.move(5, 5); }
    await page.waitForTimeout(400);
  }
  await page.waitForFunction(() => window.ui?.mapOpen, null, { timeout: 60000 });
}

/** Click the first travelable map node with the mouse (NMapPoint takes pointer enter / down / up), once it is on screen. */
export async function travel(page) {
  const at = await page.waitForFunction(() => {
    const el = document.querySelector('.map-screen .mp.travelable');
    const st = document.querySelector('.stage-root')?.getBoundingClientRect();
    if (!el || !st) return null;
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    return y > st.top + 80 && y < st.bottom - 40 ? [x, y] : null;
  }, null, { timeout: 30000 }).then((h) => h.jsonValue());
  await page.mouse.move(at[0], at[1]);
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.mouse.up();
}
