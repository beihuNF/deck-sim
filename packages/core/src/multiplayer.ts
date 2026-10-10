// Browser-only transport for the original game's synchronizers. The room server authenticates sender IDs.
import * as Core from './gen/sts2';
import { ext } from './rt/core';
const G: any = Core;

export class WebNetService {
  static $ifaces = [G.INetGameService, G.INetHostGameService, G.INetClientGameService];
  readonly Platform = G.PlatformType.None;
  readonly LocalVersion = G.PeerVersionInfo.LocalDefault();
  readonly HostNetId = 1;
  readonly ConnectedPeers: any[] = [];
  IsConnected = true;
  IsGameLoading = false;
  Disconnected: any = null;
  ClientConnected: any = null;
  ClientDisconnected: any = null;
  private bus = new G.NetMessageBus().$ctor_NetMessageBus(
    new G.PacketReader().$ctor_PacketReader(), new G.PacketWriter().$ctor_PacketWriter());
  constructor(readonly NetId: number, private send: (bytes: number[], to?: number) => void, private room: string) {}
  get Type() { return this.NetId === 1 ? G.NetGameType.Host : G.NetGameType.Client; }
  SendMessage$2(T: any, message: any) {
    if (!this.IsConnected) throw new Error('Multiplayer disconnected');
    const length = { v: 0 };
    const bytes = this.bus.SerializeMessage(T, this.NetId, message, length);
    this.send(Array.from(bytes.slice(0, length.v)));
  }
  SendMessage$3(T: any, message: any, to: number) {
    const length = { v: 0 };
    const bytes = this.bus.SerializeMessage(T, this.NetId, message, length);
    this.send(Array.from(bytes.slice(0, length.v)), to);
  }
  receive(bytes: number[], sender: number) {
    const message = { v: null as any }, encodedSender = { v: null as any };
    if (!this.bus.TryDeserializeMessage(bytes, message, encodedSender)) throw new Error('Invalid multiplayer packet');
    // Never trust the player ID embedded in a client's packet.
    if (encodedSender.v !== sender) throw new Error('Multiplayer sender mismatch');
    this.bus.SendMessageToAllHandlers(message.v, sender);
  }
  RegisterMessageHandler(T: any, handler: any) { this.bus.RegisterMessageHandler(T, handler); }
  UnregisterMessageHandler(T: any, handler: any) { this.bus.UnregisterMessageHandler(T, handler); }
  SetBufferMessages(on: boolean) { this.bus.SetBufferMessages(on); }
  SetGameLoading(on: boolean) { this.IsGameLoading = on; }
  Update() {}
  GetStatsForPeer(id: number) { return new G.ConnectionStats().$ctor_ConnectionStats(id); }
  GetRawLobbyIdentifier() { return this.room; }
  SetPeerReadyForBroadcasting() {}
  GetVersionInfoForPeer() { return this.LocalVersion; }
  DisconnectClient() { this.Disconnect(); }
  Disconnect() { this.IsConnected = false; }
}

export interface WebRunPlayer { id: number; character: string; unlock: string }
/** Preserve original DTOs: serialized unlock state is only an initial network snapshot, never a save migration. */
export async function startWebMultiplayerRun(
  players: WebRunPlayer[],
  seed: string,
  net: WebNetService,
  attach: (rs: any) => void,
  mode: string = 'standard',
  ascension = 0,
  modifiers: any[] = [],
  dailyTime: any = null,
) {
  const json: any = ext('System.Text.Json.JsonSerializer');
  const roster = players.map(p => {
    const unlock = G.UnlockState.FromSerializable(json.Deserialize(G.SerializableUnlockState, p.unlock));
    const character = Array.from(G.ModelDb.AllCharacters).find((c: any) => c.Id.Entry === p.character);
    if (!character) throw new Error('Unknown multiplayer character: ' + p.character);
    return G.Player.CreateForNewRun$CharacterModel_UnlockState_UInt64(character, unlock, p.id);
  });
  const unlock = new G.UnlockState().$ctor_UnlockState$IEnumerableUnlockState(roster.map((p: any) => p.UnlockState));
  const rng = new G.Rng().$ctor_Rng$2(G.StringHelper.GetDeterministicHashCode(seed), 'act_selection');
  const acts = Array.from(G.ActModel.GetRandomList(rng, unlock, true)).map((a: any) => a.ToMutable());
  const gameMode = mode === 'daily' ? G.GameMode.Daily : mode === 'custom' ? G.GameMode.Custom : G.GameMode.Standard;
  const state = G.RunState.CreateForNewRun(roster, acts, modifiers, gameMode, ascension, seed);
  const rm = G.RunManager.Instance;
  rm.SetUpNewMultiplayer(state, {
    NetService: net, InputSynchronizer: new G.PeerInputSynchronizer().$ctor_PeerInputSynchronizer(net),
    Players: players.map(p => ({ id: p.id, isModded: false })),
  }, false, dailyTime);
  await rm.FinalizeStartingRelics();
  rm.Launch();
  attach(state);
  await rm.EnterAct(0, false);
  return state;
}
