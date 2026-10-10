/**
 * Keyboard and Gamepad action bindings.
 * Persisted in browser localStorage to preserve 100% compatibility with core save DTOs.
 */
import { loc } from '../i18n';

export type ActionId =
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
}

export const ACTION_LIST: ActionMeta[] = [
  { id: 'endTurn', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.endTurn', defaultKey: 'e', defaultBtn: 3 }, // Y / Triangle
  { id: 'peek', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.peek', defaultKey: ' ', defaultBtn: 2 }, // X / Square
  { id: 'confirm', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.confirm', defaultKey: 'Enter', defaultBtn: 0 }, // A / Cross
  { id: 'cancel', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.cancel', defaultKey: 'Escape', defaultBtn: 1 }, // B / Circle
  { id: 'handPrev', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.left', defaultKey: 'ArrowLeft', defaultBtn: 4 }, // LB / L1
  { id: 'handNext', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.right', defaultKey: 'ArrowRight', defaultBtn: 5 }, // RB / R1
  { id: 'viewMap', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.viewMap', defaultKey: 'm', defaultBtn: 8 }, // Back / Select
  { id: 'viewDeck', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.viewDeck', defaultKey: 'd', defaultBtn: 12 }, // D-Pad Up
  { id: 'viewDraw', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.viewDraw', defaultKey: 'a', defaultBtn: 14 }, // D-Pad Left
  { id: 'viewDiscard', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.viewDiscard', defaultKey: 's', defaultBtn: 15 }, // D-Pad Right
  { id: 'viewExhaust', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.viewExhaust', defaultKey: 'x', defaultBtn: 13 }, // D-Pad Down
  { id: 'selectCard1', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.selectCard1', defaultKey: '1', defaultBtn: null },
  { id: 'selectCard2', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.selectCard2', defaultKey: '2', defaultBtn: null },
  { id: 'selectCard3', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.selectCard3', defaultKey: '3', defaultBtn: null },
  { id: 'selectCard4', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.selectCard4', defaultKey: '4', defaultBtn: null },
  { id: 'selectCard5', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.selectCard5', defaultKey: '5', defaultBtn: null },
  { id: 'selectCard6', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.selectCard6', defaultKey: '6', defaultBtn: null },
  { id: 'selectCard7', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.selectCard7', defaultKey: '7', defaultBtn: null },
  { id: 'selectCard8', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.selectCard8', defaultKey: '8', defaultBtn: null },
  { id: 'selectCard9', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.selectCard9', defaultKey: '9', defaultBtn: null },
  { id: 'selectCard10', labelKey: 'INPUT_SETTINGS.INPUT_TITLE.selectCard10', defaultKey: '0', defaultBtn: null },
];

export interface BindingsData {
  keys: Record<ActionId, string>;
  gamepad: Record<ActionId, number | null>;
}

const STORAGE_KEY = 'sts2_input_bindings';

function getDefaultBindings(): BindingsData {
  const keys = {} as Record<ActionId, string>;
  const gamepad = {} as Record<ActionId, number | null>;
  for (const a of ACTION_LIST) {
    keys[a.id] = a.defaultKey;
    gamepad[a.id] = a.defaultBtn;
  }
  return { keys, gamepad };
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

export function setKeyBinding(action: ActionId, key: string) {
  const b = getBindings();
  const oldKey = b.keys[action];

  // 若其他动作已占用此按键，与原动作按键互换（与原版游戏行为一致）
  for (const act of Object.keys(b.keys) as ActionId[]) {
    if (act !== action && b.keys[act]?.toLowerCase() === key.toLowerCase()) {
      b.keys[act] = oldKey;
    }
  }
  b.keys[action] = key;
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
      }
    }
  }
  b.gamepad[action] = btn;
  saveBindings(b);
}

export function formatKeyName(key: string): string {
  if (key === ' ') return 'Space';
  if (key === 'Escape') return 'Esc';
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
