# Linux App Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a publicly usable Linux AppImage release path for Open Design and close issue #709 only after beta and stable release evidence exists.

**Architecture:** Use the existing `tools-pack linux` AppImage lifecycle, the `release-beta` Linux workflow input, the stable workflow's `ENABLE_STABLE_LINUX` gate, and the existing R2 release metadata pipeline. Keep AppImage as the first public format, validate it on real Linux desktops before changing public install copy, and defer signing, updater metadata, and distro-specific packages to separate scoped work.

**Tech Stack:** Node 24, pnpm 10.33.2, GitHub Actions, `@open-design/tools-pack`, electron-builder AppImage, Cloudflare R2 release metadata, Vitest and packaged smoke reports.

---

## Current State

- Issue #709 asks for a Linux app.
- `tools-pack linux` already supports AppImage build, install, start, stop, logs, uninstall, cleanup, and headless lifecycle commands.
- `.github/workflows/release-beta.yml` can publish an unsigned Linux x64 AppImage to R2 when `enable_linux=true`.
- `.github/workflows/release-stable.yml` contains a Linux job gated by `vars.ENABLE_STABLE_LINUX == 'true'`.
- Linux stable release notes currently describe Linux AppImage packaging as optional through the stable Linux lane.
- `tools/pack/README.md` documents AppImage-first scope, extract-and-run behavior, optional system tools, FUSE caveats, sandbox caveats, containerized glibc compatibility, and explicitly deferred formats.
- PR #1204 is the packaged-client parity and smoke-coverage prerequisite for this follow-up. Do not dispatch a Linux beta from this plan while #1204 is still open or still reports `CHANGES_REQUESTED`, unless a maintainer links the replacement commit or PR that landed equivalent coverage on `main`.

## File Structure

- `.github/workflows/release-beta.yml` - beta Linux AppImage workflow dispatch path and R2 publish input.
- `.github/workflows/release-stable.yml` - stable Linux AppImage gate and stable publish path.
- `.github/scripts/release/assets/linux.sh` - Linux AppImage and checksum staging.
- `.github/scripts/release/r2/publish.sh` - R2 metadata and Linux artifact URL publication.
- `.github/scripts/release/r2/verify.sh` - R2 asset verification after publish.
- `.github/scripts/release/r2/summary.sh` - release summary surface, including Linux status.
- `.github/scripts/release/github/stable-notes.sh` - GitHub Release notes copy once Linux is stable-ready.
- `tools/pack/README.md` - maintainer and developer Linux lifecycle documentation.
- `README.md`, `README.zh-CN.md`, and `QUICKSTART.md` - public user install copy after stable evidence exists.
- `docs/plans/2026-05-15-linux-app-release-readiness.md` - this implementation plan.

## Acceptance Criteria

- A maintainer can run a Linux-only beta release from `main` and see a successful Linux build and R2 publish.
- PR #1204, or equivalent Linux packaged-client parity and smoke coverage, has landed on `main` before the Linux beta dispatch.
- The beta R2 metadata exposes a Linux AppImage URL and checksum URL under `platforms.linux`.
- The AppImage checksum verifies on a clean Linux host.
- The AppImage opens on at least Ubuntu 24.04 and one stable-distro target such as Debian 12 or Ubuntu 22.04.
- Manual smoke covers first launch, app window open, `od://` desktop registration when installed through `tools-pack`, logs, stop, uninstall, and cleanup.
- Stable Linux stays disabled until beta evidence is captured and reviewed.
- After stable evidence exists, public README and quickstart copy name Linux as an available download path.
- Issue #709 is closed only by the PR or release work that publishes the stable Linux artifact, not by this planning PR.

### Task 1: Reconfirm Baseline Before Release Work

**Files:**
- Read: `.github/workflows/release-beta.yml`
- Read: `.github/workflows/release-stable.yml`
- Read: `tools/pack/README.md`

- [ ] **Step 1: Sync local state to upstream main**

Run:

```bash
git fetch origin main
git switch main
git pull --ff-only origin main
```

Expected: `main` fast-forwards or reports "Already up to date."

- [ ] **Step 2: Confirm issue #709 is still open**

Run:

```bash
gh issue view 709 --repo nexu-io/open-design --json number,state,title,assignees,url
```

Expected: JSON shows `"number":709`, `"state":"OPEN"`, and title text requesting a Linux app.

- [ ] **Step 3: Confirm the #1204 prerequisite is landed**

Run:

```bash
gh pr view 1204 --repo nexu-io/open-design --json number,state,reviewDecision,mergeStateStatus,headRefOid,url
```

Expected: #1204 is merged, or a maintainer has linked a replacement commit or PR that landed equivalent Linux packaged-client parity and smoke coverage on `main`. If the PR is still open, still blocked, or still reports `CHANGES_REQUESTED`, stop after Task 1 and do not dispatch `release-beta`.

- [ ] **Step 4: Confirm release metadata read access**

Run:

```bash
gh api repos/nexu-io/open-design/actions/variables/CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN --jq .value
```

Expected: the command prints the public release origin URL. If GitHub returns HTTP 403, stop before release dispatch; the current actor cannot verify R2 metadata and needs a maintainer with repository-variable read permission to provide the release origin or run the verification.

- [ ] **Step 5: Confirm current Linux release primitives exist**

Run:

```bash
rg -n "enable_linux|build_linux|ENABLE_STABLE_LINUX|tools-pack linux|AppImage" .github/workflows tools/pack/README.md tools/pack/src
```

Expected: output includes `release-beta.yml`, `release-stable.yml`, `tools/pack/README.md`, and `tools/pack/src/linux.ts`.

- [ ] **Step 6: Confirm regular repo checks pass before release work**

Run:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm guard
ASTRO_TELEMETRY_DISABLED=1 corepack pnpm typecheck
```

Expected: all three commands exit 0.

### Task 2: Run a Linux-Only Beta Release

**Files:**
- Read: `.github/workflows/release-beta.yml`
- Read: `.github/scripts/release/r2/summary.sh`

- [ ] **Step 1: Dispatch a beta release with only Linux enabled**

Only run this step after Task 1 Step 3 confirms the #1204 prerequisite has landed and Task 1 Step 4 confirms release metadata read access.

Run:

```bash
gh workflow run release-beta.yml \
  --repo nexu-io/open-design \
  --ref main \
  -f enable_mac=false \
  -f enable_win=false \
  -f enable_mac_intel=false \
  -f enable_linux=true
```

Expected: GitHub accepts the workflow dispatch.

- [ ] **Step 2: Watch the beta workflow**

Run:

```bash
beta_run_id="$(gh run list --repo nexu-io/open-design --workflow release-beta.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run view --repo nexu-io/open-design "$beta_run_id" --json databaseId,status,conclusion,url
gh run watch --repo nexu-io/open-design "$beta_run_id" --exit-status
```

Expected: the most recent `release-beta` run exits successfully. The `Build beta linux x64` and `Publish beta release to R2` jobs are green.

- [ ] **Step 3: Inspect the beta Linux metadata**

Run:

```bash
release_origin="$(gh api repos/nexu-io/open-design/actions/variables/CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN --jq .value)"
curl -fsSL "$release_origin/beta/latest/metadata.json" | jq '.platforms.linux'
```

Expected: JSON shows `"enabled": true` and non-empty `artifacts.appImage` and `artifacts.sha256` URLs.

- [ ] **Step 4: Capture the beta evidence in the implementation PR**

Run:

```bash
gh run view --repo nexu-io/open-design "$beta_run_id" --log-failed
gh run view --repo nexu-io/open-design "$beta_run_id" --json databaseId,conclusion,event,headBranch,headSha,status,url
```

Expected: the first command prints no failed-step logs because the run succeeded; the second command prints the run URL and head SHA for the PR body.

### Task 3: Verify the Beta AppImage on Linux Desktops

**Files:**
- Read: `tools/pack/README.md`

- [ ] **Step 1: Download the beta Linux artifact and checksum**

Run on each Linux verification host:

```bash
release_origin="$(gh api repos/nexu-io/open-design/actions/variables/CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN --jq .value)"
linux_json="$(curl -fsSL "$release_origin/beta/latest/metadata.json" | jq -r '.platforms.linux')"
appimage_url="$(printf '%s\n' "$linux_json" | jq -r '.artifacts.appImage')"
sha256_url="$(printf '%s\n' "$linux_json" | jq -r '.artifacts.sha256')"
curl -fL "$appimage_url" -o open-design-linux-x64.AppImage
curl -fL "$sha256_url" -o open-design-linux-x64.AppImage.sha256
sha256sum -c open-design-linux-x64.AppImage.sha256
chmod +x open-design-linux-x64.AppImage
```

Expected: checksum verification prints `OK`, and the AppImage has executable permissions.

- [ ] **Step 2: Launch with extract-and-run**

Run:

```bash
OD_PACKAGED_NAMESPACE=issue-709-beta ./open-design-linux-x64.AppImage --appimage-extract-and-run
```

Expected: the Open Design desktop window opens and reaches the normal packaged app UI. Close the app from the window manager after the smoke check.

- [ ] **Step 3: Verify packaged logs exist after launch**

Run:

```bash
find .tmp -path '*issue-709-beta*latest.log' -type f -print
```

Expected: at least one `latest.log` path is printed for the beta namespace, or the verifier records the actual packaged log path shown by the launched app.

- [ ] **Step 4: Record host coverage**

Run:

```bash
printf 'os=%s\nkernel=%s\narch=%s\n' "$(grep '^PRETTY_NAME=' /etc/os-release | cut -d= -f2-)" "$(uname -r)" "$(uname -m)"
```

Expected: evidence includes one Ubuntu 24.04-class host and one stable-distro host such as Debian 12 or Ubuntu 22.04.

### Task 4: Exercise the Local Install Lifecycle

**Files:**
- Read: `tools/pack/README.md`
- Read: `tools/pack/src/linux.ts`

- [ ] **Step 1: Build a local AppImage with the release-compatible container path**

Run on a Linux machine with Docker:

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm exec tools-pack linux build \
  --namespace issue-709-local \
  --portable \
  --to appimage \
  --containerized \
  --json
```

Expected: JSON prints a Linux build result and a built AppImage path under `.tmp/tools-pack/out/linux/namespaces/issue-709-local/`.

- [ ] **Step 2: Install, start, inspect logs, stop, uninstall, and cleanup**

Run:

```bash
corepack pnpm exec tools-pack linux install --namespace issue-709-local --json
corepack pnpm exec tools-pack linux start --namespace issue-709-local --json
corepack pnpm exec tools-pack linux logs --namespace issue-709-local --json
corepack pnpm exec tools-pack linux stop --namespace issue-709-local --json
corepack pnpm exec tools-pack linux uninstall --namespace issue-709-local --json
corepack pnpm exec tools-pack linux cleanup --namespace issue-709-local --json
```

Expected: each command exits 0. Install writes an AppImage, desktop entry, and icon under XDG paths. Start reaches the packaged app. Logs return a `latest.log` path. Stop terminates the packaged process. Uninstall removes XDG install files. Cleanup removes namespace-scoped build/runtime state.

- [ ] **Step 3: Verify no namespace process remains**

Run:

```bash
pgrep -af issue-709-local
```

Expected: no process rows are printed after stop, uninstall, and cleanup.

### Task 5: Enable and Run Stable Linux After Beta Evidence

**Files:**
- Read: `.github/workflows/release-stable.yml`
- Modify: `.github/scripts/release/github/stable-notes.sh`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `QUICKSTART.md`

- [ ] **Step 1: Enable the stable Linux gate**

Run:

```bash
gh variable set ENABLE_STABLE_LINUX --repo nexu-io/open-design --body true
gh variable get ENABLE_STABLE_LINUX --repo nexu-io/open-design
```

Expected: the second command prints `true`.

- [ ] **Step 2: Select the validated nightly version for stable promotion**

Run:

```bash
release_origin="$(gh api repos/nexu-io/open-design/actions/variables/CLOUDFLARE_R2_RELEASES_PUBLIC_ORIGIN --jq .value)"
nightly_version="$(curl -fsSL "$release_origin/nightly/latest/metadata.json" | jq -r '.version')"
printf '%s\n' "$nightly_version"
```

Expected: the printed value is a non-empty nightly version string from the current release metadata.

- [ ] **Step 3: Dispatch the stable release**

Run:

```bash
gh workflow run release-stable.yml \
  --repo nexu-io/open-design \
  --ref main \
  -f channel=stable \
  -f nightly_version="$nightly_version"
```

Expected: GitHub accepts the workflow dispatch.

- [ ] **Step 4: Watch the stable workflow**

Run:

```bash
stable_run_id="$(gh run list --repo nexu-io/open-design --workflow release-stable.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run view --repo nexu-io/open-design "$stable_run_id" --json databaseId,status,conclusion,url
gh run watch --repo nexu-io/open-design "$stable_run_id" --exit-status
```

Expected: the most recent `release-stable` run exits successfully. The `Build release linux x64`, publish, R2 verification, and GitHub Release jobs are green.

- [ ] **Step 5: Update public copy after stable evidence**

Change the public docs to describe Linux availability only after Step 4 succeeds:

```markdown
Linux users can download the x64 AppImage from the latest Open Design release. The AppImage is the first supported Linux package format; `.deb`, `.rpm`, Snap, Flatpak, signing, and updater metadata are tracked separately.
```

Expected: `README.md`, `README.zh-CN.md`, and `QUICKSTART.md` mention Linux AppImage availability without implying `.deb`, `.rpm`, Snap, Flatpak, AppImage signing, or Linux auto-update support.

- [ ] **Step 6: Update stable release notes**

Change `.github/scripts/release/github/stable-notes.sh` so stable notes include Linux only when the stable Linux job succeeded and R2 verification produced a Linux AppImage URL.

Expected: stable release notes name Linux x64 AppImage assets when Linux is enabled, and do not mention Linux as a stable asset when `ENABLE_LINUX` is false.

### Task 6: Close Issue #709 With Release Evidence

**Files:**
- Modify: PR body for the stable-release documentation or release-readiness PR.

- [ ] **Step 1: Link the closing PR only after stable release evidence exists**

Use this line in the PR body for the PR that publishes stable Linux availability:

```markdown
Closes #709
```

Expected: the PR that updates public Linux availability auto-closes issue #709 on merge.

- [ ] **Step 2: Generate release evidence bullets for the closing PR**

Run:

```bash
beta_run_url="$(gh run list --repo nexu-io/open-design --workflow release-beta.yml --limit 1 --json url --jq '.[0].url')"
stable_run_url="$(gh run list --repo nexu-io/open-design --workflow release-stable.yml --limit 1 --json url --jq '.[0].url')"
printf '%s\n' \
  "- \`release-beta\` Linux-only run: $beta_run_url" \
  "- \`release-stable\` Linux-enabled run: $stable_run_url" \
  "- Ubuntu 24.04 AppImage smoke: checksum, launch, logs, close" \
  "- Stable-distro AppImage smoke: checksum, launch, logs, close" \
  "- Local install lifecycle: install, start, logs, stop, uninstall, cleanup"
```

Expected: the generated bullets contain two GitHub Actions URLs and the exact manual smoke evidence names to paste into the closing PR body.

## Out of Scope For Issue #709 Closure

- AppImage signing and public signature-verification UX.
- Linux auto-update feed generation such as `latest-linux.yml`.
- `.deb`, `.rpm`, Snap, and Flatpak packages.
- Adding Linux to the default PR CI matrix.
- ARM Linux artifacts.

## Validation For This Plan PR

Run before opening the planning PR:

```bash
git diff --check
corepack pnpm guard
ASTRO_TELEMETRY_DISABLED=1 corepack pnpm typecheck
```

Expected: all commands exit 0.
