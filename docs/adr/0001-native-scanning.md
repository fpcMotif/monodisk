# Keep filesystem work behind a native boundary

TypeScript compiled through scriptc owns the terminal application; C++ owns scanning, filesystem identities, and cleanup validation.
Bulk metadata syscalls dominate the measured scan, so a language rewrite lacks evidence of a substantial benefit.
Keep the native interface small and require equivalent accounting and measured improvement before adopting Rust, Zig, or Go.

Zig's zlob walker supplied a parent-handle reuse experiment, but its small measured benefit did not justify added ownership complexity.
No equivalent Zig or Go implementation has been benchmarked; their relative speed remains unknown.
See [the measurements](../scanner-research.md).
