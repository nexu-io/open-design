# Deep dive and fixes for engine-fixable failures (engineering-view failure rate)

Design doc (human/reviewer-facing). Implementation runbooks per slice are written separately at build time.

Status: proposed · Parent: #3408 · Upstream background: spec.md · Spec format: spec-battle

## Why · Why this matters

- **Use case**: After investigating #3408, failures were split into "product view (user-facing)" and "engineering view (engine-fixable)". **The engineering-view failure rate ~7% is the product reliability we can actually fix**, but it has been buried under the noisy overall ~22% number (user self-recovery + old versions).
- **Pain**: The largest engineering-view bucket is `process_exit`, where `execution_failed`(~4,489/week) is an opaque catch-all hiding real bugs; there is also a set of already-named real bugs (config, spawn, protocol). These are **our engine's responsibility and are fixable**.

## Sources · Verified facts

- **Repo**: `nexu-io/open-design` (main). `gh repo clone … && git checkout main`. Data: PostHog OpenDesign=420348 (`run_finished`) + Langfuse `us.cloud.langfuse.com`.
- **process_exit breakdown (7d measured)**: execution_failed 4,489 · terminated_unknown 535 · **agent_config_invalid 382** · fabricated_role_marker 310 · cli_not_installed 260 · agent_protocol_error 255 · exit_code 185 · **spawn_ebadf 66 / spawn_eperm 61 / spawn_enoexec 22** · signal_killed 22 · stdin_write_eof 20.
- **fix_config root cause (Langfuse measured)**: error `Error loading config.toml: unknown variant `default`, expected `fast` or `flex` in `service_tier``. In other words, the codex app wrote `service_tier="default"`, while the CLI only accepts `fast`/`flex`.
  - The normalizer at `apps/daemon/src/codex-config-normalize.ts:76` has a regex that **only matches `"priority"`** → `default` and other invalid values slip through (the comment at `:52-53` explicitly says unknown values are not handled). All 382/week are on current versions (0.10.1=282/0.10.0=56/0.11.0=42, not old-version noise).
- **execution_failed classification follow-up**: `apps/daemon/src/run-failure-classification.ts` (#4502 has split execution_failed by `runtime_close` into stream_error/exit_nonzero/fatal_rpc_error, in review). The real stream_error causes are often swallowed by opencode (see reference, requires Langfuse + possibly added logging on the opencode side).
- **Access prerequisites**: PostHog `phx_` key, Langfuse pk/sk.

## Goals / Non-goals

- **Goals**: Reduce the engineering-view failure rate: first fix the already-located concrete bug (fix_config), then continue splitting the opaque execution_failed bucket, find real causes, and fix them one by one.
- **Non-goals**: Product-view failures (auth/balance, user self-recovery); old versions (null, self-healing); TTFT definition (separate); AMR latency (separate project).

## Proposed design (slices ordered by immediate shippability)

### Slice 1 · fix_config: wildcard normalization for codex service_tier (ship first, small and certain)
- **Current state**: The normalizer only patches `priority→fast`; the measured leaked value is `default`.
- **Fix (decided after review)**: Change `normalizeCodexConfigContent` from "match `priority`" to "**any `service_tier` value not in the valid set {fast,flex} is removed** (the line is dropped so the Codex CLI uses its built-in default)". Removing — rather than forcing `fast` — is the smallest, safest assumption: it never downgrades a future-valid value the installed CLI would have accepted, and `default` semantically means "let the system choose" anyway.
- **Keep scoped**: Still only touch the service_tier line (anchor to line start + exclude comments/other keys' string values); preserve everything else; idempotent; atomic write.
- **Red spec & existing tests**: Use injectable `CodexConfigIO`, asserting that `service_tier="default"` (and any value not in {fast,flex}) gets its line removed, valid values (`fast`/`flex`) are unchanged, and comments / other keys are not touched. NOTE: the existing tests at `apps/daemon/tests/codex-config-normalize.test.ts:82-85` and `:165-170` currently assert that *unknown* `service_tier` values are left UNTOUCHED — that assertion encodes the very bug this slice fixes, so those tests are intentionally updated (not new coverage added alongside the old behavior).
- **Benefit**: Eliminates ~382/week current-version failures + avoids whack-a-mole if codex renames this again.

### Slice 2 · execution_failed deep dive (ongoing campaign)
- #4502 has split execution_failed by close reason (stream_error/exit_nonzero/fatal_rpc_error). Next steps:
  - Pull `langfuse_trace_id` for stream_error/exit_nonzero from PostHog → inspect real error shapes in Langfuse → add real pattern branches to `classifyRunFailure` (split opaque into locatable sub-causes).
  - opencode often swallows the true cause ("Unexpected server error") → evaluate adding structured logging in the opencode adapter (separate line, cross-opencode).

### Slice 3 · Named real bugs (outside execution_failed, directly fixable inside process_exit)
- **spawn_ebadf 66 / spawn_eperm 61 / spawn_enoexec 22(~149/week)**: child-process spawn failures. ebadf relates to the prior FD leak in #4100; check whether this is the same root cause (FD exhaustion), and inspect permissions/executable format for eperm/enoexec.
- **agent_protocol_error 255**: `json-rpc id N: Internal error` — inspect the ACP protocol layer.
- **fabricated_role_marker 310**: model fabricates a role marker and is blocked by the guard — evaluate retry behavior and whether it is model-specific.
- For each item, start with a red spec reproducing it, then fix; prioritize by volume × our-fault.

## Alternatives considered

- For fix_config, add another value mapping (default→fast) instead of a wildcard: rejected because it is whack-a-mole; the next codex rename would leak again. Wildcard normalization solves invalid values once.
- For execution_failed, add more daemon patterns without digging through Langfuse: rejected because adding patterns without knowing the real error shape is guessing; first dig into the actual cause.

## Risks & mitigations

- **fix_config wildcard false positive**: If an invalid value actually carries semantics, dropping it could change user intent → mitigation: the decided strategy is **remove-only** (delete any `service_tier` line whose value is not in {fast,flex} so the CLI falls back to its built-in default); we do **not** map to `fast`, because `default` already means "let the system choose" and remove-only never downgrades a future value the installed CLI would accept. Red specs cover "valid values unchanged / comments not touched".
- **execution_failed digging depends on Langfuse**: Trace retention is limited and opencode swallows some true causes → benefit has a ceiling; document that honestly and split as much as possible.
- **spawn bug may be environmental**: Some ebadf/eperm cases may be user-machine environment → attribute first, then decide whether we control it.
- No contract/migration risk (classification is additive; normalization only edits a local config file).

## Validation · Acceptance

- Slice 1: red spec goes red then green (`service_tier="default"`→normalized); watch current-version agent_config_invalid volume drop in production.
- Slice 2: share of execution_failed split into named sub-causes increases (visible in engineering-view dashboard).
- Slice 3: corresponding detail (spawn_*/agent_protocol_error) volume drops.
- Does not need #3545 QA gate (does not change model input/output).

## Reproduction

- process_exit breakdown: `SELECT properties.failure_detail, count() FROM events WHERE event='run_finished' AND properties.failure_category='process_exit' AND timestamp>=now()-INTERVAL 7 DAY GROUP BY 1 ORDER BY 2 DESC`
- fix_config true cause: from above, take `langfuse_trace_id` where `failure_detail='agent_config_invalid'` → Langfuse `GET /api/public/traces/{id}` → observations ERROR statusMessage (see `unknown variant 'default'`).
- Version split: add `GROUP BY properties.app_version` to confirm current versions (not old-version noise).

## Open questions

- ~~service_tier normalization: normalize to `fast` or remove the line?~~ **Resolved (review): remove the line** — smallest assumption, never downgrades a future-valid value.
- Is spawn_ebadf just residue/regression of the #4100 FD leak?
- In Langfuse, does the exit_nonzero sub-bucket of execution_failed contain extractable true causes, or are they swallowed too?
