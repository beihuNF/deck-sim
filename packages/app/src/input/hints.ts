import { frameByName } from '../assets';
import { invalidate } from '../store';
import { ACTION_LIST, getActionName, getBindings, formatGamepadButton, formatKeyName, type ActionId } from './bindings';

type InputDevice = 'keyboard' | 'gamepad';
let device: InputDevice = 'keyboard';
type ControllerFamily = 'xbox_one' | 'ps4' | 'switch';
let controllerFamily: ControllerFamily = 'xbox_one';
const BUTTON_GLYPHS = ['a', 'b', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'back', 'start', 'ls', 'rs', 'up', 'down', 'left', 'right'];

/** Browser standard mapping uses physical positions; Switch's south button is B. */
export function setControllerId(id: string) {
  const next: ControllerFamily = /sony|dualsense|dualshock|playstation|ps[345]|054c/i.test(id) ? 'ps4'
    : /nintendo|switch|joy-con|057e/i.test(id) ? 'switch' : 'xbox_one';
  if (controllerFamily === next) return;
  controllerFamily = next;
  invalidate();
}

export function getGamepadButtonInfo(button: number | null): { frame: any; label: string; name: string } | null {
  if (button == null || button < 0 || button >= BUTTON_GLYPHS.length) return null;
  let glyph = BUTTON_GLYPHS[button];
  if (controllerFamily === 'switch' && button < 4) glyph = ['b', 'a', 'y', 'x'][button];
  const name = `${controllerFamily}/${glyph}`;
  const frame = frameByName('controller_atlas', name);
  const label = controllerFamily === 'ps4'
    ? (['×', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3'][button] ?? formatGamepadButton(button))
    : controllerFamily === 'switch'
      ? (['B', 'A', 'Y', 'X', 'L', 'R', 'ZL', 'ZR', '−', '+', 'L3', 'R3'][button] ?? formatGamepadButton(button))
      : formatGamepadButton(button).replace(/\s*\([^)]*\)/, '');
  return { frame, label, name };
}

export function controllerHint(button: number): string {
  const info = getGamepadButtonInfo(button);
  if (!info) return formatGamepadButton(button);
  return info.frame
    ? `[img alt=${encodeURIComponent(info.label)}]res://atlases/controller_atlas.sprites/${info.name}.tres[/img]`
    : info.label;
}

export const getInputDevice = () => device;
export function setInputDevice(next: InputDevice) {
  if (device === next) return;
  device = next;
  invalidate();
}

// Virtual gamepad clicks and cancel events must not switch the hints back to keyboard.
window.addEventListener('keydown', (e) => { if (e.isTrusted) setInputDevice('keyboard'); }, true);
window.addEventListener('pointerdown', (e) => { if (e.isTrusted) setInputDevice('keyboard'); }, true);
window.addEventListener('mousemove', (e) => {
  if (e.isTrusted && (e.movementX || e.movementY)) setInputDevice('keyboard');
}, true);
window.addEventListener('wheel', (e) => { if (e.isTrusted) setInputDevice('keyboard'); }, { capture: true, passive: true });

export function actionHint(action: ActionId): string {
  const bindings = getBindings();
  if (device === 'gamepad') {
    const button = bindings.gamepad[action];
    return button == null ? '' : controllerHint(button);
  }
  return formatKeyName(bindings.keys[action]);
}

export function actionHintTitle(action: ActionId): string {
  const title = getActionName(ACTION_LIST.find((a) => a.id === action)!);
  const hint = actionHint(action);
  return hint ? `${title} (${hint})` : title;
}

export const STATIC_TIP_ACTIONS: Partial<Record<string, ActionId>> = {
  MAP: 'viewMap', DECK: 'viewDeck', SETTINGS: 'cancel', END_TURN: 'endTurn',
  DRAW_PILE: 'viewDraw', DISCARD_PILE: 'viewDiscard', EXHAUST_PILE: 'viewExhaust',
};
