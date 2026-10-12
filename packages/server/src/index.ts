import { DurableObject } from 'cloudflare:workers';
import { validCharacterSelection } from './selection';
import { authFetch, steamIdentity, type AuthEnv, type SteamProfile } from './auth';
export { SteamAuth } from './auth';

interface Env extends AuthEnv { ASSETS: Fetcher; ROOMS: DurableObjectNamespace<WebRoom> }
interface Player { id: number; token: string; character: string; unlock: string; ready: boolean; maxAscension: number; disconnectedAt?: number; profile?: SteamProfile; instance?: string }
interface Room {
  code: string; version: string; mode: string; maxPlayers: number; created: number; started: boolean;
  seed: string; ascension: number; modifiers: string[]; dailyDate: string; players: Player[]; protocol?: number;
  saveJson?: string; loadInfo?: any;
}
const PREFIX = '/api/multiplayer/rooms';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
function isPrivateHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') || hostname.startsWith('10.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) || hostname.endsWith('.local');
}

export function sameOrigin(req: Request): boolean {
  const url = new URL(req.url);
  const origin = req.headers.get('Origin');

  if (origin) {
    if (origin === url.origin) return true;
    try {
      const originUrl = new URL(origin);
      if (isPrivateHost(url.hostname) && isPrivateHost(originUrl.hostname)) return true;
      if (url.hostname.endsWith('.136521.xyz') && originUrl.hostname.endsWith('.136521.xyz')) return true;
    } catch {}
    return false;
  }

  // 现代浏览器跨站安全标头：若来自恶意跨站攻击，Sec-Fetch-Site 必定为 cross-site
  const fetchSite = req.headers.get('Sec-Fetch-Site');
  if (fetchSite === 'cross-site') return false;
  if (fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none') return true;

  // 移动端/微信等 WebKit 内核在同源 fetch 时通常只携带 Referer
  const referer = req.headers.get('Referer');
  if (referer) {
    try {
      const refUrl = new URL(referer);
      if (refUrl.origin === url.origin) return true;
      if (isPrivateHost(url.hostname) && isPrivateHost(refUrl.hostname)) return true;
      return false;
    } catch {
      return false;
    }
  }

  // WebSocket 升级握手在部分移动端浏览器上不发送 Origin，予以放行
  if (req.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
    return true;
  }

  // 兜底：若没有任何跨域特征且 Host 标头匹配当前目标
  const host = req.headers.get('Host');
  if (host && (host === url.host || host === url.hostname)) {
    return true;
  }

  return false;
}
export default {
  async fetch(req: Request, env: Env) {
    const path = new URL(req.url).pathname;
    const inviteMatch = /^\/(?:r|room)\/([A-F0-9]{12})\/?$/i.exec(path);
    if (inviteMatch) {
      const targetUrl = new URL(req.url);
      targetUrl.pathname = '/';
      targetUrl.searchParams.set('room', inviteMatch[1].toUpperCase());
      return Response.redirect(targetUrl.toString(), 302);
    }
    if (path.startsWith('/api/auth/')) {
      try {
        return await authFetch(req, env);
      } catch (err: any) {
        console.error('[auth error]:', err);
        return json({ error: 'steam_service', details: String(err?.message || err) }, 503);
      }
    }
    if (!path.startsWith('/api/multiplayer/')) return env.ASSETS.fetch(req);
    if (!sameOrigin(req)) return json({ error: 'origin' }, 403);
    const identity = await steamIdentity(req, env);
    const profileHeaders: Record<string, string> = identity ? { 'X-Steam-Profile': JSON.stringify(identity) } : {};

    // 针对国内与亚太地区玩家，提示 Cloudflare 优先在亚太（APAC）机房创建/路由 Durable Object 实例
    const cf = (req as any).cf;
    const country = cf?.country as string | undefined;
    const ray = req.headers.get('cf-ray') || '';
    const coloMatch = /-([A-Z0-9]+)$/.exec(ray);
    const colo = (cf?.colo as string | undefined) || (coloMatch ? coloMatch[1] : '');
    const isApac = !country || ['CN', 'HK', 'MO', 'TW', 'JP', 'KR', 'SG', 'MY', 'VN', 'TH'].includes(country);
    const roomOpts = isApac ? { locationHint: 'apac' as const } : undefined;

    if (path === PREFIX && req.method === 'POST') {
      // One small shared limiter for room creation. Game packets never pass through this object.
      const limit = await env.ROOMS.get(env.ROOMS.idFromName('creation-limit'), roomOpts).fetch(new Request('https://room/limit', {
        method: 'POST', body: req.headers.get('CF-Connecting-IP') ?? 'local',
      }));
      if (!limit.ok) return limit;
      const code = crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
      const url = new URL(req.url); url.pathname = `${PREFIX}/${code}`;
      const body = await req.text();
      if (body.length > 512 * 1024) return json({ error: 'request' }, 413);
      return env.ROOMS.get(env.ROOMS.idFromName(code), roomOpts).fetch(new Request(url, { method: 'POST', body, headers: { 'X-Create-Room': '1', 'X-CF-Colo': colo, ...profileHeaders } }));
    }
    const m = new RegExp(`^${PREFIX}/([A-F0-9]{12})(/socket)?$`).exec(path);
    if (!m) return json({ error: 'room' }, 404);
    const headers = new Headers(req.headers); headers.delete('X-Create-Room'); headers.delete('X-Steam-Profile');
    if (identity) headers.set('X-Steam-Profile', JSON.stringify(identity));
    if (colo) headers.set('X-CF-Colo', colo);
    return env.ROOMS.get(env.ROOMS.idFromName(m[1]), roomOpts).fetch(new Request(req, { headers }));
  },
} satisfies ExportedHandler<Env>;

/** Each room owns up to 4 authenticated sockets. Reuse original game packets; no original MOD code is copied. */
export class WebRoom extends DurableObject<Env> {
  private room?: Room;
  private colo = '';
  private delivery: Record<string, { received: number; sent: number; pending: { seq: number; sender: number; bytes: number[] }[] }> = {};
  private channel(id: number) { return this.delivery[id] ??= { received: 0, sent: 0, pending: [] }; }
  private counts = new Map<string, { n: number; at: number }>();
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => { this.room = await ctx.storage.get<Room>('room'); this.delivery = await ctx.storage.get('delivery') ?? {}; });
  }
  async fetch(req: Request) {
    const coloHeader = req.headers.get('X-CF-Colo');
    if (coloHeader) this.colo = coloHeader;
    const url = new URL(req.url);
    if (url.pathname === '/limit') {
      const ip = await req.text(), now = Date.now();
      for (const [k, c] of this.counts) if (now - c.at > 60_000) this.counts.delete(k);
      const c = this.counts.get(ip) ?? { n: 0, at: now };
      c.n++; this.counts.set(ip, c);
      return c.n > 5 ? json({ error: 'rate' }, 429) : json({ ok: true });
    }
    const code = url.pathname.split('/')[4];
    const profile = req.headers.has('X-Steam-Profile') ? JSON.parse(req.headers.get('X-Steam-Profile')!) as SteamProfile : undefined;
    if (this.room && Date.now() - this.room.created > 24 * 60 * 60_000) return json({ error: 'expired' }, 410);
    if (req.method === 'POST' && !url.pathname.endsWith('/socket')) {
      let body: any;
      try { body = await req.json(); } catch { return json({ error: 'request' }, 400); }
      if (body.protocol === 4 && (typeof body.instance !== 'string' || body.instance.length > 100)) return json({ error: 'request' }, 400);
      if (typeof body.version !== 'string' || body.version.length > 100) return json({ error: 'version' }, 400);
      const guestName = typeof body.guestName === 'string' && body.guestName.trim() ? body.guestName.trim().slice(0, 24) : undefined;
      const effectiveProfile: SteamProfile | undefined = profile || (guestName ? { steamId: '', name: guestName, avatar: '' } : undefined);
      const mode = typeof body.mode === 'string' && ['standard', 'daily', 'custom', 'load'].includes(body.mode) ? body.mode : 'standard';
      const maxPlayers = Number.isInteger(body.maxPlayers) && body.maxPlayers >= 2 && body.maxPlayers <= 4 ? body.maxPlayers : 4;
      if (!this.room) {
        if (req.headers.get('X-Create-Room') !== '1') return json({ error: 'room' }, 404);
        this.room = {
          code, version: body.version, mode, maxPlayers, created: Date.now(), started: false,
          seed: '', ascension: 0, modifiers: [], dailyDate: new Date().toISOString().slice(0, 10),
          players: [], protocol: body.protocol === 4 ? 4 : 3,
          saveJson: typeof body.saveJson === 'string' ? body.saveJson : undefined,
          loadInfo: body.loadInfo,
        };
      }
      if (this.room.version !== body.version) return json({ error: 'version' }, 409);
      const existing = this.room.players.find(p => (typeof body.token === 'string' && p.token === body.token)
        || (profile && p.profile?.steamId === profile.steamId));
      if (existing) {
        if (existing.profile && existing.profile.steamId && existing.profile.steamId !== profile?.steamId) return json({ error: 'account' }, 403);
        // A live engine owns this lease. A fresh page cannot resume action/choice closures from an old engine.
        if (this.room.started && existing.instance !== body.instance) return json({ error: 'reload' }, 409);
        if (!this.room.started) {
          existing.instance = body.instance;
          if (profile) existing.profile = profile;
          else if (guestName && (!existing.profile || !existing.profile.steamId)) existing.profile = { steamId: '', name: guestName, avatar: '' };
        }
        await this.ctx.storage.put('room', this.room);
        return json({ code, id: existing.id, token: existing.token, mode: this.room.mode, maxPlayers: this.room.maxPlayers, started: this.room.started, saveJson: this.room.saveJson, loadInfo: this.room.loadInfo });
      }
      if (this.room.started) return json({ error: 'full' }, 409);

      // 清理超时离线（超过 45 秒且无连接）的非房主槽位（仅在大厅未开局阶段；开局后保留槽位以便随时断线重连）
      const now = Date.now();
      const active = this.room.players.filter(p => {
        if (p.id === 1) return true;
        if (this.room?.started) return true;
        const sockets = this.ctx.getWebSockets(String(p.id));
        if (sockets.length > 0) return true;
        if (p.disconnectedAt && now - p.disconnectedAt > 45_000) return false;
        return true;
      });
      if (active.length !== this.room.players.length) {
        this.room.players = active;
        await this.ctx.storage.put('room', this.room);
      }

      if (this.room.players.length >= this.room.maxPlayers) return json({ error: 'full' }, 409);
      const usedIds = new Set(this.room.players.map(p => p.id));
      let id = 1;
      while (usedIds.has(id) && id <= this.room.maxPlayers) id++;
      if (id > this.room.maxPlayers) return json({ error: 'full' }, 409);
      const token = crypto.randomUUID();
      this.room.players.push({ id, token, character: 'IRONCLAD', unlock: '', ready: false, maxAscension: 0, profile: effectiveProfile, instance: body.instance });
      if (this.room.mode === 'daily') for (const p of this.room.players) p.ready = false;
      await this.ctx.storage.put('room', this.room);
      await this.ctx.storage.setAlarm(this.room.created + 24 * 60 * 60_000);
      this.broadcast();
      return json({ code, id, token, mode: this.room.mode, maxPlayers: this.room.maxPlayers, saveJson: this.room.saveJson, loadInfo: this.room.loadInfo });
    }
    if (!this.room || !url.pathname.endsWith('/socket')) return json({ error: 'room' }, 404);
    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'socket' }, 400);
    const player = this.room.players.find(p => p.token === url.searchParams.get('token'));
    if (!player || (player.profile?.steamId && player.profile.steamId !== profile?.steamId) || (this.room.started && (this.room.protocol !== 4 || player.instance !== url.searchParams.get('instance')))) return json({ error: 'closed' }, 403);
    const existingSockets = this.ctx.getWebSockets(String(player.id));
    if (existingSockets.length) {
      for (const old of existingSockets) old.close(1000, 'Replaced');
    }
    player.disconnectedAt = undefined;
    const pair = new WebSocketPair();
    pair[1].serializeAttachment({ id: player.id });
    this.ctx.acceptWebSocket(pair[1], [String(player.id)]);
    if (this.room.started) {
      for (const packet of this.channel(player.id).pending) pair[1].send(JSON.stringify({ type: 'packet', ...packet }));
    }
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
      saveJson: this.room.saveJson,
      loadInfo: this.room.loadInfo,
      settings: { ascension: this.room.ascension ?? 0, modifiers: this.room.modifiers ?? [], seed: this.room.seed, dailyDate: this.room.dailyDate ?? new Date(this.room.created).toISOString().slice(0, 10) },
      maxAscension: Math.min(...this.room.players.map(p => p.maxAscension ?? 0)),
      players: this.room.players.map(({ token: _, unlock: __, instance: ___, ...p }) => ({
        ...p,
        connected: p.disconnectedAt == null && this.ctx.getWebSockets(String(p.id)).length > 0,
      })),
    });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(body); } catch {}
    }
  }
  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer) {
    const id: number = ws.deserializeAttachment().id;
    if (!this.room) return ws.close(1008, 'Missing room');
    if (typeof data !== 'string') {
      if (this.room.protocol === 4 || !this.room.started || data.byteLength < 10 || data.byteLength > 128 * 1024) return ws.close(1008, 'Invalid packet');
      // Original bus header: one-byte message type followed by little-endian uint64 sender.
      const envelope = new Uint8Array(data), to = envelope[0], bytes = envelope.subarray(1);
      if (to !== 0 && !this.room.players.some(p => p.id === to)) return ws.close(1008, 'Invalid recipient');
      if (bytes[1] !== id || bytes.slice(2, 9).some(x => x !== 0)) return ws.close(1008, 'Invalid sender');
      const out = new Uint8Array(bytes.length + 1); out[0] = id; out.set(bytes, 1);
      for (const other of this.ctx.getWebSockets()) if (other !== ws && (to === 0 || other.deserializeAttachment().id === to)) other.send(out.buffer);
      return;
    }
    if (data.length > 1024 * 1024) return ws.close(1009, 'Too large');
    let msg: any;
    try { msg = JSON.parse(data); } catch { return ws.close(1008, 'Invalid JSON'); }
    const me = this.room.players.find(p => p.id === id);
    if (!me) return ws.close(1008, 'Invalid player');
    if (msg.type === 'ping') { ws.send(JSON.stringify({ type: 'pong', colo: this.colo })); return; }
    if (msg.type === 'ack' && this.room.protocol === 4) {
      const channel = this.channel(id);
      if (Number.isSafeInteger(msg.seq) && msg.seq >= 0 && msg.seq <= channel.sent) {
        channel.pending = channel.pending.filter(p => p.seq > msg.seq);
        await this.ctx.storage.put('delivery', this.delivery);
      }
      return;
    }
    if ((msg.type === 'packet' || msg.type === 'volatile') && this.room.protocol === 4 && this.room.started) {
      const channel = this.channel(id);
      if ((msg.type === 'packet' && (!Number.isSafeInteger(msg.seq) || msg.seq < 1)) || !Array.isArray(msg.bytes) || msg.bytes.length < 9
        || msg.bytes.length > 32 * 1024 || msg.bytes.some((b: unknown) => !Number.isInteger(b) || Number(b) < 0 || Number(b) > 255)
        || msg.bytes[1] !== id || msg.bytes.slice(2, 9).some((b: number) => b !== 0)
        || !Number.isInteger(msg.to) || (msg.to !== 0 && !this.room.players.some(p => p.id === msg.to))) return ws.close(1008, 'Invalid packet');
      if (msg.type === 'volatile') {
        for (const other of this.ctx.getWebSockets()) if (other !== ws && (msg.to === 0 || other.deserializeAttachment().id === msg.to)) other.send(JSON.stringify({ type: 'volatile', bytes: msg.bytes, sender: id }));
        return;
      }
      if (msg.seq <= channel.received) { ws.send(JSON.stringify({ type: 'sent', seq: channel.received })); return; }
      if (msg.seq !== channel.received + 1) return ws.close(1008, 'Packet gap');
      channel.received = msg.seq;
      const outgoing: { id: number; packet: { seq: number; sender: number; bytes: number[] } }[] = [];
      for (const p of this.room.players) if (p.id !== id && (msg.to === 0 || msg.to === p.id)) {
        const target = this.channel(p.id);
        if (target.pending.length >= 2048 || Object.values(this.delivery).reduce((sum, c) => sum + c.pending.reduce((n, packet) => n + packet.bytes.length * 4 + 64, 0), 0) + msg.bytes.length * 4 + 64 > 1024 * 1024) {
          for (const other of this.ctx.getWebSockets()) other.send(JSON.stringify({ type: 'ended', error: 'backlog' }));
          return;
        }
        const packet = { seq: ++target.sent, sender: id, bytes: msg.bytes };
        target.pending.push(packet); outgoing.push({ id: p.id, packet });
      }
      // Persist before acknowledging the sender or delivering: retries cannot duplicate actions after hibernation.
      await this.ctx.storage.put('delivery', this.delivery);
      ws.send(JSON.stringify({ type: 'sent', seq: channel.received }));
      for (const { id: recipient, packet } of outgoing) for (const other of this.ctx.getWebSockets(String(recipient))) other.send(JSON.stringify({ type: 'packet', ...packet }));
      return;
    }
    if (msg.type === 'quick_reload' && id === 1 && this.room.started) {
      if (typeof msg.saveJson !== 'string' || msg.saveJson.length > 5 * 1024 * 1024) return ws.close(1008, 'Invalid saveJson');
      for (const p of this.room.players) {
        const target = this.channel(p.id);
        target.pending = [];
        target.received = 0;
        target.sent = 0;
      }
      await this.ctx.storage.put('delivery', this.delivery);
      const reloadPacket = JSON.stringify({
        type: 'quick_reload',
        saveJson: msg.saveJson,
      });
      for (const client of this.ctx.getWebSockets()) {
        try { client.send(reloadPacket); } catch {}
      }
      return;
    }
    if (msg.type === 'leave' && !this.room.started) {
      if (id === 1) {
        for (const other of this.ctx.getWebSockets()) if (other !== ws) other.close(1000, 'Host left');
        await this.ctx.storage.deleteAll(); this.room = undefined;
      } else {
        this.room.players = this.room.players.filter(p => p.id !== id);
        await this.ctx.storage.put('room', this.room); this.broadcast();
      }
      ws.close(1000, 'Left');
      return;
    }
    if (msg.type === 'kick' && id === 1 && !this.room.started) {
      const targetId = Number(msg.targetId);
      if (targetId && targetId !== 1) {
        const targetPlayer = this.room.players.find(p => p.id === targetId);
        if (targetPlayer) {
          // 先从房间列表中移除该玩家并存储
          this.room.players = this.room.players.filter(p => p.id !== targetId);
          await this.ctx.storage.put('room', this.room);
          // 立即广播最新的房间状态给房主及其他在房玩家
          this.broadcast();
          // 向被踢玩家发送通知并安全断开连接
          const sockets = this.ctx.getWebSockets(String(targetId));
          for (const s of sockets) {
            try { s.send(JSON.stringify({ type: 'kicked' })); } catch {}
            try { s.close(4003, 'Kicked by host'); } catch {}
          }
        }
      }
      return;
    }
    if (msg.type === 'rename' && typeof msg.name === 'string' && msg.name.trim()) {
      const newName = msg.name.trim().slice(0, 24);
      me.profile = { steamId: me.profile?.steamId ?? '', name: newName, avatar: me.profile?.avatar ?? '' };
      await this.ctx.storage.put('room', this.room);
      this.broadcast();
      return;
    }
    if (msg.type === 'settings' && id === 1 && !this.room.started && this.room.mode !== 'daily' && this.room.mode !== 'load') {
      if (!Number.isInteger(msg.ascension) || msg.ascension < 0 || msg.ascension > Math.min(...this.room.players.map(p => p.maxAscension ?? 0))
        || typeof msg.seed !== 'string' || !/^[A-Z0-9_]{0,40}$/.test(msg.seed)
        || !Array.isArray(msg.modifiers) || msg.modifiers.length > 40 || msg.modifiers.some((m: unknown) => typeof m !== 'string' || !/^[A-Z0-9_]+(:[A-Z0-9_]+)?$/.test(m))
        || (this.room.mode !== 'custom' && msg.modifiers.length)) return;
      this.room.ascension = msg.ascension; this.room.seed = msg.seed; this.room.modifiers = msg.modifiers;
      for (const p of this.room.players) p.ready = false;
    } else if (msg.type === 'select' && !this.room.started && this.room.mode !== 'load') {
      if (!validCharacterSelection(msg.character, msg.unlock, this.room.mode === 'daily')) return ws.close(1008, 'Invalid selection');
      me.character = msg.character; me.unlock = msg.unlock;
      me.maxAscension = Number.isInteger(msg.maxAscension) ? Math.max(0, Math.min(10, msg.maxAscension)) : 0;
      this.room.ascension = Math.min(this.room.ascension ?? 0, ...this.room.players.map(p => p.maxAscension ?? 0));
      // 遵循原版规则：切换角色必须重置准备状态
      me.ready = false;
    } else if (msg.type === 'ready' && !this.room.started && (this.room.mode === 'load' || validCharacterSelection(me.character, me.unlock, this.room.mode === 'daily'))) {
      me.ready = msg.ready === true;
    } else if (msg.type !== 'start' || id !== 1 || this.room.started) return;
    // StartRunLobby begins as soon as every connected player has readied.
    if (!this.room.started && this.room.players.length >= 2 && this.room.players.every(p => p.ready)) {
      // 全员就绪判定：至少 2 人，所有玩家（包括房主自身）全部就绪且连接在线
      const isValidPlayer = (p: Player) => this.room?.mode === 'load' ? true : validCharacterSelection(p.character, p.unlock, this.room?.mode === 'daily');
      if (this.room.players.length < 2 || this.room.players.some(p => !p.ready || !isValidPlayer(p) || !this.ctx.getWebSockets(String(p.id)).length)) return;
      this.room.started = true;
      this.room.seed ||= crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
      await this.ctx.storage.put('room', this.room);
      for (const other of this.ctx.getWebSockets()) other.send(JSON.stringify({
        type: 'start',
        mode: this.room.mode,
        seed: this.room.seed,
        saveJson: this.room.saveJson,
        settings: { ascension: this.room.ascension ?? 0, modifiers: this.room.modifiers ?? [], dailyDate: this.room.dailyDate ?? new Date(this.room.created).toISOString().slice(0, 10) },
        players: this.room.players.map(({ id, character, unlock, profile }) => ({ id, character, unlock, profile })),
      }));
      return;
    }
    await this.ctx.storage.put('room', this.room);
    this.broadcast();
  }
  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    ws.close(code, reason);
    if (!this.room) return;
    const id = ws.deserializeAttachment().id;
    const player = this.room.players.find(p => p.id === id);
    if (player && !this.ctx.getWebSockets(String(id)).some(other => other !== ws)) {
      if (!this.room.started) player.ready = false;
      player.disconnectedAt = Date.now();
      await this.ctx.storage.put('room', this.room);
      if (this.room.started && this.room.protocol !== 4) {
        for (const other of this.ctx.getWebSockets()) if (other !== ws) other.send(JSON.stringify({ type: 'ended' }));
      } else this.broadcast();
    }
  }
  async webSocketError(ws: WebSocket) { await this.webSocketClose(ws, 1011, 'Connection error'); }
  async alarm() {
    for (const ws of this.ctx.getWebSockets()) ws.close(1000, 'Room expired');
    await this.ctx.storage.deleteAll(); this.room = undefined;
  }
}
