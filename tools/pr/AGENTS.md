# tools/pr

Follow the root `AGENTS.md` and `tools/AGENTS.md` first. This tool owns the maintainer PR-duty command surface for nexu-io/open-design.

## Owns

- Repository-specific triage and review preparation on top of `gh`.
- Lane derivation from touched paths (default / contract / skill / design-system / craft / docs / multi), per `docs/code-review-guidelines.md` §4.
- Forbidden-surface detection on diff paths (e.g. `apps/nextjs/`, `packages/shared/`), per `docs/code-review-guidelines.md` §2.
- Per-lane rule citations matching the hard lines in `docs/code-review-guidelines.md` §4.x and `CONTRIBUTING.zh-CN.md`, with source noted inline.
- Validation command derivation from touched packages, citing `AGENTS.md §Validation strategy`.
- Factual brief assembly: de-noised top files, bot-stripped reviews/comments, CI rollup, body preview.
- Script-level tag emission via `classify`, with each tag carrying a sharp, mechanical rule and a source token (see §Tag dictionary).

## Does not own

- `gh` configuration, GitHub credentials, or authentication.
- PR side effects (approve / request changes / merge / close). Side effects stay in `gh` invocations the maintainer runs explicitly.
- Branch checkout, local rebase, or push operations.
- Sidecar protocol, runtime topology, packaged release, or app business logic.

## Rules

- **Output is strictly factual.** Every line of human or JSON output must be either (a) data observed from `gh` / the diff / repository paths, or (b) a direct citation of a rule from this repo's own docs (`AGENTS.md`, `docs/code-review-guidelines.md §X`, `CONTRIBUTING.zh-CN.md`, etc.) with the source noted inline. Tools-pr **does not** emit risk verdicts (LOW/MEDIUM/HIGH), merge recommendations, or directive language (`should`, `must`, `do not`, `recommended`, `encouraged`, `suggested`). Judgment belongs to the reviewer who consumes the brief, not to the tool.
- Stay a *thin* wrapper. Each subcommand corresponds to a real PR-duty action; do not introduce abstractions that have no caller.
- Keep dependencies minimal: `cac` for subcommand parsing, no GitHub SDKs. Use `gh` via `node:child_process`.
- `gh pr list` with 12+ JSON fields returns HTTP 502 across this repo's open queue. Chunk `--json` selections into multiple smaller calls and join by PR number (`src/gh.ts:fetchOpenPrs`).
- Heavy chunks (`reviews`, `comments`) use cursor-paginated `gh api graphql` via `fetchPaginatedPrList` with `PR_LIST_PAGE_SIZE = 30`. Light chunks (`meta`, `stats`, `files`) stay on `gh pr list --json` — they're already cheap. The split keeps per-page node count low and lets `gh` retry pages individually when the upstream gateway flakes.
- Transient gateway errors (HTTP 5xx, `EAI_AGAIN`, etc.) trigger a minimum-touch retry inside `gh()` (two attempts at 1s + 2s backoff). Anything else (4xx, auth failure, schema rejection, JSON parse) surfaces immediately — retry must not mask real problems.
- Lane and forbidden-surface rules track `docs/code-review-guidelines.md`. When that document changes, update `src/lane.ts` in the same PR.
- Per-lane rules must point at the hard lines that already exist in the review/contribution docs, with the source cited inline — do not invent new requirements here.
- Output formats are stable contracts: human report is for terminal eyes, `--json` is for downstream agents and future subcommands. Adding/removing JSON fields counts as a breaking change for the JSON consumer surface.

## Tag dictionary (v1)

Each tag has a single mechanical rule. Adding new tags requires the rule to be expressible as one factual sentence, derivable purely from `gh` data + file paths, and unlikely to false-positive in legitimate use. Patterns that fail this test (e.g. `missing-test-changes`, `contract-no-consumer-update`, `bulk-author`) are intentionally not implemented — see `feedback_tools_pr_precise_boundaries` in maintainer memory for the exclusion list.

| Tag | Rule | Data source |
|---|---|---|
| `bot-only-approval` | `reviewDecision === "APPROVED"` and every review with `state === "APPROVED"` matches `isBotAuthored()` | gh.reviewDecision + latestReviews |
| `needs-rebase` | `mergeStateStatus ∈ {DIRTY, BEHIND}` | gh.mergeStateStatus |
| `forbidden-surface` | A touched path matches the regex set in `lane.ts:deriveForbidden` (AGENTS.md §Forbidden surfaces) | files + lane.deriveForbidden |
| `unlabeled` | The PR is missing at least one of the `size/`, `risk/`, `type/` label prefixes | gh.labels |
| `duplicate-title` | Another open PR by the same author has a byte-for-byte identical `title` | cross-PR titleIndexByAuthor |
| `non-ascii-slug` | A design-system root touched by the PR has a slug that fails `/^[a-z0-9-]+$/` | files + lane.DESIGN_DIR |
| `maintainer-edits-disabled` | `maintainerCanModify === false` | gh.maintainerCanModify |
| `org-member` | PR author's GitHub login appears in `gh api orgs/<repo-owner>/members` | gh REST orgs members list |
| `unresolved-changes-requested` | Any reviewer's latest review has `state === "CHANGES_REQUESTED"` | gh.latestReviews[].state |
| `stale-approval` | Any `APPROVED` review's `commit.oid` differs from current `headRefOid` | gh.latestReviews[].commit.oid + gh.headRefOid |
| `awaiting-author-response-24h` | Latest human-reviewer signal time is newer than the latest author signal time and is ≥ 24h ago | latestReviews + comments + commits |
| `awaiting-reviewer-response-24h` | Latest author signal time is newer than the latest human-reviewer signal time, ≥ 24h ago, and at least one human-reviewer signal exists | latestReviews + comments + commits |
| `awaiting-first-review-24h` | No human review or non-author non-bot comment exists, and `createdAt` is ≥ 24h ago | latestReviews + comments + createdAt |

**Signal-time definitions** (used by the three `awaiting-*` tags):

- *author signal* = `max(commits[].committedDate) ∪ max(comments[?author.login==prAuthor].createdAt)`
- *human-reviewer signal* = `max(latestReviews[?author!=prAuthor && !isBotAuthored].submittedAt) ∪ max(comments[?author!=prAuthor && !isBotAuthored].createdAt)`

The three `awaiting-*` tags are mutually exclusive by construction. Each of them also sets `tag.awaitingHours` — the integer hour count between the awaiting-window start (latest reviewer signal / latest author signal / `createdAt` respectively) and the classify-run moment. Downstream consumers use it to sort PRs within an awaiting bucket by actual stuck duration, or floor-divide by 24 for days.

### Rate-limit telemetry

`classify --all` records a `rate` object in the report and in the summary line so detector additions that quietly inflate API cost are visible immediately:

- `rate.before` / `rate.after`: GraphQL `rateLimit { remaining, limit, resetAt }` snapshots taken before and after the bulk fetch.
- `rate.cost`: `before.remaining − after.remaining` when both snapshots fall in the same reset window; `null` when the hourly window rolls over between snapshots.

Each snapshot itself costs 1 point; the two extra snapshot calls per `--all` run are negligible against the 5000-point hourly budget.

## Templates

`tools/pr/templates/*.md` holds **aesthetic references** for the recurring comment kinds surfaced by classify tags. Each file describes the beats the comment should hit and shows one exemplar phrasing in the maintainer's voice.

**Templates are not fill-in forms.** Do not `sed`-substitute placeholders and post the rendered text — repeated identical comments break the human-to-human tone we want to keep with contributors. Instead, for each post: read the template to absorb the tone, weave the PR-specific facts (author, awaiting duration, branch names, diff size) into a fresh comment that hits the same beats with locally adapted wording.

**Author-addressed comments adapt to the author's language.** For nudge / duplicate-ask / close-with-reason comments — i.e. anything @-mentioning a specific contributor in a private-feeling exchange — detect the author's preferred language before writing the comment:

```bash
gh pr view <num> --json body,comments,author --jq '
  .author.login as $a |
  ([.body, (.comments[] | select(.author.login == $a) | .body)] | join("\n"))
'
```

If the resulting text contains CJK characters (`grep -P "[\\p{Han}]"`), write the comment in Chinese; otherwise English. Broadcasting comments (PR descriptions, commit messages, review summaries visible to all reviewers) stay in English regardless. See maintainer memory `feedback_public_artifacts_english` for the full scope rule.

The frontmatter of each template lists the beats and the placeholder slots. Templates are intentionally text files maintained alongside the tool source, not generated by `tools-pr` — the tool itself stays side-effect-free.

Current templates:

| Template | Triggered by | Posted on |
|---|---|---|
| `duplicate-title-ask.md` | `duplicate-title` tag (same author, byte-for-byte identical title) | The older / more-iterated PR of the pair |
| `awaiting-author-nudge.md` | `awaiting-author-response-24h` tag, when `tag.awaitingHours ≥ 96` (≥ 4 days) | The PR; addressed to the author |
| `agent-review.md` | Bucket-3 high-value / high-risk technical PR review prep | Not posted; internal analysis artifact at `.tmp/tools-pr/reviews/<num>.md` |

## Operational playbook

Per classify tag bucket, the maintainer workflow. Each row is the minimum action — escalation (close, force-merge, etc.) is the maintainer's call.

### Direct merge (APPROVED + CLEAN, surgical)

1. Sanity-check the merge state:

   ```bash
   gh pr view <num> --json state,reviewDecision,mergeStateStatus,statusCheckRollup \
     --jq '{state, reviewDecision, mergeStateStatus,
            checks: [.statusCheckRollup[] | {conclusion, name: (.workflowName // .name)}]}'
   ```

   Expect `state=OPEN`, `reviewDecision=APPROVED`, `mergeStateStatus=CLEAN`, every check `SUCCESS`.

2. If `tools-pr classify <num>` includes `bot-only-approval`, verify the change is surgical (size/XS, single file, < ~30 lines, no boundary or contract surface) before proceeding. Judgment lives in maintainer memory (`feedback_bot_only_approval`), not in the tool.

3. Squash-merge per repo convention: `gh pr merge <num> --squash`.

4. Confirm: `gh pr view <num> --json state,mergedAt,mergeCommit --jq '{state, mergedAt, sha: .mergeCommit.oid[0:10]}'`.

### `duplicate-title`

1. Inspect both PRs to pick the older / more-iterated one (the author may want to preserve its history). Useful comparison:

   ```bash
   gh pr view <NUM> --json number,headRefName,commits,additions,deletions,createdAt,updatedAt
   ```

2. Read `templates/duplicate-title-ask.md` for tone and beat structure, then write a fresh comment that hits the same beats with the actual PR facts woven in (author login, both branch names, both commit counts, both diff sizes). Post to the older PR:

   ```bash
   # Write the composed comment to a scratch file, then:
   gh pr comment <older-num> -F /tmp/dup-ask-<older-num>.md
   ```

3. Wait for author response. If no response after 7d, close the older PR with `gh pr close <older-num> --comment "Superseded by #<newer-num>."`.

### `awaiting-author-response-24h` (long tail, ≥ 4 days)

1. Filter the classify report for the PRs that crossed the 96h threshold, **exclude `org-member` PRs**, and rank by `awaitingHours`:

   ```bash
   jq '[.byTag["awaiting-author-response-24h"][] as $n
        | .byNumber[($n|tostring)] as $tags
        | select($tags | map(.name) | contains(["org-member"]) | not)
        | $tags[]
        | select(.name=="awaiting-author-response-24h" and .awaitingHours >= 96)
        | {n: $n, h: .awaitingHours}]
       | sort_by(-.h)' .tmp/tools-pr/classify/<latest>.json
   ```

2. For each remaining PR, read `templates/awaiting-author-nudge.md` for tone, then compose a fresh comment that hits the same beats with the actual author login and human-formatted awaiting duration. Vary the wording slightly between PRs nudged in the same session (a contributor seeing identical pings across their notifications breaks the friendly-human feel).

3. Post: `gh pr comment <num> -F /tmp/nudge-<num>.md`.

4. Re-check the classify report in a follow-up run; the awaiting tag should clear once the author responds. If no response by 14d, escalate (a more direct stale-warning or close-after-warning).

### `org-member`

`org-member` is informational and pairs with the other operational tags rather than triggering its own GitHub action. When a PR carries `org-member` alongside `awaiting-*` / `duplicate-title` / `maintainer-edits-disabled` / etc., the run-of-the-mill GitHub-comment workflow does **not** apply — those communications are routed through the team's internal IM instead. See maintainer memory `feedback_org_members_im_channel` for the channel split (operational nudges → IM; substantive review feedback and decisions → GitHub).

Every operational playbook step that posts a public comment must filter `org-member` out first; the `awaiting-author-response-24h` flow above shows the canonical filter.

### `tools-pr assignment` — assigner-perspective ownership view

Read-only aggregation that pivots the open PR queue by assignee. For each currently-assigned PR per assignee, surfaces:

- **assigned-since**: `now − assignedAt`, where `assignedAt` is the latest `ASSIGNED_EVENT` for that assignee that has not been superseded by an `UNASSIGNED_EVENT` (fetched via `gh api graphql` timeline — only path that exposes it).
- **assigned-by**: the actor on that event. Marked `(self-assigned)` when actor == assignee.
- **idle-for**: `now − max(assignedAt, last assignee activity)`, where activity = commit / comment / review by that assignee.
- **state badges**: `reviewDecision`, `mergeStateStatus`, `draft` (only when non-trivial).
- **status / blockers**: composed from existing classify tags (`needs-rebase`, `unresolved-changes-requested`, `stale-approval`, `awaiting-*`, `bot-only-approval`). No new judgments.

Flow:

1. `gh issue/pr edit <num> --add-assignee <login>` is still the assignment action (tools-pr is read-only on this surface).
2. `pnpm tools-pr assignment` shows the resulting state grouped by assignee, sorted by idle-hours desc within each bucket.
3. Use `--user me` (or `--user <login>`) for one bucket, `--unassigned` to expand the un-owned tail.
4. `--json` for cron / digest consumption.

Timeline fetch uses the cursor-paginated graphql path (`fetchPaginatedPrList`) — same retry + page-size primitives as reviews/comments.

### Agent review (bucket-3 high-value / high-risk PRs)

For PRs that warrant a deep technical pre-review (contract lane PRs, large refactors, security-sensitive fixes, scope-mixed PRs flagged via classify, etc.), an agent produces an analysis brief under `.tmp/tools-pr/reviews/<num>.md`. The brief is an internal artifact for the maintainer's consumption — not a GitHub comment. If maintainer decides to post review feedback, a separate downstream step adapts findings to public-facing review text (typically rephrased to address the author directly, with the channel respecting `org-member` routing).

Flow:

1. Pull `tools-pr view <num>` for the structural brief and `gh pr diff <num>` for the patch.
2. Read `templates/agent-review.md` for tone + section pool, then compose for the specific PR (sections appear only when they carry signal — see `feedback_agent_review_shape`).
3. Write to `.tmp/tools-pr/reviews/<num>.md` (transient runtime artifact; this directory is not version-controlled and can be cleaned at any time).
4. Surface the brief to the maintainer; let them decide split / block / merge / IM / public-review.

Frozen-in-time exemplars covering three PR shapes live in `tools/pr/templates/examples/` (scope-expanded, clean contract feature, CHANGES_REQUESTED with prior human reviews) and are the canonical references for the style.

## Common commands

```bash
pnpm --filter @open-design/tools-pr typecheck
pnpm --filter @open-design/tools-pr build
pnpm tools-pr list
pnpm tools-pr list --bucket=merge-ready,approved-blocked
pnpm tools-pr list --lane=skill,contract
pnpm tools-pr list --author=xxiaoxiong --json
pnpm tools-pr view 1180
pnpm tools-pr view 1180 --json
pnpm tools-pr classify 1167                # single PR, stdout
pnpm tools-pr classify 1167 --json         # single PR, JSON stdout
pnpm tools-pr classify --all               # full queue, JSON file → .tmp/tools-pr/classify/<ts>.json
pnpm tools-pr classify --all --name daily  # override filename stem
pnpm tools-pr classify --all --print       # also dump JSON to stdout
pnpm tools-pr assignment                   # assigner-perspective queue view
pnpm tools-pr assignment --user me         # only my bucket
pnpm tools-pr assignment --unassigned      # expand the un-owned tail
pnpm tools-pr assignment --json            # JSON for cron / digest
```
