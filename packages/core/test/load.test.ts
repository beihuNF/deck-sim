import { describe, it, expect } from 'vitest';

describe('generated rule layer', () => {
  it('loads', async () => {
    const m = await import('../src/index');
    expect(m.CardModel).toBeTypeOf('function');
    expect(m.StringHelper.GetDeterministicHashCode('abc')).toBe(4952883123889572249n);
  });
});
