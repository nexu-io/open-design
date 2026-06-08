# `@open-design/tools-link-check`

> Auditor for `.od/projects/*/` — surfaces dead cross-page references, `artifact.json` schema violations, and orphan HTML files.

This is a **stop-gap** for the editor's append-only workflow. See the linked GitHub issue for the root-cause discussion and the long-term fix proposals.

## What it catches

| Class | Symptom | Example |
|-------|---------|---------|
| **Dead references** | HTML links to a non-existent sibling file | `<a href="detail.html">` but only `detail-9-2.html` exists |
| **Schema: multi-primary** | Multiple `artifact.json` files claim `primary:true` | 10/10 files in a project all flag themselves as primary |
| **Schema: entry miss** | `artifact.json` `entry` points to a missing HTML file | `entry: "ghost.html"` but no `ghost.html` on disk |
| **Orphan HTML** | HTML file with no inbound reference (and not `index.html`) | Exploration / scratch files that were never linked in |

The tool does not auto-fix anything — every issue requires human judgment, so the report is the deliverable.

## Usage

```bash
# Default: scan .od/projects
pnpm tools-link-check

# Custom root
pnpm tools-link-check path/to/.od/projects

# JSON for CI
pnpm tools-link-check --json | jq '.totals'

# Quiet: exit code only (0 = clean, 1 = issues)
pnpm tools-link-check --quiet

# Propose rewrites of dead refs to the current numbered sibling
pnpm tools-link-check --fix
pnpm tools-link-check --fix --json

# Apply the rewrites in place
pnpm tools-link-check --fix --apply
```

## `--fix` mode

For every dead cross-page reference, `--fix` proposes a rewrite to the
"current" sibling of the target — the one other HTML file that already
exists in the project and looks like the same logical artifact. The
"current" is chosen by:

1. **`primary:true` in `artifact.json`** — if exactly one matching file
   is marked primary, that wins (mirrors the upstream convention).
2. **Latest `mtime`** — fallback when no primary is set.

This is **not** a substitute for the editor's own post-write check
(track upstream `nexu-io/open-design#3345`); it is a defense-in-depth
tool for users whose projects already have broken references. Run
`--fix` first as a dry-run, then `--apply` once the proposals look
right.

When no sibling exists (e.g. a dead ref into a `screens/` namespace
that was never populated), `--fix` has no proposal to make — the dead
ref is reported by the normal scan but cannot be auto-rewritten.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | No issues found (or `--fix` made no proposals) |
| 1 | Issues found (dead refs / schema / orphans), or `--fix` has proposals but `--apply` not set |
| 2 | Setup error (missing root, malformed args) |

## Development

```bash
pnpm --filter @open-design/tools-link-check test         # 17 cases
pnpm --filter @open-design/tools-link-check typecheck    # tsc strict
pnpm --filter @open-design/tools-link-check build        # esbuild + dts
```

## Out of scope (follow-up work)

- Auto-fixing dead refs (each requires human judgment about which is the canonical version)
- Cleaning orphan files (exploration artifacts, may be intentional)
- Editor-level fixes (in-place edit, project manifest) — see linked GitHub issue
