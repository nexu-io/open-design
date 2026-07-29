# Code review guidelines

Use code review to protect repository boundaries, keep changes easy to maintain, and catch regressions before they reach users. Reviews should be direct, specific, and grounded in current repository rules.

## How to use this document

- **Authors**: self-review against this document before requesting review. Confirm the PR passes the [Product relevance test](#1-product-relevance-test), name the boundary you own, and run the validation expected for that boundary.
- **Reviewers**: walk the document top-down — relevance test → forbidden surfaces → ownership/scope → matching lane → checklist → comments → approval bar.
- **Maintainers**: only maintainers should [close a PR instead of requesting changes](#close-instead-of-request-changes-maintainer-only).

Authoritative rules live in `AGENTS.md` and the directory-level `AGENTS.md` files; this document is the operational guide on top of them. When the two disagree, `AGENTS.md` wins and this document should be updated.

## Terminology

- **Reject** — close the PR; the change is not salvageable on the existing branch (see [Close instead of request changes](#close-instead-of-request-changes-maintainer-only)).
- **Block** — request changes that must be addressed before approval.
- **Split** — ask the author to break the PR into separate, focused PRs.

`tools/dev` and `tools/pack` are the directory names; `pnpm tools-dev` and `pnpm tools-pack` are the corresponding command surfaces.

## What `pnpm guard` already checks

Reviewers do not need to manually check rules that `pnpm guard` enforces. The authoritative source for what guard catches is its implementation in `scripts/guard.ts`; the list below reflects that script at the time of writing and may drift — when in doubt, read the script.

- TypeScript-first rule for project-owned entrypoints, modules, scripts, tests, reporters, and configs.
- New `.js`, `.mjs`, or `.cjs` files outside the documented allowlist (generated output, vendored deps, explicit compatibility build artifacts).

Trust guard for these. Focus review attention elsewhere.

## 1. Product relevance test

Run this test **before** reviewing implementation details. A PR passes only when the changed behavior is visible in, required by, or directly validates an Open Design–owned surface.

A PR passes the relevance test when **all** of the following hold:

- The PR description identifies the Open Design feature, command, protocol, package, resource format, or runtime path being changed.
- Tests exercise existing Open Design flows through their public seams: artifact generation/rendering via documented daemon APIs, daemon HTTP/SSE endpoints, web UI on shipped routes, desktop/packaged launch behavior, sidecar status/IPC, `tools-dev`/`tools-pack` lifecycle commands, skills/design-system/craft resource loading, or documented cross-boundary smoke behavior. Rendering domain content through a generic primitive does **not** count.
- Tests target real routes, DOM, APIs, commands, fixtures, and user flows that exist in this repository.
- Tests use the repository's existing harness, base URL, and lifecycle conventions — not hard-coded standalone app URLs.
- Test assertions provide real signal. Tautological assertions (e.g. `expect(x + y).toBeGreaterThanOrEqual(0)`) are not coverage.
- New sample content is a maintained fixture for an Open Design capability, minimal enough to support the test, and stored under the [first-party fixture rule](#first-party-fixture-rule).
- New scripts use the documented `pnpm tools-dev` or `pnpm tools-pack` control plane and belong to an existing owned package/tool. Ad hoc launchers that hard-code local paths or assume user-specific tools are out of scope.

Domain-specific UI or content (a customer vertical, marketing experiment, unrelated rendering demo, arbitrary product page) is out of scope unless it is explicitly a first-party Open Design fixture and the PR explains which Open Design capability it validates.

### Repository governance documentation

Governance documents — `AGENTS.md` files, contribution guides, review guidelines, validation strategy, repository workflow rules, and similar meta-documentation — are in scope when they clarify how this repository already operates and do not conflict with the authoritative `AGENTS.md` chain. They satisfy the relevance test by naming the existing repository surface they document (a boundary, command, lifecycle rule, validation expectation, or workflow) instead of pointing at a feature/command/protocol/runtime path. A governance PR that introduces new repository rules — rather than describing existing ones — must update the authoritative `AGENTS.md` first and is reviewed under that lane.

### First-party fixture rule

A fixture qualifies as first-party only when **all three** are true:

1. It lives in `skills/`, `design-systems/`, `craft/`, the owning package's `tests/` directory, or `e2e/resources/`.
2. It is referenced by a maintained test or runtime path.
3. The PR description names that consumer.

### Close instead of request changes (maintainer-only)

A maintainer (not any reviewer) may close instead of requesting changes when **any** of these are true and the core change is not salvageable on the existing branch:

- The target product is wrong (PR builds a separate app, demo, or customer vertical).
- The test harness is for another app.
- The DOM/API assumptions do not exist in this repo.
- Scripts conflict with repository lifecycle rules in a way that requires rebuilding the change from scratch.

A generally reasonable direction (e.g. "add Arabic/RTL coverage") is **not** sufficient justification to keep an unsalvageable PR open. Close with a comment that names which condition was met and asks for a fresh PR that uses the actual Open Design app and harness. If the contributor disputes the close, escalate to another maintainer rather than reopening unilaterally.

## 2. Forbidden surfaces

This is the canonical list. Any PR that recreates one of these is out of scope until the surface is removed:

- Removed app and package boundaries: `apps/nextjs`, `packages/shared`.
- Root lifecycle aliases: `pnpm dev`, `pnpm dev:all`, `pnpm daemon`, `pnpm preview`, `pnpm start`.
- Root aggregate aliases: `pnpm test`, `pnpm build`.
- Root e2e aliases (e2e commands belong in the `e2e/` package — see `e2e/AGENTS.md`).
- Cross-app private imports — for example, `apps/web/**` importing `apps/daemon/src/**`.
- Shared web/daemon API shapes placed anywhere other than `packages/contracts`.
- Next.js, Express, Node filesystem/process APIs, browser APIs, SQLite, daemon internals, or sidecar control-plane dependencies added to `packages/contracts`.
- App business logic depending on sidecar concepts (runtime mode, namespace, IPC, source, stamp flags, sidecar packages, control-plane protocols).
- Open Design app/mode/source/stamp details hard-coded inside generic `packages/sidecar` or `packages/platform` code.
- Hand-built sidecar stamp flags, process-scan regexes, runtime tokens, or namespace/source arguments in orchestration layers (must use package primitives).
- Daemon or web ports used to decide packaged data, log, runtime, cache, or namespace-scoped paths.

## 3. Ownership and scope

Treat scope as an approval gate. This repository is for Open Design itself: the local web/daemon/desktop product, its sidecar and packaging infrastructure, shared contracts, development/release tools, e2e coverage of those surfaces, and first-party skills/design-system/craft resources consumed by that product.

Accept a PR only when its boundary is clear, why the change belongs here is clear, and validation proves the touched boundary still works.

### In scope

A PR is in scope when it passes the [Product relevance test](#1-product-relevance-test) and matches one of these patterns:

**Single primary ownership area:**

- `apps/web` — Next.js App Router UI, browser runtime behavior, web-local provider integration.
- `apps/landing-page` — first-party marketing site workspace package with its own documented boundaries and commands.
- `apps/daemon` — local privileged daemon APIs, SSE, agent spawning, SQLite persistence, skills/design-system/resource serving, artifacts, credentials storage, static serving, daemon CLI.
- `apps/desktop` — Electron shell that discovers runtime state through sidecar IPC.
- `apps/packaged` — packaged Electron entry, packaged sidecar startup, runtime integration, `od://` entry glue.
- `packages/contracts` — pure TypeScript web/daemon DTOs, request/response shapes, SSE event unions, task shapes, errors, example payloads.
- `packages/sidecar-proto` — Open Design sidecar business protocol; app/mode/source constants, namespace validation, stamp fields/flags, IPC message schema, status shapes, error semantics.
- `packages/sidecar` — generic sidecar bootstrap, IPC transport, path/runtime resolution, launch environment, JSON runtime-file primitives.
- `packages/platform` — generic OS process primitives, stamp serialization, command parsing, process matching/search.
- `tools/dev` — local development lifecycle control plane.
- `tools/pack` — packaged build, install, start, stop, logs, release-artifact control plane.
- `e2e` — user-level smoke tests, cross-app/cross-runtime checks, Playwright UI automation.
- `skills/`, `design-systems/`, `craft/` — project resource and content updates within their documented responsibilities.

**Multi-area changes** are in scope when they cross a public seam: an HTTP API, shared contract DTO, sidecar protocol, package primitive, command surface, persisted format, or resource format. The owning contract/protocol/primitive must change first, before app-specific behavior is wired against it.

Every in-scope PR must also:

- Keep source/test placement, TypeScript-first rules, runtime path conventions, and command boundaries intact.
- Include validation proportional to the changed boundary (see [Approval bar](#7-approval-bar)).

### Out of scope

A PR is out of scope when it does any of the following — block or require a split:

- Piggybacks unrelated cleanup, formatting, dependency churn, migrations, or feature work onto a focused fix.
- Adds tests, fixtures, scripts, or UI for a separate product/domain that does not exercise an existing Open Design feature.
- Recreates anything in [Forbidden surfaces](#2-forbidden-surfaces).
- Adds tests under `src/`, puts package/app tests outside the package-level `tests/` directory, puts Playwright UI tests outside `e2e/ui/`, or moves app-owned component coverage into e2e.
- Adds feature-depth scenarios to `e2e/specs/` instead of `e2e/tests/` (see `e2e/AGENTS.md` for the test-pyramid rules).
- Changes skills, design systems, or craft content in a way that requires new runtime semantics without updating the daemon/resource contract and validation.
- Introduces speculative abstractions, new packages, new lifecycle entrypoints, broad architecture rewrites, or cross-cutting migrations without a current product need and explicit ownership.
- Changes generated output, vendored files, or compatibility JavaScript without the documented reason required by `AGENTS.md`.

## 4. Review lanes

After the relevance test passes, apply the lane that matches the PR. PRs that span lanes must satisfy each relevant lane and should still have one clear primary owner.

### 4.1 Default (code, tests, command surfaces)

For TypeScript source, package/tool/app behavior, tests, command surfaces, runtime paths, packaging, and e2e automation.

**Accept when:**

- The change belongs to an existing ownership area or updates the public seam connecting them.
- Shared behavior lives in the owning package instead of being copied across app internals.
- Tests are placed in the owning layer: package/app/tool tests in sibling `tests/`, Playwright UI automation in `e2e/ui/`, cross-boundary checks in `e2e/tests/`, PR/release smoke in `e2e/specs/`.
- Validation covers the changed surface (see [Approval bar](#7-approval-bar)).

**Block when:**

- Unrelated refactors, dependency churn, formatting sweeps, or broad migrations hide the actual product change.
- The PR bypasses contracts/protocols/package primitives or documented lifecycle tools to reach across boundaries.
- New runtime or command entrypoints duplicate `tools-dev`, `tools-pack`, package-scoped commands, or documented e2e commands.

### 4.2 Contract and protocol changes

For any change to `packages/contracts`, `packages/sidecar-proto`, persisted SQLite schema, or other public seams (HTTP routes, SSE event unions, IPC message shapes, on-disk resource formats).

**Accept when:**

- The contract/protocol/schema change lands **before** consumers wire against it (or in the same PR with both sides updated).
- Changes are backwards-compatible, OR there is an explicit migration plan: schema migration script, backfill strategy, or one-release window of compatible reads.
- `packages/contracts` stays free of Next.js, Express, Node filesystem/process APIs, browser APIs, SQLite, daemon internals, and sidecar control-plane dependencies.
- Sidecar process stamps still have exactly five fields: `app`, `mode`, `namespace`, `ipc`, `source`.
- Both producers and consumers have type/test coverage of the new shape.

**Block when:**

- Web and daemon are wired to divergent shapes without updating `packages/contracts` first.
- A breaking persisted-format change ships with no migration and no compatibility window.
- SSE event shapes, error shapes, or task shapes change in app code instead of in `packages/contracts`.

### 4.3 Design-system additions (`design-systems/`)

**Accept when:**

- The entry is a folder containing a `DESIGN.md`; no code changes, custom loaders, or special runtime handling required to appear after refresh.
- The first H1 is the picker title; the next line uses the documented metadata shape when grouping is needed: `> Category: <Group>` followed by a short summary.
- The category is an existing dropdown group from `design-systems/README.md`, or a deliberate new group with a clear reason.
- Brand-inspired systems use normalized ASCII slugs (`linear.app` → `linear-app`, `x.ai` → `x-ai`).
- Content covers the comparable `DESIGN.md` concerns used by existing systems (visual theme, color, typography, spacing/layout, component tone, interaction guidance, accessibility expectations).
- Imported/bundled sets preserve their normalized shape (e.g. the 9-section `DESIGN.md` for sourced design skills).
- Brand-inspired systems are framed as aesthetic inspirations, not official assets or endorsements.
- Source, license, and attribution are documented when content is adapted from upstream.
- New assets are minimal, license-safe, intentionally named, and referenced by the [first-party fixture rule](#first-party-fixture-rule).

**Block when:**

- The "design system" is actually a customer/product page, marketing experiment, or unrelated visual collection.
- It omits `DESIGN.md`, has malformed metadata, uses a non-normalized slug, or won't appear cleanly in the picker.
- It deviates from existing entries' shape without updating the documented resource contract, importer flow, README, and validation.
- It requires runtime behavior, custom loaders, or app-specific assumptions not part of the design-system resource model.
- It imports official/proprietary brand assets, unclear-license material, or large unreferenced assets.

### 4.4 Skill additions (`skills/`)

**Accept when:**

- The skill supports design work in Open Design — artifact generation, visual design, layout, branding, design-system application, interaction design, accessibility review, design critique.
- It follows the structure and metadata conventions of existing first-party skills, including the skills protocol front-matter (e.g. `od.craft.requires` when relevant).
- Instructions are general-purpose enough for Open Design workflows, not a single unrelated external service or business process.
- Examples and fixtures are minimal, design-relevant, and satisfy the [first-party fixture rule](#first-party-fixture-rule).
- Runtime expectations match the existing skills protocol and daemon resource-loading behavior.

**Block when:**

- The skill is unrelated to design or artifact creation/review, even if otherwise useful.
- It primarily automates a non-design workflow (finance, sales, CRM, generic productivity, unrelated API administration, domain-specific content processing).
- It requires new daemon/runtime semantics without updating the skills protocol, resource contract, and validation.
- It adds broad external integrations or credentials not necessary for a design-focused Open Design workflow.

### 4.5 Craft additions (`craft/`)

For new or changed brand-agnostic craft references under `craft/`.

**Accept when:**

- The reference is **universal** craft knowledge — true regardless of brand or design system (typography rules, color discipline, anti-AI-slop, motion principles).
- It is a single dense rulebook on one craft dimension, sized like existing entries (`typography.md`, `color.md`, `animation-discipline.md`).
- The slug is short and stable enough to be referenced by skills via `od.craft.requires`.
- At least one shipping skill opts into it via `od.craft.requires`, OR the PR explains why the reference will be opted into in a follow-up and lists the candidate skills.
- Content does not encode brand-specific tokens, colors, or typography choices that belong in `design-systems/`.

**Block when:**

- The reference is brand-specific or design-system-specific (belongs in `design-systems/`).
- It is artifact-shape advice (belongs in `skills/`).
- It duplicates an existing craft reference instead of extending it.
- No skill references it and no follow-up consumer is named.

## 5. Review priorities and checklist

Before leaving comments, build a quick map of the touched ownership area: changed files, public seams, callers/consumers, the relevant `AGENTS.md` files, and the validation loop that proves the change. For bug fixes, identify the reproduction or regression signal before judging the fix. This zoom-out step is especially important for multi-area PRs, contract/protocol changes, and sidecar/runtime changes — skip it and line comments tend to miss the boundary issue that actually matters.

Review in this order. Each priority lists the concrete checks for it.

### 5.1 Correctness and user impact

- Confirm the change solves the stated problem without introducing regressions.
- Read the issue, task, or PR description first; identify intended behavior before inspecting the diff.
- For bug fixes, confirm the author established a feedback loop before the fix: did they reproduce the failure, minimize it, add a regression test at the right seam (or explain why no test seam fits), and re-run the original failing scenario? A bugfix without a reproduction or regression signal is a candidate for blocking review.
- For UI changes, check accessibility, loading/error/empty states, keyboard behavior, and responsive layout.

### 5.2 Repository boundaries

- Check the nearest `AGENTS.md` before reviewing code under `apps/`, `packages/`, `tools/`, or `e2e/`.
- Confirm app internals stay private, shared DTOs live in `packages/contracts`, and sidecar concerns stay out of app business logic.
- Confirm source/test placement: source-only `src/`, package/app/tool tests in sibling `tests/`, Playwright UI in `e2e/ui/`, cross-app/cross-runtime checks in `e2e/tests/`, PR/release smoke in `e2e/specs/`.
- Look for stale references to anything in [Forbidden surfaces](#2-forbidden-surfaces).

### 5.3 Contracts and compatibility

- Verify shared request/response shapes, sidecar protocol changes, persisted data, and public commands remain compatible or have explicit migrations.
- For SSE/IPC changes, confirm both producer and consumer match the contract.
- Confirm sidecar stamps still have the five required fields.

### 5.4 Security, secrets, and runtime data

- No committed secrets, API keys, or `media-config.json` content. No widening of credential storage scope without explicit need.
- Logs do not leak credentials, tokens, or full prompt payloads.
- Runtime files stay under the documented paths: `<project-root>/.tmp/<source>/<namespace>/...` and POSIX IPC sockets under `/tmp/open-design/ipc/<namespace>/<app>.sock`.
- For daemon, desktop, sidecar, path, log, or namespace changes, validate runtime isolation per `AGENTS.md` (concurrent namespaces, log paths under `.tmp/tools-dev/<namespace>/...`, `inspect eval` and `inspect screenshot` per namespace).

### 5.5 Performance and operational risk

- For web changes, watch for bundle-size regressions, blocking work in render paths, or new runtime dependencies on unshipped routes.
- For daemon/sidecar changes, watch for added startup latency, IPC chattiness, or new unbounded resources.
- For packaging changes, confirm packaged data, log, runtime, cache, and namespace paths are still independent from daemon/web ports.

### 5.6 Maintainability

- Prefer small, cohesive changes with clear names, limited coupling, no unnecessary abstractions.
- Reject speculative abstractions and broad rewrites without a current product need.
- For command, package, workspace, or generated-entry changes, confirm `pnpm install` was run when required.

## 6. Commenting standards

- Mark blocking comments only for correctness, security, data integrity, boundary violations, missing required validation, or high-risk maintainability issues.
- Make each comment actionable: state the problem, why it matters, and the smallest acceptable fix.
- Prefer line comments for localized issues; use a short summary for cross-cutting concerns.
- Avoid restating the diff, expressing personal preference, or asking for broad rewrites unrelated to the change.
- Label optional suggestions clearly as non-blocking.

## 7. Approval bar

Approve only when **all** of the following hold:

- The change satisfies the requested behavior and respects repository boundaries.
- `pnpm guard` and `pnpm typecheck` have run.
- Package-scoped tests/builds matching the changed files have run (`pnpm --filter <package> test`/`build`, `e2e/specs/...` when relevant). Stamp/namespace changes have validated two concurrent namespaces and run desktop `inspect eval` and `inspect screenshot` per namespace. Path/log changes have run `pnpm tools-dev logs --namespace <name> --json` and confirmed log paths under `.tmp/tools-dev/<namespace>/...`.
- Any skipped validation is explicitly justified in the PR.
- New risk is proportionate to the change and covered by tests, types, guards, or clearly documented manual validation.
- Follow-up work is unnecessary for correctness or explicitly tracked outside the review.

### Documentation-only review additions

Pure documentation changes still require the baseline validation from `AGENTS.md`: run `pnpm guard` and `pnpm typecheck` before approval.

For documentation-heavy PRs, reviewers should also check:

- Internal link checks and reference integrity.
- Consistency with `AGENTS.md` and the relevant directory-level `AGENTS.md` files.
- Reviewer inspection that the document does not conflict with directory-level rules.

## Appendix: examples of failed product-relevance reviews

Concrete examples of PRs that should be closed under [Close instead of request changes](#close-instead-of-request-changes-maintainer-only). Tag references back to the [Product relevance test](#1-product-relevance-test) rules they violated.

- **Domain-specific app smuggled in as tests.** A PR adding tests for a "Quranic Arabic Learning App" with selectors like `#dashboard`, `#exercise`, `.vocabulary-item`, `.arabic-word` when those surfaces are not part of Open Design — violates the "tests target real routes/DOM/APIs" rule.
- **Standalone-app E2E URLs.** Playwright tests hard-coding `http://localhost:17573/index.html` instead of using the configured Open Design app flow — violates the "use the existing harness, base URL, and lifecycle conventions" rule.
- **Tautological assertions.** `expect(count + exerciseCount).toBeGreaterThanOrEqual(0)` — violates the "test assertions provide real signal" rule.
- **Ad hoc launcher script.** A new root script that hard-codes `~/projects/open-design`, assumes a user-specific tool such as `fnm`, or bypasses `pnpm tools-dev` — violates the "scripts use the documented control plane" rule and recreates a [Forbidden surface](#2-forbidden-surfaces).

A reasonable underlying intent (e.g. "we need RTL or Arabic coverage") does not justify keeping such a PR open. Ask for a fresh PR that exercises the actual Open Design app through the existing harness.
