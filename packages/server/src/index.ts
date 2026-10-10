import { DurableObject } from 'cloudflare:workers';

interface Env { ASSETS: Fetcher; ROOMS: DurableObjectNamespace<WebRoom> }
interface Player { id: number; token: string; character: string; unlock: string; ready: boolean }
interface Room { code: string; version: string; mode: string; maxPlayers: number; created: number; started: boolean; seed: string; players: Player[] }
const PREFIX = '/api/multiplayer/rooms';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
function sameOrigin(req: Request) {
  const origin = req.headers.get('Origin');
  if (!origin) return false;
  const url = new URL(req.url);
  if (origin === url.origin) return true;
  // Vite's local API proxy forwards its original Origin.
  return ['127.0.0.1', 'localhost'].includes(url.hostname) && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin);
}
export default {
  async fetch(req: Request, env: Env) {
    const path = new URL(req.url).pathname;
    if (!path.startsWith('/api/multiplayer/')) return env.ASSETS.fetch(req);
    if (!sameOrigin(req)) return json({ error: 'origin' }, 403);
    if (path === PREFIX && req.method === 'POST') {
      // One small shared limiter for room creation. Game packets never pass through this object.
      const limit = await env.ROOMS.get(env.ROOMS.idFromName('creation-limit')).fetch(new Request('https://room/limit', {
        method: 'POST', body: req.headers.get('CF-Connecting-IP') ?? 'local',
      }));
      if (!limit.ok) return limit;
      const code = crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
      const url = new URL(req.url); url.pathname = `${PREFIX}/${code}`;
      const body = await req.text();
      if (body.length > 512) return json({ error: 'request' }, 413);
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request(url, { method: 'POST', body, headers: { 'X-Create-Room': '1' } }));
    }
    const m = new RegExp(`^${PREFIX}/([A-F0-9]{12})(/socket)?$`).exec(path);
    if (!m) return json({ error: 'room' }, 404);
    const headers = new Headers(req.headers); headers.delete('X-Create-Room');
    return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(new Request(req, { headers }));
  },
} satisfies ExportedHandler<Env>;

/** Each room owns up to 4 authenticated sockets. Reuse original game packets; no original MOD code is copied. */
export class WebRoom extends DurableObject<Env> {
  private room?: Room;
  private counts = new Map<string, { n: number; at: number }>();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => { this.room = await ctx.storage.get<Room>('room'); });
  }
  async fetch(req: Request) {
    const url = new URL(req.url);
    if (url.pathname === '/limit') {
      const ip = await req.text(), now = Date.now();
      for (const [k, c] of this.counts) if (now - c.at > 60_000) this.counts.delete(k);
      const c = this.counts.get(ip) ?? { n: 0, at: now };
      c.n++; this.counts.set(ip, c);
      return c.n > 5 ? json({ error: 'rate' }, 429) : json({ ok: true });
    }
    const code = url.pathname.split('/')[4];
    if (this.room && Date.now() - this.room.created > 24 * 60 * 60_000) return json({ error: 'expired' }, 410);
    if (req.method === 'POST' && !url.pathname.endsWith('/socket')) {
      let body: any;
      try { body = await req.json(); } catch { return json({ error: 'request' }, 400); }
      if (typeof body.version !== 'string' || body.version.length > 100) return json({ error: 'version' }, 400);
      const mode = typeof body.mode === 'string' && ['standard', 'daily', 'custom'].includes(body.mode) ? body.mode : 'standard';
      const maxPlayers = typeof body.maxPlayers === 'number' && body.maxPlayers >= 2 && body.maxPlayers <= 4 ? body.maxPlayers : 4;
      if (!this.room) {
        if (req.headers.get('X-Create-Room') !== '1') return json({ error: 'room' }, 404);
        this.room = { code, version: body.version, mode, maxPlayers, created: Date.now(), started: false, seed: '', players: [] };
      }
      if (this.room.version !== body.version) return json({ error: 'version' }, 409);
      if (this.room.started || this.room.players.length >= this.room.maxPlayers) return json({ error: 'full' }, 409);
      const usedIds = new Set(this.room.players.map(p => p.id));
      let id = 1;
      while (usedIds.has(id) && id <= this.room.maxPlayers) id++;
      if (id > this.room.maxPlayers) return json({ error: 'full' }, 409);
      const token = crypto.randomUUID();
      this.room.players.push({ id, token, character: 'IRONCLAD', unlock: '', ready: false });
      await this.ctx.storage.put('room', this.room);
      await this.ctx.storage.setAlarm(this.room.created + 24 * 60 * 60_000);
      this.broadcast();
      return json({ code, id, token, mode: this.room.mode, maxPlayers: this.room.maxPlayers });
    }
    if (!this.room || !url.pathname.endsWith('/socket')) return json({ error: 'room' }, 404);
    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'socket' }, 400);
    const player = this.room.players.find(p => p.token === url.searchParams.get('token'));
    if (!player || this.room.started) return json({ error: 'closed' }, 403);
    if (this.ctx.getWebSockets(String(player.id)).length) return json({ error: 'connected' }, 409);
    const pair = new WebSocketPair();
    pair[1].serializeAttachment({ id: player.id });
    this.ctx.acceptWebSocket(pair[1], [String(player.id)]);
    this.broadcast();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  private broadcast() {
    if (!this.room) return;
    const body = JSON.stringify({
      type: 'room',
      code: this.room.code,
      mode: this.room.mode,
      maxPlayers: this.room.maxPlayers,
      started: this.room.started,
      players: this.room.players.map(({ token: _, unlock: __, ...p }) => ({
        ...p,
        connected: this.ctx.getWebSockets(String(p.id)).length > 0,
      })),
    });
    for (const ws of this.ctx.getWebSockets()) ws.send(body);
  }
  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    const id: number = ws.deserializeAttachment().id;
    if (!this.room) return ws.close(1008, 'Missing room');
    if (typeof data !== 'string') {
      if (!this.room.started || data.byteLength < 9 || data.byteLength > 128 * 1024) return ws.close(1008, 'Invalid packet');
      // Original bus header: one-byte message type followed by little-endian uint64 sender.
      const bytes = new Uint8Array(data);
      if (bytes[1] !== id || bytes.slice(2, 9).some(x => x !== 0)) return ws.close(1008, 'Invalid sender');
      const out = new Uint8Array(bytes.length + 1); out[0] = id; out.set(bytes, 1);
      for (const other of this.ctx.getWebSockets()) if (other !== ws) other.send(out.buffer);
      return;
    }
    if (data.length > 64 * 1024) return ws.close(1009, 'Too large');
    let msg: any;
    try { msg = JSON.parse(data); } catch { return ws.close(1008, 'Invalid JSON'); }
    const me = this.room.players.find(p => p.id === id);
    if (!me) return ws.close(1008, 'Invalid player');
    if (msg.type === 'ping') { ws.send(JSON.stringify({ type: 'pong' })); return; }
    if (msg.type === 'select' && !this.room.started) {
      if (!['IRONCLAD', 'SILENT', 'REGENT', 'NECROBINDER', 'DEFECT'].includes(msg.character)
        || typeof msg.unlock !== 'string' || msg.unlock.length > 48_000) return ws.close(1008, 'Invalid selection');
      me.character = msg.character; me.unlock = msg.unlock; me.ready = false;
    } else if (msg.type === 'ready' && !this.room.started && me.unlock) {
      me.ready = msg.ready === true;
    } else if (msg.type === 'start' && id === 1 && !this.room.started) {
      if (this.room.players.length < 2 || this.room.players.some(p => !p.ready || !this.ctx.getWebSockets(String(p.id)).length)) return;
      this.room.started = true;
      this.room.seed = crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
      await this.ctx.storage.put('room', this.room);
      for (const other of this.ctx.getWebSockets()) other.send(JSON.stringify({
        type: 'start',
        mode: this.room.mode,
        seed: this.room.seed,
        players: this.room.players.map(({ id, character, unlock }) => ({ id, character, unlock })),
      }));
      return;
    } else return;
    await this.ctx.storage.put('room', this.room);
    this.broadcast();
  }
  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    ws.close(code, reason);
    if (!this.room) return;
    if (this.room.started) {
      // Never silently continue alone: all simulations stop on a missing peer.
      for (const other of this.ctx.getWebSockets()) if (other !== ws) other.send(JSON.stringify({ type: 'ended' }));
    } else {
      // Host leaving closes the invitation; guest leaving frees slot.
      const id = ws.deserializeAttachment().id;
      if (id === 1) {
        for (const other of this.ctx.getWebSockets()) if (other !== ws) other.close(1000, 'Host left');
        await this.ctx.storage.deleteAll(); this.room = undefined;
      } else {
        this.room.players = this.room.players.filter(p => p.id !== id);
        await this.ctx.storage.put('room', this.room); this.broadcast();
      }
    }
  }
  async webSocketError(ws: WebSocket) { await this.webSocketClose(ws, 1011, 'Connection error'); }
  async alarm() {
    for (const ws of this.ctx.getWebSockets()) ws.close(1000, 'Room expired');
    await this.ctx.storage.deleteAll(); this.room = undefined;
  }
}
