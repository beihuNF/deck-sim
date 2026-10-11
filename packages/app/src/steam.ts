import { invalidate } from './store';
export const steam = { profile: null as { steamId: string; name: string; avatar: string } | null, loading: true, error: false };
export async function loadSteamProfile() {
  try {
    const response = await fetch('/api/auth/me', { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error('profile');
    steam.profile = (await response.json()).profile; steam.error = false;
  } catch { steam.error = true; }
  steam.loading = false; invalidate();
}
export function loginSteam() {
  location.assign('/api/auth/steam/login?return=' + encodeURIComponent(location.pathname + location.search));
}
export async function logoutSteam() {
  const response = await fetch('/api/auth/logout', { method: 'POST' });
  if (response.ok) { steam.profile = null; invalidate(); }
}
