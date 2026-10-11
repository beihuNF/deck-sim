/* eslint-disable @typescript-eslint/no-explicit-any */
import { G, $ } from '../game';
const V = $.ext('Godot.Vector2'), T = $.ext('Godot.Transform2D');
// The DOM stage's coordinates are already in the original 1920 x 1080 frame. Its centre is also the viewport centre.
export const peerInputRoot = { Size: new V(1920, 1080), GetGlobalTransformWithCanvas: () => T.Identity };
const focusPositions = new WeakMap<object, string>();
const controllerModes = new WeakMap<object, boolean>();
function setControllerMode(sync: any, controller: boolean) {
  if (controllerModes.get(sync) === controller) return;
  controllerModes.set(sync, controller);
  sync.SyncLocalIsUsingController(controller);
}
export function syncControllerFocus(x: number, y: number) {
  const sync = G.RunManager.Instance.InputSynchronizer;
  if (!sync || !G.RunManager.Instance.NetService?.IsConnected) return;
  const key = `${x},${y}`;
  setControllerMode(sync, true);
  if (focusPositions.get(sync) === key) return;
  focusPositions.set(sync, key);
  sync.SyncLocalControllerFocus(new V(x, y), peerInputRoot);
}
/** Original PeerInputSynchronizer performs its own 50 ms batching and packet serialization. */
export function trackPeerPointer(sync: any) {
  const move = (e: PointerEvent) => {
    if (!e.isPrimary) return;
    const r = document.querySelector('.stage-root')?.getBoundingClientRect();
    if (!r) return;
    setControllerMode(sync, false);
    sync.SyncLocalMousePos(new V((e.clientX - r.left) / r.width * 1920, (e.clientY - r.top) / r.height * 1080), peerInputRoot);
  };
  const down = (e: PointerEvent) => { move(e); if (e.isPrimary && e.button === 0) sync.SyncLocalMouseDown(true); };
  const up = (e: PointerEvent) => { move(e); if (e.isPrimary && e.button === 0) sync.SyncLocalMouseDown(false); };
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerdown', down, true);
  window.addEventListener('pointerup', up, true);
  return () => {
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerdown', down, true);
    window.removeEventListener('pointerup', up, true);
  };
}
