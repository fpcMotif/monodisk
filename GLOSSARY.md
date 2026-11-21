# Disk exploration

Monodisk shows observed disk usage and lets users move selected entries to Trash.

## Language

**Fresh scan**:
A new filesystem traversal that reads metadata and constructs the observed tree.
The filesystem cache may already be warm.
_Avoid_: cached-index opening, cold scan

**Allocated size**:
The filesystem-reported storage allocated to an entry, counted once for each hardlinked file.
_Avoid_: logical size, guaranteed reclaimable space

**Logical size**:
The reported length of a file, regardless of sparse storage or compression.
_Avoid_: allocated size

**Partial scan**:
A scan containing skipped or unreadable entries whose complete contents remain unknown.
_Avoid_: empty folder, complete scan

**Bulk cleanup**:
A confirmed batch of moves to Trash, with each entry checked against its scanned identity.
_Avoid_: permanent deletion, guaranteed reclaimed space
