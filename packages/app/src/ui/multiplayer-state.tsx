// NMultiplayerPlayerState: values come from the original synchronized players, never a second simulation.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect } from 'preact/hooks';
import { G, $, N, list, localPlayer } from '../game';
import { ui, invalidate } from '../store';
import { imageUrl, atlasFrame, frameByName, frameStyle } from '../assets';
import { view, anchored } from '../view';
import { mpText } from '../multiplayer';
import { loc } from '../i18n';
import { tint } from '../filters';
import { HealthBar, Reticle } from './creature-ui';
import { TinyCard } from './history';

/** NScreenStateTracker's priority: capstones/overlays take precedence over the room. */
function screenType() {
  const S = G.NetScreenType;
  if (ui.gameOver) return S.GameOver;
  if (ui.subscreen) return ui.subscreen === 'menu' ? S.Settings : S.Compendium;
  if (ui.pauseOpen) return S.PauseMenu;
  if (ui.cardsView) return ui.cardsView.kind === 'deck' ? S.DeckView : S.CardPile;
  if (ui.mapOpen) return S.Map;
  const top = ui.overlays.at(-1);
  if (top) return top.kind === 'rewards' ? S.Rewards : S.CardSelection;
  if (ui.room?.kind === 'treasure' && ui.room.collection && !ui.room.claimed) return S.SharedRelicPicking;
  if (N('Rooms.NCombatRoom').Instance?.Ui?.Hand?.IsInCardSelection) return S.CardSelection;
  return S.Room;
}
const screenLabel = (s: number) => {
  const S = G.NetScreenType;
  if (s === S.Map) return mpText('地图', 'Map');
  if (s === S.Rewards) return mpText('领奖中', 'Rewards');
  if (s === S.CardSelection) return mpText('选牌中', 'Choosing cards');
  if (s === S.SharedRelicPicking) return mpText('选遗物', 'Choosing a relic');
  if (s === S.DeckView || s === S.CardPile) return mpText('查看卡牌', 'Viewing cards');
  if (s === S.PauseMenu || s === S.Settings || s === S.Compendium) return mpText('菜单', 'Menu');
  return '';
};

export function MultiplayerPlayerStates({ rs }: { rs: any }) {
  const players = list(rs.Players), rm = G.RunManager.Instance, cm = G.CombatManager.Instance;
  const sync = rm.InputSynchronizer;
  useEffect(() => {
    if (players.length < 2 || !sync) return;
    const subscriptions: [any, string][] = [[sync, 'StateChanged'], [sync, 'ScreenChanged'], [cm, 'PlayerEndedTurn'], [cm, 'PlayerUnendedTurn'], [cm, 'TurnStarted'], [rm.MapSelectionSynchronizer, 'PlayerVoteChanged'], [rm.MapSelectionSynchronizer, 'PlayerVoteCancelled'], [rm.MapSelectionSynchronizer, 'PlayerVotesCleared']];
    for (const p of players) for (const event of ['CurrentHpChanged', 'MaxHpChanged', 'BlockChanged']) subscriptions.push([p.Creature, event]);
    for (const p of players) if (p.PlayerCombatState) {
      for (const key of ['EnergyChanged', 'StarsChanged']) subscriptions.push([p.PlayerCombatState, key]);
      for (const key of ['CardAdded', 'CardRemoved']) subscriptions.push([p.PlayerCombatState.Hand, key]);
    }
    const flavor = rm.FlavorSynchronizer;
    const ping = (id: number) => document.querySelector(`.mp-player-state[data-player-id="${id}"] .mp-state-ready`)?.animate([{ filter: tint(.498, 1, 0) + ' brightness(3)' }, { filter: tint(.498, 1, 0) }], { duration: 700 });
    flavor.OnEndTurnPingReceived = $.dcombine(flavor.OnEndTurnPingReceived, ping);
    for (const [owner, event] of subscriptions) owner[event] = $.dcombine(owner[event], invalidate);
    let lastScreen: number | null = null;
    const stop = $.onFrame(() => {
      if (!rm.NetService.IsConnected) return false;
      const current = screenType();
      if (current !== lastScreen) { lastScreen = current; sync.SyncLocalScreen(current); }
      return true;
    });
    return () => { stop(); flavor.OnEndTurnPingReceived = $.dremove(flavor.OnEndTurnPingReceived, ping); for (const [owner, event] of subscriptions) owner[event] = $.dremove(owner[event], invalidate); };
  }, [rs, sync, ...players.map(p => p.PlayerCombatState)]);
  if (players.length < 2) return null;
  const me = localPlayer(rs);
  const columns = Math.max(1, Math.floor((view.w - 96) / 68));
  const [x, y] = anchored(12, 90 + Math.max(1, Math.ceil(list(me.Relics).length / columns)) * 68, 'lt');
  return <div class="mp-player-states" style={{ left: `${x}px`, top: `${y}px` }}>
    {[me, ...players.filter(p => p !== me)].map(p => {
      const c = p.Creature, pcs = p.PlayerCombatState;
      const ready = cm.IsInProgress ? cm.IsPlayerReadyToEndTurn(p) : rm.MapSelectionSynchronizer.GetVote(p) != null;
      const where = screenLabel(sync.GetScreenType(p.NetId));
      const location = p !== me ? G.NetScreenTypeExtensions.GetLocationIcon(sync.GetScreenType(p.NetId))?.ResourcePath : null;
      const pool = p.Character.CardPool;
      const tiny = { Pool: pool, VisualCardPool: pool, Type: G.CardType.Attack, Rarity: G.CardRarity.Common };
      return <div class={'mp-player-state' + (ready ? ' ready' : '')} key={p.NetId} data-player-id={p.NetId} data-ready={String(ready)}>
        <img class="mp-state-icon" src={imageUrl(p.Character.IconTexturePath) ?? ''} alt={loc('characters', `${p.Character.Id.Entry}.title`)} />
        {ready && <div class="mp-state-ready" style={{ ...frameStyle(frameByName('compressed', 'confirm_button_tick'), 48, 48), filter: tint(.498, 1, 0) }} title={mpText('已准备', 'Ready')} />}
        <div class="mp-state-info"><span class="mp-state-name">{mpText('玩家', 'Player')} {p.NetId}{p === me ? mpText('（你）', ' (You)') : ''}</span>
          {cm.IsInProgress && pcs && p !== me && <>
            <div class={'mp-state-count' + (pcs.Energy === 0 ? ' empty' : '')} title={mpText('能量', 'Energy')}><div style={frameStyle(atlasFrame(pool.EnergyIconPath), 28, 28)} /><b>{pcs.Energy}</b></div>
            {(pcs.Stars > 0 || p.Character instanceof G.Regent) && <div class="mp-state-count" title={mpText('星星', 'Stars')}><img src={imageUrl('images/ui/combat/energy_star.png') ?? ''} /><b>{pcs.Stars}</b></div>}
            <div class="mp-state-count mp-state-cards" title={mpText('手牌', 'Hand')}><TinyCard card={tiny} /><b>{list(pcs.Hand.Cards).length}</b></div>
          </>}
          {location && <div class="mp-state-location" title={where} data-screen={where} style={location.endsWith('.tres') ? frameStyle(atlasFrame(location), 28, 28) : { backgroundImage: `url(${imageUrl(location)})` }} />}
        </div>
        <div class="mp-state-health">
          <HealthBar c={c} bx={12} bw={Math.max(24, c.MaxHp / 80 * 175) - 24} outline={c.Block > 0} compact />
          {c.Block > 0 && <div class="mp-state-block"><img src={imageUrl('images/ui/combat/block.png') ?? ''} /><b>{c.Block}</b></div>}
        </div>
        <Reticle on={false} w={260} h={64} />
      </div>;
    })}
  </div>;
}
