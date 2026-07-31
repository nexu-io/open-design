---
name: clone-audit-mrlv3nl4
description: Audit cloned or reimplemented websites for fidelity gaps, tracking scripts, source-brand and language residue, placeholders, and risky external dependencies. Use before handoff or deployment, or when asked to review a website clone for cleanup and readiness.
---

# Clone Audit

Audit the requested website-clone workspace and produce an evidence-based
deployment-readiness report. Inspect the current target; never reuse findings
from an earlier project or run.

## Establish scope

1. Confirm the target root and the intended output language.
2. Identify any supplied source site, screenshots, design tokens, or other
   fidelity references. If none are available, mark visual fidelity as not
   checked instead of guessing.
3. Inventory relevant HTML, CSS, JavaScript or TypeScript, assets, metadata,
   configuration, and dependency manifests. Respect explicit exclusions.
4. Prefer static inspection. Do not execute untrusted project code, install
   packages, or make network requests unless the user authorizes it.

Treat `references/source-1-CLONE_AUDIT.md` only as historical provenance. Do
not copy its paths, counts, or findings into a new audit unless the current
target independently confirms them.

## Run the checks

Inspect each category and record the evidence used:

1. **Fidelity assets and styles** — compare against supplied references for
   missing or substituted fonts and images, broken asset paths, incorrect
   colors, and materially different layout or styling.
2. **Tracking scripts and pixels** — find analytics, tag managers, advertising
   pixels, telemetry beacons, and unexpected third-party scripts.
3. **Source-brand residue** — find source brand names, domains, metadata,
   social links, asset paths, comments, and copy that should have been replaced.
4. **Language residue** — find unintended text in languages outside the target
   locale, excluding code identifiers and legitimate proper nouns.
5. **TODOs and placeholders** — find TODO or FIXME markers, lorem ipsum,
   template copy, dummy links, test credentials, and unfinished states.
6. **External dependencies and link risk** — inspect remote URLs, CDNs,
   localhost or development endpoints, external fonts and media, package
   downloads, and dependencies that may fail, leak data, or violate deployment
   constraints.

Open the surrounding context before reporting a match. Deduplicate repeated
instances that share one root cause, but list every affected file or meaningful
location.

## Classify evidence

For every finding, include:

- severity: `blocker`, `high`, `medium`, or `low`;
- a repository-relative `file:line` location when available;
- the matched identifier or a short, non-sensitive excerpt;
- why it matters; and
- a concrete recommended action.

Keep these states distinct:

- **Confirmed finding** — directly supported by inspected evidence.
- **Checked; none found** — the category was inspected and no issue was found.
- **Not checked / unverifiable** — required context, reference material, or
  access was unavailable.

Never turn an unverified suspicion into a confirmed finding. Do not expose
machine-local absolute paths, secrets, tokens, or personal data in the report.

## Produce the report

Use this structure:

```markdown
# Clone Audit

## Scope and coverage
- Target: <portable project label or repository-relative path>
- Fidelity reference: <provided, not provided, or unavailable>
- Exclusions or limitations: <items or none>

## Findings
### <category>
| Severity | Evidence | Why it matters | Recommended action |
| --- | --- | --- | --- |
| <level> | `<relative/file:line>` — <identifier> | <impact> | <action> |

## Checked; none found
- <category>

## Not checked / unverifiable
- <category>: <reason>

## Deployment readiness
<Ready, ready with follow-ups, or not ready> — <brief evidence-based reason>
```

Use **not ready** when confirmed unresolved findings can break the deployed
experience, expose tracking or sensitive data unexpectedly, or leave material
source-brand or placeholder content. Otherwise state any follow-ups and explain
why they do or do not block deployment.
