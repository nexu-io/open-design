# Design System Import Project Structure

## Purpose

Open Design needs imported design systems to satisfy four stakeholders at
once:

- **Push channel**: system-prompt injection must stay small, dense,
  schema-aligned, and interchangeable across the bundled catalog.
- **Pull channel**: agents need richer indexed files for high-fidelity
  reconstruction when the task calls for it.
- **Importer**: extraction from a real project must not discard scanned
  evidence, source naming, assets, or representative component patterns.
- **Legacy fallback**: existing `DESIGN.md`-only systems must keep working
  without edits.

The target structure below keeps the current runtime path intact while
adding richer optional layers for imported systems.

## Target Shape

```text
design-systems/<slug>/
│
│ ── Protocol layer: push channel ─────────────────────────────
├── USAGE.md
├── manifest.json
├── DESIGN.md
├── tokens.css
├── components.html
├── components.manifest.json
│
│ ── Expression layer: pull channel and human preview ─────────
├── assets/
├── fonts/
├── preview/
│   ├── colors.html
│   ├── typography.html
│   ├── spacing.html
│   ├── components-buttons.html
│   ├── components-inputs.html
│   └── app.html
│
│ ── Evaluation layer: importer evidence ─────────────────────
└── source/
    ├── scanned-files.json
    ├── evidence.md
    ├── tokens.source.json
    └── snippets/
        ├── INDEX.json
        ├── Sidebar.tsx
        └── MessageBubble.tsx
```

Only `manifest.json`, `DESIGN.md`, and `tokens.css` are mandatory for new
Design System Project folders. `components.html` remains optional in the
schema, but imported web systems should generate it by default. Legacy
folders without `manifest.json` continue to use the existing `DESIGN.md`
fallback path.

## File Roles

### `USAGE.md`

`USAGE.md` is the agent-facing router for the design-system package. It
absorbs the useful part of Claude-style `SKILL.md` files without turning a
design system into a functional skill or colliding with repository
`AGENTS.md` contributor instructions.

It should be injected before `DESIGN.md` in the push channel because it
tells the agent why and when to read each file:

```md
# Cherry Studio Usage

## Read Order

1. Read `DESIGN.md` for visual principles and product context.
2. Paste `tokens.css` into the first `<style>` block.
3. Use `components.manifest.json` for available component patterns.
4. Pull `preview/app.html` when layout fidelity matters.
5. Pull `source/snippets/*` only when verbatim source behavior matters.

## Design Highlights

- Compact desktop chat client.
- Vibrant green accent.
- Three-column chat layout.
- Ubuntu typography.

## Do

- Preserve compact controls and dense sidebars.
- Reuse brand assets when the product identity is visible.

## Avoid

- Marketing-style landing layouts for core app surfaces.
- Decorative gradients unless source evidence supports them.
```

When `USAGE.md` is absent, the daemon should inject a small default guide:

> Read `DESIGN.md` for visual principles, paste `tokens.css` verbatim into
> the first `<style>` block, and match component shapes from
> `components.html` or its manifest when available.

Importer-generated `USAGE.md` files should be marked as auto-generated and
reviewable. The importer can derive the first draft from manifest contents,
`DESIGN.md` product context, high-confidence tokens, UI kit/layout signals,
and source evidence.

### `tokens.css` and `source/tokens.source.json`

`tokens.css` is the normalized OD token contract. It must use the standard
schema names such as `--bg`, `--fg`, `--accent`, and the A1/A2/B-slot set.
This keeps cross-brand artifacts interchangeable.

Original project token names and evidence belong in `source/tokens.source.json`
rather than mixed into the normalized token file. That file can record source
variable names, source file paths, extraction strategy, confidence, and any
aliases needed by source snippets.

### `components.html` and `components.manifest.json`

`components.html` is the compact worked fixture for the push channel. It is
human-readable and prompt-efficient.

`components.manifest.json` is a rebuildable cache derived from
`components.html` plus `tokens.css`. It follows the same source/cache pattern
as `_schema/tokens.schema.ts` and `_schema/defaults.css`:

| Pair | Source | Cache / mirror | Guard |
| --- | --- | --- | --- |
| `_schema/tokens.schema.ts` ↔ `_schema/defaults.css` | TS source | CSS mirror | A2 defaults parity |
| `components.html` ↔ `components.manifest.json` | HTML fixture | JSON cache | component manifest drift |

Three states are valid:

| State | Guard behavior | Runtime behavior |
| --- | --- | --- |
| Missing | Pass | Daemon derives from `components.html` on demand |
| Present and fresh | Pass | Daemon may read cache directly |
| Present but drifted | Fail | Regenerate the cache |

Importer output should include `components.manifest.json` by default so PR
reviewers can inspect the exact semantic summary agents will receive.
Hand-authored systems may omit it.

### `preview/`

`preview/` is for human inspection and pull-channel exploration. Prefer
small grouped pages rather than a single catch-all page:

- `preview/colors.html`
- `preview/typography.html`
- `preview/spacing.html`
- `preview/components-buttons.html`
- `preview/components-inputs.html`
- `preview/app.html`

Avoid naming a preview file `preview/components.html`; the root
`components.html` already has protocol meaning.

### `source/`

`source/` is importer-only evidence. It keeps the extraction auditable and
prevents the importer from throwing away useful material:

- `scanned-files.json`: inventory of scanned files and why they mattered.
- `evidence.md`: human-readable extraction notes and source excerpts.
- `tokens.source.json`: original names, aliases, confidence, and source
  locations for token extraction.
- `snippets/INDEX.json`: indexed source slices with roles, languages, sizes,
  and original source paths.

Example snippet index entry:

```json
{
  "path": "source/snippets/Sidebar.tsx",
  "role": "navigation",
  "language": "tsx",
  "sourcePath": "src/renderer/components/Sidebar.tsx",
  "bytes": 18420,
  "reason": "Primary app navigation pattern"
}
```

## Manifest Additions

PR0 should extend the v1 manifest with optional index fields only. These
fields establish paths and shapes; they do not imply full runtime behavior
until later PRs wire the consumer paths.

```json
{
  "usage": "USAGE.md",
  "componentsManifest": "components.manifest.json",
  "importMode": "hybrid",
  "craft": { "applies": [], "suggested": [], "exemptions": [] },
  "fonts": [],
  "preview": { "dir": "preview", "pages": [] },
  "sourceFiles": {
    "scanned": "source/scanned-files.json",
    "evidence": "source/evidence.md",
    "tokens": "source/tokens.source.json",
    "snippets": "source/snippets/INDEX.json"
  }
}
```

`importMode` values:

- `normalized`: OD-normalized files only. This is the implicit default for
  bundled and hand-authored systems when the field is absent.
- `hybrid`: normalized OD files plus source/evidence files. This is the
  default for local and GitHub importers.
- `verbatim`: preserve source naming and structure as much as possible. This
  should be user-selected, not the default importer behavior.

`craft` is declarative in PR0:

- `applies`: craft rules the package claims to satisfy.
- `suggested`: craft rules the agent may consult.
- `exemptions`: craft rules intentionally not claimed by the imported source.

PR0 should not make `craft` change guard or prompt behavior.

## Push And Pull Consumption

The push channel stays compact and deterministic:

```text
## How to use this design system — <brand>
[USAGE.md, or default boilerplate]

## Active design system — <brand>
[DESIGN.md]

## Active design system tokens — <brand>
[tokens.css]

## Reference fixture — <brand>
[components.manifest.json summary, or derived components manifest, or fixture fallback]

## Pull-layer files available on demand
[short list from manifest preview/source indexes]
```

The pull channel is explicit and bounded. A future
`read_design_system_file(brand_id, relative_path)` tool should only read
paths allowed by the active manifest. Agents use it for `preview/app.html`,
source snippets, original token evidence, and other rich files that are too
large or too situational for every prompt.

## PR Plan

### PR0 — Schema and Guard Shape

- Add optional manifest fields: `usage`, `componentsManifest`,
  `importMode`, `craft`, `fonts`, `preview`, and `sourceFiles`.
- Validate only structure, safe relative paths, JSON readability, and declared
  file/directory existence.
- Add the optional `components.manifest.json` drift guard: missing passes;
  present must match the derived manifest from `components.html + tokens.css`.
- Do not require `USAGE.md` or any rich layer for legacy systems.
- Do not make `craft` or `importMode` affect runtime behavior yet.

### PR1 — Importer Preservation

- Local and GitHub importers default to `importMode: "hybrid"`.
- Importers generate `USAGE.md`, `components.manifest.json`, grouped
  `preview/` pages, `source/tokens.source.json`, `source/evidence.md`,
  `source/scanned-files.json`, and representative `source/snippets/`.
- Web imports generate `preview/app.html` when enough layout evidence exists.
- Image, video, and audio imports use sample/evidence files instead of
  forcing a web UI kit.

### PR2 — Runtime Semantics

- Daemon reads `USAGE.md` before `DESIGN.md`, falling back to the default
  boilerplate.
- Daemon prefers fresh `components.manifest.json` when present and derives
  when absent.
- Prompt composer adds a short pull-layer file index.

### PR3 — Pull Tool

- Add a bounded `read_design_system_file` tool or equivalent daemon endpoint.
- Restrict reads to manifest-indexed paths.
- Surface useful labels/roles from `preview.pages` and snippet indexes.

### PR4 — Craft And Import Modes

- Wire `craft.applies`, `craft.suggested`, and `craft.exemptions` into guard
  and prompt behavior.
- Make `importMode` visible in importer UI and runtime summaries.

## Out Of Scope For PR0

- Enforcing `USAGE.md` section quality or required H2s.
- Verifying that `Read Order` references exist.
- Scoring `Do` / `Avoid` quality.
- Requiring preview pages or source evidence for bundled legacy systems.
- Changing the existing `DESIGN.md` fallback behavior.
