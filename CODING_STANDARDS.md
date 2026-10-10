# Coding standards

Load this document for code, UI, tests, and validation. The nearest path-local
`AGENTS.md` wins for a component or package contract. Executable checks and
package configuration win over prose when they disagree.

## Language and file policy

- Use single quotes in JavaScript and TypeScript unless escaping makes the
  string less readable.
- Write code comments in English. Explain non-obvious intent, constraints, or
  decisions; omit comments that only narrate the next line.
- Use TypeScript for project-owned entrypoints, modules, scripts, tests,
  reporters, and configs. New `.js`, `.mjs`, or `.cjs` files require a
  documented generated, vendored, or compatibility reason and must pass
  `pnpm guard`.
- Do not add a top-level dependency without explaining its value and shipped
  cost in the PR description.

## Architecture coding boundaries

- Keep tests in the owning `tests/` directory, not under `src/`. Put cross-app
  and cross-runtime checks in the repository E2E suites.
- Do not import another app's private implementation. Use HTTP APIs,
  `packages/contracts`, or an app-local provider boundary.
- Keep `packages/contracts` pure TypeScript. It must not depend on framework,
  filesystem, browser, SQLite, daemon, or sidecar-runtime internals.
- Keep app business logic independent from sidecar control-plane concepts.
  Orchestrators call package primitives instead of assembling process flags,
  paths, or scans themselves.

## Web CSS ownership

- `apps/web/src/index.css` is import-only. Add a selector there only when a
  truly global stylesheet is required, and preserve import order.
- Put shared global styles in `apps/web/src/styles/`, grouped by owner. New
  component styles belong in a colocated `Component.module.css`.
- Keep global selectors only for deliberate shared contracts, theme hooks,
  third-party content, or cross-component layout. Document new global groups.
- Preserve cascade semantics during CSS refactors. Verify import order and run
  focused typecheck, build, test, or visual checks for the affected path.

## Web component reuse

- Reuse a primitive from `@open-design/components` when it exists. Use
  `Button` for buttons and `VisuallyHidden` for screen-reader-only content.
- Do not add new raw primitive classes such as `primary`, `ghost`, `subtle`,
  `icon-btn`, or `sr-only`.
- Add a small focused shared primitive when a missing primitive is genuinely
  reusable. Keep product layout and workflow styling in the owning app.
- Keep semantic HTML for content and controls that shared primitives do not
  model. Do not force a migration that hides native behavior.

## i18n keys

Add a user-visible web string to `apps/web/src/i18n/types.ts` first, then add
the key to every locale file under `apps/web/src/i18n/locales/`. Run the web
checks that prove dictionary coverage. Follow `TRANSLATIONS.md` for locale-wide
maintenance.

## Motion

- Prefer the shared ease-out curve `cubic-bezier(0.23, 1, 0.32, 1)` for UI
  transitions. Keep enter and exit durations asymmetric when the interaction
  benefits from a decisive exit.
- Use the shared `grid-template-rows: 0fr -> 1fr` accordion pattern for
  auto-height disclosure. Pair it with opacity and the shared easing.
- Start scale transitions at `scale(0.9)` or higher with opacity. Preserve the
  exit transition by keeping conditionally visible elements mounted and
  toggling a class.
- Preserve the component's existing reduced-motion behavior for any new
  animated interaction.

## Validation

Before marking work ready, run `pnpm guard` and `pnpm typecheck`, then run the
package-scoped checks that match the changed files. Use the owning local
`AGENTS.md` for additional checks.

- Run `pnpm install` after changing package manifests, workspace layout, or
  command-entry and bin/link content.
- For agent-stream or parser changes, replay a recorded session through the
  matching mock CLI in `mocks/` and verify the event shape round trip.
- Use the existing `tools-dev` and E2E harnesses. Do not hand-spawn lifecycle
  processes from tests or add root `pnpm test` / `pnpm build` aliases.
- For desktop, namespace, path, or log changes, follow the inspection matrix in
  the relevant `apps/` or `tools/` guide and validate the user-visible path.
- Run `git diff --check` before handing off documentation or code changes.

## Bug fixes and review evidence

- Start with a falsifiable red spec when the symptom can be expressed cheaply.
  Use the lightest test layer that can observe the defect.
- Keep the fix within the described scope. Record adjacent issues separately
  instead of expanding the patch.
- Prefer a named invariant or helper over a history comment and a local guard.
- Compare against the baseline when neighboring suites already fail. Do not
  claim a clean result without separating pre-existing failures.
- For visible UI, platform, animation, or race behavior, provide human-checkable
  evidence in addition to automated tests.
- Link the issue from a bug-fix PR when an issue exists. Fill the repository PR
  template and state the exact validation performed.

## Conditional implementation guides

- Prompt changes: read `docs/prompt-composition.md` before editing any prompt
  implementation or OD Next scenario asset.
- Runtime streams and physical runs: read `apps/daemon/AGENTS.md` and its
  fixture guidance.
- Chat UI: read `apps/web/src/components/chat/AGENTS.md` and the current chat
  specs. Keep product decisions in those documents, not in this style guide.

