import { DurableObject } from 'cloudflare:workers';

export interface SteamProfile { steamId: string; name: string; avatar: string }
export interface AuthEnv { AUTH: DurableObjectNamespace<SteamAuth>; STEAM_WEB_API_KEY?: string }
const endpoint = 'https://steamcommunity.com/openid/login';
const namespace = 'http://specs.openid.net/auth/2.0';
const authJson = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const random = () => crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
function cookieName(req: Request, name: string) { return (new URL(req.url).protocol === 'https:' ? '__Host-' : '') + name; }
function readCookie(req: Request, name: string) {
  const cookies = req.headers.get('Cookie')?.split(';').map(v => v.trim()) ?? [];
  const hostMatch = cookies.find(v => v.startsWith(`__Host-${name}=`));
  if (hostMatch) return hostMatch.split('=')[1] ?? '';
  const plainMatch = cookies.find(v => v.startsWith(`${name}=`));
  return plainMatch ? plainMatch.split('=')[1] ?? '' : '';
}
function cookie(req: Request, name: string, value: string, maxAge: number) {
  return `${cookieName(req, name)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
}
function store(env: AuthEnv, path: string, body: unknown) {
  return env.AUTH.get(env.AUTH.idFromName('steam-sessions')).fetch(new Request(`https://auth/${path}`, { method: 'POST', body: JSON.stringify(body) }));
}
export async function steamIdentity(req: Request, env: AuthEnv): Promise<SteamProfile | null> {
  const token = readCookie(req, 'sts2-steam');
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const res = await store(env, 'session', { token });
  return res.ok ? await res.json<SteamProfile>() : null;
}
/** Strict provider/identity/return URL checks precede Steam's signed-response verification. */
export function validSteamAssertion(params: URLSearchParams, callback: string) {
  const id = params.get('openid.claimed_id') ?? '';
  const match = /^https?:\/\/steamcommunity\.com\/openid\/id\/(7656119\d{10})$/.exec(id);
  const signed = new Set((params.get('openid.signed') ?? '').split(','));
  return !!match && params.get('openid.identity') === id && params.get('openid.ns') === namespace
    && params.get('openid.mode') === 'id_res' && params.get('openid.op_endpoint') === endpoint
    && params.get('openid.return_to') === callback
    && ['op_endpoint', 'claimed_id', 'identity', 'return_to', 'response_nonce', 'assoc_handle'].every(k => signed.has(k));
}

/** Check Steam assertion via GET (standard/recommended) and fallback to POST with browser UA. */
export async function verifySteamSignature(params: URLSearchParams): Promise<boolean> {
  const verification = new URLSearchParams();
  for (const [key, value] of params) {
    if (key.startsWith('openid.')) verification.set(key, value);
  }
  verification.set('openid.mode', 'check_authentication');

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/plain, */*',
  };

  // 1. 优先尝试 GET 请求
  try {
    const getUrl = new URL(endpoint);
    for (const [k, v] of verification) getUrl.searchParams.set(k, v);
    const res = await fetch(getUrl.toString(), {
      method: 'GET',
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    });
    if (res.ok) {
      const text = await res.text();
      if (/is_valid\s*:\s*true/i.test(text)) return true;
    }
  } catch (err) {
    console.warn('[steam] GET verification failed:', err);
  }

  // 2. 回退尝试 POST 请求
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      body: verification,
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    });
    if (res.ok) {
      const text = await res.text();
      if (/is_valid\s*:\s*true/i.test(text)) return true;
    }
  } catch (err) {
    console.error('[steam] POST verification failed:', err);
  }

  return false;
}

export async function authFetch(req: Request, env: AuthEnv) {
  const url = new URL(req.url), path = url.pathname;
  if (path === '/api/auth/me' && req.method === 'GET') return authJson({ profile: await steamIdentity(req, env) });
  if (path === '/api/auth/logout' && req.method === 'POST') {
    if (req.headers.get('Origin') !== url.origin) return authJson({ error: 'origin' }, 403);
    await store(env, 'logout', { token: readCookie(req, 'sts2-steam') });
    return new Response('{}', { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': cookie(req, 'sts2-steam', '', 0) } });
  }
  if (path === '/api/auth/steam/login' && req.method === 'GET') {
    const state = random(), callback = `${url.origin}/api/auth/steam/callback?state=${state}`;
    // Only a local path is accepted; login cannot be used as an external redirector.
    const destination = url.searchParams.get('return') ?? '/';
    const target = new URL(destination, url.origin);
    const returnTo = target.origin === url.origin && !target.pathname.startsWith('/api/') ? target.pathname + target.search : '/';
    await store(env, 'begin', { state, callback, returnTo });
    const login = new URL(endpoint);
    login.search = new URLSearchParams({ 'openid.ns': namespace, 'openid.mode': 'checkid_setup',
      'openid.return_to': callback, 'openid.realm': url.origin + '/',
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select' }).toString();
    return new Response(null, { status: 302, headers: { Location: login.href, 'Cache-Control': 'no-store', 'Set-Cookie': cookie(req, 'sts2-openid', state, 600) } });
  }
  if (path === '/api/auth/steam/callback' && req.method === 'GET') {
    const state = url.searchParams.get('state') ?? '';
    if (!/^[a-f0-9]{64}$/.test(state) || state !== readCookie(req, 'sts2-openid')) return authJson({ error: 'steam_state' }, 403);
    const pending = await store(env, 'consume', { state });
    if (!pending.ok) return authJson({ error: 'steam_expired' }, 403);
    const login = await pending.json<{ callback: string; returnTo: string }>();
    if (!validSteamAssertion(url.searchParams, login.callback)) return authJson({ error: 'steam_assertion' }, 403);
    const verified = await verifySteamSignature(url.searchParams);
    if (!verified) return authJson({ error: 'steam_verification' }, 403);
    const steamId = url.searchParams.get('openid.claimed_id')!.split('/').at(-1)!;
    const profile: SteamProfile = { steamId, name: `Steam ${steamId}`, avatar: '' };
    if (env.STEAM_WEB_API_KEY) {
      const api = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/');
      api.search = new URLSearchParams({ key: env.STEAM_WEB_API_KEY, steamids: steamId }).toString();
      try {
        const response = await fetch(api, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
        const summary = response.ok ? await response.json<{ response: { players: { steamid: string; personaname: string; avatarfull: string }[] } }>() : null;
        const player = summary?.response?.players?.find(p => p.steamid === steamId);
        if (player) {
          profile.name = String(player.personaname).slice(0, 80);
          if (/^https:\/\/(avatars\.steamstatic\.com|avatars\.(akamai|fastly)\.steamstatic\.com)\/[a-f0-9]+(?:_full|_medium)?\.jpg$/.test(player.avatarfull)) profile.avatar = player.avatarfull;
        }
      } catch { /* Authentication remains valid if the profile API is temporarily unavailable. */ }
    }
    const token = random();
    await store(env, 'create', { token, profile });
    const headers = new Headers({ Location: login.returnTo, 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', cookie(req, 'sts2-steam', token, 7 * 86400));
    headers.append('Set-Cookie', cookie(req, 'sts2-openid', '', 0));
    return new Response(null, { status: 302, headers });
  }
  return authJson({ error: 'route' }, 404);
}

/** Login nonces and opaque sessions live separately from game rooms and browser saves. */
export class SteamAuth extends DurableObject<AuthEnv> {
  async fetch(req: Request) {
    const body = await req.json<any>(), action = new URL(req.url).pathname;
    const token = body.token ?? body.state;
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return authJson({ error: 'token' }, 403);
    const key = (action === '/begin' || action === '/consume' ? 'nonce:' : 'session:') + token;
    if (action === '/begin' || action === '/create') {
      const ttl = action === '/begin' ? 600_000 : 7 * 86400_000;
      await this.ctx.storage.put(key, { expires: Date.now() + ttl, ...action === '/begin' ? { callback: body.callback, returnTo: body.returnTo } : { profile: body.profile } });
      await this.ctx.storage.setAlarm(Date.now() + 86400_000);
      return authJson({ ok: true });
    }
    const value = await this.ctx.storage.get<any>(key);
    if (action === '/consume' || action === '/logout') await this.ctx.storage.delete(key);
    if (!value || value.expires < Date.now()) return authJson({ error: 'expired' }, 403);
    return authJson(action === '/session' ? value.profile : value);
  }
  async alarm() {
    const records = await this.ctx.storage.list<any>();
    for (const [key, value] of records) if (value.expires < Date.now()) await this.ctx.storage.delete(key);
    if ((await this.ctx.storage.list()).size) await this.ctx.storage.setAlarm(Date.now() + 86400_000);
  }
}
