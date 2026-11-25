// 闪电模式（NBlitzScreen）与说明弹窗（NBlitzInfoDisclaimer）
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from 'preact/hooks';
import { G, list } from '../game';
import { playOneShot, stopMusic } from '../audio';
import { imageUrl } from '../assets';
import { loc } from '../i18n';
import { startRun } from '../flow';
import { hsvFilter } from '../filters';
import { charSelectBg } from '../render/scene';
import { acceptTutorialsFtue } from './ftue';
import { RichText } from './richtext';
import { BackButton, ConfirmButton } from './buttons';
import { InfoPanel, CharacterSelectButton, AscensionPanel, RegentHovers } from './charselect';
import { transitionView } from './transition';
import { characters, popMenu } from './menu';
import './blitz.css';

const safe = <T,>(f: () => T, d: T) => { try { return f(); } catch { return d; } };
const none = (id: any) => !id || id === G.ModelId.none || safe(() => id.Equals(G.ModelId.none), false);
const isRandom = (c: any) => !!G.RandomCharacter && c instanceof G.RandomCharacter;
const shake = () => safe(() => (window as any).__sts2Shake?.(), null);

/** 右上角模式说明问号按钮（NDreadInfoButton，闪电/恐惧模式共用） */
export function ModeInfoButton({ onClick }: { onClick: () => void }) {
  const [st, setSt] = useState<'' | 'hover' | 'press'>('');
  const scale = st === 'press' ? 0.95 : st === 'hover' ? 1.1 : 1;
  const alpha = st === 'press' ? 0.7 : st === 'hover' ? 1 : 0.5;
  const trans = st ? 'none' : 'transform .5s cubic-bezier(0.16, 1, 0.3, 1), opacity .5s cubic-bezier(0.16, 1, 0.3, 1)';
  const icon = imageUrl('images/packed/character_select/dread_question_mark.png') ?? '';
  return (
    <div
      class="mode-info-btn"
      data-ctl
      onPointerEnter={() => { setSt('hover'); playOneShot('event:/sfx/ui/clicks/ui_hover'); }}
      onPointerLeave={() => setSt('')}
      onPointerDown={(e) => { if (e.button === 0) { setSt('press'); playOneShot('event:/sfx/ui/clicks/ui_click'); } }}
      onPointerUp={(e) => { if (e.button === 0 && st === 'press') { setSt('hover'); onClick(); } }}
    >
      <img class="mib-shadow" src={icon} style={{ transform: `scale(${scale})`, transition: trans }} />
      <img class="mib-icon" src={icon} style={{ transform: `scale(${scale})`, opacity: alpha, transition: trans }} />
    </div>
  );
}

/** 规则确认按钮（NDreadDisclaimerConfirmButton，闪电/恐惧弹窗共用） */
export function DisclaimerConfirmButton({ onClick }: { onClick: () => void }) {
  const [st, setSt] = useState<'' | 'hover' | 'press'>('');
  const scale = st === 'press' ? 0.95 : st === 'hover' ? 1.1 : 1.05;
  const v = st === 'press' ? 0.6 : st === 'hover' ? 1.2 : 0.8;
  const trans = st ? 'none' : 'transform .3s cubic-bezier(0.16, 1, 0.3, 1), filter .3s cubic-bezier(0.16, 1, 0.3, 1)';
  return (
    <div
      class="disc-confirm-btn"
      data-ctl
      style={{ transform: `scale(${scale})`, transition: trans }}
      onPointerEnter={() => { setSt('hover'); playOneShot('event:/sfx/ui/clicks/ui_hover'); }}
      onPointerLeave={() => setSt('')}
      onPointerDown={(e) => { if (e.button === 0) { setSt('press'); playOneShot('event:/sfx/ui/clicks/ui_click'); } }}
      onPointerUp={(e) => { if (e.button === 0 && st === 'press') { setSt(''); onClick(); } }}
    >
      <img
        class="dcb-bg"
        src={imageUrl('images/ui/reward_screen/reward_skip_button.png') ?? ''}
        style={{ filter: hsvFilter(0.48, 1.5, v), transition: trans }}
      />
      <div class="dcb-label">{loc('main_menu_ui', 'DREAD_DISCLAIMER.confirmButton')}</div>
    </div>
  );
}

/** NBlitzInfoDisclaimer：闪电模式首次进入提示弹窗 */
export function BlitzInfoDisclaimer({ delayed, onClose }: { delayed: boolean; onClose: () => void }) {
  const [closing, setClosing] = useState(false);
  const close = () => {
    if (closing) return;
    setClosing(true);
    safe(() => G.SaveManager.Instance.MarkFtueAsComplete('blitz_disclaimer'), undefined);
    setTimeout(onClose, 200);
  };
  return (
    <div class={'mode-disclaimer blitz-disc' + (delayed ? ' delayed' : '') + (closing ? ' closing' : '')}>
      <div class="md-bg" />
      <div class="md-panel" style={{ '--panel-hue': hsvFilter(0.034, 1, 1) } as any}>
        <img class="md-panel-img" src={imageUrl('images/ui/reward_screen/reward_panel.png') ?? ''} style={{ filter: hsvFilter(0.034, 1, 1) }} />
        <div class="md-content">
          <div class="md-header">{loc('main_menu_ui', 'BLITZ_DISCLAIMER.title')}</div>
          <div class="md-desc"><RichText text={loc('main_menu_ui', 'BLITZ_DISCLAIMER.description')} /></div>
        </div>
        <DisclaimerConfirmButton onClick={close} />
      </div>
    </div>
  );
}

/** 闪电模式选角界面（NBlitzScreen） */
export function BlitzSelect() {
  const chars = characters();
  const showRandom = chars.every((x) => !x.locked);
  const random = showRandom ? safe(() => G.ModelDb.Character(G.RandomCharacter), null) : null;
  const buttons = [...chars, ...(random ? [{ c: random, locked: false }] : [])];

  const [sel, setSel] = useState<{ c: any; locked: boolean; n: number } | null>(null);
  const [level, setLevel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [disclaimer, setDisclaimer] = useState<{ delayed: boolean } | null>(null);

  const max = safe(() => G.SaveManager.Instance.Progress.MaxBlitzAscension, 0);

  // 打开界面时选中记忆的 Blitz 角色、初始化闪电进阶并按需弹出首次说明
  useEffect(() => {
    if (!safe(() => G.SaveManager.Instance.SeenPopup('blitz_disclaimer'), true)) {
      setDisclaimer({ delayed: true });
    }
    const p = safe(() => G.SaveManager.Instance.Progress, null);
    const prefAsc = p?.PreferredBlitzAscension ?? 0;
    setLevel(Math.min(prefAsc, max));
    const prefId = p?.PreferredBlitzCharacter;
    const prefBtn = !none(prefId) ? buttons.find((x) => !x.locked && safe(() => x.c.Id.Equals(prefId), false)) : null;
    const initial = prefBtn ?? buttons[0];
    setSel({ c: initial.c, locked: initial.locked, n: 1 });
    if (!isRandom(initial.c)) playOneShot(initial.c.CharacterSelectSfx);
    void charSelectBg(initial.locked ? null : isRandom(initial.c) ? 'random_character' : String(initial.c.Id.Entry).toLowerCase());
    return () => { void charSelectBg(null); };
  }, []);

  const select = (c: any, locked: boolean) => {
    if (sel?.c === c) return;
    if (!isRandom(c)) playOneShot(c.CharacterSelectSfx);
    shake();
    void charSelectBg(locked ? null : isRandom(c) ? 'random_character' : String(c.Id.Entry).toLowerCase());
    setSel({ c, locked, n: (sel?.n ?? 0) + 1 });
  };

  const changeLevel = (n: number) => {
    const clamped = Math.min(max, Math.max(0, n));
    setLevel(clamped);
    safe(() => {
      const p = G.SaveManager.Instance.Progress;
      if (p.PreferredBlitzAscension !== clamped) {
        p.PreferredBlitzAscension = clamped;
        G.SaveManager.Instance.SaveProgressFile();
      }
    }, undefined);
  };

  const embark = async () => {
    if (!sel || sel.locked || busy) return;
    setBusy(true);
    // 启程前记录玩家选择的闪电模式角色（含 RandomCharacter）
    safe(() => {
      const p = G.SaveManager.Instance.Progress;
      if (!p.PreferredBlitzCharacter?.Equals?.(sel.c.Id)) {
        p.PreferredBlitzCharacter = sel.c.Id;
        G.SaveManager.Instance.SaveProgressFile();
      }
    }, undefined);
    await acceptTutorialsFtue();
    let c = sel.c;
    if (isRandom(c)) {
      const all = list(G.ModelDb.AllCharacters);
      c = all[Math.floor(Math.random() * all.length)];
      playOneShot(c.CharacterSelectSfx);
      void charSelectBg(String(c.Id.Entry).toLowerCase());
      await new Promise((r) => setTimeout(r, 1000));
    }
    stopMusic();
    playOneShot(c.CharacterTransitionSfx);
    await transitionView.FadeOut(0.8, c.CharacterSelectTransitionPath);
    await startRun(c, { ascension: Math.min(level, max), gameMode: G.GameMode.Blitz });
  };

  return (
    <div class="charselect blitz">
      {sel && !sel.locked && safe(() => sel.c.Id.Entry === 'REGENT', false) && <RegentHovers key={sel.n} />}
      {sel && <InfoPanel key={sel.n} c={sel.c} locked={sel.locked} />}
      <div class="chs-buttons" style={{ left: `${960 - (buttons.length * 116 - 16) / 2}px` }}>
        {buttons.map(({ c, locked }) => (
          <CharacterSelectButton
            key={c.Id.Entry}
            c={c}
            locked={locked}
            selected={sel?.c === c}
            enabled={!busy}
            onSelect={() => select(c, locked)}
          />
        ))}
      </div>
      {sel && !sel.locked && max > 0 && (
        <AscensionPanel
          key={sel.n}
          gameMode={G.GameMode.Blitz}
          level={Math.min(level, max)}
          max={max}
          onChange={changeLevel}
        />
      )}
      <ModeInfoButton onClick={() => setDisclaimer({ delayed: false })} />
      <BackButton enabled={!busy} onClick={popMenu} />
      <ConfirmButton enabled={!!sel && !sel.locked && !busy} onClick={() => void embark()} />
      {disclaimer && <BlitzInfoDisclaimer delayed={disclaimer.delayed} onClose={() => setDisclaimer(null)} />}
    </div>
  );
}
