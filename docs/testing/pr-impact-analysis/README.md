# PR impact analysis rules

This directory is the reviewable source of truth for PR impact analysis. The
rules are advisory data for a future bot/check that can classify PR risk,
recommend affected E2E coverage, and route high-impact changes to manual QA.

The first version is intentionally small and focused on P0 UI flows. Do not turn
these rules into a hard merge gate until the matching P0 E2E suite is stable and
the false-positive rate has been reviewed for at least one release cycle.

Settings, execution configuration, BYOK/provider setup, connector auth, local CLI
fallback, and the `settings-connectors` shard are intentionally not modeled in
this initial dataset. They are the next P0 capability group to add after this
composer/runtime/design-files/home-entry slice is calibrated.

## Files

| File | Purpose |
| --- | --- |
| [`capabilities.json`](./capabilities.json) | Product capability inventory, weighted path evidence, and tier policy. |
| [`e2e-coverage.json`](./e2e-coverage.json) | Machine-readable mapping from changed code areas to related E2E shards/tests and validation commands. |
| [`owners.json`](./owners.json) | Validation ownership and manual QA routing. |

These files deliberately stay under `docs/testing/` instead of a workflow-only
location so policy changes are reviewed with the product/test context that they
affect.

## Classification model

- `tier-0`: documentation or isolated low fan-in changes. Run normal CI only.
- `tier-1`: ordinary product/runtime changes. Recommend related tests, but do
  not block on manual QA by default.
- `tier-2`: high-impact changes that touch a P0 capability, cross UI/runtime
  boundaries, or modify code covered by P0 UI E2E without matching test evidence.
  Require the mapped P0 UI E2E and manual QA approval before merge once the gate
  is enabled.

The analyzer should be deterministic first:

1. read the PR file list and diff metadata;
2. match `pathGlobs` and `testPathGlobs` from `e2e-coverage.json`;
3. map coverage records back to capabilities in `capabilities.json`;
4. read validation commands from `e2e-coverage.json` and validation owners from
   `owners.json`;
5. emit a PR report with the tier, matched evidence, required commands, and
   manual QA checklist.

Glob matching should use repository-root-relative POSIX paths. Treat `*` as one
path segment and `**` as recursive. Analyzer output should include each matched
glob, its configured weight, and whether the match came from a direct capability
path or a broad safety-net path.

LLMs may summarize evidence, flag ambiguous changes, or draft manual QA steps.
They must not be the sole authority for downgrading a tier, removing a required
test, or approving a high-impact PR.

## Initial P0 capability scope

The initial P0 list follows the quality-left-shift plan:

1. Composer menu/state machine
   - menu actions
   - attachment staging
   - inline mentions
   - plugin/skill insertion
   - run payload assembly
2. Runtime recovery/interruption flow
   - run lifecycle
   - stream reattach
   - interrupt/stop
   - conversation persistence
   - local failure recovery
3. Design Files folder/file picker flow
   - upload/manage
   - working-directory picker
   - preview tabs
   - view-state persistence
4. Home `@` selector / starter-to-run flow
   - entry selector
   - required inputs
   - project transition
   - first-run payload

Known Phase 2 follow-up groups:

- Settings / execution configuration
- BYOK and provider setup
- Connector authentication and registry-backed setup
- Local CLI fallback and AMR onboarding edges not already covered by runtime
  recovery

When adding a P0 capability, update all three rule files in the same PR:

1. add or update the capability record;
2. add coverage records that map code areas to E2E tests/shards;
3. add validation ownership, including the manual QA role when required.

## Evidence expected from a future analyzer

A PR report should prefer structured evidence over prose:

```text
Tier: tier-2
Matched capability: composer-inline-mentions
Matched group: composer-menu-state
Matched files:
- apps/web/src/utils/inlineMentions.ts
Required validation:
- pnpm -C e2e exec tsx scripts/ui-p0-shards.ts project-workspace
Manual QA:
- role: p0-ui-qa
- required: true
Reason:
- changed code in a P0 UI capability coverage zone
- capability confidence: high
- matched path weight: 5
```

## Maintenance rules

- Keep mappings specific enough to avoid recommending all E2E tests for most PRs.
- Prefer sub-capability records over broad group records. Groups exist for
  reporting and ownership roll-up; analyzer matches should use leaf capability
  IDs when possible.
- Keep `confidence`, `reason`, and weighted path evidence current so reviewers can
  tell whether a recommendation is direct coverage or a broader safety net.
- Keep capability validation commands only in `e2e-coverage.json`; do not duplicate
  them in `capabilities.json`.
- Keep global risk signals actionable: a signal that can raise a PR to `tier-2`
  should also include validation guidance and, when human review is expected, an
  owner role.
- Prefer existing package-scoped commands; do not add root `pnpm test` or
  `pnpm build` aliases for this workflow.
- Keep this as data. CI wiring and bots should consume these files rather than
  duplicating the rules inline.
- If a test is renamed, update `docs/testing/e2e-coverage/` and this directory in
  the same PR.
- Store runtime facts such as flaky rate, PR labels, approvals, and override
  records outside the repository; only durable policy belongs here.

## Local tooling

Validate rule consistency:

```bash
pnpm exec tsx scripts/pr-impact-analysis.ts validate
```

Run the advisory dry-run analyzer against explicit paths or stdin:

```bash
pnpm exec tsx scripts/pr-impact-analysis.ts analyze apps/web/src/utils/inlineMentions.ts
git diff --name-only main...HEAD | pnpm exec tsx scripts/pr-impact-analysis.ts analyze
git diff --name-only main...HEAD | pnpm exec tsx scripts/pr-impact-analysis.ts analyze --json
```

The analyzer is deterministic and advisory. It can raise risk and recommend
validation, but it does not approve overrides or replace reviewer judgment.
