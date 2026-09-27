import type { Entry } from "../../scanner/index";
import { partition } from "./layout";
import type { Tile } from "./layout";
import { fit, formatBytes, orderEntries, printable } from "./text";

type Frame = {
  rows: Entry[];
  cursor: number;
  marked: number[];
  path: string;
  cols: number;
  lines: number;
  sortName: string;
  message: string;
};
let cachedRows: Entry[] = [];
let cachedWidth = -1;
let cachedHeight = -1;
let cachedTiles: Tile[] = [];
let cachedLookup = new Map<number, Entry>();
function geometry(rows: Entry[], width: number, height: number): void {
  if (rows === cachedRows && width === cachedWidth && height === cachedHeight) return;
  const weighted = orderEntries(rows, 0, false).filter((item) => item.allocated > 0);
  cachedTiles = partition(weighted, 0, 0, width, height);
  cachedLookup = new Map<number, Entry>();
  for (const row of rows) cachedLookup.set(row.id, row);
  cachedRows = rows;
  cachedWidth = width;
  cachedHeight = height;
}
function outline(grid: string[], stride: number, tile: Tile): void {
  for (let y = tile.y; y < tile.y + tile.height; y++) {
    for (let x = tile.x; x < tile.x + tile.width; x++) {
      let character = " ";
      if (y === tile.y || y === tile.y + tile.height - 1) character = "-";
      else if (x === tile.x || x === tile.x + tile.width - 1) character = "|";
      grid[y * stride + x] = character;
    }
  }
}
function label(grid: string[], stride: number, tile: Tile, line: number, text: string): void {
  const value = fit(text, tile.width - 2);
  for (let i = 0; i < value.length; i++) grid[(tile.y + line) * stride + tile.x + 1 + i] = value[i];
}
function paintTile(
  grid: string[],
  stride: number,
  tile: Tile,
  row: Entry,
  selected: boolean,
  marked: boolean,
): void {
  outline(grid, stride, tile);
  grid[tile.y * stride + tile.x] = selected ? "#" : "+";
  if (tile.height < 3 || tile.width < 5) return;
  label(grid, stride, tile, 1, (marked ? "*" : "") + row.name);
  if (tile.height >= 4) label(grid, stride, tile, 2, formatBytes(row.allocated));
}
function treemap(view: Frame, width: number, height: number): string[] {
  const grid: string[] = [];
  for (let i = 0; i < height * width; i++) grid.push(" ");
  geometry(view.rows, width, height);
  const current = view.rows[view.cursor];
  for (const tile of cachedTiles) {
    const row = cachedLookup.get(tile.id);
    if (row)
      paintTile(
        grid,
        width,
        tile,
        row,
        current !== undefined && current.id === row.id,
        view.marked.includes(row.id),
      );
  }
  return grid;
}
function sidebarRow(view: Frame, i: number, width: number): string {
  if (view.rows.length === 0 && i === 0) return "(empty directory)";
  if (i >= view.rows.length) return "";
  const row = view.rows[i];
  const prefix =
    (i === view.cursor ? ">" : " ") +
    (view.marked.includes(row.id) ? "*" : " ") +
    (row.directory ? "/" : " ");
  const suffix = formatBytes(row.allocated).padStart(10) + (row.complete ? " " : "!");
  return prefix + fit(row.name, width - 14) + suffix;
}
function details(view: Frame): string {
  if (!view.rows.length) return "No contents";
  const row = view.rows[view.cursor];
  return (
    printable(row.name) +
    "  | logical " +
    formatBytes(row.logical) +
    " | files " +
    row.files +
    (row.complete ? "" : " | PARTIAL")
  );
}
function body(view: Frame, width: number, height: number): string[] {
  const sidebar = width >= 90 ? Math.min(44, Math.floor(width * 0.38)) : width;
  const mapWidth = width - sidebar - (width >= 90 ? 3 : 0);
  const grid = treemap(view, mapWidth, height);
  const offset = Math.max(0, view.cursor - height + 1);
  const output: string[] = [];
  for (let y = 0; y < height; y++) {
    const map = mapWidth > 0 ? grid.slice(y * mapWidth, (y + 1) * mapWidth).join("") + " | " : "";
    output.push(map + fit(sidebarRow(view, offset + y, sidebar), sidebar));
  }
  return output;
}
export function frame(view: Frame): string {
  const width = Math.max(1, Math.min(240, view.cols));
  const height = Math.max(1, Math.min(100, view.lines));
  if (width < 40 || height < 12) {
    const small: string[] = [fit("Resize terminal (40x12). q quits.", width)];
    for (let i = 1; i < height; i++) small.push(" ".repeat(width));
    return small.join("\n");
  }
  let total = 0;
  for (const row of view.rows) total += row.allocated;
  const output: string[] = [
    fit("MONODISK  /  " + view.path, width),
    fit(
      formatBytes(total) +
        " allocated  |  " +
        view.rows.length +
        " entries  |  sort: " +
        view.sortName,
      width,
    ),
    "-".repeat(width),
  ];
  const content = body(view, width, height - 7);
  for (const line of content) output.push(line);
  output.push("-".repeat(width));
  output.push(fit(details(view), width));
  output.push(
    fit(
      view.message || "arrows/hjkl navigate  enter open  s sort  r reverse  space mark  a mark all",
      width,
    ),
  );
  output.push(
    fit("d review Trash  c clear marks  u rescan  q quit  | marked " + view.marked.length, width),
  );
  return output.join("\n");
}
