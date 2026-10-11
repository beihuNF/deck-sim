import { invalidate } from './store';

export const steam = { profile: null as { steamId: string; name: string; avatar: string } | null, loading: false, error: false };

export async function loadSteamProfile() {
  steam.loading = true;
  try {
    const response = await fetch('/api/auth/me', { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('profile');
    steam.profile = (await response.json()).profile;
    steam.error = false;
  } catch {
    steam.error = true;
  }
  steam.loading = false;
  invalidate();
}

/**
 * 弹出独立窗口进行 Steam 认证，登录成功后通过 postMessage 自动同步并关闭弹窗，
 * 避免整页跳转导致游戏重新加载和动画重播。
 */
export function loginSteam(onSuccess?: () => void) {
  const w = 820, h = 660;
  const left = Math.max(0, Math.floor((window.screen.width - w) / 2));
  const top = Math.max(0, Math.floor((window.screen.height - h) / 2));

  const popup = window.open(
    '/api/auth/steam/login?popup=1',
    'sts2_steam_login',
    `width=${w},height=${h},left=${left},top=${top},status=0,menubar=0,toolbar=0,location=1`
  );

  let timer: any = null;
  const cleanup = () => {
    window.removeEventListener('message', onMessage);
    if (timer) { clearInterval(timer); timer = null; }
  };

  const onMessage = (e: MessageEvent) => {
    if (e.data?.type === 'sts2_steam_login_done') {
      cleanup();
      void loadSteamProfile().then(() => onSuccess?.());
    }
  };

  window.addEventListener('message', onMessage);

  if (popup) {
    timer = setInterval(() => {
      if (popup.closed) {
        cleanup();
        void loadSteamProfile().then(() => onSuccess?.());
      }
    }, 1000);
  } else {
    // 弹窗被拦截时回退到整页跳转
    const returnUrl = new URL(location.href);
    returnUrl.searchParams.set('menu', 'multiplayer');
    location.assign('/api/auth/steam/login?return=' + encodeURIComponent(returnUrl.pathname + returnUrl.search));
  }
}

export async function logoutSteam() {
  const response = await fetch('/api/auth/logout', { method: 'POST' });
  if (response.ok) {
    steam.profile = null;
    invalidate();
  }
}

