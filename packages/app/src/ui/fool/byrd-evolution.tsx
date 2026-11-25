// NByrdEvolutionVfx：营火进化界面，展示 Byrdpip 变为 Byrdine 的加速闪烁、白化剪影、粒子及跳过交互
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'preact/hooks';
import { Application, ColorMatrixFilter, Container } from 'pixi.js';
import { G, $, N } from '../../game';
import { invalidate, pushOverlay } from '../../store';
import { loadScene, particleItem, spineItem } from '../../render/scene';
import { megaSprite } from '../../render/stage';
import { renderResolution } from '../../render/quality';
import { fullView } from '../../view';
import './fool.css';

const safe = <T,>(f: () => T, d: T): T => { try { return f(); } catch { return d; } };
const tween = () => new $.WebTween();

let evoAppPromise: Promise<Application> | null = null;
function getEvoApp(): Promise<Application> {
  if (!evoAppPromise) {
    evoAppPromise = (async () => {
      const a = new Application();
      await a.init({ width: 1920, height: 1080, backgroundAlpha: 0, resolution: renderResolution(), autoDensity: true });
      a.canvas.classList.add('card-fx');
      fullView(a, true);
      const blend = () => {
        const gl = (a.renderer as any).gl as WebGL2RenderingContext | undefined;
        const map = (a.renderer as any).state?.blendModesMap;
        if (gl && map) map.add = [gl.ONE, gl.ONE, gl.ZERO, gl.ONE];
      };
      blend();
      a.canvas.addEventListener('webglcontextrestored', blend);
      return a;
    })();
  }
  return evoAppPromise;
}

/** 营火处 Byrdpip 进化为 Byrdine 的全屏过场覆盖层（对应 NByrdEvolutionVfx）。 */
export class ByrdEvolutionView {
  kind = 'byrd_evolution';
  ScreenType = 0; // NetScreenType.None
  UseSharedBackstop = true;
  closing = false;
  done = new $.TaskCompletionSource();

  private audioStarted = false;
  private finaleStarted = false;
  private curDuration = 0.5;
  private readonly minDuration = 0.05;
  private readonly accel = 0.85;
  private shrinkReps = 10;
  private powerSpeed = 3;
  private readonly powerSpeedMult = 1.11;

  private root = new Container();
  private pipContainer = new Container();
  private dineContainer = new Container();
  private powerWrap = new Container();
  private finaleWrap = new Container();
  private powerIt: any = null;
  private finaleIt: any = null;
  private dineSpine: any = null;
  private basePipY = 580;

  private pipTween: any = null;
  private dineTween: any = null;
  private startTimer: any = null;
  private stepTimer: any = null;
  private finaleTimer: any = null;

  private whiteFilter = (() => {
    const f = new ColorMatrixFilter();
    f.matrix = [0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0];
    return f;
  })();

  constructor(public byrdpip: any, public byrdine: any) {}

  render() {
    return <ByrdEvolutionScreen view={this} />;
  }

  AfterOverlayOpened() {}
  AfterOverlayShown() {}
  AfterOverlayHidden() {}
  AfterOverlayClosed() {
    this.closing = true;
    invalidate();
    this.stopAnimation();
    this.done.TrySetResult(undefined);
  }

  async mountScene(host: HTMLElement) {
    const [a, s] = await Promise.all([getEvoApp(), loadScene('scenes/vfx/byrd_evolution_vfx.tscn')]);
    if (this.closing || !s || !host.isConnected) return;
    a.stage.removeChildren();
    this.root.removeChildren();
    a.stage.addChild(this.root);
    host.appendChild(a.canvas);

    this.powerIt = s.items.find((x) => x.p === 'VfxPosition/PowerParticles');
    this.finaleIt = s.items.find((x) => x.p === 'VfxPosition/FinaleParticles');
    const pipSpIt = s.items.find((x) => x.p === 'VfxPosition/ByrdpipContainer/ByrdpipSprite');
    const dineSpIt = s.items.find((x) => x.p === 'VfxPosition/ByrdineContainer/ByrdineSprite');

    const vfxNode = s.nodes?.['VfxPosition'] ?? [1, 0, 0, 1, 960, 580];
    const cx = vfxNode[4], cy = vfxNode[5];
    this.basePipY = cy;

    this.pipContainer.position.set(cx, cy + 800);
    this.pipContainer.pivot.set(cx, cy);
    this.pipContainer.scale.set(1);
    this.pipContainer.filters = [this.whiteFilter];

    this.dineContainer.position.set(cx, cy);
    this.dineContainer.pivot.set(cx, cy);
    this.dineContainer.scale.set(0);
    this.dineContainer.filters = [this.whiteFilter];

    this.root.addChild(this.powerWrap, this.dineContainer, this.pipContainer, this.finaleWrap);

    if (pipSpIt) {
      this.pipContainer.addChild(spineItem({ ...pipSpIt, anim: 'stand_still' }, (sp) => {
        sp.state.setAnimation(0, 'stand_still', true);
        const ms = megaSprite(sp, 'byrdpip_evo');
        const sk = ms.GetSkeleton();
        const skin = sk.GetData().FindSkin(safe(() => this.byrdpip.Skin, 'Default'));
        if (skin) {
          const custom = ms.NewSkin('custom-skin');
          custom.AddSkin(skin);
          sk.SetSkin(custom);
          sk.SetSlotsToSetupPose();
        }
      }));
    }

    if (dineSpIt) {
      this.dineContainer.addChild(spineItem({ ...dineSpIt, anim: 'stand_still' }, (sp) => {
        this.dineSpine = sp;
        sp.state.setAnimation(0, 'stand_still', true);
        const ms = megaSprite(sp, 'byrdine_evo');
        const sk = ms.GetSkeleton();
        const ch = safe(() => this.byrdpip.Owner.Character, null);
        const eyeName = ch instanceof G.Necrobinder ? 'necro' : String(safe(() => ch.Id.Entry, 'ironclad')).toLowerCase();
        const eyeSkin = sk.GetData().FindSkin(`eye/${eyeName}`) ?? sk.GetData().FindSkin('eye/ironclad');
        const hairSkin = sk.GetData().FindSkin(safe(() => this.byrdine.Hair, 'hair/v1'));
        const custom = ms.NewSkin('custom-skin');
        if (hairSkin) custom.AddSkin(hairSkin);
        if (eyeSkin) custom.AddSkin(eyeSkin);
        sk.SetSkin(custom);
        sk.SetSlotsToSetupPose();
      }));
    }
  }

  unmountScene() {
    this.stopAnimation();
    if (!this.root.destroyed) {
      this.root.parent?.removeChild(this.root);
      this.root.destroy({ children: true });
    }
  }

  /** 启动进化音效、闪烁缩放序列并等待动画结束（或玩家点击跳过）。 */
  PlayAnimation() {
    G.SfxCmd.PlayLoop$String_Boolean('event:/sfx/byrdpip/byrdlett_evolution', false);
    G.SfxCmd.PlayLoop$String_Boolean('event:/music/byrdlett_evolution_music', false);
    this.audioStarted = true;
    this.startTimer = setTimeout(() => this.startEvolution(), 750);
    return this.done.Task;
  }

  skipToFinale() {
    if (this.finaleStarted) return;
    this.stopTimers();
    this.fireFinale();
  }

  private startEvolution() {
    const st = { Position: { Y: this.basePipY + 800 } };
    const t = tween();
    this.pipTween = t;
    t.TweenProperty(st, 'position:y', this.basePipY, 0.5).SetEase(1).SetTrans(4);
    $.onFrame(() => {
      if (this.pipContainer.destroyed || this.finaleStarted) return false;
      this.pipContainer.position.y = st.Position.Y;
      return t.IsValid();
    });
    t.whenFinished(() => {
      if (!this.finaleStarted) this.stepTimer = setTimeout(() => this.showByrdine(), 250);
    });
  }

  private accelerate() {
    if (this.curDuration * this.accel >= this.minDuration) this.curDuration *= this.accel;
    this.powerSpeed *= this.powerSpeedMult;
  }

  private tweenScale(target: Container, from: number, to: number, dur: number, easeOut: boolean, onDone?: () => void) {
    const st = { Scale: { X: from } };
    const t = tween();
    t.TweenProperty(st, 'scale:x', to, dur).SetEase(easeOut ? 1 : 0).SetTrans(easeOut ? 4 : 0);
    $.onFrame(() => {
      if (target.destroyed || this.finaleStarted) return false;
      target.scale.set(st.Scale.X);
      return t.IsValid();
    });
    if (onDone) t.whenFinished(onDone);
    return t;
  }

  private setPowerEmitting(on: boolean) {
    if (on) {
      for (const c of this.powerWrap.removeChildren()) c.destroy({ children: true });
      if (this.powerIt && !this.powerWrap.destroyed) {
        this.powerWrap.addChild(particleItem({ ...this.powerIt, speed: this.powerSpeed, emitting: true }, true));
      }
    } else {
      for (const c of this.powerWrap.children) {
        const em = (c as any).emitter;
        if (em) em.emitting = false;
      }
    }
  }

  private showByrdine() {
    if (this.finaleStarted) return;
    this.accelerate();
    const d = this.curDuration;
    this.pipTween = this.tweenScale(this.pipContainer, 1, 0, d, false);
    this.stepTimer = setTimeout(() => {
      if (this.finaleStarted) return;
      const growDur = this.shrinkReps > 0 ? d : d * 0.6;
      this.dineTween = this.tweenScale(this.dineContainer, 0, 1, growDur, this.shrinkReps > 0, () => this.showByrdpip());
    }, d * 1000);
  }

  private showByrdpip() {
    if (this.finaleStarted) return;
    this.accelerate();
    const d = this.curDuration;
    if (this.shrinkReps > 0) {
      this.dineTween = this.tweenScale(this.dineContainer, 1, 0, d, false);
      this.stepTimer = setTimeout(() => {
        if (this.finaleStarted) return;
        this.pipTween = this.tweenScale(this.pipContainer, 0, 1, d, true, () => this.showByrdine());
      }, d * 1000);
    } else {
      this.stepTimer = setTimeout(() => this.fireFinale(), d * 1000);
    }
    if (this.shrinkReps === 10) this.setPowerEmitting(true);
    else if (this.shrinkReps === 0) this.setPowerEmitting(false);
    this.shrinkReps--;
  }

  private fireFinale() {
    if (this.finaleStarted) return;
    this.finaleStarted = true;
    this.pipContainer.scale.set(0);
    this.dineContainer.scale.set(1);
    this.dineContainer.filters = [];
    this.setPowerEmitting(false);
    if (this.finaleIt && !this.finaleWrap.destroyed) {
      this.finaleWrap.addChild(particleItem({ ...this.finaleIt, oneShot: true, emitting: true }, true));
    }
    if (this.dineSpine && !this.dineSpine.destroyed) {
      this.dineSpine.state.setAnimation(0, 'be_born', false);
    }
    this.finaleTimer = setTimeout(() => this.completeAnimation(), 3000);
  }

  private completeAnimation() {
    if (this.done.TrySetResult(undefined)) {
      this.stopAnimation();
      N('Screens.Overlays.NOverlayStack').Instance?.Remove(this);
    }
  }

  private stopTimers() {
    clearTimeout(this.startTimer);
    clearTimeout(this.stepTimer);
    this.pipTween?.Kill?.();
    this.dineTween?.Kill?.();
  }

  private stopAnimation() {
    this.stopTimers();
    clearTimeout(this.finaleTimer);
    if (this.audioStarted) {
      G.SfxCmd.StopLoop$1('event:/sfx/byrdpip/byrdlett_evolution');
      G.SfxCmd.StopLoop$1('event:/music/byrdlett_evolution_music');
      this.audioStarted = false;
    }
  }
}

function ByrdEvolutionScreen({ view }: { view: ByrdEvolutionView }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (host.current) void view.mountScene(host.current);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        e.stopImmediatePropagation();
        view.skipToFinale();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      view.unmountScene();
    };
  }, [view]);

  return (
    <div
      class={'byrd-evo' + (view.closing ? ' closing' : '')}
      onPointerDown={(e) => { if (e.button === 0) view.skipToFinale(); }}
    >
      <div class="byrd-evo-canvas" ref={host} />
    </div>
  );
}

N('Vfx.NByrdEvolutionVfx').ShowScreen = (byrdpip: any, byrdine: any) => {
  const v = new ByrdEvolutionView(byrdpip, byrdine);
  const stack = N('Screens.Overlays.NOverlayStack').Instance;
  if (stack) stack.Push(v);
  else pushOverlay(v);
  return v;
};
