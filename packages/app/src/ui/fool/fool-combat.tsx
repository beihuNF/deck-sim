// NFoolCombatUi / NFoolArrowUi / NFoolCombatSymbol：愚者的弓、箭矢槽与三旋律（Wah / Cho / Ki）状态界面
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'preact/hooks';
import { G, $, list } from '../../game';
import { imageUrl } from '../../assets';
import { loc } from '../../i18n';
import { tint } from '../../filters';
import { setTip, setTips, hoverTipsOf, logicalRect } from '../tooltip';
import { combatIsCurrent } from '../combat-hud';
import { view } from '../../view';
import './fool.css';

const safe = <T,>(f: () => T, d: T): T => { try { return f(); } catch { return d; } };

/** fool_combat_ui.tscn 中弓上 5 个旋律挂点（相对 Bow 左上角），符号 84×84 的中心偏移 (−42, −42)。 */
const SYMBOL_SLOTS: [number, number][] = [
  [14, 65],
  [26, 86],
  [41, 120],
  [26, 155],
  [14, 173],
];
const SYMBOL_OFFSET = -42;

const MELODY_TAGS = [
  { tag: 6, key: 'WAH_MELODY', icon: 'images/packed/fool/symbol_wah.png', glow: [1, 0, 0.6, 0.502] as [number, number, number, number] },
  { tag: 7, key: 'CHO_MELODY', icon: 'images/packed/fool/symbol_cho.png', glow: [0, 0.282, 1, 0.753] as [number, number, number, number] },
  { tag: 8, key: 'KI_MELODY', icon: 'images/packed/fool/symbol_ki.png', glow: [1, 0.467, 0, 0.502] as [number, number, number, number] },
];

function playedMelodies(me: any): typeof MELODY_TAGS {
  return MELODY_TAGS.filter((m) => safe(() => G.MelodyCmd.PlayedThisTurn(me, m.tag), false));
}

function slotPositions(count: number): [number, number][] {
  if (count === 1) return [SYMBOL_SLOTS[2]];
  if (count === 2) return [SYMBOL_SLOTS[1], SYMBOL_SLOTS[3]];
  if (count >= 3) return [SYMBOL_SLOTS[0], SYMBOL_SLOTS[2], SYMBOL_SLOTS[4]];
  return [];
}

/** 单个箭矢槽（NFoolArrowUi）：奇偶上下错开入场，已射出隐藏箭身并放大轮廓。 */
function FoolArrowSlot({ slot, index }: { slot: any; index: number }) {
  const elRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<number>(() => safe(() => slot.Status, 0));
  const [anim, setAnim] = useState<{ y: number; scale: number; alpha: number }>(() => ({
    y: index % 2 === 1 ? -24 : 16,
    scale: 1,
    alpha: 0,
  }));

  // 订阅箭槽状态更新并同步入场与切换缓动
  useEffect(() => {
    const sync = () => setStatus(safe(() => slot.Status, 0));
    sync();
    slot.ArrowStatusUpdated = $.dcombine(slot.ArrowStatusUpdated, sync);
    const targetY = index % 2 === 1 ? -8 : 0;
    const st = { Position: { X: 0, Y: index % 2 === 1 ? -24 : 16 }, Scale: { X: 1, Y: 1 }, Modulate: { A: 0 } };
    const t = new $.WebTween().SetParallel();
    t.TweenProperty(st, 'position:y', targetY, 0.3).SetEase(1).SetTrans(10);
    t.TweenProperty(st, 'modulate:a', 1, 0.3);
    const stop = $.onFrame(() => {
      setAnim({ y: st.Position.Y, scale: st.Scale.X, alpha: st.Modulate.A });
      return t.IsValid();
    });
    return () => {
      slot.ArrowStatusUpdated = $.dremove(slot.ArrowStatusUpdated, sync);
      t.Kill();
      stop();
    };
  }, [slot, index]);

  // 箭矢回收/射出缩放缓动（Retrieved: 1.0, Away: 1.4）
  useEffect(() => {
    const targetScale = status === G.ArrowStatus.Retrieved ? 1 : 1.4;
    const st = { Scale: { X: anim.scale, Y: anim.scale } };
    const t = new $.WebTween();
    t.TweenProperty(st, 'scale', targetScale, 0.3).SetEase(1).SetTrans(10);
    const stop = $.onFrame(() => {
      setAnim((prev) => ({ ...prev, scale: st.Scale.X }));
      return t.IsValid();
    });
    return () => { t.Kill(); stop(); };
  }, [status]);

  const odd = index % 2 === 1;
  const destroyed = status === G.ArrowStatus.Destroyed;
  const retrieved = status === G.ArrowStatus.Retrieved;

  const onEnter = () => {
    if (!combatIsCurrent() || destroyed) return;
    const rect = logicalRect(elRef.current);
    const x = (rect?.[0] ?? 117) + 50;
    const y = rect?.[1] ?? 622;
    const tip = safe(() => G.HoverTipFactory.ForArrow(slot.owner, status === G.ArrowStatus.Away), null);
    if (!tip) return;
    const parsed = hoverTipsOf({ HoverTips: [tip] });
    if (parsed.length) setTips(parsed, { kind: 'at', x, y });
  };

  return (
    <div
      ref={elRef}
      class={'fool-arrow' + (destroyed ? ' destroyed' : '')}
      style={{
        opacity: anim.alpha,
        transform: `translateY(${anim.y}px) scale(${anim.scale})`,
      }}
      onMouseEnter={onEnter}
      onMouseLeave={() => setTip(null)}
    >
      <img
        class="fool-arrow-img"
        src={imageUrl('images/packed/fool/arrow_stroke.png') ?? ''}
        style={{ transform: odd ? 'scaleY(-1)' : undefined }}
      />
      <img
        class="fool-arrow-img"
        src={imageUrl('images/packed/fool/arrow.png') ?? ''}
        style={{
          opacity: retrieved ? 1 : 0,
          transform: odd ? 'scaleY(-1)' : undefined,
        }}
      />
    </div>
  );
}

/** 单个旋律符号（NFoolCombatSymbol）：围绕槽位上下正弦微摆动并带加法发光。 */
function FoolCombatSymbol({
  meta,
  x,
  y,
}: {
  meta: (typeof MELODY_TAGS)[number];
  x: number;
  y: number;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let elapsed = 0;
    return $.onFrame((dt: number) => {
      elapsed += dt;
      if (bodyRef.current) {
        bodyRef.current.style.transform = `translateY(${Math.sin(elapsed) * 2}px)`;
      }
      return true;
    });
  }, []);

  const onEnter = () => {
    if (!combatIsCurrent()) return;
    const rect = logicalRect(elRef.current);
    const tx = (rect?.[0] ?? 0) + 100;
    const ty = rect?.[1] ?? 615;
    setTip(loc('static_hover_tips', `${meta.key}.title`), loc('static_hover_tips', `${meta.key}.description`), { kind: 'at', x: tx, y: ty });
  };

  return (
    <div
      ref={elRef}
      class="fool-symbol"
      style={{ left: `${x + SYMBOL_OFFSET}px`, top: `${y + SYMBOL_OFFSET}px` }}
      onMouseEnter={onEnter}
      onMouseLeave={() => setTip(null)}
    >
      <div ref={bodyRef} class="fool-symbol-body">
        <img
          class="fool-symbol-glow"
          src={imageUrl('images/packed/fool/fool_symbol_glow.png') ?? ''}
          style={{ filter: tint(...meta.glow) }}
        />
        <img class="fool-symbol-icon" src={imageUrl(meta.icon) ?? ''} />
      </div>
    </div>
  );
}

const arrowIds = new WeakMap<any, number>();
let nextArrowId = 0;
const keyOfArrow = (slot: any) => arrowIds.get(slot) ?? (arrowIds.set(slot, ++nextArrowId), nextArrowId);

/** 愚者战斗专属 UI（弓、箭矢槽与三旋律状态），挂在 combat-ui 底部左侧。 */
export function FoolCombatUi({ me, pcs, out }: { me: any; pcs: any; out: boolean }) {
  const [, setRev] = useState(0);
  const everVisible = useRef(false);

  useEffect(() => {
    const bump = () => setRev((v) => v + 1);
    pcs.ArrowsChanged = $.dcombine(pcs.ArrowsChanged, bump);
    const tracker = G.CombatManager.Instance?.StateTracker;
    if (tracker) tracker.CombatStateChanged = $.dcombine(tracker.CombatStateChanged, bump);
    return () => {
      pcs.ArrowsChanged = $.dremove(pcs.ArrowsChanged, bump);
      if (tracker) tracker.CombatStateChanged = $.dremove(tracker.CombatStateChanged, bump);
    };
  }, [pcs]);

  const arrows: any[] = list(safe(() => pcs.Arrows, []));
  const melodies = playedMelodies(me);
  const isFool = safe(() => me?.Character instanceof G.Fool, false);

  if (isFool || arrows.length > 0 || melodies.length > 0) {
    everVisible.current = true;
  }
  if (!everVisible.current) return null;

  const positions = slotPositions(melodies.length);

  return (
    <div class={'fool-ui' + (out ? ' out' : '')} style={{ top: `${615 + view.oy}px` }}>
      <div class="fool-bow">
        <img class="fool-bow-img" src={imageUrl('images/packed/fool/bow.png') ?? ''} />
        {melodies.map((m, i) => {
          const [sx, sy] = positions[i] ?? SYMBOL_SLOTS[2];
          return <FoolCombatSymbol key={m.tag} meta={m} x={sx} y={sy} />;
        })}
      </div>
      <div class="fool-arrows">
        {arrows.map((slot, i) => (
          <FoolArrowSlot key={keyOfArrow(slot)} slot={slot} index={i} />
        ))}
      </div>
    </div>
  );
}
