import { describe, it, expect } from 'vitest';
import { boot } from './helpers';
import { validCharacterSelection } from '../../server/src/selection';
import { CoopMapDrawings } from '../../app/src/ui/map-coop';
const G: any = boot();
const characterUnlocks = () => new G.UnlockState().$ctor_UnlockState$3(
  ['SILENT1_EPOCH', 'REGENT1_EPOCH', 'NECROBINDER1_EPOCH', 'DEFECT1_EPOCH'], [], 0);
describe('web multiplayer packets', () => {
  it('preserves mouse and controller focus coordinates through the original peer-input packets', async () => {
    const V = G.$.ext('Godot.Vector2'), T = G.$.ext('Godot.Transform2D');
    const root = { Size: new V(1920, 1080), GetGlobalTransformWithCanvas: () => T.Identity };
    const translated = { Size: root.Size, GetGlobalTransformWithCanvas: () => new T(new V(2, 0), new V(0, 3), new V(10, 20)) };
    expect(G.NetCursorHelper.GetNormalizedPosition(new V(100, 200), translated)).toEqual(new V((210 - 960) / 960, (620 - 540) / 540));
    const client = new G.WebNetService(2, () => {}, 'cursor');
    const host = new G.WebNetService(1, (packet: number[]) => client.receive(packet, 1), 'cursor');
    const a = new G.PeerInputSynchronizer().$ctor_PeerInputSynchronizer(host);
    const b = new G.PeerInputSynchronizer().$ctor_PeerInputSynchronizer(client);
    try {
      a.SyncLocalMousePos(new V(1440, 270), root);
      a.SyncLocalMouseDown(true);
      await new Promise(resolve => setTimeout(resolve, 80));
      const mouse = b.GetControlSpaceFocusPosition(1, root);
      expect(mouse.X).toBeCloseTo(1440, 0); expect(mouse.Y).toBeCloseTo(270, 0);
      expect(b.GetMouseDown(1)).toBe(true);
      a.SyncLocalControllerFocus(new V(640, 720), root);
      a.SyncLocalIsUsingController(true);
      a.SyncLocalIsTargeting(true);
      await new Promise(resolve => setTimeout(resolve, 80));
      const pad = b.GetControlSpaceFocusPosition(1, root);
      expect(pad.X).toBeCloseTo(640, 0); expect(pad.Y).toBeCloseTo(720, 0);
      expect(b.GetIsTargeting(1)).toBe(true);
      a.SyncLocalIsUsingController(false);
      a.SyncLocalMouseDown(false);
      await new Promise(resolve => setTimeout(resolve, 80));
      expect(b.GetControlSpaceFocusPosition(1, root).X).toBeCloseTo(1440, 0);
      expect(b.GetMouseDown(1)).toBe(false);
    } finally { a.Dispose(); b.Dispose(); host.Disconnect(); client.Disconnect(); }
  });
  it('derives daily parameters from the UTC day and roster with original rule helpers', () => {
    const a = G.webDailySetup('2026-10-10', [{ id: 1 }, { id: 2 }]);
    const b = G.webDailySetup('2026-10-10', [{ id: 1 }, { id: 2 }]);
    const four = G.webDailySetup('2026-10-10', [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    expect(a.seed).toBe(b.seed);
    expect(a.seed).not.toBe(four.seed);
    expect(a.characters.map((c: any) => c.Id.Entry)).toEqual(b.characters.map((c: any) => c.Id.Entry));
    expect(a.characters).toEqual(four.characters.slice(0, 2));
    expect(a.ascension).toBe(b.ascension);
    expect(a.modifiers.map((m: any) => m.ToSerializable())).toEqual(b.modifiers.map((m: any) => m.ToSerializable()));
    expect(a.modifiers).toHaveLength(3);
    expect(() => G.webDailySetup('invalid', [])).toThrow('Invalid daily date');
  });
  it('builds original custom modifiers and rejects invalid or mutually exclusive combinations', () => {
    const mods = G.webRunModifiers(['CHARACTER_CARDS:SILENT']);
    expect(mods[0].CharacterModel.Entry).toBe('SILENT');
    expect(() => G.webRunModifiers(['NOT_A_MODIFIER'])).toThrow();
    expect(() => G.webRunModifiers(['CHARACTER_CARDS:UNKNOWN'])).toThrow();
    expect(() => G.webRunModifiers(['CHARACTER_CARDS:SILENT', 'CHARACTER_CARDS:IRONCLAD'])).toThrow();
    const group: any = Array.from(G.ModelDb.MutuallyExclusiveModifiers)[0];
    expect(() => G.webRunModifiers(Array.from(group, (m: any) => m.Id.Entry))).toThrow('Conflicting');
  });
  it('preserves directed recipients and populates the original connected-peer roster', () => {
    let recipient: number | undefined;
    const net = new G.WebNetService(1, (_b: number[], to: number) => { recipient = to; }, 'direct');
    net.SetPeers([1, 2, 3, 4]);
    expect(net.ConnectedPeers.map((p: any) => p.peerId)).toEqual([2, 3, 4]);
    net.SendMessage$3(G.PlayerLeftMessage, new G.PlayerLeftMessage().$ctor_PlayerLeftMessage$1(2), 2);
    expect(recipient).toBe(2);
    net.Disconnect();
    expect(() => net.SendMessage$3(G.PlayerLeftMessage, new G.PlayerLeftMessage().$ctor_PlayerLeftMessage$1(2), 2)).toThrow('disconnected');
  });
  it('round trips a player choice through the original packet codec', () => {
    const sent: number[][] = [];
    const host = new G.WebNetService(1, (b: number[]) => sent.push(b), 'test');
    const client = new G.WebNetService(2, () => {}, 'test');
    let got: any;
    client.RegisterMessageHandler(G.PlayerLeftMessage, (m: any, sender: number) => { got = [m.playerId, sender]; });
    const message = new G.PlayerLeftMessage().$ctor_PlayerLeftMessage$1(2);
    host.SendMessage$2(G.PlayerLeftMessage, message);
    client.receive(sent[0], 1);
    expect(got).toEqual([2, 1]);
    expect(() => client.receive(sent[0], 2)).toThrow('sender mismatch');
  });
  it('keeps multiplayer writes in a separate temporary view of the save files', async () => {
    const v = G.$.vfs;
    v.write('user://mp-test/current_run.save', 'original');
    await v.flush();
    await v.beginEphemeralSession();
    await v.writeSave('user://mp-test/current_run.save', 'temporary');
    expect(v.read('user://mp-test/current_run.save.backup')).toBe('original');
    expect(v.read('user://mp-test/current_run.save')).toBe('temporary');
    v.setUnloading(true);
    v.remove('user://mp-test/current_run.save');
    await v.flush();
    expect(v.exists('user://mp-test/current_run.save')).toBe(false);
    expect(v.ephemeral).toBe(true);
    await expect(v.restore([])).rejects.toThrow('during multiplayer');
  });
  it('starts two characters with stable identities and round trips their room-entry sync data', async () => {
    const unlock = G.serializeWebUnlockState(characterUnlocks());
    const packets: number[][] = [];
    const net = new G.WebNetService(1, (b: number[]) => packets.push(b), 'test');
    const state = await G.startWebMultiplayerRun([
      { id: 1, character: 'IRONCLAD', unlock }, { id: 2, character: 'SILENT', unlock },
    ], 'COOPTEST', net, () => {});
    expect(state.Players.map((p: any) => [p.NetId, p.Character.Id.Entry])).toEqual([[1, 'IRONCLAD'], [2, 'SILENT']]);
    const client = new G.WebNetService(2, () => {}, 'test');
    let got: any;
    client.RegisterMessageHandler(G.SyncPlayerDataMessage, (m: any) => { got = m.player; });
    const message = new G.SyncPlayerDataMessage().$zero_SyncPlayerDataMessage();
    message.player = state.Players[0].ToSerializable();
    net.SendMessage$2(G.SyncPlayerDataMessage, message);
    client.receive(packets.at(-1)!, 1);
    expect(got.NetId).toBe(1);
    expect(got.CharacterId.Entry).toBe('IRONCLAD');
    G.RunManager.Instance.CleanUp(true);
  });
  it('starts 4 characters with full roster and broadcasts messages to all peers', async () => {
    const unlock = G.serializeWebUnlockState(characterUnlocks());
    const busPackets: number[][] = [];
    const host = new G.WebNetService(1, (b: number[]) => busPackets.push(b), '4p-test');
    const state = await G.startWebMultiplayerRun([
      { id: 1, character: 'IRONCLAD', unlock },
      { id: 2, character: 'SILENT', unlock },
      { id: 3, character: 'REGENT', unlock },
      { id: 4, character: 'NECROBINDER', unlock },
    ], '4PSEED', host, () => {});
    expect(state.Players.map((p: any) => [p.NetId, p.Character.Id.Entry])).toEqual([
      [1, 'IRONCLAD'], [2, 'SILENT'], [3, 'REGENT'], [4, 'NECROBINDER'],
    ]);

    // 创建客户端 2、3、4
    const clients = [2, 3, 4].map(id => {
      let received: any = null;
      const client = new G.WebNetService(id, () => {}, '4p-test');
      client.RegisterMessageHandler(G.SyncPlayerDataMessage, (m: any) => { received = m.player; });
      return { id, client, getReceived: () => received };
    });

    const msg = new G.SyncPlayerDataMessage().$zero_SyncPlayerDataMessage();
    msg.player = state.Players[0].ToSerializable();
    host.SendMessage$2(G.SyncPlayerDataMessage, msg);
    const packet = busPackets.at(-1)!;

    for (const c of clients) {
      c.client.receive(packet, 1);
      expect(c.getReceived()?.NetId).toBe(1);
      expect(c.getReceived()?.CharacterId.Entry).toBe('IRONCLAD');
    }
    G.RunManager.Instance.CleanUp(true);
  });
  it('preserves unlocked characters across the lobby snapshot and rejects locked selections', async () => {
    const snapshot = G.serializeWebUnlockState(characterUnlocks());
    const restored = G.$.ext('System.Text.Json.JsonSerializer').Deserialize(G.SerializableUnlockState, snapshot);
    expect(Array.from(G.UnlockState.FromSerializable(restored).Characters, (c: any) => c.Id.Entry)).toContain('SILENT');
    expect(validCharacterSelection('SILENT', snapshot)).toBe(true);
    const locked = G.serializeWebUnlockState(G.UnlockState.none);
    expect(validCharacterSelection('IRONCLAD', locked)).toBe(true);
    expect(validCharacterSelection('SILENT', locked)).toBe(false);
    expect(validCharacterSelection('IRONCLAD', '{}')).toBe(false);
    expect(validCharacterSelection('SILENT', 'null')).toBe(false);
    await expect(G.startWebMultiplayerRun([{ id: 1, character: 'SILENT', unlock: locked }],
      'LOCKED', new G.WebNetService(1, () => {}, 'test'), () => {})).rejects.toThrow('Locked multiplayer character');
  });
  it('round trips original map drawing messages including begin, continue, end and clear', () => {
    const packets: number[][] = [];
    const host = new G.WebNetService(1, (b: number[]) => packets.push(b), 'drawing');
    const guest = new G.WebNetService(2, () => {}, 'drawing');
    let received: any;
    guest.RegisterMessageHandler(G.MapDrawingMessage, (m: any, sender: number) => { received = { m, sender }; });
    const message = new G.MapDrawingMessage().$ctor_MapDrawingMessage();
    for (const type of [G.MapDrawingEventType.BeginLine, G.MapDrawingEventType.ContinueLine, G.MapDrawingEventType.EndLine]) {
      const ev = new G.NetMapDrawingEvent().$zero_NetMapDrawingEvent();
      ev.type = type; ev.position = { X: 0.25, Y: 0.75 }; ev.overrideDrawingMode = type === G.MapDrawingEventType.BeginLine ? 2 : null;
      message.TryAddEvent(ev);
    }
    host.SendMessage$2(G.MapDrawingMessage, message);
    guest.receive(packets.at(-1)!, 1);
    expect(received.sender).toBe(1);
    expect(received.m.Events.map((e: any) => e.type)).toEqual([1, 2, 3]);
    expect(received.m.Events[0].overrideDrawingMode).toBe(2);
    expect(received.m.Events[1].position.Y).toBeCloseTo(0.75, 4);
    let cleared = false;
    guest.RegisterMessageHandler(G.ClearMapDrawingsMessage, () => { cleared = true; });
    host.SendMessage$2(G.ClearMapDrawingsMessage, new G.ClearMapDrawingsMessage().$zero_ClearMapDrawingsMessage());
    guest.receive(packets.at(-1)!, 1);
    expect(cleared).toBe(true);
  });
  it('dispatches location-targeted votes immediately and buffers votes for a future location', () => {
    const packets: number[][] = [];
    const guest = new G.WebNetService(2, (b: number[]) => packets.push(b), 'vote');
    const host = new G.WebNetService(1, () => {}, 'vote');
    const buffer = new G.RunLocationTargetedMessageBuffer().$ctor_RunLocationTargetedMessageBuffer(host);
    const seen: number[] = [];
    buffer.RegisterMessageHandler(G.RequestEnqueueActionMessage, (_m: any, sender: number) => seen.push(sender));
    const message = new G.RequestEnqueueActionMessage().$zero_RequestEnqueueActionMessage();
    message.action = new G.NetVoteForMapCoordAction().$zero_NetVoteForMapCoordAction();
    message.location = buffer.CurrentLocation;
    guest.SendMessage$2(G.RequestEnqueueActionMessage, message);
    host.receive(packets.at(-1)!, 2);
    expect(seen).toEqual([2]);
    const future = new G.RunLocation().$zero_RunLocation();
    future.roomId = 1;
    message.location = future;
    guest.SendMessage$2(G.RequestEnqueueActionMessage, message);
    host.receive(packets.at(-1)!, 2);
    expect(seen).toEqual([2]);
    buffer.OnLocationChanged(future);
    expect(seen).toEqual([2, 2]);
  });
  it('flushes pending stroke events before clearing so drawings cannot reappear on peers', async () => {
    const guest = new G.WebNetService(2, () => {}, 'clear');
    const host = new G.WebNetService(1, (packet: number[]) => guest.receive(packet, 1), 'clear');
    const roster = [{ NetId: 1 }, { NetId: 2 }];
    const remote = new CoopMapDrawings(guest, roster, () => {});
    const local = new CoopMapDrawings(host, roster, () => {});
    try {
      remote.begin(300, 400, false); // guest's own line must survive a host clear
      local.begin(10, 20, false);
      local.extend(30, 40);
      local.end();
      local.clearMine(); // before the 50 ms batch timer fires
      await new Promise(resolve => setTimeout(resolve, 70));
      expect(remote.layers.has(1)).toBe(false);
      expect(remote.layers.get(2)).toHaveLength(1);
    } finally { local.dispose(); remote.dispose(); }
  });
  it('resolves real player nicknames instead of hardcoded Test Host placeholder', () => {
    // 默认未注册时，回退到原版测试占位
    expect(G.PlatformUtil.GetPlayerNameRaw(G.PlatformType.None, 1)).toBe('Test Host');
    expect(G.PlatformUtil.GetPlayerNameRaw(G.PlatformType.None, 2)).toBe('2');

    // 注入自定义解析器后，能够正确拿到真实名字
    G.setWebPlayerNameResolver((id: any) => {
      if (Number(id) === 1) return 'HostPlayer';
      if (Number(id) === 2) return 'TeammatePlayer';
      return undefined;
    });
    try {
      expect(G.PlatformUtil.GetPlayerNameRaw(G.PlatformType.None, 1)).toBe('HostPlayer');
      expect(G.PlatformUtil.GetPlayerNameRaw(G.PlatformType.None, 2)).toBe('TeammatePlayer');
      // 未命中映射的继续回退到原逻辑
      expect(G.PlatformUtil.GetPlayerNameRaw(G.PlatformType.None, 1000)).toBe('Test Client 1');
    } finally {
      G.setWebPlayerNameResolver(null);
    }
    // 清除后恢复
    expect(G.PlatformUtil.GetPlayerNameRaw(G.PlatformType.None, 1)).toBe('Test Host');
  });
});

