# Scanner performance investigation

## At a glance

The requested 20–63 ms fresh scan remains unachieved; measured time concentrates in filesystem calls.
Compile-time profiling now separates path assembly, opens, bulk reads, parsing, closes, and final aggregation.
The production scanner retains its original traversal after experiments failed to show a substantial improvement.

## Measured boundary

The machine is an M4 Pro with eight performance cores, four efficiency cores, and 128-byte cache lines.
The Applications dataset contains 330,214 entries, 271,126 files, and 34,334,912,512 allocated bytes.
Every experiment matched those totals with zero errors.
Warm-cache traversal still reads the filesystem; no saved application index is involved.

A representative eight-worker profile completed in 589.5 ms, including 4.3 ms of final aggregation.
Summed worker times were approximately 2,512 ms opening directories, 2,040 ms reading metadata, and 11.7 ms parsing.
Workers overlap, so these sums must not be added to the wall time.
The scan opened 59,088 directories and made 117,824 bulk calls, including end-of-directory reads.
These observations identify filesystem calls as the main target; they do not establish a universal lower bound.

## Experiments

| Change                                          | Measurement                                                         | Decision                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| Shared parent directory handles, bounded to 256 | Eleven alternating runs: baseline 624.8 ms, candidate 611.3 ms      | Discard: small improvement versus added ownership complexity |
| Worker count: 1, 2, 4, 6, 8, 12, 16, 24, 32     | Three passes: eight workers best at 605.2 ms; one worker 1,515.1 ms | Retain eight-worker default                                  |
| Parent handles plus 8 KiB buffers               | Nine alternating runs: candidate 624.2 ms, BlitzTree 647.5 ms       | Discard: no substantial improvement                          |

The worker sweep reversed order on alternate passes; it used the parent-handle candidate.
These are exploratory samples, with visible runtime variation rather than statistical confidence intervals.
Raw results live in `artifacts/research/`; the development-workspace comparison is `artifacts/devv-validation.json`.

## Language and architecture

[FFF's zlob worker](https://github.com/dmtrKovalenko/zlob/blob/main/src/walker/worker.zig) shares parent handles across child tasks.
[Its Darwin backend](https://github.com/dmtrKovalenko/zlob/blob/main/src/walker/scan_darwin.zig) also uses bulk metadata syscalls.
Monodisk tested the handle technique without requiring a language migration.
FFF's filtered file-search workload differs from complete disk-usage accounting; its speed cannot establish Monodisk's performance.

There is no measured Zig-versus-Go-versus-C++ language comparison here.
The current evidence supports optimizing filesystem work before rewriting the native engine.
Twenty-millisecond cached opening would require a separate index, freshness contract, and independent benchmark.
Cached opening cannot satisfy the fresh-scan target.

Apple's [deprecated getdirentriesattr documentation](https://github.com/apple-oss-distributions/xnu/blob/main/bsd/man/man2/getdirentriesattr.2) warns that comprehensive results are not guaranteed.
Its end-of-directory signal looks attractive, but replacing bulk reads would weaken the required completeness contract.

## Reproduce profiling

Build the normal executable first using `mise run build`.
Compile the native object with `-DMD_PROFILE`, replace its archive member, and relink through scriptc:

```sh
clang++ -std=c++20 -O3 -DNDEBUG -DMD_PROFILE -Wall -Wextra -Werror -c native/scan.cpp -o dist/scan.o
ar rcs dist/libscan.a dist/scan.o
mise exec -- bunx scriptc build src/main.ts --ffi native/ffi.json -o dist/monodisk-profile
./dist/monodisk-profile /Applications --bench
mise run build
```

Profile counters print to stderr; normal benchmark JSON remains on stdout.
Normal builds omit the profiling timers and counters.
Run correctness checks with `mise run check`, `mise run test-native`, and `mise run test-terminal`.
