// Pause menu actions by localized label: optional buttons can change the menu order.
export async function pauseButton(page, key) {
  const label = await page.evaluate(key =>
    new window.G.LocString().$ctor_LocString('gameplay_ui', key).GetFormattedText(), `PAUSE_MENU.${key}`);
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page.locator('.pause-menu .pause-btn:not(.disabled)').filter({ hasText: new RegExp(`^\\s*${escaped}\\s*$`) });
}
