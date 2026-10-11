/* eslint-disable @typescript-eslint/no-explicit-any */
// NMultiplayerPlayerIntentHandler: remote hover previews, remote targeting and player-choice feedback.
import { useEffect, useRef } from 'preact/hooks';
import { G, $, list } from '../game';
import { invalidate } from '../store';
import { atlasFrame, frameStyle } from '../assets';
import { edge, view } from '../view';
import { peerInputRoot } from '../input/peer-input';
import { Card } from './card';
import { setTip, setTips, hoverTipsOf, logicalRect } from './tooltip';
import type { Slot } from '../render/stage';

type PendingChoice = { action: any; model: any };
const choiceModels = new WeakMap<object, Map<number, PendingChoice>>();
const color = (c: any) => `rgb(${c.R * 255},${c.G * 255},${c.B * 255})`;
export function MultiplayerIntents({ room, slots }: { room: any; slots: Map<any, Slot> }) {
  const rm = G.RunManager.Instance, players = list(room.combatState?.RunState.Players);
  const waiting = choiceModels.get(room) ?? new Map<number, PendingChoice>();
  choiceModels.set(room, waiting);
  useEffect(() => {
    if (players.length < 2) return;
    const tracker = rm.HoveredModelTracker, queue = rm.ActionQueueSet;
    const cleanups = new Set<() => void>();
    const enqueued = (action: any) => {
      if (!players.some(p => p.NetId === action.OwnerId)) return;
      const paused = () => {
        const context = action instanceof G.GenericHookGameAction ? action.ChoiceContext : action.PlayerChoiceContext;
        const model = context?.LastInvolvedModel;
        if (model) { waiting.set(action.OwnerId, { action, model }); invalidate(); }
      };
      const resumed = () => {
        // Pausing a choice also cancels other queued cards for this player. Their cleanup must preserve this choice.
        if (waiting.get(action.OwnerId)?.action === action) { waiting.delete(action.OwnerId); invalidate(); }
      };
      const cleanup = () => {
        resumed();
        for (const [event, cb] of events) action[event] = $.dremove(action[event], cb);
        cleanups.delete(cleanup);
      };
      const events: [string, () => void][] = [['BeforePausedForPlayerChoice', paused], ['BeforeReadyToResumeAfterPlayerChoice', resumed], ['AfterFinished', cleanup], ['BeforeCancelled', cleanup]];
      for (const [event, cb] of events) action[event] = $.dcombine(action[event], cb);
      cleanups.add(cleanup);
    };
    tracker.HoverChanged = $.dcombine(tracker.HoverChanged, invalidate);
    queue.ActionEnqueued = $.dcombine(queue.ActionEnqueued, enqueued);
    return () => {
      tracker.HoverChanged = $.dremove(tracker.HoverChanged, invalidate);
      queue.ActionEnqueued = $.dremove(queue.ActionEnqueued, enqueued);
      for (const cleanup of cleanups) cleanup();
      choiceModels.delete(room);
    };
  }, [room, rm]);
  if (players.length < 2) return null;
  return <div class="mp-combat-intents">
    <svg class="mp-targeting-lines" style={{ left: `${edge.l}px`, top: `${edge.t}px`, width: `${view.w}px`, height: `${view.h}px` }} viewBox={`${edge.l} ${edge.t} ${view.w} ${view.h}`}>
      {players.filter(p => !G.LocalContext.IsMe$Player(p)).map(p => <RemoteTargetLine key={p.NetId} player={p} slots={slots} />)}
    </svg>
    {players.map(p => {
      const s = slots.get(p.Creature);
      if (!s || p.Creature.IsDead) return null;
      const model = waiting.get(p.NetId)?.model ?? (!G.LocalContext.IsMe$Player(p) ? rm.HoveredModelTracker.GetHoveredModel(p.NetId) : null);
      if (!model) return null;
      return <div class="mp-combat-intent" key={p.NetId} data-player-id={p.NetId} data-model-id={model.Id.Entry} data-waiting={String(waiting.has(p.NetId))}
        style={{ left: `${s.x + s.intent[0] - 34}px`, top: `${s.y + s.intent[1] - 34}px`, opacity: waiting.has(p.NetId) ? 1 : .5 }}
        onPointerEnter={e => { if (!G.LocalContext.IsMe$Player(p)) setTips(hoverTipsOf(model), { kind: 'align', rect: logicalRect(e.currentTarget)!, align: 'right' }); }}
        onPointerLeave={() => setTip(null)}>
        {model instanceof G.CardModel ? <div class="mp-intent-card"><Card card={model} width={90} pile={model.Pile?.Type ?? G.PileType.None} /></div>
          : <div class="mp-intent-icon" style={frameStyle(atlasFrame(model instanceof G.PotionModel ? model.ImagePath : model.IconPath), model instanceof G.PowerModel ? 48 : 60, model instanceof G.PowerModel ? 40 : 60)} />}
        {waiting.has(p.NetId) && <span class="mp-intent-thinking">{[0,1,2].map(i => <b style={{ animationDelay: `${i * .2}s` }}>.</b>)}</span>}
      </div>;
    })}
  </div>;
}
function RemoteTargetLine({ player, slots }: { player: any; slots: Map<any, Slot> }) {
  const group = useRef<SVGGElement>(null), live = useRef(slots);
  live.current = slots;
  useEffect(() => $.onFrame(() => {
    const el = group.current, sync = G.RunManager.Instance.InputSynchronizer, s = live.current.get(player.Creature);
    if (!el || !sync) return;
    const on = sync.GetIsTargeting(player.NetId) && !player.Creature.IsDead && !!s;
    el.style.display = on ? '' : 'none';
    if (!on || !s) return;
    const to = sync.GetControlSpaceFocusPosition(player.NetId, peerInputRoot);
    const x = s.x + s.intent[0], y = s.y + s.intent[1];
    // NRemoteTargetingIndicator's quadratic curve and its brighter alpha over enemies.
    const d = `M ${x} ${y} Q ${(x + to.X) / 2} ${y - (to.Y - y) / 2} ${to.X} ${to.Y}`;
    el.querySelectorAll('path').forEach(p => p.setAttribute('d', d));
    el.dataset.targetX = String(to.X); el.dataset.targetY = String(to.Y);
    const overEnemy = [...live.current].some(([c, n]) => c.IsEnemy && to.X >= n.x + n.bl && to.X <= n.x + n.bl + n.w && to.Y >= n.y + n.bt && to.Y <= n.y + n.bt + n.h);
    el.style.opacity = overEnemy ? '1' : '.5';
    el.style.transition = `opacity ${overEnemy ? .1 : .25}s linear`;
  }), [player]);
  return <g class="mp-targeting-line" ref={group} data-player-id={player.NetId} style={{ display: 'none' }} fill="none" stroke-linecap="round">
    <path stroke={color(player.Character.RemoteTargetingLineOutline)} stroke-width="6" opacity=".784314" />
    <path stroke={color(player.Character.RemoteTargetingLineColor)} stroke-width="5" />
  </g>;
}
