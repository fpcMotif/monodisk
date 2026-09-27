import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { decode, matches, median } from "./benchmark-model";
import type { Result } from "./benchmark-model";
import { resolve } from "node:path";
import { cpus, release } from "node:os";

type Run = { tool: string; wall: number; result: Result };
const root = process.argv[2];
const reference = process.argv[3];
if (!root || !reference)
  throw new Error("Usage: mise run bench -- DIRECTORY BLITZTREE_BENCH_BINARY [REPORT.json]");
const output = process.argv[4] || "artifacts/local/benchmark.json";
const rounds = Number(process.argv[5] || "5");
if (!Number.isInteger(rounds) || rounds < 3 || rounds % 2 !== 1)
  throw new Error("Use an odd run count of at least three");
const target = resolve(root);
const runs: Run[] = [];
function execute(tool: string): Run {
  const command =
    tool === "monodisk" ? ["./dist/monodisk", target, "--bench"] : [reference, "bulk", target];
  const before = performance.now();
  const child = Bun.spawnSync(command, {
    env: { ...process.env, BZ_JSON: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const wall = (performance.now() - before) / 1000;
  if (child.exitCode !== 0) throw new Error(tool + " failed: " + child.stderr.toString());
  const result = decode(child.stdout.toString());
  return { tool, wall, result };
}
execute("monodisk");
execute("blitztree");
for (let round = 0; round < rounds; round++) {
  const order = round % 2 ? ["blitztree", "monodisk"] : ["monodisk", "blitztree"];
  for (const tool of order) {
    const result = execute(tool);
    runs.push(result);
    console.log(JSON.stringify({ round, ...result }));
  }
}
const mono = runs.filter((run) => run.tool === "monodisk");
const blitz = runs.filter((run) => run.tool === "blitztree");
const expected = mono[0].result;
const matching = runs.every(({ result }) => matches(result, expected));
const monodiskWall = median(mono.map((run) => run.wall));
const blitztreeWall = median(blitz.map((run) => run.wall));
const summary = {
  matching,
  faster: matching && monodiskWall < blitztreeWall,
  monodiskWall,
  blitztreeWall,
  monodiskScan: median(mono.map((run) => run.result.seconds)),
  blitztreeScan: median(blitz.map((run) => run.result.seconds)),
  ratio: blitztreeWall / monodiskWall,
};
mkdirSync(resolve(output, ".."), { recursive: true });
writeFileSync(
  output,
  JSON.stringify(
    {
      date: new Date().toISOString(),
      machine: cpus()[0].model,
      cores: cpus().length,
      os: release(),
      rounds,
      monodiskSha256: new Bun.CryptoHasher("sha256")
        .update(readFileSync("./dist/monodisk"))
        .digest("hex"),
      referenceSha256: new Bun.CryptoHasher("sha256").update(readFileSync(reference)).digest("hex"),
      method:
        "one warmup each; alternating runs; process wall includes startup and teardown; no filesystem exclusions",
      summary,
      runs,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(summary));
if (!summary.faster) process.exitCode = 1;
