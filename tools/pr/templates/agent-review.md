<!--
Style reference: agent-produced PR review brief

This file is an aesthetic reference, not a fill-in form. When an agent
writes a PR review brief (typically to `.tmp/tools-pr/reviews/<num>.md` as
internal analysis for a human maintainer), read this guide for tone +
section pool, then compose for the specific PR. See maintainer memory
`feedback_templates_are_style_refs` and `feedback_agent_review_shape`.

The agent review is NOT a GitHub-posted comment — it's an internal
analysis artifact. A separate, downstream step would adapt findings into
public-facing review feedback if posting is decided.

## Tone

- Factual. Every claim cites a file:line, an AGENTS.md / code-review-
  guidelines.md / CONTRIBUTING.zh-CN.md rule, or PR metadata.
- No judgment words: skip "nice work", "looks clean", "should merge",
  "high risk". Risk severity comes from gh labels, not from the review.
- Suggestions section is maintainer-to-maintainer punchy advice, not
  author teaching. Bullets like "Ask the author to split: land the
  symlink fix standalone" beat "(a) consider splitting (b) leave it
  bundled (c) discuss".
- Concise. If a section has no signal beyond "everything ✓", omit it
  rather than fill the page with boilerplate compliance ticks.

## Section pool (pick what carries signal)

Section order, when included, is stable: Identification → Prior reviewer
findings → Findings → Suggestions → Validation. Most reviews only have
3-5 sections; never all of them.

### Identification (always)

PR metadata block. Title, author (note `(external)` vs org-member),
status (compose state flags: OPEN, REVIEW_REQUIRED / CHANGES_REQUESTED /
APPROVED, DIRTY / BLOCKED, draft), labels, lane + parenthetical note on
forbidden surfaces / public seams if any, diff totals.

### Prior reviewer findings (still applicable)

Only when `state=CHANGES_REQUESTED` AND prior human reviews carry concrete
flags. Summarize what each prior reviewer raised, distinguishing human
vs bot. Cite the relevant file:line. Don't re-derive their analysis —
just verify against the current head and reference.

### Findings / Observations

Substantive technical / scope / contract / security / test-coverage
observations beyond boundary-pass-through. Numbered subsections, each
worth its space:
- Skip a "boundary check" subsection when all rules pass quietly — fold
  the one-liner into the Identification's lane line instead.
- Skip a "current PR state" subsection when the only thing to say is
  "DIRTY, needs rebase" — that's already in Identification.
- Only spend space on the symlink-fix-is-clean kind of observation when
  it's actually load-bearing (e.g. it tells the maintainer which slice
  is ready to land in a split).

### Suggestions

Only when valuable maintainer-perspective advice exists. Punchy bullets
that state what to do and why in one breath. Self-check before writing:
1. Is this actionable for a maintainer right now?
2. Is it a fact-grounded direction, not "consider option (a) vs (b)"?
3. Can it be one sentence tighter?

### Validation expected

Pnpm command list derived from touched packages (matches `tools-pr view`
output), plus any manual smoke / regression test recommendation specific
to the change. Always useful unless the PR is trivial.

## Variables that drive shape

- **PR state**: drives whether "Prior reviewer findings" exists and
  whether to comment on state explicitly.
- **Lane**: drives which rule citations are relevant. Contract-lane
  reviews care about §4.2; skill/design-system reviews about §4.3-4.4.
- **Scope health**: a clean PR rarely needs a long Findings section. A
  scope-mixed PR justifies Findings as the largest section.
- **Author org membership**: noted in Identification line. Influences
  whether eventual human-facing communication should route through IM
  vs GitHub — that decision lives outside this review.

## Committed exemplars

These are not literal templates. They're frozen-in-time examples of the
style applied to three different PR shapes. See `tools/pr/templates/examples/`:

- `agent-review-1037-scope-expansion.md` — REVIEW_REQUIRED + draft + scope
  expansion: Findings is the largest section because there are three
  distinct changes to disentangle.
- `agent-review-1149-clean-contract.md` — REVIEW_REQUIRED + clean contract
  feature: Findings is short, Suggestions concentrate on edge cases
  (caps, docs, traversal regression test).
- `agent-review-1009-changes-requested.md` — CHANGES_REQUESTED + prior
  human reviews + security: Prior reviewer findings section carries most
  of the analysis weight; Findings adds two notes the prior reviewers
  didn't cover; Suggestions prescribes a concrete direction.

The differences in shape are the point. A homogenized 7-section template
applied to all three would dilute the signal density.

The exemplars are frozen historical snapshots (see the HTML-comment
header in each file) — they teach the style applied to a real moment,
not the live state of those PRs. Fresh runtime reviews land in
`.tmp/tools-pr/reviews/<num>.md` and are transient by design.
