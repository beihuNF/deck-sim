import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';
const module = { exports: {} as any };
new Function('require', 'exports', 'module', ts.transpileModule(fs.readFileSync(new URL('../../server/src/auth.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText)(() => ({ DurableObject: class { constructor(public ctx: any, public env: any) {} } }), module.exports, module);
const { SteamAuth, authFetch, steamIdentity } = module.exports;
function environment() {
  const values = new Map();
  const obj = new SteamAuth({ storage: { get: async (k: string) => values.get(k), put: async (k: string, v: any) => values.set(k, v),
    delete: async (k: string) => values.delete(k), list: async () => new Map(values), setAlarm: async () => {} } }, {});
  return { AUTH: { idFromName: (id: string) => id, get: () => obj }, STEAM_WEB_API_KEY: 'test-server-key' };
}
const origin = 'https://game.example';
async function login(env: any) {
  const response = await authFetch(new Request(origin + '/api/auth/steam/login?return=' + encodeURIComponent('/?room=ABCDEF123456')), env);
  const steam = new URL(response.headers.get('Location'));
  const callback = steam.searchParams.get('openid.return_to')!;
  const cookie = response.headers.get('Set-Cookie')!.split(';')[0];
  const url = new URL(callback);
  const claimed = 'https://steamcommunity.com/openid/id/76561198000000001';
  for (const [k, v] of Object.entries({ ns: 'http://specs.openid.net/auth/2.0', mode: 'id_res', op_endpoint: 'https://steamcommunity.com/openid/login',
    claimed_id: claimed, identity: claimed, return_to: callback, response_nonce: new Date().toISOString(), assoc_handle: 'test',
    signed: 'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle', sig: 'test' })) url.searchParams.set('openid.' + k, v);
  return { url, cookie };
}
afterEach(() => vi.unstubAllGlobals());
describe('Steam browser authentication', () => {
  it('verifies with Steam server-side, stores an opaque session, and revokes it on logout', async () => {
    const env = environment(), { url, cookie } = await login(env);
    const fetcher = vi.fn(async (input: URL | string, init: any) => {
      if (String(input).includes('/openid/')) {
        expect(init.body.get('openid.mode')).toBe('check_authentication');
        return new Response('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n');
      }
      expect(new URL(input).searchParams.get('key')).toBe('test-server-key');
      return Response.json({ response: { players: [{ steamid: '76561198000000001', personaname: '真实玩家', avatarfull: 'https://avatars.steamstatic.com/abc_full.jpg' }] } });
    });
    vi.stubGlobal('fetch', fetcher);
    const response = await authFetch(new Request(url, { headers: { Cookie: cookie } }), env);
    expect(response.status).toBe(302); expect(response.headers.get('Location')).toBe('/?room=ABCDEF123456');
    const cookies = response.headers.get('Set-Cookie')!;
    expect(cookies).toContain('HttpOnly'); expect(cookies).toContain('Secure'); expect(cookies).not.toContain('test-server-key');
    const session = cookies.split(';')[0];
    const identity = await steamIdentity(new Request(origin, { headers: { Cookie: session } }), env);
    expect(identity).toEqual({ steamId: '76561198000000001', name: '真实玩家', avatar: 'https://avatars.steamstatic.com/abc_full.jpg' });
    expect((await authFetch(new Request(url, { headers: { Cookie: cookie } }), env)).status).toBe(403);
    await authFetch(new Request(origin + '/api/auth/logout', { method: 'POST', headers: { Origin: origin, Cookie: session } }), env);
    expect(await steamIdentity(new Request(origin, { headers: { Cookie: session } }), env)).toBeNull();
  });
  it('rejects forged callbacks, missing signed fields, provider failure, and cross-origin logout', async () => {
    const env = environment();
    const fetcher = vi.fn(async () => new Response('is_valid:false\n'));
    vi.stubGlobal('fetch', fetcher);
    let attempt = await login(env);
    expect((await authFetch(new Request(attempt.url), env)).status).toBe(403); expect(fetcher).not.toHaveBeenCalled();
    attempt.url.searchParams.set('openid.return_to', 'https://attacker.example/');
    expect((await authFetch(new Request(attempt.url, { headers: { Cookie: attempt.cookie } }), env)).status).toBe(403); expect(fetcher).not.toHaveBeenCalled();
    attempt = await login(env); attempt.url.searchParams.set('openid.signed', 'return_to');
    expect((await authFetch(new Request(attempt.url, { headers: { Cookie: attempt.cookie } }), env)).status).toBe(403);
    attempt = await login(env);
    expect((await authFetch(new Request(attempt.url, { headers: { Cookie: attempt.cookie } }), env)).status).toBe(403);
    expect((await authFetch(new Request(origin + '/api/auth/logout', { method: 'POST', headers: { Origin: 'https://attacker.example' } }), env)).status).toBe(403);
  });
});
