import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });
for (const cmd of [
  [
    "clang++",
    "-std=c++20",
    "-O3",
    "-DNDEBUG",
    "-Wall",
    "-Wextra",
    "-Werror",
    "-c",
    "native/scan.cpp",
    "-o",
    "dist/scan.o",
  ],
  ["ar", "rcs", "dist/libscan.a", "dist/scan.o"],
]) {
  const result = Bun.spawnSync(cmd, { stdout: "inherit", stderr: "inherit" });
  if (result.exitCode !== 0) process.exit(result.exitCode);
}
