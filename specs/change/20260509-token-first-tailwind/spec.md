---
id: 20260509-token-first-tailwind
name: Token First Tailwind
status: designed
created: '2026-05-09'
---

## Overview

### Problem Statement

- Current frontend styles are concentrated in `index.css`. When contributors change UI, they often edit the same global CSS file, increasing the chance of code conflicts.
- The project already has a CSS variable token system. It needs to become the visual source for Tailwind so contributors mainly express styles in TSX through Tailwind utilities.
- The refactor needs to keep the existing frontend presentation stable, especially the overall page style and visual tone.

### Goals

- Implement token-first Tailwind: Tailwind is the style authoring and composition tool, while visual tokens continue to come from existing CSS variables.
- Migrate component styles in existing TSX that depend on global CSS classes to token-first Tailwind `className` values, reducing day-to-day dependency on `index.css` edits.
- Reduce conflict probability from the global CSS hotspot file during multi-contributor work.
- Keep the existing page style, light/dark themes, warm paper-like tone, and overall presentation stable.
- Establish repeatable agent visual comparison validation: each development worktree and baseline worktree starts its own web/daemon pair, and an agent equipped with the agent-browser CLI and Chrome DevTools MCP compares frontend presentation across the two services. The comparison uses screenshots as the primary evidence and component source inspection as supporting context to confirm visual consistency and prevent display drift before and after the refactor.

### Scope

- Integrate Tailwind and map existing design tokens to usable Tailwind token classes.
- Keep base tokens, global base styles, and content styles that must remain globally managed in `index.css`.
- Establish constraints that guide contributors to prefer project tokens and base UI primitives.
- Preserve the existing component abstraction for this change; fully replace migratable global CSS classes in existing TSX with token-first Tailwind classes.
- Land the work in batches: first the toolchain, token mapping, and constraints, then migrate existing TSX classes by area while retaining styles that must remain globally managed.

### Constraints

- Frontend presentation must not drift during migration, and the overall page style must remain consistent.
- Full migration is judged by visual equivalence to the current UI, with migration slices organized by page/component area.
- Tailwind integration validation and migration happen inside existing components; component abstractions remain unchanged.
- `index.css` continues to carry global tokens and base styles, and the visual source remains the project CSS variables.

### Success Criteria

- Baseline: at migration start, record that `apps/web/src/index.css` currently has about 16,038 lines and 1,415 CSS class selectors, and `apps/web/src/**/*.tsx` currently has about 51 files and 2,126 `className=` occurrences; the final PR must refresh these numbers in the implementation notes.
- TSX migration target: migratable component-level global classes are completed by PR slice, and each slice records complete migrated / retained / deferred class lists; after the final slice, normal component UI changes primarily use TSX Tailwind utilities.
- `index.css` retention target: by the end, it only retains tokens, base, keyframes, loading shell, content-level/third-party boundary styles, and explicitly documented retained global styles; component-level retained global classes need an itemized reason and follow-up point.
- Guard target: default Tailwind palette utilities and unregistered hardcoded app UI colors fail in `pnpm guard`; each allowlist entry includes file scope, pattern scope, and reason.
- Visual consistency acceptance target: each development worktree and baseline worktree starts an independent web/daemon service pair. The agent uses agent-browser CLI and Chrome DevTools MCP to compare the same pages, same viewport, same theme/accent state, and same fixture data across the two services. Screenshot comparison is the primary validation artifact; component source inspection is used as supporting evidence when screenshots expose a difference or when a migrated class needs traceability to its token-first Tailwind replacement. Coverage includes Dashboard/app shell, project detail, settings dialog, file viewer/inspect overlay, sketch editor, live artifact card, and modal/popover/control states under light, dark, system, and custom accent. The refactor is accepted when visual effects are consistent and frontend presentation does not drift; any layout offset, token color drift, radius/shadow difference, or theme-state difference must be fixed or recorded as an approved deviation.

## Research

### Existing System

- The global CSS entry for `apps/web` is the `../src/index.css` import in the Next root layout. Source: `apps/web/app/layout.tsx:1-4`
- The product shell runs as a client SPA through `dynamic(() => import('../../src/App'), { ssr: false })`; the loading shell still depends on the global class `od-loading-shell`. Source: `apps/web/app/[[...slug]]/client-app.tsx:5-13`
- Current `apps/web` dependencies include Next, React, React DOM, and testing tools, with no Tailwind, PostCSS, or Autoprefixer declared in `dependencies` / `devDependencies`. Source: `apps/web/package.json:30-50`
- The root package only keeps repository-level tool scripts and TypeScript/tsx dev dependencies, with no Tailwind/PostCSS packages declared in root devDependencies. Source: `package.json:12-29`
- The current visual source is concentrated in CSS variables in `apps/web/src/index.css`: surface, border, text, accent, semantic colors, shadow, radius, and font tokens are all defined in `:root`. Source: `apps/web/src/index.css:6-63`
- Dark theme overrides the same token set through `[data-theme="dark"]`, and system mode overrides tokens through `@media (prefers-color-scheme: dark)` and `html:not([data-theme])`. Source: `apps/web/src/index.css:65-157`
- Base reset, body font/background/text color, and loading shell are globally defined in `index.css`. Source: `apps/web/src/index.css:160-181`
- `index.css` also carries component styling responsibilities, such as global selectors for button base, primary, and ghost variants. Source: `apps/web/src/index.css:183-219`
- `index.css` also carries global animation and complex component-area styles, such as settings modal keyframes and live artifact badge/card styles. Source: `apps/web/src/index.css:1121-1143,6219-6299`
- Existing TSX connects to `index.css` through many semantic global classes. Full migration needs to inline the visual semantics of those classes as token-first Tailwind utilities by functional area, while retaining loading shell, keyframes, and content-level styles that must apply across trees in global CSS. Source: `apps/web/src/index.css:183-219,1121-1143,6219-6299`; `apps/web/src/runtime/markdown.tsx:112-196`; `apps/web/src/components/SketchEditor.tsx:220-339`; `apps/web/src/components/pet/PetRail.tsx:58-170`
- Runtime supports user-custom accent color: `applyAppearanceToDocument()` writes `--accent*` CSS variables to `document.documentElement`, and mix ratios must stay consistent with the pre-hydration script. Source: `apps/web/src/state/appearance.ts:17-25,28-52`; `apps/web/app/layout.tsx:21-29`
- The local web runtime in this repository should start through `pnpm tools-dev run web --namespace <name> --daemon-port <port> --web-port <port>`. Runtime files and IPC sockets are namespace-scoped, so the development worktree and baseline worktree need different namespace values as well as different daemon/web ports to run independent service pairs concurrently. Source: `AGENTS.md:40-45,82-89,91-104`

### Available Approaches

- Tailwind CSS v4's official Next.js integration path uses `tailwindcss`, `@tailwindcss/postcss`, and `postcss`; PostCSS config loads `@tailwindcss/postcss`. The app imports Tailwind theme and utilities layers while keeping Preflight omitted. Retained element/reset rules that may conflict with migrated utilities need to live in an earlier base layer or be removed/constrained before migrating affected elements, because unlayered CSS outranks normal layered utilities. Source: `https://tailwindcss.com/docs/guides/nextjs`; `https://tailwindcss.com/docs/installation/using-postcss`; `https://tailwindcss.com/docs/preflight`; `https://developer.mozilla.org/en-US/docs/Web/CSS/@layer`
- Tailwind CSS v4 supports CSS-first theme variables, where the `--color-*` namespace in `@theme` generates color utilities such as `bg-*`, `text-*`, and `border-*`. Source: `https://tailwindcss.com/docs/theme`; `https://tailwindcss.com/docs/customizing-colors`
- Tailwind CSS v4 can clear the default color namespace with `--color-*: initial`, then declare only color variables that correspond to project tokens. Source: `https://tailwindcss.com/docs/customizing-colors`
- Tailwind CSS v3 primarily configures theme colors through `tailwind.config.js` / `theme.colors`; the v4 official docs move theme values to CSS theme variables. Source: `https://v3.tailwindcss.com/docs/theme`; `https://tailwindcss.com/docs/upgrade-guide`
- The existing repository `guard` mechanism already aggregates checks in a TypeScript script and sets a non-zero exit code on failure, so it can be extended as the token/Tailwind constraint entrypoint. Source: `scripts/guard.ts:6-9,401-422`
- Web tests live under `apps/web/tests/`. Existing Vitest coverage for components, runtime, state, and providers is a fit for lightweight tests around new helper functions and style constraints. Source: `apps/AGENTS.md:19-24`; `apps/web/package.json:23-29`
- Visual consistency validation can be performed by an agent with browser automation capability comparing two local service pairs: a baseline worktree running pre-migration code and a development worktree running the current slice. The agent checks display consistency under the same scenario, viewport, theme/accent, and fixture data, using screenshot comparison as the main evidence and component source inspection as auxiliary evidence for drift diagnosis and migration traceability. Source: `AGENTS.md:40-45,82-89,91-104`; `apps/web/src/index.css:65-157`; `apps/web/src/state/appearance.ts:28-52`

### Alternatives Considered

- Keep CSS variables plus CSS Modules or component-scoped CSS: this preserves the current token source and reduces selector leakage, while continuing to require a separate stylesheet edit path for most UI changes. The chosen path keeps CSS variables as the visual source and moves component composition into TSX where contributors already edit behavior.
- Introduce a smaller project utility layer without Tailwind: a custom utility layer could expose only approved tokens, while the team would own naming, variants, responsive states, editor tooling expectations, and guard behavior. Tailwind v4 provides the utility compiler and variant system while still allowing the project to clear the default color namespace.
- Use Tailwind with a JS config or compatibility layer: a JS config can centralize theme values, while this repository's TypeScript-first guard and Tailwind v4 CSS-first model favor `@theme` values colocated with existing CSS variables. The PostCSS `.mjs` entry remains a narrow tool compatibility file and must be explicitly allowlisted.
- Extract shared UI primitives before class migration: primitives would reduce repeated class strings, while they would also turn this spec into a component architecture migration. This plan keeps current component boundaries, migrates visual expression first, and leaves primitive extraction as a later refactor once token utilities are stable.

### Constraints & Dependencies

- Migration must follow app test directory boundaries: `apps/web` tests live in `apps/web/tests/`; visual consistency validation for this spec is performed by an agent comparing two local service pairs with agent-browser CLI and Chrome DevTools MCP, recorded in phase notes as the development acceptance workflow. Source: `apps/AGENTS.md:19-24`; `AGENTS.md:82-89`
- Dual-worktree comparison requires independent namespace values and daemon/web port assignments for the baseline and development worktrees; `tools-dev` supports `--namespace`, `--daemon-port`, and `--web-port`. Source: `AGENTS.md:40-45,82-89,91-104`
- The root command boundary keeps repository-level checks such as `pnpm guard` and `pnpm typecheck`; web validation uses package-scoped commands. Source: `AGENTS.md#Root command boundary`; `apps/AGENTS.md:39-51`
- Adding Tailwind/PostCSS dependencies or config changes package manifests / build entries, so `pnpm install` must run to keep workspace links and the lockfile consistent. Source: `AGENTS.md#Validation strategy`; `apps/web/package.json:23-29`
- Reasonable hardcoded color scenarios currently exist: Agent brand icons use brand gradients and SVG colors; Sketch canvas uses user drawing colors and canvas drawing colors; FileViewer `rgbToHex()` converts user content colors. Source: `apps/web/src/components/AgentIcon.tsx:46-99`; `apps/web/src/components/SketchEditor.tsx:72,144-149`; `apps/web/src/components/FileViewer.tsx:1448-1474`
- Governable token deviations also currently exist: `NewProjectPanel` SVG preview uses hardcoded colors that match or are close to existing token values; `SettingsDialog` local inline styles use legacy token fallbacks. Source: `apps/web/src/components/NewProjectPanel.tsx:797-825`; `apps/web/src/components/SettingsDialog.tsx:3807-3953`
- `index.css` still contains component status colors using specific hex/rgba values, such as blue/red hardcoded colors for live artifact refreshing/failed badges. Before migrating these styles, classify status tokens, brand colors, user content colors, and one-off illustration colors. Source: `apps/web/src/index.css:6270-6288`

### Key References

- `apps/web/app/layout.tsx:1-44` - web layout, CSS import, and pre-hydration theme/accent script.
- `apps/web/app/[[...slug]]/client-app.tsx:1-17` - client-only App entry and loading shell class.
- `apps/web/src/index.css:1-219,1121-1143,6219-6299` - tokens, base, global component styles, keyframes, and live artifact styles.
- `apps/web/src/state/appearance.ts:1-52` - runtime theme/accent CSS variable writes.
- `apps/web/package.json:23-50` - web scripts and dependency surface.
- `AGENTS.md:40-45,82-89,91-104` - tools-dev local lifecycle, web/daemon ports, and validation command boundaries.
- `scripts/guard.ts:138-151,205-221,328-350,401-422` - existing guard shape and failure behavior.
- `apps/AGENTS.md:19-24,39-51` - app test/layout and validation boundaries.
- `specs/change/20260509-token-first-tailwind/token.md` - Tailwind color/radius/shadow/font token vocabulary, existing CSS variable mapping, native spacing/type decision, and guardrail target.
- `https://tailwindcss.com/docs/guides/nextjs` - Tailwind v4 Next.js setup.
- `https://tailwindcss.com/docs/theme` - Tailwind v4 CSS-first theme variables and namespaces.

## Design

### Change Scope

- Scope: `apps/web` style toolchain. Impact: add Tailwind v4/PostCSS dependencies and config at the web package boundary because `@open-design/web` owns `dev/build/typecheck/test` scripts and currently declares no Tailwind/PostCSS dependencies. Source: `apps/web/package.json:23-50`; `https://tailwindcss.com/docs/guides/nextjs`
- Scope: `apps/web/src/index.css`. Impact: keep CSS variables, dark/system theme overrides, reset, body styles, loading shell, keyframes, and truly global content styles; add Tailwind import/theme/base layers in the same entry so the existing `layout.tsx` import remains the only global CSS entry, move retained conflicting element/reset rules into `@layer base` or constrain them before the affected TSX migration, and remove component-level global classes that have moved to TSX. Source: `apps/web/app/layout.tsx:1-4`; `apps/web/src/index.css:6-181,1121-1143,6219-6299`
- Scope: existing `apps/web/src/**/*.tsx`. Impact: migrate replaceable global CSS classes to token-first Tailwind `className` values by page/component area while keeping DOM structure and component responsibilities stable. Source: `apps/web/src/index.css:183-219`; `apps/web/src/**/*.tsx`
- Scope: token mapping. Impact: expose existing color, radius, shadow, and font CSS variables as Tailwind theme variables while preserving runtime custom accent behavior that writes to the same `--accent*` variables; use native Tailwind utilities for spacing and standard typography sizes, with exact `text-ui-*` aliases for existing non-standard UI sizes where visual parity requires them. Source: `apps/web/src/index.css:6-63`; `apps/web/src/state/appearance.ts:17-52`; `apps/web/app/layout.tsx:21-29`; `specs/change/20260509-token-first-tailwind/token.md`; `https://tailwindcss.com/docs/theme`
- Scope: constraints. Impact: extend the repository guard to reject default Tailwind palette classes, add hardcoded color detection with staged enforcement, and maintain allowlists for brand/user-content scenarios. Source: `scripts/guard.ts:138-151,205-221`; `apps/web/src/components/AgentIcon.tsx:46-99`; `apps/web/src/components/SketchEditor.tsx:72,144-149`; `apps/web/src/components/FileViewer.tsx:1448-1474`
- Scope: testing and validation. Impact: web-owned tests live in `apps/web/tests/`; validate through `pnpm guard`, `pnpm typecheck`, `pnpm --filter @open-design/web test`, and `pnpm --filter @open-design/web build`. Source: `apps/AGENTS.md:19-24,39-51`; `AGENTS.md#Validation strategy`
- Scope: agent visual consistency validation. Impact: each development slice uses a baseline worktree and development worktree, each running its own web/daemon pair; the agent compares the same scenarios across both services through the agent-browser CLI and Chrome DevTools MCP, using screenshots as the primary comparison record and component source inspection as auxiliary evidence, to validate consistent frontend display before and after the refactor. Source: `AGENTS.md:40-45,82-89,91-104`; `apps/web/src/index.css:65-157`; `apps/web/src/state/appearance.ts:28-52`

### Design Decisions

- Decision: use Tailwind CSS v4 in `apps/web`, with `tailwindcss`, `@tailwindcss/postcss`, and `postcss`, configured through PostCSS, and import the official layered theme/utilities CSS entries in the existing global CSS entry: `@layer theme, base, utilities;`, `@import "tailwindcss/theme.css" layer(theme);`, and `@import "tailwindcss/utilities.css" layer(utilities);`. This keeps Tailwind Preflight out of the foundation slice while putting retained base rules that must coexist with utilities into `@layer base`; unlayered element rules that set properties later migrated to utilities must be removed, constrained, or moved into the base layer before those elements migrate. Add the narrow local border-style reset from Tailwind's Preflight contract inside `@layer base` so `border border-*` utilities render solid borders from the later utilities layer without importing the full Preflight reset. Source: `apps/web/package.json:23-50`; `apps/web/app/layout.tsx:1-4`; `apps/web/src/index.css:183-219`; `https://tailwindcss.com/docs/guides/nextjs`; `https://tailwindcss.com/docs/preflight#border-styles-are-reset`; `https://developer.mozilla.org/en-US/docs/Web/CSS/@layer`
- Decision: define Tailwind theme values through CSS `@theme` because v4 converts `--color-*` theme variables into utilities such as `bg-*`, `text-*`, and `border-*`. Source: `https://tailwindcss.com/docs/theme`; `https://tailwindcss.com/docs/customizing-colors`
- Decision: map Tailwind color tokens to existing runtime CSS variables, such as `--color-bg: var(--bg)`, `--color-panel: var(--bg-panel)`, `--color-accent: var(--accent)`, `--color-danger: var(--red)`, and `--color-success: var(--green)`. Source: `apps/web/src/index.css:6-63`; `apps/web/src/state/appearance.ts:17-52`; `specs/change/20260509-token-first-tailwind/token.md`
- Decision: clear Tailwind's default color namespace with `--color-*: initial` before declaring project colors, so project classes express the Open Design token set. Source: `https://tailwindcss.com/docs/customizing-colors`; `apps/web/src/index.css:6-49`
- Decision: keep theme state and custom accent behavior CSS-variable-first; Tailwind utilities resolve through variables and automatically inherit light/dark/system/user accent changes. Source: `apps/web/src/index.css:65-157`; `apps/web/src/state/appearance.ts:28-52`; `apps/web/app/layout.tsx:21-29`
- Decision: `index.css` continues to own token definitions, layered reset/base behavior, loading shell, keyframes, and cross-content-area styles; this change preserves existing component abstractions and migrates all replaceable component-level global classes in existing TSX to token-first Tailwind classes. Any retained unlayered selector must avoid overriding migrated utilities for the same element/property, and migration notes must call out the resolution for conflicts such as global button base declarations. Source: `apps/web/src/index.css:160-219,1121-1143,6219-6299`; `apps/web/app/[[...slug]]/client-app.tsx:5-13`
- Decision: add project-owned style constraint checks inside `scripts/guard.ts`, reusing the existing guard aggregation model and root command boundary. Source: `scripts/guard.ts:138-151,205-221,401-422`; `AGENTS.md#Root command boundary`
- Decision: allow explicit exceptions for brand assets, SVG illustrations, canvas/user content colors, and color conversion helpers; app UI chrome uses token classes or CSS variables. Source: `apps/web/src/components/AgentIcon.tsx:46-99`; `apps/web/src/components/SketchEditor.tsx:72,144-149`; `apps/web/src/components/FileViewer.tsx:1448-1474`
- Decision: project custom Tailwind tokens cover color, radius, shadow, and font; radius/shadow/font utilities resolve to existing CSS variables so cards, popovers, modals, inputs, buttons, dark-theme shadow overrides, editorial typography, and code/file-path text keep their current visuals; spacing and typography scale use native Tailwind utilities, with exact text-size aliases for current 9px, 10px, 10.5px, 11px, 11.5px, 12.5px, 13px, and 13.5px UI. Source: `specs/change/20260509-token-first-tailwind/token.md`
- Decision: after dependency or config-related package changes, run `pnpm install`, then run package-scoped web validation and repo checks. Source: `AGENTS.md#Validation strategy`; `apps/web/package.json:23-29`
- Decision: migration acceptance uses dual-worktree agent comparison. Every migration PR runs independent web/daemon pairs for the baseline and development worktrees, and the agent checks visual consistency for the same scenarios across both services. Screenshot comparison is the required primary artifact; component source inspection supports diagnosis and traceability for migrated styles. Display drift is fixed or recorded as an approved deviation. Source: `AGENTS.md:40-45,82-89,91-104`; `apps/web/src/index.css:65-157`; `apps/web/src/state/appearance.ts:28-52`

### Why this design

- Existing CSS variables continue to carry visual truth, so light/dark/system themes and custom accent behavior stay stable while Tailwind becomes the component-level composition language.
- After component-level styles in existing TSX migrate to Tailwind classes, day-to-day UI changes mostly land in local component files, reducing global CSS hotspot conflicts.
- Contributors get a constrained Tailwind vocabulary that directly matches the product's warm paper-like visual language.
- Tailwind foundations land first, then guardrails and area-by-area migration complete the TSX class replacement, reducing style refactor risk.
- Dual-worktree agent comparison turns “visual equivalence” into a repeatable migration gate, letting human review focus on approved deviations and product judgment.

### Test Strategy

- Toolchain: run `pnpm install`, then `pnpm --filter @open-design/web build`, proving the Next/Tailwind/PostCSS integration compiles. Source: `apps/web/package.json:23-29`; `AGENTS.md#Validation strategy`
- Type safety: after config and TS guard changes, run `pnpm typecheck` and `pnpm --filter @open-design/web typecheck`. Source: `AGENTS.md#Validation strategy`; `apps/AGENTS.md:39-51`
- Constraint mechanism: add/extend guard coverage for disallowed default palette classes, and add hardcoded UI color detection plus allowlist scaffolding in Phase 1. Existing hardcoded UI colors stay classified as migration inventory or explicit exceptions until the component migration phases tighten enforcement by area; Phase 6 runs the strict app UI check. Source: `scripts/guard.ts:138-151,205-221,401-422`
- Web tests: when adding style-policy helper logic, add focused Vitest coverage under `apps/web/tests/`. Source: `apps/AGENTS.md:19-24`; `apps/web/package.json:23-29`
- Agent visual consistency validation: run `pnpm tools-dev run web --namespace baseline --daemon-port <port> --web-port <port>` in the baseline worktree and `pnpm tools-dev run web --namespace candidate --daemon-port <port> --web-port <port>` in the development worktree; the agent uses agent-browser CLI and Chrome DevTools MCP to compare screenshots for major pages/component areas, fixed viewport, light/dark/system themes, and custom accent across the two services, with component source inspection used to explain differences and confirm class migration traceability. Source: `AGENTS.md:40-45,82-89,91-104`; `apps/web/src/index.css:65-157`; `apps/web/src/state/appearance.ts:28-52`
- Manual visual review: use the agent comparison record to check Dashboard/app shell, project detail, settings dialog, file viewer/inspect overlay, sketch editor, live artifact card, and modal/popover/control states; approved deviations must be included in implementation notes.

### File Structure

- `apps/web/package.json` - add Tailwind/PostCSS dependencies at the web package boundary.
- `apps/web/postcss.config.mjs` - configure the Tailwind v4 PostCSS plugin; this file needs an exact-path allowlist entry in the residual JavaScript guard because the PostCSS config loader consumes a `.mjs` config entry.
- `apps/web/src/index.css` - retain global tokens/base styles, add Tailwind import/theme aliases, add the narrow local border-style reset needed by Tailwind border utilities when Preflight is omitted, and layer or constrain retained element/reset selectors before migrated utilities depend on overriding the same properties.
- `specs/change/20260509-token-first-tailwind/token.md` - record Tailwind color/radius/shadow/font token naming, mapping to existing CSS variables, and the design decision to use native Tailwind utilities for spacing/type.
- `apps/web/src/**/*.tsx` - fully replace migratable global CSS classes with token-first Tailwind classes.
- `scripts/guard.ts` - add the PostCSS config residual JavaScript allowlist and style policy checks to the existing repo guard.
- `apps/web/tests/` - add focused tests when extracting style policy helpers.
- `phase*-notes.md` - each PR slice records commands/results, screenshot artifact links or paths, exact dual-worktree startup parameters or full commands, service URLs, namespace names, agent comparison coverage scenarios, discovered visual drift, and approved deviations.

### Edge Cases

- Custom accent color updates Tailwind-derived accent utilities because the utilities resolve through `var(--accent*)`.
- Dark/system mode continues working because token values still come from `[data-theme="dark"]` and `html:not([data-theme])` media overrides.
- Brand icons, user sketch colors, canvas drawing colors, and file color conversion helpers require explicit allowlist handling.
- Loading shell stays global because it renders before the client SPA component tree is available.
- Existing long-tail global CSS needs classification: component-level styles migrate to TSX, while loading shell, keyframes, third-party/content rendering boundaries, and truly cross-tree styles remain global.

### Guardrail Rules

Guard needs to cover three rule categories and record file scope, match pattern, and reason for every exception.

1. Default Tailwind palette class check: reject default palette utilities such as `text-red-500`, `bg-white`, `border-zinc-200`, `from-orange-500`, and `ring-blue-400` in app UI files. Allowed color utilities come from project tokens exposed through `@theme` in `token.md`.
2. Hardcoded UI color check: Phase 1 adds detection, keyword exemptions, allowlist structure, and fixture/temp-sample validation while existing hardcoded UI colors remain classified as migration inventory or explicit exceptions. Component migration phases then reject unregistered `#hex`, `rgb()`, `rgba()`, `hsl()`, `hsla()`, and real named colors in the areas being migrated. Phase 6 tightens this to the remaining app UI surface after migrated colors are gone. CSS-wide/special keywords such as `transparent`, `currentColor` / `currentcolor`, `inherit`, `initial`, `unset`, and `revert` express transparency, inheritance, or reset semantics, so guard should explicitly exempt them or handle them by property semantics. When real unregistered colors are found, prefer migrating them to Tailwind token classes or CSS variables; any arbitrary color that appears repeatedly should be promoted to a named token.
3. Explicit allowlist check: allow brand assets, SVG illustrations, user accent input, canvas/sketch user colors, user-authored file/inspect color conversion, external document/iframe/popup runtime HTML, and test fixtures. The allowlist should be as narrow as possible, with reasons annotated by file, function, or pattern, so path-level exemptions do not cover normal UI chrome.

### Open Questions

| Question | Resolution point |
| --- | --- |
| Initial style guard allowlist structure and fixture/temp-sample scopes | Phase 1 before guard scaffolding lands |
| Final strict hardcoded-color allowlist and app UI path/pattern scopes | Phase 6 before strict enforcement lands |
| Exact dual-worktree port assignments, scenario matrix, and agent comparison note format | Phase 1 before Phase 2 merges |
| Final retained global CSS inventory | Phase 6 |
| Dynamic class handling policy for each migrated component | During each phase before replacing dynamic class composition |
| Threshold for promoting repeated arbitrary colors to named tokens | Phase 1; default policy is promotion after the second real app UI use |
| Deferred component areas | Before Phase 6 |

## Plan

Each phase maps to one PR. Every PR must be reviewable on its own, keep business logic stable, and include a migrated / retained / deferred class inventory for its slice. Rollback is handled by reverting the PR.

### Phase 1: Foundation PR

Goal: add Tailwind v4 infrastructure, expose Open Design tokens as Tailwind utilities, and land the first style guard scaffolding.

- [x] Step 1: Install Tailwind foundations
  - [x] Substep 1.1 Implement: Add Tailwind v4/PostCSS dependencies to `apps/web/package.json`.
  - [x] Substep 1.2 Implement: Add a web-local PostCSS config for `@tailwindcss/postcss`.
  - [x] Substep 1.3 Implement: Add `apps/web/postcss.config.mjs` to the exact residual JavaScript allowlist in `scripts/guard.ts`, with a comment explaining that the PostCSS/Tailwind config entry needs the `.mjs` compatibility format, keeping `pnpm guard` coverage for planned config files.
  - [x] Substep 1.4 Implement: Import Tailwind theme and utilities layers in `apps/web/src/index.css` with `@layer theme, base, utilities;`, `@import "tailwindcss/theme.css" layer(theme);`, and `@import "tailwindcss/utilities.css" layer(utilities);`, while preserving the existing global entry behavior and excluding Preflight from the foundation slice. Add the narrow local border-style reset in the base layer with `@layer base { *, ::before, ::after, ::backdrop, ::file-selector-button { border: 0 solid; } }` so Tailwind `border` width utilities in the later utilities layer combine with project `border-*` color utilities without requiring `border-solid` on every migrated element. Record the cascade policy that retained element/reset rules which may conflict with migrated utilities must also live in `@layer base`, be constrained to non-migrated scopes, or be removed before the affected elements migrate.
  - [x] Substep 1.5 Verify: Run `pnpm install`.
  - [x] Substep 1.6 Verify: Run `pnpm guard` and confirm the PostCSS config allowlist works.
  - [x] Substep 1.7 Verify: Run `pnpm --filter @open-design/web build`.
- [x] Step 2: Expose Open Design tokens as Tailwind utilities
  - [x] Substep 2.1 Implement: Add CSS-first `@theme` aliases for colors, core semantic status, selection/inspect overlays, radius, shadow, font tokens, and exact existing UI text-size aliases; use native Tailwind utilities for spacing and standard typography scale. Confirm token border examples such as `border border-border` render against the local border-style reset when Preflight is omitted.
  - [x] Substep 2.2 Implement: Clear default Tailwind colors and declare the project-approved color namespace.
  - [x] Substep 2.3 Implement: Document the token class vocabulary near the theme block.
  - [x] Substep 2.4 Verify: Confirm light, dark, system, and custom accent modes all resolve through the same CSS variables.
  - [x] Substep 2.5 Verify: Run `pnpm --filter @open-design/web build`.
- [x] Step 3: Add base style guardrails
  - [x] Substep 3.1 Implement: Add a default Tailwind palette class check for app UI code in `scripts/guard.ts`.
  - [x] Substep 3.2 Implement: Add hardcoded UI color check scaffolding covering `#hex`, `rgb()`, `rgba()`, `hsl()`, `hsla()`, and named colors. In Phase 1, keep existing hardcoded UI colors classified as migration inventory or explicit exceptions, and validate the checker through focused fixtures or temporary scoped samples so `pnpm guard` stays green until component migration phases tighten enforcement.
  - [x] Substep 3.2a Implement: Exempt CSS-wide/special keywords such as `transparent`, `currentColor` / `currentcolor`, `inherit`, `initial`, `unset`, and `revert` in the named-color check so ghost buttons, SVG current-color, and inherit/reset states pass by semantics.
  - [x] Substep 3.3 Implement: Add an explicit allowlist mechanism covering brand assets, SVG illustrations, user accent input, canvas/sketch user colors, user-authored file/inspect colors, external runtime documents, and tests/fixtures.
  - [x] Substep 3.4 Implement: If helpers need extraction, add focused tests under `apps/web/tests/`; test fixtures must cover `transparent`, `currentColor` / `currentcolor`, `inherit`, `initial`, `unset`, and `revert` passing, and real unregistered named colors failing.
  - [x] Substep 3.5 Verify: Run `pnpm guard` and confirm the hardcoded-color scaffolding does not fail known migration inventory items such as legacy `SettingsDialog` fallbacks or component colors still scheduled for later phases.
  - [x] Substep 3.6 Verify: Temporarily write a default Tailwind native color class in a TSX file, such as `text-red-500`, confirm `pnpm guard` detects it and fails, then remove the temporary code.
  - [x] Substep 3.7 Verify: Temporarily write an unallowlisted hardcoded color in a guard fixture or temporary scoped sample, such as `style={{ color: '#ff0000' }}`, confirm `pnpm guard` detects it and fails, then remove the temporary code.
  - [x] Substep 3.8 Verify: Run `pnpm --filter @open-design/web test`.
- [x] Step 4: Build migration inventory and agent visual comparison prep
  - [x] Substep 4.1 Implement: Generate an inventory of global CSS classes referenced in `apps/web/src/**/*.tsx` and map them to definitions in `apps/web/src/index.css`.
  - [x] Substep 4.2 Implement: Classify classes as component-level migratable styles, global base styles, loading shell, keyframes/animation, content-level/third-party boundary styles, and retained exceptions; identify unlayered element selectors that set properties planned for Tailwind utilities, such as global `button` base rules, and assign each one a remove, constrain, or move-to-`@layer base` resolution before its affected TSX migration slice.
  - [x] Substep 4.3 Implement: Record the corresponding token-first Tailwind utility combination or migration note for each component-level class.
  - [x] Substep 4.4 Implement: Define style guard allowlist entries, path/pattern scopes, and the repeated arbitrary color promotion threshold.
  - [x] Substep 4.5 Verify: Confirm the migration inventory covers all global classes referenced by TSX; the migration inventory is an implementation reference, while actual migration scope and classification follow the current code at implementation time, with on-the-spot judgment for classes added or changed after rebase.
  - [x] Substep 4.6 Verify: Run `pnpm guard`, `pnpm typecheck`, `pnpm --filter @open-design/web test`, and `pnpm --filter @open-design/web build`.
- [x] Step 5: Establish the dual-worktree agent visual comparison workflow
  - [x] Substep 5.1 Implement: Define the agent comparison scenario list, viewport, theme/accent matrix, fixture data, dual-worktree namespace values and port assignments, screenshot artifact requirements, component source inspection guidance, and phase notes format.
  - [x] Substep 5.2 Implement: Prepare startup instructions for the baseline and development worktrees: run `pnpm tools-dev run web --namespace baseline --daemon-port <baseline-daemon-port> --web-port <baseline-web-port>` in the baseline worktree and `pnpm tools-dev run web --namespace candidate --daemon-port <candidate-daemon-port> --web-port <candidate-web-port>` in the development worktree so each web/daemon pair has independent runtime files and IPC sockets.
  - [x] Substep 5.3 Verify: In Phase 1, have an agent equipped with agent-browser CLI and Chrome DevTools MCP smoke-compare the workflow definition against a Dashboard/app shell baseline-vs-development run so the dual-worktree process, screenshot artifact shape, and comparison notes format are proven end to end.
  - [ ] Substep 5.4 Verify: The full migration gate for follow-up slices remains the complete scenario and theme matrix: Dashboard/app shell, project detail, settings dialog, file viewer/inspect overlay, sketch editor, live artifact card, and modal/popover/control states under light, dark, system, and custom accent. When layout offset, token color drift, radius/shadow differences, or theme-state differences appear, fix the styles or record an approved deviation.
  - [x] Substep 5.5 Implement: In `phase1-notes.md`, record foundation changes, migration inventory, dual-worktree service URLs, agent comparison coverage scenarios, discovered issues, and approved deviations.

### Phase 2: Shell and common controls PR

Goal: migrate app shell, buttons, inputs, cards, popovers, and modals using token-backed colors/radius/shadows.

- [ ] Step 6: Migrate shell and common controls
  - [ ] Substep 6.1 Implement: Replace component-level global classes for app shell, buttons, inputs, cards, popovers, and modals with token-first Tailwind classes according to the migration inventory and `token.md` migration rules, including font aliases, exact text-size aliases, and retained element/reset selector resolution before applying utilities to affected elements.
  - [ ] Substep 6.2 Implement: For common UI that depends on `--radius*` and `--shadow*`, use variable-backed Tailwind utilities such as `rounded-card`, `rounded-panel`, `rounded-token-pill`, `shadow-token-sm`, and `shadow-token-md`.
  - [ ] Substep 6.3 Implement: When retaining necessary dynamic class composition, use a complete static class map; cases that need runtime-generated classes must have explicit safelist and guard/test coverage.
  - [ ] Substep 6.4 Implement: Remove component-level class definitions migrated in this phase from `index.css`, while retaining styles still used by global boundaries.
  - [ ] Substep 6.5 Verify: Confirm shell/common controls stay visually stable through CSS variables under light, dark, system, and custom accent modes.
  - [ ] Substep 6.6 Verify: Run `pnpm guard`, `pnpm typecheck`, `pnpm --filter @open-design/web test`, and `pnpm --filter @open-design/web build`.
- [ ] Step 7: Agent-validate shell and common controls visual equivalence
  - [ ] Substep 7.1 Verify: Start one web/daemon pair in the baseline worktree and one in the development worktree with distinct `--namespace`, `--daemon-port`, and `--web-port` values; have the agent use agent-browser CLI and Chrome DevTools MCP to compare shell/common controls screenshots, with component source inspection used as supporting context for any drift.
  - [ ] Substep 7.2 Implement: In `phase2-notes.md`, record this phase's migrated / retained / deferred class list, dual-worktree service URLs, agent comparison results, and approved deviations.

### Phase 3: Settings and project panels PR

Goal: migrate settings dialogs, project creation, project detail panels, and status surfaces.

- [ ] Step 8: Migrate settings and project panel areas
  - [ ] Substep 8.1 Implement: Replace component-level global classes for settings dialog, project creation, project detail panels, and status surfaces with token-first Tailwind classes according to `token.md` migration rules, including font aliases, exact text-size aliases, and retained element/reset selector resolution before applying utilities to affected elements.
  - [ ] Substep 8.2 Implement: Migrate legacy token fallbacks in `SettingsDialog` and governable hardcoded colors in project panels to current tokens or Tailwind utilities.
  - [ ] Substep 8.3 Implement: Use semantic token utilities such as `success`, `info`, `discovery`, `danger`, and `warning` for status surfaces.
  - [ ] Substep 8.4 Implement: Remove component-level class definitions migrated in this phase from `index.css`, while retaining explicitly documented retained styles.
  - [ ] Substep 8.5 Verify: Cover visual checks for settings dialog, project creation, project detail, and status surfaces under light/dark/system/custom accent.
  - [ ] Substep 8.6 Verify: Run `pnpm guard`, `pnpm typecheck`, `pnpm --filter @open-design/web test`, and `pnpm --filter @open-design/web build`.
- [ ] Step 9: Agent-validate settings and project panel visual equivalence
  - [ ] Substep 9.1 Verify: Start one web/daemon pair in the baseline worktree and one in the development worktree with distinct `--namespace`, `--daemon-port`, and `--web-port` values; have the agent use agent-browser CLI and Chrome DevTools MCP to compare settings/project panel screenshots, with component source inspection used as supporting context for any drift.
  - [ ] Substep 9.2 Implement: In `phase3-notes.md`, record this phase's migrated / retained / deferred class list, dual-worktree service URLs, agent comparison results, and approved deviations.

### Phase 4: File viewer, inspect, and edit-mode PR

Goal: migrate file viewer chrome, inspect/comment overlays, and edit-mode integration to token-first utilities while keeping user-authored file color conversion helpers allowlisted.

- [ ] Step 10: Migrate file viewer and inspect/edit-mode overlays
  - [ ] Substep 10.1 Implement: Replace component-level global classes for file viewer app chrome with token-first Tailwind classes according to `token.md` migration rules, including font aliases, exact text-size aliases, and retained element/reset selector resolution before applying utilities to affected elements.
  - [ ] Substep 10.2 Implement: Migrate inspect/comment overlays to `selection`/`inspect` tokens, such as `bg-selection-overlay`, `border-selection-outline`, `ring-selection-outline`, and `bg-inspect-overlay`.
  - [ ] Substep 10.3 Implement: Keep file color conversion helpers and user-authored content colors in a narrow allowlist, annotated with a runtime/user-content reason.
  - [ ] Substep 10.4 Implement: Remove component-level class definitions migrated in this phase from `index.css`, while retaining file/user-content boundary styles.
  - [ ] Substep 10.5 Verify: Cover visual checks for file viewer, inspect overlay, comment/selection overlay, and edit-mode integration under light/dark/system/custom accent.
  - [ ] Substep 10.6 Verify: Run `pnpm guard`, `pnpm typecheck`, `pnpm --filter @open-design/web test`, and `pnpm --filter @open-design/web build`.
- [ ] Step 11: Agent-validate file viewer and inspect/edit-mode overlays visual equivalence
  - [ ] Substep 11.1 Verify: Start one web/daemon pair in the baseline worktree and one in the development worktree with distinct `--namespace`, `--daemon-port`, and `--web-port` values; have the agent use agent-browser CLI and Chrome DevTools MCP to compare file viewer/inspect/edit-mode screenshots, with component source inspection used as supporting context for any drift.
  - [ ] Substep 11.2 Implement: In `phase4-notes.md`, record this phase's migrated / retained / deferred class list, dual-worktree service URLs, agent comparison results, and approved deviations.

### Phase 5: Sketch, runtime content, and external document PR

Goal: migrate app chrome around sketch canvases and runtime surfaces while retaining user content, iframe, popup, generated runtime HTML, and fixtures under explicit exceptions.

- [ ] Step 12: Migrate sketch and runtime content boundaries
  - [ ] Substep 12.1 Implement: Replace component-level global classes for sketch editor app chrome, runtime surfaces, live artifact card, and related controls with token-first Tailwind classes according to `token.md` migration rules, including font aliases, exact text-size aliases, and retained element/reset selector resolution before applying utilities to affected elements.
  - [ ] Substep 12.2 Implement: Keep sketch/canvas user drawing colors, external document, iframe, popup, generated runtime HTML, and fixtures in the explicit allowlist, annotated with boundary reasons.
  - [ ] Substep 12.3 Implement: Use app token utilities for canvas-adjacent UI; canvas data and user content keep data semantics.
  - [ ] Substep 12.4 Implement: Remove component-level class definitions migrated in this phase from `index.css`, while retaining content-wide, iframe/runtime, and fixture boundary styles.
  - [ ] Substep 12.5 Verify: Cover visual checks for sketch editor, runtime content surface, live artifact card, iframe/popup boundary, and generated runtime HTML under light/dark/system/custom accent.
  - [ ] Substep 12.6 Verify: Confirm global loading shell, base styles, keyframes, and content-wide CSS in `index.css` continue to work.
  - [ ] Substep 12.7 Verify: Run `pnpm guard`, `pnpm typecheck`, `pnpm --filter @open-design/web test`, and `pnpm --filter @open-design/web build`.
- [ ] Step 13: Agent-validate sketch and runtime content boundary visual equivalence
  - [ ] Substep 13.1 Verify: Start one web/daemon pair in the baseline worktree and one in the development worktree with distinct `--namespace`, `--daemon-port`, and `--web-port` values; have the agent use agent-browser CLI and Chrome DevTools MCP to compare sketch/runtime/live artifact screenshots, with component source inspection used as supporting context for any drift.
  - [ ] Substep 13.2 Implement: In `phase5-notes.md`, record this phase's migrated / retained / deferred class list, dual-worktree service URLs, agent comparison results, and approved deviations.

### Phase 6: Cleanup and enforcement PR

Goal: remove migrated component-level selectors, tighten guard allowlists, refresh baseline counts, and record retained/deferred globals.

- [ ] Step 14: Final cleanup and strict enforcement
  - [ ] Substep 14.1 Implement: Consolidate migrated / retained / deferred class lists from all phases, and confirm the retained global CSS inventory, reasons, and follow-up points.
  - [ ] Substep 14.2 Implement: Delete remaining migrated component-level selectors and tighten the style guard allowlist to actual file scopes, pattern scopes, and reasons.
  - [ ] Substep 14.2a Implement: Enable strict hardcoded UI color enforcement for the remaining app UI surface after migrated colors have been removed or explicitly classified.
  - [ ] Substep 14.3 Implement: Refresh the line count for `apps/web/src/index.css`, CSS class selector count, `apps/web/src/**/*.tsx` file count, and `className=` occurrence baseline.
  - [ ] Substep 14.4 Implement: Record final implementation notes, migration inventory results, and any approved deviations in `phase6-notes.md`.
  - [ ] Substep 14.5 Verify: Run `pnpm guard`.
  - [ ] Substep 14.6 Verify: Run `pnpm typecheck`.
  - [ ] Substep 14.7 Verify: Run `pnpm --filter @open-design/web test`.
  - [ ] Substep 14.8 Verify: Run `pnpm --filter @open-design/web build`.
- [ ] Step 15: Agent-validate final visual equivalence
  - [ ] Substep 15.1 Verify: Start one web/daemon pair in the baseline worktree and one in the development worktree with distinct `--namespace`, `--daemon-port`, and `--web-port` values; have the agent use agent-browser CLI and Chrome DevTools MCP run the full screenshot scenario matrix, use component source inspection as supporting context, and confirm the visuals are consistent before and after the refactor or deviations have been approved.
  - [ ] Substep 15.2 Implement: In `phase6-notes.md`, record final dual-worktree service URLs, agent comparison results, and any approved deviations.

## Notes

Phase notes are split by PR phase so each implementation slice can update its own notes file:

- `phase1-notes.md` - Foundation PR notes, migration inventory, and agent visual comparison setup.
- `phase2-notes.md` - Shell/common controls migration notes and agent visual comparison results.
- `phase3-notes.md` - Settings/project panels migration notes and agent visual comparison results.
- `phase4-notes.md` - File viewer/inspect/edit-mode migration notes and agent visual comparison results.
- `phase5-notes.md` - Sketch/runtime content migration notes and agent visual comparison results.
- `phase6-notes.md` - Cleanup/enforcement notes, final retained global CSS inventory, final agent visual comparison results, and approved deviations.
