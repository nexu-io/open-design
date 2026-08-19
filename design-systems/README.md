# Design Systems

Each subfolder is a portable design-system package. Selecting one from the
Design System surface or a supported project-creation workflow composes its
design context into the agent prompt.

The bundled catalog currently contains **151 packages**. Every bundled package
has the same minimum machine-readable shape:

```text
design-systems/<slug>/
├── manifest.json
├── DESIGN.md
└── tokens.css
```

- `manifest.json` owns stable discovery metadata, provenance, and declared
  package paths.
- `DESIGN.md` is the canonical design prose for agents.
- `tokens.css` is the canonical compiled semantic-token stylesheet.

The daemon still discovers legacy folders that contain only `DESIGN.md`, so
older and user-installed content remains compatible. That fallback is not the
authoring target for new repository content.

## Manifest and catalog behavior

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

- The folder slug and `manifest.id` must match and use normalized ASCII.
- `files.design` is `DESIGN.md`; `files.tokens` is `tokens.css`.
- `name`, `category`, and `description` are the primary packaged-catalog copy.
- `source` records package provenance.
- Every declared path must be safe, relative, and present.

At runtime, manifest metadata takes precedence over the legacy Markdown H1 and
`> Category:` conventions. Those Markdown conventions remain readable fallback
metadata for legacy packages. The exact precedence and authoring rules live in
[`docs/design-systems.md`](../docs/design-systems.md).

The catalog is scanned on every `/api/design-systems` request. After changing a
package, refresh the Design System surface; a daemon restart is not required.

## Rich package files

Packages may declare the richer files below through their corresponding
manifest fields:

```text
USAGE.md                     agent-facing read order and usage guide
components.html              standalone component fixture
components.manifest.json     derived component/token index
design-tokens.json           derived Design Tokens JSON
tailwind-v4.css               derived Tailwind v4 mapping
assets/                       optional static assets
fonts/                        optional webfonts
preview/                      indexed preview pages
source/                       importer evidence, snippets, and token reports
```

These fields are active runtime inputs, not structural placeholders. Prompt
composition consumes `USAGE.md`, `tokens.css`, component information, import
mode, craft bindings, and a manifest-derived pull index when present. Package
and static-file APIs expose declared preview/source files without widening the
filesystem boundary.

Derived files are caches rather than competing sources of truth:

- `components.manifest.json` is derived from `components.html` and `tokens.css`.
- `design-tokens.json` is derived from the token-contract report and must agree
  with `tokens.css`.
- `tailwind-v4.css` is derived from `tokens.css`.

The manifest and package-quality guards validate the declared paths, rich
profile, derived-file parity, token contract, component fixture, source
evidence, and preview coverage. Read
[`_schema/AGENTS.md`](_schema/AGENTS.md) before editing those contracts.

## Writing a package

`DESIGN.md` does not use a fixed nine-section template. The package-quality
guard requires at least seven substantive H2 headings for migrated packages,
without prescribing their names, order, or numbering. Use headings that fit the
actual system and keep their decisions synchronized with `tokens.css`.

For new repository content:

1. Create the three required files and keep the folder slug equal to
   `manifest.id`.
2. Record useful catalog metadata and source provenance in `manifest.json`.
3. Write at least seven substantive H2 sections in `DESIGN.md`.
4. Bind the shared semantic-token contract in `tokens.css`.
5. Add rich package files when the system needs components, previews, assets,
   fonts, or source evidence.
6. Run `pnpm guard` and `pnpm typecheck`.

The complete authoring guide and review checklist are in
[`docs/design-systems.md`](../docs/design-systems.md).

## Importing and refreshing

The product exposes local-folder, GitHub, and shadcn import flows in both the UI
and the `od design-systems import-*` CLI. Those importers write the package
contract rather than a standalone `DESIGN.md`.

[`scripts/sync-design-systems.ts`](../scripts/sync-design-systems.ts) remains
the repository-owned bulk synchronizer for upstream-derived catalog content.
Do not copy the retired branch-only importer or manual tarball recipe from old
plans; use the checked-in script and current import surfaces.

## Attribution

Package-level `manifest.source`, evidence files, and local license files are the
source of truth for provenance. Major upstream sources represented in the
catalog include:

- [`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md)
  (MIT) for upstream-derived product systems.
- [`bergside/awesome-design-skills`](https://github.com/bergside/awesome-design-skills)
  for normalized design-skill systems.
- [`tw93/kami`](https://github.com/tw93/kami) (MIT) for the `kami` package.
- [`Tom-Opencart/tom-modern-html-style-rule`](https://github.com/Tom-Opencart/tom-modern-html-style-rule)
  (MIT) for the `tom-modern` package.

Brand-referencing packages are aesthetic inspirations, not official assets of
the brands they reference.
