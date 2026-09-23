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

Planning validates receipt bindings and probes product availability with a bounded
range read; it does not hash-download payloads. Independent receipt reads use at
most eight workers and retain per-workload fail-open decisions. A plan hit is not
proof of restored byte integrity: every consuming path must check SHA-256 and
either rebuild on acquisition failure or fail, never silently use invalid bytes.
Proof-only hits require no product download. GitHub artifact promotion and trusted
publisher admission are unchanged. End-to-end transfer savings still need a real
workflow measurement. A directory is owned by one caller; concurrent writers to
the same destination are not supported.
