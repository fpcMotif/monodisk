import { children, parent, start, status, stop, trash, wait } from "./packages/scanner/index";
import type { Entry } from "./packages/scanner/index";
import { dimension, key, terminal } from "./packages/terminal/index";
import { bytes, render, safe, sorted } from "./packages/view/index";

const args = process.argv.slice(2);
const bench = args.includes("--bench");
const snapshot = args.includes("--snapshot");
const help = args.includes("--help");
let path = ".";
let threads = 0;
let invalid = false;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--threads") {
    threads = Number(args[++i]);
    if (!Number.isInteger(threads) || threads < 1 || threads > 32) invalid = true;
  } else if (arg === "--bench" || arg === "--snapshot" || arg === "--help") {
    // These modes do not consume a path.
  } else if (arg.startsWith("--")) invalid = true;
  else path = arg;
}
if (help || invalid) {
  console.log(
    "monodisk [directory] [--bench | --snapshot] [--threads 1..32]\nmacOS native disk explorer. Cleanup moves marked entries to ~/.Trash.\nInteractive: hjkl/arrows, enter, s sort, r reverse, space/a mark, d review, Y confirm, u rescan, q quit.",
  );
  process.exit(invalid ? 2 : 0);
}
if (!bench && !snapshot && !process.stdin.isTTY) {
  console.error("Interactive mode requires a terminal. Use --bench or --snapshot.");
  process.exit(2);
}
let exitCode = 0;
let active = true;
let message = "";
if (!bench && !snapshot) terminal(true);
try {
  while (active) {
    const error = start(path, threads);
    if (error) {
      console.error("Cannot scan directory; errno " + error);
      exitCode = 1;
      break;
    }
    if (bench || snapshot) wait();
    let cancelled = false;
    while (status(0) === 0) {
      if (!bench && !snapshot)
        process.stdout.write(
          "\x1b[H\x1b[2JMONODISK  /  " +
            safe(path) +
            "\n\nScanning " +
            status(1) +
            " entries  |  skipped/errors " +
            status(2) +
            "\nq to cancel",
        );
      const k = key(80);
      if (!bench && !snapshot && (k === 113 || k === 3)) {
        cancelled = true;
        stop();
        break;
      }
    }
    if (cancelled) break;
    if (status(0) < 0) {
      exitCode = 1;
      break;
    }
    if (bench) {
      console.log(
        JSON.stringify({
          seconds: status(3),
          entries: status(1),
          allocated: status(4),
          logical: status(5),
          files: status(6),
          errors: status(2),
        }),
      );
      break;
    }
    let current = 0;
    let trail: string[] = [];
    let rows: Entry[] = sorted(children(0), 0, false);
    let cursor = 0;
    let mode = 0;
    let reverse = false;
    let marked: number[] = [];
    let markedRows: Entry[] = [];
    let confirm = false;
    let dirty = true;
    let previousWidth = 0;
    let previousHeight = 0;
    if (!message)
      message =
        "Scanned " +
        status(1) +
        " entries in " +
        status(3).toFixed(3) +
        "s | skipped/errors " +
        status(2);
    if (snapshot) {
      console.log(render(rows, cursor, marked, path, 120, 30, "allocated", message));
      break;
    }
    let rescan = false;
    while (!rescan && active) {
      const width = dimension(0);
      const height = dimension(1);
      if (width !== previousWidth || height !== previousHeight) dirty = true;
      if (dirty) {
        const names = ["allocated", "name", "files", "logical"];
        const frame = render(
          rows,
          cursor,
          marked,
          path + (trail.length ? "/" + trail.join("/") : ""),
          width,
          height,
          names[mode] + (reverse ? " reversed" : ""),
          message,
        );
        process.stdout.write("\x1b[H" + frame + "\x1b[J");
        previousWidth = width;
        previousHeight = height;
        dirty = false;
      }
      const k = key(100);
      if (k === -1) continue;
      dirty = true;
      if (k === 113 || k === 3) {
        active = false;
        break;
      }
      if (confirm) {
        if (k === 89) {
          let moved = 0;
          let failed = 0;
          let lastError = 0;
          // Parents receive IDs before children; selected ancestors move first.
          marked.sort((a, b) => a - b);
          for (const id of marked) {
            const result = trash(id);
            if (result === 0) moved++;
            else if (result !== 37) {
              failed++;
              lastError = result;
            }
          }
          message =
            "Trash: " +
            moved +
            " moved, " +
            failed +
            " failed" +
            (failed ? " (errno " + lastError + ")" : "") +
            ". Rescanned.";
          rescan = true;
        } else {
          confirm = false;
          message = "Cleanup cancelled. Nothing moved.";
        }
        continue;
      }
      message = "";
      if (k === 106 || k === 1002) cursor = Math.min(rows.length - 1, cursor + 1);
      if (k === 107 || k === 1001) cursor = Math.max(0, cursor - 1);
      if (k === 103) cursor = 0;
      if (k === 71) cursor = Math.max(0, rows.length - 1);
      if (k === 115 || k === 114) {
        if (k === 115) mode = (mode + 1) % 4;
        else reverse = !reverse;
        rows = sorted(rows, mode, reverse);
        cursor = 0;
      }
      if ((k === 13 || k === 108 || k === 1003) && rows.length && rows[cursor].directory) {
        current = rows[cursor].id;
        trail.push(rows[cursor].name);
        rows = sorted(children(current), mode, reverse);
        cursor = 0;
      }
      if ((k === 127 || k === 104 || k === 1004) && current !== 0) {
        current = parent(current);
        trail.pop();
        rows = sorted(children(current), mode, reverse);
        cursor = 0;
      }
      if (k === 32 && rows.length) {
        const row = rows[cursor];
        if (marked.includes(row.id)) {
          marked = marked.filter((id) => id !== row.id);
          markedRows = markedRows.filter((item) => item.id !== row.id);
        } else {
          marked.push(row.id);
          markedRows.push(row);
        }
      }
      if (k === 97)
        for (const row of rows) {
          if (!marked.includes(row.id)) {
            marked.push(row.id);
            markedRows.push(row);
          }
        }
      if (k === 99) {
        marked = [];
        markedRows = [];
      }
      if (k === 117) rescan = true;
      if (k === 100 && marked.length) {
        let total = 0;
        for (const row of markedRows) total += row.allocated;
        message =
          "Y: move " +
          marked.length +
          " entries to Trash? " +
          bytes(total) +
          " selected; other keys cancel.";
        confirm = true;
      }
      cursor = Math.max(0, cursor);
    }
  }
} finally {
  stop();
  terminal(false);
}
process.exit(exitCode);
