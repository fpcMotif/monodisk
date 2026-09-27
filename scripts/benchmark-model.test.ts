import { expect, test } from "bun:test";
import { decode, matches, median } from "./benchmark-model";
const reference = decode('{"seconds":1,"files":10,"dirs":2,"bytes":4096,"errors":0}');
test("benchmark decoding normalizes root-inclusive counts without inventing missing data", () => {
  expect(reference.entries).toBe(13);
  expect(
    decode('{"seconds":0.5,"files":10,"entries":13,"allocated":4096,"errors":0}').allocated,
  ).toBe(4096);
  for (const input of [
    "null",
    "[]",
    "{}",
    '{"seconds":1,"files":0,"errors":0}',
    '{"seconds":-1,"files":0,"entries":1,"allocated":0,"errors":0}',
  ])
    expect(() => decode(input)).toThrow();
});
test("faster mismatched or incomplete scans cannot pass the benchmark gate", () => {
  expect(matches({ ...reference, seconds: 0.5 }, reference)).toBe(true);
  expect(matches({ ...reference, files: 9 }, reference)).toBe(false);
  expect(matches({ ...reference, allocated: 0 }, reference)).toBe(false);
  expect(matches({ ...reference, entries: 12 }, reference)).toBe(false);
  expect(matches({ ...reference, errors: 1 }, reference)).toBe(false);
});
test("median ignores outliers without mutating the input", () => {
  const sample = [10, 2, 1, 3, 100];
  expect(median(sample)).toBe(3);
  expect(sample).toEqual([10, 2, 1, 3, 100]);
  expect(() => median([])).toThrow();
});
