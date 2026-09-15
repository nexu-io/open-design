# Workload product consumption

`convergence.py restore --pending <plan> --workload <id> --output-dir <fresh-dir>`
validates the result bound to the pending plan and downloads its complete product
set. Every product needs a SHA-256. Only after all hashes pass does the destination
appear. Files are named by product ID; their bytes are opaque, with no implicit
unpacking, workspace overlay, identity recalculation or client release policy.

An existing destination is a caller error, never a target for deletion or merge.
Download/integrity failure reports `restored=false` and exits nonzero by default.
`--allow-miss` is only for an executor that explicitly checks the output and runs
the original workload on false. No fallback failure may become a success receipt.
Configuration/selection errors remain fatal even with `--allow-miss`.

This command does not change the planner's current product verification strategy,
GitHub artifact promotion format or trusted publisher admission. Avoid claiming
elimination of duplicate downloads until the caller/plan transport is integrated
and measured. A directory is owned by one caller; concurrent writers to the same
destination are not supported.
