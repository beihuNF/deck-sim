// The feedback screen (NSendFeedbackScreen's job: NGame keeps one over everything, the settings' Feedback button opens
// it), drawn with the port's existing pieces instead of the game's pink panel: the rewards screen's reward_panel and
// reward_banner (and its AnimateIn), the custom run's seed input, the settings button and the disclaimer's exit (1000 px
// up, 0.5 s Back In). The game's text: header, Send!, sending / result labels; no category or emoji.
// The feedback goes to the port's author (Tianji survey), not Mega Crit, and the placeholder says so; no screenshot or
// logs; the text is kept when sending fails. The main menu has an entry of its own (ui/menu.tsx PortLinks).
import { useEffect, useRef, useState } from 'preact/hooks';
import { G, GAME_VERSION } from '../game';
import { invalidate } from '../store';
import { playOneShot } from '../audio';
import { imageUrl } from '../assets';
import { loc, appText } from '../i18n';
import { BackButton } from './buttons';
import { SettingsButton } from './settings';
import type { BrowserDetailInfo } from 'browser-tool';

const s = (k: string) => loc('settings_ui', k);
const SURVEY_URL = 'https://app.tianji.dev/open/workspace/cmv45lubl27755xc7mytpfzcm/survey/cmv45se5t2ash5xc74929ds2n/submit';

let open = false;
// what survives a close: Open clears it when the screen was closed for over a minute
const draft = { text: '', closedAt: 0 };
export const feedbackOpen = () => open;
/** NSendFeedbackScreen.Open. */
export function openFeedback() {
  if (Date.now() - draft.closedAt > 60000) draft.text = '';
  open = true;
  invalidate();
}
function close() { open = false; draft.closedAt = Date.now(); invalidate(); }

const safe = <T,>(f: () => T, d: T) => { try { return f(); } catch { return d; } };

/**
 * 使用 mumuy/browser 智能识别用户所处浏览器、系统与硬件环境（异步懒加载）
 */
async function collectBrowserDiagnostics(): Promise<BrowserDetailInfo> {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  try {
    const mod = await import('browser-tool');
    const browser = (mod as any).default ?? mod;
    const parsed = safe(() => browser.parse(ua), {} as any);

    // 在真实浏览器环境尝试获取 GPU、屏幕刷新率、内存等高级特征（带 500ms 超时保护防阻断）
    if (typeof window !== 'undefined' && typeof requestAnimationFrame !== 'undefined') {
      try {
        const advanced = await Promise.race([
          browser.getInfo(['browser', 'system', 'device', 'gpu', 'network', 'screen', 'language', 'timezone']),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 500)),
        ]);
        if (advanced) {
          return { ...parsed, ...advanced };
        }
      } catch {
        // 降级使用基础 UA 结构化解析
      }
    }

    return parsed;
  } catch {
    return {} as any;
  }
}

/**
 * 格式化输出易读的环境诊断报告
 */
function buildDiagnosticReport(bInfo: BrowserDetailInfo): string {
  const dpr = typeof window !== 'undefined' && window.devicePixelRatio ? ` (DPR: ${window.devicePixelRatio})` : '';
  const lines: string[] = [
    '------------------------------',
    '【环境诊断信息 / System Diagnostics】',
    `- 游戏版本: v${GAME_VERSION} (${__BUILD_ID__})`,
    `- 游戏语言: ${safe(() => G.LocManager.Instance.Language, 'zhs')}`,
    `- 视口分辨率: ${innerWidth}x${innerHeight}${dpr}`,
  ];

  const state = safe(() => G.RunManager.Instance?.State, null);
  if (state) {
    const isMp = safe(() => state.IsMultiplayer, false);
    const seed = safe(() => state.Rng?.StringSeed, '');
    const char = safe(() => state.LocalPlayer?.Character?.Id, '');
    const act = safe(() => state.CurrentActId, '');
    const floor = safe(() => state.Floor, 0);
    const room = safe(() => state.CurrentRoom?.MapRoomType ?? state.CurrentRoom?.constructor?.name, '');

    lines.push(`- 游戏模式: ${isMp ? '多人联机' : '单人模式'}`);
    if (seed) lines.push(`- 对局种子: ${seed}`);
    if (char) lines.push(`- 玩家角色: ${char}`);
    if (act || floor) lines.push(`- 所在关卡: ${act ? `${act} ` : ''}第 ${floor} 层`);
    if (room) lines.push(`- 当前房间: ${room}`);
  } else {
    lines.push('- 对局状态: 主菜单 / 未在对局中');
  }

  // 接入 mumuy/browser 智能识别信息
  const browserLabel = [bInfo.browser, bInfo.browserVersion].filter(Boolean).join(' ') || '未知浏览器';
  const engineLabel = bInfo.engine ? ` (${bInfo.engine} 内核)` : '';
  lines.push(`- 浏览器: ${browserLabel}${engineLabel}`);

  const sysLabel = [bInfo.system, bInfo.systemVersion].filter(Boolean).join(' ') || '未知系统';
  const archLabel = bInfo.architecture ? ` [${bInfo.architecture}${bInfo.bitness ? ` ${bInfo.bitness}位` : ''}]` : '';
  lines.push(`- 操作系统: ${sysLabel}${archLabel} (${bInfo.device || '未知设备'})`);

  if (bInfo.isWebview !== undefined) {
    lines.push(`- 运行形态: ${bInfo.isWebview ? '应用内置 WebView 容器' : '独立浏览器'}`);
  }

  const gpuName = bInfo.gpuModel || bInfo.gpu;
  if (gpuName) {
    lines.push(`- 图形渲染 (GPU): ${gpuName}`);
  }

  if (bInfo.screenFPS) {
    lines.push(`- 屏幕刷新率: ~${bInfo.screenFPS} FPS`);
  }

  if (bInfo.deviceMemory) {
    lines.push(`- 设备参考内存: ~${bInfo.deviceMemory} GB`);
  }

  if (bInfo.network) {
    lines.push(`- 网络类型: ${bInfo.network}`);
  }

  lines.push(`- 完整 UA: ${navigator.userAgent}`);
  return lines.join('\n');
}

async function send(text: string): Promise<boolean> {
  if (!text.trim()) return true; // SendFeedback: nothing to send, success anyway
  const trimmed = text.trim();
  const bInfo = await collectBrowserDiagnostics();
  const diagnostics = buildDiagnosticReport(bInfo);
  const fullContent = `${trimmed}\n\n${diagnostics}`;

  const payload = {
    content: fullContent,
    field_RnoN: fullContent,
    userText: trimmed,
    build: __BUILD_ID__,
    version: `v${GAME_VERSION}`,
    gameLanguage: safe(() => G.LocManager.Instance.Language, ''),
    viewport: `${innerWidth}x${innerHeight}`,
    seed: safe(() => G.RunManager.Instance.State?.Rng.StringSeed ?? '', ''),
    // mumuy/browser 结构化诊断字段
    browser: bInfo.browser || '',
    browserVersion: bInfo.browserVersion || '',
    system: bInfo.system || '',
    systemVersion: bInfo.systemVersion || '',
    engine: bInfo.engine || '',
    device: bInfo.device || '',
    isWebview: Boolean(bInfo.isWebview),
    gpu: String(bInfo.gpuModel || bInfo.gpu || ''),
    userAgent: navigator.userAgent,
  };
  try {
    const r = await fetch(SURVEY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload }) });
    return r.ok;
  } catch { return false; }
}

type Phase = '' | 'sending' | 'success' | 'failed';
const STATUS: Record<Phase, string> = { '': '', sending: 'FEEDBACK_SENDING_LABEL', success: 'FEEDBACK_SEND_SUCCESS_LABEL', failed: 'FEEDBACK_SEND_FAILED_LABEL' };
export function FeedbackScreen() {
  const [, rerender] = useState(0);
  const [phase, setPhase] = useState<Phase>('');
  const [leaving, setLeaving] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const timers = useRef<number[]>([]), alive = useRef(true);
  useEffect(() => { input.current?.focus(); return () => { alive.current = false; timers.current.forEach(clearTimeout); }; }, []);
  const update = () => rerender((n) => n + 1);
  const later = (ms: number, f: () => void) => { timers.current.push(window.setTimeout(f, ms)); };
  const pressSend = async () => {
    if (phase === 'sending' || phase === 'success') return;
    setPhase('sending');
    const text = draft.text, ok = await send(text);
    if (ok && draft.text === text) draft.text = ''; // ClearInput (unless reopened and edited meanwhile)
    if (!alive.current) return;
    setPhase(ok ? 'success' : 'failed');
    if (ok) { later(1200, () => setLeaving(true)); later(1700, close); }
  };
  return (
    <div class="feedback-screen">
      <div class="fb-bg" />
      <div class={'fb-panel' + (leaving ? ' leaving' : '')}>
        <img class="fb-panel-bg" src={imageUrl('images/ui/reward_screen/reward_panel.png') ?? ''} />
        <div class="fb-banner">
          <img src={imageUrl('images/ui/reward_screen/reward_banner.png') ?? ''} />
          <div class="fb-header">{s('SEND_FEEDBACK')}</div>
        </div>
        <textarea class="fb-input" ref={input} value={draft.text} maxLength={500} placeholder={appText('feedbackPlaceholder')}
          onInput={(e) => { draft.text = (e.target as HTMLTextAreaElement).value; update(); }}
          onKeyDown={(e) => { if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur(); }} />
        <div class={'fb-status ' + phase}>{STATUS[phase] && s(STATUS[phase])}</div>
        <div class={'fb-send' + (phase === 'sending' || phase === 'success' ? ' busy' : '')}>
          <SettingsButton r={{ kind: 'button', label: '', text: s('FEEDBACK_SEND_BUTTON_LABEL'), hsv: [0.82, 1.4, 0.8], outline: 'rgb(32, 66, 36)', onClick: () => void pressSend() }} />
        </div>
      </div>
      <BackButton enabled onClick={close} />
    </div>
  );
}
