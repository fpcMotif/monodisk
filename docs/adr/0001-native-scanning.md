# Keep filesystem work behind a native boundary

TypeScript compiled through scriptc owns the terminal application; C++ owns scanning, filesystem identities, and cleanup validation.
Bulk metadata syscalls dominate the measured scan, so a language rewrite lacks evidence of a substantial benefit.
Keep the native interface small and require equivalent accounting and measured improvement before replacing the engine.

Parent-handle reuse showed only a small measured benefit and did not justify added ownership complexity.
See [the measurements](../scanner-research.md).
