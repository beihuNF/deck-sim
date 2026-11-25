// 恐惧模式（NDreadScreen）、连胜锁链（NChainVisualization）与规则弹窗（NDreadInfoDisclaimer）
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { G, $, GAME_VERSION } from '../game';
import { playOneShot, stopMusic } from '../audio';
import { imageUrl, frameByName, frameStyle } from '../assets';
import { loc, locv } from '../i18n';
import { startRun } from '../flow';
import { setTip } from './tooltip';
import { acceptTutorialsFtue } from './ftue';
import { RichText } from './richtext';
import { BackButton, ConfirmButton } from './buttons';
import { CharacterSelectButton } from './charselect';
import { ModeInfoButton, DisclaimerConfirmButton } from './blitz';
import { setCharSelectGrayscale, charSelectBg } from '../render/scene';
import { hsvFilter } from '../filters';
import { transitionView } from './transition';
import { characters, popMenu } from './menu';
import './dread.css';

const safe = <T,>(f: () => T, d: T) => { try { return f(); } catch { return d; } };
const fmt = (ls: any) => safe(() => ls?.GetFormattedText?.() ?? String(ls ?? ''), '');
const none = (id: any) => !id || id === G.ModelId.none || safe(() => id.Equals(G.ModelId.none), false);
const isRotatingChar = (c: any) => !!G.RotatingCharacter && c instanceof G.RotatingCharacter;
const debugAudio = (f: string) => safe(() => $.ext('MegaCrit.Sts2.Core.Audio.Debug.NDebugAudioManager').Instance?.Play(f), null);
const stopDebugAudio = (id: number | null) => { if (id != null && id >= 0) safe(() => $.ext('MegaCrit.Sts2.Core.Audio.Debug.NDebugAudioManager').Instance?.Stop(id, 0.1), null); };
const shake = () => safe(() => $.ext('MegaCrit.Sts2.Core.Nodes.NGame').Instance.ScreenShake($.ext('MegaCrit.Sts2.Core.Nodes.Vfx.Utilities.ShakeStrength').Weak, $.ext('MegaCrit.Sts2.Core.Nodes.Vfx.Utilities.ShakeDuration').Short, 90), null);

const cssColor = (c: any, fallback = 'rgba(255, 213, 0, 0.75)') => {
  if (!c) return fallback;
  return `rgba(${Math.round((c.R ?? 1) * 255)}, ${Math.round((c.G ?? 0.835) * 255)}, ${Math.round((c.B ?? 0) * 255)}, ${c.A ?? 0.753})`;
};

/** NDreadInfoDisclaimer：恐惧模式规则弹窗（含左右 Ascension 1–10 逐条渐显） */
export function DreadInfoDisclaimer({ delayed, onClose }: { delayed: boolean; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const close = () => {
    if (closing) return;
    setClosing(true);
    safe(() => G.SaveManager.Instance.MarkFtueAsComplete('dread_disclaimer'), undefined);
    setTimeout(onClose, 200);
  };
  const desc = useMemo(() => {
    const vars: Record<string, string> = {};
    for (let i = 1; i <= 4; i++) {
      vars[`rule${i}`] = loc('ascension', `DREAD_RULE_0${i}`);
    }
    return locv('main_menu_ui', 'DREAD_DISCLAIMER.description', vars);
  }, []);
  const ascItems = useMemo(() => {
    const listItems: string[] = [];
    for (let i = 1; i <= 10; i++) {
      const k = `LEVEL_${String(i).padStart(2, '0')}`;
      listItems.push(`[gold]${loc('ascension', `${k}.title`)}[/gold]\n${loc('ascension', `${k}.description`)}`);
    }
    return listItems;
  }, []);

  return (
    <div class={'mode-disclaimer dread-disc' + (delayed ? ' delayed' : '') + (closing ? ' closing' : '')}>
      <div class="md-bg" />
      <div class="drd-asc-list left">
        {ascItems.slice(0, 5).map((txt, idx) => (
          <div class="drd-asc-item" style={{ animationDelay: `${1 + idx * 0.2}s` }}>
            <RichText text={txt} />
          </div>
        ))}
      </div>
      <div class="drd-asc-list right">
        {ascItems.slice(5, 10).map((txt, idx) => (
          <div class="drd-asc-item" style={{ animationDelay: `${2.5 + idx * 0.2}s` }}>
            <RichText text={txt} />
          </div>
        ))}
      </div>
      <div class="md-panel">
        <img class="md-panel-img" src={imageUrl('images/ui/reward_screen/reward_panel.png') ?? ''} style={{ filter: hsvFilter(0.75, 0.1, 1) }} />
        <div class="md-content">
          <div class="md-header">{loc('main_menu_ui', 'DREAD_DISCLAIMER.title')}</div>
          <div class="md-desc"><RichText text={desc} /></div>
        </div>
        <DisclaimerConfirmButton onClick={close} />
      </div>
    </div>
  );
}

/** NDreadNameText：顶部大写角色标题（带文字阴影与字母展开动效） */
function DreadNameText({ text, color, animKey }: { text: string; color: string; animKey: string }) {
  const upper = text.toUpperCase();
  return (
    <div class="drd-name-wrap" key={animKey}>
      <div class="drd-name-shadow">{upper}</div>
      <div class="drd-name-main" style={{ color }}>{upper}</div>
    </div>
  );
}

/** NDreadBeginRotationTickbox：开始轮换连胜勾选框与旋转图标 */
function DreadBeginRotationTickbox({ ticked, enabled, onToggle }: { ticked: boolean; enabled: boolean; onToggle: () => void }) {
  const [st, setSt] = useState<'' | 'hover' | 'press'>('');
  const ref = useRef<HTMLDivElement>(null);
  const k = st === 'hover' && enabled ? 1.05 : st === 'press' && enabled ? 0.95 : 1;
  const v = st === 'hover' && enabled ? 1.2 : st === 'press' && enabled ? 0.8 : 1;
  return (
    <div
      class={'drd-rot-tickbox' + (enabled ? '' : ' disabled')}
      ref={ref}
      data-ctl
      onPointerEnter={() => {
        if (enabled) setSt('hover');
        if (ref.current) {
          const rect = ref.current.getBoundingClientRect();
          const root = document.querySelector('.stage-root')?.getBoundingClientRect();
          if (root) {
            const scale = 1920 / root.width;
            setTip(
              loc('static_hover_tips', 'DREAD_ROTATION.title'),
              loc('static_hover_tips', 'DREAD_ROTATION.description'),
              { kind: 'at', x: (rect.right - root.left) * scale + 10, y: (rect.top - root.top) * scale },
            );
          }
        }
      }}
      onPointerLeave={() => { setSt(''); setTip(null); }}
      onPointerDown={(e) => { if (enabled && e.button === 0) setSt('press'); }}
      onPointerUp={(e) => {
        if (!enabled || e.button !== 0 || st !== 'press') return;
        setSt('hover');
        playOneShot(ticked ? 'event:/sfx/ui/clicks/ui_checkbox_off' : 'event:/sfx/ui/clicks/ui_checkbox_on');
        onToggle();
      }}
    >
      <div class="drd-tick-icon" style={{ transform: `scale(${k})`, filter: `brightness(${v})` }}>
        <div style={frameStyle(frameByName('ui_atlas', ticked ? 'checkbox_ticked' : 'checkbox_unticked'), 44, 44)} />
      </div>
      <div class="drd-rot-mini-wrap">
        <img
          class={'drd-rot-mini' + (ticked ? ' spinning' : ' paused')}
          src={imageUrl('images/ui/main_menu/rotating_character.png') ?? ''}
        />
      </div>
      <div class="drd-rot-label">{loc('main_menu_ui', 'DREAD_ROTATION_TICKBOX')}</div>
    </div>
  );
}

const BROKEN_IMAGES = [
  'images/ui/chain_break_1.png',
  'images/ui/chain_break_2.png',
  'images/ui/chain_break_3.png',
  'images/ui/chain_break_4.png',
];

/** NChainVisualization：连胜锁链摆动、新增链环闪光与断链退场动效 */
function ChainVisualization({
  count,
  mode,
  visible,
  onAnimDone,
}: {
  count: number;
  mode: 'idle' | 'add' | 'break';
  visible: boolean;
  onAnimDone?: () => void;
}) {
  const linkRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [phase, setPhase] = useState<'default' | 'breaking' | 'broken'>('default');
  const [brokenAlpha, setBrokenAlpha] = useState(1);
  const [addGlow, setAddGlow] = useState(false);

  // 锁链有机摆动（模拟 NChainVisualization.Update 的低频扰动）与断链物理拉伸
  useEffect(() => {
    if (count <= 0) {
      if (mode !== 'idle') onAnimDone?.();
      return;
    }
    setPhase('default');
    setBrokenAlpha(1);
    setAddGlow(false);

    let alive = true;
    const t0 = performance.now();
    let windupId: number | null = null;
    let breakDone = false;
    let addDone = false;
    const breakDelay = 500;
    const stretchDur = Math.max(100, Math.min(1000, 100 + 900 * (count / 5)));

    const step = (now: number) => {
      if (!alive) return;
      const elapsed = (now - t0) / 1000;
      const isBreaking = mode === 'break' && now - t0 >= breakDelay && !breakDone;
      if (isBreaking && windupId == null) {
        setPhase('breaking');
        windupId = debugAudio('chain_break_windup.wav');
      }

      if (mode === 'break' && now - t0 >= breakDelay + stretchDur && !breakDone) {
        breakDone = true;
        stopDebugAudio(windupId);
        windupId = null;
        debugAudio('chain_break.wav');
        setPhase('broken');
        setBrokenAlpha(0);
        setTimeout(() => { if (alive) onAnimDone?.(); }, 500);
      }

      if (mode === 'add' && !addDone && now - t0 >= (count > 1 ? 500 : 200)) {
        addDone = true;
        debugAudio('chain_get.wav');
        setAddGlow(true);
        setTimeout(() => { if (alive) setAddGlow(false); }, 350);
        setTimeout(() => { if (alive) onAnimDone?.(); }, 450);
      }

      const sep = isBreaking
        ? 70 + 15 * Math.sin(Math.min(1, ((now - t0) - breakDelay) / stretchDur) * Math.PI * 0.5)
        : 70;
      const xOffset = -count * sep * 0.5;
      const pts: { x: number; y: number }[] = [];
      for (let l = 0; l <= count; l++) {
        const wave = Math.sin(elapsed * 1.4 + l * 0.9) * 0.5 + Math.cos(elapsed * 0.9 + l * 1.7) * 0.5;
        const perturb = l === 0 ? 12 : l === count ? -12 : wave * 20;
        const yOff = Math.sin(elapsed * 1.1 + l * 1.3) * 10;
        pts.push({ x: l * sep + perturb, y: yOff });
      }
      for (let i = 0; i < count; i++) {
        const el = linkRefs.current[i];
        if (!el) continue;
        const p0 = pts[i], p1 = pts[i + 1];
        const cx = xOffset + (p0.x + p1.x) * 0.5;
        const cy = (p0.y + p1.y) * 0.5;
        const rot = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        const sy = i % 2 === 0 ? 0.8 + Math.sin(elapsed * 2 + i) * 0.04 : 1;
        const isLastHidden = mode === 'add' && !addDone && i === count - 1;
        el.style.opacity = isLastHidden ? '0' : '1';
        el.style.transform = `translate(${cx - 60}px, ${cy - 30}px) rotate(${rot}rad) scale(1, ${sy})`;
      }
      requestAnimationFrame(step);
    };

    const raf = requestAnimationFrame(step);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      stopDebugAudio(windupId);
    };
  }, [count, mode]);

  if (!visible || count <= 0) return null;
  const linkSrc = imageUrl('images/ui/chain_link.png') ?? '';
  return (
    <div class="drd-chain" style={{ opacity: phase === 'broken' ? brokenAlpha : 1, transition: phase === 'broken' ? 'opacity .5s linear' : undefined }}>
      {Array.from({ length: count }).map((_, i) => {
        const src = phase === 'broken' ? (imageUrl(BROKEN_IMAGES[i % BROKEN_IMAGES.length]) ?? linkSrc) : linkSrc;
        const isGlow = addGlow && i === count - 1;
        return (
          <div key={i} class="drd-chain-link" ref={(el) => { linkRefs.current[i] = el; }}>
            <img src={src} class={isGlow ? 'glow' : ''} />
          </div>
        );
      })}
    </div>
  );
}

/** 恐惧模式选角界面（NDreadScreen，固定进阶 10） */
export function DreadSelect() {
  const chars = characters();
  const rotatingModel = safe(() => G.ModelDb.Character(G.RotatingCharacter), null);
  const currentRotatingStreak = safe(() => G.AscensionHelper.GetCurrentRotatingDreadWinStreak(false), 0);

  const [pendingRes, setPendingRes] = useState<any>(() => safe(() => {
    return G.SaveManager.Instance.Progress.PendingSingleplayerDreadWinStreakResult;
  }, null));

  // 计算轮换按钮当前应展示的英雄（若有待播放结果则先展示上一局轮换角色）
  const rotOverride = useMemo(() => {
    if (pendingRes && rotatingModel && safe(() => pendingRes.CharacterId.Equals(rotatingModel.Id), false)) {
      const startChar = none(pendingRes.InitialRotatingCharacterBeforeReset)
        ? G.ModelDb.Character(G.Ironclad).Id
        : pendingRes.InitialRotatingCharacterBeforeReset;
      if (!(pendingRes.WasReset && pendingRes.WinStreakBeforeReset === 0)) {
        const prevId = G.AscensionHelper.GetRotatingCharacterIdForStreak(startChar, pendingRes.WinStreakBeforeReset);
        return safe(() => G.ModelDb.GetById(G.CharacterModel, prevId), null);
      }
    }
    if (currentRotatingStreak > 0) {
      return safe(() => G.AscensionHelper.GetNextRotatingDreadCharacter(false), null);
    }
    return null;
  }, [pendingRes, currentRotatingStreak]);

  const buttons = [
    ...chars,
    ...(rotOverride && rotatingModel ? [{ c: rotatingModel, locked: false, rotHero: rotOverride }] : []),
  ];

  const [sel, setSel] = useState<{ c: any; locked: boolean; n: number } | null>(null);
  const [ticked, setTicked] = useState<boolean>(() => safe(() => {
    return G.SaveManager.Instance.Progress.PreferredDreadRotatingTickboxOnSingleplayer;
  }, false));
  const [busy, setBusy] = useState(false);
  const [animatingChain, setAnimatingChain] = useState(false);
  const [chainMode, setChainMode] = useState<'idle' | 'add' | 'break'>('idle');
  const [disclaimer, setDisclaimer] = useState<{ delayed: boolean } | null>(null);

  // 解析用于标题/背景/灰度的目标英雄（RotatingCharacter 对应轮换目标角色）
  const resolveDisplayChar = (c: any) => {
    if (!isRotatingChar(c)) return c;
    return rotOverride ?? safe(() => G.AscensionHelper.GetNextRotatingDreadCharacter(false), null) ?? chars[0].c;
  };

  const applyVisuals = (c: any) => {
    const display = resolveDisplayChar(c);
    void charSelectBg(String(display.Id.Entry).toLowerCase());
    setCharSelectGrayscale(safe(() => display.DreadBgBrightness, 0.7), safe(() => display.DreadBgContrast, 1.1));
  };

  // 打开界面时选中上次记忆的角色并检查首次规则弹窗与连胜动画
  useEffect(() => {
    if (!safe(() => G.SaveManager.Instance.SeenPopup('dread_disclaimer'), true)) {
      setDisclaimer({ delayed: true });
    }
    const p = safe(() => G.SaveManager.Instance.Progress, null);
    let prefId = p?.PreferredDreadCharacter;
    if (pendingRes && rotatingModel && safe(() => pendingRes.CharacterId.Equals(rotatingModel.Id), false) && pendingRes.WasReset && pendingRes.WinStreakBeforeReset === 0) {
      const startChar = none(pendingRes.InitialRotatingCharacterBeforeReset)
        ? G.ModelDb.Character(G.Ironclad).Id
        : pendingRes.InitialRotatingCharacterBeforeReset;
      prefId = G.AscensionHelper.GetRotatingCharacterIdForStreak(startChar, 1);
      if (p) {
        p.PreferredDreadCharacter = prefId;
        p.PendingSingleplayerDreadWinStreakResult = null;
        G.SaveManager.Instance.SaveProgressFile();
      }
      setPendingRes(null);
    }

    const prefBtn = !none(prefId) ? buttons.find((x) => !x.locked && safe(() => x.c.Id.Equals(prefId), false)) : null;
    const initial = prefBtn ?? buttons[0];
    setSel({ c: initial.c, locked: initial.locked, n: 1 });
    const display = resolveDisplayChar(initial.c);
    playOneShot(display.CharacterSelectSfx);
    applyVisuals(initial.c);
    return () => { setCharSelectGrayscale(); void charSelectBg(null); };
  }, []);

  // 判断当前选角是否命中待播放的连胜增加 / 断链结果
  useEffect(() => {
    if (!sel || !pendingRes) {
      setChainMode('idle');
      setAnimatingChain(false);
      return;
    }
    const match = safe(() => pendingRes.CharacterId.Equals(sel.c.Id), false);
    if (!match || (pendingRes.WasReset && pendingRes.WinStreakBeforeReset === 0)) {
      setChainMode('idle');
      setAnimatingChain(false);
      return;
    }
    setAnimatingChain(true);
    setChainMode(pendingRes.WasReset ? 'break' : pendingRes.WinStreakIncrease > 0 ? 'add' : 'idle');
  }, [sel?.c, pendingRes]);

  const finishChainAnim = () => {
    setAnimatingChain(false);
    setChainMode('idle');
    safe(() => {
      const p = G.SaveManager.Instance.Progress;
      p.PendingSingleplayerDreadWinStreakResult = null;
      if (pendingRes && rotatingModel && safe(() => pendingRes.CharacterId.Equals(rotatingModel.Id), false) && pendingRes.WasReset) {
        const startChar = none(pendingRes.InitialRotatingCharacterBeforeReset)
          ? G.ModelDb.Character(G.Ironclad).Id
          : pendingRes.InitialRotatingCharacterBeforeReset;
        const nextId = G.AscensionHelper.GetRotatingCharacterIdForStreak(startChar, pendingRes.WinStreakBeforeReset + 1);
        const nextBtn = buttons.find((b) => safe(() => b.c.Id.Equals(nextId), false));
        if (nextBtn) {
          p.PreferredDreadCharacter = nextId;
          setSel({ c: nextBtn.c, locked: nextBtn.locked, n: (sel?.n ?? 0) + 1 });
          applyVisuals(nextBtn.c);
        }
      }
      G.SaveManager.Instance.SaveProgressFile();
    }, undefined);
    setPendingRes(null);
  };

  const select = (c: any, locked: boolean) => {
    if (animatingChain || sel?.c === c) return;
    shake();
    playOneShot(resolveDisplayChar(c).CharacterSelectSfx);
    applyVisuals(c);
    setSel({ c, locked, n: (sel?.n ?? 0) + 1 });
  };

  const showRotTickbox = !!sel && !isRotatingChar(sel.c) && currentRotatingStreak <= 0;
  const isBeginningRot = showRotTickbox && ticked;
  const showChain = !showRotTickbox || !ticked || chainMode === 'break';

  // 计算当前锁链数与历史最佳连胜记录
  const { chainCount, recordLines } = useMemo(() => {
    if (!sel) return { chainCount: 0, recordLines: [] as { label: string; value: number }[] };
    const p = safe(() => G.SaveManager.Instance.Progress, null);
    const stats = safe(() => p?.GetStatsForCharacter(sel.c.Id), null);
    const curStreak = stats?.CurrentSingleplayerDreadWinStreak ?? 0;
    const cnt = chainMode === 'break' && pendingRes ? (pendingRes.WinStreakBeforeReset ?? 0) : curStreak;

    const recModel = isBeginningRot && rotatingModel ? rotatingModel : sel.c;
    const recStats = safe(() => p?.GetStatsForCharacter(recModel.Id), null);
    const [bestCur, bestOld, oldVer] = safe(() => G.ProgressSaveManager.ReconcileDreadWinStreakVersion(
      GAME_VERSION,
      recStats?.BestSingleplayerDreadWinStreakThisVersion ?? 0,
      recStats?.BestSingleplayerDreadWinStreakThisVersionTag ?? null,
      recStats?.BestSingleplayerDreadWinStreakOldVersion ?? 0,
      recStats?.BestSingleplayerDreadWinStreakOldVersionTag ?? null,
    ), [0, 0, '']);

    const lines: { label: string; value: number }[] = [];
    const rot = isRotatingChar(recModel);
    if (bestCur > 0) {
      lines.push({ label: loc('main_menu_ui', rot ? 'DREAD_BEST_ROTATING_STREAK' : 'DREAD_BEST_STREAK'), value: bestCur });
    }
    if (bestOld > bestCur) {
      lines.push({ label: locv('main_menu_ui', rot ? 'DREAD_BEST_ROTATING_STREAK_OLD' : 'DREAD_BEST_STREAK_OLD', { Version: oldVer }), value: bestOld });
    }
    return { chainCount: cnt, recordLines: lines };
  }, [sel?.c, isBeginningRot, chainMode, pendingRes]);

  const embark = async () => {
    if (!sel || sel.locked || animatingChain || busy) return;
    setBusy(true);
    const isRotRun = isRotatingChar(sel.c) || isBeginningRot;
    const embarkChar = isRotatingChar(sel.c) ? resolveDisplayChar(sel.c) : sel.c;
    // 保存恐惧模式偏好角色与轮换连胜起始角色状态
    safe(() => {
      const p = G.SaveManager.Instance.Progress;
      p.PreferredDreadCharacter = sel.c.Id;
      p.PreferredDreadRotatingTickboxOnSingleplayer = isRotRun;
      if (isBeginningRot && rotatingModel) {
        p.CurrentSingleplayerDreadStartingCharacterForRotation = embarkChar.Id;
        p.PreferredDreadCharacter = rotatingModel.Id;
      }
      G.SaveManager.Instance.SaveProgressFile();
    }, undefined);

    await acceptTutorialsFtue();
    stopMusic();
    playOneShot(embarkChar.CharacterTransitionSfx);
    await transitionView.FadeOut(0.8, embarkChar.CharacterSelectTransitionPath);
    await startRun(embarkChar, {
      ascension: 10,
      gameMode: G.GameMode.Dread,
      isRotatingDread: isRotRun,
    });
  };

  const displayChar = sel ? resolveDisplayChar(sel.c) : null;
  const nameTitle = sel && displayChar
    ? (isRotatingChar(sel.c)
        ? locv('main_menu_ui', 'DREAD_ROTATION_CHARACTER', { CharacterName: fmt(displayChar.ShortTitle) })
        : fmt(displayChar.Title))
    : '';
  const nameColor = cssColor(safe(() => displayChar?.DreadNameColor, null));

  return (
    <div class="charselect dread">
      {sel && isRotatingChar(sel.c) && displayChar && (
        <img
          class="drd-bg-rotating"
          src={imageUrl('images/ui/main_menu/rotating_character.png') ?? ''}
          style={{ filter: `grayscale(1) contrast(${safe(() => displayChar.DreadBgContrast, 1.1)}) brightness(${safe(() => displayChar.DreadBgBrightness, 0.7)})` }}
        />
      )}
      {sel && <DreadNameText text={nameTitle} color={nameColor} animKey={`${sel.c.Id.Entry}|${sel.n}`} />}
      <ChainVisualization count={chainCount} mode={chainMode} visible={showChain} onAnimDone={finishChainAnim} />
      {showRotTickbox && (
        <DreadBeginRotationTickbox
          ticked={ticked}
          enabled={!busy && !animatingChain}
          onToggle={() => setTicked((t) => !t)}
        />
      )}
      <div class="chs-buttons" style={{ left: `${960 - (buttons.length * 116 - 16) / 2}px` }}>
        {buttons.map(({ c, locked }) => (
          <CharacterSelectButton
            key={c.Id.Entry}
            c={c}
            locked={locked}
            selected={sel?.c === c}
            enabled={!busy && !animatingChain}
            onSelect={() => select(c, locked)}
          />
        ))}
      </div>
      {recordLines.length > 0 && (
        <div class="drd-score-container">
          <div class="drd-score-labels">{recordLines.map((l) => l.label).join('\n')}</div>
          <div class="drd-score-values">{recordLines.map((l) => String(l.value)).join('\n')}</div>
        </div>
      )}
      <ModeInfoButton onClick={() => setDisclaimer({ delayed: false })} />
      <BackButton enabled={!busy && !animatingChain} onClick={popMenu} />
      <ConfirmButton enabled={!!sel && !sel.locked && !animatingChain && !busy} onClick={() => void embark()} />
      {disclaimer && <DreadInfoDisclaimer delayed={disclaimer.delayed} onClose={() => setDisclaimer(null)} />}
    </div>
  );
}
