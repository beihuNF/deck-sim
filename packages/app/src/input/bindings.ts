/**
 * Keyboard and Gamepad action bindings.
 * Persisted in browser localStorage to preserve 100% compatibility with core save DTOs.
 */
import { loc } from '../i18n';

export type ActionId =
  | 'select'
  | 'topPanel'
  | 'up'
  | 'down'
  | 'endTurn'
  | 'peek'
  | 'confirm'
  | 'cancel'
  | 'viewMap'
  | 'viewDeck'
  | 'viewDraw'
  | 'viewDiscard'
  | 'viewExhaust'
  | 'handPrev'
  | 'handNext'
  | 'selectCard1'
  | 'selectCard2'
  | 'selectCard3'
  | 'selectCard4'
  | 'selectCard5'
  | 'selectCard6'
  | 'selectCard7'
  | 'selectCard8'
  | 'selectCard9'
  | 'selectCard10';

export interface ActionMeta {
  id: ActionId;
  labelKey: string;
  defaultKey: string;
  defaultBtn: number | null;
  keyboardOnlyKey?: string;
}

// NInputManager: controller inputs first, then remaining keyboard inputs.
export const ACTION_LIST: ActionMeta[] = [
  { id: 'select', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.select', defaultKey: '', keyboardOnlyKey: ' ', defaultBtn: 0 },
  { id: 'cancel', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.cancel', defaultKey: 'Escape', defaultBtn: 1 },
  { id: 'viewMap', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.viewMap', defaultKey: 'm', keyboardOnlyKey: 'Tab', defaultBtn: 8 },
  { id: 'topPanel', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.topPanel', defaultKey: '', keyboardOnlyKey: 'w', defaultBtn: 2 },
  { id: 'viewDeck', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.viewDeck', defaultKey: 'd', keyboardOnlyKey: 'q', defaultBtn: 4 },
  { id: 'viewDraw', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.viewDraw', defaultKey: 'a', defaultBtn: 6 },
  { id: 'viewDiscard', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.viewDiscard', defaultKey: 's', keyboardOnlyKey: 'd', defaultBtn: 7 },
  { id: 'viewExhaust', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.viewExhaust', defaultKey: 'x', keyboardOnlyKey: 'f', defaultBtn: 5 },
  { id: 'confirm', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.confirm', defaultKey: 'e', keyboardOnlyKey: 'Enter', defaultBtn: 3 },
  { id: 'endTurn', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.endTurn', defaultKey: 'e', defaultBtn: 3 },
  { id: 'peek', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.peek', defaultKey: ' ', keyboardOnlyKey: 's', defaultBtn: 10 },
  { id: 'up', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.up', defaultKey: 'ArrowUp', defaultBtn: 12 },
  { id: 'down', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.down', defaultKey: 'ArrowDown', defaultBtn: 13 },
  { id: 'handPrev', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.left', defaultKey: 'ArrowLeft', defaultBtn: 14 },
  { id: 'handNext', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.right', defaultKey: 'ArrowRight', defaultBtn: 15 },
  ...Array.from({ length: 10 }, (_, i): ActionMeta => ({ id: `selectCard${i + 1}` as ActionId,
    labelKey: `INPUT_SETTINGS.INPUT_TITLE.selectCard${i + 1}`, defaultKey: String((i + 1) % 10), defaultBtn: null })),
];

export interface BindingsData {
  keys: Record<ActionId, string>;
  gamepad: Record<ActionId, number | null>;
  keyboardOnly: Record<ActionId, string>;
}

const STORAGE_KEY = 'sts2_input_bindings';

function getDefaultBindings(): BindingsData {
  const keys = {} as Record<ActionId, string>;
  const gamepad = {} as Record<ActionId, number | null>;
  const keyboardOnly = {} as Record<ActionId, string>;
  for (const a of ACTION_LIST) {
    keys[a.id] = a.defaultKey;
    gamepad[a.id] = a.defaultBtn;
    keyboardOnly[a.id] = a.keyboardOnlyKey ?? a.defaultKey;
  }
  return { keys, gamepad, keyboardOnly };
}

let currentBindings: BindingsData = loadBindings();

export function getBindings(): BindingsData {
  return currentBindings;
}

export function loadBindings(): BindingsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultBindings();
    const data = JSON.parse(raw);
    const defaults = getDefaultBindings();
    return {
      keys: { ...defaults.keys, ...(data.keys || {}) },
      gamepad: { ...defaults.gamepad, ...(data.gamepad || {}) },
      keyboardOnly: { ...defaults.keyboardOnly, ...(data.keyboardOnly || {}) },
    };
  } catch {
    return getDefaultBindings();
  }
}

export function saveBindings(b: BindingsData) {
  currentBindings = b;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {}
}

export function resetBindings(): BindingsData {
  const d = getDefaultBindings();
  saveBindings(d);
  return d;
}

export function setKeyBinding(action: ActionId, key: string, keyboardOnly = false) {
  const b = getBindings();
  const keys = keyboardOnly ? b.keyboardOnly : b.keys;
  const oldKey = keys[action];

  // 若其他动作已占用此按键，与原动作按键互换（与原版游戏行为一致）
  for (const act of Object.keys(keys) as ActionId[]) {
    if (act !== action && keys[act]?.toLowerCase() === key.toLowerCase()) {
      keys[act] = oldKey;
      if (!keyboardOnly && act === 'confirm') keys.endTurn = oldKey;
      if (!keyboardOnly && act === 'endTurn') keys.confirm = oldKey;
    }
  }
  keys[action] = key;
  // NInputManager links confirm and end turn only in mouse/keyboard and controller modes.
  if (!keyboardOnly) {
    if (action === 'confirm') keys.endTurn = key;
    if (action === 'endTurn') keys.confirm = key;
  }
  saveBindings(b);
}

export function setGamepadBinding(action: ActionId, btn: number | null) {
  const b = getBindings();
  const oldBtn = b.gamepad[action];

  // 若其他动作已占用此手柄按钮，与原动作按钮互换
  if (btn !== null) {
    for (const act of Object.keys(b.gamepad) as ActionId[]) {
      if (act !== action && b.gamepad[act] === btn) {
        b.gamepad[act] = oldBtn;
        if (act === 'confirm') b.gamepad.endTurn = oldBtn;
        if (act === 'endTurn') b.gamepad.confirm = oldBtn;
      }
    }
  }
  b.gamepad[action] = btn;
  if (action === 'confirm') b.gamepad.endTurn = btn;
  if (action === 'endTurn') b.gamepad.confirm = btn;
  saveBindings(b);
}

export function formatKeyName(key: string): string {
  if (!key) return '-';
  if (key === ' ') return 'Space';
  if (key === 'Escape') return 'Escape';
  if (key === 'ArrowUp') return '↑';
  if (key === 'ArrowDown') return '↓';
  if (key === 'ArrowLeft') return '←';
  if (key === 'ArrowRight') return '→';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

const GAMEPAD_BUTTON_NAMES: Record<number, string> = {
  0: 'A (×)',
  1: 'B (○)',
  2: 'X (□)',
  3: 'Y (△)',
  4: 'LB (L1)',
  5: 'RB (R1)',
  6: 'LT (L2)',
  7: 'RT (R2)',
  8: 'Back / Share',
  9: 'Start / Menu',
  10: 'L3 (Stick)',
  11: 'R3 (Stick)',
  12: 'D-Pad Up',
  13: 'D-Pad Down',
  14: 'D-Pad Left',
  15: 'D-Pad Right',
};

export function formatGamepadButton(btn: number | null): string {
  if (btn == null) return '-';
  return GAMEPAD_BUTTON_NAMES[btn] ?? `Btn ${btn}`;
}

export function getActionName(a: ActionMeta): string {
  const localized = loc('settings_ui', a.labelKey);
  return localized || a.id;
}
