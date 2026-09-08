# Disposable notarization experiment

Branch: `experiment/notarization-timing`. **Do not merge.**

The only workflow is `release-exact.yml`, manually dispatched on this exact
branch. It has contents-read permission, no release/storage/update/notification
credentials, and uploads reports only. Existing Apple credentials stay on the
ephemeral GitHub runner. Each variant submits exactly once; a timeout is not a
reason to blindly resubmit (the saved submission ID remains authoritative).

Both variants derive from the checksum-verified `open-design-v0.22.0` arm64 DMG:

- Full: retain existing application content, inject a unique sealed experiment
  field, and re-sign the outer app with Developer ID and secure timestamp.
- Minimal: retain exactly the same Electron Frameworks/helpers/executable,
  replace Resources with a dependency-free hidden-window renderer smoke fixture,
  inject experiment metadata, and re-sign the outer app identically.

No Electron binary trimming or production implementation is attempted.
The minimal fixture is a payload-size proxy, not the complete capsule POC.
Existing nested code signatures are reused, not rebuilt/re-signed.

Record separately: outer signing, strict recursive verification, ZIP creation,
upload/submit, Apple wait, stapling, ticket validation, Gatekeeper, and final DMG
creation. Count regular non-symlink files and bytes. The submitted container is
a ZIP in both cases; the final DMG contains the stapled app, but is not itself
submitted or published. This mirrors an app-notarization comparison, not a
second independent DMG notarization.

Interpretation limits:

- Apple queue/scanning/cache state is opaque. Parallel samples reduce time-of-day
  drift, but a single pair cannot establish a reliable percentile or isolate
  file count from bytes/native-code changes.
- Both samples reuse previously distributed nested binaries. Fresh outer
  metadata prevents exact whole-app replay but cannot make Apple's cache cold.
- File/size reductions are deterministic; observed service wait differences are
  empirical, not a guaranteed production SLA.
- This intentionally bypasses workspace builds/tests; validation is workflow
  lint, Python syntax, real signatures, renderer smoke, notarization and
  Gatekeeper. Product topology tests do not apply to this non-mergeable branch.

Run: `gh workflow run release-exact.yml --ref experiment/notarization-timing`.
Reports are retained for 14 days. Do not publish generated `.app`, ZIP or DMG.

## Measured results — 2026-09-08

Evidence: `notarization-results.json` (seconds/bytes and Apple submission IDs).
Both rounds ran commit `7ef0e7cac`. All four submissions were Accepted, followed
by successful stapling, ticket validation and Gatekeeper assessment.

| Measurement | Full | Minimal |
| --- | ---: | ---: |
| Regular files, excluding symlinks | 14,774 | 64 |
| App bytes (MiB) | 916.23 | 228.06 |
| Submitted ZIP (MiB) | 392.50 | 100.02 |
| Outer Developer ID signing, rounds 1 / 2 (s) | 2.410 / 2.045 | 0.878 / 0.397 |
| ZIP creation, rounds 1 / 2 (s) | 32.014 / 31.488 | 9.375 / 9.140 |
| Upload + submit, rounds 1 / 2 (s) | 22.565 / 17.020 | 8.176 / 9.390 |
| Apple wait, rounds 1 / 2 (s) | 169.014 / 181.301 | 36.575 / 44.034 |
| Repacked UDZO DMG, round 1 (MiB) | 481.25 | 109.54 |

Observed Apple-wait reduction: 78.4% and 75.7% (132.4s and 137.3s saved).
Round 1 measured steps, outer signing through final DMG, sum to 286.617s full
versus 69.706s minimal, excluding source download/extraction and minimal-only
renderer smoke. These are summed instrumented operations, not total CI wall time.

- [Round 1: both jobs passed](https://github.com/nexu-io/open-design/actions/runs/34228271858)
- [Round 2: all notarizations passed; minimal DMG failed](https://github.com/nexu-io/open-design/actions/runs/34228928057)

Round 2 minimal failed only at final `hdiutil create`: `Resource busy`, after
notarization/stapling/Gatekeeper all passed. Do not count its 7.403s failed DMG
attempt as a successful packaging time. No notarization was retried for this.
Round 1 provides the complete successful minimal DMG result. The earlier setup
run `34228069906` failed before signing because the temporary keychain was absent
from the search list; no Apple submission occurred and it is excluded.

Conclusion: two controlled pairs support a substantial benefit from keeping the
distributed app minimal while reusing signed Electron. They do **not** establish
an SLA, explain historical 15–20 minute waits, or isolate file count from bytes
and removed native content. This fixture is smaller than the real capsule POC;
the numbers are evidence for the direction, not exact capsule release forecasts.
The DMGs above are identically configured experimental repacks, not the original
release DMG (which used its own packaging settings). No release, tag, R2 upload,
update-channel write, PR, or notification was performed.
