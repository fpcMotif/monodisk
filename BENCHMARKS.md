# Benchmarks

## At a glance

Fresh filesystem enumeration currently dominates startup; replacing TypeScript with another native language does not remove that work.
Monodisk uses bulk metadata, worker-local arenas, donated work, and deferred visible-directory sorting.
Every comparison still requires matching entries, files, allocated bytes, and zero errors.

## Development measurements

Machine: Apple M4 Pro, 12 cores, Darwin 27.2.0, APFS, warm metadata cache.
Reference: BlitzTree `bf3b1fc256eeb920db730d1668cf28180416b4ee`, release build through mise and mr-boxington.
Monodisk defaults to eight workers. BlitzTree uses its default worker count.
Each tool receives one warmup. Fifteen measured runs alternate tool order.
Process-wall timing includes startup and teardown. Scan timing comes from each engine.

| Dataset               | Entries | Monodisk wall median | BlitzTree wall median | Reduction |
| --------------------- | ------: | -------------------: | --------------------: | --------: |
| Applications          | 330,214 |              0.632 s |               0.656 s |      3.7% |
| Development workspace | 283,202 |              0.390 s |               0.442 s |     11.8% |

Totals matched for every measured run. These are development measurements, not a universal speed guarantee.
Earlier five-run Applications batches were mixed and sometimes favored BlitzTree.
The small Applications advantage is insufficient for the requested order-of-magnitude improvement.
The original 3.1-million-entry home-folder workload has not been reproduced.
Raw Applications data: `artifacts/applications-validation.json`; an earlier mixed batch remains in `artifacts/applications-benchmark.json`.

## Scope

Both engines retain the complete observed tree and aggregate directory totals.
BlitzTree eagerly sorts every directory. Monodisk sorts only the directory displayed by the terminal.
Monodisk's extra native memory is not a memory-efficiency win over BlitzTree.
Symlink traversal, cloud downloads, and crossing mount points are excluded by scanner policy.
The filesystem remains live; this is not an atomic snapshot benchmark.

Cached-index startup and fresh scanning are separate metrics. Cached results must never be reported as fresh scans.
The optimization work continues in `autoresearch.md`.
