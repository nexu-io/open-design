<!-- Required for issue/PR auto-link. Use Fixes / Closes / Resolves so the
     linked issue closes on merge and release-time reverse lookup works.
     Delete this whole block if the PR genuinely doesn't close any issue. -->
Fixes #

## Why

<!-- Why are you opening this PR? Cover two things:
       - Your use case — what made you write this today? Did you hit it yourself
         while building on top of OD, are you scratching an itch for a team, or
         are you speculatively adding for others? All are fine, but say which.
       - The pain being addressed — user-facing problem, technical debt, a prod
         issue, or unblocking another change.
     For non-trivial features, please open a discussion or issue first to align
     on scope and UX before writing code. -->


## What users will see

<!-- Describe the change from a user's perspective, not in code terms. Examples:
       - "Settings → AI Providers has a new 'Custom endpoint' field, off by default"
       - "Right-clicking a design file shows a new 'Duplicate' option"
       - "Default model changed from X to Y — existing users will notice on first launch"
       - "New `od skills install <name>` subcommand"
     Skip this section only if you check "None" below. -->


## Surface area

<!-- Check every box that applies. Reviewers use this to scope the review. -->

- [ ] **UI** — new page / dialog / panel / menu item / setting / empty state in `apps/web` or `apps/desktop` (including Electron menu bar)
- [ ] **Keyboard shortcut** — new or changed
- [ ] **CLI / env var** — new `od` subcommand or flag, new `tools-dev` / `tools-pack` / `tools-pr` flag, or new `OD_*` env var
- [ ] **API / contract** — new `/api/*` endpoint, new SSE event, or changed shape in `packages/contracts`
- [ ] **Extension point** — new entry under `skills/`, `design-systems/`, `design-templates/`, or `craft/`, or change to the skills protocol
- [ ] **i18n keys** — added new translation keys (see `TRANSLATIONS.md` for the locale workflow)
- [ ] **New top-level dependency** — adding any new entry to the **root** `package.json` (`dependencies` or `devDependencies`); workspace-package `package.json` files are out of scope. Include a paragraph on what we get vs. what bytes we ship (see `CONTRIBUTING.md` → Code style)
- [ ] **Default behavior change** — changes what existing users experience without opting in (default model, default setting, file/SQLite schema, auto-network on startup, auto-install)
- [ ] **None** — internal refactor, docs, tests, or translation update only


## Screenshots

<!-- If you checked "UI" above, attach screenshots showing the entry point —
     where users discover the change — not just the feature in isolation.
     Before/after is best for behavior changes. Short GIFs welcome. -->


## Bug fix verification

<!-- Skip if this PR isn't a bug fix.

     Per AGENTS.md → "Bug follow-up workflow", bugs should be encoded as a
     falsifiable test that goes red before the source change. Confirm:
       - Test path that reproduces the bug:
       - Did the test go red on `main` and green on this branch? (yes / no)
       - If a red spec wasn't cheap to write, explain why and what verification
         you did instead. -->

-


## Validation

<!-- What you actually ran. Default minimum: `pnpm guard` + `pnpm typecheck`,
     plus the package-scoped tests/build for the files you changed
     (e.g. `pnpm --filter @open-design/web test`). -->

-
