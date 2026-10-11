/* eslint-disable @typescript-eslint/no-explicit-any */
// NMultiplayerPlayerExpandedState and scenes/ui/multiplayer_player_expanded_state.tscn.
import { atlasFrame, frameByName, frameStyle } from '../assets';
import { loc, locv } from '../i18n';
import { mpText } from '../multiplayer';
import { edge, view } from '../view';
import { BackButton } from './buttons';
import { closeCardsView } from './pause';
import { RichText } from './richtext';
import { DeckEntry } from './history';
import { inspectRelic } from './inspect';
import { setTip, setTips, hoverTipsOf, logicalRect } from './tooltip';

type State = { player: any; cards: any[]; relics: any[]; potions: any[] };
const noHighlight = () => {};
/** Original CardGroupKey: ID, upgrade level, enchantment ID and amount; keep first occurrence order. */
function groupCards(cards: any[]) {
  const groups = new Map<string, { card: any; n: number; floors: number[] }>();
  for (const card of cards) {
    const e = card.Enchantment;
    const key = JSON.stringify([card.Id.Category, card.Id.Entry, card.CurrentUpgradeLevel, e?.Id.Category ?? null, e?.Id.Entry ?? null, e?.Amount ?? null]);
    const group = groups.get(key);
    if (group) group.n++; else groups.set(key, { card, n: 1, floors: [] });
  }
  return [...groups.values()];
}
export function MultiplayerExpandedState({ state }: { state: State }) {
  const p = state.player;
  const header = (key: string) => <RichText text={loc('gameplay_ui', `MULTIPLAYER_EXPANDED_STATE.${key}Header`)} />;
  return <div class="capstone mp-expanded" data-player-id={p.NetId}>
    <div class="mp-expanded-content" style={{ left: `${edge.l + 250}px`, top: `${edge.t + 128}px`, width: `${view.w - 500}px`, maxHeight: `${view.h - 240}px` }}>
      <div class="mp-expanded-title"><RichText text={locv('gameplay_ui', 'MULTIPLAYER_EXPANDED_STATE.title', { PlayerName: `${mpText('玩家', 'Player')} ${p.NetId}`, Character: p.Character.Title.GetFormattedText() })} /></div>
      <div class="mp-expanded-spacer" />
      <section><div class="mp-expanded-header">{header('relic')}</div><div class="mp-expanded-icons">
        {state.relics.map(r => <div class="mp-expanded-relic" data-ctl
          onPointerEnter={e => setTips(hoverTipsOf(r), { kind: 'relic', rect: logicalRect(e.currentTarget)! })}
          onPointerLeave={() => setTip(null)} onClick={() => { setTip(null); inspectRelic(state.relics, r); }}>
          <div style={frameStyle(frameByName('relic_outline_atlas', String(r.Id.Entry).toLowerCase()), 60, 60)} />
          <div style={frameStyle(atlasFrame(r.IconPath), 60, 60)} />
          {r.ShowCounter && <b class="relic-amount">{r.DisplayAmount}</b>}
        </div>)}
      </div></section>
      <section><div class="mp-expanded-header">{header('potion')}</div><div class="mp-expanded-icons">
        {state.potions.map(potion => <div class="mp-expanded-potion" data-ctl
          onPointerEnter={e => setTips(hoverTipsOf(potion), { kind: 'align', rect: logicalRect(e.currentTarget)!, align: 'center' })}
          onPointerLeave={() => setTip(null)}>
          <div style={frameStyle(frameByName('potion_outline_atlas', String(potion.Id.Entry).toLowerCase()), 54, 54)} />
          <div style={frameStyle(atlasFrame(potion.ImagePath), 54, 54)} />
        </div>)}
      </div></section>
      <section><div class="mp-expanded-header">{header('card')}</div><div class="rhs-deck-grid">
        {groupCards(state.cards).map((g, i) => <div data-ctl key={i}><DeckEntry g={g} all={state.cards} setHl={noHighlight} /></div>)}
      </div></section>
    </div>
    <BackButton enabled onClick={() => { setTip(null); closeCardsView(); }} />
  </div>;
}
