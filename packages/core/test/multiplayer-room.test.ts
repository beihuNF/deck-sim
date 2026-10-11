// Execute the real Durable Object handlers with isolated memory storage and sockets.
// This checks routing/lobby behavior; it does not replace a workerd deployment test.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';
import { validCharacterSelection } from '../../server/src/selection';

const authSource = fs.readFileSync(new URL('../../server/src/auth.ts', import.meta.url), 'utf8');
const authModule = { exports: {} as any };
const fakeWorkers = { DurableObject: class { constructor(public ctx: any, public env: any) {} } };
new Function('require', 'exports', 'module', ts.transpileModule(authSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(() => fakeWorkers, authModule.exports, authModule);
const source = fs.readFileSync(new URL('../../server/src/index.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} as any };
new Function('require', 'exports', 'module', compiled)((name: string) => {
  if (name === 'cloudflare:workers') return { DurableObject: class { constructor(public ctx: any, public env: any) {} } };
  if (name === './auth') return authModule.exports;
  if (name === './selection') return { validCharacterSelection };
  throw new Error(`Unexpected dependency ${name}`);
}, module.exports, module);
const WebRoom = module.exports.WebRoom;
const unlock = JSON.stringify({ UnlockedEpochs: [], EncountersSeen: [], NumberOfRuns: 0 });
async function roomWithPlayers(n = 3, protocol = 3) {
  const values = new Map(), sockets: any[] = [];
  let ready: Promise<any>;
  const ctx = {
    storage: { get: async (key: string) => values.get(key), put: async (key: string, value: any) => values.set(key, structuredClone(value)), setAlarm: async () => {}, deleteAll: async () => values.clear() },
    blockConcurrencyWhile: (f: any) => { ready = f(); },
    getWebSockets: (tag?: string) => sockets.filter(s => !s.closed && (!tag || String(s.id) === tag)),
  };
  const room = new WebRoom(ctx, {});
  await ready!;
  for (let id = 1; id <= n; id++) {
    const res = await room.fetch(new Request('https://room/api/multiplayer/rooms/ABCDEF123456', {
      method: 'POST', headers: { 'X-Create-Room': '1' }, body: JSON.stringify({ version: 'test', protocol, instance: 'engine-' + id }),
    }));
    expect(res.status).toBe(200);
    sockets.push({ id, messages: [] as any[], closed: false,
      send(data: any) { this.messages.push(data); }, close() { this.closed = true; }, deserializeAttachment() { return { id: this.id }; },
    });
  }
  const send = (id: number, msg: any) => room.webSocketMessage(sockets[id - 1], typeof msg === 'string' || msg instanceof ArrayBuffer ? msg : JSON.stringify(msg));
  for (let id = 1; id <= n; id++) await send(id, { type: 'select', character: 'IRONCLAD', unlock, maxAscension: id === 1 ? 10 : 3 });
  return { room, sockets, values, send };
}

describe('web co-op room handlers', () => {
  it('uses the shared ascension cap, accepts host settings, and starts once all players ready', async () => {
    const { sockets, values, send } = await roomWithPlayers(2);
    await send(1, { type: 'settings', ascension: 4, seed: 'TEST', modifiers: [] });
    expect(values.get('room').ascension).toBe(0);
    await send(2, { type: 'settings', ascension: 3, seed: 'CLIENT', modifiers: [] });
    expect(values.get('room').seed).toBe('');
    await send(1, { type: 'settings', ascension: 3, seed: 'HOST', modifiers: [] });
    await send(1, { type: 'ready', ready: true });
    expect(values.get('room').started).toBe(false);
    await send(2, { type: 'ready', ready: true });
    expect(values.get('room').started).toBe(true);
    expect(values.get('room').seed).toBe('HOST');
    for (const socket of sockets) expect(socket.messages.filter((m: any) => typeof m === 'string' && JSON.parse(m).type === 'start')).toHaveLength(1);
    await send(1, { type: 'start' });
    for (const socket of sockets) expect(socket.messages.filter((m: any) => typeof m === 'string' && JSON.parse(m).type === 'start')).toHaveLength(1);
  });
  it('routes a directed original packet only to its recipient and rejects a forged sender', async () => {
    const { sockets, send } = await roomWithPlayers();
    for (const socket of sockets) await send(socket.id, { type: 'ready', ready: true });
    for (const socket of sockets) socket.messages.length = 0;
    const packet = new Uint8Array([2, 42, 1, 0, 0, 0, 0, 0, 0, 0]);
    await send(1, packet.buffer);
    expect(sockets[0].messages).toHaveLength(0);
    expect(Array.from(new Uint8Array(sockets[1].messages[0]))).toEqual([1, ...packet.slice(1)]);
    expect(sockets[2].messages).toHaveLength(0);
    packet[2] = 3;
    await send(1, packet.buffer);
    expect(sockets[0].closed).toBe(true);
  });
  it('rejects locked standard characters and clears readiness on a real disconnect', async () => {
    const { sockets, values, send, room } = await roomWithPlayers();
    await send(2, { type: 'ready', ready: true });
    sockets[1].closed = true;
    await room.webSocketClose(sockets[1], 1000, 'Refresh');
    expect(values.get('room').players[1].ready).toBe(false);
    await send(3, { type: 'select', character: 'SILENT', unlock });
    expect(sockets[2].closed).toBe(true);
    expect(values.get('room').players[2].character).toBe('IRONCLAD');
  });
});


describe('running room reconnection', () => {
  it('retains slots and delivery after disconnect, rejects newcomers and fresh engines', async () => {
    const { room, sockets, values, send } = await roomWithPlayers(2, 4);
    await send(1, { type: 'ready', ready: true }); await send(2, { type: 'ready', ready: true });
    sockets[1].closed = true; await room.webSocketClose(sockets[1], 1006, 'Offline');
    expect(sockets[0].messages.some((m: any) => typeof m === 'string' && JSON.parse(m).type === 'ended')).toBe(false);
    const bytes = [42, 1, 0, 0, 0, 0, 0, 0, 0];
    await send(1, { type: 'packet', seq: 1, to: 0, bytes });
    await send(1, { type: 'packet', seq: 1, to: 0, bytes });
    expect(values.get('delivery')['2'].pending).toHaveLength(1);
    const token = values.get('room').players[1].token;
    const join = (body: any) => room.fetch(new Request('https://room/api/multiplayer/rooms/ABCDEF123456', { method: 'POST', body: JSON.stringify({ version: 'test', ...body }) }));
    expect((await join({ token, instance: 'engine-2' })).status).toBe(200);
    expect((await join({ token, instance: 'fresh-page' })).status).toBe(409);
    expect((await join({})).status).toBe(409);
    expect(values.get('room').players).toHaveLength(2);
    await send(2, { type: 'ack', seq: 1 });
    expect(values.get('delivery')['2'].pending).toHaveLength(0);
  });
  it('rejects forged identities and sequence gaps, keeps transient pointers out of the backlog', async () => {
    const { sockets, values, send } = await roomWithPlayers(2, 4);
    await send(1, { type: 'ready', ready: true }); await send(2, { type: 'ready', ready: true });
    const bytes = [42, 1, 0, 0, 0, 0, 0, 0, 0];
    await send(1, { type: 'volatile', to: 0, bytes });
    expect(values.get('delivery')).toBeUndefined();
    await send(1, { type: 'packet', seq: 2, to: 0, bytes });
    expect(sockets[0].closed).toBe(true);
    await send(2, { type: 'packet', seq: 1, to: 0, bytes });
    expect(sockets[1].closed).toBe(true);
  });
});
