// BCL semantics the rule layer depends on for seeded determinism (checked against .NET 9 / ICU).
import { it, expect } from 'vitest';
import { boot } from './helpers';

it('compares strings like .NET: culture by default, ordinal on request', () => {
  const G: any = boot();
  const $ = G.$;
  const S = $.ext('System.String'), SC = $.ext('System.StringComparer');
  // ICU root collation (Comparer<string>.Default): "_" sorts before letters
  expect($.compare('BEAT_INTO_SHAPE', 'BEATING_REMNANT')).toBe(-1);
  expect($.compare('a', 'A')).toBe(-1);
  expect(S.Compare('BLOOD_WALL', 'BLOODLETTING')).toBe(-1);
  expect(S.Compare('BLOOD_WALL', 'BLOODLETTING', 4)).toBe(1); // StringComparison.Ordinal
  expect(S.CompareOrdinal('B', 'a')).toBe(-1);
  expect(SC.Ordinal.Compare('BODY_SLAM', 'BODYGUARD')).toBe(1);
  expect(S.Compare('abc', 'ABC', true)).toBe(0);
  // ModelDb.AllRelics is OrderBy(Id.Entry) with the default comparer
  const ids = Array.from(G.ModelDb.AllCards, (c: any) => c.Id.Entry);
  expect(ids.indexOf('BODY_SLAM')).toBeLessThan(ids.indexOf('BODYGUARD'));
});

it('rounds half to even where .NET and Godot do', () => {
  const G: any = boot();
  const Mathf = G.$.ext('Godot.Mathf'), Convert = G.$.ext('System.Convert');
  expect([0.5, 1.5, 2.5, -2.5].map((x) => Mathf.Round(x))).toEqual([0, 2, 2, -2]);
  expect(Mathf.RoundToInt(2.5)).toBe(2);
  expect(Convert.ToInt32(3.5)).toBe(4);
  expect((2.5 as any).ToInt32()).toBe(2);
});

it('runs cancellation callbacks registered after cancel and unwraps AggregateException', () => {
  const G: any = boot();
  const CTS = G.$.ext('System.Threading.CancellationTokenSource');
  const cts = new CTS();
  cts.Cancel();
  let ran = 0;
  cts.Token.Register(() => ran++);
  expect(ran).toBe(1);
  const live = new CTS();
  const reg = live.Token.Register(() => ran++);
  reg.Dispose();
  live.Cancel();
  expect(ran).toBe(1);
  const Agg = G.$.ext('System.AggregateException');
  const inner = new (G.$.ext('System.InvalidOperationException'))('boom');
  const e = new Agg(inner);
  expect(e.InnerException).toBe(inner);
  expect(e.InnerExceptions.length).toBe(1);
});

it('enumerates Dictionary/HashSet in .NET slot order after removals', () => {
  const G: any = boot();
  const D = G.$.ext('System.Collections.Generic.Dictionary`2'), H = G.$.ext('System.Collections.Generic.HashSet`1');
  const d = new D();
  for (const k of ['a', 'b', 'c', 'd']) d.Add(k, 1);
  d.Remove('b'); d.Remove('c');
  d.Add('x', 1); d.Add('y', 1); d.Add('z', 1);
  expect(Array.from(d, (kv: any) => kv[0])).toEqual(['a', 'y', 'x', 'd', 'z']); // x reuses c's slot, y reuses b's
  const h = new H();
  for (const k of [1, 2, 3]) h.Add(k);
  for (const k of [1, 2, 3]) h.Remove(k);
  for (const k of [7, 8, 9]) h.Add(k);
  expect(Array.from(h)).toEqual([9, 8, 7]);
});

it('Callable.From<T>(fn) keeps the delegate when the transpiler passes the type argument first', () => {
  const G: any = boot();
  const Callable = G.$.ext('Godot.Callable');
  let got: any = null;
  Callable.From(G.Creature, (c: any) => { got = c; }).Call(42);
  expect(got).toBe(42);
  expect(Callable.From(() => 7).Call()).toBe(7);
});

it('StringBuilder.Append(ref interpolated handler) does not append the handler itself', () => {
  const G: any = boot();
  expect(G.StsTextUtilities.HighlightChangeText('10', 1)).toBe('[green]10[/green]');
  const bash = G.ModelDb.Card(G.Bash).ToMutable();
  bash.UpgradeInternal();
  expect(bash.GetDescriptionForPile(G.PileType.Hand)).not.toContain('Object');
});

it('implements v0.113.1 BCL and Godot extensions (RNG bytes, BitConverter, Char, DateTimeOffset, Latin1, GetFile)', () => {
  const G: any = boot();
  const $ = G.$;
  const RNG = $.ext('System.Security.Cryptography.RandomNumberGenerator');
  const BC = $.ext('System.BitConverter');
  const Char = $.ext('System.Char');
  const DTO = $.ext('System.DateTimeOffset');
  const Enc = $.ext('System.Text.Encoding');
  const StrExt = $.ext('Godot.StringExtensions');

  const bytes = RNG.GetBytes(8);
  expect(bytes).toHaveLength(8);
  expect(typeof BC.ToUInt64([1, 0, 0, 0, 0, 0, 0, 0])).toBe('number');
  expect(BC.ToUInt64([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])).toBe(0xffffffffffffffffn);
  expect(typeof G.Rng.CreateChaoticSeed()).not.toBe('undefined');

  expect(Char.IsAsciiLetterOrDigit('A'.charCodeAt(0))).toBe(true);
  expect(Char.IsAsciiLetterOrDigit('9'.charCodeAt(0))).toBe(true);
  expect(Char.IsAsciiLetterOrDigit('é'.charCodeAt(0))).toBe(false);
  expect(Char.IsAsciiLetterOrDigit('_'.charCodeAt(0))).toBe(false);

  const out = { v: null as any };
  expect(DTO.TryParseExact('14_11_2026', 'dd_MM_yyyy', null, 80, out)).toBe(true);
  expect(out.v.Year).toBe(2026);
  expect(out.v.Month).toBe(11);
  expect(out.v.Day).toBe(14);
  expect(DTO.TryParseExact('31_02_2026', 'dd_MM_yyyy', null, 80, out)).toBe(false);

  const latin = [0x41, 0xe9, 0xff];
  expect(Enc.Latin1.GetString(latin)).toBe('Aéÿ');
  expect(Enc.Latin1.GetBytes('Aéÿ中')).toEqual([0x41, 0xe9, 0xff, 0x3f]);

  expect(StrExt.GetFile('user://default/1/profile1/saves/current_run.save')).toBe('current_run.save');
  expect(StrExt.GetFile('progress.save')).toBe('progress.save');
  expect(StrExt.GetFile('')).toBe('');
});
