// App-level flow: starting runs, returning to menu. Mirrors NGame without scene loading.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { G, $, list } from './game';
import { ui, invalidate } from './store';
import { attachRun } from './bridge';
import { loc } from './i18n';
import { resetCombatUi } from './ui/combat';
import { resetMap } from './ui/map';
import { stopMusic, stopAmbience, stopAllLoops, playOneShot } from './audio';
import { transitionView } from './ui/transition';

const stopAudio = () => { stopMusic(); stopAmbience(); stopAllLoops(); };

export let run: any = null;
let currentCoopRunParams: {
  players: any[];
  seed: string;
  net: any;
  mode: string;
  settings: any;
  onStateDiverged: () => void;
} | null = null;

export async function startCoopRun(players: any[], seed: string, net: any, mode = 'standard', settings = { ascension: 0, modifiers: [] as string[], dailyDate: '' }, onStateDiverged: () => void = () => {}) {
  currentCoopRunParams = { players, seed, net, mode, settings, onStateDiverged };
  await G.SaveManager.Instance.CurrentRunSaveTask;
  await $.vfs.beginEphemeralSession();
  stopAudio();
  await transitionView.FadeOut(0.6);
  resetUi();
  ui.menuStack = [];
  await G.startWebMultiplayerRun(players, seed, net, (rs: any) => {
    // The original host disconnect casts to NetHostGameService; the browser transport needs its own exit path.
    const tracker = G.RunManager.Instance.ChecksumTracker;
    tracker.StateDiverged = $.dcombine(tracker.StateDiverged, onStateDiverged);
    run = rs; attachRun(rs);
  }, mode,
    settings.ascension, G.webRunModifiers(settings.modifiers), mode === 'daily' ? settings.dailyDate : null);
  invalidate();
  await transitionView.FadeIn(0.4);
}

/** 恢复载入多人游戏存盘（断点续玩） */
export async function loadSavedCoopRun(players: any[], net: any, saveJson?: string, onStateDiverged: () => void = () => {}) {
  await G.SaveManager.Instance.CurrentRunSaveTask;
  await $.vfs.beginEphemeralSession();
  stopAudio();
  await transitionView.FadeOut(0.6);
  resetUi();
  ui.menuStack = [];
  let save: any = null;
  if (saveJson) {
    save = G.deserializeWebRunSave(saveJson);
  }
  await G.continueWebMultiplayerRun(players, net, (rs: any) => {
    const tracker = G.RunManager.Instance.ChecksumTracker;
    tracker.StateDiverged = $.dcombine(tracker.StateDiverged, onStateDiverged);
    run = rs;
    attachRun(rs);
  }, save);
  currentCoopRunParams = {
    players,
    seed: save?.Seed ?? '',
    net,
    mode: 'load',
    settings: { ascension: save?.Ascension ?? 0, modifiers: [], dailyDate: '' },
    onStateDiverged,
  };
  invalidate();
  await transitionView.FadeIn(0.4);
}

/** 多人快速SL：重开当前房间/战斗，全员基于房主广播的存档快照原地重新加载。 */
export async function quickReloadCoopRun(saveJson?: string): Promise<boolean> {
  if (!currentCoopRunParams) return false;
  const rm = G.RunManager.Instance;
  try {
    await G.SaveManager.Instance.CurrentRunSaveTask;
    await $.vfs.flush();
    safe(() => rm.ActionQueueSet?.Reset());
    stopAudio();
    await transitionView.FadeOut(0.4);
    try { rm.CleanUp(true); } catch (e) { console.warn(e); }
    run = null;
    ui.pauseOpen = false;
    resetUi();
    let save: any = null;
    if (saveJson) {
      save = G.deserializeWebRunSave(saveJson);
    }
    const rs = await G.continueWebMultiplayerRun(
      currentCoopRunParams.players,
      currentCoopRunParams.net,
      (newRunState: any) => {
        const tracker = G.RunManager.Instance.ChecksumTracker;
        tracker.StateDiverged = $.dcombine(tracker.StateDiverged, currentCoopRunParams!.onStateDiverged);
        run = newRunState;
        attachRun(newRunState);
      },
      save,
    );
    if (!rs) {
      ui.screen = 'menu';
      ui.toast = loc('main_menu_ui', 'INVALID_SAVE_POPUP.description_run');
    }
    invalidate();
    await transitionView.FadeIn(0.4);
    return !!rs;
  } catch (e) {
    console.error('Quick reload coop run failed', e);
    invalidate();
    await transitionView.FadeIn(0.4);
    return false;
  }
}
function resetUi() {
  ui.screen = 'run';
  ui.room = null;
  ui.overlays = [];
  ui.gameOver = null;
  resetMap();
  resetCombatUi();
  invalidate();
}
export interface RunOptions { ascension?: number; seed?: string | null; modifiers?: any[]; dailyTime?: any }
/** NCharacterSelectScreen / NCustomRunScreen / NDailyRunScreen → NGame.StartNewSingleplayerRun. */
export async function startRun(character: any, o: RunOptions = {}) {
  resetUi();
  ui.menuStack = [];
  const seed = o.seed || new URLSearchParams(location.search).get('seed') || G.SeedHelper.GetRandomSeed(null, 12);
  if (G.RandomCharacter && character instanceof G.RandomCharacter) character = rollRandomCharacter();
  // StartRunLobby.UpdatePreferredAscension: remember the level picked for this character (not for dailies)
  if (!o.dailyTime && o.ascension != null) safe(() => { G.SaveManager.Instance.Progress.GetOrCreateCharacterStats(character.Id).PreferredAscension = o.ascension; });
  await G.startNewSingleplayerRun({
    character, seed, shouldSave: true, ascension: o.ascension ?? 0, modifiers: o.modifiers ?? [], dailyTime: o.dailyTime,
    attach: (rs: any) => { run = rs; attachRun(rs); },
  });
  invalidate();
}
/** NCharacterSelectScreen.RollRandomCharacter: any unlocked character. */
function rollRandomCharacter() {
  const unlocked = list(G.SaveManager.Instance.GenerateUnlockStateFromProgress().Characters);
  return unlocked[Math.floor(Math.random() * unlocked.length)];
}
const safe = (f: () => void) => { try { f(); } catch (e) { console.warn(e); } };
/**
 * Full unlock, written to the progress save: every epoch revealed and ascension 10. `discover` also applies the dev
 * console's `unlock all` (UnlockConsoleCmd) discoveries: everything marked seen and a win for monsters with no records.
 */
export function unlockAll(discover = false) {
  const sm = G.SaveManager.Instance, p = sm.Progress;
  if (discover) {
    for (const c of list(G.ModelDb.AllCards)) p.MarkCardAsSeen(c.Id);
    for (const r of list(G.ModelDb.AllRelics)) p.MarkRelicAsSeen(r.Id);
    for (const x of list(G.ModelDb.AllPotions)) p.MarkPotionAsSeen(x.Id);
    for (const e of list(G.ModelDb.AllEvents)) p.MarkEventAsSeen(e.Id);
    for (const m of list(G.ModelDb.Monsters)) {
      const s = p.GetOrCreateEnemyStats(m.Id);
      if (s.FightStats.Count === 0) s.FightStats.Add(Object.assign(new G.FightStats().$ctor_FightStats(), { Character: G.ModelDb.Character(G.Ironclad).Id, Wins: 1 }));
    }
  }
  const revealed = new Set(list(p.Epochs).filter((e: any) => e.State === G.EpochState.Revealed).map((e: any) => e.Id));
  for (const id of list(G.EpochModel.AllEpochIds)) if (!revealed.has(id)) sm.ObtainEpochOverride(id, G.EpochState.Revealed);
  p.MaxMultiplayerAscension = 10;
  for (const c of list(G.ModelDb.AllCharacters)) p.GetOrCreateCharacterStats(c.Id).MaxAscension = 10;
  sm.SaveProgressFile();
  invalidate();
}
/**
 * NMainMenu.OnContinueButtonPressedAsync: the character's wipe (sfx + transition material), then rebuild the saved run,
 * re-enter its latest map point and fade in.
 */
export async function continueRun() {
  stopMusic();
  const save = (() => { try { return G.SaveManager.Instance.LoadRunSave()?.SaveData; } catch { return null; } })();
  const ch = (() => { try { return G.ModelDb.GetById(G.CharacterModel, save.Players[0].CharacterId); } catch { return null; } })();
  if (ch) {
    playOneShot(ch.CharacterTransitionSfx);
    await transitionView.FadeOut(0.8, ch.CharacterSelectTransitionPath);
  }
  resetUi();
  ui.menuStack = [];
  const rs = await G.continueSavedRun((runState: any) => { run = runState; attachRun(runState); });
  if (!rs) { ui.screen = 'menu'; ui.toast = loc('main_menu_ui', 'INVALID_SAVE_POPUP.description_run'); }
  invalidate();
  await transitionView.FadeIn();
}
/** 快速SL：保存当前进度并原地重新进入当前房间，无需返回主菜单。 */
export async function quickReloadRun(): Promise<boolean> {
  if ($.vfs.ephemeral) return false;
  const rm = G.RunManager.Instance;
  if (!rm.IsInProgress) return false;
  try {
    // 等待当前存档写入完成并同步到 VFS
    await G.SaveManager.Instance.CurrentRunSaveTask;
    await $.vfs.flush();
    safe(() => rm.ActionQueueSet.Reset());
    stopAudio();
    await transitionView.FadeOut(0.4);
    try { rm.CleanUp(true); } catch (e) { console.warn(e); }
    run = null;
    resetUi();
    const rs = await G.continueSavedRun((runState: any) => { run = runState; attachRun(runState); });
    if (!rs) {
      ui.screen = 'menu';
      ui.toast = loc('main_menu_ui', 'INVALID_SAVE_POPUP.description_run');
    }
    invalidate();
    await transitionView.FadeIn(0.4);
    return !!rs;
  } catch (e) {
    console.error('Quick reload run failed', e);
    invalidate();
    await transitionView.FadeIn(0.4);
    return false;
  }
}
export function abandonRun() { G.abandonSavedRun(); invalidate(); }
/** NGame.ReturnToMainMenu: fade to black, clean up the run, load the main menu (which fades itself in). */
export async function toMenu() {
  if ($.vfs.ephemeral) {
    try { await $.vfs.flush(); } catch (e) { console.warn('Failed to flush VFS on exit', e); }
    location.reload();
    return;
  }
  await transitionView.FadeOut();
  try { G.RunManager.Instance.CleanUp(true); } catch (e) { console.warn(e); }
  run = null;
  ui.screen = 'menu';
  ui.room = null;
  ui.overlays = [];
  ui.gameOver = null;
  resetMap();
  ui.live = false;
  ui.menuStack = [];
  resetCombatUi();
  stopAudio();
  invalidate();
}
