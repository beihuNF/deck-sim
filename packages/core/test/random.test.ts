import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import * as G from '../src/index';
import vectors from './random-v0.111.0-vectors.json';

// Expected values come from .NET 9 executing the unmodified v0.111.0 MegaRandom.cs
// and the installed game's System.IO.Hashing.dll, not from the TypeScript implementation.
describe('public-beta 64-bit RNG', () => {
  it.each(vectors.hashes)('XXH64 UTF-8 hash: $text', ({ text, hash }) => {
    expect(String(G.$.xxHash64(new TextEncoder().encode(text)))).toBe(hash);
    expect(String(G.StringHelper.GetDeterministicHashCode(text))).toBe(hash);
  });
  it.each(vectors.rng)('MegaRandom agrees with the original for seed $seed', ({ seed, longs, doubles, bytes, afterBytes }) => {
    const create = () => new G.MegaRandom().$ctor_MegaRandom$UInt64(BigInt(seed));
    let rng = create();
    expect(longs.map(() => String(rng.NextULong()))).toEqual(longs);
    rng = create();
    expect(doubles.map(() => rng.NextDouble())).toEqual(doubles);
    rng = create();
    const actual = Array(bytes.length).fill(0);
    rng.NextBytes(G.$.span(actual));
    expect(actual).toEqual(bytes);
    expect(String(rng.NextULong())).toBe(afterBytes);
  });
  it('preserves all four exact states and the next draw across JSON', () => {
    const rng = new G.Rng().$ctor_Rng$UInt64(18446744073709551615n);
    for (let i = 0; i < 17; i++) rng.NextDouble$0();
    const save = rng.ToSerializable();
    const raw = JSON.parse(JSON.stringify(G.$.snapshot(save)));
    const restored = G.$.restore(raw);
    expect(G.$.snapshot(restored)).toEqual(raw);
    const next = new G.Rng().$ctor_Rng$SerializableRng(restored);
    expect(Array.from({ length: 20 }, () => next.NextUnsignedLong$0()))
      .toEqual(Array.from({ length: 20 }, () => rng.NextUnsignedLong$0()));
  });
  it('wraps and narrows unchecked signed and unsigned integers exactly', () => {
    expect(G.$.op64('+', 18446744073709551615n, 1, true)).toBe(0);
    expect(G.$.op64('+', 9223372036854775807n, 1)).toBe(-9223372036854775808n);
    expect(G.$.op64('>>', -9223372036854775808n, 63)).toBe(-1);
    expect(G.$.op64('>>>', -1, 63)).toBe(1);
    expect(G.$.narrow64(18446744073709551615n, 32)).toBe(-1);
    expect(G.$.narrow64(18446744073709551615n, 32, true)).toBe(4294967295);
  });
  it('hashes 64-bit integers without losing the high word', () => {
    expect(G.$.hash(0x123456789abcdef0n)).toBe(-2004318072);
    expect(G.$.hash(18446744073709551615n)).toBe(0);
    expect(G.$.hash(-9223372036854775808n)).toBe(-2147483648);
  });
  it('retains the old random sequence after continuing and re-saving a shipped run', () => {
    const raw = JSON.parse(fs.readFileSync(new URL('./fixtures/saves-v0.98.3/silent/f25/default/1/profile1/saves/current_run.save', import.meta.url), 'utf8')).SerializableRng;
    const restored = G.$.restore(raw);
    const oldSeed = (G.StringHelper.GetDeterministicHashCodeOld(raw.Seed) + G.StringHelper.GetDeterministicHashCodeOld('combat_card_generation')) >>> 0;
    const counter = raw.Counters.$d.find(([type]: number[]) => type === G.RunRngType.CombatCardGeneration)[1];
    const original = new (G.$.ext('System.Random'))(oldSeed | 0);
    for (let i = 0; i < counter; i++) original.Next();
    const rngs = G.RunRngSet.FromSave(restored);
    for (let i = 0; i < 11; i++) expect(rngs.CombatCardGeneration.NextDouble$0()).toBe(original.NextDouble());
    const written = JSON.parse(JSON.stringify(G.$.snapshot(rngs.ToSerializable())));
    const continued = G.RunRngSet.FromSave(G.$.restore(written));
    for (let i = 0; i < 20; i++) expect(continued.CombatCardGeneration.NextDouble$0()).toBe(original.NextDouble());
  });
  it('writes and reads exact signed 64-bit little-endian values', () => {
    const binary = G.$.ext('System.Buffers.Binary.BinaryPrimitives');
    for (const value of [-9223372036854775808n, 9223372036854775807n, -1, 0, 123]) {
      const bytes = Array(8).fill(0);
      binary.WriteInt64LittleEndian(bytes, value);
      expect(binary.ReadInt64LittleEndian(bytes)).toBe(value);
    }
  });
});
