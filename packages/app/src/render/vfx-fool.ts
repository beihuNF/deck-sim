// 愚者（Fool）与 Byrd 系战斗特效：三旋律（Wah/Cho/Ki）、贯穿箭矢（NImpaledArrowVfx）、Byrdpip 就绪提示、Byrdine 攻击遮罩与稀有遗物光效
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Container, Matrix, Sprite } from 'pixi.js';
import { G, $, N, list } from '../game';
import { ContainerNode } from '../cardnodes';
import { combatVfxRoot } from './cardfx';
import { loadScene, particleItem, sceneTexture, spineItem, type SceneData } from './scene';
import { activeStage, megaSprite } from './stage';
import { playOneShot } from '../audio';

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const safe = <T,>(f: () => T, d: T): T => { try { return f(); } catch { return d; } };
const room = () => N('Rooms.NCombatRoom').Instance;
const cnode = (c: any) => safe(() => room()?.GetCreatureNode(c) ?? null, null);
const tween = () => new $.WebTween();

class FoolVfxNode extends ContainerNode {
  private started = false;
  constructor(private ready: (n: FoolVfxNode, layer: Container) => void | Promise<void>) { super(); }
  IsInsideTree() { return !this.$freed && !!this.$parent; }
  $entered() {
    if (this.started) return;
    this.started = true;
    const layer = combatVfxRoot();
    if (!layer) return;
    Promise.resolve(this.ready(this, layer)).catch((e) => console.warn('[vfx-fool]', e));
  }
}

// ------------------------------------------------------------------ 三旋律特效 NWahVfx / NChoVfx / NKiVfx
function registerMelodyVfx(nodeName: string, scenePath: string, sfxPath: string) {
  const cls = N('Vfx.' + nodeName);
  cls.Create = (target: any) => {
    if (G.TestMode.IsOn) return null;
    const node = cnode(target);
    if (!node) return null;
    const top = node.GetTopOfHitbox();
    const x = top.X, y = top.Y - 50;
    return new FoolVfxNode(async (n, layer) => {
      const s = await loadScene(`scenes/${scenePath}.tscn`);
      if (!s || layer.destroyed || n.$freed) { n.QueueFree(); return; }
      const root = new Container();
      root.position.set(x, y);
      for (const it of s.items) {
        if (it.k === 'particles') root.addChild(particleItem({ ...it, emitting: true }, true));
      }
      layer.addChild(root);
      playOneShot(sfxPath);
      let timer: any = null;
      n.$onExit.push(() => {
        if (timer != null) clearTimeout(timer);
        if (!root.destroyed) { root.parent?.removeChild(root); root.destroy({ children: true }); }
      });
      await new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 2000);
        n.$onExit.push(() => resolve());
      });
      if (!n.$freed) n.QueueFree();
    });
  };
}

registerMelodyVfx('NWahVfx', 'vfx/fool/wah_vfx', 'event:/sfx/characters/fugitive/fugitive_wa');
registerMelodyVfx('NChoVfx', 'vfx/fool/cho_vfx', 'event:/sfx/characters/fugitive/fugitive_cho');
registerMelodyVfx('NKiVfx', 'vfx/fool/ki_vfx', 'event:/sfx/characters/fugitive/fugitive_ki');

// ------------------------------------------------------------------ NImpaledArrowVfx
const ARROW_ROT_OFFSETS = [0, -20, 20];
const ARROW_POS_OFFSETS: [number, number][] = [[0, 0], [15, 5], [-15, 5]];

/** 构造一段箭矢纹理（前段 ArrowFg 或后段 ArrowBg），对齐 impaled_arrow_vfx.tscn 锚点与比例。 */
async function makeArrowSprite(item: any): Promise<Container | null> {
  const tex = await sceneTexture(item.src);
  if (!tex) return null;
  const wrap = new Container();
  const sp = new Sprite(tex);
  sp.position.set(item.x, item.y);
  sp.width = item.w;
  sp.height = item.h;
  wrap.addChild(sp);
  wrap.position.set(item.m[4], item.m[5]);
  wrap.scale.set(item.m[0], item.m[3]);
  return wrap;
}

function getArrowCountMod(creature: any): number {
  const power = safe(() => creature?.GetPower?.(G.ImpaledPower), null)
    ?? safe(() => list(creature?.Powers ?? []).find((p: any) => p instanceof G.ImpaledPower), null);
  return safe(() => list(power?.Arrows ?? []).length, 0);
}

/** 等待战斗角色的 Spine 就绪（若该生物确有 Spine）。 */
function resolveTargetSpine(creature: any): Promise<any | null> {
  const st = activeStage;
  if (!st) return Promise.resolve(null);
  if (creature?.Monster instanceof G.Crusher || creature?.Monster instanceof G.Rocket) {
    return Promise.resolve(st.kaiserCrabSpine);
  }
  const actor = st.actors.get(creature);
  if (!actor) return Promise.resolve(null);
  if (actor.spine) return Promise.resolve(actor.spine);
  return new Promise((resolve) => {
    let waited = 0;
    $.onFrame((dt: number) => {
      waited += dt;
      if (actor.spine) { resolve(actor.spine); return false; }
      if (actor.root.destroyed || waited > 1.5) { resolve(null); return false; }
      return true;
    });
  });
}

const slotContainers = new WeakMap<object, Map<string, Container>>();

/** 获取或创建挂在 Spine 槽位上的共享容器，避免多支箭矢互相覆盖。 */
function getSlotContainer(sp: any, slotName: string): Container {
  let map = slotContainers.get(sp);
  if (!map) slotContainers.set(sp, (map = new Map()));
  let wrap = map.get(slotName);
  if (!wrap || wrap.destroyed) {
    wrap = new Container();
    map.set(slotName, wrap);
    sp.addSlotObject(slotName, wrap);
  }
  return wrap;
}

const NImpaledArrowVfx = N('Vfx.NImpaledArrowVfx');
NImpaledArrowVfx.Create = (creature: any, arrowSlot: any) => {
  if (G.TestMode.IsOn) return null;
  const node = new FoolVfxNode(async (n, layer) => {
    let retrieving = false;
    let frontWrap: Container | null = null;
    let backWrap: Container | null = null;
    let frontVisual: Container | null = null;
    let backVisual: Container | null = null;
    let retrieveHolder: Container | null = null;
    let activeTween: any = null;

    const cleanup = () => {
      if (arrowSlot) arrowSlot.ArrowStatusUpdated = $.dremove(arrowSlot.ArrowStatusUpdated, onStatusUpdated);
      const cm = G.CombatManager.Instance;
      if (cm) cm.CombatEnded = $.dremove(cm.CombatEnded, onCombatEnd);
      activeTween?.Kill?.();
      for (const c of [frontVisual, backVisual, retrieveHolder]) {
        if (c && !c.destroyed) { c.parent?.removeChild(c); c.destroy({ children: true }); }
      }
      // 仅销毁非 Spine 槽位复用的临时外包装
      if (frontWrap && !frontWrap.destroyed && !frontWrap.label?.startsWith('slot:')) {
        frontWrap.parent?.removeChild(frontWrap); frontWrap.destroy({ children: true });
      }
      if (backWrap && !backWrap.destroyed && !backWrap.label?.startsWith('slot:')) {
        backWrap.parent?.removeChild(backWrap); backWrap.destroy({ children: true });
      }
      frontVisual = backVisual = frontWrap = backWrap = retrieveHolder = null;
    };

    const onCombatEnd = () => { if (!n.$freed) n.QueueFree(); };

    const retrieveAndFree = () => {
      if (retrieving || n.$freed) return;
      retrieving = true;
      playOneShot('event:/sfx/characters/fool/fool_dislodge');
      const g = frontVisual && !frontVisual.destroyed
        ? frontVisual.getGlobalTransform(new Matrix(), false)
        : (frontWrap && !frontWrap.destroyed ? frontWrap.getGlobalTransform(new Matrix(), false) : null);
      const sx = g?.tx ?? cnode(creature)?.VfxSpawnPosition?.X ?? 960;
      const sy = g?.ty ?? cnode(creature)?.VfxSpawnPosition?.Y ?? 540;
      const rot = g ? Math.atan2(g.b, g.a) : 0;

      if (!layer.destroyed) {
        retrieveHolder = new Container();
        retrieveHolder.position.set(sx, sy);
        retrieveHolder.rotation = rot;
        if (backVisual && !backVisual.destroyed) {
          backVisual.parent?.removeChild(backVisual);
          retrieveHolder.addChild(backVisual);
        }
        if (frontVisual && !frontVisual.destroyed) {
          frontVisual.parent?.removeChild(frontVisual);
          retrieveHolder.addChild(frontVisual);
        }
        layer.addChild(retrieveHolder);
      }

      const ownerNode = safe(() => cnode(arrowSlot?.owner?.Creature), null);
      if (!ownerNode || !retrieveHolder) {
        if (!retrieveHolder) { n.QueueFree(); return; }
        const t = tween();
        activeTween = t;
        const st = { Modulate: { A: 1 } };
        t.TweenProperty(st, 'modulate:a', 0, 0.2);
        $.onFrame(() => { if (!retrieveHolder || retrieveHolder.destroyed) return false; retrieveHolder.alpha = st.Modulate.A; return t.IsValid(); });
        t.whenFinished(() => n.QueueFree());
        return;
      }

      const target = ownerNode.VfxSpawnPosition;
      const anim = { x: sx, y: sy, deg: (rot * 180) / Math.PI, a: 1 };
      const t = tween().SetParallel();
      activeTween = t;
      t.TweenProperty(anim, 'x', target.X, 0.5);
      t.TweenProperty(anim, 'deg', -540, 0.5);
      t.TweenProperty(anim, 'y', target.Y - 500, 0.25).SetEase(1).SetTrans(1);
      t.TweenProperty(anim, 'y', target.Y, 0.175).SetDelay(0.25).SetEase(0).SetTrans(1);
      t.TweenProperty(anim, 'a', 0, 0.1).SetDelay(0.4);
      $.onFrame(() => {
        if (!retrieveHolder || retrieveHolder.destroyed || n.$freed) return false;
        retrieveHolder.position.set(anim.x, anim.y);
        retrieveHolder.rotation = (anim.deg * Math.PI) / 180;
        retrieveHolder.alpha = anim.a;
        return t.IsValid();
      });
      t.whenFinished(() => n.QueueFree());
    };

    const onStatusUpdated = () => {
      if (arrowSlot?.Status === G.ArrowStatus.Destroyed) n.QueueFree();
      else retrieveAndFree();
    };

    n.$onExit.push(cleanup);
    if (arrowSlot) arrowSlot.ArrowStatusUpdated = $.dcombine(arrowSlot.ArrowStatusUpdated, onStatusUpdated);
    const cm = G.CombatManager.Instance;
    if (cm) cm.CombatEnded = $.dcombine(cm.CombatEnded, onCombatEnd);

    const s: SceneData | null = await loadScene('scenes/vfx/impaled_arrow_vfx.tscn');
    if (!s || n.$freed || retrieving) { if (!retrieving) n.QueueFree(); return; }
    const bgIt = s.items.find((x) => x.p === 'BackArrow/ArrowBg');
    const fgIt = s.items.find((x) => x.p === 'FrontArrow/ArrowFg');
    if (!bgIt || !fgIt) { n.QueueFree(); return; }

    [backVisual, frontVisual] = await Promise.all([makeArrowSprite(bgIt), makeArrowSprite(fgIt)]);
    if (!backVisual || !frontVisual || n.$freed || retrieving) return;

    // 计算同目标多支箭矢时的错开角度与位置偏移
    const idx = getArrowCountMod(creature) % ARROW_ROT_OFFSETS.length;
    const rotRad = (ARROW_ROT_OFFSETS[idx] * Math.PI) / 180;
    const [ox, oy] = ARROW_POS_OFFSETS[idx];

    const sp = await resolveTargetSpine(creature);
    if (n.$freed || retrieving) return;

    const isCrusher = creature?.Monster instanceof G.Crusher;
    const isRocket = creature?.Monster instanceof G.Rocket;
    const frontSlot = isCrusher ? 'ARROW_HIT_FRONT2' : 'ARROW_HIT_FRONT';
    const backSlot = isCrusher ? 'ARROW_HIT_BACK2' : 'ARROW_HIT_BACK';
    const hasSlots = !!(sp && !sp.destroyed && sp.skeleton.findSlot(frontSlot) && sp.skeleton.findSlot(backSlot));

    if (hasSlots) {
      frontWrap = getSlotContainer(sp, frontSlot);
      backWrap = getSlotContainer(sp, backSlot);
      frontWrap.label = `slot:${frontSlot}`;
      backWrap.label = `slot:${backSlot}`;
      const mult = (isCrusher || isRocket) ? 1.5 : (1 / (Math.abs(sp.scale.x) || 1)) * rand(0.9, 1.1);
      for (const v of [frontVisual, backVisual]) {
        v.scale.set(v.scale.x * mult, v.scale.y * mult);
        v.rotation += rotRad;
        v.position.set(v.position.x + ox, v.position.y + oy);
      }
      frontWrap.addChild(frontVisual);
      backWrap.addChild(backVisual);
    } else {
      // 无 Spine 箭槽时回退挂到生物节点中心附近并置于前后两层
      const cNode = cnode(creature);
      const pos = cNode?.VfxSpawnPosition ?? { X: 960, Y: 540 };
      const randRot = (rand(-15, 15) * Math.PI) / 180;
      const actor = activeStage?.actors.get(creature);
      frontWrap = new Container();
      frontWrap.position.set(pos.X, pos.Y);
      frontWrap.rotation = randRot;
      frontWrap.addChild(frontVisual);
      if (!layer.destroyed) layer.addChild(frontWrap);

      backWrap = new Container();
      backWrap.position.set(pos.X, pos.Y);
      backWrap.rotation = randRot;
      backWrap.addChild(backVisual);
      if (actor && !actor.root.destroyed) {
        const localPos = actor.root.toLocal({ x: pos.X, y: pos.Y });
        backWrap.position.set(localPos.x, localPos.y);
        actor.root.addChildAt(backWrap, 0);
      } else if (!layer.destroyed) {
        layer.addChildAt(backWrap, 0);
      }
    }

    // 若加载期间状态已经改为拔回/销毁，立即响应
    if (arrowSlot?.Status === G.ArrowStatus.Destroyed) n.QueueFree();
    else if (arrowSlot?.Status === G.ArrowStatus.Retrieved) retrieveAndFree();
  });
  // 原作将该特效挂在 NCreature.Visuals 上（非 ContainerNode 时不会触发 $entered），微任务兜底启动
  queueMicrotask(() => { if (!node.$freed) node.$entered(); });
  return node;
};

// ------------------------------------------------------------------ NByrdpipReadyToEvolveVfx
const NByrdpipReadyToEvolveVfx = N('Vfx.NByrdpipReadyToEvolveVfx');
NByrdpipReadyToEvolveVfx.Create = (player: any) => {
  if (G.TestMode.IsOn || G.NonInteractiveMode.IsActive) return null;
  const relic = safe(() => list(player?.Relics ?? []).find((r: any) => r instanceof G.Byrdpip_Relics), null);
  if (!relic || relic.SwoopsPlayed !== 5) return null;
  const byrdpip = safe(() => player?.PlayerCombatState?.GetPet?.(G.Byrdpip_Monsters), null);
  const sprite = safe(() => cnode(byrdpip)?.SpineAnimation, null);
  if (!byrdpip || !sprite) return null;
  const combatId = safe(() => G.CombatManager.Instance.CurrentCombatId, null);

  return new FoolVfxNode((n) => {
    let finished = false;
    let attackEntry: any = null;
    const isAttack = (t: any) => safe(() => t?.GetAnimationName?.() === 'attack', false);
    const finish = () => { if (!finished) { finished = true; n.QueueFree(); } };
    const onStart = { Call: (_: any, __: any, t: any) => {
      if (finished || !isAttack(t)) return;
      if (attackEntry) finish();
      else attackEntry = sprite.GetCurrentTrack?.(0) ?? t;
    } };
    const onComplete = { Call: (_: any, __: any, t: any) => {
      if (!finished && attackEntry && isAttack(t) && (t?.IsComplete?.() ?? true)) {
        finish();
        if (safe(() => G.CombatManager.Instance.IsCurrentLiveCombat(combatId) && !G.CombatManager.Instance.IsEnding, false)) {
          G.TalkCmd.Play(new G.LocString().$ctor_LocString('relics', 'BYRDPIP.readyToEvolve'), byrdpip, N('Vfx.VfxColor').Green ?? 1);
        }
      }
    } };
    const onStop = { Call: (_: any, __: any, t: any) => {
      if (attackEntry && !finished && isAttack(t) && !(t?.IsComplete?.() ?? false)) finish();
    } };
    sprite.ConnectAnimationStarted(onStart);
    sprite.ConnectAnimationCompleted(onComplete);
    sprite.ConnectAnimationInterrupted(onStop);
    sprite.ConnectAnimationEnded(onStop);
  });
};

// ------------------------------------------------------------------ NByrdineAttackVfx
const NByrdineAttackVfx = N('Vfx.Utilities.NByrdineAttackVfx');
NByrdineAttackVfx.Create = (creature: any) => {
  if (G.TestMode.IsOn) return null;
  const layer = combatVfxRoot();
  if (!layer) return null;
  const holder = new Container();
  holder.position.set(960, 540);
  layer.addChild(holder);
  const n = new FoolVfxNode(() => {});
  void loadScene('scenes/vfx/monsters/byrdine_overlay_vfx.tscn').then((s) => {
    if (!s || holder.destroyed) { n.QueueFree(); return; }
    const it = s.items.find((x) => x.k === 'spine');
    if (!it) { holder.destroy({ children: true }); n.QueueFree(); return; }
    holder.addChild(spineItem({ ...it, anim: 'attack_overlay' }, (sp) => {
      const ms = megaSprite(sp, 'byrdine_overlay');
      safe(() => creature?.Monster?.SetupSkins?.(ms, ms.GetSkeleton()), null);
      const entry = sp.state.setAnimation(0, 'attack_overlay', false);
      entry.listener = {
        complete: () => {
          if (!holder.destroyed) { holder.parent?.removeChild(holder); holder.destroy({ children: true }); }
          n.QueueFree();
        },
      };
    }));
  });
  return n;
};

// ------------------------------------------------------------------ NRelicRareGlow
const NRelicRareGlow = N('Vfx.NRelicRareGlow');
NRelicRareGlow.Create = () => {
  if (G.TestMode.IsOn) return null;
  return new FoolVfxNode(async (n, layer) => {
    const s = await loadScene('scenes/vfx/relic_rare_glow_vfx.tscn');
    const it = s?.items[0];
    if (!it || layer.destroyed || n.$freed) { n.QueueFree(); return; }
    const c = particleItem(it, true);
    layer.addChild(c);
    n.$onExit.push(() => { if (!c.destroyed) { c.parent?.removeChild(c); c.destroy({ children: true }); } });
  });
};
