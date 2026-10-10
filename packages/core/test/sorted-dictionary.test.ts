import { expect, test } from 'vitest';
import { SortedDictionary } from '../src/rt/collections';

test('map segment keys enumerate ordinally regardless of insertion order', () => {
  const d = new SortedDictionary<string, number>({ Compare: (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0 });
  d.Add('2-4,9-Attack', 2);
  d.Add('10-4,9-Attack', 10);
  d.Add('1-4,9-Attack', 1);
  expect([...d]).toEqual([['1-4,9-Attack', 1], ['10-4,9-Attack', 10], ['2-4,9-Attack', 2]]);
  expect(d.Values).toEqual([1, 10, 2]);
});

test('comparer equality controls replacement and duplicate detection', () => {
  const d = new SortedDictionary<string, number>({ Compare: (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase()) });
  d.Add('B', 1);
  d.set_Item('b', 2);
  expect(d.Count).toBe(1);
  expect(d.get_Item('b')).toBe(2);
  expect(() => d.Add('b', 3)).toThrow();
  expect(d.Remove('b')).toBe(true);
  expect(d.Count).toBe(0);
});
