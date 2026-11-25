// NBlitzMerchantRoom / NBlitzMerchantButton / NBlitzMerchantSlot：Blitz 闪电模式商人房间与 6 格专属货架
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Application, Assets, Container, Matrix, Sprite, Texture } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { G, $, list } from '../game';
import { A, imageUrl, skelSrc } from '../assets';
import { loc, locv } from '../i18n';
import { Backdrop } from './backdrop';
import { BackButton, ProceedButton } from './buttons';
import { setTip, setTips, hoverTipsOf } from './tooltip';
import { RichText } from './richtext';
import { Dialogue } from './shop';
import {
  buildScene,
  combatBackground,
  loadScene,
  rootMatrix,
  sceneTexture,
  selectionReticle,
  type Reticle,
} from '../render/scene';
import { bubbles } from '../bridge';
import { noise } from './screenshake';
import { SpeechBubble } from './creature-ui';
import { TargetingArrow, TintFilters, usePointer } from './cardlayer';
import { fullView, view as vp } from '../view';
import { renderResolution } from '../render/quality';
import './blitz-shop.css';

const safe = <T,>(f: () => T, d: T): T => {
  try {
    return f();
  } catch {
    return d;
  }
};
const img = (p: string) => imageUrl(p) ?? '';
const EXPO_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';

// 地毯坐标系内的 6 个 Blitz 货位位置（3 列 × 2 行，1920 × 1080 设计框）
const BLITZ_SLOTS: [number, number][] = [
  [415, 320],
  [896, 293],
  [1291, 355],
  [437, 679],
  [831, 637],
  [1247, 689],
];

export interface BlitzShopView {
  kind: 'shop';
  isBlitz: true;
  rug: string;
  handSkel: string;
  inv: any;
  players: any[];
  backgroundAssets: any;
  open: boolean;
  backOn: boolean;
  proceedOn: boolean;
  pulse: boolean;
  blocked: boolean;
  line: { gen: number; text: string; x: number };
  hand: { tx: number; ty: number; home: number };
  fx: { BackstopA: number; RugY: number };
  paint?: () => void;
  wiggles: Map<any, number>;
  slotEls: Map<any, HTMLElement>;
  slotOrigin: (e: any) => [number, number] | null;
  pointAt: (x: number, y: number) => void;
  stopPointing: (delay: number) => void;
  openInv: () => void;
  close: () => void;
  proceed: () => void;
  buy: (e: any) => Promise<void>;
  MerchantButton: {
    shown: boolean;
    rect: [number, number, number, number];
    spine: Spine | null;
    reticle: Reticle | null;
    scene: { layer: Container | null };
    OnFocus(): void;
    OnUnfocus(): void;
    OnPress(): void;
    OnRelease(): void;
  };
}

interface BlitzBackdropCtrl {
  complete: () => void;
  updateTokens: (entries: any[]) => void;
}

function M(m: number[]) {
  return new Matrix(m[0], m[1], m[2], m[3], m[4], m[5]);
}

function findByLabel(root: Container, label: string): Container | null {
  if (root.label === label) return root;
  for (const ch of root.children) {
    const found = findByLabel(ch, label);
    if (found) return found;
  }
  return null;
}

function setEmitterActive(node: Container | null, active: boolean) {
  if (!node) return;
  const em = (node as any).emitter;
  if (em) em.emitting = active;
  node.visible = active;
}

/** 构建 Blitz 商店 Pixi 场景（战斗幕背景 + 玩家站位 + 红绿火焰与 6 槽徽记商人） */
async function buildBlitzBackdrop(
  view: BlitzShopView,
  ctrlRef: { current: BlitzBackdropCtrl | null },
): Promise<Container | null> {
  const s = await loadScene('scenes/rooms/blitz_merchant_room.tscn');
  if (!s) return null;

  const root = new Container();
  const rootM = rootMatrix(s, 1920, 1080);

  // 1. 底层使用当前幕战斗背景
  const bga = view.backgroundAssets;
  if (bga) {
    const bg = await combatBackground(
      bga.BackgroundScenePath,
      Array.from(bga.BgLayers ?? []),
      bga.FgLayer ?? null,
      1.5,
      [0, 0],
    );
    root.addChild(bg);
  }

  // 2. 玩家角色立绘按 √n 网格站在左侧（与 NMerchantRoom 一致）
  const players = safe(() => list(view.players), [] as any[]);
  const n = Math.max(1, Math.ceil(Math.sqrt(players.length)));
  const charBase = s.nodes['SceneContainer/CharacterContainer']
    ? M(s.nodes['SceneContainer/CharacterContainer'])
    : new Matrix().translate(564, 766);

  const chars = await Promise.all(
    players.map(async (p, k) => {
      const animPath = safe(() => p.Character.MerchantAnimPath, '');
      if (!animPath) return null;
      const cs = await loadScene(animPath);
      if (!cs) return null;
      const relaxed = (sp: Spine) => {
        if (sp.skeleton.data.findAnimation('relaxed_loop')) {
          const e = sp.state.setAnimation(0, 'relaxed_loop', true);
          e.trackTime = e.animationEnd * Math.random();
        }
      };
      const c = buildScene(cs, () => true, relaxed);
      const i = Math.floor(k / n);
      const j = k % n;
      const cm = rootM
        .clone()
        .append(charBase)
        .append(rootMatrix(cs, 0, 0))
        .append(new Matrix().translate(-140 * i - 275 * j, -50 * i));
      c.setFromMatrix(cm);
      if (i > 0) c.tint = 0x808080;
      return c;
    }),
  );

  // 3. 拆分商人前景（环境星光、火焰 VFX、MerchantVisual 骨骼、选区准星）
  const RET = 'SceneContainer/MerchantButton/MerchantSelectionReticle';
  const ri = s.items.findIndex((it) => (it.p ?? '').startsWith(RET));
  const before = new Set(s.items.slice(0, Math.max(0, ri)).map((it) => it.p ?? ''));
  const kept = (p: string) =>
    p.startsWith('SceneContainer/') &&
    !p.startsWith('SceneContainer/BgContainer') &&
    !/Reticle|ControllerIcon|\/Token_\d+\//.test(p);

  let merchantSpine: Spine | null = null;
  const tokenSprites: Sprite[] = [];
  let switchedToGreen = (view.inv?.BlitzChoicesRemaining ?? 1) <= 0;

  const applyTokens = (entries: any[]) => {
    for (let i = 0; i < tokenSprites.length; i++) {
      const spr = tokenSprites[i];
      const entry = entries[i];
      if (!spr || spr.destroyed) continue;
      if (!entry) {
        spr.visible = false;
        continue;
      }
      spr.visible = !!safe(() => entry.IsStocked, false);
      const iconPath = safe(() => entry.SmallIconPath, '');
      if (iconPath && spr.visible) {
        void sceneTexture(iconPath).then((tex) => {
          if (!tex || spr.destroyed) return;
          spr.texture = tex;
          spr.x = -47.5;
          spr.y = -21.5;
          spr.width = 95;
          spr.height = 43;
        });
      }
    }
  };

  const onMerchantSpine = (sp: Spine) => {
    merchantSpine = sp;
    if (sp.skeleton.data.findSkin('outline')) {
      view.MerchantButton.spine = sp;
    }
    const animName = switchedToGreen ? 'done_loop' : 'animation';
    if (sp.skeleton.data.findAnimation(animName)) {
      sp.state.setAnimation(0, animName, true);
    }
    // 绑定 6 个槽位图标到骨骼插槽 TOKEN_1..TOKEN_6
    tokenSprites.length = 0;
    for (let i = 0; i < 6; i++) {
      const spr = new Sprite(Texture.EMPTY);
      spr.x = -47.5;
      spr.y = -21.5;
      spr.width = 95;
      spr.height = 43;
      spr.visible = false;
      try {
        sp.addSlotObject(`TOKEN_${i + 1}`, spr);
      } catch {
        spr.destroy();
      }
      tokenSprites.push(spr);
    }
    applyTokens(safe(() => list(view.inv?.BlitzEntries), [] as any[]));
  };

  const fr = new Container();
  fr.setFromMatrix(rootM);
  fr.addChild(buildScene(s, (p) => kept(p) && before.has(p), onMerchantSpine));
  if (ri >= 0) {
    fr.addChild(
      selectionReticle(
        buildScene(s, (p) => p.startsWith(RET)),
        s,
        RET,
        (r) => {
          view.MerchantButton.reticle = r;
        },
      ),
    );
  }
  fr.addChild(buildScene(s, (p) => kept(p) && !before.has(p), onMerchantSpine));

  const greenFire = findByLabel(fr, 'SceneContainer/MerchantButton/BackVfx/GreenFire');
  const redFire = findByLabel(fr, 'SceneContainer/MerchantButton/BackVfx/RedFire');
  const greenBlast = findByLabel(fr, 'SceneContainer/MerchantButton/BackVfx/GreenBlast');
  const greenEmbers = findByLabel(fr, 'SceneContainer/MerchantButton/BackVfx/GreenEmbers');
  const redEmbers = findByLabel(fr, 'SceneContainer/MerchantButton/BackVfx/RedEmbers');
  const greenGlow = findByLabel(fr, 'SceneContainer/MerchantButton/FrontVfx/GreenGlow');
  const redGlow = findByLabel(fr, 'SceneContainer/MerchantButton/FrontVfx/RedGlow');

  // 初始化红/绿火焰状态
  if (switchedToGreen) {
    setEmitterActive(redFire, false);
    setEmitterActive(redEmbers, false);
    setEmitterActive(redGlow, false);
    setEmitterActive(greenFire, true);
    setEmitterActive(greenEmbers, true);
    setEmitterActive(greenGlow, true);
    setEmitterActive(greenBlast, false);
  } else {
    setEmitterActive(redFire, true);
    setEmitterActive(redEmbers, true);
    setEmitterActive(redGlow, true);
    setEmitterActive(greenFire, false);
    setEmitterActive(greenEmbers, false);
    setEmitterActive(greenGlow, false);
    setEmitterActive(greenBlast, false);
  }

  let completeTimer: number | null = null;
  ctrlRef.current = {
    updateTokens: applyTokens,
    complete: () => {
      if (switchedToGreen) return;
      switchedToGreen = true;
      setEmitterActive(greenGlow, true);
      if (greenFire) {
        greenFire.visible = true;
        greenFire.scale.set(0, 0);
      }
      if (completeTimer !== null) window.clearTimeout(completeTimer);
      completeTimer = window.setTimeout(() => {
        if (root.destroyed) return;
        if (merchantSpine && !merchantSpine.destroyed) {
          if (merchantSpine.skeleton.data.findAnimation('done')) {
            merchantSpine.state.setAnimation(0, 'done', false);
            merchantSpine.state.addAnimation(0, 'done_loop', true, 0);
          } else if (merchantSpine.skeleton.data.findAnimation('done_loop')) {
            merchantSpine.state.setAnimation(0, 'done_loop', true);
          }
        }
        setEmitterActive(redGlow, false);
        setEmitterActive(redFire, false);
        setEmitterActive(redEmbers, false);
        if (greenFire) greenFire.scale.set(0.7, 0.6804);
        setEmitterActive(greenEmbers, true);
        if (greenBlast) {
          greenBlast.visible = true;
          const em = (greenBlast as any).emitter;
          if (em) em.emitting = true;
          window.setTimeout(() => {
            if (!root.destroyed) setEmitterActive(greenBlast, false);
          }, 900);
        }
      }, 500);
    },
  };

  for (const c of chars.reverse()) {
    if (c) root.addChild(c);
  }
  root.addChild(fr);

  const fx = new Container();
  root.addChild(fx);
  view.MerchantButton.scene.layer = fx;

  return root;
}

/** Blitz 商人点击热区（对应 NBlitzMerchantButton） */
function BlitzMerchantButton({ view }: { view: BlitzShopView }) {
  const b = view.MerchantButton;
  const [x, y, w, h] = b.rect;
  const pressed = useRef(false);
  const enabled = !view.open;
  const focused = useRef(false);

  const focus = (on: boolean) => {
    if (focused.current === on) return;
    focused.current = on;
    if (on) b.OnFocus();
    else b.OnUnfocus();
  };

  useEffect(() => {
    focus(false);
    pressed.current = false;
  }, [enabled]);

  return (
    <div
      class="merchant-btn shop-merchant-btn"
      style={{
        position: 'absolute',
        left: `${x}px`,
        top: `${y}px`,
        width: `${w}px`,
        height: `${h}px`,
        cursor: enabled ? 'pointer' : 'default',
      }}
      onPointerEnter={() => {
        if (enabled) focus(true);
      }}
      onPointerMove={() => {
        if (enabled && !focused.current) focus(true);
      }}
      onPointerLeave={() => {
        pressed.current = false;
        focus(false);
      }}
      onPointerDown={(e) => {
        if (enabled && focused.current && e.button === 0) {
          pressed.current = true;
          b.OnPress();
        }
      }}
      onPointerUp={(e) => {
        if (enabled && focused.current && e.button === 0 && pressed.current) {
          pressed.current = false;
          b.OnRelease();
        }
      }}
    />
  );
}

// ------------------------------------------------------------------ 商人的手（与常规商人共用手部骨骼资源）
let handAppP: Promise<Application> | null = null;
const getHandApp = () =>
  (handAppP ??= (async () => {
    const a = new Application();
    await a.init({
      width: 1920,
      height: 1080,
      backgroundAlpha: 0,
      autoStart: false,
      resolution: renderResolution(),
      autoDensity: true,
    });
    a.canvas.classList.add('shop-hand');
    fullView(a, true);
    return a;
  })());
const blitzHandLoads = new Map<string, Promise<boolean>>();

function BlitzMerchantHand({ view }: { view: BlitzShopView }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let dead = false;
    let stop = () => {};
    const holder = new Container();
    holder.position.set(234, -54);
    holder.scale.set(0.4);

    void getHandApp().then(async (a) => {
      if (dead) return;
      a.stage.removeChildren();
      a.stage.addChild(holder);
      host.current?.appendChild(a.canvas);

      const path = view.handSkel;
      let load = blitzHandLoads.get(path);
      if (!load) {
        Assets.add({ alias: `${path}:skel`, ...skelSrc(`${path}.skel`) });
        Assets.add({ alias: `${path}:atlas`, src: `${A}${path}.atlas` });
        blitzHandLoads.set(
          path,
          (load = Assets.load([`${path}:skel`, `${path}:atlas`])
            .then(() => true)
            .catch(() => false)),
        );
      }
      if (!(await load) || dead) return;

      const sp = Spine.from({ skeleton: `${path}:skel`, atlas: `${path}:atlas`, scale: 1 });
      sp.autoUpdate = false;
      safe(() => sp.state.setAnimation(0, 'default', true), null);
      holder.addChild(sp);
      const bone = sp.skeleton.findBone('rotate_me');
      let time = 0;

      stop = $.onFrame((dt: number) => {
        const h = view.hand;
        if (h.home && performance.now() >= h.home) {
          h.home = 0;
          h.tx = 234;
          h.ty = -54;
        }
        time += dt;
        const nx = noise(time * 0.1) + 0.4;
        const ny = noise((time + 0.25) * 0.1) - 0.5;
        const k = Math.min(1, dt * 4);
        holder.x += (h.tx + nx * 100 - holder.x) * k;
        holder.y += (h.ty + ny * 100 - holder.y) * k;
        if (bone) bone.rotation = -10 + 20 * ((holder.x - 960 - 50) * 0.01);
        sp.update(dt);
        a.render();
      });
    });

    return () => {
      dead = true;
      stop();
      holder.parent?.removeChild(holder);
      holder.destroy({ children: true });
      void getHandApp().then((a) => {
        if (a.canvas.parentElement === host.current) a.canvas.remove();
      });
    };
  }, [view.handSkel]);

  return <div class="shop-hand-host" ref={host} />;
}

/** Blitz 商人货架单槽位（对应 NBlitzMerchantSlot） */
function BlitzSlot({
  view,
  e,
  at,
  index,
}: {
  view: BlitzShopView;
  e: any;
  at: [number, number];
  index: number;
}) {
  const [hot, setHotState] = useState(false);
  const hotRef = useRef(false);
  const setHot = (v: boolean) => {
    hotRef.current = v;
    setHotState(v);
  };

  const Status = G.BlitzMerchantEntry_BlitzEntryStatus;
  const status = safe(() => e.Status, Status?.Available ?? 0);
  const available = status === (Status?.Available ?? 0);
  const used = status === (Status?.Used ?? 1);
  const disabled = !available;

  useEffect(() => {
    if (disabled && hotRef.current) {
      setHot(false);
      setTip(null);
    }
  }, [disabled]);

  const vis = useRef<HTMLDivElement>(null);
  const wiggle = view.wiggles.get(e) ?? 0;
  useEffect(() => {
    if (!wiggle || !vis.current) return;
    const frames = Array.from({ length: 25 }, (_, i) => {
      const t = i / 24;
      const p = (1 - (1 - t) * (1 - t)) * 2;
      return { translate: `${Math.sin(p * 2 * Math.PI) * 10}px 0` };
    });
    vis.current.animate(frames, { duration: 400 });
  }, [wiggle]);

  const [x, y] = at;
  const iconPath = safe(() => e.IconPath, '');
  const iconSrc = iconPath ? img(iconPath) : '';
  const isRare = !!safe(() => e.IsRare, false);
  const isCursed = !!safe(() => e.IsCursed, false);

  const showTips = () => {
    const tips = hoverTipsOf(e);
    if (!tips.length) return;
    // 最右侧一列（index % 3 === 2）向左对齐，其余向右对齐
    setTips(tips, {
      kind: 'align',
      rect: [x + 118 - 121, y + 80 - 120 - vp.oy, 240, 240],
      align: index % 3 === 2 ? 'left' : 'right',
    });
  };

  return (
    <div
      class={
        'blitz-slot' +
        (used ? ' is-used' : '') +
        (!available && !used ? ' is-disabled' : '')
      }
      ref={(el) => {
        if (el) view.slotEls.set(e, el);
      }}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        scale: hot && available ? '1.1' : '1',
        transition: hot ? 'none' : `scale .5s ${EXPO_OUT}`,
      }}
    >
      <div class="blitz-slot-vis" ref={vis}>
        {!used && isRare && available && (
          <div class="blitz-vfx-rare" aria-hidden="true">
            <span class="bv-sp bv-sp1" />
            <span class="bv-sp bv-sp2" />
            <span class="bv-sp bv-sp3" />
            <span class="bv-sp bv-sp4" />
          </div>
        )}
        {!used && isCursed && available && (
          <div class="blitz-vfx-cursed" aria-hidden="true">
            <span class="bv-cu bv-cu1" />
            <span class="bv-cu bv-cu2" />
            <span class="bv-cu bv-cu3" />
            <span class="bv-cu bv-cu4" />
          </div>
        )}
        {!used && iconSrc && (
          <>
            <img class="blitz-slot-shadow" src={iconSrc} />
            <img class="blitz-slot-icon" src={iconSrc} />
          </>
        )}
      </div>

      {available && (
        <div
          class="shop-hit blitz-slot-hit"
          onPointerEnter={() => {
            setHot(true);
            showTips();
            const o = view.slotOrigin(e);
            if (o) view.pointAt(o[0] - 18, o[1]);
          }}
          onPointerLeave={() => {
            setHot(false);
            setTip(null);
            view.stopPointing(2);
          }}
          onPointerUp={async (ev) => {
            if (!hotRef.current || ev.button !== 0) return;
            setTip(null);
            await view.buy(e);
            if (safe(() => e.IsStocked, false) && hotRef.current) showTips();
          }}
        />
      )}
    </div>
  );
}

/** Blitz 商人房间主视图（对应 NBlitzMerchantRoom + NMerchantInventory） */
export function BlitzShopScreen({ view }: { view: BlitzShopView }) {
  usePointer(() => null);

  const backstop = useRef<HTMLDivElement>(null);
  const rug = useRef<HTMLDivElement>(null);
  const backdropCtrl = useRef<BlitzBackdropCtrl | null>(null);

  const paint = () => {
    if (backstop.current) backstop.current.style.opacity = String(view.fx.BackstopA);
    if (rug.current) rug.current.style.top = `${view.fx.RugY}px`;
  };
  useLayoutEffect(() => {
    view.paint = paint;
    paint();
    return () => {
      if (view.paint === paint) view.paint = undefined;
    };
  });

  const inv = view.inv;
  const entries = safe(() => list(inv?.BlitzEntries), [] as any[]);
  const remaining = safe(() => inv?.BlitzChoicesRemaining ?? 0, 0);

  // 商品状态变化或选购次数归零时同步刷新场景内小徽记和绿火动画
  const statusSig = entries.map((e) => `${safe(() => e.Status, 0)}:${safe(() => e.IsStocked, false)}`).join(',');
  useEffect(() => {
    backdropCtrl.current?.updateTokens(entries);
  }, [statusSig]);

  useEffect(() => {
    if (!view.open && remaining <= 0) {
      backdropCtrl.current?.complete();
    }
  }, [view.open, remaining]);

  const selectionText =
    remaining > 0
      ? locv('merchant_room', 'MERCHANT.blitzSelection.remaining', { Amount: remaining })
      : loc('merchant_room', 'MERCHANT.blitzSelection.none');

  return (
    <div class="shop blitz-shop" data-shake>
      <Backdrop id="shop:blitz" build={() => buildBlitzBackdrop(view, backdropCtrl)} />
      <div class="shop-scene-fx">
        {bubbles
          .filter((b) => !b.c)
          .map((b) => (
            <SpeechBubble key={'b' + b.id} b={b} s={undefined} />
          ))}
      </div>
      {view.MerchantButton.shown && <BlitzMerchantButton view={view} />}
      <ProceedButton enabled={view.proceedOn} pulse={view.pulse} onClick={() => view.proceed()} />

      <div class={'shop-inv' + (view.open ? ' open' : '')}>
        <div class="shop-backstop" ref={backstop} />
        <div class="shop-rug" ref={rug}>
          <img class="shop-rug-img" src={img(view.rug)} />
          <div class="blitz-slots">
            {entries.slice(0, BLITZ_SLOTS.length).map((e: any, i: number) => (
              <BlitzSlot key={i} view={view} e={e} at={BLITZ_SLOTS[i]} index={i} />
            ))}
          </div>
          <div class="blitz-selection-text">
            <RichText text={selectionText} />
          </div>
        </div>
        <BackButton enabled={view.backOn} onClick={() => view.close()} />
        <BlitzMerchantHand view={view} />
        <Dialogue line={view.line} y={271} hsv={[1, 1.2, 0.4]} hold={1} />
      </div>

      {view.blocked && <div class="shop-blocker" />}
      <TargetingArrow />
      <TintFilters />
    </div>
  );
}
