import { describe, it, expect } from 'vitest';
import { boot } from './helpers';
const G: any = boot();
describe('web multiplayer packets', () => {
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
    const json = G.$.ext('System.Text.Json.JsonSerializer');
    const unlock = json.Serialize(G.SerializableUnlockState, G.UnlockState.all.ToSerializable());
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
    const json = G.$.ext('System.Text.Json.JsonSerializer');
    const unlock = json.Serialize(G.SerializableUnlockState, G.UnlockState.all.ToSerializable());
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
});
