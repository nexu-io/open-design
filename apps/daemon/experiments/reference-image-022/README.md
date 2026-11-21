# OD-EVAL-022 reference-image pilot (evaluation branch only)

Source: https://cannele.framer.website/projects (Calenne by Stylokit).
Captured 2026-09-22 at the browser's natural viewport, 1265 × 712 JPEG.
SHA-256: `7a91ed25792ac22241a5cf943cdbb97868b41d8d43e48bfc6e24efd6f68731c5`.
The screenshot is evaluation input, not a bundled product template.

Both arms receive the original v9 question and exactly the same visual-direction
sentence. The control commit has `INCLUDE_REFERENCE_IMAGE = false`; the treatment
commit changes only that constant to `true`. Pin both full commit SHAs in ODEval.
This tests the incremental value of a reference image beyond explicit text direction.
It does not isolate the total benefit of choosing a direction versus the original
unaugmented prompt. Do not compare these results directly with historical runs.

Only the exact initial OD-EVAL-022 prompt in project `eval-OD-EVAL-022` is eligible.
Continuation inputs are preserved. The image is staged in the existing upload
root and then follows normal legacy staging or OD Next frozen input snapshots.
Missing/corrupt assets fail the request rather than silently creating a text-only
treatment. A pinned end-to-end image smoke is required before formal 3+3 generation.

Model/runtime/route/node/dataset/scoring rubric are fixed across arms. Smoke output
is excluded from the formal sample. Human blind review must be performed by a human;
machine results do not count as human calibration. This branch must not be merged
or deployed as a product change.
