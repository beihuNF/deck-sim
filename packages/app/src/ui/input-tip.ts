import { G } from '../game';
import { actionHint, STATIC_TIP_ACTIONS } from '../input/hints';
import { setDynamicTip, type Placement } from './tooltip';

/** Original localized descriptions, with the current device's configured shortcut. */
export function inputTip(key: string, vars: Record<string, string> = {}, at?: Placement | null) {
  setDynamicTip(() => {
    const action = STATIC_TIP_ACTIONS[key];
    const hint = action ? actionHint(action) : '';
    const text = (suffix: string) => {
      try {
        const s = new G.LocString().$ctor_LocString('static_hover_tips', `${key}.${suffix}`);
        for (const [name, value] of Object.entries({ Hotkey: hint || 'None', ...vars })) s.Add$String_String(name, value);
        return s.GetFormattedText();
      } catch { return ''; }
    };
    let title = text('title');
    // Original Settings titles embed ESC in the localization instead of a Hotkey variable.
    if (key === 'SETTINGS') {
      const wide = title.includes('（');
      title = title.replace(/\s*[（(]ESC[)）]\s*$/i, '');
      if (hint) title += wide ? `（${hint}）` : ` (${hint})`;
    }
    return { title, body: text('description') };
  }, at);
}
