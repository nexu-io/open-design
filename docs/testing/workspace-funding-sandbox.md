# Real local Workspace funding regression

This explicit sandbox lane preserves the VIEW-015 browser transitions observed
on OD `39b9966cd0fec6f5f0d1a3697ce4fcc6683de1af` and AMR
`885d2f8229d725768803db8b18058ae0f97e3bdb`. The original Home red evidence is
retained; the new cases have no skip, expected-failure, or relaxed draft oracle.
Tests must run on the selected new source before claiming its result.

This is separate from the normal hermetic UI pool. It requires an explicitly
leased disposable **loopback** AMR API/Link/Web environment with real PG/Redis,
an explicit compiled Vela CLI, and a controlled upstream provider. It does not
create or stop AMR, change pricing, recharge funds, or implement task concurrency.
It uses the repository's suite entrypoint and shared tools-dev lifecycle for one
independent OD namespace/data root per test. Daemon data paths follow the root
AGENTS.md data directory contract. It does not borrow normal developer data.

Run from `e2e`, after the normal workspace dependency/build preparation, through
the mandatory owner runner. The evidence directory must be a fresh, nonexistent
path under an existing private evidence parent:

```sh
OD_FUNDING_FIXTURE="$PRIVATE_FIXTURE" OD_FUNDING_RUN_ID="$SANDBOX_RUN_ID" \
OD_FUNDING_EVIDENCE_DIR="$NEW_PRIVATE_EVIDENCE" \
  pnpm exec tsx lib/playwright/funding-runner.ts
```

The config uses one worker and no retry; the three cases are independent and
can be selected individually with `OD_FUNDING_CASE=project`, `home`, or `dp`.
Direct Playwright execution fails before OD startup. Missing, expired, mismatched, or
non-private fixtures fail explicitly. Do not insert this lane into CI without
a disposable fixture provisioner. The normal config excludes this file, so
ordinary CI does not require private sandbox inputs.

The external JSON fixture is mode 0600 and is never committed:

```json
{
  "version": 1,
  "isolation": {
    "runId": "<exclusive run ID, same as OD_FUNDING_RUN_ID>",
    "expiresAt": "<future ISO timestamp>",
    "workspaceNamePrefix": "<unique disposable workspace name prefix>",
    "exclusive": true
  },
  "upstream": {
    "apiUrl": "<loopback API origin>",
    "linkUrl": "<loopback Link origin>",
    "webUrl": "<loopback console origin>",
    "amrSha": "<complete source SHA>"
  },
  "owner": {
    "sourceRoot": "<absolute canonical AMR checkout>",
    "sandboxName": "<exact named sandbox>",
    "ownerEnvPath": "<absolute 0600 server-owner capability JSON>",
    "runtimeReceiptPath": "<absolute 0600 server-owner runtime receipt JSON>",
    "helperSha256": "<canonical e2e/helper/e2e_ownership.py SHA256>"
  },
  "runtime": {
    "velaBin": "<absolute explicitly supplied executable>",
    "velaSha256": "<SHA256>",
    "openCodeBin": "<absolute explicitly supplied executable>",
    "openCodeSha256": "<SHA256>",
    "modelId": "<model routed to the controlled sandbox provider>"
  },
  "actor": {
    "controlKey": "<sandbox control key>",
    "userId": "<sandbox user>",
    "email": "<sandbox email>"
  },
  "spaces": {
    "funded": { "workspaceId": "<A>", "ownerMemberId": "<A owner>", "runtimeKey": "<A scoped key>" },
    "empty": { "workspaceId": "<B>", "ownerMemberId": "<B owner>", "runtimeKey": "<B scoped key>" },
    "dp": { "workspaceId": "<D>", "ownerMemberId": "<D owner>", "runtimeKey": "<D scoped key>" }
  }
}
```

The environment owner provisions three distinct Go spaces for the same Owner:
A has $100; B has $0 and both DP windows exhausted; D has $0 and both DP windows
available with `modelCovered === true` for the chosen model. Legitimate advisory
`fundingCheck: unknown` remains allowed for A/D. The runner verifies exact IDs/Owner memberships,
name prefix, real preflight verdicts, and executable hashes before the browser
workflow. `exclusive` and future timestamps alone are insufficient: the server
owner holds the real canonical target lock throughout the browser command.

The capability JSON contains only `E2E_DATABASE_URL`, `VELA_E2E_OWNER_TOKEN`,
`VELA_E2E_OWNER_LABEL`, `VELA_E2E_OWNER_KEY`, and `VELA_SANDBOX_NAME`. The server's
runtime receipt contains `name`, `database`, `targetKey`, `sourceRoot`, `amrSha`,
`urls: {api, link, web}`, `redisDb`, `guardianPid`, ISO `deadlineUtc`,
`helperPath`, and `helperSha256`. The runner
checks the actual canonical `sandbox/cli.py status <name> --json`, exact Git HEAD,
clean tracked source, both canonical control files' Git bytes, endpoints, database,
Redis DB, and inherited target digest. It then executes the real canonical
`e2e/helper/e2e_ownership.py verify-inherited` immediately before and in finally
after the entire browser command. Each OD case also checks before startup and
after cleanup. No new lock is acquired. Failed pre-verification starts no child;
failed post-verification rejects an otherwise green child as ownership-unverified.
The guardian must retain the whole-command budget plus cleanup reserve. The
runner cannot take over or stop the server owner's AMR environment.

Only safe identity/exit receipts are curated; database URLs and tokens never
appear there. Provisioning/provider isolation and the subsequent AMR all-key/
ledger audit remain the environment owner's job. Unit checks of the guard are
not evidence that a real live lease was held during any browser execution.

For Project and Home, only the delivery time of genuine OD billing responses is
controlled using `route.fetch`; their body bytes are unchanged and hashed. B's
actual response is completed in the browser and its insufficient dialog is
visible before A's older response is delivered. Both phases assert the original
page, exact draft, and zero new run; editability is required after dismissing
the modal. Background editability while the modal is open is diagnostic only.
Project creation and queue presence are
diagnostic records, not additional QA requirements. The Project case creates its own local project
and establishes its Recent entry before testing the real workspace switch.

The positive D case requires one correctly scoped HTTP 202 submission followed
by the actual persisted run reaching `succeeded`. It retains the complete run
events before cleanup and records whether `end_turn` appears, without imposing
that exact event serialization as a product requirement. Only an unfinished
test-created run is canceled during cleanup. Provider admission, actual CLI
completion and the canonical usage/DP-window/zero-cash reconciliation still
require the environment owner's independent readonly audit.
These three cases cover VIEW-015 slices; they do not mark the whole QA case passed.
Project and Home each map to step 1; D covers the browser/runtime portion of
step 2 and requires the separate accounting evidence before whole-case review.
Attachment preservation is not exercised in this response-order scenario.
The absence of POST /api/runs proves no new OD run was submitted through this
page; a separate AMR/provider/ledger audit is needed to rule out model requests
through every other path. The source cannot turn HTTP 202 into successful DP use.

Playwright traces and runtime scratch are local diagnostics and can contain
sandbox credentials. Review/redact them before any publication. Curated JSON
attachments omit control/runtime keys and user email. All created runtime
processes are stopped through the shared lifecycle in finally, after page close.


## Owner-coordinated Link capacity lane

The `concurrency-runner.ts` entrypoint borrows the same canonical server-owner
lease as the funding lane. It requires a fresh evidence directory and starts only
the repository browser spec plus the fixture's immutable server-owned test
coordinator. It does not start, stop, or repair AMR, change pricing, recharge funds,
or introduce application task concurrency.

The private funding fixture adds `concurrency.space` with the exact Owner actor,
`concurrency.member` with a different real membership/key, `holdModelId`, and
`coordinator` fields `helperPath`, `helperSha256`, `helperSourceSha`, and
`helperRepoPath`. The copied coordinator must match both its declared SHA256 and
the exact Git blob in the server repository. The runtime checkout HEAD and the
canonical receipt must still match the fixture's AMR source; the coordinator's
pure-test commit is separately recorded rather than silently changing that HEAD.

From `e2e/`, supply an existing exclusively leased private fixture and a new output
path, then run:

```sh
OD_FUNDING_FIXTURE=<absolute-private-fixture> \
OD_FUNDING_RUN_ID=<exact-fixture-run-id> \
OD_FUNDING_EVIDENCE_DIR=<new-absolute-output-directory> \
F04_SURFACE=home \
corepack pnpm exec tsx lib/playwright/concurrency-runner.ts
```

Omit `F04_SURFACE` to execute both Home and Project. Missing capability files,
expired canonical ownership, reused output paths, different principals, or a
coordinator source mismatch reject the command before browser startup. The
coordinator receives only the explicit fixture/output paths, run ID, a fresh
attempt UUID, selected surfaces, and fixture digest. Every hold/release marker
binds protocol `od-link-concurrency-v1`, run ID, attempt ID, tag, workspace,
surface, and fixture SHA256. Each surface retains separate immutable
`server-held-receipt.safe.json` and `server-released-receipt.safe.json` files.
The coordinator atomically writes each receipt before its matching marker and only releases request tags created for this exact attempt, even
on failure; it must never release all provider requests. Each marker hashes its
receipt; the UI verifies that receipt and requires 10 held requests or 0 remaining. An old `ready: true` file cannot release the browser.

The browser continues to require no run POST on refusal, original draft and real
attachment retention, no automatic submit after Link capacity release, and a
successful explicitly submitted run. The failed Project counterexample remains
an assertion failure. A successful subprocess, helper unit test, or delivered
commit alone is not whole F04/RUN-003 acceptance; the complete QA role/tier,
visual, and timing requirements still apply. Preserve original command failures
and record the actual tested product/test commits on every real execution.

The private `concurrency.serverControl` additionally binds a dedicated controlled
provider origin, private PID/port state, source file/SHA256, a 0600 plain-text
control-token file, and the canonical sandbox Redis container/prefix. Provider
control calls require that token; model calls still go through actual Link with
the Owner/Member runtime keys. No control token is recorded in receipts or argv.
The browser verifies the authoritative workspace snapshot is the intended Go
space before using the Go10 capacity witness; legacy summary fields are not used
to fabricate that precondition.

For F04 step 2's explicit single-call recovery check, add `F04_RELEASE_ONE=1`
and `F04_SURFACE=home` to the same canonical concurrency runner command. This
keeps nine real Link requests held while checking draft and attachment retention,
no automatic submission, and a successful explicit manual send. The separate
hashed `server-one-released-receipt.safe.json` proves the intermediate count of
nine; the final released receipt proves cleanup to zero. It does not cover the
remaining tier/surface matrix, visual requirements, or RUN-003 timing targets.

`OD_FUNDING_CASE=view020` runs the real member/admin insufficient-funds notice
layout case through the same canonical owner runner. Run it once for each of
separate admin and member version2 fixtures; a single role does not pass the
whole QA case. Each fixture includes `noticeLayout` with the actual long Owner
profile and the path/digest of its environment owner's private read-only profile
proof. The proof binds the current AMR SHA, empty workspace, Owner identity/name,
and actual actor membership/role. No Owner name is injected into the UI.

The matrix uses empty and existing-artifact projects, English and Simplified
Chinese, the established 1280×800 baseline and a 375×812 narrow window. It changes
the real stored locale preference and reloads the project, resizes the open
notice, and closes/reopens it. It covers visible/actionable contact-Owner copy
and close controls, stacking above project content, absence of purchase actions,
and no task start on dismissal. It does not impose F04's image/benefits checks,
all19locales, name interpolation, or initial-send admission as new VIEW-020
criteria. Both roles' screenshots, traces, profile/authorization evidence and
server-side no-usage review are required before whole-case acceptance.


## VIEW-021: actual Free gift and retained funds

`OD_FUNDING_CASE=view021` uses the same mandatory canonical runner and a private
version2 fixture with `freeWallet.retained` and `freeWallet.giftOnly`. These are
actual default personal spaces and separate real Owner sessions; they are not
team-header aliases. Each wallet includes a hashed private original-signup cookie
file and server-proven original gift/retained funds. The client keeps this phase's
simplified single balance card.

The lane checks the actual canonical phase1 console and client before/after
original-gift expiry:40.30→40.00 and0.30→0.00, Free onlyFlash and no new topup
actions. Both before sets are frozen before the repository-owned expiry helper
can run. The helper is bound by source/rawhash, canonical lease, fixture hash,
new run/attempt IDs, both exact workspace IDs and original gift IDs. For a
qualified natural-expiry check use `freeWallet.expiry.mode=natural_wait`: prepare
the original gifts' common near-future expiry before opening either UI, preserve
their three-day lifetime, then make no further funding-row changes. Before
evidence must show the client projection carries that same future expiry. The
helper waits for actual database time to cross it and refreshes the production
projection. Its receipt proves the original boundary, clock samples before and
after, and no funding-row writes after the before evidence. The retained cash,
global time, AMR lifecycle and model prices stay outside this operation. The
older controlled-age mode remains a diagnostic; advancing a date after clients
have cached a later expiry does not prove natural-crossing behavior.

`freeWallet.consoleUi` records the actual canonical served feature flag and
source proof. Only visible `seats-console-page`, exact scoped snapshot and wallet
DOM can satisfy console acceptance. A legacy console is explicitly blocked
configuration evidence, never phase1 UI acceptance. The command's exit0 can
mean a qualified client/API portion only; `VIEW021-exact-scope-results` and the
independent server/root review decide the full QA case. Original failures remain
frozen.

The fixed product HEAD is still mandatory. The single reviewed canonical seats-UI
opt-in infrastructure change may be declared as `owner.canonicalToolsOverlay`:
source3dfcdc6fb4f940f2955cfa4835315d4ee9f83c82 and exact raw/blob SHA256s
for `sandbox/cli.py` and `sandbox/app/docker-compose.yml`. The verifier requires
exactly those two tracked differences, checks all other tracked product files
unchanged and keeps the ownership helper equal to the fixed HEAD. This is not a
general dirty-checkout allowance. Missing overlay metadata retains the original
fully clean source guard.

A separate `OD_FUNDING_CASE=view021-after` continuation accepts the original
receipt path and SHA256 through `OD_FREE_WALLET_EXPIRY_RECEIPT` and
`OD_FREE_WALLET_EXPIRY_RECEIPT_SHA256`. It verifies the same fixture/run/workspace
binding, opens fresh real Owner clients and consoles, and records both after
amounts without repeating before or executing expiry. It cannot erase a prior
failed execution or turn a diagnostic into whole-case acceptance.

## WS-005: concurrent tasks retain their original workspace

`OD_FUNDING_CASE=ws005` selects the explicit canonical two-space lane. Its
private `scopeSwitch` Given binds the same real actor to A with 10 USD and B
with 20 USD, their original member identities, an original balance proof and a
repository-owned controlled upstream. A real HTTP DeviceAuthorization login
provides one `cli_device` runtime/control key pair for the whole flow, linked
by actual key hashes, approved authorization, and both active memberships in
the same private proof. Workspace switching never replaces that credential;
a workspace-bound `source=user` API key cannot stand in for an account login. The standard Go and Free fixtures keep
their existing assertions; this scenario does not infer membership tier from
the Coding Plan DTO.

The actual browser starts A, observes its main request held, navigates through
Home and the real workspace switcher to B, then submits B. The dedicated
upstream releases A only after this attempt's B main request actually arrives.
Auxiliary requests cannot satisfy that phase boundary. Existing prices and
allowlists stay fixed; every actual main and auxiliary charge must be included
in the task totals of 2 and 3 USD without assuming one auxiliary invocation.

The test records both persisted terminal runs, A 8 / B 17 authoritative balances,
the visible selected B row and current B context. Independent server review
must match every usage and unique ledger to the original run, workspace and
initiator. The environment owner remains the only fixture/route writer. A
shared auxiliary route may be borrowed only in the explicitly coordinated
window, with before/after snapshots and normal restoration; fault experiments
on the same environment must not overlap that route change.

### Free shared Link concurrency (QA RUN-013-CLIENT)

Use `corepack pnpm --filter @open-design/e2e exec tsx lib/playwright/free-concurrency-runner.ts`
with the existing private `OD_FUNDING_FIXTURE`, `OD_FUNDING_RUN_ID`, and a fresh
absolute `OD_FUNDING_EVIDENCE_DIR`. The runtime-only fixture carries actual
Owner/Observer DeviceAuthorization pairs, W1/W2, authoritative Free=3 policy
provenance, immutable repository helpers, and an already-owned canonical sandbox.
The command borrows its lease; it never allocates or starts AMR.

The independent observer uses the real authenticated workspace SSE and the
actual quota realtime health, while the initiating Home surface is blocked
before a project/run POST. Three actual Link model requests occupy the shared
pool. The owner coordinator releases exactly one, the browser observes the
original QA's real one-minute idle period, and manual submission rereads
concurrency and funding. W2 runs while W1 is full. A real invitation/acceptance
adds a W1 member, and a request by that member still encounters Link's shared
limit. Provider usage is controlled and positive; model prices and catalog
permissions stay unchanged. Per-phase immutable receipts, screenshots, HTTP
observations, real terminal runs, financial snapshots, and owned cleanup remain
in the evidence output. Offline guards do not establish QA acceptance.

### Manual retry after an actual Link refusal (QA RUN-002)

The same canonical `free-concurrency-runner.ts` command selects a separate
RUN-002 browser witness only when the private fixture explicitly carries
`freeConcurrency.manualRetry.caseKey = "server:RUN-002"` and its immutable
repository coordinator. It does not transfer a RUN013 passing result: the
RUN013 advisory block alone is insufficient for RUN002's actual Link refusal
precondition.

This lane reads the genuine two-of-three advisory response, holds only its
delivery until a third actual Link request arrives, and delivers the unchanged
bytes. The real project submission must then fail at Link, preserve its input,
and show the concurrency dialog. Exactly one held request completes; no task
restarts during a real minute. Manual submission rereads funds and concurrency,
starts one successful run and keeps every charge in its original scope.
Financial audit uses a fresh per-attempt baseline, preserving prior attempts'
funds and request history. UI signals and immutable receipt filenames occupy
disjoint namespaces. Original failures remain frozen; upgrades are the other
allowed trigger in QA, rather than a mandatory extra matrix for this release
branch.
