import type { Entry } from "../scanner/index";
import { frame } from "./lib/frame";
import { formatBytes, printable, orderEntries } from "./lib/text";
export function safe(text: string): string {
  return printable(text);
}
export function bytes(value: number): string {
  return formatBytes(value);
}
export function sorted(entries: Entry[], mode: number, reverse: boolean): Entry[] {
  return orderEntries(entries, mode, reverse);
}
export function render(
  rows: Entry[],
  cursor: number,
  marked: number[],
  path: string,
  cols: number,
  lines: number,
  sortName: string,
  message: string,
): string {
  return frame({ rows, cursor, marked, path, cols, lines, sortName, message });
}
