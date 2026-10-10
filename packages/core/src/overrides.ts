// Hand-written replacements for generated members whose C# semantics JS numbers cannot express (int32 overflow etc.).
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as G from './gen/sts2';
import { ext, stubOf, headless, dcombine, dremove, getType } from './rt/core';
import { toSignal, vfs, nextFrame } from './rt/godot';
import { toTask } from './rt/task';
import { WebTween } from './rt/tween';
import { Random } from './rt/bcl';
import { Dictionary } from './rt/collections';
import { saveReadCompatibility, retainSaveMember } from './rt/json';

const g = G as any;
// The generated instance method-group delegate drops HandleMessage<T>'s runtime type argument.
// Recover it at the callback boundary so location-targeted co-op actions reach their registered handlers.
const handleLocationMessage = g.RunLocationTargetedMessageBuffer.prototype.HandleMessage;
g.RunLocationTargetedMessageBuffer.prototype.HandleMessage = function (...args: any[]) {
  if (args.length === 2) return handleLocationMessage.call(this, getType(args[0]), args[0], args[1]);
  return handleLocationMessage.apply(this, args);
};
// The beta moved play-phase ownership to the action synchronizer. Keep the web
// view's phase query tied to that state, including setup and turn transitions.
Object.defineProperty(g.CombatManager.prototype, 'IsPlayPhase', {
  get() { return this.IsInProgress && g.RunManager.Instance.ActionQueueSynchronizer?.CombatState === g.ActionSynchronizerCombatState.PlayPhase; },
  configurable: true,
});
const stringExtensions = ext('Godot.StringExtensions') as any;
stringExtensions.PathJoin = (base: string, file: string) => base ? base.replace(/\/$/, '') + '/' + file.replace(/^\//, '') : file;

/** v0.98.3's UTF-16/int32 hash remains necessary for existing RNG streams. New runs use upstream XXH64. */
g.StringHelper.GetDeterministicHashCodeOld = (s: string): number => {
  let a = 352654597, b = a;
  for (let i = 0; i < s.length; i += 2) {
    a = ((a << 5) + a) ^ s.charCodeAt(i);
    a |= 0;
    if (i === s.length - 1) break;
    b = ((b << 5) + b) ^ s.charCodeAt(i + 1);
    b |= 0;
  }
  return (a + Math.imul(b, 1566083941)) | 0;
};

/** .NET Random stream used by shipped web saves. Persist seed+counter alongside the new DTO. */
class LegacyRandom extends Random {
  constructor(readonly legacySeed: number, counter = 0) {
    super(legacySeed | 0);
    for (let i = 0; i < counter; i++) this.Next();
  }
  FillSerializableState(save: any) {
    save.LegacySeed = this.legacySeed;
    retainSaveMember(save, 'LegacySeed');
  }
  Next$1(max: number) { return this.Next(max); }
  Next$2(min: number, max: number) { return this.Next(min, max); }
}
const legacySeeds = new Set<number>();
saveReadCompatibility['MegaCrit.Sts2.Core.Saves.SerializableRun'] = (save: any, raw: any) => {
  if (!('GameMode' in raw)) save.GameMode = save.DailyTime != null ? g.GameMode.Daily : save.Modifiers.length ? g.GameMode.Custom : g.GameMode.Standard;
};
const legacyRng = (seed: number, counter = 0) => {
  const rng = new g.Rng().$ctor_Rng$UInt64(0);
  rng._random = new LegacyRandom(seed >>> 0, counter);
  rng._counter = counter;
  return rng;
};
for (const [fullName, enumType, run] of [
  ['MegaCrit.Sts2.Core.Saves.Runs.SerializableRunRngSet', g.RunRngType, true],
  ['MegaCrit.Sts2.Core.Saves.SerializablePlayerRngSet', g.PlayerRngType, false],
] as const) {
  saveReadCompatibility[fullName] = (save: any, raw: any) => {
    if (!raw.Counters || raw.Rngs) return;
    const seed = run ? g.StringHelper.GetDeterministicHashCodeOld(save.Seed) >>> 0 : save.Seed;
    save.Rngs = new Dictionary();
    for (const type of (ext('System.Enum') as any).GetValues(enumType)) {
      const name = g.StringHelper.SnakeCase(enumType[type]);
      const rng = legacyRng((seed + g.StringHelper.GetDeterministicHashCodeOld(name)) >>> 0, save.Counters.get_Item(type));
      save.Rngs.set_Item(type, rng.ToSerializable());
    }
  };
}
const rngProto = g.Rng.prototype;
const restoreRng = rngProto.$ctor_Rng$SerializableRng;
rngProto.$ctor_Rng$SerializableRng = function (save: any) {
  if (save.LegacySeed == null) return restoreRng.call(this, save);
  this.$fi_Rng();
  this._counter = save.counter;
  this._random = new LegacyRandom(save.LegacySeed, save.counter);
  return this;
};
const loadRng = rngProto.LoadFromSerializable;
rngProto.LoadFromSerializable = function (save: any) {
  if (save.LegacySeed != null) this.$ctor_Rng$SerializableRng(save);
  else loadRng.call(this, save);
};
for (const [type, from] of [[g.RunRngSet, 'FromSave'], [g.PlayerRngSet, 'FromSerializable']] as const) {
  const load = type[from], write = type.prototype.ToSerializable;
  type[from] = function (save: any) {
    const result = load.call(this, save);
    if (Array.from(save.Rngs.Values).some((r: any) => r.LegacySeed != null)) {
      const seed = type === g.RunRngSet ? g.StringHelper.GetDeterministicHashCodeOld(save.Seed) >>> 0 : save.Seed;
      result.$_Seed = seed;
      legacySeeds.add(seed);
    }
    return result;
  };
  type.prototype.ToSerializable = function () {
    const save = write.call(this);
    if (Array.from(save.Rngs.Values).some((r: any) => r.LegacySeed != null)) {
      save.Counters = new Dictionary(Array.from(this._rngs, ([k, r]: any) => [k, r._counter]));
      retainSaveMember(save, 'Counters');
    }
    return save;
  };
}
const namedRng = rngProto.$ctor_Rng$2;
rngProto.$ctor_Rng$2 = function (seed: any, name: string) {
  if (!legacySeeds.has(seed)) return namedRng.call(this, seed, name);
  const rng = legacyRng((seed + g.StringHelper.GetDeterministicHashCodeOld(name)) >>> 0);
  this.$fi_Rng(); this._random = rng._random; return this;
};
g.SaveManager.prototype.$ctor_SaveManager = g.SaveManager.prototype.$ctor_SaveManager$2;
// A backup alone can belong to a completed run. Preserve the web menu's shipped primary-file criterion.
Object.defineProperty(g.RunSaveManager.prototype, 'HasRunSave', {
  get() { return this._saveStore.FileExists(this.CurrentRunSavePath); }, configurable: true,
});
// Headless restoration must leave pending rewards unclaimed, as the browser does until the player clicks.
const offerRoomEndRewards = g.CombatRoom.prototype.OfferRoomEndRewards;
g.CombatRoom.prototype.OfferRoomEndRewards = function () {
  if (g.TestMode.IsOn && this.IsPreFinished) return (ext('System.Threading.Tasks.Task') as any).CompletedTask;
  return offerRoomEndRewards.call(this);
};

// Unsafe byte-pointer access cannot be represented by JS arrays. The upstream method emits one ulong per 8 bytes.
g.MegaRandom.prototype.NextBytes = function (span: any) {
  for (let offset = 0; offset < span.length; offset += 8) {
    const value = BigInt(this.NextULong());
    for (let i = 0; i < Math.min(8, span.length - offset); i++) span[offset + i] = Number((value >> BigInt(i * 8)) & 255n);
  }
};
const initModels = g.ModelDb.Init;
g.ModelDb.Init = function (...args: any[]) {
  initModels.apply(this, args);
  for (const type of g.$legacyModels) g.ModelDb.Inject(type);
  // Removed cards still render and play from an old deck, without returning to the beta's reward pools.
  g.ModelDb.Card(g.FollowThrough)._pool = g.ModelDb.CardPool(g.SilentCardPool);
  g.ModelDb.Card(g.Grapple)._pool = g.ModelDb.CardPool(g.IroncladCardPool);
};
// Desktop's new early stage loads mods. The web shell has no mod loader, but must load settings before essentials.
const initEssential = g.OneTimeInitialization.ExecuteEssential;
g.OneTimeInitialization.ExecuteEssential = function () {
  if (this._state === g.OneTimeInitialization_State.None) {
    this.SettingsReadResult = g.TestMode.IsOn ? g.SaveManager.Instance.InitSettingsDataForTest() : g.SaveManager.Instance.InitSettingsData();
    g.ModManager.State = g.ModManagerState.Skipped;
    this._state = g.OneTimeInitialization_State.VeryEarly;
  }
  return initEssential.call(this);
};

/** GodotFileIo's async paths stream through FileAccessStream (a System.IO.Stream subclass); the sync paths already hit the FileAccess shim. */
const Task = ext('System.Threading.Tasks.Task') as any;
// PunchOff's ambient animation loops until the player chooses or leaves. At
// Instant speed every upstream wait completes synchronously, so the loop never
// returns to the browser. Keep its real animation delays outside combat; this
// changes neither the choice/reward logic nor the saved event state.
const cmdWait = g.Cmd.Wait$3;
g.Cmd.Wait$3 = function (seconds: number, token: any, ignoreCombatEnd = false) {
  const room = g.RunManager.Instance.State?.CurrentRoom;
  if (!headless.on && seconds > 0 && g.SaveManager.Instance.PrefsSave.FastMode === g.FastModeType.Instant
    && !g.CombatManager.Instance.IsInProgress && room instanceof g.EventRoom
    && room.LocalMutableEvent instanceof g.PunchOff) {
    const tree = (ext('Godot.Engine') as any).GetMainLoop();
    return g.Cmd.WaitInternal(tree.CreateTimer(seconds, true, false, false), token);
  }
  return cmdWait.call(this, seconds, token, ignoreCombatEnd);
};
for (const [type, entry] of [[g.LegacyLastingCandy, 'LASTING_CANDY'], [g.LegacyPumpkinCandle, 'PUMPKIN_CANDLE']]) {
  Object.defineProperty(type.prototype, 'Description', {
    get() { return new g.LocString().$ctor_LocString('relics', `WEB_LEGACY_${entry}.description`); },
    configurable: true,
  });
}
// Do not reinterpret shipped counters as the beta's new reward/rekindle state.
// Clone the registered model to retain its ID, then use the frozen behavior.
const readRelic = g.RelicModel.FromSerializable;
g.RelicModel.FromSerializable = function (save: any) {
  const fields = [...(save.Props?.ints ?? [])].map((p: any) => p.name);
  const type = save.Id.Entry === 'LASTING_CANDY' && fields.includes('CombatsSeen') ? g.LegacyLastingCandy
    : save.Id.Entry === 'PUMPKIN_CANDLE' && fields.includes('ActiveAct') ? g.LegacyPumpkinCandle : null;
  if (!type) return readRelic.call(this, save);
  g.ModelIdSerializationCache.CacheSavedPropertiesForTypeDebug(type);
  const relic = g.SaveUtil.RelicOrDeprecated(save.Id).ToMutable();
  Object.setPrototypeOf(relic, type.prototype);
  relic[`$fi_${type.$name}`]();
  save.Props.Fill(relic);
  if (save.FloorAddedToDeck != null) relic.FloorAddedToDeck = save.FloorAddedToDeck;
  return relic;
};
const io = g.GodotFileIo.prototype;
io.ReadFileAsync = function (path: string) { return Task.FromResult(this.ReadFile(path)); };
// Keep filenames and UTF-8 contents unchanged; backup rotation and replacement must commit together.
io.WriteFile$String_ByteArr = function (path: string, bytes: any) { void vfs.writeSave(this.GetFullPath(path), new TextDecoder().decode(Uint8Array.from(bytes))); };
io.WriteFileAsync$String_ByteArr = function (path: string, bytes: any) { return toTask(vfs.writeSave(this.GetFullPath(path), new TextDecoder().decode(Uint8Array.from(bytes)))); };

/** Combat replays (.mcr bug-report recordings) are written through FileAccessStream; the web build has no use for them. */
Object.defineProperty(g.CombatReplayWriter.prototype, 'IsEnabled', { get: () => false, set: () => {}, configurable: true });

/** Web snapshots use typed C# member names, rather than desktop JSON. restore() handles their compatibility;
 * desktop snake_case migrations must never rewrite a browser save. */
g.MigrationManager.prototype.LoadWithAggressiveRecovery = function (T: any, filePath: string, content: string) {
  try {
    const data = (ext('System.Text.Json.JsonSerializer') as any).Deserialize(T, content, g.JsonSerializationUtility.GetTypeInfo$1(T));
    return new g.ReadSaveResult().$ctor_ReadSaveResult$1(T, data);
  } catch (e: any) {
    g.Log.Error(`Could not load ${filePath}: ${e?.message ?? e}`);
    return new g.ReadSaveResult().$ctor_ReadSaveResult$2(T, g.ReadSaveStatus.JsonParseError, String(e?.message ?? e));
  }
};

/** Inert Godot nodes (stubs and the web bridge's views) still take part in frame/timer waits: GetTree() is the runtime's
 *  main loop and ToSignal() yields real awaitables (e.g. CombatStateTracker waits a frame before notifying). */
const godotObject = stubOf('Godot.GodotObject');
if (godotObject) godotObject.prototype.ToSignal = function (src: any, sig: any) { return toSignal(src, sig); };
const godotNode = stubOf('Godot.Node');
if (godotNode) godotNode.prototype.GetTree = function () { return (ext('Godot.Engine') as any).GetMainLoop(); };
/** Node.CreateTween: real tweens (timed steps, callbacks, Finished), so waits on card and creature tweens take their
 *  original time and the web views they animate move. A node is valid until it is freed. */
if (godotNode) godotNode.prototype.CreateTween = () => new WebTween();
if (godotObject) godotObject.IsInstanceValid = (o: any) => o != null && !o.$freed;
const tweenHelper = stubOf('MegaCrit.Sts2.Core.Nodes.GodotExtensions.TweenHelper');
if (tweenHelper) tweenHelper.FastForwardToCompletion = (t: any) => t?.CustomStep?.(999);
if (tweenHelper) tweenHelper.AwaitFinished = (t: any, ownerOrToken: any) => {
  const token = ownerOrToken?.ThrowIfCancellationRequested ? ownerOrToken : null;
  const task = new Task();
  const owner = token ? null : ownerOrToken;
  let registration: any;
  const finish = (ok: boolean) => {
    registration?.Dispose();
    if (owner) owner.TreeExiting = dremove(owner.TreeExiting, exited);
    task.$done(1, ok && !owner?.$freed);
  };
  const exited = () => finish(false);
  if (!t?.IsValid?.() || !t?.IsRunning?.()) return Task.FromResult(!owner?.$freed);
  if (owner) owner.TreeExiting = dcombine(owner.TreeExiting, exited);
  registration = token?.Register(() => task.$done(3));
  t.whenFinished(() => finish(true));
  return task;
};
const nodeUtil = ext('MegaCrit.Sts2.Core.Nodes.GodotExtensions.NodeUtil') as any;
nodeUtil.GetTreeOrNull = (node: any) => node && !node.$freed ? (ext('Godot.Engine') as any).GetMainLoop() : null;
nodeUtil.AwaitProcessFrame = (node: any, ct: any) => {
  ct?.ThrowIfCancellationRequested();
  if (headless.on) return Task.FromResult(0);
  return toTask(nextFrame().then(() => {
    ct?.ThrowIfCancellationRequested();
    if (node?.$freed) throw new (ext('System.Threading.Tasks.TaskCanceledException'))();
    return Math.fround(1 / 60);
  }));
};
// The browser can tear down player creatures while a deferred UI refresh is
// queued. Coalesce it to a frame and stop refreshing when that player is gone.
g.CombatStateTracker.prototype.CallCombatStateChangedDeferred = function () {
  return toTask((async () => {
    if (!headless.on) await nextFrame();
    const state = this._state;
    const player = [...(state?.Players ?? [])].find((p: any) => g.LocalContext.IsMe$Player(p));
    if (!player?.PlayerCombatState) return;
    player.PlayerCombatState.RecalculateCardValues();
    this.CombatStateChanged?.(state);
  })());
};

/** Achievements: this build leaves AchievementsUtil.Unlock (platform) and AchievementsHelper empty. The achievement
 *  models (Models/Achievements, hook listeners) already call Unlock; record unlocks in the progress save and fill in
 *  the helper checks from the achievement descriptions. */
const Ach = g.Achievement;
g.AchievementsUtil.Unlock = (achievement: number) => {
  const progress = g.SaveManager.Instance.Progress;
  if (progress.IsAchievementUnlocked(achievement)) return;
  progress.AddUnlockedAchievement(achievement, Math.floor(Date.now() / 1000));
  g.SaveManager.Instance.SaveProgressFile();
  g.AchievementsUtil.AchievementsChanged?.();
};
const WIN_BY_CHARACTER: Record<string, number> = { IRONCLAD: Ach.IroncladWin, SILENT: Ach.SilentWin, REGENT: Ach.RegentWin, NECROBINDER: Ach.NecrobinderWin, DEFECT: Ach.DefectWin };
g.AchievementsHelper.AfterRunEnded = (state: any, player: any, isVictory: boolean) => {
  if (!player) return;
  if (g.SaveManager.Instance.Progress.FloorsClimbed >= 10000) g.AchievementsUtil.Unlock(Ach.FloorTenThousand, player);
  if (!isVictory) return;
  const win = WIN_BY_CHARACTER[player.Character?.Id?.Entry];
  if (win != null) g.AchievementsUtil.Unlock(win, player);
  const starting = new Set(Array.from(player.Character.StartingRelics ?? [], (r: any) => r.Id.Entry));
  if (Array.from(player.Relics).every((r: any) => starting.has(r.Id.Entry))) g.AchievementsUtil.Unlock(Ach.NoRelicWin, player);
  if (Array.from(player.Deck.Cards).every((c: any) => !c.IsUpgradable)) g.AchievementsUtil.Unlock(Ach.AllCardsUpgraded, player);
};
g.AchievementsHelper.AfterBossDefeated = (player: any) => g.AchievementsUtil.Unlock(Ach.DefeatOneBoss, player);
const ACT_ACHIEVEMENT: Record<string, number> = { UNDERDOCKS: Ach.DefeatUnderdocksEnemies, OVERGROWTH: Ach.DefeatOvergrowthEnemies, HIVE: Ach.DefeatHiveEnemies, GLORY: Ach.DefeatGloryEnemies };
g.AchievementsHelper.CheckForDefeatedAllEnemiesAchievement = (act: any, player: any) => {
  const achievement = ACT_ACHIEVEMENT[act?.Id?.Entry];
  if (achievement == null) return;
  const beaten = new Set(Array.from(g.SaveManager.Instance.Progress.EnemyStats.Values).filter((e: any) => e.TotalWins > 0).map((e: any) => e.Id.Entry));
  if (Array.from(act.AllMonsters).every((m: any) => beaten.has(m.Id.Entry))) g.AchievementsUtil.Unlock(achievement, player);
};
