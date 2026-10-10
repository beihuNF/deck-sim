// Mega Crit 原版开屏 Logo 动画 (NLogoAnimation) 与原版加载覆盖层 (NLoadingOverlay)
import { useEffect, useRef, useState } from 'preact/hooks';
import { subscribeBootProgress, bootState, finishLogo, type BootState } from '../render/boot-status';
import { A } from '../assets';
import { loc } from '../i18n';
import { playDebug } from '../audio';

const LOGO_SRC = A + 'animations/ui/logo/logo_megacrit_static@0.5x.webp';

export function BootScreen() {
  const [st, setSt] = useState<BootState>(bootState);
  const [animStage, setAnimStage] = useState<'enter' | 'active' | 'fadeout' | 'overlay'>('enter');
  const sfxPlayed = useRef(false);

  // 订阅加载就绪状态
  useEffect(() => {
    return subscribeBootProgress((next) => {
      setSt({ ...next });
    });
  }, []);

  // 播放原版开场动画与音效
  useEffect(() => {
    // 300ms 后弹入 Logo 并播放开场音效
    const tEnter = setTimeout(() => {
      setAnimStage('active');
      if (!sfxPlayed.current) {
        sfxPlayed.current = true;
        try { playDebug('SOTE_Logo_Echoing_ShortTail.mp3', 0.85); } catch {}
      }
    }, 300);

    // 2200ms 后开始自然淡出
    const tFade = setTimeout(() => {
      setAnimStage('fadeout');
    }, 2200);

    // 2500ms 后结束 Logo 阶段
    const tDone = setTimeout(() => {
      finishLogo();
      setAnimStage('overlay');
    }, 2500);

    return () => {
      clearTimeout(tEnter);
      clearTimeout(tFade);
      clearTimeout(tDone);
    };
  }, []);

  // 点击或按键跳过
  const handleSkip = () => {
    if (animStage === 'overlay') return;
    setAnimStage('fadeout');
    setTimeout(() => {
      finishLogo();
      setAnimStage('overlay');
    }, 180);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['Space', 'Enter', 'Escape'].includes(e.code) || e.key === ' ') {
        handleSkip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [animStage]);

  const isZh = document.documentElement.dataset.lang === 'zhs';
  const loadingText = loc('main_menu_ui', 'LOADING_OVERLAY.label') || (isZh ? '正在加载...' : 'Loading...');

  return (
    <div
      class={`boot-screen ${animStage === 'active' ? 'boot-bg-teal' : ''}`}
      onClick={handleSkip}
    >
      {/* Mega Crit 原版开场 Logo 动画 */}
      {animStage !== 'overlay' && (
        <div class={`boot-logo-container boot-logo-${animStage}`}>
          <img
            class="boot-logo-img"
            src={LOGO_SRC}
            alt="Mega Crit"
            draggable={false}
          />
          <div class="boot-skip-hint">
            {isZh ? '点击屏幕或按任意键跳过' : 'Click or press any key to skip'}
          </div>
        </div>
      )}

      {/* 若 Logo 播放完毕或跳过时后台着色器/场景预热尚未完成，展示原版 NLoadingOverlay */}
      {animStage === 'overlay' && !st.ready && (
        <div class="boot-original-loading-overlay">
          <div class="boot-loading-text">{loadingText}</div>
        </div>
      )}
    </div>
  );
}
