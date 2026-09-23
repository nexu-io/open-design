# OD-EVAL-022 reference-image pilot (evaluation branch only)

Source: https://cannele.framer.website/projects (Calenne by Stylokit).
Captured 2026-09-22 at the browser's natural viewport, 1265 × 712 JPEG.
SHA-256: `7a91ed25792ac22241a5cf943cdbb97868b41d8d43e48bfc6e24efd6f68731c5`.
The screenshot is evaluation input, not a bundled product template.

The same evaluation-only mechanism also covers two additional frozen v9 cases:

| Case | Screenshot source | Frozen SHA-256 |
| --- | --- | --- |
| OD-EVAL-003 | [edOS Teacher Dashboard](https://edos.one/assets/screenshots/desktop/teacher-dashboard.webp), actual product screenshot | `8ab60e2ecdf4b81f6cfd65e0a7974ab1439a502f81a337d76430ae19a9aa549a` |
| OD-EVAL-028 | [HeyGen Avatar IV creation form](https://d2xo500swnpgl1.cloudfront.net/forum/heygen/ec248d20-d96b-4833-86f3-b8e1aa866c4c-93e2477d-f142-48a5-8450-2cfd233483a0-1749142428658.png), actual product screenshot | `7be926dd9f4dbe95d2f2976919f5c8cb3d9b18bcf69983f029bb01a18435545d` |

Each case receives its original prompt and the same case-specific direction
sentence in both arms. The treatment adds only its screenshot through the
ordinary upload pipeline. The images do not override missing functions from
the original prompt. These branches remain evaluation-only and must not merge
into the product.

Both arms receive the original v9 question and exactly the same visual-direction
sentence. The control commit has `INCLUDE_REFERENCE_IMAGE = false`; the treatment
commit changes only that constant to `true`. Pin both full commit SHAs in ODEval.
This tests the incremental value of a reference image beyond explicit text direction.
It does not isolate the total benefit of choosing a direction versus the original
unaugmented prompt. Do not compare these results directly with historical runs.

Only the exact initial prompt for each listed `eval-OD-EVAL-*` project is eligible.
Continuation inputs are preserved. The image is staged in the existing upload
root and then follows normal legacy staging or OD Next frozen input snapshots.
Missing/corrupt assets fail the request rather than silently creating a text-only
treatment. A pinned end-to-end image smoke is required before formal 3+3 generation.

Model/runtime/route/node/dataset/scoring rubric are fixed across arms. Smoke output
is excluded from the formal sample. Human blind review must be performed by a human;
machine results do not count as human calibration. This branch must not be merged
or deployed as a product change.
