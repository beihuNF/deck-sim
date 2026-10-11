import { G, $, GAME_VERSION, list } from './game';
import { ui, invalidate } from './store';
import { startCoopRun } from './flow';
import { loc } from './i18n';

export const multiplayer = {
  phase: 'idle' as 'idle' | 'connecting' | 'lobby' | 'starting' | 'playing' | 'reconnecting' | 'ended',
  code: '', id: 0, mode: 'standard' as 'standard' | 'daily' | 'custom', maxPlayers: 4, maxAscension: 0,
  settings: { ascension: 0, seed: '', modifiers: [] as string[], dailyDate: '' },
  waiting: false,
  players: [] as { id: number; character: string; ready: boolean; connected: boolean; profile?: { steamId: string; name: string; avatar: string } }[], error: '',
};
const API = '/api/multiplayer/rooms';
const version = `${GAME_VERSION}/${__BUILD_ID__}/web-coop-4`;
export function invitedRoomCode() {
  const code = new URLSearchParams(location.search).get('room')?.toUpperCase();
  return code && /^[A-F0-9]{12}$/.test(code) ? code : null;
}
/** Invitations carry a public room code, never another player's authenticated session token. */
export function parseRoomInvitation(text: string) {
  const value = text.trim();
  if (/^[A-F0-9]{12}$/i.test(value)) return value.toUpperCase();
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const code = url.searchParams.get('room');
    return code && /^[A-F0-9]{12}$/i.test(code) ? code.toUpperCase() : null;
  } catch { return null; }
}
let socket: WebSocket | null = null;
let net: any = null;
let timer: ReturnType<typeof setInterval> | null = null;
let lastSeen = 0;
const instance = crypto.randomUUID();
let received = 0, sent = 0;
let outgoing: { type: 'packet'; seq: number; bytes: number[]; to: number }[] = [];
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryStarted = 0, retryCount = 0, attemptId = 0;
let paused: { executor: any; executorPaused: boolean; combatPaused: boolean } | null = null;
function pauseForReconnect() {
  const executor = G.RunManager.Instance.ActionExecutor;
  if (!paused) paused = { executor, executorPaused: executor?.IsPaused ?? true, combatPaused: G.CombatManager.Instance.IsPaused };
  executor?.Pause(); G.CombatManager.Instance.Pause();
}
function resumeAfterReconnect() {
  if (!paused) return;
  if (!paused.executorPaused) paused.executor?.Unpause();
  if (!paused.combatPaused) G.CombatManager.Instance.Unpause();
  paused = null;
}
function transportSend(message: unknown) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}
function disconnected() {
  if (multiplayer.phase !== 'playing' && multiplayer.phase !== 'reconnecting') { failed('disconnected'); return; }
  if (timer) clearInterval(timer); timer = null;
  const old = socket; socket = null; old?.close();
  multiplayer.phase = 'reconnecting'; multiplayer.waiting = true;
  pauseForReconnect();
  retryStarted ||= Date.now();
  if (!retryTimer && Date.now() - retryStarted < 120_000) retryTimer = setTimeout(() => {
    retryTimer = null; void connectMultiplayer(multiplayer.code);
  }, Math.min(1000 * 2 ** retryCount++, 10_000));
  changed();
}
export function retryMultiplayer() {
  if (multiplayer.phase !== 'reconnecting') return;
  if (retryTimer) clearTimeout(retryTimer); retryTimer = null;
  retryStarted = Date.now(); retryCount = 0;
  void connectMultiplayer(multiplayer.code);
}
export function multiplayerPlayerName(id: number) {
  return multiplayer.players.find(p => p.id === id)?.profile?.name || `${mpText('玩家', 'Player')} ${id}`;
}


const SESSION_KEY = (c: string) => `sts2_mp_${c.toUpperCase()}`;
function getSession(code: string): { id: number; token: string } | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY(code));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function setSession(code: string, id: number, token: string) {
  try { sessionStorage.setItem(SESSION_KEY(code), JSON.stringify({ id, token })); } catch {}
}
function clearSession(code: string) {
  try { sessionStorage.removeItem(SESSION_KEY(code)); } catch {}
}

export function mpText(zhs: string, eng: string) { return G.LocManager.Instance.Language?.startsWith('zh') ? zhs : eng; }
function changed() { invalidate(); }
function failed(error: string) {
  attemptId++;
  if (retryTimer) clearTimeout(retryTimer); retryTimer = null;
  multiplayer.error = error;
  if (multiplayer.phase === 'playing' || multiplayer.phase === 'starting' || multiplayer.phase === 'reconnecting') {
    multiplayer.phase = 'ended';
    net?.Disconnect();
    G.RunManager.Instance.ActionExecutor?.Pause();
    G.CombatManager.Instance.Pause();
  } else multiplayer.phase = 'idle';
  if (timer) clearInterval(timer); timer = null;
  socket?.close(); socket = null;
  changed();
}
export function leaveMultiplayer() {
  attemptId++;
  if (retryTimer) clearTimeout(retryTimer); retryTimer = null;
  const code = multiplayer.code;
  // Explicitly leaving an invitation must not rejoin it on the reload used to exit an ephemeral run.
  if (new URLSearchParams(location.search).has('room')) {
    const url = new URL(location.href); url.searchParams.delete('room');
    history.replaceState(history.state, '', url.href);
  }
  if (code) clearSession(code);
  try { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'leave' })); } catch {}
  if ($.vfs.ephemeral) { socket?.close(); location.reload(); return; }
  if (timer) clearInterval(timer); timer = null;
  socket?.close(); socket = null;
  Object.assign(multiplayer, { phase: 'idle', code: '', id: 0, mode: 'standard', maxPlayers: 4, maxAscension: 0, settings: { ascension: 0, seed: '', modifiers: [], dailyDate: '' }, players: [], waiting: false, error: '' });
  changed();
}
function send(msg: unknown) {
  if (socket?.readyState !== WebSocket.OPEN) throw new Error('disconnected');
  socket.send(JSON.stringify(msg));
}
export function selectMultiplayerCharacter(character: string) {
  const state = G.SaveManager.Instance.GenerateUnlockStateFromProgress();
  if (multiplayer.phase !== 'lobby' || (multiplayer.mode !== 'daily' && !list(state.Characters).some(c => c.Id.Entry === character))) return;
  const json = G.serializeWebUnlockState(state);
  send({ type: 'select', character, unlock: json, maxAscension: G.SaveManager.Instance.Progress.MaxMultiplayerAscension });
}
export function readyMultiplayer(ready: boolean) {
  const me = multiplayer.players.find(p => p.id === multiplayer.id);
  if (multiplayer.phase !== 'lobby' || !me || (ready && multiplayer.mode !== 'daily' && !list(G.SaveManager.Instance.GenerateUnlockStateFromProgress().Characters).some(c => c.Id.Entry === me.character))) return;
  send({ type: 'ready', ready });
}
export function configureMultiplayer(settings: Partial<typeof multiplayer.settings>) {
  if (multiplayer.phase !== 'lobby' || multiplayer.id !== 1 || multiplayer.mode === 'daily') return;
  send({ type: 'settings', ...multiplayer.settings, ...settings });
}
export function beginMultiplayer() { send({ type: 'start' }); }
export function kickMultiplayerPlayer(targetId: number) {
  if (multiplayer.id !== 1 || multiplayer.phase !== 'lobby') return;
  // 乐观更新：房主界面即刻移除被踢玩家，提供零延迟视觉反馈
  multiplayer.players = multiplayer.players.filter(p => p.id !== targetId);
  changed();
  try { send({ type: 'kick', targetId }); } catch {}
}
export async function connectMultiplayer(code?: string, mode: 'standard' | 'daily' | 'custom' = 'standard') {
  const reconnecting = multiplayer.phase === 'reconnecting';
  if (multiplayer.phase !== 'idle' && !reconnecting) return;
  const attempt = ++attemptId;
  if (!reconnecting) { multiplayer.phase = 'connecting'; multiplayer.mode = mode; }
  multiplayer.error = ''; changed();
  try {
    const saved = code ? getSession(code) : null;
    const body = code
      ? { version, token: saved?.token, instance, protocol: 4 }
      : { version, mode, maxPlayers: 4, instance, protocol: 4 };
    const res = await fetch(code ? `${API}/${code.toUpperCase()}` : API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
    });
    const result = await res.json();
    if (attempt !== attemptId) return;
    if (!res.ok) {
      if (code && ['room', 'expired', 'account'].includes(result.error)) clearSession(code);
      if (reconnecting && res.status >= 500) throw new Error('network');
      if (reconnecting) { failed(result.error ?? 'network'); return; }
      throw new Error(result.error ?? 'network');
    }
    setSession(result.code, result.id, result.token);
    Object.assign(multiplayer, { code: result.code, id: result.id, mode: result.mode ?? mode, maxPlayers: result.maxPlayers ?? 4 });
    const url = new URL(`${API}/${result.code}/socket`, location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', result.token); url.searchParams.set('instance', instance);
    const roomUrl = new URL(location.href); roomUrl.searchParams.set('room', result.code);
    history.replaceState(history.state, '', roomUrl);
    const ws = socket = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    if (!reconnecting) {
      received = 0; sent = 0; outgoing = [];
      net = new G.WebNetService(result.id, (bytes: number[], to = 0, transient = false) => {
        if (transient) { transportSend({ type: 'volatile', bytes, to }); return; }
        if (outgoing.length >= 2048) { failed('backlog'); return; }
        const packet = { type: 'packet' as const, seq: ++sent, bytes, to };
        outgoing.push(packet); transportSend(packet);
      }, result.code);
      net.SetBufferMessages(true);
    }
    lastSeen = Date.now();
    timer = setInterval(() => {
      if (Date.now() - lastSeen > 20_000) disconnected();
      else if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
    }, 5_000);
    let initializedSelection = false;
    ws.onopen = () => {
      if (socket !== ws) return;
      if (!reconnecting) multiplayer.phase = 'lobby';
      for (const packet of outgoing) transportSend(packet);
      changed();
    };
    ws.onmessage = e => {
      if (socket !== ws) return;
      lastSeen = Date.now();
      try {
        if (e.data instanceof ArrayBuffer) {
          const bytes = new Uint8Array(e.data); net.receive(Array.from(bytes.slice(1)), bytes[0]); changed(); return;
        }
        const msg = JSON.parse(e.data);
        if (msg.type === 'volatile') { net.receive(msg.bytes, msg.sender); changed(); return; }
        if (msg.type === 'packet') {
          if (!Number.isSafeInteger(msg.seq) || msg.seq < 1) throw new Error('Invalid delivery');
          if (msg.seq > received) {
            if (msg.seq !== received + 1) throw new Error('Delivery gap');
            net.receive(msg.bytes, msg.sender); received = msg.seq;
          }
          transportSend({ type: 'ack', seq: received }); changed(); return;
        }
        if (msg.type === 'sent') {
          if (!Number.isSafeInteger(msg.seq) || msg.seq < 0 || msg.seq > sent) throw new Error('Invalid acknowledgment');
          outgoing = outgoing.filter(p => p.seq > msg.seq); return; }
        if (msg.type === 'room') {
          multiplayer.players = msg.players;
          if (msg.started && (multiplayer.phase === 'playing' || multiplayer.phase === 'reconnecting')) {
            multiplayer.phase = 'playing'; multiplayer.waiting = msg.players.some((p: any) => !p.connected);
            retryStarted = 0; retryCount = 0;
            if (multiplayer.waiting) pauseForReconnect(); else resumeAfterReconnect();
          }
          multiplayer.settings = msg.settings;
          multiplayer.maxAscension = msg.maxAscension;
          if (msg.mode) multiplayer.mode = msg.mode;
          const me = msg.players.find((p: any) => p.id === result.id);
          if (multiplayer.phase === 'lobby' && me) {
            const daily = msg.mode === 'daily' ? G.webDailySetup(msg.settings.dailyDate, msg.players) : null;
            const character = daily ? daily.characters[msg.players.indexOf(me)].Id.Entry : me.character;
            if (!initializedSelection || me.character !== character) { initializedSelection = true; selectMultiplayerCharacter(character); }
          }
          if (msg.maxPlayers) multiplayer.maxPlayers = msg.maxPlayers;
        } else if (msg.type === 'kicked') {
          clearSession(multiplayer.code);
          failed('kicked');
          return;
        } else if (msg.type === 'start') {
          multiplayer.phase = 'starting';
          void startCoopRun(msg.players, msg.seed, net, msg.mode ?? multiplayer.mode, msg.settings, () => {
            console.error('Original multiplayer checksum detected state divergence');
            failed('divergence');
          }).then(() => {
            if (multiplayer.phase === 'starting') multiplayer.phase = 'playing'; changed();
          }).catch(e => { console.error('Multiplayer start failed', e); failed('start'); });
        } else if (msg.type === 'ended') failed(msg.error ?? 'disconnected');
        changed();
      } catch (e) { console.error('Multiplayer packet failed', e); failed('sync'); }
    };
    ws.onerror = () => { if (socket === ws) disconnected(); };
    ws.onclose = () => {
      if (socket === ws && multiplayer.error !== 'kicked') disconnected();
    };
  } catch (e) { if (attempt !== attemptId) return; if (reconnecting) disconnected(); else failed(e instanceof Error ? e.message : 'network'); }
}

export function multiplayerError() {
  const e = multiplayer.error;
  if (e === 'kicked') return loc('main_menu_ui', 'NETWORK_ERROR.KICKED.body');
  if (e === 'divergence') return mpText('与队友的游戏状态不同步，联机已停止。请双方刷新页面后重新建房。', 'Game state diverged from your teammate. The session has stopped. Refresh both pages and create a new room.');
  if (e === 'version') return mpText('双方网页版本不同，请刷新后重新建房。', 'Different game builds. Refresh both browsers and create a new room.');
  if (e === 'account') return mpText('请使用原来的 Steam 账号登录后重连。', 'Sign in with the original Steam account to reconnect.');
  if (e === 'reload') return mpText('运行中的重连需要保留原游戏页面。刷新已释放战斗状态，暂不能从新页面恢复。', 'Keep the original game page open to reconnect. A refreshed page cannot restore this running session yet.');
  if (e === 'full') return mpText('房间已满或已开始。', 'The room is full or has already started.');
  if (e === 'room' || e === 'expired') return mpText('房间不存在或已过期。', 'Room not found or expired.');
  if (e === 'rate') return mpText('建房太频繁，请稍后再试。', 'Too many rooms created. Please try again later.');
  return mpText('连接中断或同步失败。请返回主菜单重新建房。', 'Connection lost or synchronization failed. Return to the menu and create a new room.');
}
