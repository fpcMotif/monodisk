import type { Entry } from "../../scanner/index";
export function printable(text: string): string {
  // ASCII cells prevent terminal escape injection and ambiguous display widths.
  return text.replace(/[^\x20-\x7e]/g, "?");
}
export function formatBytes(value: number): string {
  if (value < 1024) return String(value) + " B";
  if (value < 1048576) return (value / 1024).toFixed(1) + " KiB";
  if (value < 1073741824) return (value / 1048576).toFixed(1) + " MiB";
  return (value / 1073741824).toFixed(2) + " GiB";
}
function byName(a: Entry, b: Entry): number {
  if (a.name < b.name) return -1;
  return a.name > b.name ? 1 : 0;
}
export function orderEntries(entries: Entry[], mode: number, reverse: boolean): Entry[] {
  const rows = entries.slice();
  rows.sort((a, b) => {
    let order = 0;
    if (mode === 0) order = b.allocated - a.allocated;
    if (mode === 1) order = byName(a, b);
    if (mode === 2) order = b.files - a.files;
    if (mode === 3) order = b.logical - a.logical;
    if (order === 0) order = byName(a, b);
    return reverse ? -order : order;
  });
  return rows;
}
export function fit(text: string, width: number): string {
  const value = printable(text);
  if (width <= 0) return "";
  if (value.length > width) return value.slice(0, Math.max(0, width - 1)) + "~";
  return value + " ".repeat(width - value.length);
}
