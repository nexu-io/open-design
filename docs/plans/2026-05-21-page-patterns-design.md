# Page Patterns — Design Doc

**Date**: 2026-05-21
**Owner**: anerjin
**Status**: Approved (brainstorming complete; ready for implementation plan)

## Purpose

Evolve Open Design from a single-artifact design tool into a site builder.
Phase 1 ships a **page-level pattern library** — login / board list / gallery
and friends — that users browse, preview, and use as the starting point for a
single-page project. The same patterns are designed to be reused as the node
palette for a future diagram-based site planner (Phase 2, out of scope here).

The pattern catalog therefore plays three roles simultaneously:

1. A reference gallery the user browses to identify "what kind of page do I
   need".
2. A starting point for the existing one-page generation flow ("create a new
   project from this pattern").
3. A typed vocabulary (`page_type`, `page_inputs`, `page_outputs`) that the
   future diagram surface will reuse as drag-and-drop nodes without any data
   migration.

## Non-goals (this PR scope)

- The diagram / node canvas surface itself.
- A multi-page project model (Open Design today is single-HTML-artifact
  centric; this phase stays single-page).
- User-authored patterns (save-from-project). Curation of seed content
  comes first.
- Actual *use* of `page_inputs` / `page_outputs` — metadata is recorded but
  not consumed in Phase 1. It exists so Phase 2 can adopt it without a data
  migration.

## Architecture

### New top-level content directory

`page-patterns/` lives at the repo root, sibling to `design-templates/` and
`skills/`. Each entry is a folder containing:

- `SKILL.md` — frontmatter (incl. page-pattern specific `od.page_type`,
  `od.page_inputs`, `od.page_outputs`) plus an agent workflow body.
- `example.html` — the baked preview the daemon serves to the gallery iframe.
- `assets/`, `references/` — optional side files.

Reasons for a separate directory rather than a new `od.scenario` value
inside `design-templates/`:

- Future Phase 2 will fetch "available node types" from one endpoint. Keeping
  the data root separate avoids filtering across a heterogeneous catalog
  (slides, audio, image templates).
- Daemon route ownership and contracts stay scoped and easy to evolve.
- Editorial signal: contributors immediately know `page-patterns/` is the
  site-building vocabulary, not a kitchen sink.

### Daemon routes

Mirror the existing `/api/design-templates` implementation:

- `GET /api/page-patterns` — list, returns `PagePatternListResponse`.
- `GET /api/page-patterns/:id` — detail.
- `GET /api/page-patterns/:id/example` — baked `example.html`.
- `GET /api/page-patterns/:id/assets/*` — side files.

Implementation reuses the same lazy scanner shape as `skills-routes.ts` /
`design-templates-routes.ts`. Asset URL rewriting (already shared between
skills and design templates) extends naturally.

### Shared types (packages/contracts)

```ts
// packages/contracts/src/api/page-patterns.ts
export type PagePatternIOKind = 'navigation' | 'data' | 'action';

export interface PagePatternIO {
  name: string;
  kind: PagePatternIOKind;
  /** Page type the link/action targets. Phase 2 uses this to suggest connections. */
  target_page_type?: string;
}

export interface PagePatternSummary extends SkillSummary {
  pageType: string;              // e.g. 'auth.login'
  pageInputs: PagePatternIO[];
  pageOutputs: PagePatternIO[];
}

export interface PagePatternListResponse {
  patterns: PagePatternSummary[];
}
```

`PagePatternSummary` extends `SkillSummary` so the web client can reuse
existing preview / search infrastructure with minimal type plumbing.

## SKILL.md schema additions

A page pattern's `SKILL.md` adopts the existing skill frontmatter and adds
three page-pattern specific fields under `od:`:

```yaml
od:
  mode: prototype
  platform: desktop
  scenario: page-pattern        # discriminator vs. design-templates
  page_type: auth.login         # namespace.name — node type identifier
  page_inputs: []               # data this page receives (empty for v1 seeds)
  page_outputs:
    - name: submit
      kind: navigation
      target_page_type: dashboard.metrics
    - name: signup_link
      kind: navigation
      target_page_type: auth.signup
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components, forms]
  example_prompt: "표준 로그인 페이지를 만들어 줘…"
```

`page_outputs[].target_page_type` is a *type reference*, not a specific
pattern id. So a `auth.login` pattern's submit output reads "go to any page
of type `dashboard.metrics`", and Phase 2's graph stays valid even when the
user picks a different concrete dashboard pattern.

`page_inputs` can be empty in Phase 1. The field exists so the schema is
stable when Phase 2 begins consuming it.

## Seed catalog (Phase 1)

Eight patterns covering the most common site-building vocabulary the user
named (로그인, 게시판 리스트, 갤러리) plus the obvious complements:

| `page_type`          | Folder              | Description                                         |
| -------------------- | ------------------- | --------------------------------------------------- |
| `auth.login`         | `auth-login`        | Email/password + social + signup link               |
| `auth.signup`        | `auth-signup`       | New account creation                                |
| `list.board`         | `board-list`        | Korean-style board: pagination, sort, search        |
| `list.gallery`       | `gallery-grid`      | Image/card grid                                     |
| `list.feed`          | `social-feed`       | Timeline / activity feed                            |
| `detail.post`        | `post-detail`       | Article / post detail                               |
| `dashboard.metrics`  | `dashboard-metrics` | KPI dashboard                                       |
| `profile.user`       | `user-profile`      | User profile page                                   |

Curation is intentionally small. Settings / checkout / landing / search-result
patterns are deferred to a follow-up content pass once the catalog UX is
proven.

## Web UI

### Route + nav rail

- Add `'page-patterns'` to the `EntryView` union (`apps/web/src/components/EntryNavRail.tsx`).
- Insert a new `NavButton` immediately after the existing Design Systems
  button. Icon: `layout` (suggests page composition).
- Wire `/page-patterns` in `apps/web/src/router.ts` (parts match, view
  selection, reverse path).

### `PagePatternsTab` component

Lives at `apps/web/src/components/PagePatternsTab.tsx`. Layout reuses the
`DesignSystemsTab` "Built-in library" section pattern:

- Header: localized title + lede.
- Search input + category select. Category options derive automatically from
  the namespace portion of `pageType` (`auth`, `list`, `detail`, `dashboard`,
  `profile`, …).
- Card grid using the existing lazy-iframe thumbnail approach
  (`DesignSystemCard`'s intersection observer pattern).

Each card surfaces:

- Lazy-loaded `example.html` preview.
- Title, description, category badge.
- Two actions: large "Preview" (opens modal) and "Use" ("이 패턴으로 새 프로젝트").

A reusable `PagePatternPreviewModal` (or extension of the existing
`DesignSystemPreviewModal`) shows the full-size iframe.

### Project handoff

Clicking **"이 패턴으로 새 프로젝트"** reuses the existing handoff used by
the `design-templates` Templates tab in the Entry view. Concretely, navigate
to home with:

- `composer.prompt` seeded from `pattern.examplePrompt`.
- A pending plugin-use handoff (`pendingPluginUseHandoff` mechanism in
  `HomeView`) carrying the pattern's id so the home composer auto-activates
  the corresponding skill on first render.

No new handoff channel is introduced. We extend the existing one to also
accept page-pattern ids.

## CLI

Per AGENTS.md "Capability exposure (UI/CLI dual-track)" rule, the daemon CLI
gets matching subcommands registered in `apps/daemon/src/cli.ts`
`SUBCOMMAND_MAP`:

```text
od page-pattern list
od page-pattern list --json
od page-pattern show <id>
od page-pattern show <id> --json
od page-pattern show <id> --prompt-file -    # not used here, but standard
```

Both surfaces (UI and CLI) call the same `/api/page-patterns` endpoints.

## i18n

- **UI shell** — new `pagePatterns.*` keys in
  `apps/web/src/i18n/types.ts`, `en.ts`, `ko.ts`, `zh-CN.ts`. Approx. 12 keys:
  nav label, page title, lede, search placeholder, filter label, category
  filter "all", category names (auth / list / detail / dashboard / profile /
  settings), card "Use" action, card "Preview" action, empty-state copy.
- **Pattern copy** — `SKILL.md` `description` and prompts stay in English by
  default (matching the existing design-templates / skills convention). A
  follow-up can add `KO_PAGE_PATTERN_SUMMARIES` to
  `apps/web/src/i18n/content.ts` and wire a `localizePagePatternSummary`
  helper parallel to `localizeDesignSystemSummary`. Not blocking Phase 1.
- Other 17 locales rely on the existing `...en` spread fallback. No
  typecheck breakage.

## Testing strategy

### Daemon e2e (apps/daemon/tests)

- `/api/page-patterns` returns all eight seed patterns.
- Each pattern's `pageType` / `pageInputs` / `pageOutputs` parses correctly
  from `SKILL.md` frontmatter.
- `/api/page-patterns/:id/example` serves the baked `example.html`.

### Web component tests (apps/web/tests/components)

- `PagePatternsTab` renders cards from a mocked list response.
- Search filter and category select narrow the visible set.
- Clicking "Use" fires the expected home navigation with the seeded prompt
  and pattern id.

### CLI e2e (e2e/tests)

- `od page-pattern list --json` matches the contract shape.
- `od page-pattern show <id>` includes both metadata and SKILL.md body.

### i18n typecheck

- `pnpm --filter @open-design/web typecheck` must stay green after adding
  the new keys (en + ko + zh-CN required; others fall back via `...en`).

## PR split

PRs land in this order, each independently buildable and reviewable:

1. **PR-1: Data + daemon + CLI**
   - `page-patterns/` directory with `AGENTS.md` + eight seed patterns.
   - `apps/daemon/src/page-patterns-routes.ts` mounting `/api/page-patterns`.
   - `packages/contracts/src/api/page-patterns.ts` with `PagePatternSummary`,
     `PagePatternIO`, `PagePatternListResponse`.
   - `od page-pattern` subcommands in `apps/daemon/src/cli.ts`.
   - Tests: daemon e2e + CLI e2e.
2. **PR-2: Web UI**
   - `EntryView` union, nav rail button, router wiring.
   - `PagePatternsTab` + preview modal.
   - Component tests.
3. **PR-3: i18n + project handoff polish**
   - `pagePatterns.*` keys in en / ko / zh-CN.
   - Wire the pending-plugin-use handoff path to accept page-pattern ids.
   - Verify Korean rendering end-to-end.

Each PR's "Surface area" checklist ticks UI **and** CLI together (PR-2 ticks
UI because it adds the gallery; PR-1 ticks CLI because it adds the
subcommand). PR-3 ticks i18n keys.

## Risk register

- **Catalog quality decay**. Eight curated seeds is small enough to ship
  well, but a sprawling library quickly becomes unbrowsable. Mitigation: gate
  new patterns on an `od.page_type` review (does this category exist? does
  the input/output schema make sense?) before merge.
- **`page_type` taxonomy drift**. Once Phase 2 ships, the namespace.name
  scheme becomes a public contract. Mitigation: encode the seed taxonomy in
  the design doc *and* a daemon-side enum (in
  `packages/contracts/src/api/page-patterns.ts`) so additions require an
  explicit code change.
- **Preview iframe perf**. The Design Systems library already lazy-loads
  ~120 iframes with an IntersectionObserver — eight more is trivially
  affordable. No regression expected.
- **Confusion with `design-templates`**. Some existing design-templates
  (`dashboard`, `dating-web`) already act as page-level patterns. Mitigation:
  PR-1's `page-patterns/AGENTS.md` explicitly documents the boundary
  (page-patterns are site building blocks with typed I/O; design-templates
  are rendering shapes with no I/O contract).

## Open questions deferred (not blocking)

- Whether existing dashboard-like design-templates should *migrate* to
  `page-patterns/` or stay duplicated. Decide after Phase 1 ships and we see
  how patterns vs. templates feel side by side.
- Whether `page_type` should support multiple namespaces (`commerce.cart`,
  `support.ticket`) or stay restricted to the seed taxonomy. Defer until a
  real third-namespace use case lands.
