// Mega Crit 原版开屏 Logo 动画 (NLogoAnimation) 与原版加载覆盖层 (NLoadingOverlay)
import { useEffect, useRef, useState } from 'preact/hooks';
import { subscribeBootProgress, bootState, finishLogo, type BootState } from '../render/boot-status';
import { A } from '../assets';
import { loc } from '../i18n';
import { playDebug } from '../audio';

const LOGO_SRC = A + 'animations/ui/logo/logo_megacrit_static@0.5x.webp';

export function BootScreen() {
  const [st, setSt] = useState<BootState>(bootState);
  // enter (0~1s): 静默全黑; active (1s~2.5s): Logo从-800px下落弹入并展示; teal (2.5s~4.5s): 背景平滑过渡至Teal(#074254); fadeout: 跳过或收尾淡出; overlay: 加载等待
  const [stage, setStage] = useState<'enter' | 'active' | 'teal' | 'fadeout' | 'overlay'>('enter');
  const cancelled = useRef(false);
  const sfxPlayed = useRef(false);

  // 订阅加载就绪状态
  useEffect(() => {
    return subscribeBootProgress((next) => {
      setSt({ ...next });
    });
  }, []);

  // 严格还原原版 NLogoAnimation 时序 (NLogoAnimation.cs)
  useEffect(() => {
    const timers: number[] = [];

    // 1. 等待 1.0s 静默黑屏 (_tween.TweenInterval(1.0))
    timers.push(window.setTimeout(() => {
      if (cancelled.current) return;
      setStage('active');
      if (!sfxPlayed.current) {
        sfxPlayed.current = true;
        try { playDebug('SOTE_Logo_Echoing_ShortTail.mp3', 0.9); } catch {}
      }
    }, 1000));

    // 2. 动画播放约 1.5s 后，背景开始平滑渐变到 Teal 色 (#074254，持续 2.0s，Cubic Out)
    timers.push(window.setTimeout(() => {
      if (cancelled.current) return;
      setStage('teal');
    }, 2500));

    // 3. 背景变色完成后，静默等待 1.0s (_tween.TweenInterval(1.0))，随后完成
    timers.push(window.setTimeout(() => {
      if (cancelled.current) return;
      setStage('fadeout');
    }, 4500));

    timers.push(window.setTimeout(() => {
      if (cancelled.current) return;
      finishLogo();
      setStage('overlay');
    }, 4800));

    return () => {
      timers.forEach(clearTimeout);
    };
  }, []);

  // 用户点击或按键跳过 (对齐原版 token.IsCancellationRequested: 0.25s Expo Out 渐变消失)
  const handleSkip = () => {
    if (stage === 'overlay' || cancelled.current) return;
    cancelled.current = true;
    setStage('fadeout');
    setTimeout(() => {
      finishLogo();
      setStage('overlay');
    }, 250);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['Space', 'Enter', 'Escape'].includes(e.code) || e.key === ' ') {
        handleSkip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage]);

  const isZh = document.documentElement.dataset.lang === 'zhs';
  const loadingText = loc('main_menu_ui', 'LOADING_OVERLAY.label') || (isZh ? '正在加载...' : 'Loading...');

  return (
    <div
      class={`boot-screen ${stage === 'teal' ? 'boot-bg-teal' : ''}`}
      onClick={handleSkip}
    >
      {/* Mega Crit 原版开场 Logo 动画 (无任何多余的跳过文字提示，纯净黑屏开场) */}
      {stage !== 'overlay' && (
        <div class={`boot-logo-container boot-logo-${stage}`}>
          <img
            class="boot-logo-img"
            src={LOGO_SRC}
            alt="Mega Crit"
            draggable={false}
          />
        </div>
      )}

      {/* 若 Logo 播放完毕或跳过时后台着色器/场景预热尚未完成，展示原版 NLoadingOverlay */}
      {stage === 'overlay' && !st.ready && (
        <div class="boot-original-loading-overlay">
          <div class="boot-loading-text">{loadingText}</div>
        </div>
      )}
    </div>
  );
}
