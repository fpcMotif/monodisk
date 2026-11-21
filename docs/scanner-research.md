# Completed scanner experiments

## At a glance

The experiments showed no substantial improvement over the existing scanner.
The experimental workflow, profiling instrumentation, and trial implementations have been removed.
The simpler scanner and eight-worker default remain in use.

## Results

Measurements used an M4 Pro and 330,214 Applications entries with a warm filesystem cache.
Every measured run matched file counts and allocated totals, with zero errors.

| Experiment                        | Result                                                               | Decision                                                           |
| --------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Parent-directory handle reuse     | Eleven alternating runs: 624.8 ms baseline versus 611.3 ms candidate | Discarded; roughly 2% improvement did not justify added complexity |
| Worker-count sweep                | Three passes: eight workers fastest at 605.2 ms                      | Kept the existing eight-worker default                             |
| Parent handles with 8 KiB buffers | Nine alternating runs: 624.2 ms candidate versus 647.5 ms BlitzTree  | Discarded; no substantial improvement                              |

The worker sweep used the parent-handle candidate and reversed order on alternate passes.
These exploratory samples had runtime variation; no statistical significance claim is made.
Profiling pointed to directory opens and bulk metadata reads as the dominant work.
These were scanner-design experiments, not language comparisons.
The requested 20–63 ms fresh-scan target was not achieved.
