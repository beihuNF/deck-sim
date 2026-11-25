// NDailyRunScreen (screens/daily_run/daily_run_screen.tscn) and NCustomRunScreen (screens/custom_run/custom_run_screen.tscn):
// singleplayer submenus over the blurred main menu, laid out at their scene rects.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { G, $, list } from '../game';
import { invalidate } from '../store';
import { loc, locv } from '../i18n';
import { startRun } from '../flow';
import { playOneShot, stopMusic } from '../audio';
import { imageUrl, frameByName, frameStyle } from '../assets';
import { hsvFilter, tint } from '../filters';
import { loadDailyBoard, type DailyBoard } from '../daily';
import { RichText } from './richtext';
import { characters, maxAscension, popMenu, netDate } from './menu';
import { CharacterSelectButton, AscensionPanel } from './charselect';
import { BackButton, ConfirmButton } from './buttons';
import { setTip } from './tooltip';
import { useFit } from './card';
import { transitionView } from './transition';
import { ScrollArea } from './scrollable';
import './modes.css';
import { view } from '../view';

const safe = <T,>(f: () => T, d: T) => { try { return f(); } catch { return d; } };
const fmt = (ls: any) => safe(() => ls?.GetFormattedText?.() ?? String(ls ?? ''), '');
const m = (k: string) => loc('main_menu_ui', k);
const rng = (seed: number | bigint) => new G.Rng().$ctor_Rng$UInt64(seed);
const EXPO_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
const hoverSfx = () => playOneShot('event:/sfx/ui/clicks/ui_hover');
const clickSfx = () => playOneShot('event:/sfx/ui/clicks/ui_click');
/** StartRunLobby.BeginRun → StartNewSingleplayerRun: music stops, the character's wipe, then the run. */
async function embark(c: any, o: Parameters<typeof startRun>[1]) {
  stopMusic();
  playOneShot(c.CharacterTransitionSfx);
  await transitionView.FadeOut(0.8, c.CharacterSelectTransitionPath);
  await startRun(c, o);
}

// ------------------------------------------------------------------ daily
/**
 * NDailyRunScreen.SetupLobbyParams for one player: seed dd_MM_yyyy_1p, character / ascension / modifiers from the
 * date's rng. The last roll excludes the daily character from CharacterCards (the lobby's character by then).
 */
function rollDaily(now: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${pad(now.getUTCDate())}_${pad(now.getUTCMonth() + 1)}_${now.getUTCFullYear()}`;
  const seed = G.SeedHelper.CanonicalizeSeed(`${day}_1p`);
  const r = rng(G.StringHelper.GetDeterministicHashCode(G.SeedHelper.CanonicalizeSeed(day)));
  const r2 = rng(r.NextUnsignedInt$1()), r3 = rng(r.NextUnsignedInt$1()), r4 = rng(r.NextUnsignedInt$1());
  const chars = list(G.ModelDb.AllCharacters);
  const character = r2.NextItem(G.CharacterModel, chars);
  const ascension = r3.NextInt$2(0, 11);
  // RollModifiers: two good (mutually exclusive sets respected), one bad
  const good = G.ListExtensions.StableShuffle(G.ModifierModel, [...list(G.ModelDb.GoodModifiers)], r4);
  const modifiers: any[] = [];
  for (let i = 0; i < 2; i++) {
    const canonical = r4.NextItem(G.ModifierModel, good);
    const mod = canonical.ToMutable();
    if (mod instanceof G.CharacterCards) mod.CharacterModel = r4.NextItem(G.CharacterModel, chars.filter((c: any) => c !== character)).Id;
    modifiers.push(mod);
    good.splice(good.indexOf(canonical), 1);
    const exclusive = list(G.ModelDb.MutuallyExclusiveModifiers).find((s: any) => s.Contains(canonical));
    if (exclusive) for (const x of list(exclusive)) { const k = good.indexOf(x); if (k >= 0) good.splice(k, 1); }
  }
  modifiers.push(r4.NextItem(G.ModifierModel, list(G.ModelDb.BadModifiers)).ToMutable());
  return { day, seed, character, ascension, modifiers };
}
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
/** A UTC instant as a local Date with the same fields (netDate reads local getters; the daily's time is UTC). */
const utcFields = (d: Date) => new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());

export function DailyRun() {
  // the time "fetched" on open (no time server: UtcNow), the run's DailyTime
  const opened = useMemo(() => ({ time: $.ext('System.DateTimeOffset').UtcNow }), []);
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  useEffect(() => { const h = setInterval(() => setNow(new Date()), 250); return () => clearInterval(h); }, []);
  const d = useMemo(() => rollDaily(now), [utcDay(now)]);
  const end = utcDay(now) + 86400000, left = Math.max(0, end - now.getTime());
  const hms = [left / 3600000, (left / 60000) % 60, (left / 1000) % 60].map((x) => String(Math.floor(x) % 100).padStart(2, '0')).join(':');
  const id = String(d.character.Id.Entry).toLowerCase();
  const numRef = useRef<HTMLDivElement>(null);
  useFit(numRef, `dasc|${d.ascension}`, 24, 18, (el) => el.scrollWidth <= 29);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    await embark(d.character, { seed: d.seed, ascension: d.ascension, modifiers: d.modifiers, dailyTime: opened.time });
  };
  return (
    <div class="daily">
      <div class="dr-title">{m('DAILY_RUN_MENU.DAILY_TITLE')}</div>
      <div class="dr-date">{netDate(m('DAILY_RUN_MENU.DATE_FORMAT'), utcFields(now))}</div>
      {/* default colour cream and node modulate cream: the gold label is tinted too */}
      <div class="dr-time" style={{ filter: tint(1, 0.965, 0.886) }}><RichText text={locv('main_menu_ui', 'DAILY_RUN_MENU.TIME_LEFT', { time: hms })} /></div>
      {/* NDailyRunCharacterContainer: icon, the ascension flame with its number (always), the name */}
      <img class="dr-char-icon" src={imageUrl(`images/ui/top_panel/character_icon_${id}.png`) ?? ''} />
      <div class="dr-asc-icon" style={frameStyle(frameByName('ui_atlas', 'top_bar/top_bar_ascension'), 33, 48)} />
      <div class="dr-asc-num" ref={numRef}>{d.ascension}</div>
      <div class="dr-char-name">{fmt(d.character.Title)}</div>
      <div class="dr-mods-label">{m('DAILY_RUN_MENU.MODIFIERS')}</div>
      <div class="dr-mods">
        {d.modifiers.map((mod) => (
          <div class="dr-mod">
            <img src={imageUrl(safe(() => mod.IconPath, '')) ?? imageUrl('images/powers/missing_power.png') ?? ''} />
            <div class="dr-mod-text"><RichText text={locv('main_menu_ui', 'DAILY_RUN_MENU.MODIFIER', { title: fmt(mod.Title), description: fmt(mod.Description) })} /></div>
          </div>
        ))}
      </div>
      <Leaderboard time={opened.time} />
      <div class="dr-disclaimer">{m('DAILY_RUN_MENU.disclaimer')}</div>
      <BackButton enabled={!busy} onClick={popMenu} />
      <ConfirmButton enabled={!busy} onClick={() => void go()} />
    </div>
  );
}

/** NDailyRunLeaderboard (singleplayer: today's board, the day paginator's own arrows hidden). */
function Leaderboard({ time, playerCount = 1 }: { time: any; playerCount?: number }) {
  const [page, setPage] = useState(0);
  const [b, setB] = useState<DailyBoard | null>(null);
  useEffect(() => { let dead = false; setB(null); void loadDailyBoard(time, page, playerCount).then((x) => { if (!dead) setB(x); }); return () => { dead = true; }; }, [page, time, playerCount]);
  const date = netDate(m('DAILY_RUN_MENU.DATE_FORMAT'), utcFields(new Date(Number(safe(() => time.ToUnixTimeMilliseconds(), Date.now())))));
  const shown = b?.entries.filter((e) => e.score >= 0) ?? [];
  const negative = (b?.entries.length ?? 0) > shown.length;
  return (
    <>
      <div class="dr-lb-title">{m('DAILY_RUN_MENU.LEADERBOARDS.title')}</div>
      <div class="dr-lb-day">{date}</div>
      {b && (!b.exists || !shown.length) && <div class="dr-lb-none">{m('DAILY_RUN_MENU.LEADERBOARDS.noScore')}</div>}
      {b?.exists && shown.length > 0 && (
        <div class="dr-lb-scores">
          <LbRow rank={' ' + m('LEADERBOARDS.rankHeader')} name={m('LEADERBOARDS.nameHeader')} score={m('LEADERBOARDS.scoreHeader') + ' '} />
          <div class="dr-lb-sep" />
          {shown.map((e) => <><LbRow rank={` ${e.rank + 1}`} name={e.name} score={`${e.score} `} /><div class="dr-lb-sep" /></>)}
        </div>
      )}
      {b?.exists && <PageArrow left enabled={page > 0} onClick={() => setPage(page - 1)} />}
      {b?.exists && <PageArrow enabled={page * 10 + 10 < b.count && !negative} onClick={() => setPage(page + 1)} />}
      {b?.uploaded && b.exists && <ScoreWarning />}
    </>
  );
}
function LbRow({ rank, name, score }: { rank: string; name: string; score: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useFit(ref, `lbn|${name}`, 28, 16, (el) => el.scrollWidth <= el.clientWidth);
  return (
    <div class="dr-lb-row">
      <div class="dr-lb-rank">{rank}</div>
      <div class="dr-lb-name" ref={ref}>{name}</div>
      <div class="dr-lb-score">{score}</div>
    </div>
  );
}
/** NLeaderboardPageArrow: settings_tiny arrow at 0.75 (v 0.9); hover 1.1× v 1.5, press 0.9× v 0.8; disabled: invisible. */
function PageArrow({ left, enabled, onClick }: { left?: boolean; enabled: boolean; onClick: () => void }) {
  const [st, setSt] = useState<'' | 'hover' | 'press'>('');
  const k = st === 'hover' ? 1.1 : st === 'press' ? 0.9 : 1, v = st === 'hover' ? 1.5 : st === 'press' ? 0.8 : 0.9;
  const t = st === 'hover' ? '.05s linear' : `.5s ${EXPO_OUT}`;
  return (
    <div class={'dr-lb-arrow' + (left ? ' left' : ' right')} style={{ opacity: enabled ? 1 : 0, pointerEvents: enabled ? 'auto' : 'none' }}
      onPointerEnter={() => { setSt('hover'); hoverSfx(); }} onPointerLeave={() => setSt('')}
      onPointerDown={(e) => { if (e.button === 0) { setSt('press'); clickSfx(); } }}
      onPointerUp={(e) => { if (e.button === 0 && st === 'press') { setSt('hover'); onClick(); } }}>
      <img src={imageUrl('images/packed/common_ui/settings_tiny_left_arrow.png') ?? ''}
        style={{ scale: `${(left ? 1 : -1) * 0.75 * k} ${0.75 * k}`, filter: `brightness(${v})`, transition: `scale ${t}, filter ${t}` }} />
    </div>
  );
}
/** NDailyRunScoreWarning: the exclaim emote (hsv h .171 s 3.072); hover 1.1× with the tip to its left. */
function ScoreWarning() {
  const [hover, setHover] = useState(false);
  return (
    <img class="dr-warning" src={imageUrl('images/ui/emote/exclaim.png') ?? ''} style={{ filter: hsvFilter(0.171, 3.072, 1), scale: hover ? '1.1' : '1' }}
      onPointerEnter={() => { setHover(true); setTip(m('DAILY_RUN_MENU.NO_UPLOAD_HOVERTIP.title'), m('DAILY_RUN_MENU.NO_UPLOAD_HOVERTIP.description'), { kind: 'align', rect: [1804 + view.ox, 632 + view.oy, 94, 79], align: 'left' }); }}
      onPointerLeave={() => { setHover(false); setTip(null); }} />
  );
}

// ------------------------------------------------------------------ custom
/** 记住单人自定义界面的输入与选择（对应被缓存的 NCustomRunScreen） */
const custom = { seed: '', mods: new Set<string>(), gameMode: 1 /* GameMode.Standard */ };
interface ModRow { key: string; make: () => any; text: string; canonical: any }
const gameModeTitle = (mode: number) =>
  m(mode === G.GameMode.Blitz ? 'BLITZ.title' : mode === G.GameMode.Dread ? 'DREAD.title' : 'STANDARD.title');

/** NCustomRunModifiersList.GetAllModifiers: good then bad, CharacterCards once per character. */
export function allModifiers(): ModRow[] {
  const out: ModRow[] = [];
  const good = new Set(list(G.ModelDb.GoodModifiers));
  const label = (x: any, g: boolean) => locv('main_menu_ui', 'CUSTOM_RUN_SCREEN.MODIFIER_LABEL', { color: g ? 'green' : 'red', modifier_title: fmt(x.Title), modifier_description: fmt(x.Description) });
  for (const mod of [...list(G.ModelDb.GoodModifiers), ...list(G.ModelDb.BadModifiers)]) {
    if (mod instanceof G.CharacterCards) {
      for (const c of list(G.ModelDb.AllCharacters)) {
        const make = () => { const x = mod.ToMutable(); x.CharacterModel = c.Id; return x; };
        out.push({ key: `${mod.Id.Entry}:${c.Id.Entry}`, make, text: label(make(), true), canonical: mod });
      }
    } else out.push({ key: mod.Id.Entry, make: () => mod.ToMutable(), text: label(mod, good.has(mod)), canonical: mod });
  }
  return out;
}
/** Ticking Draft, Sealed Deck or Insanity unticks the other two (no sound). */
function toggle(row: ModRow, all: ModRow[]) {
  if (custom.mods.has(row.key)) { custom.mods.delete(row.key); invalidate(); return; }
  const set = list(G.ModelDb.MutuallyExclusiveModifiers).find((s: any) => s.Contains(row.canonical));
  if (set) for (const other of all) if (other !== row && safe(() => set.Contains(other.canonical), false)) custom.mods.delete(other.key);
  custom.mods.add(row.key);
  invalidate();
}

/** NCustomGameModeDropdown：自定义局子模式下拉框（标准 / 闪电 / 恐惧） */
function CustomGameModeDropdown({
  value,
  options,
  disabled,
  onChange,
}: {
  value: number;
  options: number[];
  disabled: boolean;
  onChange: (mode: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hot, setHot] = useState(false);
  return (
    <div class={'cr-dropdown' + (disabled ? ' disabled' : '')}>
      {open && <div class="std-dismiss" onPointerDown={(e) => e.stopPropagation()} onPointerUp={() => setOpen(false)} />}
      <div
        class="std-face"
        data-ctl
        style={{ background: hot && !disabled ? '#3C5B6B' : '#2C434F' }}
        onPointerEnter={() => { if (!disabled) { setHot(true); hoverSfx(); } }}
        onPointerLeave={() => setHot(false)}
        onPointerUp={() => { if (!disabled) { clickSfx(); setOpen((v) => !v); } }}
      >
        <div class="std-label">{gameModeTitle(value)}</div>
        {!disabled && <div class="std-arrow" style={frameStyle(frameByName('ui_atlas', 'settings_tiny_left_arrow'), 26, 26)} />}
      </div>
      {open && (
        <div class="std-list" onWheel={(e) => e.stopPropagation()}>
          {options.map((mode) => (
            <div
              key={mode}
              class="std-item"
              data-ctl
              onPointerEnter={hoverSfx}
              onPointerUp={() => {
                setOpen(false);
                if (mode !== value) onChange(mode);
              }}
            >
              {gameModeTitle(mode)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** NCustomRunRandomizeButton：随机挑选角色（单人）与 2 好 1 坏词缀 */
function CustomRunRandomizeButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  const [st, setSt] = useState<'' | 'hover' | 'press'>('');
  const s = st === 'hover' && !disabled ? 1.1 : 1;
  const v = st === 'hover' && !disabled ? 1.1 : st === 'press' && !disabled ? 0.7 : 0.8;
  return (
    <div
      class={'cr-randomize-btn' + (disabled ? ' disabled' : '')}
      data-ctl
      onPointerEnter={() => { if (!disabled) { setSt('hover'); hoverSfx(); } }}
      onPointerLeave={() => setSt('')}
      onPointerDown={(e) => { if (!disabled && e.button === 0) { setSt('press'); clickSfx(); } }}
      onPointerUp={(e) => { if (!disabled && e.button === 0 && st === 'press') { setSt('hover'); onClick(); } }}
    >
      <img
        class="crr-bg"
        src={imageUrl('images/ui/reward_screen/reward_item_button.png') ?? ''}
        style={{ filter: `saturate(${s}) brightness(${v})` }}
      />
      <div class="crr-label">{m('CUSTOM_RUN_SCREEN.RANDOMIZE')}</div>
    </div>
  );
}

export function CustomRun() {
  const chars = characters();
  const all = useMemo(allModifiers, []);
  const [sel, setSel] = useState(chars[0].c);
  const [gameMode, setGameMode] = useState<number>(() => custom.gameMode || G.GameMode.Standard);
  const [busy, setBusy] = useState(false);

  const availableModes = useMemo(() => {
    const out = [G.GameMode.Standard];
    if (safe(() => G.SaveManager.Instance.IsEpochRevealed$_T1(G.BlitzEpoch), false)) out.push(G.GameMode.Blitz);
    if (safe(() => G.SaveManager.Instance.IsEpochRevealed$_T1(G.DreadEpoch), false)) out.push(G.GameMode.Dread);
    return out;
  }, []);

  const modeMax = (mode: number, c: any) => {
    if (mode === G.GameMode.Dread) return 10;
    if (mode === G.GameMode.Blitz) return safe(() => G.SaveManager.Instance.Progress.MaxBlitzAscension, 0);
    return maxAscension(c);
  };
  const prefAsc = (mode: number, c: any, mx: number) => {
    if (mode === G.GameMode.Dread) return 10;
    if (mode === G.GameMode.Blitz) return Math.min(safe(() => G.SaveManager.Instance.Progress.PreferredBlitzAscension, 0), mx);
    return Math.min(safe(() => G.SaveManager.Instance.Progress.GetOrCreateCharacterStats(c.Id).PreferredAscension, 0), mx);
  };

  const max = modeMax(gameMode, sel);
  const [level, setLevel] = useState(() => prefAsc(gameMode, sel, max));

  const select = (c: any) => {
    if (c === sel) return;
    playOneShot(c.CharacterSelectSfx);
    setSel(c);
    const mx = modeMax(gameMode, c);
    setLevel(prefAsc(gameMode, c, mx));
  };

  const changeGameMode = (mode: number) => {
    custom.gameMode = mode;
    setGameMode(mode);
    const mx = modeMax(mode, sel);
    setLevel(prefAsc(mode, sel, mx));
  };

  const changeLevel = (n: number) => {
    if (gameMode === G.GameMode.Dread) return;
    setLevel(n);
    if (gameMode === G.GameMode.Blitz) {
      safe(() => { G.SaveManager.Instance.Progress.PreferredBlitzAscension = n; }, undefined);
    } else {
      // StartRunLobby.UpdatePreferredAscension: 仅在角色已解锁高进阶时记忆偏好
      safe(() => { const s = G.SaveManager.Instance.Progress.GetOrCreateCharacterStats(sel.Id); if (s.MaxAscension !== 0) s.PreferredAscension = n; }, undefined);
    }
  };

  const handleRandomize = () => {
    if (busy) return;
    let nextChar = sel;
    const unlocked = chars.filter((x) => !x.locked);
    if (unlocked.length) {
      const picked = unlocked[Math.floor(Math.random() * unlocked.length)].c;
      nextChar = picked;
      if (picked !== sel) {
        playOneShot(picked.CharacterSelectSfx);
        setSel(picked);
        const mx = modeMax(gameMode, picked);
        setLevel(prefAsc(gameMode, picked, mx));
      }
    }
    const pickedMods = safe(() => list(G.ModifierModel.Pick2Good1Bad(G.Rng.Chaotic, [nextChar])), []);
    const keys = pickedMods.map((mod: any) =>
      mod instanceof G.CharacterCards && mod.CharacterModel ? `${mod.Id.Entry}:${mod.CharacterModel.Entry}` : mod.Id.Entry,
    );
    custom.mods.clear();
    for (const k of keys) if (all.some((r) => r.key === k)) custom.mods.add(k);
    invalidate();
  };

  const go = async () => {
    if (busy) return;
    setBusy(true);
    const seedVal = custom.seed ? G.SeedHelper.CanonicalizeSeed(custom.seed) : null;
    const asc = gameMode === G.GameMode.Dread ? 10 : (max > 0 ? level : 0);
    await embark(sel, {
      ascension: asc,
      seed: seedVal,
      modifiers: all.filter((r) => custom.mods.has(r.key)).map((r) => r.make()),
      gameMode,
      isCustom: true,
    });
  };

  return (
    <div class="custom">
      <div class="cr-title">{m('CUSTOM_RUN_SCREEN.CUSTOM_MODE_TITLE')}</div>
      <div class="cr-mode-seed-row">
        {availableModes.length > 1 && (
          <CustomGameModeDropdown
            value={gameMode}
            options={availableModes}
            disabled={busy}
            onChange={changeGameMode}
          />
        )}
        <div class="cr-seed">
          <div class="cr-seed-label">{m('CUSTOM_RUN_SCREEN.SEED_LABEL')}</div>
          <input
            class="cr-seed-input"
            value={custom.seed}
            placeholder={m('CUSTOM_RUN_SCREEN.SEED_RANDOM_PLACEHOLDER')}
            spellcheck={false}
            disabled={busy}
            onInput={(e) => {
              custom.seed = (e.target as HTMLInputElement).value.toUpperCase().replace(/[^A-Z0-9_]/g, '');
            }}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); (e.target as HTMLInputElement).blur(); } }}
          />
        </div>
      </div>
      {(max > 0 || gameMode === G.GameMode.Dread) && (
        <div class="cr-asc">
          <AscensionPanel
            gameMode={gameMode}
            level={Math.min(level, Math.max(max, gameMode === G.GameMode.Dread ? 10 : 0))}
            max={gameMode === G.GameMode.Dread ? 10 : max}
            onChange={changeLevel}
          />
        </div>
      )}
      <div class="cr-buttons" style={{ left: `${480 - (chars.length * 116 - 16) / 2}px` }}>
        {chars.map(({ c }) => (
          <CharacterSelectButton
            c={c}
            locked={false}
            selected={c === sel}
            enabled={!busy}
            onSelect={() => select(c)}
          />
        ))}
      </div>
      <div class="cr-mods-header">
        <div class="cr-mods-title">{m('CUSTOM_RUN_SCREEN.MODIFIERS_TITLE')}</div>
        <CustomRunRandomizeButton disabled={busy} onClick={handleRandomize} />
      </div>
      <ScrollArea rect={[992, 168 - view.oy, 686 + view.ox, 750 + 2 * view.oy]} bar={[1680 + view.ox, 168 - view.oy, 48, 750 + 2 * view.oy]}>
        <div class="cr-mod-list">
          {all.map((r) => (
            <ModifierTickbox
              row={r}
              on={custom.mods.has(r.key)}
              disabled={busy}
              onToggle={() => toggle(r, all)}
            />
          ))}
        </div>
      </ScrollArea>
      <div class="cr-disclaimer">{m('CUSTOM_RUN_SCREEN.disclaimer')}</div>
      <BackButton enabled={!busy} onClick={popMenu} />
      <ConfirmButton enabled={!busy} onClick={() => void go()} />
    </div>
  );
}

/**
 * NRunModifierTickbox: the whole row is the button; the 38.4 px checkbox (pivot (32, 32)) grows 1.05 and v 1.2 on hover,
 * 0.95 and v 0.8 on press; release toggles with ui_checkbox_on / off. No hover or click sound.
 */
function ModifierTickbox({ row, on, disabled = false, onToggle }: { row: ModRow; on: boolean; disabled?: boolean; onToggle: () => void }) {
  const [st, setSt] = useState<'' | 'hover' | 'press'>('');
  const k = st === 'hover' && !disabled ? 1.05 : st === 'press' && !disabled ? 0.95 : 1;
  const v = st === 'hover' && !disabled ? 1.2 : st === 'press' && !disabled ? 0.8 : 1;
  const t = st === 'hover' ? '.05s linear' : `.5s ${EXPO_OUT}`;
  return (
    <div
      class={'cr-mod' + (disabled ? ' disabled' : '')}
      data-ctl
      style={{ cursor: disabled ? 'default' : 'var(--game-cursor-default, auto)', opacity: disabled ? 0.85 : 1 }}
      onPointerEnter={() => { if (!disabled) setSt('hover'); }}
      onPointerLeave={() => setSt('')}
      onPointerDown={(e) => { if (!disabled && e.button === 0) setSt('press'); }}
      onPointerUp={(e) => {
        if (disabled || e.button !== 0 || st !== 'press') return;
        setSt('hover');
        playOneShot(on ? 'event:/sfx/ui/clicks/ui_checkbox_off' : 'event:/sfx/ui/clicks/ui_checkbox_on');
        onToggle();
      }}
    >
      <div class="cr-tick" style={{ scale: String(k), filter: `brightness(${v})`, transition: `scale ${t}, filter ${t}` }}>
        <div style={frameStyle(frameByName('ui_atlas', on ? 'checkbox_ticked' : 'checkbox_unticked'), 38.4, 38.4)} />
      </div>
      <div class="cr-mod-text"><RichText text={row.text} /></div>
    </div>
  );
}
