import { imageUrl } from './assets';
import { onViewChange } from './view';

/**
 * 杀戮尖塔2 原版鼠标光标管理系统
 *
 * 核心特性：
 * 1. 智能缩放：原版资源为 64×64 物理像素，直接作为 CSS 指针会显得过于庞大且粗糙。
 *    本模块利用离屏 Canvas 将贴图抗锯齿重采样缩放到最适宜的视觉基准尺寸（默认 30px），
 *    并根据视口缩放动态智能微调（22px ~ 40px），确保无论窗口大小如何，光标与 UI 的比例都和谐精致。
 * 2. 尖端热点精准对齐：严格遵循原版 C# NCursorManager 的 _defaultHotSpot (14, 5) 规范，
 *    缩放后按比例计算热点偏移，确保点击判定 100% 像素级对准针尖，杜绝偏移。
 * 3. 沉浸式交互：遵循原版设计，全局消除系统原生手型（pointer），指向选项时保持游戏原版光标，
 *    并在鼠标按压时自然切换为原版倾斜光标 (cursor_tilted)。
 */

const ORIGINAL_SIZE = 64;
const DEFAULT_HOTSPOT_X = 14;
const DEFAULT_HOTSPOT_Y = 5;

let defaultImg: HTMLImageElement | null = null;
let tiltedImg: HTMLImageElement | null = null;
let currentAppliedSize = 0;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 智能计算最适宜的光标渲染像素大小
 * 基准 30px，随视口相对 1920×1080 比例在 [22, 40] 范围内自适应
 */
export function calculateOptimalCursorSize(): number {
  if (typeof window === 'undefined') return 30;
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  const scale = Math.min(winW / 1920, winH / 1080);
  const target = Math.round(30 * Math.max(0.75, Math.min(1.35, scale)));
  return Math.max(22, Math.min(40, target));
}

/**
 * 使用离屏 Canvas 高清重采样缩放光标贴图并生成 Data URL
 */
function renderCursorDataUrl(img: HTMLImageElement, size: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return img.src;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, size, size);
  return canvas.toDataURL('image/png');
}

/**
 * 应用并更新当前光标到全局 CSS 变量
 */
export function updateGameCursor(force = false): void {
  if (typeof document === 'undefined' || !defaultImg || !tiltedImg) return;
  if (!defaultImg.complete || !tiltedImg.complete) return;

  // 纯触摸移动设备无需挂载自定义鼠标指针
  if (window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches) {
    return;
  }

  const targetSize = calculateOptimalCursorSize();
  // 尺寸变化小于 2px 时跳过，避免多余重绘
  if (!force && Math.abs(targetSize - currentAppliedSize) < 2) return;

  currentAppliedSize = targetSize;
  const ratio = targetSize / ORIGINAL_SIZE;
  const hx = Math.round(DEFAULT_HOTSPOT_X * ratio);
  const hy = Math.max(1, Math.round(DEFAULT_HOTSPOT_Y * ratio));

  try {
    const defData = renderCursorDataUrl(defaultImg, targetSize);
    const tiltData = renderCursorDataUrl(tiltedImg, targetSize);

    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--game-cursor-default', `url("${defData}") ${hx} ${hy}, auto`);
    rootStyle.setProperty('--game-cursor-tilted', `url("${tiltData}") ${hx} ${hy}, auto`);
  } catch (err) {
    console.warn('[Cursor] Failed to render scaled cursor canvas:', err);
  }
}

/**
 * 初始化游戏自定义光标系统
 */
export function initGameCursor(): void {
  if (typeof document === 'undefined') return;

  const toAbs = (url: string) => (url.startsWith('/') || url.startsWith('http') ? url : '/' + url);
  const defUrl = imageUrl('images/packed/common_ui/cursor_default.webp');
  const tiltUrl = imageUrl('images/packed/common_ui/cursor_tilted.webp');

  if (!defUrl || !tiltUrl) return;

  // 初始快速兜底：使用原始贴图与原版 (14, 5) 尖端热点
  document.documentElement.style.setProperty('--game-cursor-default', `url("${toAbs(defUrl)}") ${DEFAULT_HOTSPOT_X} ${DEFAULT_HOTSPOT_Y}, auto`);
  document.documentElement.style.setProperty('--game-cursor-tilted', `url("${toAbs(tiltUrl)}") ${DEFAULT_HOTSPOT_X} ${DEFAULT_HOTSPOT_Y}, auto`);

  // 预载原版贴图并生成高清缩放光标
  defaultImg = new Image();
  tiltedImg = new Image();
  defaultImg.crossOrigin = 'anonymous';
  tiltedImg.crossOrigin = 'anonymous';

  let loadedCount = 0;
  const onLoaded = () => {
    loadedCount++;
    if (loadedCount >= 2) {
      updateGameCursor(true);
    }
  };

  if (defaultImg.complete && defaultImg.naturalWidth > 0) loadedCount++;
  else defaultImg.onload = onLoaded;

  if (tiltedImg.complete && tiltedImg.naturalWidth > 0) loadedCount++;
  else tiltedImg.onload = onLoaded;

  defaultImg.src = toAbs(defUrl);
  tiltedImg.src = toAbs(tiltUrl);

  if (loadedCount >= 2) {
    updateGameCursor(true);
  }

  // 全局鼠标按下状态追踪（还原原版 NCursorManager 的 _isDown 倾斜动画）
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      document.documentElement.classList.add('mouse-down');
    }
  }, { passive: true });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      document.documentElement.classList.remove('mouse-down');
    }
  }, { passive: true });

  // 窗口失焦时清理按压状态
  window.addEventListener('blur', () => {
    document.documentElement.classList.remove('mouse-down');
  });

  // 监听视口变化自适应微调光标尺寸
  onViewChange(() => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => updateGameCursor(false), 150);
  });
}
