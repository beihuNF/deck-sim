import { render } from 'preact';
import './style.css';
import { G, $ } from './game';
import { ui, setRenderer, startLoop, invalidate, type Screen } from './store';
import { DevConsole } from './ui/devconsole'; // before the modules below: its key listener must be the first one registered
import { loadAssetIndex } from './assets';
import { preloadLocalization, addListedFiles, appText } from './i18n';
import { sceneIndex } from './render/scene';
import { installFilters } from './filters';
import { installBridge } from './bridge';
import { unlockAll } from './flow';
import { initAnalytics, reportError, trackUncleanExits } from './analytics';
import { mobileRendering } from './render/quality';
import { acquireSaveLock, saveMetadata } from './saves';
import './render/vfx-cards';
import './render/vfx-attacks';
import './render/vfx-misc';
import { loadAudioIndex, setVolumes, resolveSfx } from './audio';
import { MainMenu } from './ui/menu';
import { RunScreen } from './ui/run';
import { combatHotkey } from './ui/combat';
import { Tip } from './ui/tooltip';
import { openPauseMenu, toggleCardsView, closeCardsView } from './ui/pause';
import { ftueActive } from './ui/ftue';
import { InspectLayer, inspectActive } from './ui/cards-view';
import { loadShader, prewarmShaders } from './render/canvas';
import { fullScreenScene, loadScene } from './render/scene';
import { getApp, gpuDetails } from './render/stage';
import { BootScreen } from './ui/boot-screen';
import { updateBootProgress, logoDonePromise, finishLogo } from './render/boot-status';
import { Backdrop } from './ui/backdrop';
import { CardLibrary, RelicCollection, PotionLab } from './ui/compendium';
import { Stats } from './ui/stats';
import { RunHistory } from './ui/history';
import { TransitionLayer, transitionView } from './ui/transition';
import { ModalLayer } from './ui/modal';
import { FeedbackScreen, feedbackOpen } from './ui/feedback';
import { topBarMapPressed } from './ui/map';
import { fit, turned } from './view';
import { getKeyboardBindings } from './input/hints';
import { initGamepadLoop, VirtualCursor, GamepadToast, ControllerFocusHint, ControllerSelectionReticle } from './input/gamepad';
import './anchors.css'; // last: it adjusts what the other stylesheets place

initGamepadLoop();

window.addEventListener('resize', () => { fit(); invalidate(); });
// While turned, page coordinates are reported as the unturned stage sees them (x = page y, y = width − page x), so
// every client → stage conversion in the views (and Pixi's) stays as written.
// ponytail: patches DOM prototypes; move to explicit stage-coordinate helpers if another transform is ever needed
{
  const P = MouseEvent.prototype;
  const orig = (k: string) => Object.getOwnPropertyDescriptor(P, k)!.get as (this: MouseEvent) => number;
  const cx = orig('clientX'), cy = orig('clientY'), mx = orig('movementX'), my = orig('movementY');
  const def = (k: string, get: (this: MouseEvent) => number) => Object.defineProperty(P, k, { get, configurable: true, enumerable: true });
  def('clientX', function () { return turned ? cy.call(this) : cx.call(this); });
  def('clientY', function () { return turned ? window.innerWidth - cx.call(this) : cy.call(this); });
  def('movementX', function () { return turned ? my.call(this) : mx.call(this); });
  def('movementY', function () { return turned ? -mx.call(this) : my.call(this); });
  const rect = Element.prototype.getBoundingClientRect;
  // Some WebKit versions omit CSS zoom from DOM rects, but pointer coordinates still use viewport pixels.
  // Detect the behavior rather than the browser: newer WebKit and other engines already include zoom.
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;width:1px;height:1px;zoom:2;visibility:hidden';
  document.body.append(probe);
  const unscaledZoomRects = getComputedStyle(probe).zoom === '2' && rect.call(probe).width === 1;
  probe.remove();
  Element.prototype.getBoundingClientRect = function () {
    let r = rect.call(this);
    const stage = unscaledZoomRects ? this.closest('.stage-root') : null;
    if (stage) {
      const zoom = Number(getComputedStyle(stage).zoom);
      r = new DOMRect(r.x * zoom, r.y * zoom, r.width * zoom, r.height * zoom);
    }
    // Normalize zoom before rotating back, since the rotation offset is in viewport pixels too.
    return turned ? new DOMRect(r.top, window.innerWidth - r.right, r.height, r.width) : r;
  };
}
// a finger captures its pointer to the element it lands on, so a dragged card would never enter the enemy under it:
// released, touch drags hover what they pass over like the mouse
window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') (e.target as Element).releasePointerCapture?.(e.pointerId); }, true);
// Prevent native browser drag-and-drop ghost images on images, links, and text
window.addEventListener('dragstart', (e) => {
  if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault();
});

/** NInputManager defaults outside Escape: A/S/X/D open the draw/discard/exhaust piles and the deck, M the map. */
function runHotkey(key: string): boolean {
  if (ui.screen !== 'run' || ui.pauseOpen || ui.subscreen || ftueActive()) return false;
  if (combatHotkey(key)) return true;
  const k = key.toLowerCase();
  const b = getKeyboardBindings();
  if (k === b.viewDeck.toLowerCase()) {
    toggleCardsView('deck');
    invalidate();
    return true;
  } else if (k === b.viewMap.toLowerCase() && !ui.gameOver && ui.room?.kind !== 'maproom') {
    topBarMapPressed();
    invalidate();
    return true;
  }
  return false;
}
const SCREENS: Partial<Record<Screen, () => any>> = {
  library: CardLibrary, relics: RelicCollection, potions: PotionLab,
  history: RunHistory, stats: Stats,
};
/** A routed screen as its own component (keyed), so its hooks never mix with App's or another screen's. */
function ScreenView({ s }: { s: Screen }) { const S = SCREENS[s]; return S ? <S key={s} /> : null; }
// the right mouse button is a game input (cancel a play, inspect a card, draw on the map): never the browser's menu
window.addEventListener('contextmenu', (e) => e.preventDefault(), true);
// Escape closes the topmost panel; in a run with nothing open it brings up the pause menu (NHotkeyManager "pause")
window.addEventListener('keydown', (e) => {
  const el = e.target as HTMLElement;
  const isTyping = el?.tagName === 'TEXTAREA' || (el?.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes((el as HTMLInputElement).type));
  if (isTyping) return;

  // Tab 键在浏览器中默认会在页面各个可聚焦元素间移动焦点，导致游戏内按键失焦或被截获；只要不在打字输入，一律拦截默认行为
  if (e.key === 'Tab') e.preventDefault();

  // NPeekButton's hotkey (MegaInput.peek = Space) on an overlay screen that has one
  const top = ui.overlays[ui.overlays.length - 1];
  const b = getKeyboardBindings();
  if (e.key.toLowerCase() === b.peek.toLowerCase() && ui.screen === 'run' && top?.peekEnabled) {
    e.preventDefault();
    if (!e.repeat) top.togglePeek();
    return;
  }
  if (e.key.toLowerCase() !== b.cancel.toLowerCase()) {
    if (runHotkey(e.key)) e.preventDefault();
    return;
  }
  e.preventDefault();
  const closers = document.querySelectorAll<HTMLElement>('[data-esc]'); // inner modals (card inspect) mark their close control
  const close = closers[closers.length - 1];
  if (close) { close.click(); return; }
  else if (ui.subscreen) ui.subscreen = null;
  else if (ui.cardsView) closeCardsView();
  else if (ui.screen === 'run' && !ui.gameOver && !ui.pauseOpen) openPauseMenu();
  invalidate();
});
// dev only: ?scene=scenes/rest_site/hive_rest_site.tscn shows one converted scene full-screen (renderer checks)
const debugScene = import.meta.env.DEV ? new URLSearchParams(location.search).get('scene') : null;
function App() {
  // AbstractMegaRichTextEffect: PrefsSave.TextEffectsEnabled turns wavy / shaky text off
  document.body.classList.toggle('no-text-fx', !tryOr(() => G.SaveManager.Instance.PrefsSave.TextEffectsEnabled, true));
  if (debugScene && ui.screen !== 'boot') return <div class="viewport"><div class="stage-root"><Backdrop id={debugScene} build={() => fullScreenScene(debugScene)} /></div></div>;
  return (
    <>
      <div class="viewport">
        <div class="stage-root">
          {ui.screen === 'boot' && <BootScreen />}
          {ui.screen === 'menu' && <MainMenu />}
          {ui.screen === 'run' && <RunScreen />}
          <ScreenView s={ui.screen} />
          <VirtualCursor />
        </div>
      </div>
      <TransitionLayer />
      {ui.subscreen && <div class="viewport"><div class="stage-root subscreen-root"><ScreenView s={ui.subscreen} /></div></div>}
      {inspectActive() && <div class="viewport"><div class="stage-root settings-root"><InspectLayer /></div></div>}
      {/* NGame.FeedbackScreen: over everything but popups */}
      {feedbackOpen() && <div class="viewport"><div class="stage-root settings-root"><FeedbackScreen /></div></div>}
      <ModalLayer />
      <Tip />
      {ui.toast && <div class="toast" onClick={() => { ui.toast = ''; invalidate(); }}>{ui.toast}</div>}
      <GamepadToast />
      <ControllerSelectionReticle />
      <ControllerFocusHint />
      <DevConsole />
    </>
  );
}

async function boot() {
  fit();
  const root = document.getElementById('app')!;
  setRenderer(() => render(<App />, root));
  startLoop();
  installFilters();
  // tables must be fetched before init; the last chosen language is mirrored outside the (not yet loaded) SettingsSave,
  // and until one is chosen the device's language applies
  const lang = new URLSearchParams(location.search).get('lang') ?? safeGet('sts2web.lang') ?? G.platformLanguage(navigator.languages);

  updateBootProgress({
    progress: 10,
    title: appText('bootInitializingGpu', lang),
    detail: 'WebGL 2.0 (High-Performance GPU)',
  });

  // 并行启动 GPU 渲染管线
  const gpuInitPromise = getApp().then(() => {
    const gpuName = gpuDetails?.renderer || 'WebGL 2.0';
    const gpuMode = gpuDetails?.isSoftware ? 'CPU Rasterizer' : 'Hardware Accelerated';
    updateBootProgress({
      gpuInfo: `GPU: ${gpuName} (${gpuMode})`,
    });
  }).catch(() => {});

  await swClaimed;
  updateBootProgress({
    progress: 20,
    detail: 'Loading Assets & Localization Tables…',
  });

  await Promise.all([
    gpuInitPromise,
    loadAssetIndex(),
    preloadLocalization(lang === 'eng' ? ['eng'] : ['eng', lang]),
    sceneIndex().then(addListedFiles),
    loadAudioIndex(),
  ]);

  $.setGodotLogSink((level: string, msg: string) => (level === 'error' ? console.error(msg) : level === 'warn' ? console.warn(msg) : undefined));
  installBridge();

  // 着色器缓存预热 (Prewarm Shader Cache)
  updateBootProgress({
    progress: 35,
    title: appText('bootPrewarmingShaders', lang),
    detail: 'Compiling GPU Shaders…',
  });

  await prewarmShaders((cur, total, name) => {
    const p = 35 + Math.round((cur / total) * 40);
    updateBootProgress({
      progress: p,
      title: appText('bootPrewarmingShaders', lang),
      detail: `${name} (${cur}/${total})`,
    });
  });

  // GPU 纹理与核心场景预热
  updateBootProgress({
    progress: 80,
    title: appText('bootPreloadingAssets', lang),
    detail: 'Menu Background & Scene Visuals',
  });

  try { await loadScene('scenes/backgrounds/mainmenu/main_menu_background'); } catch {}

  // 挂载存档并初始化规则层
  updateBootProgress({
    progress: 90,
    title: appText('bootMountingSave', lang),
    detail: 'Mounting IndexedDB Virtual File System…',
  });

  let warned = false;
  $.setStorageErrorHandler((path: string, err: unknown) => {
    console.error('save write failed', path, err);
    if (!warned) { warned = true; ui.toast = appText('storageFull'); invalidate(); }
  });
  if (!await acquireSaveLock()) {
    setRenderer(() => render(<div class="boot">{appText('saveTabOpen', lang)}<br /><button onClick={() => location.reload()}>{appText('reloadGame', lang)}</button></div>, root));
    invalidate();
    return;
  }
  // after the lock: a second tab must not take the running one's mark for its own crash
  trackUncleanExits(() => ({ screen: ui.screen, room: ui.room?.kind ?? null, mobile: mobileRendering, memory: (navigator as any).deviceMemory ?? null }));
  await $.vfs.mount(); // saves live in IndexedDB (localStorage ones migrate on first run)
  G.initGame({});
  // players only get Normal/Fast (NFastModeTickbox); Instant is a test mode in which some event animation loops spin
  const prefs = G.SaveManager.Instance.PrefsSave;
  if (prefs.FastMode === G.FastModeType.Instant) prefs.FastMode = G.FastModeType.Fast;
  if (!$.vfs.persistent) ui.toast = appText('noStorage');
  const st = G.SaveManager.Instance.SettingsSave;
  fit(); // SettingsSave.AspectRatioSetting is known now
  setVolumes({ master: st.VolumeMaster, music: st.VolumeBgm, sfx: st.VolumeSfx, amb: st.VolumeAmbience });
  // always: a saved SettingsSave.Language may differ from the tables fetched above (the device's language changed)
  G.SaveManager.Instance.SettingsSave.Language = lang;
  G.LocManager.Instance.SetLanguage(lang);
  document.documentElement.dataset.lang = lang; // style.css: FontManager's per-language font substitution

  if (st.SkipIntroLogo) {
    finishLogo();
  }

  updateBootProgress({
    progress: 100,
    ready: true,
    title: appText('bootReady', lang),
    detail: 'Launching…',
  });

  // 等待原版开场 Logo 动画播放完毕或用户跳过
  await logoDonePromise;

  await new Promise((r) => setTimeout(r, 60));
  await transitionView.FadeOut(); // NGame.LaunchMainMenu: after the logo animation, before the menu fades in
  ui.screen = 'menu';
  invalidate();
  (window as any).G = G;
  (window as any).ui = ui;
  (window as any).unlockAll = () => unlockAll(true);
  (window as any).invalidate = invalidate;
  if (import.meta.env.DEV) Object.assign(window, { __loadShader: loadShader, __resolveSfx: resolveSfx }); // tools/e2e/shaders.mjs, audio.mjs
  // NGame._Notification(WM_CLOSE_REQUEST) → Quit: closing the tab saves settings, prefs, progress and the profile
  const saveOnHide = () => {
    if ($.vfs.restored) return;
    $.vfs.setUnloading(true);
    try { saveMetadata(); } catch (e) { console.warn('save on hide', e); }
  };
  window.addEventListener('pageshow', (e) => { if (e.persisted) $.vfs.setUnloading(false); });
  window.addEventListener('pagehide', saveOnHide);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveOnHide(); else $.vfs.setUnloading(false); });
  const qs = new URLSearchParams(location.search);
  if (qs.get('unlock') === 'all') unlockAll(true);
  if (qs.get('tutorials') === 'off') { G.SaveManager.Instance.SetFtuesEnabled(false); G.SaveManager.Instance.SettingsSave.SeenEaDisclaimer = true; }
  window.dispatchEvent(new Event('sts2:boot-ready'));
}
// offline cache (production builds only; the dev server serves modules that must not be cached). Boot waits (briefly)
// for the worker to claim the page when no worker serves this build's asset tree yet: on a first visit, so the assets
// are fetched once, through it — cached, under the versioned URLs the CDN keeps — rather than once now and again by
// the worker on the next visit; and on the first load after the assets changed, so none come from the old worker's cache.
const swClaimed = !import.meta.env.PROD || !('serviceWorker' in navigator) ? null : (async () => {
  const sw = navigator.serviceWorker;
  // the registration, not the controller: a reload that bypasses the worker (shift-reload) has no controller
  const current = (await sw.getRegistration().catch(() => null))?.active?.scriptURL.endsWith(`a=${__ASSETS_ID__}`);
  await new Promise<void>((done) => {
    sw.addEventListener('controllerchange', () => done(), { once: true });
    sw.register(`./sw.js?v=${__BUILD_ID__}&a=${__ASSETS_ID__}`).catch(() => done());
    if (current) done(); else setTimeout(done, 3000);
  });
})();
initAnalytics();
window.addEventListener('error', (e) => reportError('uncaught', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => reportError('rejection', e.reason));
function tryOr<T>(f: () => T, d: T) { try { return f() ?? d; } catch { return d; } }
function safeGet(k: string) { try { return localStorage.getItem(k); } catch { return null; } }
boot().catch((e) => {
  console.error(e);
  reportError('boot', e);
  document.getElementById('app')!.innerHTML = `<pre class="fatal">${String(e?.stack ?? e)}</pre>`;
});
