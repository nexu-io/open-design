---
id: 20260522-pr-explore-agent
name: PR Explore Agent - Advisory Web E2E
status: designed
created: '2026-05-22'
---

## Overview

### Problem Statement

PR throughput is outpacing the maintainer pool's review bandwidth on
the "does this PR's claimed browser behavior actually land?" half of
review.

Existing deterministic E2E/visual checks cover predefined scenarios.
They do not read a PR body, infer the riskiest changed behavior, and
probe that behavior in a running app. This proposal adds an advisory
agent lane for that manual reviewer task.

### Goal

Add a per-PR advisory, manually-approved agent that:

- reads the PR body and diff;
- boots the PR's `apps/web` runtime inside Docker;
- uses host-side `expect-cli` to explore a small number of
  diff-implied browser cases;
- captures Playwright trace/video/screenshot artifacts;
- posts a reviewer-ready PR report with trace, verdict, concrete
  evidence, and E2E coverage suggestions.

The agent does not gate merge, replace deterministic E2E, or replace
the visual-regression workflows.

## Scope

P1 is intentionally web-only.

In scope:

- PRs touching `apps/web/**`.
- Root workspace inputs that can affect the web runtime:
  `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`.
- The sandbox workflow/script themselves:
  `.github/workflows/agent-pr-explore-sandbox.yml` and
  `.github/scripts/agent-pr-explore-sandbox.sh`.
- Manual workflow dispatch for a specific PR number.
- Advisory output only.

Out of scope for P1:

- `apps/landing-page/**` and its content sources. The landing page is
  a separate Astro runtime and must not be reported as verified by the
  `apps/web` sandbox. A follow-up should add a separate landing-page
  boot path or a two-pass surface router.
- `apps/daemon/src/**`, `packages/contracts/**`, and `od` CLI
  verification. The browser explorer cannot prove CLI/API contract
  behavior.
- The older `gh-aw` workflow path and STEP marker extractor. This PR
  deploys the self-hosted Docker sandbox path only.
- Auto-fix or patch-suggesting behavior.
- Merge-blocking enforcement.

## Security Model

The workflow uses `pull_request_target` only as a trusted orchestrator.
The workflow file and shell runner come from the protected base branch;
the PR head is fetched by exact commit SHA inside Docker.

The Docker sandbox receives:

- no repo/org secrets;
- no model credentials;
- no host `$HOME`;
- no `.ssh`, `.config`, `.codex`, or Claude/Codex credential files;
- no Docker socket.

Host-side `expect-cli` may use the operator's model/OAuth credentials,
but it receives only PR metadata, diff/body context, and the sandboxed
localhost URL. It must not run arbitrary host shell commands or expose
host files to untrusted PR code.

The workflow is environment-gated through GitHub's native
`agent-pr-explore` environment. Every run waits for a maintainer to
click Approve in the PR checks UI before the self-hosted runner starts
the expensive/sensitive portion.

## Runtime

### Workflow

`.github/workflows/agent-pr-explore-sandbox.yml` is the trusted
orchestrator.

It:

1. Triggers on matching `pull_request_target` events or manual
   `workflow_dispatch`.
2. Checks out trusted base scripts only.
3. Resolves PR number, author, head SHA, head repo, and base SHA.
4. Runs `.github/scripts/agent-pr-explore-sandbox.sh` on a
   self-hosted runner labeled `agent-pr-explore`.
5. Uploads artifacts.
6. Posts or updates one sticky PR comment.
7. For Looper-authored/managed users (`nettee`, `mrcfps`,
   `alchemistklk`, `Siri-Ray`), also posts or updates one inline review
   comment anchored to the first added line in the current diff.

### Sandbox Runner

`.github/scripts/agent-pr-explore-sandbox.sh`:

1. Validates PR metadata and required host tools.
2. Builds PR context from GitHub API/diff data.
3. Selects a small fixture when the diff maps to known web UI state.
4. Starts a Docker container from `node:24-bookworm`.
5. Fetches the PR head SHA inside Docker.
6. Installs dependencies using a host-mounted pnpm store cache.
7. Builds daemon/tools-dev, then boots:

   ```bash
   pnpm tools-dev run web \
     --namespace "agent-pr-<number>-<sha8>" \
     --daemon-port 17456 \
     --web-port 17573
   ```

8. Publishes the container web proxy to a host localhost port.
9. Runs host-side `expect-cli` against that URL.
10. Records smoke Playwright artifacts and writes the final report.

The workflow concurrency key is PR-number scoped with
`cancel-in-progress: true`, so a new push cancels older pending/running
exploration for the same PR.

## Deterministic Verifiers

Some changes are build/deploy behavior rather than browser interaction.
P1 includes a deterministic verifier for Vercel/static-export changes:

- `vercel.json`
- `apps/web/next.config.ts`
- `apps/web/tests/runtime/app-route-export.test.ts`

For those PRs, when no browser-observable files are touched, the runner
skips browser exploration and executes this inside the Docker checkout:

```bash
rm -rf apps/web/out apps/web/.next
OD_WEB_OUTPUT_MODE=server sh -c 'OD_WEB_OUTPUT_MODE= pnpm --filter @open-design/web build && test -d apps/web/out'
test -f apps/web/out/index.html
```

The deterministic result becomes the advisory verdict. The runner still
boots the app and captures smoke artifacts for reviewer debugging.

## Report Contract

The canonical reviewer-facing artifact is
`agent-pr-exploration-report.md`.

It always has this shape:

```markdown
## 🤖 Agent PR Exploration Report

### 🎬 Trace

[Open Playwright trace](...)

### ✅ Verdict: Pass

...

### 🧪 What Was Verified / Cases Tested

...

### 🔍 Concrete Evidence

...

### 🧱 E2E Coverage to Sediment

...
```

The trace section is first. The report must describe what actually ran;
it must not use "dry run" wording for real workflow output.

For normal browser exploration, the prompt asks the agent to return only
the markdown fragment below the trace section. The runner prepends the
real trace link after artifact upload. For deterministic verifier paths,
the shell script writes the same report structure directly.

The "E2E Coverage to Sediment" section is required. It should state
which deterministic test, fixture, mock, or CI smoke should be added if
the exploratory run found a repeatable behavior worth preserving.

## Artifacts

Artifacts are written under
`$RUNNER_TEMP/agent-pr-explore-sandbox/artifacts/`.

Important files:

- `agent-pr-exploration-report.md`
- `expect.log`
- `expect-exit-code.txt`
- `deterministic-verifier.log` when selected
- `playwright-smoke-trace.zip`
- `playwright-smoke-session.webm`
- `playwright-initial.png`
- `playwright-final.png`
- `playwright-trace-viewer.md`
- `playwright-trace-viewer.txt`
- `playwright-recording-summary.json`
- `docker.log`
- `sandbox.log`

The Playwright recording is a post-run smoke/debug artifact, not the
source of truth for the verdict. It overlays a reviewer HUD identifying
the fixture/verifier being replayed.

The recorder waits for a visible document plus a short UI-settle delay.
It intentionally does not use Playwright `networkidle`, because Open
Design keeps background connections active and `networkidle` creates
misleading trace timeout steps.

## R2 Trace Upload

When `OD_TRACE_R2_UPLOAD=1`, the host runner uploads selected artifacts
to Cloudflare R2 using these environment values:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_ORIGIN`

R2 credentials stay on the host and are never passed into Docker.

The default object prefix is:

```text
agent-pr-explore/pr-<number>/<head-sha>/
```

The public R2 origin must allow browser fetches from
`https://trace.playwright.dev` or `*` via CORS, otherwise the trace zip
may be public but the hosted trace viewer cannot load it.

## Operator Runbook

### GitHub Setup

Required repository/environment setup:

- `agent-pr-explore` environment exists.
- Environment required reviewers are configured.
- A self-hosted runner is available with labels:
  - `self-hosted`
  - `agent-pr-explore`
- Environment secrets:
  - `R2_ACCOUNT_ID`
  - `R2_ACCESS_KEY_ID`
  - `R2_SECRET_ACCESS_KEY`
  - `R2_BUCKET`
- Environment variable:
  - `R2_PUBLIC_ORIGIN`

### Mini / Runner Host

Install host prerequisites:

```bash
gh auth login
npm install -g expect-cli@0.1.3
command -v jq
docker info
```

The runner does not use mutable `expect-cli@latest` by default. If
`expect-cli` is not preinstalled, operators must either install the
pinned version above or explicitly set `OD_ALLOW_NPX_EXPECT_CLI=1` for
a one-off smoke run using the pinned npx fallback.

### Manual Local Smoke

Before or after merging, the Mac mini can run the same sandbox path
manually:

```bash
git clone git@github.com:nexu-io/open-design.git
cd open-design
git fetch origin pull/2604/head:agent-pr-explore-sandbox
git checkout agent-pr-explore-sandbox
RUNNER_TEMP=/tmp/od-agent-pr-explore-local \
  OD_EXPECT_TIMEOUT_SECONDS=1200 \
  .github/scripts/agent-pr-explore-local.sh <open-pr-number>
```

## Rollout

P1 is a controlled rollout:

1. Merge the sandbox workflow and scripts.
2. Register the mini as the dedicated `agent-pr-explore` runner.
3. Trigger `agent-pr-explore-sandbox` manually for 3-5 open PRs.
4. Verify runner stability, R2 trace links, sticky comments, and Looper
   inline comment behavior.
5. Expand reviewer approval volume only after the reports are useful and
   no isolation incidents occur.

Landing-page exploration, CLI/API exploration, deeper gh-aw integration,
and multi-surface routing are separate follow-up work.

## Success Criteria

- Maintainer can approve and run an exploration job manually.
- The PR code runs only inside Docker.
- No host credential is mounted or forwarded into Docker.
- The final report starts with a clickable Playwright trace link when
  R2 upload is configured.
- The report includes an explicit E2E coverage-sedimentation section.
- Looper authors receive an inline review comment thread in addition to
  the sticky top-level report.
- Non-Looper authors receive only the sticky top-level report.
- `expect-cli` non-zero exits preserve artifacts and are advisory, while
  sandbox/bootstrap failures fail the job.

## References

- GitHub Actions secrets and fork PRs:
  https://docs.github.com/en/actions/how-tos/security-for-github-actions/security-guides/using-secrets-in-github-actions
- Playwright Trace Viewer:
  https://trace.playwright.dev/
