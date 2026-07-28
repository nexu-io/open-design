# Handoff — Open Design / ACP permission-gating scoping — 2026-07-27

## Goal

Scope the ACP `session/request_permission` human-approval gate (added earlier
tonight in commit `0cd288be0`) down to Hostinger MCP tool calls only, so
routine ACP tool calls (`write_file`, `read_file`, `execute_code`, any
non-Hostinger MCP tool) go back to instant auto-approve instead of blocking
for up to 55 seconds with no way for a user to answer the prompt.

## Current state

**Uncommitted**, on branch `fix/acp-permission-auto-approve`, on top of
`0cd288be0`. Working tree is otherwise clean except for unrelated
pre-existing changes (`apps/web/next-env.d.ts`, `package.json`,
`pnpm-lock.yaml`, untracked `od-host-start.sh` / `od-host-stop.sh`) that this
session did not touch.

What works now:

- `apps/daemon/src/acp.ts`'s `replyPermission()` checks a new
  `isHostingerAcpToolCall(params)` helper first.
  - If **not** a Hostinger tool call → `chooseAutoApprovedOptionId()` picks an
    allow option instantly (approve_for_session → allow_always → allow_once),
    exactly matching pre-`0cd288be0` behavior. If no allow option exists, the
    whole ACP session fails immediately (same as before tonight's fix — no
    silent deny, no hang).
  - If it **is** a Hostinger tool call → unchanged: pushes a
    `permission_request` SSE agent event, waits up to `PERMISSION_ANSWER_TIMEOUT_MS`
    (55s) for `POST /api/runs/:id/permission`, denies (never allows) on
    timeout or missing `runId`.
- `pnpm typecheck` — clean (exit 0).
- `pnpm guard` — clean (60/60).
- `apps/daemon/tests/acp.test.ts` — 45/45 passing, including 3 new tests
  added this session (see Artifacts).
- Live `tools-dev` daemon+web (`namespace: default`) restarted and healthy:
  `GET /api/health` → `{"ok":true,"version":"0.11.0"}`;
  `POST /api/runs/:id/permission` on a bogus run id → `404 NOT_FOUND` as
  expected (route still wired correctly post-restart).

What does NOT work / was not attempted:

- No full live Hermes agentic run was driven end-to-end through the web UI
  this session. Reproducing the exact plugin-approval config that gated
  routine edits ("Approve edit: <file>") in tonight's earlier test run would
  require external Hermes plugin config this session didn't have in hand.
  Verification instead used `attachAcpSession`/`resolvePendingAcpPermission`
  directly (the real production functions) with realistic payloads captured
  from the actual run logs of tonight's live testing.
- `apps/web` still has no UI that renders `permission_request` — unchanged
  gap, carried forward from `0cd288be0`.
- Desktop app (`apps/desktop`) is not running in this environment — `pnpm
  tools-dev restart` (all apps) fails on it ("Electron failed to install
  correctly"), but desktop was already idle/not running before this session
  started, so this is not a regression from this change. Daemon+web restart
  (the two apps that matter for this fix) succeeded via `pnpm tools-dev
  restart daemon` then a full `pnpm tools-dev restart` once Electron's
  failure was understood to be pre-existing and unrelated.

## Decisions made

- **Scope the gate to Hostinger tools, not all ACP tool calls.** Rationale:
  the universal version from `0cd288be0` blocked routine file edits with no
  way to answer the SSE prompt in time (no `apps/web` UI exists yet for it) —
  every ordinary run stalled ~55s then failed closed. Hostinger's MCP tools
  are the one tool family that can delete real production infrastructure
  (VMs, firewalls, domains, mailboxes, …) today, so they're the one family
  that actually needs human-in-the-loop gating right now.
- **Detect "Hostinger tool call" via a regex over `toolCall.title` /
  `rawInput.description` / `rawInput.command`, not a structured field.**
  Rationale: ACP's `session/request_permission` has no dedicated tool-name
  field. Confirmed against real Hermes run logs (see below) that Hermes'
  plugin-approval title format embeds the fully-qualified MCP tool id
  verbatim (`mcp__hostinger__VPS_deleteFirewallRuleV1`) inside the free-text
  title — that's the only available signal, so `extractAcpToolName()`
  extracts the first `mcp__<server>__<tool>`-shaped token it finds and
  `isHostingerAcpToolCall()` checks it starts with `mcp__hostinger__`.
- **Restore the exact pre-fix auto-approve logic for everything else**, not
  a new/different auto-approve heuristic. `chooseAutoApprovedOptionId()` is a
  verbatim copy of the old (pre-`0cd288be0`) `choosePermissionOutcome()` body,
  including its "fail the whole session if no allow option is found"
  behavior — deliberately not softened to a silent deny, to keep behavior
  identical to before tonight's fix.
- **Full universal gating (every ACP tool call routed through human
  approval) is still the eventual goal**, once a real approval UI exists in
  `apps/web` to render `permission_request` and answer it within a
  reasonable time. This scoping-down is an interim step, not a reversal of
  direction.
- **Did not commit.** This is a working-tree change awaiting review; commit
  policy for this repo also forbids `Co-authored-by` trailers (see root
  `AGENTS.md`).

## Next steps

1. Review the diff in `apps/daemon/src/acp.ts` (see Artifacts) and decide
   whether to commit as a follow-up to `0cd288be0` on
   `fix/acp-permission-auto-approve`, or squash into it.
2. When ready to widen the gate back to all ACP tool calls, build the
   `apps/web` UI surface for `permission_request` first (a real approval
   card, not just an SSE event with no renderer) — see "Known gap" in
   `0cd288be0`'s commit message and repeated here. Only then revisit
   `isHostingerAcpToolCall()` and consider removing the scoping.
3. If more tool families need the same treatment as Hostinger in the
   meantime (i.e. gated-but-UI-less), extend `isHostingerAcpToolCall`-style
   detection rather than reopening the gate universally — e.g. generalize to
   an allowlist of `mcp__<server>__` prefixes.
4. Consider hardening `extractAcpToolName()`'s regex-over-free-text approach
   if a cleaner structured tool-name field ever appears in ACP's
   `session/request_permission` payload (would remove reliance on Hermes'
   specific title-formatting convention).
5. No live end-to-end Hermes run was done this session — if that matters
   before merging, drive one manually via the web UI at
   `http://127.0.0.1:7456` against the restarted daemon (currently pid
   varies per restart; check `pnpm tools-dev status --json`).

## Active files

- `apps/daemon/src/acp.ts` — the actual fix. New: `extractAcpToolName()`,
  `isHostingerAcpToolCall()`, `chooseAutoApprovedOptionId()`. Changed:
  `replyPermission()` now branches on `isHostingerAcpToolCall(params)` before
  deciding auto-approve vs. pending-decision flow. Comments above
  `PERMISSION_ANSWER_TIMEOUT_MS` and on `AttachAcpSessionOptions.runId`
  updated to explain the scoping.
- `apps/daemon/tests/acp.test.ts` — 3 new tests added (see Artifacts),
  plus a new import of `resolvePendingAcpPermission`.
- `apps/daemon/AGENTS.md` — daemon-specific conventions (route layout,
  test layout, runtime/agent change rules) that governed how this change
  was structured; no edits needed, already followed.
- Root `AGENTS.md` — "Bug follow-up workflow" section describes the
  red-spec-first playbook this session partially followed (tests were
  added alongside the fix rather than strictly red-before-fix, since the
  fix's exact shape was specified up front).

## Skills to activate

None required beyond normal daemon-code conventions in
`apps/daemon/AGENTS.md`. If continuing into building the `apps/web`
`permission_request` UI (next step 2 above), that work will touch
`apps/web/src/components/` and should follow the "Web CSS ownership" and
"Web component reuse" sections of the root `AGENTS.md`.

## Context that would be lost

- The real Hostinger permission-request payload shape was reconstructed by
  reading `.od/runs/def4c121-c33b-4da3-8100-7c8b4a474c5f/events.jsonl` (and
  siblings `db47281c…`, `e4305d80…`) from tonight's actual live testing —
  these are real daemon run logs in the working tree, not fixtures. They
  show the exact `permission_request` title Hermes sends for a Hostinger
  call: `"Hostinger tool call requires approval:
  mcp__hostinger__VPS_deleteFirewallRuleV1({...}):
  <mcp__hostinger__VPS_deleteFirewallRuleV1> (plugin approval rule)"`, and
  for a routine edit: `"Approve edit: variation-white-purple-gold.html"`.
  These same logs also directly prove the bug this session fixes: the
  routine "Approve edit" requests in `6abbab3a…`, `c1943faf…`, `d8d9dde1…`
  all resolved to `"choice": "deny"` — i.e. real routine edits were getting
  denied/timed out by the universal gate before this fix.
- `pnpm tools-dev restart` (all apps) requires Node ~24; this shell's
  default `node` is v22.22.1. Had to `source ~/.nvm/nvm.sh && nvm use 24`
  before any `tools-dev` command that starts/restarts processes (`status`
  alone tolerated Node 22 without erroring on the version check, but
  `restart`/`start` do not).
- Restarting only `daemon` (not `web`) left `web`'s daemon-proxy target
  pointed at the old (now-dead) daemon port — `trustedWebOriginPort` went
  `null` and the daemon picked a new ephemeral port. Had to restart both
  together (`pnpm tools-dev restart` with no app arg) to get them back in
  sync. If iterating further on this fix, always restart with no app arg
  (or restart daemon then web) rather than daemon alone.
- `chooseAutoApprovedOptionId()` deliberately does **not** send a
  `{outcome: 'cancelled'}` RPC response when no allow option is found — it
  calls `fail()` instead, which never sends a JSON-RPC response back to the
  child at all (matches pre-`0cd288be0` behavior exactly). Don't
  "fix"/harmonize this to match the Hostinger branch's `respond(null)` →
  `cancelled` behavior; they're intentionally different because one path is
  "restore old behavior exactly" and the other is a new, different code path.

## Artifacts

- Diff: `git diff -- apps/daemon/src/acp.ts apps/daemon/tests/acp.test.ts`
  in this working tree (uncommitted).
- New tests in `apps/daemon/tests/acp.test.ts` (search for `isHostingerAcpToolCall`
  in the surrounding comment to locate them quickly):
  - `attachAcpSession auto-approves a non-Hostinger ACP permission request (routine file edit)`
  - `attachAcpSession routes a Hostinger ACP permission request through the human-approval flow`
  - `attachAcpSession fails a Hostinger ACP permission request closed (deny) if no human answers in time`
- This file.
