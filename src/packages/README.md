# Deep modules

```text
src/packages/name/
  index.ts       public entry point
  client.ts      optional additional entry point
  lib/           private implementation
  tests/         tests and their fixtures
```

Import only through a package's entry points, which are its root files.
Every subfolder is private, regardless of its name.

A package's implementation can import its own internals freely.
Avoid barrel files. Expose several small entry points instead of re-exporting an entire subtree.

Tests import package entry points and their own fixtures.
They cannot import private implementations, including their own package's implementation.

Dependency cycles are forbidden. Run `bun run lint:boundaries`; `bun run check` includes this check.
The example package is a starter template to copy or delete.
