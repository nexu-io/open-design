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
