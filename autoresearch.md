# Autoresearch: fresh scan and instant exploration

## Objective

Investigate order-of-magnitude improvements over the current roughly 0.63-second Applications scan.
The user's aspirational targets are 63 milliseconds and 20 milliseconds.
Measure fresh scanning separately from cached-index opening and subsequent refresh.

## Metrics

- Primary: median fresh-scan process-wall seconds on Applications and a development workspace.
- Secondary: engine seconds, entries, files, allocated bytes, errors, peak memory, phase times, and syscall counts.
- Future separate metric: cached-index open-to-interactive milliseconds, with explicit stale-state labeling.

## How to run

`./autoresearch.sh` runs the controlled comparison and prints metric lines.
`./autoresearch.checks.sh` checks TypeScript, lint, boundaries, Fallow, native sanitizers, and the compiled PTY flow.
Build the pinned BlitzTree reference using `mise exec -- mbx build --manifest-path PATH/Cargo.toml --release --bin bench`.

## Files in scope

- `native/scan.cpp`: metadata reads, allocation, scheduling, identity validation, tree retention.
- `native/ffi.json` and `src/packages/scanner/`: typed native interface.
- `src/packages/view/`: layout and rendering, with cached geometry.
- `scripts/benchmark*`: measured gates and evidence; cannot weaken comparison semantics.
- `native/tests.cpp` and `scripts/terminal_test.py`: correctness checks for changed behavior.

## Constraints

Preserve every entry and allocated total. Keep hardlink accounting, symlink policy, partial-state reporting, and cleanup checks.
Do not modify user files while benchmarking. Cleanup tests use disposable fixtures and isolated Trash directories.
Keep the TypeScript application compiled through scriptc. C++, Rust, Zig, and Go are implementation candidates, not presumed speedups.
Use mise's latest Bun canary. Route all Rust operations through mise and mr-boxington.
Do not claim cached results as fresh scans. No benchmark exclusions solely to improve scores.

## Current evidence and experiments

The functional baseline passes eight TypeScript tests, sanitizer fixtures, and a compiled PTY flow.
Dependency-cruiser passed, rejected a deliberately injected private test import, then passed after restoration.
Global per-directory queue notifications caused excessive contention. Local work donation improved measured times.
Worker arenas reduce allocation volume; the win is insufficient by itself.
Bulk parent-inode attributes avoid a separate directory-stat syscall while preserving identity validation.
Visible-directory sorting avoids eager work; terminal geometry is cached between cursor changes.
Applications runs remain variable; a 15-run sample showed only a 3.7% median advantage.
The development-workspace sample showed an 11.8% reduction with exact totals.

## Next experiments

Instrument worker CPU time and metadata, parsing, allocation, scheduling, and aggregation phases.
Study FFF's native walking, indexing, and watcher implementations from primary source.
Measure parent-relative directory descriptors against repeated path resolution.
Measure compact metadata layouts and batch scheduling against the current arena model.
Only implement persistent or incremental indexing with explicit freshness and independently measured startup.
