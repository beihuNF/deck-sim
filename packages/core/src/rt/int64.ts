// Exact integer helpers for the game's XXH64 seed hashing and xoshiro256** RNG.
import { int64, provide, type Int64 } from './core';

const u64 = (v: bigint) => BigInt.asUintN(64, v);
const big = (v: Int64) => BigInt(v);
export function rotateLeft64(v: Int64, count: number): Int64 {
  const x = u64(big(v)), n = BigInt(count & 63);
  return int64((x << n) | (x >> (64n - n)), true);
}

/** XXH64, including little-endian input lanes, modulo-2^64 rounds and avalanche. */
export function xxHash64(bytes: ArrayLike<number>, seed: Int64 = 0): Int64 {
  const p1 = 11400714785074694791n, p2 = 14029467366897019727n;
  const p3 = 1609587929392839161n, p4 = 9650029242287828579n, p5 = 2870177450012600261n;
  const rot = (v: bigint, n: number) => big(rotateLeft64(v, n));
  const round = (a: bigint, v: bigint) => u64(rot(u64(a + v * p2), 31) * p1);
  const lane = (o: number, size: number) => {
    let n = 0n;
    for (let i = 0; i < size; i++) n |= BigInt(bytes[o + i]) << BigInt(i * 8);
    return n;
  };
  let pos = 0, h: bigint;
  const s = u64(big(seed));
  if (bytes.length >= 32) {
    let a = u64(s + p1 + p2), b = u64(s + p2), c = s, d = u64(s - p1);
    while (pos <= bytes.length - 32) {
      a = round(a, lane(pos, 8)); b = round(b, lane(pos + 8, 8));
      c = round(c, lane(pos + 16, 8)); d = round(d, lane(pos + 24, 8)); pos += 32;
    }
    h = u64(rot(a, 1) + rot(b, 7) + rot(c, 12) + rot(d, 18));
    for (const v of [a, b, c, d]) h = u64((h ^ round(0n, v)) * p1 + p4);
  } else h = u64(s + p5);
  h = u64(h + BigInt(bytes.length));
  while (pos <= bytes.length - 8) {
    h = u64(rot(h ^ round(0n, lane(pos, 8)), 27) * p1 + p4); pos += 8;
  }
  if (pos <= bytes.length - 4) {
    h = u64(rot(h ^ (lane(pos, 4) * p1), 23) * p2 + p3); pos += 4;
  }
  while (pos < bytes.length) h = u64(rot(h ^ (BigInt(bytes[pos++]) * p5), 11) * p1);
  h ^= h >> 33n; h = u64(h * p2); h ^= h >> 29n; h = u64(h * p3); h ^= h >> 32n;
  return int64(h, true);
}

provide('System.Numerics.BitOperations', { RotateLeft: rotateLeft64 });
provide('System.IO.Hashing.XxHash64', { HashToUInt64: xxHash64 });
provide('System.Runtime.InteropServices.MemoryMarshal', {
  GetReference: (span: any) => ({ get v() { return span[0]; }, set v(value) { span[0] = value; }, span }),
});
provide('System.Runtime.CompilerServices.Unsafe', {
  WriteUnaligned: (...args: any[]) => {
    // Generic calls prepend the type marker; the reference is the penultimate argument.
    const ref = args[args.length - 2], value = u64(big(args[args.length - 1]));
    for (let i = 0; i < 8; i++) ref.span[i] = Number((value >> BigInt(8 * i)) & 255n);
  },
});
