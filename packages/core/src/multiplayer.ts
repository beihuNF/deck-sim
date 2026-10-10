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
    if (!this.IsConnected) throw new Error('Multiplayer disconnected');
    const length = { v: 0 };
    const bytes = this.bus.SerializeMessage(T, this.NetId, message, length);
    this.send(Array.from(bytes.slice(0, length.v)), to);
  }
  receive(bytes: number[], sender: number) {
    const message = { v: null as any }, encodedSender = { v: null as any };
    if (!this.bus.TryDeserializeMessage(bytes, message, encodedSender)) throw new Error('Invalid multiplayer packet');
    // Never trust the player ID embedded in a client's packet.
    if (encodedSender.v !== sender) throw new Error('Multiplayer sender mismatch');
    // The relay fans out packets; original client requests with ShouldBroadcast=false are addressed only to host.
    if (this.Type === G.NetGameType.Client && sender !== this.HostNetId && !message.v.ShouldBroadcast) return;
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
  SetPeers(ids: number[]) {
    this.ConnectedPeers.splice(0, this.ConnectedPeers.length, ...ids.filter(id => id !== this.NetId).map(peerId => ({ peerId, readyForBroadcasting: true, versionInfo: this.LocalVersion })));
  }
  GetVersionInfoForPeer() { return this.LocalVersion; }
  DisconnectClient() { this.Disconnect(); }
  Disconnect() { this.IsConnected = false; }
}

export interface WebRunPlayer { id: number; character: string; unlock: string }
/** NDailyRunScreen.SetupLobbyParams: three independent streams, roster order, and the original modifier picker. */
export function webDailySetup(date: string, players: { id: number }[]) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))) throw new Error('Invalid daily date');
  const [year, month, day] = date.split('-');
  const dateSeed = `${day}_${month}_${year}`;
  const rng = new G.Rng().$ctor_Rng$UInt64(G.StringHelper.GetDeterministicHashCode(G.SeedHelper.CanonicalizeSeed(dateSeed)));
  const characterRng = new G.Rng().$ctor_Rng$UInt64(rng.NextUnsignedLong$0());
  const ascensionRng = new G.Rng().$ctor_Rng$UInt64(rng.NextUnsignedLong$0());
  const modifierRng = new G.Rng().$ctor_Rng$UInt64(rng.NextUnsignedLong$0());
  const characters = players.map(() => characterRng.NextItem(G.CharacterModel, G.ModelDb.AllCharacters));
  return {
    seed: G.SeedHelper.CanonicalizeSeed(`${dateSeed}_${players.length}p`), characters,
    ascension: ascensionRng.NextInt$2(0, 11), modifiers: G.ModifierModel.Pick2Good1Bad(modifierRng, characters),
    dailyTime: (ext('System.DateTimeOffset') as any).FromUnixTimeMilliseconds(Date.parse(date)),
  };
}
export function webRunModifiers(keys: string[]) {
  const all = [...Array.from(G.ModelDb.GoodModifiers), ...Array.from(G.ModelDb.BadModifiers)] as any[];
  const seen = new Set<any>();
  return keys.map(key => {
    const [id, characterId] = key.split(':');
    const canonical = all.find(m => m.Id.Entry === id);
    if (!canonical || seen.has(canonical)) throw new Error('Invalid multiplayer modifier');
    for (const group of Array.from(G.ModelDb.MutuallyExclusiveModifiers) as any[]) {
      if (group.Contains(canonical) && [...seen].some(m => group.Contains(m))) throw new Error('Conflicting multiplayer modifiers');
    }
    seen.add(canonical);
    const mod = canonical.ToMutable();
    if (mod instanceof G.CharacterCards) {
      const character = Array.from(G.ModelDb.AllCharacters).find((c: any) => c.Id.Entry === characterId) as any;
      if (!character) throw new Error('Invalid modifier character');
      mod.CharacterModel = character.Id;
    } else if (characterId) throw new Error('Invalid multiplayer modifier');
    return mod;
  });
}
/** Use the typed codec: the untyped serializer omits transpiled auto-properties and produces an empty snapshot. */
export function serializeWebUnlockState(unlock: any): string {
  return (ext('System.Text.Json.JsonSerializer') as any).Serialize(unlock.ToSerializable(), { $type: G.SerializableUnlockState });
}
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
  if (mode === 'daily') {
    const daily = webDailySetup(dailyTime, players);
    if (players.some((p, i) => p.character !== daily.characters[i].Id.Entry)) throw new Error('Invalid daily character');
    seed = daily.seed; ascension = daily.ascension; modifiers = daily.modifiers; dailyTime = daily.dailyTime;
  } else dailyTime = null;
  const json: any = ext('System.Text.Json.JsonSerializer');
  const roster = players.map(p => {
    const unlock = G.UnlockState.FromSerializable(json.Deserialize(G.SerializableUnlockState, p.unlock));
    const character = Array.from(G.ModelDb.AllCharacters).find((c: any) => c.Id.Entry === p.character);
    if (!character) throw new Error('Unknown multiplayer character: ' + p.character);
    if (mode !== 'daily' && !Array.from(unlock.Characters).includes(character)) throw new Error('Locked multiplayer character: ' + p.character);
    return G.Player.CreateForNewRun$CharacterModel_UnlockState_UInt64(character, unlock, p.id);
  });
  const unlock = new G.UnlockState().$ctor_UnlockState$IEnumerableUnlockState(roster.map((p: any) => p.UnlockState));
  const rng = new G.Rng().$ctor_Rng$2(G.StringHelper.GetDeterministicHashCode(seed), 'act_selection');
  const acts = Array.from(G.ActModel.GetRandomList(rng, unlock, true)).map((a: any) => a.ToMutable());
  const gameMode = mode === 'daily' ? G.GameMode.Daily : mode === 'custom' ? G.GameMode.Custom : G.GameMode.Standard;
  const state = G.RunState.CreateForNewRun(roster, acts, modifiers, gameMode, ascension, seed);
  const rm = G.RunManager.Instance;
  net.SetPeers(players.map(p => p.id));
  rm.SetUpNewMultiplayer(state, {
    NetService: net, InputSynchronizer: new G.PeerInputSynchronizer().$ctor_PeerInputSynchronizer(net),
    Players: players.map(p => ({ id: p.id, isModded: false })),
  }, false, dailyTime);
  await rm.FinalizeStartingRelics();
  attach(state);
  rm.Launch();
  await rm.EnterAct(0, false);
  return state;
}
