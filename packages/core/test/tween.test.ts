// Godot Tween step semantics (sequential steps, Parallel/SetParallel/Chain, delays, callbacks, Finished).
import { it, expect } from 'vitest';
import { WebTween, Vector2 } from '../src/rt/index';

it('runs steps in sequence, joins parallel tweeners and fires callbacks at their time', async () => {
  const node: any = { Position: new Vector2(0, 0), Modulate: { R: 1, G: 1, B: 1, A: 1, $clone() { return { ...this }; } } };
  const log: string[] = [];
  const t = new WebTween().SetParallel(true);
  t.TweenProperty(node, 'position', new Vector2(100, 0), 0.25);
  t.TweenCallback(() => log.push('a'));
  t.Chain().TweenInterval(0.5);
  t.TweenCallback(() => log.push('b')).SetDelay(0.1);
  t.Chain().TweenProperty(node, 'modulate:a', 0, 0.2);
  let finished = false;
  t.whenFinished(() => { finished = true; });
  t.Play();
  t.CustomStep(0.125);
  expect(node.Position.X).toBeCloseTo(50); // linear by default (ease is irrelevant for TRANS_LINEAR)
  expect(log).toEqual(['a']);
  t.CustomStep(0.125 + 0.15);
  expect(node.Position.X).toBe(100);
  expect(log).toEqual(['a', 'b']);
  t.CustomStep(0.4); // interval ends at 0.75, the fade runs 0.75–0.95
  expect(node.Modulate.A).toBeCloseTo(1 - 0.05 / 0.2);
  expect(t.IsRunning()).toBe(true);
  t.CustomStep(1);
  expect(node.Modulate.A).toBe(0);
  expect(finished).toBe(true);
  expect(t.IsValid()).toBe(false);
});

it('eases and starts from explicit values; a killed tween never finishes', () => {
  const node: any = { Scale: new Vector2(1, 1) };
  const t = new WebTween();
  t.TweenProperty(node, 'scale', Vector2.One, 1).From(Vector2.Zero).SetEase(1).SetTrans(7);
  t.CustomStep(0.5);
  expect(node.Scale.X).toBeCloseTo(1 - 0.5 ** 3); // cubic out
  let finished = false;
  t.whenFinished(() => { finished = true; });
  t.Kill();
  expect(t.CustomStep(5)).toBe(false);
  expect(finished).toBe(false);
});

it('TweenHelper.AwaitFinished returns TweenOutcome values for finished, exited, freed and cancelled', async () => {
  const { boot } = await import('./helpers');
  const G: any = boot();
  const TweenHelper = G.$.ext('MegaCrit.Sts2.Core.Nodes.GodotExtensions.TweenHelper');
  const CTS = G.$.ext('System.Threading.CancellationTokenSource');
  const Outcome = G.$.ext('MegaCrit.Sts2.Core.Nodes.GodotExtensions.TweenOutcome');

  // 已无效的 tween 直接返回 Finished
  expect(await TweenHelper.AwaitFinished(null, {})).toBe(Outcome.Finished);

  // 已释放的节点返回 OwnerFreed
  expect(await TweenHelper.AwaitFinished(new WebTween(), { $freed: true })).toBe(Outcome.OwnerFreed);

  // 正常完成返回 Finished
  const t1 = new WebTween();
  t1.TweenInterval(0.1);
  const p1 = TweenHelper.AwaitFinished(t1, {});
  t1.CustomStep(0.2);
  expect(await p1).toBe(Outcome.Finished);

  // 节点退出树返回 OwnerExited
  const t2 = new WebTween();
  t2.TweenInterval(1);
  const owner2: any = { TreeExiting: null };
  const p2 = TweenHelper.AwaitFinished(t2, owner2);
  owner2.TreeExiting?.();
  expect(await p2).toBe(Outcome.OwnerExited);

  // 取消令牌返回 Cancelled
  const t3 = new WebTween();
  t3.TweenInterval(1);
  const cts = new CTS();
  const p3 = TweenHelper.AwaitFinished(t3, {}, cts.Token);
  cts.Cancel();
  expect(await p3).toBe(Outcome.Cancelled);
});
