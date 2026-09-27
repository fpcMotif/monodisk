import { expect, test } from "bun:test";
import { totalSize } from "../index";
test("copyable deep module validates and totals sizes", () => {
  expect(totalSize([3, 7])).toBe(10);
  expect(() => totalSize([-1])).toThrow();
});
