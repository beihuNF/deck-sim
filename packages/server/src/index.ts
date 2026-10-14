/**
 * Standalone Node.js multiplayer room & signaling server for sts2-web.
 * Independent of Cloudflare Workers - can run on any Linux host or inside Docker.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { validCharacterSelection } from './selection.js';

interface SteamProfile {
  steamId: string;
  name: string;
  avatar: string;
}

interface Player {
  id: number;
  token: string;
  character: string;
  unlock: string;
  ready: boolean;
  maxAscension: number;
  disconnectedAt?: number;
  profile?: SteamProfile;
  instance?: string;
}

interface DeliveryChannel {
  received: number;
  sent: number;
  pending: { seq: number; sender: number; bytes: number[] }[];
}

interface Room {
  code: string;
  version: string;
  mode: string;
  maxPlayers: number;
  created: number;
  started: boolean;
  seed: string;
  ascension: number;
  modifiers: string[];
  dailyDate: string;
  players: Player[];
  protocol?: number;
  saveJson?: string;
  loadInfo?: any;
  delivery: Record<string, DeliveryChannel>;
  sockets: Map<number, WebSocket>;
}

const PREFIX = '/api/multiplayer/rooms';
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';

const rooms = new Map<string, Room>();
const ipCreationCounts = new Map<string, { count: number; at: number }>();

const ALLOWED_ORIGIN = 'https://sts2.136521.xyz';

function isOriginAllowed(origin?: string): boolean {
  if (!origin) return true; // 允许内部健康探测或非浏览器工具直连（无 Origin 头）
  if (origin === ALLOWED_ORIGIN) return true;
  // 允许本地开发与端到端测试
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return false;
}

function getCorsOrigin(req: http.IncomingMessage): string | null {
  const origin = req.headers.origin;
  if (!origin) return ALLOWED_ORIGIN;
  return isOriginAllowed(origin) ? origin : null;
}

function sendJson(res: http.ServerResponse, body: unknown, status = 200, req?: http.IncomingMessage) {
  const content = JSON.stringify(body);
  const origin = req ? getCorsOrigin(req) : ALLOWED_ORIGIN;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With';
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  res.writeHead(status, headers);
  res.end(content);
}

function handleCors(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const origin = getCorsOrigin(req);
  if (!origin) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Origin not allowed');
    return false;
  }
  res.writeHead(204, {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  });
  res.end();
  return true;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 5 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function getChannel(room: Room, id: number): DeliveryChannel {
  return (room.delivery[id] ??= { received: 0, sent: 0, pending: [] });
}

function broadcastRoom(room: Room) {
  const message = JSON.stringify({
    type: 'room',
    code: room.code,
    mode: room.mode,
    maxPlayers: room.maxPlayers,
    started: room.started,
    saveJson: room.saveJson,
    loadInfo: room.loadInfo,
    settings: {
      ascension: room.ascension ?? 0,
      modifiers: room.modifiers ?? [],
      seed: room.seed,
      dailyDate: room.dailyDate ?? new Date(room.created).toISOString().slice(0, 10),
    },
    maxAscension: Math.min(...room.players.map(p => p.maxAscension ?? 0)),
    players: room.players.map(({ token: _, unlock: __, instance: ___, ...p }) => ({
      ...p,
      connected: p.disconnectedAt == null && room.sockets.has(p.id) && room.sockets.get(p.id)?.readyState === WebSocket.OPEN,
    })),
  });

  for (const ws of room.sockets.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(message); } catch {}
    }
  }
}

// Create HTTP server
const server = http.createServer(async (req, res) => {
  const urlStr = req.url ?? '/';
  const parsed = new URL(urlStr, `http://${req.headers.host || 'localhost'}`);
  const path = parsed.pathname;

  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'local';
  const reqOrigin = req.headers.origin;
  console.log(`[HTTP ${req.method}] ${path} (from ${clientIp}, origin: ${reqOrigin || 'direct'})`);

  // Block unauthorized cross-origin requests
  if (reqOrigin && !isOriginAllowed(reqOrigin)) {
    console.warn(`[HTTP 403] Unauthorized origin blocked: ${reqOrigin}`);
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // CORS preflight
  if (req.method === 'OPTIONS') {
    handleCors(req, res);
    return;
  }

  // Health check
  if (path === '/' || path === '/health') {
    sendJson(res, { ok: true, server: 'sts2-room', rooms: rooms.size });
    return;
  }

  // Auth profile endpoint
  if (path === '/api/auth/me') {
    sendJson(res, { profile: null });
    return;
  }

  // Invite redirect (/r/CODE or /room/CODE)
  const inviteMatch = /^\/(?:r|room)\/([A-F0-9]{12})\/?$/i.exec(path);
  if (inviteMatch) {
    const code = inviteMatch[1].toUpperCase();
    res.writeHead(302, { Location: `/?room=${code}` });
    res.end();
    return;
  }

  // Room Creation: POST /api/multiplayer/rooms
  if (path === PREFIX && req.method === 'POST') {
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'local';
    const now = Date.now();
    for (const [k, v] of ipCreationCounts) {
      if (now - v.at > 60_000) ipCreationCounts.delete(k);
    }
    const c = ipCreationCounts.get(clientIp) ?? { count: 0, at: now };
    c.count++;
    ipCreationCounts.set(clientIp, c);
    if (c.count > 15) {
      sendJson(res, { error: 'rate' }, 429);
      return;
    }

    let bodyStr = '';
    try {
      bodyStr = await readBody(req);
    } catch {
      sendJson(res, { error: 'request' }, 400);
      return;
    }

    let body: any;
    try {
      body = JSON.parse(bodyStr);
    } catch {
      sendJson(res, { error: 'request' }, 400);
      return;
    }

    if (typeof body.version !== 'string' || body.version.length > 100) {
      sendJson(res, { error: 'version' }, 400);
      return;
    }

    const code = crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
    const mode = typeof body.mode === 'string' && ['standard', 'daily', 'custom', 'load'].includes(body.mode) ? body.mode : 'standard';
    const maxPlayers = Number.isInteger(body.maxPlayers) && body.maxPlayers >= 2 && body.maxPlayers <= 4 ? body.maxPlayers : 4;
    const guestName = typeof body.guestName === 'string' && body.guestName.trim() ? body.guestName.trim().slice(0, 24) : undefined;
    const profile = guestName ? { steamId: '', name: guestName, avatar: '' } : undefined;

    const hostToken = crypto.randomUUID();
    const room: Room = {
      code,
      version: body.version,
      mode,
      maxPlayers,
      created: Date.now(),
      started: false,
      seed: '',
      ascension: 0,
      modifiers: [],
      dailyDate: new Date().toISOString().slice(0, 10),
      players: [
        {
          id: 1,
          token: hostToken,
          character: 'IRONCLAD',
          unlock: '',
          ready: false,
          maxAscension: 0,
          profile,
          instance: body.instance,
        },
      ],
      protocol: body.protocol === 4 ? 4 : 3,
      saveJson: typeof body.saveJson === 'string' ? body.saveJson : undefined,
      loadInfo: body.loadInfo,
      delivery: {},
      sockets: new Map(),
    };

    rooms.set(code, room);
    sendJson(res, {
      code,
      id: 1,
      token: hostToken,
      mode: room.mode,
      maxPlayers: room.maxPlayers,
      saveJson: room.saveJson,
      loadInfo: room.loadInfo,
    });
    return;
  }

  // Room Join: POST /api/multiplayer/rooms/:code
  const joinMatch = new RegExp(`^${PREFIX}/([A-F0-9]{12})$`).exec(path);
  if (joinMatch && req.method === 'POST') {
    const code = joinMatch[1].toUpperCase();
    const room = rooms.get(code);
    if (!room) {
      sendJson(res, { error: 'room' }, 404);
      return;
    }

    if (Date.now() - room.created > 24 * 60 * 60_000) {
      rooms.delete(code);
      sendJson(res, { error: 'expired' }, 410);
      return;
    }

    let bodyStr = '';
    try {
      bodyStr = await readBody(req);
    } catch {
      sendJson(res, { error: 'request' }, 400);
      return;
    }

    let body: any;
    try {
      body = JSON.parse(bodyStr);
    } catch {
      sendJson(res, { error: 'request' }, 400);
      return;
    }

    if (typeof body.version !== 'string' || body.version.length > 100) {
      sendJson(res, { error: 'version' }, 400);
      return;
    }

    if (room.version !== body.version) {
      sendJson(res, { error: 'version' }, 409);
      return;
    }

    const guestName = typeof body.guestName === 'string' && body.guestName.trim() ? body.guestName.trim().slice(0, 24) : undefined;
    const existing = room.players.find(p => typeof body.token === 'string' && p.token === body.token);
    if (existing) {
      if (room.started && existing.instance !== body.instance) {
        sendJson(res, { error: 'reload' }, 409);
        return;
      }
      if (!room.started) {
        existing.instance = body.instance;
        if (guestName && (!existing.profile || !existing.profile.steamId)) {
          existing.profile = { steamId: '', name: guestName, avatar: '' };
        }
      }
      sendJson(res, {
        code,
        id: existing.id,
        token: existing.token,
        mode: room.mode,
        maxPlayers: room.maxPlayers,
        started: room.started,
        saveJson: room.saveJson,
        loadInfo: room.loadInfo,
      });
      return;
    }

    if (room.started) {
      sendJson(res, { error: 'full' }, 409);
      return;
    }

    // Clean up disconnected unready guests after 45s
    const now = Date.now();
    room.players = room.players.filter(p => {
      if (p.id === 1) return true;
      if (room.sockets.has(p.id) && room.sockets.get(p.id)?.readyState === WebSocket.OPEN) return true;
      if (p.disconnectedAt && now - p.disconnectedAt > 45_000) return false;
      return true;
    });

    if (room.players.length >= room.maxPlayers) {
      sendJson(res, { error: 'full' }, 409);
      return;
    }

    const usedIds = new Set(room.players.map(p => p.id));
    let id = 1;
    while (usedIds.has(id) && id <= room.maxPlayers) id++;
    if (id > room.maxPlayers) {
      sendJson(res, { error: 'full' }, 409);
      return;
    }

    const token = crypto.randomUUID();
    const effectiveProfile = guestName ? { steamId: '', name: guestName, avatar: '' } : undefined;
    room.players.push({
      id,
      token,
      character: 'IRONCLAD',
      unlock: '',
      ready: false,
      maxAscension: 0,
      profile: effectiveProfile,
      instance: body.instance,
    });

    if (room.mode === 'daily') {
      for (const p of room.players) p.ready = false;
    }

    broadcastRoom(room);
    sendJson(res, {
      code,
      id,
      token,
      mode: room.mode,
      maxPlayers: room.maxPlayers,
      saveJson: room.saveJson,
      loadInfo: room.loadInfo,
    });
    return;
  }

  sendJson(res, { error: 'not_found' }, 404);
});

// Setup WebSocket Server
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const reqOrigin = req.headers.origin;
  if (reqOrigin && !isOriginAllowed(reqOrigin)) {
    console.warn(`[WS 403] Unauthorized Origin rejected on upgrade: ${reqOrigin}`);
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  const urlStr = req.url ?? '/';
  const parsed = new URL(urlStr, `http://${req.headers.host || 'localhost'}`);
  const path = parsed.pathname;

  const socketMatch = new RegExp(`^${PREFIX}/([A-F0-9]{12})/socket$`).exec(path);
  if (!socketMatch) {
    socket.destroy();
    return;
  }

  const code = socketMatch[1].toUpperCase();
  const room = rooms.get(code);
  if (!room) {
    socket.destroy();
    return;
  }

  const token = parsed.searchParams.get('token');
  const instance = parsed.searchParams.get('instance');
  const player = room.players.find(p => p.token === token);

  if (!player || (room.started && (room.protocol !== 4 || player.instance !== instance))) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, ws => {
    (ws as any).playerId = player.id;
    (ws as any).roomCode = code;
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws: WebSocket, req) => {
  const id: number = (ws as any).playerId;
  const code: string = (ws as any).roomCode;
  console.log(`[WS OPEN] Room ${code}, Player ${id} connected`);
  const room = rooms.get(code);
  if (!room) {
    console.warn(`[WS REJECT] Room ${code} not found`);
    ws.close(1008, 'Room not found');
    return;
  }

  const player = room.players.find(p => p.id === id);
  if (!player) {
    console.warn(`[WS REJECT] Player ${id} not found in room ${code}`);
    ws.close(1008, 'Player not found');
    return;
  }

  // Replace existing socket if reconnected
  const oldWs = room.sockets.get(id);
  if (oldWs && oldWs !== ws && oldWs.readyState === WebSocket.OPEN) {
    console.log(`[WS REPLACE] Replacing old socket for Player ${id} in room ${code}`);
    oldWs.close(1000, 'Replaced');
  }

  room.sockets.set(id, ws);
  player.disconnectedAt = undefined;

  // Re-send pending packets if game started
  if (room.started) {
    for (const packet of getChannel(room, id).pending) {
      ws.send(JSON.stringify({ type: 'packet', ...packet }));
    }
  }

  broadcastRoom(room);

  ws.on('message', async (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
    if (!room) return;

    console.log(`[WS RECV] Room ${code}, Player ${id}: isBinary=${isBinary}, typeof=${typeof data}, isBuffer=${Buffer.isBuffer(data)}, len=${(data as any)?.length || (data as any)?.byteLength}`);

    // Binary message (Protocol 3 packet forwarding)
    if (isBinary) {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
      if (room.protocol === 4 || !room.started || buf.length < 10 || buf.length > 128 * 1024) {
        console.warn(`[WS REJECT P3 BINARY] Room ${code}, Player ${id}: protocol=${room.protocol}, started=${room.started}, buf.len=${buf.length}`);
        ws.close(1008, 'Invalid packet');
        return;
      }
      const to = buf[0];
      const bytes = buf.subarray(1);
      if (to !== 0 && !room.players.some(p => p.id === to)) return ws.close(1008, 'Invalid recipient');
      if (bytes[1] !== id || bytes.subarray(2, 9).some((x: number) => x !== 0)) return ws.close(1008, 'Invalid sender');

      const out = Buffer.alloc(bytes.length + 1);
      out[0] = id;
      bytes.copy(out, 1);

      for (const [otherId, otherWs] of room.sockets.entries()) {
        if (otherWs !== ws && otherWs.readyState === WebSocket.OPEN && (to === 0 || otherId === to)) {
          otherWs.send(out);
        }
      }
      return;
    }

    // Text JSON message
    const str = data.toString();
    console.log(`[WS MSG TEXT] Room ${code}, Player ${id}: ${str.slice(0, 120)}`);
    if (str.length > 1024 * 1024) return ws.close(1009, 'Too large');

    let msg: any;
    try {
      msg = JSON.parse(str);
    } catch {
      console.warn(`[WS REJECT JSON] Room ${code}, Player ${id}: failed to parse JSON: ${str.slice(0, 50)}`);
      ws.close(1008, 'Invalid JSON');
      return;
    }

    const me = room.players.find(p => p.id === id);
    if (!me) return ws.close(1008, 'Invalid player');

    // Ping / Pong
    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', colo: 'SUN' }));
      return;
    }

    // WebRTC Signal forwarding (SDP Offer/Answer, ICE Candidates)
    if (msg.type === 'signal') {
      if (!Number.isInteger(msg.to) || !room.players.some(p => p.id === msg.to)) return;
      const targetWs = room.sockets.get(msg.to);
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        targetWs.send(JSON.stringify({ type: 'signal', from: id, data: msg.data }));
      }
      return;
    }

    // Reliable Protocol 4 ack
    if (msg.type === 'ack' && room.protocol === 4) {
      const channel = getChannel(room, id);
      if (Number.isSafeInteger(msg.seq) && msg.seq >= 0 && msg.seq <= channel.sent) {
        channel.pending = channel.pending.filter(p => p.seq > msg.seq);
      }
      return;
    }

    // Reliable Protocol 4 game packets & volatile packets
    if ((msg.type === 'packet' || msg.type === 'volatile') && room.protocol === 4 && room.started) {
      const channel = getChannel(room, id);
      if (
        (msg.type === 'packet' && (!Number.isSafeInteger(msg.seq) || msg.seq < 1)) ||
        !Array.isArray(msg.bytes) || msg.bytes.length < 9 || msg.bytes.length > 32 * 1024 ||
        msg.bytes.some((b: unknown) => !Number.isInteger(b) || (b as number) < 0 || (b as number) > 255) ||
        msg.bytes[1] !== id || msg.bytes.slice(2, 9).some((b: number) => b !== 0) ||
        !Number.isInteger(msg.to) || (msg.to !== 0 && !room.players.some(p => p.id === msg.to))
      ) {
        console.warn(`[WS REJECT P4 PACKET] Room ${code}, Player ${id}: type=${msg.type}, seq=${msg.seq}, bytes.len=${msg.bytes?.length}, to=${msg.to}`);
        return ws.close(1008, 'Invalid packet');
      }

      if (msg.type === 'volatile') {
        const payload = JSON.stringify({ type: 'volatile', bytes: msg.bytes, sender: id });
        for (const [otherId, otherWs] of room.sockets.entries()) {
          if (otherWs !== ws && otherWs.readyState === WebSocket.OPEN && (msg.to === 0 || otherId === msg.to)) {
            otherWs.send(payload);
          }
        }
        return;
      }

      if (msg.seq <= channel.received) {
        ws.send(JSON.stringify({ type: 'sent', seq: channel.received }));
        return;
      }
      if (msg.seq !== channel.received + 1) return ws.close(1008, 'Packet gap');

      channel.received = msg.seq;
      const outgoing: { recipientId: number; packet: { seq: number; sender: number; bytes: number[] } }[] = [];
      for (const p of room.players) {
        if (p.id !== id && (msg.to === 0 || msg.to === p.id)) {
          const target = getChannel(room, p.id);
          if (target.pending.length >= 2048) {
            for (const otherWs of room.sockets.values()) {
              if (otherWs.readyState === WebSocket.OPEN) otherWs.send(JSON.stringify({ type: 'ended', error: 'backlog' }));
            }
            return;
          }
          const packet = { seq: ++target.sent, sender: id, bytes: msg.bytes };
          target.pending.push(packet);
          outgoing.push({ recipientId: p.id, packet });
        }
      }

      ws.send(JSON.stringify({ type: 'sent', seq: channel.received }));
      for (const { recipientId, packet } of outgoing) {
        const recipientWs = room.sockets.get(recipientId);
        if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
          recipientWs.send(JSON.stringify({ type: 'packet', ...packet }));
        }
      }
      return;
    }

    // Quick reload (Host only)
    if (msg.type === 'quick_reload' && id === 1 && room.started) {
      if (typeof msg.saveJson !== 'string' || msg.saveJson.length > 5 * 1024 * 1024) return ws.close(1008, 'Invalid saveJson');
      for (const p of room.players) {
        const target = getChannel(room, p.id);
        target.pending = [];
        target.received = 0;
        target.sent = 0;
      }
      const reloadPacket = JSON.stringify({ type: 'quick_reload', saveJson: msg.saveJson });
      for (const client of room.sockets.values()) {
        if (client.readyState === WebSocket.OPEN) {
          try { client.send(reloadPacket); } catch {}
        }
      }
      return;
    }

    // Leave room
    if (msg.type === 'leave' && !room.started) {
      if (id === 1) {
        for (const [otherId, otherWs] of room.sockets.entries()) {
          if (otherId !== 1 && otherWs.readyState === WebSocket.OPEN) {
            otherWs.close(1000, 'Host left');
          }
        }
        rooms.delete(code);
      } else {
        room.players = room.players.filter(p => p.id !== id);
        room.sockets.delete(id);
        broadcastRoom(room);
      }
      ws.close(1000, 'Left');
      return;
    }

    // Kick player (Host only)
    if (msg.type === 'kick' && id === 1 && !room.started) {
      const targetId = Number(msg.targetId);
      if (targetId && targetId !== 1) {
        room.players = room.players.filter(p => p.id !== targetId);
        broadcastRoom(room);
        const targetWs = room.sockets.get(targetId);
        if (targetWs) {
          try { targetWs.send(JSON.stringify({ type: 'kicked' })); } catch {}
          try { targetWs.close(4003, 'Kicked by host'); } catch {}
          room.sockets.delete(targetId);
        }
      }
      return;
    }

    // Rename player
    if (msg.type === 'rename' && typeof msg.name === 'string' && msg.name.trim()) {
      const newName = msg.name.trim().slice(0, 24);
      me.profile = { steamId: me.profile?.steamId ?? '', name: newName, avatar: me.profile?.avatar ?? '' };
      broadcastRoom(room);
      return;
    }

    // Settings (Host only)
    if (msg.type === 'settings' && id === 1 && !room.started && room.mode !== 'daily' && room.mode !== 'load') {
      if (
        !Number.isInteger(msg.ascension) || msg.ascension < 0 ||
        msg.ascension > Math.min(...room.players.map(p => p.maxAscension ?? 0)) ||
        typeof msg.seed !== 'string' || !/^[A-Z0-9_]{0,40}$/.test(msg.seed) ||
        !Array.isArray(msg.modifiers) || msg.modifiers.length > 40 ||
        msg.modifiers.some((m: unknown) => typeof m !== 'string' || !/^[A-Z0-9_]+(:[A-Z0-9_]+)?$/.test(m)) ||
        (room.mode !== 'custom' && msg.modifiers.length)
      ) return;
      room.ascension = msg.ascension;
      room.seed = msg.seed;
      room.modifiers = msg.modifiers;
      for (const p of room.players) p.ready = false;
      broadcastRoom(room);
      return;
    }

    // Select character
    if (msg.type === 'select' && !room.started && room.mode !== 'load') {
      const ok = validCharacterSelection(msg.character, msg.unlock, room.mode === 'daily');
      if (!ok) {
        console.warn(`[WS REJECT] Room ${code}, Player ${id}: invalid character selection ${msg.character}`);
        return ws.close(1008, 'Invalid selection');
      }
      me.character = msg.character;
      me.unlock = msg.unlock;
      me.maxAscension = Number.isInteger(msg.maxAscension) ? Math.max(0, Math.min(10, msg.maxAscension)) : 0;
      room.ascension = Math.min(room.ascension ?? 0, ...room.players.map(p => p.maxAscension ?? 0));
      me.ready = false;
      broadcastRoom(room);
      return;
    }

    // Ready status
    if (msg.type === 'ready' && !room.started && (room.mode === 'load' || validCharacterSelection(me.character, me.unlock, room.mode === 'daily'))) {
      me.ready = msg.ready === true;
      broadcastRoom(room);
      return;
    }

    // Start run (Host only)
    if (msg.type === 'start' && id === 1 && !room.started) {
      const isValidPlayer = (p: Player) => room.mode === 'load' ? true : validCharacterSelection(p.character, p.unlock, room.mode === 'daily');
      if (
        room.players.length >= 2 &&
        room.players.every(p => p.ready && isValidPlayer(p) && room.sockets.get(p.id)?.readyState === WebSocket.OPEN)
      ) {
        room.started = true;
        room.seed ||= crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase();
        const startMsg = JSON.stringify({
          type: 'start',
          mode: room.mode,
          seed: room.seed,
          saveJson: room.saveJson,
          settings: {
            ascension: room.ascension ?? 0,
            modifiers: room.modifiers ?? [],
            dailyDate: room.dailyDate ?? new Date(room.created).toISOString().slice(0, 10),
          },
          players: room.players.map(({ id, character, unlock, profile }) => ({ id, character, unlock, profile })),
        });
        for (const otherWs of room.sockets.values()) {
          if (otherWs.readyState === WebSocket.OPEN) otherWs.send(startMsg);
        }
        return;
      }
    }
  });

  ws.on('close', (closeCode: number, reason: Buffer) => {
    console.log(`[WS CLOSE] Room ${code}, Player ${id}: code=${closeCode}, reason=${reason?.toString() || 'none'}`);
    room.sockets.delete(id);
    player.disconnectedAt = Date.now();
    if (!room.started) player.ready = false;

    if (room.started && room.protocol !== 4) {
      for (const otherWs of room.sockets.values()) {
        if (otherWs.readyState === WebSocket.OPEN) otherWs.send(JSON.stringify({ type: 'ended' }));
      }
    } else {
      broadcastRoom(room);
    }
  });

  ws.on('error', (err) => {
    console.error(`[WS ERROR] Room ${code}, Player ${id}:`, err);
    try { ws.close(); } catch {}
  });
});

// Periodic garbage collection for expired rooms
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    // Rooms older than 24 hours
    if (now - room.created > 24 * 60 * 60_000) {
      for (const ws of room.sockets.values()) {
        try { ws.close(1000, 'Room expired'); } catch {}
      }
      rooms.delete(code);
      continue;
    }
    // Rooms inactive with 0 connected sockets for > 2 hours
    const hasOnline = Array.from(room.sockets.values()).some(ws => ws.readyState === WebSocket.OPEN);
    if (!hasOnline && room.players.every(p => p.disconnectedAt && now - p.disconnectedAt > 2 * 60 * 60_000)) {
      rooms.delete(code);
    }
  }
}, 60_000);

server.listen(PORT, HOST, () => {
  console.log(`[sts2-room] Standalone room & signaling server listening on http://${HOST}:${PORT}`);
});
