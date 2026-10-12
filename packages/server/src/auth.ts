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

/** Check Steam assertion via POST (OpenID 2.0 spec) and fallback to GET. */
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

  // 1. 优先尝试 POST 请求（符合 OpenID 2.0 规范及单元测试期望）
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
    console.warn('[steam] POST verification failed:', err);
  }

  // 2. 回退尝试 GET 请求
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
    console.error('[steam] GET verification failed:', err);
  }

  return false;
}

/** Fetch Steam profile via Web API if key is present, fallback to public profile XML. */
async function fetchSteamProfile(steamId: string, apiKey?: string): Promise<{ name: string; avatar: string }> {
  let name = `Steam ${steamId}`, avatar = '';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };

  // 1. 若配置了 Web API Key，优先请求官方 API
  if (apiKey) {
    try {
      const api = new URL('https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/');
      api.search = new URLSearchParams({ key: apiKey, steamids: steamId }).toString();
      const response = await fetch(api.toString(), { headers, redirect: 'follow', signal: AbortSignal.timeout(8_000) });
      if (response.ok) {
        const summary = await response.json<{ response?: { players?: { steamid: string; personaname: string; avatarfull: string }[] } }>();
        const player = summary?.response?.players?.find(p => p.steamid === steamId);
        if (player) {
          if (player.personaname) name = String(player.personaname).slice(0, 80);
          if (player.avatarfull && /^https:\/\/[a-z0-9.-]*steamstatic\.com\/[a-z0-9_]+\.(jpg|png|jpeg)$/i.test(player.avatarfull)) {
            avatar = player.avatarfull;
          }
          if (avatar) return { name, avatar };
        }
      }
    } catch (err) {
      console.warn('[steam] Web API profile fetch failed:', err);
    }
  }

  // 2. 免 API Key 兜底：直接拉取 Steam 官方公开个人资料 XML
  try {
    const xmlUrl = `https://steamcommunity.com/profiles/${steamId}/?xml=1`;
    const response = await fetch(xmlUrl, { headers, redirect: 'follow', signal: AbortSignal.timeout(8_000) });
    if (response.ok) {
      const text = await response.text();
      const nameMatch = /<steamID>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/steamID>/.exec(text);
      if (nameMatch?.[1]?.trim()) {
        name = nameMatch[1].trim().slice(0, 80);
      }
      const avatarMatch = /<avatarFull>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/avatarFull>/.exec(text);
      const matchedAvatar = avatarMatch?.[1]?.trim();
      if (matchedAvatar && /^https:\/\/[a-z0-9.-]*steamstatic\.com\/[a-z0-9_]+\.(jpg|png|jpeg)$/i.test(matchedAvatar)) {
        avatar = matchedAvatar;
      }
    }
  } catch (err) {
    console.warn('[steam] public XML profile fetch failed:', err);
  }

  return { name, avatar };
}

export async function authFetch(req: Request, env: AuthEnv) {
  const url = new URL(req.url), path = url.pathname;
  if (path === '/api/auth/steam/avatar' && req.method === 'GET') {
    const rawUrl = url.searchParams.get('url');
    if (!rawUrl || !/^https:\/\/[a-z0-9.-]*steamstatic\.com\/[a-z0-9_]+\.(jpg|png|jpeg)$/i.test(rawUrl)) {
      return new Response('Invalid avatar url', { status: 400 });
    }
    try {
      const upstream = await fetch(rawUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!upstream.ok) return new Response(null, { status: upstream.status });
      const headers = new Headers();
      headers.set('Content-Type', upstream.headers.get('Content-Type') || 'image/jpeg');
      headers.set('Cache-Control', 'public, max-age=86400, immutable');
      return new Response(upstream.body, { status: 200, headers });
    } catch {
      return new Response(null, { status: 502 });
    }
  }
  if (path === '/api/auth/me' && req.method === 'GET') {
    const token = readCookie(req, 'sts2-steam');
    let profile = await steamIdentity(req, env);
    // 若已有 session 但昵称或头像尚未完整，主动刷新一次并回写持久存储
    if (profile && token && (!profile.avatar || profile.avatar.startsWith('https://avatars.steamstatic.com') || profile.name.startsWith('Steam 7656119'))) {
      const info = await fetchSteamProfile(profile.steamId, env.STEAM_WEB_API_KEY);
      if (info.avatar || (info.name && info.name !== profile.name)) {
        profile = { ...profile, ...info };
        await store(env, 'update', { token, profile });
      }
    }
    return authJson({ profile });
  }
  if (path === '/api/auth/logout' && req.method === 'POST') {
    const origin = req.headers.get('Origin');
    const fetchSite = req.headers.get('Sec-Fetch-Site');
    if (fetchSite === 'cross-site') return authJson({ error: 'origin' }, 403);
    if (origin && origin !== url.origin) {
      const isLocal = (h: string) => h === 'localhost' || h === '127.0.0.1' || h.startsWith('192.168.') || h.startsWith('10.');
      try {
        const oUrl = new URL(origin);
        if (!isLocal(url.hostname) || !isLocal(oUrl.hostname)) return authJson({ error: 'origin' }, 403);
      } catch {
        return authJson({ error: 'origin' }, 403);
      }
    }
    await store(env, 'logout', { token: readCookie(req, 'sts2-steam') });
    return new Response('{}', { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': cookie(req, 'sts2-steam', '', 0) } });
  }
  if (path === '/api/auth/steam/popup-done' && req.method === 'GET') {
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>Steam 登录完成</title>
  <style>
    body { background: #171d25; color: #c7d5e0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: grid; place-items: center; height: 100vh; margin: 0; }
    .box { text-align: center; padding: 20px; }
    h2 { color: #66c0f4; margin-bottom: 8px; font-size: 22px; }
    p { font-size: 14px; opacity: 0.8; }
  </style>
</head>
<body>
  <div class="box">
    <h2>Steam 登录成功</h2>
    <p>正在自动返回游戏窗口，请稍候...</p>
  </div>
  <script>
    try {
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({ type: 'sts2_steam_login_done' }, '*');
        setTimeout(() => window.close(), 200);
      } else {
        location.replace('/?menu=multiplayer');
      }
    } catch (e) {
      location.replace('/?menu=multiplayer');
    }
  </script>
</body>
</html>`;
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
  if (path === '/api/auth/steam/login' && req.method === 'GET') {
    const isPopup = url.searchParams.get('popup') === '1';
    const state = random(), callback = `${url.origin}/api/auth/steam/callback?state=${state}`;
    let returnTo = '/';
    if (isPopup) {
      returnTo = '/api/auth/steam/popup-done';
    } else {
      const destination = url.searchParams.get('return') ?? '/';
      const target = new URL(destination, url.origin);
      returnTo = target.origin === url.origin && !target.pathname.startsWith('/api/') ? target.pathname + target.search : '/';
    }
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
    const info = await fetchSteamProfile(steamId, env.STEAM_WEB_API_KEY);
    const profile: SteamProfile = { steamId, name: info.name, avatar: info.avatar };
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
    if (action === '/update') {
      const existing = await this.ctx.storage.get<any>(key);
      if (existing) {
        await this.ctx.storage.put(key, { ...existing, profile: body.profile });
      }
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
