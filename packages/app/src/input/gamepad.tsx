/**
 * Gamepad controller subsystem.
 * Provides console-style combat focus navigation & targeting, and virtual cursor for menus/maps/shops.
 */
import { $ } from '../game';
import { ui, invalidate } from '../store';
import { getBindings, type ActionId } from './bindings';
import { creatureViewsRef, targetManager, arrow } from '../cardnodes';
import { getCombatHand, endTurnHotkey, peekHotkey, pileHotkey, confirmHotkey } from '../ui/combat';
import { toggleCardsView, closeCardsView } from '../ui/pause';
import { topBarMapPressed } from '../ui/map';
import { getInputDevice, setInputDevice, setControllerId } from './hints';
import { modalOpen } from '../ui/modal';
import { ftueActive } from '../ui/ftue';
import { edge } from '../view';

// Controller state
let activeGamepadIndex: number | null = null;
let lastButtons: boolean[] = [];
let lastAxes: number[] = [];
let cursorActive = false;
let cursorX = 960;
let cursorY = 540;

// Combat hand selection state
let selectedHandIndex = 0;
let targetMonsterIndex = 0;

// Analog stick debounce / repeat timers
let stickXTimer = 0;
let stickYTimer = 0;

// Connected gamepad info
let connectedName = '';
let toastMessage: string | null = null;
let toastTimeout: any = null;

// Gamepad button rebind listener
let gamepadListenCallback: ((btnIndex: number) => void) | null = null;

export function listenNextGamepadButton(cb: (btnIndex: number) => void) {
  gamepadListenCallback = cb;
}

export function cancelGamepadListen() {
  gamepadListenCallback = null;
}

export function getGamepadToast(): string | null {
  return toastMessage;
}

function showGamepadToast(msg: string) {
  toastMessage = msg;
  invalidate();
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastMessage = null;
    invalidate();
  }, 2500);
}

// Track mouse activity to disable virtual cursor
window.addEventListener('mousemove', (e) => {
  if (!e.isTrusted) return;
  virtualHovered = null;
  if (cursorActive) {
    cursorActive = false;
    invalidate();
  }
}, { passive: true });
window.addEventListener('keydown', (e) => {
  if (!e.isTrusted) return;
  virtualHovered = null;
  cursorActive = false;
}, true);

// Listen for gamepad events
window.addEventListener('gamepadconnected', (e) => {
  activeGamepadIndex = e.gamepad.index;
  connectedName = e.gamepad.id.replace(/\s*\(.*?\)/, '');
  showGamepadToast(`已连接手柄: ${connectedName}`);
});

window.addEventListener('gamepaddisconnected', (e) => {
  if (activeGamepadIndex === e.gamepad.index) {
    activeGamepadIndex = null;
    showGamepadToast('手柄已断开连接');
  }
});

function getActiveGamepad(): Gamepad | null {
  if (activeGamepadIndex !== null) {
    const gp = navigator.getGamepads()[activeGamepadIndex];
    if (gp && gp.connected) return gp;
  }
  const all = navigator.getGamepads();
  for (let i = 0; i < all.length; i++) {
    if (all[i] && all[i]!.connected) {
      activeGamepadIndex = i;
      return all[i]!;
    }
  }
  return null;
}

/**
 * Main gamepad loop running each frame.
 */
export function initGamepadLoop() {
  $.onFrame((dt: number) => {
    const gp = getActiveGamepad();
    if (!gp) {
      lastButtons = [];
      lastAxes = [];
      setInputDevice('keyboard');
      return true;
    }

    setControllerId(gp.id);
    const btns = gp.buttons.map((b) => b.pressed);
    const justPressed = (idx: number) => btns[idx] && !lastButtons[idx];

    // Left stick and right stick values with deadzone
    const deadzone = 0.22;
    const rawLx = gp.axes[0] ?? 0;
    const rawLy = gp.axes[1] ?? 0;
    const lx = Math.abs(rawLx) > deadzone ? rawLx : 0;
    const ly = Math.abs(rawLy) > deadzone ? rawLy : 0;

    const rawRx = gp.axes[2] ?? 0;
    const rawRy = gp.axes[3] ?? 0;
    const rx = Math.abs(rawRx) > deadzone ? rawRx : 0;
    const ry = Math.abs(rawRy) > deadzone ? rawRy : 0;

    // Check if user is using the gamepad (buttons or stick)
    const hasInput = btns.some(Boolean) || Math.abs(lx) > 0 || Math.abs(ly) > 0 || Math.abs(rx) > 0 || Math.abs(ry) > 0;
    const axes = [lx, ly, rx, ry];
    // New presses or deliberate stick movement select the device. A held button or idle stick must not
    // overwrite a more recent keyboard/mouse action on every frame.
    if (btns.some((pressed, i) => pressed && !lastButtons[i]) || axes.some((value, i) => value !== 0 && Math.abs(value - (lastAxes[i] ?? 0)) > 0.01)) {
      setInputDevice('gamepad');
    }
    lastAxes = axes;
    if (hasInput && !cursorActive) {
      cursorActive = true;
      invalidate();
    }

    // Intercept input if settings is listening for a gamepad button
    if (gamepadListenCallback) {
      for (let i = 0; i < btns.length; i++) {
        if (justPressed(i)) {
          const cb = gamepadListenCallback;
          gamepadListenCallback = null;
          cb(i);
          lastButtons = btns;
          return true;
        }
      }
      lastButtons = btns;
      return true;
    }

    const bindings = getBindings().gamepad;
    const isActionJustPressed = (act: keyof typeof bindings) => {
      const b = bindings[act];
      return b !== null && justPressed(b);
    };

    const inCombat = ui.screen === 'run' && !ui.pauseOpen && !ui.subscreen && !ui.cardsView && !ui.mapOpen && !ui.overlays.length && !modalOpen() && !ftueActive() && !!document.querySelector('.combat .combat-ui');

    if (inCombat) {
      handleCombatGamepad(dt, lx, ly, justPressed, isActionJustPressed);
    } else {
      handleMenuVirtualCursor(dt, lx, ly, rx, ry, isActionJustPressed);
    }

    lastButtons = btns;
    return true;
  });
}

function handleCombatGamepad(
  dt: number,
  lx: number,
  ly: number,
  justPressed: (b: number) => boolean,
  actionJustPressed: (act: ActionId) => boolean,
) {
  const hand = getCombatHand();

  // 1. If currently in single targeting mode (arrow pointing at monsters)
  if (targetManager.IsInSelection) {
    const monsters = creatureViewsRef.get().filter((c: any) => c.Entity?.IsMonster && c.Entity?.IsAlive);
    if (monsters.length > 0) {
      if (targetMonsterIndex >= monsters.length) targetMonsterIndex = 0;
      
      // Step left/right between monsters using stick or d-pad
      stickXTimer -= dt;
      if (lx < -0.4 || justPressed(14)) { // D-Pad Left or Stick Left
        if (stickXTimer <= 0) {
          targetMonsterIndex = (targetMonsterIndex - 1 + monsters.length) % monsters.length;
          stickXTimer = 0.25;
        }
      } else if (lx > 0.4 || justPressed(15)) { // D-Pad Right or Stick Right
        if (stickXTimer <= 0) {
          targetMonsterIndex = (targetMonsterIndex + 1) % monsters.length;
          stickXTimer = 0.25;
        }
      } else {
        stickXTimer = 0;
      }

      const m = monsters[targetMonsterIndex];
      if (m && targetManager.hovered !== m) {
        targetManager.OnNodeHovered(m);
        invalidate();
      }
    }

    // Confirm play card to selected monster (A button)
    if (actionJustPressed('confirm')) {
      targetManager.button(0, false);
      return;
    }
    // Cancel targeting (B button)
    if (actionJustPressed('cancel')) {
      targetManager.CancelTargeting();
      return;
    }
    return;
  }

  if (actionJustPressed('cancel')) { simulateEscape(); return; }
  if (hand?.IsInCardSelection && actionJustPressed('confirm')) { confirmHotkey()?.(); return; }
  for (let i = 1; i <= 10; i++) {
    if (actionJustPressed(`selectCard${i}` as ActionId)) { hand?.selectCardShortcut(i - 1); return; }
  }

  // 2. Not targeting: navigate hand cards or trigger combat actions
  if (hand && hand.ActiveHolders.length > 0) {
    const holders = hand.ActiveHolders;
    if (selectedHandIndex >= holders.length) selectedHandIndex = holders.length - 1;
    if (selectedHandIndex < 0) selectedHandIndex = 0;

    // Step between cards (LB / RB, D-Pad Left/Right, or Left Stick)
    stickXTimer -= dt;
    let step = 0;
    if (actionJustPressed('handPrev')) {
      step = -1;
    } else if (actionJustPressed('handNext')) {
      step = 1;
    } else if (lx < -0.5) {
      if (stickXTimer <= 0) { step = -1; stickXTimer = 0.25; }
    } else if (lx > 0.5) {
      if (stickXTimer <= 0) { step = 1; stickXTimer = 0.25; }
    } else {
      stickXTimer = 0;
    }

    if (step !== 0) {
      selectedHandIndex = (selectedHandIndex + step + holders.length) % holders.length;
      for (let i = 0; i < holders.length; i++) {
        holders[i].focus(i === selectedHandIndex);
      }
      invalidate();
    }

    // Play highlighted card (A button)
    if (actionJustPressed('confirm')) {
      const cur = holders[selectedHandIndex];
      if (cur) {
        targetMonsterIndex = 0;
        hand.press(cur, false);
        invalidate();
        return;
      }
    }
  }

  // Combat shortcuts
  if (actionJustPressed('endTurn')) { // Y button -> End Turn
    endTurnHotkey()?.();
    return;
  }
  if (actionJustPressed('peek')) { // X button -> Peek
    peekHotkey()?.();
    return;
  }
  if (actionJustPressed('viewDraw')) {
    pileHotkey('draw')?.();
    return;
  }
  if (actionJustPressed('viewDiscard')) {
    pileHotkey('discard')?.();
    return;
  }
  if (actionJustPressed('viewExhaust')) {
    pileHotkey('exhaust')?.();
    return;
  }
  if (actionJustPressed('viewDeck')) {
    toggleCardsView('deck');
    return;
  }
  if (actionJustPressed('viewMap')) {
    topBarMapPressed();
    return;
  }
}

function handleMenuVirtualCursor(
  dt: number,
  lx: number,
  ly: number,
  rx: number,
  ry: number,
  actionJustPressed: (act: ActionId) => boolean,
) {
  // Move virtual cursor with left stick
  const speed = 1200; // pixels per second
  cursorX = Math.max(edge.l + 20, Math.min(edge.r - 20, cursorX + lx * speed * dt));
  cursorY = Math.max(edge.t + 20, Math.min(edge.b - 20, cursorY + ly * speed * dt));
  if (getInputDevice() === 'gamepad') hoverElementUnderCursor();
  invalidate();

  // Scroll views with right stick (e.g. Map, Compendium, Settings)
  if (Math.abs(ry) > 0.2) {
    const el = getElementUnderCursor();
    if (el) {
      el.dispatchEvent(new WheelEvent('wheel', {
        deltaY: ry * 35,
        deltaMode: 0,
        bubbles: true,
        cancelable: true,
      }));
    }
  }

  if (modalOpen()) {
    if (actionJustPressed('confirm')) window.dispatchEvent(new KeyboardEvent('keydown', { key: getBindings().keys.confirm, bubbles: true }));
    else if (actionJustPressed('cancel')) simulateEscape();
    return;
  }

  // A button -> Click element under cursor
  if (actionJustPressed('confirm')) {
    clickElementUnderCursor();
  }

  // B button -> Back / Close / Escape
  if (actionJustPressed('cancel')) {
    simulateEscape();
  }

  // Map hotkey (Select/Back button)
  const runShortcuts = ui.screen === 'run' && !ui.pauseOpen && !ui.subscreen && !modalOpen() && !ftueActive();
  if (runShortcuts && actionJustPressed('viewMap')) {
    topBarMapPressed();
  }

  // Deck hotkey (D-Pad Up)
  if (runShortcuts && actionJustPressed('viewDeck')) {
    toggleCardsView('deck');
  }
}

let virtualHovered: HTMLElement | null = null;
let virtualHoverDevice = getInputDevice();
function hoverElementUnderCursor() {
  if (virtualHoverDevice !== getInputDevice()) virtualHovered = null;
  virtualHoverDevice = getInputDevice();
  const el = getElementUnderCursor();
  if (el === virtualHovered) return;
  const previous = virtualHovered;
  virtualHovered = el;
  // Synthetic hover events reveal the same tips as a mouse, while preserving the active gamepad device.
  const hoverEvent = (target: HTMLElement | null, type: string, relatedTarget: HTMLElement | null, bubbles = true) => {
    if (!target) return;
    const r = target.getBoundingClientRect();
    const init = { bubbles, relatedTarget, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    target.dispatchEvent(type.startsWith('pointer') ? new PointerEvent(type, { ...init, pointerType: 'mouse' }) : new MouseEvent(type, init));
  };
  hoverEvent(previous, 'pointerout', el);
  hoverEvent(previous, 'mouseout', el);
  for (let node = previous; node && !node.contains(el); node = node.parentElement) {
    hoverEvent(node, 'pointerleave', el, false);
    hoverEvent(node, 'mouseleave', el, false);
  }
  hoverEvent(el, 'pointerover', previous);
  hoverEvent(el, 'mouseover', previous);
  for (let node = el; node && !node.contains(previous); node = node.parentElement) {
    hoverEvent(node, 'pointerenter', previous, false);
    hoverEvent(node, 'mouseenter', previous, false);
  }
}

function getElementUnderCursor(): HTMLElement | null {
  const root = document.querySelector('.stage-root') as HTMLElement;
  if (!root) return null;
  const rect = root.getBoundingClientRect();
  const scale = rect.width / 1920;
  const clientX = rect.left + cursorX * scale;
  const clientY = rect.top + cursorY * scale;
  return document.elementFromPoint(clientX, clientY) as HTMLElement;
}

function clickElementUnderCursor() {
  const el = getElementUnderCursor();
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const evInit: PointerEventInit = {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    bubbles: true,
    cancelable: true,
    button: 0,
    isPrimary: true,
  };
  el.dispatchEvent(new PointerEvent('pointerdown', evInit));
  el.dispatchEvent(new PointerEvent('pointerup', evInit));
  el.click();
}

function simulateEscape() {
  if (modalOpen()) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: getBindings().keys.cancel, bubbles: true }));
    return;
  }
  const closers = document.querySelectorAll<HTMLElement>('[data-esc]');
  const close = closers[closers.length - 1];
  if (close) {
    close.click();
  } else if (ui.subscreen) {
    ui.subscreen = null;
  } else if (ui.cardsView) {
    closeCardsView();
  } else {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: getBindings().keys.cancel, bubbles: true }));
  }
  invalidate();
}

/**
 * Virtual cursor visual indicator rendered over the stage.
 */
export function VirtualCursor() {
  if (!cursorActive || getInputDevice() !== 'gamepad') return null;
  return (
    <div
      class="gamepad-cursor"
      style={{
        position: 'absolute',
        left: `${cursorX}px`,
        top: `${cursorY}px`,
        width: '32px',
        height: '32px',
        pointerEvents: 'none',
        zIndex: 9999,
        transform: 'translate(-4px, -4px)',
        filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.8)) drop-shadow(0 0 6px rgba(239,200,81,0.6))',
        transition: 'transform 0.05s ease-out',
      }}
    >
      <svg width="32" height="32" viewBox="0 0 32 32">
        <path
          d="M 2 2 L 26 12 L 14 16 L 10 28 Z"
          fill="#efc851"
          stroke="#1a140a"
          stroke-width="2.5"
          stroke-linejoin="round"
        />
        <circle cx="14" cy="14" r="2.5" fill="#fff" />
      </svg>
    </div>
  );
}

/**
 * Gamepad status Toast notification.
 */
export function GamepadToast() {
  if (!toastMessage) return null;
  return (
    <div
      class="gamepad-toast"
      style={{
        position: 'fixed',
        top: '32px',
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(18, 22, 28, 0.95)',
        border: '2px solid #efc851',
        borderRadius: '8px',
        padding: '10px 24px',
        color: '#fff6e2',
        fontSize: '22px',
        fontFamily: 'var(--font)',
        fontWeight: 'bold',
        boxShadow: '0 8px 30px rgba(0,0,0,0.8)',
        zIndex: 10000,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <span style={{ color: '#efc851' }}>🎮</span>
      <span>{toastMessage}</span>
    </div>
  );
}
