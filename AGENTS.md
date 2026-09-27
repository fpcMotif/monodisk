# Monodisk

Use mise tasks and the latest Bun canary for TypeScript tools. Never replace canary with stable Bun.
Build the executable with scriptc and the macOS SDK's clang++.
The app uses TypeScript and C++; Rust is only needed for the BlitzTree benchmark reference.
Run every Rust command through `mise exec -- mbx`, including builds, tests, and clippy.
Run `bun run check` and `bun run build` after changes.
Packages are deep modules. Read `src/packages/README.md` before adding or importing one.
Native scanning owns filesystem identities, accounting, and cleanup validation.
Tests must only remove disposable fixtures they created.
Never claim a speed win without matched totals and alternating benchmark runs.
Oxc type-aware linting, Oxfmt, and Fallow are required checks. Do not suppress findings to pass.

## Agent skills

### Issue tracker

Use this repository's GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five standard triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Use one root context and `docs/adr/`. See `docs/agents/domain.md`.
