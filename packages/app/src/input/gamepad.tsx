/**
 * Gamepad controller subsystem.
 * Provides directional focus navigation, combat targeting, and an optional virtual cursor.
 */
import { $, G } from '../game';
import { useEffect, useState } from 'preact/hooks';
import { ui, invalidate } from '../store';
import { getBindings, type ActionId } from './bindings';
import { creatureViewsRef, targetManager } from '../cardnodes';
import { getCombatHand, endTurnHotkey, peekHotkey, pileHotkey, confirmHotkey } from '../ui/combat';
import { toggleCardsView, closeCardsView } from '../ui/pause';
import { topBarMapPressed, restoreMapControllerScroll, mapControllerNavigationAllowed, scrollMapWithController } from '../ui/map';
import { getInputDevice, setInputDevice, setControllerId, getKeyboardBindings, actionHint } from './hints';
import { RichText } from '../ui/richtext';
import { modalOpen } from '../ui/modal';
import { ftueActive } from '../ui/ftue';
import { edge } from '../view';
import { pingHotkey } from '../ui/combat-hud';
import { syncControllerFocus } from './peer-input';

// Controller state
let activeGamepadIndex: number | null = null;
let lastButtons: boolean[] = [];
let lastAxes: number[] = [];
let cursorActive = false;
let cursorX = 960;
let cursorY = 540;

// Combat hand selection state
let selectedHandIndex = 0;
let activeHand: any = null;
let selectedHolder: any = null;
let lastTarget: any = null;
let focusedControl: HTMLElement | null = null;

// Analog stick debounce / repeat timers
let stickXTimer = 0;
let navigationDirection = '';
let navigationTimer = 0;
const MAP_SELECTOR = '.map-screen .mp.travelable';
/** A stick acts like directional input here, including immediate input after releasing it. */
function stickDirection(dt: number, lx: number, ly: number, horizontalOnly = false) {
  const direction = Math.max(Math.abs(lx), horizontalOnly ? 0 : Math.abs(ly)) < 0.5 ? ''
    : horizontalOnly || Math.abs(lx) >= Math.abs(ly) ? (lx < 0 ? 'left' : 'right') : (ly < 0 ? 'up' : 'down');
  navigationTimer -= dt;
  if (direction !== navigationDirection) { navigationDirection = direction; navigationTimer = 0; }
  if (!direction || navigationTimer > 0) return null;
  navigationTimer = 0.25;
  return direction as 'up' | 'down' | 'left' | 'right';
}

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

function combatInputActive() {
  return ui.screen === 'run' && !ui.pauseOpen && !ui.subscreen && !ui.cardsView && !ui.mapOpen && !ui.overlays.length && !modalOpen() && !ftueActive() && !!document.querySelector('.combat .combat-ui');
}
function clearFocus(mouseTarget: EventTarget | null = null) {
  const focused = new Set<Element>(Array.from(document.querySelectorAll('.input-focus')));
  if (focusedControl?.isConnected) focused.add(focusedControl);
  focusedControl = null;
  focused.forEach(el => {
    el.classList.remove('input-focus');
    // A real mouse may already have entered this focused control before mousemove reaches window.
    // Keep its native hover; synthesizing leave here makes the first mouse click on a map node fail.
    if (!(mouseTarget instanceof Node && el.contains(mouseTarget))) (el.closest('.grid-holder') ?? el).dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }));
  });
  if (focused.size) virtualHovered = null;
}
const CONTROL_SELECTOR = 'button:not(:disabled), input:not(:disabled):not([type="hidden"]), a[href], [data-ctl]:not(.disabled):not(.nscrollbar), .mm-btn, .mm-profile, .settings-tab, .submenu-btn, .chs-btn, .game-btn.shown, .mp.travelable, .event-option, .anc-hitbox, .reward-btn, .bundle, .grid-holder .gh-card, .pause-btn, .vp-btn, .chs-arrow, .rest-btn, .chest-btn, .relic-holder-t, .merchant-btn, .shop-hit, .alt-btn, .view-upgrades, .sort-btn, .inspect-arrow, .ic-upgrade, .ftue-confirm, .cr-arrow, .ea-proceed, .invite-code-btn';
function navigationRoot(selector?: string): ParentNode {
  // Only the foremost layer owns focus. Screens underneath remain mounted for the original animations.
  const last = (selector: string) => Array.from(document.querySelectorAll<HTMLElement>(selector)).at(-1);
  if (modalOpen()) return document.querySelector('.modal-slot') ?? document;
  const dialog = last('.mp-join-modal-backstop'); if (dialog) return dialog.querySelector('.mp-join-dialog, .mp-settings-dialog') ?? dialog;
  const dropdown = last('.std-list'); if (dropdown) return dropdown;
  const inspect = last('.inspect-screen'); if (inspect) return inspect.closest('.stage-root') ?? inspect;
  if (ftueActive()) return last('.ftue') ?? document;
  if (ui.subscreen) return document.querySelector('.subscreen-root') ?? document;
  if (ui.pauseOpen) return last('.settings-screen, .pause-menu') ?? document;
  if (ui.cardsView) return last('.cards-screen, .mp-expanded') ?? document;
  if (ui.mapOpen) return document.querySelector('.map-screen') ?? document;
  if (ui.overlays.length) {
    const screen = last('.rewards-screen, .card-reward-screen, .choose-card-screen, .bundle-screen, .grid-screen');
    return screen?.querySelector('.grid-preview, .bundle-preview') ?? screen ?? document;
  }
  if (selector?.startsWith('.tb-')) return document;
  if (document.querySelector('.shop-inv.open')) return document.querySelector('.shop-inv.open')!;
  if (ui.screen === 'run') {
    const room = last('.event, .rest, .treasure, .shop');
    if (room) return room;
  }
  return document.querySelector('.stage-root') ?? document;
}
function navigationCandidates(selector: string) {
  const mapOnly = selector === MAP_SELECTOR;
  return Array.from(navigationRoot(selector).querySelectorAll<HTMLElement>(selector)).filter(el => {
    const r = el.getBoundingClientRect(), style = getComputedStyle(el);
    const scrollable = !!el.closest('.settings-panel, .scroll-area, .cg-scroll, .ncg-scroll, .std-list');
    return r.width > 0 && r.height > 0 && (r.bottom > 0 || mapOnly || scrollable) && (r.top < innerHeight || mapOnly || scrollable) && r.right > 0 && r.left < innerWidth
      && style.visibility !== 'hidden' && style.pointerEvents !== 'none' && !el.closest('.disabled, [aria-disabled="true"], [data-rebinding="true"]')
      && !(el instanceof HTMLInputElement && el.parentElement?.closest('[data-ctl]'));
  });
}
function focusControls(direction: 'up' | 'down' | 'left' | 'right', selector = CONTROL_SELECTOR, move = true) {
  const existing = focusedControl?.isConnected ? focusedControl : document.querySelector<HTMLElement>('.input-focus'), root = navigationRoot(selector);
  if (move && existing?.matches('.sts-bar') && root instanceof Node && root.contains(existing) && (direction === 'left' || direction === 'right')) {
    existing.dispatchEvent(new CustomEvent('controller-step', { detail: direction === 'left' ? -1 : 1 })); return;
  }
  if (!move && existing && root instanceof Node && root.contains(existing) && existing.matches(selector)
      && !existing.closest('.disabled, [aria-disabled="true"], [data-rebinding="true"]')
      && existing.getBoundingClientRect().width > 0 && getComputedStyle(existing).visibility !== 'hidden' && getComputedStyle(existing).pointerEvents !== 'none') {
    existing.classList.add('input-focus'); focusedControl = existing; return;
  }
  const candidates = navigationCandidates(selector);
  const focused = existing;
  const current = focused && candidates.includes(focused) ? focused : null;
  const origin = current?.getBoundingClientRect();
  const center = (el: HTMLElement) => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  let next = candidates.find(el => el.matches('.mp.travelable, .chs-btn.selected, .event-option, .rest-btn, .chest-btn, .relic-holder-t, .reward-btn, .gh-card, .bundle, .shop-hit, .mm-btn')) ?? candidates[0];
  if (current && !move) return;
  if (origin && move) {
    const x = origin.left + origin.width / 2, y = origin.top + origin.height / 2;
    const ranked = candidates.filter(el => el !== current).map(el => {
      const [cx, cy] = center(el), horizontal = direction === 'left' || direction === 'right';
      const along = horizontal ? cx - x : cy - y, across = Math.abs(horizontal ? cy - y : cx - x);
      const forward = direction === 'left' || direction === 'up' ? -along : along;
      return { el, forward, score: forward + across * 3 };
    }).filter(v => v.forward > 8).sort((a, b) => a.score - b.score);
    next = ranked[0]?.el ?? current ?? next;
    // NCardGrid.UpdateGridNavigation wraps horizontally within each row and preserves the column vertically.
    const grid = current?.closest('.cg-scroll, .ncg-scroll');
    if (grid && current?.matches('.gh-card')) {
      const rows = new Map<number, HTMLElement[]>();
      for (const card of candidates.filter(el => el.matches('.gh-card') && grid.contains(el))) {
        const top = parseFloat((card.closest('.grid-holder') as HTMLElement).style.top);
        const row = rows.get(top) ?? []; row.push(card); rows.set(top, row);
      }
      const sorted = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row.sort((a, b) => center(a)[0] - center(b)[0]));
      const rowIndex = sorted.findIndex(row => row.includes(current!)), row = sorted[rowIndex], col = row?.indexOf(current) ?? -1;
      if (row && col >= 0) {
        if (direction === 'left' || direction === 'right') next = row[(col + (direction === 'left' ? -1 : 1) + row.length) % row.length];
        else next = sorted[rowIndex + (direction === 'up' ? -1 : 1)]?.[col] ?? current;
      }
    }
  }
  if (next === current) { next?.classList.add('input-focus'); return; }
  clearFocus();
  next?.classList.add('input-focus');
  focusedControl = next ?? null;
  if (next) {
    const root = document.querySelector('.stage-root')!.getBoundingClientRect(), r = next.getBoundingClientRect();
    syncControllerFocus((r.left + r.width / 2 - root.left) / root.width * 1920, (r.top + r.height / 2 - root.top) / root.height * 1080);
    const dropdown = next.closest<HTMLElement>('.std-list');
    if (dropdown) {
      const box = dropdown.getBoundingClientRect(), bottom = Math.min(box.bottom, innerHeight - 8), top = Math.max(box.top, 0);
      dropdown.scrollTop += r.bottom > bottom ? r.bottom - bottom : r.top < top ? r.top - top : 0;
    } else if (next.closest('.settings-panel')) {
      const r = next.getBoundingClientRect(), root = document.querySelector('.stage-root')!.getBoundingClientRect(), scale = root.width / 1920;
      const upper = root.top + 200 * scale;
      const delta = r.bottom > innerHeight - 30 ? (r.bottom - innerHeight + 30) / scale : r.top < upper ? (r.top - upper) / scale : 0;
      if (delta) window.dispatchEvent(new CustomEvent('input-scroll', { detail: delta }));
    } else {
      const scroll = next.closest<HTMLElement>('.scroll-area, .cg-scroll, .ncg-scroll');
      if (scroll) {
        const box = scroll.getBoundingClientRect(), root = next.closest('.stage-root')!.getBoundingClientRect();
        const delta = r.bottom > box.bottom ? r.bottom - box.bottom + 20 : r.top < box.top ? r.top - box.top - 20 : 0;
        if (delta) scroll.dispatchEvent(new WheelEvent('wheel', { deltaY: delta / (root.width / 1920) + .01, bubbles: true }));
      }
    }
    (next.closest('.grid-holder') ?? next).dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
    if (next instanceof HTMLButtonElement) next.focus({ preventScroll: true });
  }
}
function navigateMap(direction: 'up' | 'down' | 'left' | 'right') {
  if (direction === 'up' || direction === 'down') scrollMapWithController(direction === 'up');
  else { restoreMapControllerScroll(); focusControls(direction, MAP_SELECTOR); }
}
window.addEventListener('pointerdown', e => { if (e.isTrusted) clearFocus(e.target); }, true);
window.addEventListener('mousemove', e => { if (e.isTrusted && (e.movementX || e.movementY)) clearFocus(e.target); }, true);
window.addEventListener('keydown', e => {
  if (ftueActive() || getInputDevice() !== 'keyboardOnly' || !e.isTrusted || (e.target as HTMLElement)?.matches('input, textarea, [contenteditable]')
      || document.querySelector('[data-rebinding="true"]')) return;
  const keys = getKeyboardBindings(), matches = (act: ActionId) => !!keys[act] && e.key.toLowerCase() === keys[act].toLowerCase();
  const directions = [['up', 'up'], ['down', 'down'], ['handPrev', 'left'], ['handNext', 'right']] as const;
  const direction = directions.find(([act]) => matches(act));
  if (direction || matches('select') || matches('topPanel')) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (combatInputActive()) handleCombatGamepad(1, 0, 0, matches);
    else if (direction && ui.mapOpen && mapControllerNavigationAllowed()) {
      navigateMap(direction[1]);
    }
    else if (direction) focusControls(direction[1]);
    else if (matches('topPanel')) focusControls('up', '.tb-map, .tb-deck, .tb-settings, .mp-player-state');
    else {
      const focused = document.querySelector<HTMLElement>('.input-focus');
      if (focused) activateControl(focused);
    }
    return;
  }
  if (matches('confirm') && !combatInputActive() && !modalOpen()) {
    const confirm = navigationRoot().querySelector<HTMLElement>('.confirm-btn.shown');
    if (confirm) { e.preventDefault(); e.stopImmediatePropagation(); activateControl(confirm); return; }
  }
  if ((matches('viewDeck') || matches('viewExhaust')) && document.querySelector('.settings-screen, .charselect, .coop-charselect')) {
    e.preventDefault(); e.stopImmediatePropagation();
    window.dispatchEvent(new CustomEvent('input-page', { detail: matches('viewDeck') ? -1 : 1 }));
  }
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
      if (getInputDevice() === 'gamepad') setInputDevice('keyboard');
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
      if (getInputDevice() !== 'gamepad') {
        getCombatHand()?.currentPlay?.CancelPlayCard();
        targetManager.CancelTargeting();
      }
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

    if (document.querySelector('[data-rebinding="true"]')) { lastButtons = btns; return true; }

    const bindings = getBindings().gamepad;
    const isActionJustPressed = (act: keyof typeof bindings) => {
      const b = bindings[act];
      return b !== null && justPressed(b);
    };

    const inCombat = combatInputActive();

    if (getInputDevice() !== 'gamepad') { lastButtons = btns; return true; }
    if (inCombat) {
      handleCombatGamepad(dt, lx, ly, isActionJustPressed);
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
  actionJustPressed: (act: ActionId) => boolean,
) {
  const hand = getCombatHand();
  if (activeHand !== hand) {
    activeHand = hand; selectedHolder = null; lastTarget = null;
    selectedHandIndex = Math.floor((hand?.ActiveHolders.length ?? 0) / 2);
    stickXTimer = 0;
  }
  const topFocus = document.querySelector<HTMLElement>('.top-bar .input-focus, .mp-player-states .input-focus');
  if (topFocus && !targetManager.IsInSelection) {
    if (actionJustPressed('select')) { activateControl(topFocus); return; }
    if (actionJustPressed('cancel') || actionJustPressed('topPanel')) { clearFocus(); return; }
    for (const [action, direction] of [['up', 'up'], ['down', 'down'], ['handPrev', 'left'], ['handNext', 'right']] as const) {
      if (actionJustPressed(action)) { focusControls(direction, '.tb-map, .tb-deck, .tb-settings, .mp-player-state'); return; }
    }
  }

  // NControllerCardPlay restricts navigation to valid, hittable enemies or allies.
  if (targetManager.IsInSelection) {
    const targets = creatureViewsRef.get().filter((n: any) => !n.slot?.hideBounds && n.Entity?.IsHittable && targetManager.AllowedToTargetNode(n)
      && G.Hook.ShouldAllowTargeting(n.Entity.CombatState, n.Entity, { v: null })).sort((a: any, b: any) => a.GlobalPosition.X - b.GlobalPosition.X);
    if (!targets.length) { targetManager.CancelTargeting(); return; }
    let index = targets.indexOf(targetManager.hovered);
    if (index < 0) { index = Math.max(0, targets.findIndex((n: any) => n.Entity === lastTarget)); }
    const direction = stickDirection(dt, lx, ly, true);
    if (actionJustPressed('handPrev') || direction === 'left') index = (index - 1 + targets.length) % targets.length;
    else if (actionJustPressed('handNext') || direction === 'right') index = (index + 1) % targets.length;
    const target = targets[index];
    if (targetManager.hovered !== target) targetManager.OnNodeHovered(target);
    const s = target.slot;
    if (s) syncControllerFocus(s.x + s.bl + s.w / 2, s.y + s.bt + s.h / 2);

    // Select plays a card; confirm/end turn are separate original actions.
    if (actionJustPressed('select')) {
      lastTarget = target.Entity;
      targetManager.ConfirmTargeting();
      return;
    }
    // Cancel targeting (B button)
    if (actionJustPressed('cancel') || actionJustPressed('topPanel')) {
      targetManager.CancelTargeting();
      return;
    }
    return;
  }

  if (actionJustPressed('select') && pingHotkey()) return;

  // Self/all-target cards use the same two-press preview/confirm flow as the original controller play.
  if (hand?.currentPlay?.directional) {
    if (actionJustPressed('select')) hand.currentPlay.ConfirmDirectionalPlay();
    else if (actionJustPressed('cancel') || actionJustPressed('topPanel')) hand.currentPlay.CancelPlayCard();
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
    const heldIndex = holders.indexOf(selectedHolder);
    if (heldIndex >= 0) selectedHandIndex = heldIndex;
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
    }
    selectedHolder = holders[selectedHandIndex];
    syncControllerFocus(selectedHolder.GlobalPosition.X, selectedHolder.GlobalPosition.Y);
    for (const holder of holders) holder.focus(holder === selectedHolder);

    // Play highlighted card (A button)
    if (actionJustPressed('select')) {
      const cur = holders[selectedHandIndex];
      if (cur) {
        navigationDirection = ''; navigationTimer = 0;
        hand.press(cur, false, true);
        // Keyboard-only input has no gamepad polling frame to choose its initial target.
        if (targetManager.IsInSelection) handleCombatGamepad(0, 0, 0, () => false);
        invalidate();
        return;
      }
    }
  }

  // Combat shortcuts
  if (actionJustPressed('topPanel')) { focusControls('up', '.tb-map, .tb-deck, .tb-settings, .mp-player-state'); return; }
  if (actionJustPressed('endTurn')) { // Y button -> End Turn
    endTurnHotkey()?.();
    return;
  }
  if (actionJustPressed('peek')) { // Left stick press -> Peek
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
  const mapNavigation = ui.mapOpen && !ui.pauseOpen && !ui.cardsView && !ui.overlays.length && !modalOpen() && !ftueActive() && mapControllerNavigationAllowed();
  if (mapNavigation) {
    if (!document.querySelector(MAP_SELECTOR + '.input-focus')) {
      restoreMapControllerScroll(); focusControls('right', MAP_SELECTOR, false);
    }
    const analog = stickDirection(dt, lx, ly);
    const direction = (['up', 'down', 'handPrev', 'handNext'] as const).find(actionJustPressed);
    if (analog || direction) {
      navigateMap(analog ?? (direction === 'handPrev' ? 'left' : direction === 'handNext' ? 'right' : direction!));
    }
    if (actionJustPressed('select')) {
      restoreMapControllerScroll();
      const focused = document.querySelector<HTMLElement>(MAP_SELECTOR + '.input-focus');
      if (focused) activateControl(focused);
    }
    if (Math.abs(ry) > 0.2) document.querySelector('.map-screen')?.dispatchEvent(new WheelEvent('wheel', { deltaY: ry * 35, bubbles: true, cancelable: true }));
    if (actionJustPressed('cancel')) simulateEscape();
    if (actionJustPressed('viewMap')) topBarMapPressed();
    if (actionJustPressed('viewDeck')) toggleCardsView('deck');
    return;
  }
  // Left stick and remapped directional buttons use the same focus graph. Right stick retains pointer access.
  focusControls('right', CONTROL_SELECTOR, false);
  const analog = stickDirection(dt, lx, ly);
  if (analog) focusControls(analog);
  // Move the optional virtual cursor with the right stick's horizontal axis.
  const speed = 1200; // pixels per second
  // A delayed frame must not jump over an entire control (or across the screen after tab resume).
  const cursorDt = Math.min(dt, 1 / 30);
  cursorX = Math.max(edge.l + 20, Math.min(edge.r - 20, cursorX + rx * speed * cursorDt));
  cursorY = Math.max(edge.t + 20, Math.min(edge.b - 20, cursorY + (rx ? ry * speed * cursorDt : 0)));
  if (rx) { clearFocus(); hoverElementUnderCursor(); }
  invalidate();

  // Scroll views with right stick (e.g. Map, Compendium, Settings)
  if (Math.abs(ry) > 0.2) {
    const el = document.querySelector<HTMLElement>('.input-focus') ?? getElementUnderCursor();
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
    // A chooses the focused Yes/No button; Y retains the modal's direct confirm action.
    if (actionJustPressed('confirm')) { window.dispatchEvent(new KeyboardEvent('keydown', { key: getKeyboardBindings().confirm, bubbles: true })); return; }
  }

  const onPageScreen = !!document.querySelector('.settings-screen, .charselect, .coop-charselect');
  if (onPageScreen && (actionJustPressed('viewDeck') || actionJustPressed('viewExhaust'))) {
    window.dispatchEvent(new CustomEvent('input-page', { detail: actionJustPressed('viewDeck') ? -1 : 1 }));
    return;
  }
  for (const [action, direction] of [['up', 'up'], ['down', 'down'], ['handPrev', 'left'], ['handNext', 'right']] as const) {
    if (actionJustPressed(action)) focusControls(direction);
  }
  // A selects the focused control or clicks under the virtual cursor.
  if (actionJustPressed('select')) {
    const focused = document.querySelector<HTMLElement>('.input-focus');
    if (focused) activateControl(focused); else clickElementUnderCursor();
  }
  if (actionJustPressed('confirm')) {
    const confirm = navigationRoot().querySelector<HTMLElement>('.confirm-btn.shown, .vp-btn.yes:not(.disabled)');
    if (confirm) activateControl(confirm);
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
  activateControl(el);
}

function activateControl(el: HTMLElement) {
  if (el.matches('.sts-bar')) return; // NSettingsSlider changes only on left/right navigation.
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
  // Give Preact's pressed state time to render before release; immediate synthetic down/up loses the release.
  requestAnimationFrame(() => {
    if (!el.isConnected) return;
    el.dispatchEvent(new PointerEvent('pointerup', evInit));
    // A normal click has detail=1. detail=0 would trigger BackButton's keyboard fallback a second time.
    el.dispatchEvent(new MouseEvent('click', { ...evInit, detail: 1 }));
    if (el instanceof HTMLInputElement) el.focus({ preventScroll: true });
  });
}

function simulateEscape() {
  if (modalOpen()) {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: getKeyboardBindings().cancel, bubbles: true }));
    return;
  }
  const dialogCancel = navigationRoot().querySelector<HTMLElement>('.mp-dialog-buttons .vp-btn.no');
  if (dialogCancel) { activateControl(dialogCancel); return; }
  const dropdownDismiss = document.querySelector('.std-list')?.closest('.st-drop')?.querySelector<HTMLElement>('.std-dismiss');
  if (dropdownDismiss) { activateControl(dropdownDismiss); return; }
  const closers = navigationRoot().querySelectorAll<HTMLElement>('[data-esc]');
  const close = closers[closers.length - 1];
  if (close) {
    close.click();
  } else if (ui.subscreen) {
    ui.subscreen = null;
  } else if (ui.cardsView) {
    closeCardsView();
  } else {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: getKeyboardBindings().cancel, bubbles: true }));
  }
  invalidate();
}

/**
 * Virtual cursor visual indicator rendered over the stage.
 */
export function VirtualCursor() {
  if (!cursorActive || getInputDevice() !== 'gamepad' || document.querySelector('.input-focus') || combatInputActive() || (ui.mapOpen && mapControllerNavigationAllowed() && !ui.pauseOpen && !ui.cardsView && !ui.overlays.length && !modalOpen() && !ftueActive())) return null;
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

/** The focused control's actual Select binding, using the original controller-family atlas. */
export function ControllerFocusHint() {
  const [at, setAt] = useState<{ x: number; y: number; hint: string; width: number } | null>(null);
  useEffect(() => $.onFrame(() => {
    const el = getInputDevice() === 'gamepad' ? document.querySelector<HTMLElement>('.input-focus') : null;
    const slider = el?.matches('.sts-bar'), width = slider ? 104 : 48;
    const hint = slider ? `${actionHint('handPrev')} ${actionHint('handNext')}` : actionHint('select');
    const r = el?.getBoundingClientRect();
    const popupButton = el?.matches('.vp-btn');
    const next = r && hint && !el?.querySelector('.input-button-hint') ? { x: Math.max(0, Math.min(innerWidth - width - 4, popupButton ? r.right - 24 : r.right + 6)), y: Math.max(0, Math.min(innerHeight - 48, popupButton ? r.bottom - 24 : r.top + r.height / 2 - 24)), hint, width } : null;
    setAt(prev => prev?.x === next?.x && prev?.y === next?.y && prev?.hint === next?.hint ? prev : next);
    return true;
  }), []);
  return at && <div class="controller-focus-hint" style={{ position: 'fixed', left: at.x, top: at.y, width: at.width, height: 48, pointerEvents: 'none', zIndex: 10000 }}><RichText text={at.hint.replaceAll('[img ', '[img size=48 ')} /></div>;
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
