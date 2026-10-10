import { G, $, GAME_VERSION, list } from './game';
import { ui, invalidate } from './store';
import { startCoopRun } from './flow';
import { loc } from './i18n';

export const multiplayer = {
  phase: 'idle' as 'idle' | 'connecting' | 'lobby' | 'starting' | 'playing' | 'ended',
  code: '', id: 0, mode: 'standard' as 'standard' | 'daily' | 'custom', maxPlayers: 4, maxAscension: 0,
  settings: { ascension: 0, seed: '', modifiers: [] as string[], dailyDate: '' },
  players: [] as { id: number; character: string; ready: boolean; connected: boolean }[], error: '',
};
const API = '/api/multiplayer/rooms';
const version = `${GAME_VERSION}/${__BUILD_ID__}/web-coop-3`;
let socket: WebSocket | null = null;
let net: any = null;
let timer: ReturnType<typeof setInterval> | null = null;
let lastSeen = 0;

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
  multiplayer.error = error;
  if (multiplayer.phase === 'playing' || multiplayer.phase === 'starting') {
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
  const code = multiplayer.code;
  if (code) clearSession(code);
  try { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'leave' })); } catch {}
  if ($.vfs.ephemeral) { socket?.close(); location.reload(); return; }
  if (timer) clearInterval(timer); timer = null;
  socket?.close(); socket = null;
  Object.assign(multiplayer, { phase: 'idle', code: '', id: 0, mode: 'standard', maxPlayers: 4, maxAscension: 0, settings: { ascension: 0, seed: '', modifiers: [], dailyDate: '' }, players: [], error: '' });
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
  if (multiplayer.phase !== 'idle') return;
  multiplayer.phase = 'connecting'; multiplayer.error = ''; multiplayer.mode = mode; changed();
  try {
    const saved = code ? getSession(code) : null;
    const body = code
      ? { version, token: saved?.token }
      : { version, mode, maxPlayers: 4 };
    const res = await fetch(code ? `${API}/${code.toUpperCase()}` : API, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
    });
    const result = await res.json();
    if (!res.ok) {
      if (code) clearSession(code);
      throw new Error(result.error ?? 'network');
    }
    setSession(result.code, result.id, result.token);
    Object.assign(multiplayer, { code: result.code, id: result.id, mode: result.mode ?? mode, maxPlayers: result.maxPlayers ?? 4 });
    const url = new URL(`${API}/${result.code}/socket`, location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('token', result.token);
    const ws = socket = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    net = new G.WebNetService(result.id, (bytes: number[], to = 0) => {
      if (ws.readyState !== WebSocket.OPEN) throw new Error('disconnected');
      ws.send(new Uint8Array([to, ...bytes]));
    }, result.code);
    net.SetBufferMessages(true);
    lastSeen = Date.now();
    timer = setInterval(() => {
      if (Date.now() - lastSeen > 20_000) failed('disconnected');
      else if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
    }, 5_000);
    let initializedSelection = false;
    ws.onopen = () => {
      if (socket !== ws) return;
      multiplayer.phase = 'lobby';
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
        if (msg.type === 'room') {
          multiplayer.players = msg.players;
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
          void startCoopRun(msg.players, msg.seed, net, msg.mode ?? multiplayer.mode, msg.settings).then(() => {
            if (multiplayer.phase === 'starting') multiplayer.phase = 'playing'; changed();
          }).catch(e => { console.error('Multiplayer start failed', e); failed('start'); });
        } else if (msg.type === 'ended') failed('disconnected');
        changed();
      } catch (e) { console.error('Multiplayer packet failed', e); failed('sync'); }
    };
    ws.onerror = () => { if (socket === ws) failed('network'); };
    ws.onclose = () => {
      if (socket === ws && multiplayer.error !== 'kicked') failed('disconnected');
    };
  } catch (e) { failed(e instanceof Error ? e.message : 'network'); }
}

export function multiplayerError() {
  const e = multiplayer.error;
  if (e === 'kicked') return loc('main_menu_ui', 'NETWORK_ERROR.KICKED.body');
  if (e === 'version') return mpText('双方网页版本不同，请刷新后重新建房。', 'Different game builds. Refresh both browsers and create a new room.');
  if (e === 'full') return mpText('房间已满或已开始。', 'The room is full or has already started.');
  if (e === 'room' || e === 'expired') return mpText('房间不存在或已过期。', 'Room not found or expired.');
  if (e === 'rate') return mpText('建房太频繁，请稍后再试。', 'Too many rooms created. Please try again later.');
  return mpText('连接中断或同步失败。请返回主菜单重新建房。', 'Connection lost or synchronization failed. Return to the menu and create a new room.');
}
