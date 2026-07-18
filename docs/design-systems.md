# Design system authoring guide

**Parent:** [`spec.md`](spec.md) · **Siblings:** [`architecture.md`](architecture.md) · [`skills-protocol.md`](skills-protocol.md) · [`agent-adapters.md`](agent-adapters.md)

This guide describes the current design-system package consumed by the daemon,
picker, prompt composer, importers, and repository guards. Read it together with
[`design-systems/README.md`](../design-systems/README.md) and the contract notes
in [`design-systems/_schema/AGENTS.md`](../design-systems/_schema/AGENTS.md).

## 1. Package contract

A new design system is a package, not a standalone Markdown file. Its minimum
machine-readable shape is:

```text
design-systems/<slug>/
├── manifest.json  ← discovery metadata and declared package files
├── DESIGN.md      ← canonical design prose for agents
└── tokens.css     ← canonical compiled CSS custom properties
```

All three files are present in the bundled catalog. The daemon retains a
`DESIGN.md`-only discovery path for legacy or user-installed folders, but that is
a compatibility fallback, not the authoring target for new repository content.

The v1 manifest uses fixed canonical file names:

```json
{
  "schemaVersion": "od-design-system-project/v1",
  "id": "acme",
  "name": "Acme",
  "category": "Productivity & SaaS",
  "description": "A concise English catalog summary.",
  "source": {
    "type": "bundled",
    "origin": "Open Design curated bundled fixture"
  },
  "files": {
    "design": "DESIGN.md",
    "tokens": "tokens.css"
  }
}
```

- The folder and `manifest.id` must use the same normalized ASCII slug.
- `files.design` is `DESIGN.md`; `files.tokens` is `tokens.css`.
- `name`, `category`, and `description` are the primary catalog copy for a
  packaged system.
- `source` records whether the package is bundled, local, GitHub, or shadcn and
  carries the source-specific provenance fields.
- Every declared path must be safe, relative, and present. The schema in
  [`manifest.schema.ts`](../design-systems/_schema/manifest.schema.ts) is the
  source of truth for allowed keys and values.

### Rich package files

The migrated package profile can also declare:

```text
USAGE.md                     agent-facing read-order and usage guide
components.html              standalone component fixture
components.manifest.json     derived component/token index
design-tokens.json           derived Design Tokens JSON
tailwind-v4.css               derived Tailwind v4 mapping
assets/                       optional static assets
fonts/                        optional webfonts
preview/                      indexed preview pages
source/                       importer evidence and token reports
```

Declare these through the corresponding manifest fields (`usage`,
`files.components`, `componentsManifest`, `files.designTokens`,
`files.tailwind`, `assetsDir`, `fonts`, `preview`, and `sourceFiles`). Do not add
undeclared alternate canonical files.

Once a package opts into the rich profile, the package-quality guard expects a
complete profile: `USAGE.md`; `components.html` plus its derived manifest; and
at least three preview pages covering colors, typography, and spacing. Imported
`hybrid` and `verbatim` packages also have source-evidence requirements enforced
by the manifest guard.

Derived files are caches, not competing sources of truth:

- `components.manifest.json` is regenerated from `components.html` and
  `tokens.css`.
- `design-tokens.json` is regenerated from the token-contract report and must
  agree with `tokens.css`.
- `tailwind-v4.css` is regenerated from `tokens.css`.

## 2. Catalog metadata precedence

Packaged systems should put stable display metadata in `manifest.json`. The
daemon resolves catalog fields in this order:

| Field | Precedence |
| --- | --- |
| Title | user `metadata.json` override → `manifest.name` → Markdown H1 → frontmatter `name` → folder id |
| Category | user `metadata.json` override → `manifest.category` → Markdown `> Category:` → frontmatter `category` → `Uncategorized` |
| Summary | non-empty `manifest.description` → first Markdown summary paragraph → frontmatter `description` |
| Surface | user `metadata.json` override → Markdown surface metadata → frontmatter `surface` → `web` |

The H1 and `> Category:` convention therefore remains useful for readable prose
and legacy fallback, but it does not override manifest metadata in a packaged
system. Complete frontmatter color metadata wins over Markdown-derived swatches;
otherwise the daemon uses Markdown swatches and finally any partial frontmatter
row.

## 3. Writing `DESIGN.md`

`DESIGN.md` explains intent, decisions, and usage to an agent. It is not a
fixed nine-section numbered schema. For a migrated package, the quality guard
requires at least seven H2 headings (`## ...`); it does not require
specific numbers, titles, or ordering.

A useful document normally covers at least:

- visual theme and atmosphere;
- color roles and contrast intent;
- typography families, scale, leading, and tracking;
- spacing, layout, and composition;
- components and interaction states;
- motion behavior and reduced-motion handling;
- accessibility expectations;
- concrete anti-patterns.

Use headings that describe the actual system. A source-derived brand may add
sections for provenance, imagery, data visualization, editorial voice, or
platform-specific behavior. Avoid empty headings added only to meet the count.

Keep prose and compiled values synchronized. If `DESIGN.md` names an accent,
type scale, spacing rhythm, or motion duration, the corresponding binding in
`tokens.css` must express the same decision.

## 4. Authoring `tokens.css`

`tokens.css` is the canonical compiled token stylesheet that agents can consume
without translating prose into ad hoc values. Put shared declarations in a
`:root { ... }` block:

```css
:root {
  --bg: #ffffff;
  --fg: #18181b;
  --accent: #625df5;
  --font-display: "Inter", system-ui, sans-serif;
  --font-body: "Inter", system-ui, sans-serif;
}
```

The current token contract lives in
[`packages/contracts/src/design-systems/token-schema.ts`](../packages/contracts/src/design-systems/token-schema.ts)
and is re-exported through `design-systems/_schema/`. The repository guard
checks required A1, A2, and B-slot tokens, default parity, fixture synchronization,
and unknown-token allowlists. A final `tokens.css` must contain every required
shared slot; brand-specific extensions must use the documented extension
allowlist rather than silently inventing cross-brand tokens.

Use semantic variables in component CSS instead of repeating raw colors:

```css
.button-primary {
  background: var(--accent);
  color: var(--accent-on);
}
```

When the system supports a dark variant, override semantic tokens under a
theme selector rather than copying unrelated component rules:

```css
[data-theme="dark"] {
  --bg: #111113;
  --fg: #fafafa;
}
```

## 5. Component fixtures and usage guides

For a rich package, `components.html` is the executable proof that the tokens
compose into real controls and layouts. It should cover at least four component
groups and use declared tokens. The quality guard currently requires at least
10 fixture selectors and 8 referenced tokens. The derived component manifest
must not contain undeclared token references.

`USAGE.md` is the agent-facing router. It must contain the H2 sections `Read
Order`, `Design Highlights`, `Do`, and `Avoid`. Keep it concise: direct the agent
to the relevant package files and call out decisions that would otherwise be
easy to miss.

## 6. Accessibility

- Verify normal text at 4.5:1 contrast and large text at 3:1 against the actual
  paired background.
- Give every interactive control a visible `:focus-visible` treatment.
- Preserve native semantics and keyboard behavior in component fixtures.
- Do not claim conformance without checking every foreground/background pair
  used by the fixture.
- Scope reduced-motion overrides to the elements and properties that animate.

## 7. Motion and interaction

The repository UI motion convention is a strong ease-out:

```css
:root {
  --ease-standard: cubic-bezier(0.23, 1, 0.32, 1);
  --motion-enter: 200ms;
  --motion-exit: 140ms;
}
```

Use about 200ms for entry and 140ms for exit. Do not use `ease-in` for UI
elements, and do not animate from `scale(0)`; start at `scale(0.9)` or higher
with opacity when scale is appropriate. Continuous data or progress motion may
remain linear. A brand may bind different token values when motion is genuinely
part of its identity, but the behavior must still be accessible and documented.

## 8. Localized catalog copy

English fallback metadata comes from the package. Built-in localized catalog
copy is keyed by design-system id in `apps/web/src/i18n/content.ts` and its
language modules.

There are currently 17 direct non-English content bundles:

`de`, `fr`, `ru`, `zh-CN`, `ja`, `id`, `es-ES`, `pt-BR`, `ar`, `fa`, `ko`,
`pl`, `hu`, `uk`, `tr`, `th`, and `it`.

`zh-TW` intentionally reuses the `zh-CN` built-in-content bundle when a
dedicated entry is unavailable. When adding or renaming bundled catalog copy,
update the same id in all 17 direct `*_DESIGN_SYSTEM_SUMMARIES` maps and keep
category mappings aligned. The runtime still falls back to the package summary
or category, but that fallback is not a substitute for the repository's full
localized-content coverage.

## 9. Review checklist

- [ ] Folder slug and `manifest.id` match and are normalized.
- [ ] `manifest.json`, `DESIGN.md`, and `tokens.css` are present and consistent.
- [ ] Every declared manifest path exists; source and license provenance are clear.
- [ ] `DESIGN.md` has at least seven substantive H2 sections without relying on a fixed numbered template.
- [ ] `tokens.css` satisfies the shared token schema and agrees with the prose.
- [ ] Rich-package usage, component, preview, and source-evidence files are complete.
- [ ] Derived component, Design Tokens, and Tailwind outputs are regenerated rather than hand-edited.
- [ ] Component fixtures use declared semantic tokens and include keyboard, focus, contrast, and reduced-motion behavior.
- [ ] All 17 direct non-English catalog maps are updated for bundled copy changes.
- [ ] `pnpm guard` and `pnpm typecheck` pass.

The executable guard inventory is owned by [`scripts/guard.ts`](../scripts/guard.ts).
Read it and the scripts it invokes instead of relying on a copied list of checks.
