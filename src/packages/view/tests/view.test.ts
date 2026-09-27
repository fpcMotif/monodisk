import { expect, test } from "bun:test";
import { render, sorted, safe } from "../index";
import type { Entry } from "../../scanner/index";
const rows: Entry[] = [
  {
    id: 1,
    name: "large",
    allocated: 1000,
    logical: 1200,
    files: 4,
    directory: true,
    complete: true,
  },
  {
    id: 2,
    name: "a\x1b[31m",
    allocated: 100,
    logical: 100,
    files: 1,
    directory: false,
    complete: false,
  },
  { id: 3, name: "empty", allocated: 0, logical: 0, files: 0, directory: true, complete: true },
];
test("sort modes and reverse preserve zero-sized entries", () => {
  expect(sorted(rows, 0, false).map((row) => row.id)).toEqual([1, 2, 3]);
  expect(sorted(rows, 1, false).map((row) => row.id)).toEqual([2, 3, 1]);
  expect(sorted(rows, 0, true).map((row) => row.id)).toEqual([3, 2, 1]);
});
test("responsive monochrome frames have bounded cells and sanitize escape codes", () => {
  for (const width of [40, 80, 120, 180]) {
    const frame = render(rows, 0, [1], "/fixture", width, 24, "size", "");
    expect(frame.split("\n")).toHaveLength(24);
    expect(frame.split("\n").every((line) => line.length === width)).toBe(true);
    expect(frame).not.toContain("\x1b");
    expect(frame).toContain("empty");
  }
  expect(safe("a\n\x1b\t")).toBe("a???");
});
test("empty folders and partial scans remain visible", () => {
  expect(render([], 0, [], "/empty", 80, 24, "size", "")).toContain("empty directory");
  expect(render(rows, 1, [], "/partial", 80, 24, "size", "")).toContain("PARTIAL");
});
test("tiny terminals stay bounded and cursor changes reuse correct geometry", () => {
  const tiny = render(rows, 0, [], "/", 12, 4, "size", "").split("\n");
  expect(tiny).toHaveLength(4);
  expect(tiny.every((line) => line.length === 12)).toBe(true);
  const first = render(rows, 0, [], "/", 120, 24, "size", "");
  const second = render(rows, 1, [2], "/", 120, 24, "size", "");
  expect(second).not.toBe(first);
  expect(second).toContain("marked 1");
});
