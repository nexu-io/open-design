# Page Patterns Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship a page-level pattern library (login / board list / gallery / …) under a new `/page-patterns` route, with eight curated seed patterns, a daemon catalog API, a CLI peer surface, and a web gallery that can launch a new project from any pattern.

**Architecture:** New top-level `page-patterns/` content directory parallel to `design-templates/`. Daemon adds `/api/page-patterns*` routes that mirror `/api/design-templates*` but read from the new root. Web adds an `'page-patterns'` `EntryView`, a `PagePatternsTab` component, and reuses the existing `pendingPluginUseHandoff` channel to wire "use this pattern" into the home composer. Each `SKILL.md` carries new `od.page_type` / `page_inputs` / `page_outputs` metadata so the future diagram surface can adopt the catalog without a migration.

**Tech Stack:** TypeScript everywhere. Daemon = Node 24 + Express-style routes (already in `apps/daemon/src/`). Web = Next.js 16 + React 18 + Vitest + Testing Library. Contracts = pure TS in `packages/contracts/`. CLI = `apps/daemon/src/cli.ts` (`od` bin). Tests = vitest (`@vitest-environment jsdom` for web).

**Reference design doc:** [`docs/plans/2026-05-21-page-patterns-design.md`](./2026-05-21-page-patterns-design.md).

**Required reading before starting:** `AGENTS.md` (repo root), `apps/AGENTS.md`, `apps/daemon/AGENTS.md` if present, `design-templates/AGENTS.md`, `skills/AGENTS.md`. These cover lifecycle (`pnpm tools-dev`), contract layering rules, and the UI/CLI dual-track requirement.

**Branch / worktree:** This plan touches `apps/daemon`, `apps/web`, `packages/contracts`, plus new top-level `page-patterns/`. Use `superpowers:using-git-worktrees` to create a dedicated worktree (`feat/page-patterns`) before starting if you haven't already.

**Verification commands used throughout:**
- Lint guard: `pnpm guard`
- Repo-wide typecheck: `pnpm typecheck`
- Web-only typecheck: `pnpm --filter @open-design/web typecheck`
- Daemon-only test: `pnpm --filter @open-design/daemon test`
- Web-only test (relative paths from `apps/web/`): `pnpm --filter @open-design/web test -- --run <test-path>`

**TDD discipline:** Every task with new code has a failing test first. If you find yourself implementing before the test runs red, stop and re-read `superpowers:test-driven-development`.

**Commit cadence:** Commit at the end of every task. Use Conventional Commits style (`feat(scope):`, `fix(scope):`, `test(scope):`, `docs(scope):`). No `Co-authored-by` trailers (AGENTS.md `Git commit policy`).

---

# PR-1 — Data, contracts, daemon routes, CLI

Lands the catalog plumbing without any UI surface. After PR-1 merges, `curl /api/page-patterns` and `od page-pattern list --json` both work.

## Task 1: Scaffold `page-patterns/` root + `AGENTS.md`

**Files:**
- Create: `page-patterns/AGENTS.md`
- Modify: `AGENTS.md` (repo root) — add `page-patterns/` to the "Workspace directories" / content directories enumeration.

**Step 1: Create the directory marker.**

```bash
mkdir -p page-patterns
```

**Step 2: Write `page-patterns/AGENTS.md`.**

```markdown
# page-patterns

This directory holds **page-level site patterns** — login, board list,
gallery, dashboard, profile, feed, and similar. Each entry is one
folder with a `SKILL.md` (same shape as `../design-templates/`) plus a
baked `example.html` the daemon serves to the gallery iframe.

Page patterns are the site-builder vocabulary: the future diagram
surface treats every pattern as a typed node, and the agent uses the
catalog when generating multi-page sites. Unlike `../design-templates/`
(decks, prototypes, image/video/audio renderers), every entry here is
a single web page and carries typed I/O metadata.

## Daemon plumbing

- Listed under `/api/page-patterns`. The shape mirrors
  `/api/design-templates` (same `SkillSummary`-derived response) and
  adds `pageType`, `pageInputs`, `pageOutputs` for downstream
  consumers.
- Asset and example routes (`/api/page-patterns/:id/example`,
  `/api/page-patterns/:id/assets/*`) are scoped to this root.
  Existing skill / design-template URLs are unchanged.
- Surfaced in the web app at `/page-patterns` and in the CLI as
  `od page-pattern list` / `od page-pattern show <id>`.

## Adding a page pattern

1. Create `page-patterns/<pattern-id>/SKILL.md` with:
   - Standard skill frontmatter (`name`, `description`, `triggers`).
   - `od.mode: prototype`
   - `od.scenario: page-pattern` (discriminator)
   - `od.page_type`: namespace.name (e.g. `auth.login`, `list.board`).
   - `od.page_inputs`: array of `{ name, kind, target_page_type? }`
     describing data this page consumes. Empty array is fine.
   - `od.page_outputs`: array of `{ name, kind, target_page_type? }`
     describing links/actions the page produces. `kind` ∈
     `navigation` | `data` | `action`.
   - `od.preview.entry`: usually `index.html`.
   - `od.design_system.requires: true` with the relevant token sections.
   - `od.example_prompt`: a short Korean or English starter prompt.
2. Ship a baked `example.html` (and any `assets/` side files) so the
   gallery has something to preview without invoking the agent.
3. The daemon's lazy scanner picks up the entry on the next
   `/api/page-patterns` request — no rebuild required during local dev.

## Page type taxonomy (Phase 1)

Reserved namespaces and the seed entries each owns:

| Namespace   | Entries                                  |
| ----------- | ---------------------------------------- |
| `auth`      | `login`, `signup`                        |
| `list`      | `board`, `gallery`, `feed`               |
| `detail`    | `post`                                   |
| `dashboard` | `metrics`                                |
| `profile`   | `user`                                   |

New namespaces require an explicit code change to
`packages/contracts/src/api/page-patterns.ts` (the enum kept there
is the public taxonomy contract).
```

**Step 3: Append the new directory to the repo `AGENTS.md` enumeration.**

Find the bullet under "Workspace directories" that begins `Top-level content directories: ...` and insert ` `page-patterns/` (page-level site patterns — login, list, gallery; see page-patterns/AGENTS.md),` immediately before `craft/`.

**Step 4: Commit.**

```bash
git add page-patterns/AGENTS.md AGENTS.md
git commit -m "docs(page-patterns): scaffold directory with AGENTS.md"
```

---

## Task 2: Add `PagePatternSummary` + response contracts

**Files:**
- Create: `packages/contracts/src/api/page-patterns.ts`
- Modify: `packages/contracts/src/index.ts` (add re-exports)
- Test: `packages/contracts/tests/page-patterns.test.ts` (new — or extend existing contracts tests if one collects type-level assertions; check `packages/contracts/tests/` first.)

**Step 1: Write the failing test.**

Check `packages/contracts/tests/` for existing patterns. If a `registry.test.ts` exists, mirror its style. Otherwise create `packages/contracts/tests/page-patterns.test.ts`:

```ts
import { describe, it, expectTypeOf } from 'vitest';
import type {
  PagePatternIO,
  PagePatternIOKind,
  PagePatternSummary,
  PagePatternListResponse,
  PagePatternResponse,
} from '../src/api/page-patterns';
import type { SkillSummary } from '../src/api/registry';

describe('PagePatternSummary', () => {
  it('extends SkillSummary with typed I/O metadata', () => {
    expectTypeOf<PagePatternSummary>().toMatchTypeOf<SkillSummary>();
    expectTypeOf<PagePatternSummary>().toHaveProperty('pageType').toEqualTypeOf<string>();
    expectTypeOf<PagePatternSummary>().toHaveProperty('pageInputs').toEqualTypeOf<PagePatternIO[]>();
    expectTypeOf<PagePatternSummary>().toHaveProperty('pageOutputs').toEqualTypeOf<PagePatternIO[]>();
  });

  it('IO kind is a closed union', () => {
    expectTypeOf<PagePatternIOKind>().toEqualTypeOf<'navigation' | 'data' | 'action'>();
  });

  it('list response wraps an array of summaries', () => {
    expectTypeOf<PagePatternListResponse>().toEqualTypeOf<{ patterns: PagePatternSummary[] }>();
  });
});
```

**Step 2: Run the test — expect failure.**

```bash
pnpm --filter @open-design/contracts test page-patterns
```

Expected: failure with "Cannot find module '../src/api/page-patterns'".

**Step 3: Create the contracts module.**

`packages/contracts/src/api/page-patterns.ts`:

```ts
// Page patterns — the site-building vocabulary that the future
// diagram surface treats as typed nodes. Phase 1 (Q2 2026) only
// serves these to the gallery and CLI; the I/O fields are stored
// for forward-compatibility and not yet consumed.

import type { SkillSummary } from './registry';

export type PagePatternIOKind = 'navigation' | 'data' | 'action';

export interface PagePatternIO {
  /** Stable name within the pattern. */
  name: string;
  kind: PagePatternIOKind;
  /**
   * Page type (namespace.name) the link or action targets. Optional
   * because some outputs are pure events with no destination yet.
   */
  target_page_type?: string;
}

/**
 * One page-pattern entry as returned by /api/page-patterns. Extends
 * SkillSummary so the web gallery can reuse the existing preview /
 * search infrastructure.
 */
export interface PagePatternSummary extends SkillSummary {
  pageType: string;
  pageInputs: PagePatternIO[];
  pageOutputs: PagePatternIO[];
}

export interface PagePatternListResponse {
  patterns: PagePatternSummary[];
}

export interface PagePatternResponse {
  pattern: PagePatternSummary;
}
```

**Step 4: Re-export from `packages/contracts/src/index.ts`.**

Find the existing block that re-exports from `./api/registry` and add:

```ts
export type {
  PagePatternIO,
  PagePatternIOKind,
  PagePatternSummary,
  PagePatternListResponse,
  PagePatternResponse,
} from './api/page-patterns';
```

**Step 5: Run the test — expect pass.**

```bash
pnpm --filter @open-design/contracts test page-patterns
```

Expected: PASS.

**Step 6: Run package typecheck.**

```bash
pnpm --filter @open-design/contracts build
```

Expected: success, generated `dist/` includes the new type.

**Step 7: Commit.**

```bash
git add packages/contracts/src/api/page-patterns.ts packages/contracts/src/index.ts packages/contracts/tests/page-patterns.test.ts
git commit -m "feat(contracts): add PagePatternSummary + response shapes"
```

---

## Task 3: First seed pattern — `auth-login`

**Files:**
- Create: `page-patterns/auth-login/SKILL.md`
- Create: `page-patterns/auth-login/example.html`

This is the *exemplar*. Tasks 4–10 follow the same shape. Read this task carefully — later seed tasks will reference it.

**Step 1: Write `SKILL.md`.**

```markdown
---
name: auth-login
description: |
  표준 로그인 페이지. 이메일/비밀번호 + 소셜 로그인(Google/Apple) +
  회원가입·비밀번호 재설정 보조 링크. 디자인 시스템의 form / button
  / typography 토큰을 따른다.
triggers:
  - "login page"
  - "sign in"
  - "로그인 페이지"
  - "로그인 화면"
od:
  mode: prototype
  platform: desktop
  scenario: page-pattern
  page_type: auth.login
  page_inputs: []
  page_outputs:
    - name: submit
      kind: navigation
      target_page_type: dashboard.metrics
    - name: signup_link
      kind: navigation
      target_page_type: auth.signup
    - name: password_reset_link
      kind: navigation
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components, forms]
  example_prompt: "표준 로그인 페이지를 만들어 줘. 이메일·비밀번호 필드, Google·Apple 소셜 로그인 버튼, 회원가입과 비밀번호 재설정 보조 링크 포함."
---

# Auth · Login

Produce a single-screen login page. Layout, in order:

1. **Branding header** — wordmark or logomark, centered or top-left
   per the design system.
2. **Form card** — narrow centered card:
   - Email input (`type=email`, autofocus).
   - Password input (`type=password`) with show/hide toggle.
   - Primary submit button (full width).
   - Inline error region (hidden by default; `aria-live=polite`).
3. **Divider** — "or continue with" caption between the form and
   social providers.
4. **Social providers** — Google and Apple buttons, full width, icon
   left, label centered. Optional Microsoft / GitHub if the design
   system advertises additional connectors.
5. **Footer links** — "Forgot password?" and "Create an account"
   secondary links, centered below the form.

## Output contract

Emit a single self-contained HTML document inside an `<artifact>`
tag, CSS inline, no external assets. Honor the active DESIGN.md
tokens for color / typography / form / button.
```

**Step 2: Write `example.html`.**

The baked sample needs to render meaningfully when the gallery iframe loads it (no agent invocation). Keep it small (under ~200 lines), self-contained, and visually decent. Use neutral colors so it reads on top of any design system; the gallery loads it sandboxed.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Login — Pattern Preview</title>
    <style>
      :root {
        --bg: #fafaf9;
        --card: #ffffff;
        --border: #e5e7eb;
        --text: #18181b;
        --muted: #71717a;
        --accent: #18181b;
        --accent-fg: #ffffff;
      }
      * { box-sizing: border-box; }
      html, body {
        margin: 0; padding: 0; height: 100%;
        font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
        background: var(--bg); color: var(--text);
      }
      main {
        min-height: 100%;
        display: grid; place-items: center;
        padding: 48px 24px;
      }
      .card {
        width: 100%; max-width: 360px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 32px 28px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.04);
      }
      .brand {
        font-weight: 600; font-size: 18px;
        text-align: center; margin-bottom: 24px;
      }
      label {
        display: block; font-size: 13px; color: var(--muted);
        margin-bottom: 6px;
      }
      input[type=email], input[type=password] {
        width: 100%; padding: 10px 12px;
        border: 1px solid var(--border); border-radius: 8px;
        font-size: 14px; background: #fff; color: inherit;
      }
      .field + .field { margin-top: 14px; }
      .submit {
        margin-top: 18px; width: 100%; padding: 10px 12px;
        border: 0; border-radius: 8px; cursor: pointer;
        background: var(--accent); color: var(--accent-fg);
        font-weight: 600; font-size: 14px;
      }
      .divider {
        display: flex; align-items: center; gap: 12px;
        color: var(--muted); font-size: 12px;
        margin: 20px 0 16px;
      }
      .divider::before, .divider::after {
        content: ""; flex: 1; height: 1px; background: var(--border);
      }
      .social {
        display: grid; gap: 10px;
      }
      .social button {
        width: 100%; padding: 9px 12px;
        background: #fff; border: 1px solid var(--border);
        border-radius: 8px; cursor: pointer;
        font-size: 14px; color: inherit;
        display: flex; align-items: center; gap: 10px; justify-content: center;
      }
      footer {
        margin-top: 22px;
        text-align: center; font-size: 13px; color: var(--muted);
      }
      footer a { color: var(--text); text-decoration: none; }
      footer a + a::before { content: " · "; color: var(--muted); }
    </style>
  </head>
  <body>
    <main>
      <section class="card" aria-label="Login">
        <div class="brand">Acme</div>
        <div class="field">
          <label for="email">Email</label>
          <input id="email" type="email" autocomplete="email" placeholder="you@company.com" />
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" type="password" autocomplete="current-password" />
        </div>
        <button class="submit">Sign in</button>
        <div class="divider">or continue with</div>
        <div class="social">
          <button type="button">Continue with Google</button>
          <button type="button">Continue with Apple</button>
        </div>
        <footer>
          <a href="#">Forgot password?</a>
          <a href="#">Create an account</a>
        </footer>
      </section>
    </main>
  </body>
</html>
```

**Step 3: Verify the example renders standalone.**

Open the file in a browser (`start page-patterns/auth-login/example.html` on Windows, `open` on macOS). Expected: centered card with email / password / Google / Apple / footer links. No layout breakage.

**Step 4: Commit.**

```bash
git add page-patterns/auth-login
git commit -m "feat(page-patterns): seed auth-login pattern"
```

---

## Task 4: Seven remaining seeds (`auth-signup`, `board-list`, `gallery-grid`, `social-feed`, `post-detail`, `dashboard-metrics`, `user-profile`)

Do these as **seven independent commits**, one per pattern. Each pattern follows the Task 3 template:

1. `page-patterns/<id>/SKILL.md` with the frontmatter from the table below.
2. `page-patterns/<id>/example.html` with a small, self-contained baked sample.

For `example.html`: model on Task 3's structure (neutral palette, single-file CSS, sandboxed-iframe-safe). The visual fidelity needed is "reader can recognise the pattern in a 320×220 thumbnail" — not pixel-perfect. ~150–300 lines per file.

**Frontmatter summary (one row per pattern):**

| id                   | page_type           | inputs            | outputs (name → target_page_type)                                              |
| -------------------- | ------------------- | ----------------- | ------------------------------------------------------------------------------ |
| `auth-signup`        | `auth.signup`       | []                | `submit → dashboard.metrics`, `login_link → auth.login`                        |
| `board-list`         | `list.board`        | `{ name: 'posts', kind: 'data' }` | `row_click → detail.post`, `new_post → auth.login` (if guarded) |
| `gallery-grid`       | `list.gallery`      | `{ name: 'items', kind: 'data' }` | `tile_click → detail.post`                                      |
| `social-feed`        | `list.feed`         | `{ name: 'posts', kind: 'data' }` | `post_click → detail.post`, `profile_click → profile.user`      |
| `post-detail`        | `detail.post`       | `{ name: 'post', kind: 'data' }`  | `back_link → list.board`, `author_link → profile.user`          |
| `dashboard-metrics`  | `dashboard.metrics` | `{ name: 'metrics', kind: 'data' }` | `profile_link → profile.user`                                |
| `user-profile`       | `profile.user`      | `{ name: 'user', kind: 'data' }`  | `edit → profile.user`, `settings → profile.user`                |

**Per-pattern step pattern:**

1. Write `page-patterns/<id>/SKILL.md` (description in Korean+English, full `od` block with the metadata from above, agent workflow body).
2. Write `page-patterns/<id>/example.html`.
3. Browser-verify the example renders.
4. Commit: `git add page-patterns/<id> && git commit -m "feat(page-patterns): seed <id> pattern"`.

**Step 8 (after all seven seeds): list the directory and confirm.**

```bash
ls page-patterns/
```

Expected output:
```
AGENTS.md
auth-login
auth-signup
board-list
dashboard-metrics
gallery-grid
post-detail
social-feed
user-profile
```

---

## Task 5: Daemon scanner for page-patterns

**Files:**
- Modify: `apps/daemon/src/static-resource-routes.ts`
- Test: `apps/daemon/tests/page-patterns-routes.test.ts`

The daemon already has `listAllDesignTemplates()` and `listAllSkillLikeEntries()`. We add `listAllPagePatterns()` modelled on the design-template scanner. Critically, the scanner must parse the new `od.page_type` / `page_inputs` / `page_outputs` frontmatter fields and project them into the response.

**Step 1: Write the failing scanner test.**

Create `apps/daemon/tests/page-patterns-routes.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../src/server'; // or wherever createApp lives
import type { PagePatternListResponse } from '@open-design/contracts';

const TMP_ROOT = mkdtempSync(path.join(tmpdir(), 'od-page-patterns-'));

beforeAll(() => {
  // Seed two patterns into a fixture root the test injects via env.
  const dir = path.join(TMP_ROOT, 'auth-login');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'SKILL.md'), `---
name: auth-login
description: Login page.
triggers: ["login"]
od:
  mode: prototype
  scenario: page-pattern
  page_type: auth.login
  page_inputs: []
  page_outputs:
    - name: submit
      kind: navigation
      target_page_type: dashboard.metrics
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [forms]
---

Login body.
`);
  writeFileSync(path.join(dir, 'example.html'), '<!doctype html><html><body>login</body></html>');
});

describe('/api/page-patterns', () => {
  it('lists patterns with page_type/page_inputs/page_outputs', async () => {
    // Pseudocode — actual injection depends on existing test harness.
    const app = createApp({ pagePatternsRoot: TMP_ROOT });
    const res = await app.inject({ method: 'GET', url: '/api/page-patterns' });
    expect(res.statusCode).toBe(200);
    const json = res.json() as PagePatternListResponse;
    expect(json.patterns).toHaveLength(1);
    const p = json.patterns[0];
    expect(p.id).toBe('auth-login');
    expect(p.pageType).toBe('auth.login');
    expect(p.pageInputs).toEqual([]);
    expect(p.pageOutputs).toEqual([
      { name: 'submit', kind: 'navigation', target_page_type: 'dashboard.metrics' },
    ]);
    expect(p.hasBody).toBe(true);
  });
});
```

**Note:** the exact injection mechanism (`pagePatternsRoot` option, or env var) depends on how `static-resource-routes.ts` currently resolves the design-templates root. Read that file and mirror its pattern (search for how `templatesRoot` or similar is configured — probably an env var like `OD_DESIGN_TEMPLATES_DIR` plus a default of `<projectRoot>/design-templates`). Use `OD_PAGE_PATTERNS_DIR` as the new env, defaulting to `<projectRoot>/page-patterns`.

**Step 2: Run the test — expect failure.**

```bash
pnpm --filter @open-design/daemon test page-patterns-routes
```

Expected: failure with module not found, 404, or undefined `pageType`.

**Step 3: Add scanner + route to `static-resource-routes.ts`.**

Locate the existing `listAllDesignTemplates()` function (Explore report line ~47). Add immediately after it:

```ts
/**
 * Lazy scanner for page-patterns/. Mirrors listAllDesignTemplates but
 * projects the page-pattern-specific fields (page_type, page_inputs,
 * page_outputs) onto each SkillSummary.
 *
 * Root resolution: OD_PAGE_PATTERNS_DIR env, falling back to
 * <projectRoot>/page-patterns.
 */
export async function listAllPagePatterns(
  ctx: SkillScannerContext,
): Promise<PagePatternSummary[]> {
  const root = ctx.pagePatternsRoot;
  const entries = await readSkillDirectory(root); // existing helper
  return entries.map((entry) => ({
    ...toSkillSummary(entry),
    pageType: String(entry.frontmatter?.od?.page_type ?? ''),
    pageInputs: normalizeIO(entry.frontmatter?.od?.page_inputs ?? []),
    pageOutputs: normalizeIO(entry.frontmatter?.od?.page_outputs ?? []),
  }));
}

function normalizeIO(value: unknown): PagePatternIO[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => {
      const name = typeof item.name === 'string' ? item.name : '';
      const kind = item.kind === 'navigation' || item.kind === 'data' || item.kind === 'action'
        ? item.kind
        : 'navigation';
      const target = typeof item.target_page_type === 'string' ? item.target_page_type : undefined;
      return target ? { name, kind, target_page_type: target } : { name, kind };
    })
    .filter((io) => io.name.length > 0);
}
```

Add the route handler (mirror lines 104–109 of the existing file for `GET /api/design-templates`):

```ts
app.get('/api/page-patterns', async (_req, res) => {
  const patterns = await listAllPagePatterns(ctx);
  // Filter `body` and `dir` the same way design-templates does.
  const summary = patterns.map(({ body, dir, ...rest }) => ({
    ...rest,
    hasBody: typeof body === 'string' && body.trim().length > 0,
  }));
  res.json({ patterns: summary } satisfies PagePatternListResponse);
});

app.get('/api/page-patterns/:id', async (req, res) => {
  const patterns = await listAllPagePatterns(ctx);
  const found = patterns.find((p) => p.id === req.params.id);
  if (!found) {
    res.status(404).json({ error: 'page-pattern not found' });
    return;
  }
  res.json({ pattern: found } satisfies PagePatternResponse);
});
```

**Important:** the existing `static-resource-routes.ts` already has `/api/skills/:id/example` and `/api/skills/:id/assets/*` that span both `skills/` and `design-templates/` via `listAllSkillLikeEntries()`. Extend that aggregator to also include the page-patterns root so `example`/`assets` URLs Just Work without new routes. Find `listAllSkillLikeEntries` and add `...await listAllPagePatterns(ctx)` to its concatenation. (If the existing aggregator returns the un-projected scanner output, project onto the leaner `SkillLikeEntry` shape it expects — page-pattern-specific fields drop out for asset resolution.)

**Step 4: Update `SkillScannerContext` to carry `pagePatternsRoot`.**

Grep for where the existing context is constructed (likely `apps/daemon/src/server.ts` or an env-resolution module). Add a line that reads `process.env.OD_PAGE_PATTERNS_DIR ?? path.join(projectRoot, 'page-patterns')`.

**Step 5: Run the test — expect pass.**

```bash
pnpm --filter @open-design/daemon test page-patterns-routes
```

Expected: PASS.

**Step 6: Daemon-wide tests + typecheck.**

```bash
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/daemon build
```

Expected: all green. If any unrelated test fails, that's a pre-existing issue — verify by checking out main and re-running.

**Step 7: Commit.**

```bash
git add apps/daemon/src/static-resource-routes.ts apps/daemon/tests/page-patterns-routes.test.ts apps/daemon/src/server.ts
git commit -m "feat(daemon): page-patterns scanner + /api/page-patterns routes"
```

---

## Task 6: Smoke-test the live endpoint

**No new files; this is a live verification step.**

**Step 1: Start the dev daemon.**

```bash
pnpm tools-dev start
```

Wait for `daemon: running` in `pnpm tools-dev status --json`.

**Step 2: Query the endpoint.**

```bash
curl -s http://127.0.0.1:3892/api/page-patterns | jq '.patterns | length, .patterns[0].pageType, .patterns[0].pageOutputs'
```

Expected:
```
8
"auth.login"
[
  { "name": "submit", "kind": "navigation", "target_page_type": "dashboard.metrics" },
  ...
]
```

Order doesn't matter; the first pattern may be different depending on `readdir` order. Just confirm `length === 8` and a single sample's `pageType`.

**Step 3: Spot-check `example.html` serving.**

```bash
curl -s http://127.0.0.1:3892/api/page-patterns/auth-login/example | head -5
```

Expected: HTML doctype output. If you get 404, the example aggregator did not pick up the new root — go back to Task 5 Step 3 and verify `listAllSkillLikeEntries` was extended.

**Step 4: No commit needed (verification only).**

---

## Task 7: CLI subcommands `od page-pattern list` / `show`

**Files:**
- Modify: `apps/daemon/src/cli.ts`

The existing `runLibraryList` helper at lines ~4451–4495 handles list/show against `/api/<resource>` for `design-systems`, `skills`, `craft`. Reuse it.

**Step 1: Write the failing CLI e2e test.**

Create `e2e/tests/cli/page-pattern.test.ts` (or `e2e/tests/page-pattern-cli.test.ts` — follow whatever convention `e2e/AGENTS.md` documents):

```ts
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../..');

function od(...args: string[]) {
  return spawnSync('node', [path.join(REPO_ROOT, 'apps/daemon/dist/cli.js'), ...args], {
    encoding: 'utf-8',
  });
}

describe('od page-pattern', () => {
  it('list --json returns all eight seed patterns', () => {
    const res = od('page-pattern', 'list', '--json');
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.patterns).toHaveLength(8);
    expect(parsed.patterns.find((p: any) => p.pageType === 'auth.login')).toBeDefined();
  });

  it('show <id> includes SKILL.md body', () => {
    const res = od('page-pattern', 'show', 'auth-login', '--json');
    expect(res.status).toBe(0);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.pattern.id).toBe('auth-login');
    expect(parsed.pattern.body).toContain('Login');
  });
});
```

**Step 2: Run — expect failure.**

```bash
pnpm --filter @open-design/daemon build
pnpm test e2e/tests/page-pattern-cli.test.ts -- --run
```

Expected: failure ("Unknown subcommand" or similar).

**Step 3: Register the subcommand in `cli.ts`.**

Locate the `SUBCOMMAND_MAP` (lines ~203–228). Add:

```ts
'page-pattern': runPagePattern,
```

Add the handler near `runDesignSystems` (line ~4495):

```ts
async function runPagePattern(args: string[]) {
  return runLibraryList('page-patterns', args);
}
```

**Step 4: Verify `runLibraryList` accepts the new resource name.**

Open `runLibraryList` (line ~4451). If the function hard-codes a set of valid names, add `'page-patterns'`. If it's already permissive (just slugs the name into a URL like `/api/${name}`), no change needed.

**Step 5: Rebuild + run — expect pass.**

```bash
pnpm --filter @open-design/daemon build
pnpm test e2e/tests/page-pattern-cli.test.ts -- --run
```

Expected: PASS.

**Step 6: Manual smoke.**

With the dev daemon still running from Task 6:

```bash
node apps/daemon/dist/cli.js page-pattern list --json | jq '.patterns | length'
```

Expected: `8`.

**Step 7: Commit.**

```bash
git add apps/daemon/src/cli.ts e2e/tests/page-pattern-cli.test.ts
git commit -m "feat(cli): od page-pattern list/show subcommands"
```

---

## Task 8: PR-1 verification + open the PR

**Files:** none (verification + PR).

**Step 1: Full repo verification.**

```bash
pnpm install               # picks up any new package boundaries
pnpm guard
pnpm typecheck
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/contracts test
```

Expected: all green.

**Step 2: Restart the dev daemon and re-run the smoke from Task 6 to confirm nothing regressed.**

```bash
pnpm tools-dev stop
pnpm tools-dev start
curl -s http://127.0.0.1:3892/api/page-patterns | jq '.patterns | length'
```

Expected: `8`.

**Step 3: Open the PR.**

Use `superpowers:requesting-code-review` to walk through the PR template. Title: `feat(page-patterns): catalog data + daemon routes + CLI`. Surface area checklist ticks **CLI** (new subcommand) and **content directories** (new `page-patterns/` root). Body should link the design doc and call out:

- Data root: `page-patterns/` (8 seeds).
- New contracts: `PagePatternSummary`, `PagePatternIO`.
- New routes: `/api/page-patterns`, `/api/page-patterns/:id`. `example` and `assets` routes auto-extend via the existing skill-like aggregator.
- CLI: `od page-pattern list/show`.
- No web changes (PR-2 follows).

---

# PR-2 — Web UI

Lands the `/page-patterns` route, nav rail entry, gallery component, and preview modal. No i18n yet (English only); that's PR-3.

## Task 9: Add `'page-patterns'` to `EntryView` union + router

**Files:**
- Modify: `apps/web/src/router.ts`
- Modify: `apps/web/src/components/EntryNavRail.tsx`

**Step 1: Write the failing router test.**

Find `apps/web/tests/router.test.ts` (or create one if absent). Add:

```ts
import { describe, it, expect } from 'vitest';
import { parsePath, buildPath } from '../src/router';

describe('/page-patterns routing', () => {
  it('parses /page-patterns to home view page-patterns', () => {
    expect(parsePath('/page-patterns')).toEqual({ kind: 'home', view: 'page-patterns' });
  });

  it('builds /page-patterns from the route', () => {
    expect(buildPath({ kind: 'home', view: 'page-patterns' })).toBe('/page-patterns');
  });
});
```

**Step 2: Run — expect failure.**

```bash
pnpm --filter @open-design/web test -- --run tests/router.test.ts
```

Expected: failure with type error or `parsePath` returning unexpected value.

**Step 3: Add `'page-patterns'` to the `EntryHomeView` union in `router.ts` (line ~12–19).**

```ts
export type EntryHomeView =
  | 'home' | 'onboarding' | 'projects' | 'tasks' | 'plugins'
  | 'design-systems' | 'page-patterns' | 'integrations';
```

**Step 4: Add the parse + build clauses in `router.ts`.**

After the existing `if (parts[0] === 'design-systems') { ... }` block (lines ~76–83), add:

```ts
if (parts[0] === 'page-patterns') {
  return { kind: 'home', view: 'page-patterns' };
}
```

And in `buildPath` (line ~114), add:

```ts
if (route.view === 'page-patterns') return '/page-patterns';
```

**Step 5: Extend the `EntryView` union in `EntryNavRail.tsx` (line ~21–28).**

```ts
export type EntryView =
  | 'home' | 'onboarding' | 'projects' | 'tasks' | 'plugins'
  | 'design-systems' | 'page-patterns' | 'integrations';
```

**Step 6: Run — expect pass.**

```bash
pnpm --filter @open-design/web test -- --run tests/router.test.ts
pnpm --filter @open-design/web typecheck
```

Expected: PASS + typecheck green (or surface compile errors in EntryShell that we'll fix in Task 11).

**Step 7: Commit.**

```bash
git add apps/web/src/router.ts apps/web/src/components/EntryNavRail.tsx apps/web/tests/router.test.ts
git commit -m "feat(web): route /page-patterns to home view"
```

---

## Task 10: Nav rail button for page-patterns

**Files:**
- Modify: `apps/web/src/components/EntryNavRail.tsx`
- Test: `apps/web/tests/components/EntryNavRail.test.tsx` (extend existing or create)

**Step 1: Write the failing component test.**

If a `EntryNavRail.test.tsx` already exists, add to it. Otherwise create:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EntryNavRail } from '../../src/components/EntryNavRail';

describe('EntryNavRail page-patterns button', () => {
  it('renders the button and fires onViewChange', () => {
    const onViewChange = vi.fn();
    render(
      <EntryNavRail view="home" onViewChange={onViewChange} onNewProject={() => undefined} />,
    );
    const btn = screen.getByTestId('entry-nav-page-patterns');
    fireEvent.click(btn);
    expect(onViewChange).toHaveBeenCalledWith('page-patterns');
  });
});
```

**Step 2: Run — expect failure.**

```bash
pnpm --filter @open-design/web test -- --run tests/components/EntryNavRail.test.tsx
```

Expected: failure with `Unable to find element by: [data-testid="entry-nav-page-patterns"]`.

**Step 3: Add the NavButton in `EntryNavRail.tsx`.**

Find the existing block for `design-systems` (lines ~114–122) and add immediately after it:

```tsx
<NavButton
  active={view === 'page-patterns'}
  ariaLabel={t('entry.navPagePatterns')}
  tooltip={t('entry.navPagePatterns')}
  onClick={() => onViewChange('page-patterns')}
  testId="entry-nav-page-patterns"
>
  <Icon name="layout" size={18} />
</NavButton>
```

**Step 4: Add the `entry.navPagePatterns` key to `apps/web/src/i18n/types.ts` Dict + provide an English value in `en.ts`.**

Find the line that declares `'entry.navDesignSystems': string;` and add immediately after:

```ts
'entry.navPagePatterns': string;
```

In `en.ts` find the matching value line and add:

```ts
'entry.navPagePatterns': 'Page patterns',
```

(ko / zh-CN come in PR-3, but those locales already use `...en` spread so they fall back; no typecheck breakage.)

**Step 5: Run — expect pass.**

```bash
pnpm --filter @open-design/web test -- --run tests/components/EntryNavRail.test.tsx
pnpm --filter @open-design/web typecheck
```

Expected: PASS, typecheck green.

**Step 6: Commit.**

```bash
git add apps/web/src/components/EntryNavRail.tsx apps/web/tests/components/EntryNavRail.test.tsx apps/web/src/i18n/types.ts apps/web/src/i18n/locales/en.ts
git commit -m "feat(web): add page-patterns nav rail entry"
```

---

## Task 11: Daemon provider for page-patterns

**Files:**
- Modify: `apps/web/src/providers/registry.ts` (or wherever `fetchDesignTemplates` lives — grep first)
- Test: `apps/web/tests/providers/registry.test.ts` if one exists

**Step 1: Locate the existing fetcher.**

```bash
grep -rn "fetchDesignTemplates\|fetchSkills\|/api/design-templates" apps/web/src/providers/
```

Identify the pattern (likely a `fetchDesignTemplates()` returning `Promise<SkillSummary[]>`).

**Step 2: Write a failing test for `fetchPagePatterns`.**

If no provider tests exist, skip the unit test here — the component test in Task 12 will exercise it indirectly. If they do exist, add a matching one.

**Step 3: Add the fetcher.**

In the same file as `fetchDesignTemplates`:

```ts
import type { PagePatternListResponse, PagePatternSummary } from '@open-design/contracts';

export async function fetchPagePatterns(): Promise<PagePatternSummary[]> {
  const res = await fetch('/api/page-patterns');
  if (!res.ok) throw new Error(`page-patterns: ${res.status}`);
  const json = (await res.json()) as PagePatternListResponse;
  return json.patterns ?? [];
}
```

**Step 4: Verify typecheck.**

```bash
pnpm --filter @open-design/web typecheck
```

Expected: green.

**Step 5: Commit.**

```bash
git add apps/web/src/providers/registry.ts
git commit -m "feat(web): add fetchPagePatterns provider"
```

---

## Task 12: `PagePatternsTab` component (gallery + search + filter)

**Files:**
- Create: `apps/web/src/components/PagePatternsTab.tsx`
- Test: `apps/web/tests/components/PagePatternsTab.test.tsx`

**Step 1: Write the failing test.**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { PagePatternSummary } from '@open-design/contracts';
import { PagePatternsTab } from '../../src/components/PagePatternsTab';

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockPatterns(): PagePatternSummary[] {
  return [
    {
      id: 'auth-login',
      name: 'auth-login',
      title: 'Auth · Login',
      description: 'Login form.',
      pageType: 'auth.login',
      pageInputs: [],
      pageOutputs: [],
      hasBody: true,
    } as unknown as PagePatternSummary,
    {
      id: 'board-list',
      name: 'board-list',
      title: 'List · Board',
      description: 'Board list.',
      pageType: 'list.board',
      pageInputs: [],
      pageOutputs: [],
      hasBody: true,
    } as unknown as PagePatternSummary,
  ];
}

describe('PagePatternsTab', () => {
  it('renders cards from /api/page-patterns and filters by category', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url === '/api/page-patterns') {
        return new Response(JSON.stringify({ patterns: mockPatterns() }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response('{}', { status: 404 });
    }) as typeof fetch;

    render(<PagePatternsTab onUsePattern={() => undefined} onPreview={() => undefined} />);

    await screen.findByText('Auth · Login');
    expect(screen.getByText('List · Board')).toBeTruthy();

    // Filter by 'auth' category.
    fireEvent.change(screen.getByTestId('page-patterns-category-select'), {
      target: { value: 'auth' },
    });
    await waitFor(() => {
      expect(screen.queryByText('List · Board')).toBeNull();
    });
    expect(screen.getByText('Auth · Login')).toBeTruthy();
  });
});
```

**Step 2: Run — expect failure.**

```bash
pnpm --filter @open-design/web test -- --run tests/components/PagePatternsTab.test.tsx
```

Expected: module not found.

**Step 3: Implement `PagePatternsTab.tsx`.**

Mirror `DesignSystemsTab`'s "Built-in library" section (file: `apps/web/src/components/DesignSystemsTab.tsx`). Key parts of the new component:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import type { PagePatternSummary } from '@open-design/contracts';
import { fetchPagePatterns } from '../providers/registry';
import { Icon } from './Icon';

interface Props {
  onUsePattern: (pattern: PagePatternSummary) => void;
  onPreview: (pattern: PagePatternSummary) => void;
}

function namespaceOf(pageType: string): string {
  const dot = pageType.indexOf('.');
  return dot < 0 ? pageType : pageType.slice(0, dot);
}

export function PagePatternsTab({ onUsePattern, onPreview }: Props) {
  const { t } = useI18n();
  const [patterns, setPatterns] = useState<PagePatternSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');

  useEffect(() => {
    fetchPagePatterns()
      .then(setPatterns)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const categories = useMemo(() => {
    if (!patterns) return ['all'];
    const set = new Set<string>(patterns.map((p) => namespaceOf(p.pageType)));
    return ['all', ...[...set].sort()];
  }, [patterns]);

  const filtered = useMemo(() => {
    if (!patterns) return [];
    const q = query.trim().toLowerCase();
    return patterns.filter((p) => {
      if (category !== 'all' && namespaceOf(p.pageType) !== category) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.pageType.toLowerCase().includes(q)
      );
    });
  }, [patterns, category, query]);

  return (
    <section className="page-patterns-view" data-testid="page-patterns-tab" aria-labelledby="page-patterns-title">
      <header className="entry-section__head">
        <h1 id="page-patterns-title" className="entry-section__title">{t('pagePatterns.title')}</h1>
        <p className="entry-section__lede">{t('pagePatterns.lede')}</p>
      </header>

      <div className="tab-panel-toolbar">
        <input
          data-testid="page-patterns-search"
          placeholder={t('pagePatterns.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          data-testid="page-patterns-category-select"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c === 'all' ? t('pagePatterns.categoryAll') : t(`pagePatterns.category.${c}` as any)}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="tab-error" role="alert">{error}</div>
      ) : null}

      {patterns === null ? (
        <div className="tab-empty">{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="tab-empty">{t('pagePatterns.empty')}</div>
      ) : (
        <div className="ds-grid">
          {filtered.map((p) => (
            <article key={p.id} className="ds-card" data-testid={`page-pattern-card-${p.id}`}>
              <div
                className="ds-card-thumb"
                onClick={() => onPreview(p)}
                role="button"
                tabIndex={0}
              >
                {/* lazy iframe — mirror DesignSystemCard's IntersectionObserver pattern.
                    For the first pass a plain iframe is acceptable. */}
                <iframe
                  title={`${p.title} preview`}
                  sandbox="allow-scripts"
                  src={`/api/page-patterns/${encodeURIComponent(p.id)}/example`}
                  tabIndex={-1}
                  aria-hidden
                />
              </div>
              <div className="ds-card-meta">
                <div className="ds-card-title-row">
                  <span className="ds-card-title">{p.title}</span>
                </div>
                <div className="ds-card-summary">{p.description}</div>
                <div className="ds-card-footer">
                  <span className="ds-card-category">{p.pageType}</span>
                </div>
                <button
                  type="button"
                  className="ghost"
                  data-testid={`page-pattern-use-${p.id}`}
                  onClick={() => onUsePattern(p)}
                >
                  <Icon name="plus" size={14} />
                  {t('pagePatterns.useAction')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
```

**Step 4: Add interim i18n keys to `apps/web/src/i18n/types.ts` (Korean / Chinese values come in PR-3; for PR-2 just add to en).**

Append to the Dict interface:

```ts
'pagePatterns.title': string;
'pagePatterns.lede': string;
'pagePatterns.searchPlaceholder': string;
'pagePatterns.categoryAll': string;
'pagePatterns.category.auth': string;
'pagePatterns.category.list': string;
'pagePatterns.category.detail': string;
'pagePatterns.category.dashboard': string;
'pagePatterns.category.profile': string;
'pagePatterns.useAction': string;
'pagePatterns.previewAction': string;
'pagePatterns.empty': string;
```

In `apps/web/src/i18n/locales/en.ts` add English values for each (e.g. `'pagePatterns.title': 'Page patterns'`, etc.). Don't touch ko / zh-CN yet — PR-3.

**Step 5: Run — expect pass.**

```bash
pnpm --filter @open-design/web test -- --run tests/components/PagePatternsTab.test.tsx
pnpm --filter @open-design/web typecheck
```

Expected: PASS + typecheck green.

**Step 6: Commit.**

```bash
git add apps/web/src/components/PagePatternsTab.tsx apps/web/tests/components/PagePatternsTab.test.tsx apps/web/src/i18n/types.ts apps/web/src/i18n/locales/en.ts
git commit -m "feat(web): add PagePatternsTab gallery with search and filter"
```

---

## Task 13: Mount the tab inside `EntryShell`

**Files:**
- Modify: `apps/web/src/components/EntryShell.tsx`

**Step 1: Find the dispatch block.**

In `EntryShell.tsx`, locate the existing block that renders `<DesignSystemsTab>` for `view === 'design-systems'` (Explore report flagged it at line ~562 in earlier sessions; verify in current code).

**Step 2: Add the `'page-patterns'` branch.**

```tsx
{view === 'page-patterns' ? (
  <div className="entry-section">
    <PagePatternsTab
      onUsePattern={(pattern) => {
        // Phase 1: navigate to home with the example_prompt as a seed.
        // PR-3 wires this into the real pendingPluginUseHandoff channel.
        changeView('home');
      }}
      onPreview={(pattern) => {
        setPreviewPagePatternId(pattern.id);
      }}
    />
  </div>
) : null}
```

For PR-2 the `onPreview` handler can simply log or no-op; the actual modal is Step 3 below. The `onUsePattern` handler is filled in by PR-3.

**Step 3: Add the import.**

```ts
import { PagePatternsTab } from './PagePatternsTab';
```

**Step 4: Add a state hook for the preview modal.**

Mirror `previewSystemId` for design systems:

```ts
const [previewPagePatternId, setPreviewPagePatternId] = useState<string | null>(null);
```

For PR-2 we don't need a full modal — render `null` for now or a placeholder. The full modal is Task 14.

**Step 5: Typecheck.**

```bash
pnpm --filter @open-design/web typecheck
```

Expected: green.

**Step 6: Manual browser smoke.**

```bash
pnpm tools-dev start
# visit http://127.0.0.1:3896/page-patterns
```

Expected: the page renders with the eight cards, search input, and category select. Filtering works. Clicking "Use" navigates to home.

**Step 7: Commit.**

```bash
git add apps/web/src/components/EntryShell.tsx
git commit -m "feat(web): mount PagePatternsTab in EntryShell"
```

---

## Task 14: Preview modal

**Files:**
- Create: `apps/web/src/components/PagePatternPreviewModal.tsx`
- Modify: `apps/web/src/components/EntryShell.tsx`

The simplest path is to copy `DesignSystemPreviewModal.tsx` (whatever exact file name renders the existing iframe modal — grep for it) and adapt it to fetch from `/api/page-patterns/:id/example`.

**Step 1: Find the reference.**

```bash
grep -rln "DesignSystemPreviewModal\|design-systems/.*preview\|design-system-preview" apps/web/src/components/
```

**Step 2: Write the failing test.**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PagePatternPreviewModal } from '../../src/components/PagePatternPreviewModal';

describe('PagePatternPreviewModal', () => {
  it('renders an iframe pointing at the pattern example endpoint and closes on overlay click', () => {
    const onClose = vi.fn();
    render(<PagePatternPreviewModal patternId="auth-login" onClose={onClose} />);
    const iframe = screen.getByTitle(/auth-login/i) as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe('/api/page-patterns/auth-login/example');
    fireEvent.mouseDown(screen.getByTestId('page-pattern-preview-backdrop'));
    fireEvent.click(screen.getByTestId('page-pattern-preview-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });
});
```

**Step 3: Run — expect failure.**

**Step 4: Implement the modal.**

```tsx
import { useEffect } from 'react';

interface Props {
  patternId: string;
  onClose: () => void;
}

export function PagePatternPreviewModal({ patternId, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="ds-preview-backdrop"
      data-testid="page-pattern-preview-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ds-preview" onClick={(e) => e.stopPropagation()}>
        <iframe
          title={`Preview — ${patternId}`}
          sandbox="allow-scripts"
          src={`/api/page-patterns/${encodeURIComponent(patternId)}/example`}
        />
      </div>
    </div>
  );
}
```

**Step 5: Wire it in `EntryShell.tsx`.**

```tsx
{previewPagePatternId ? (
  <PagePatternPreviewModal
    patternId={previewPagePatternId}
    onClose={() => setPreviewPagePatternId(null)}
  />
) : null}
```

**Step 6: Run — expect pass.**

```bash
pnpm --filter @open-design/web test -- --run tests/components/PagePatternPreviewModal.test.tsx
pnpm --filter @open-design/web typecheck
```

**Step 7: Browser smoke — click a card thumb, modal opens. Esc / overlay closes.**

**Step 8: Commit.**

```bash
git add apps/web/src/components/PagePatternPreviewModal.tsx apps/web/src/components/EntryShell.tsx apps/web/tests/components/PagePatternPreviewModal.test.tsx
git commit -m "feat(web): page pattern preview modal"
```

---

## Task 15: PR-2 verification + open the PR

**Files:** none.

**Step 1: Full verification.**

```bash
pnpm guard
pnpm typecheck
pnpm --filter @open-design/web test
```

**Step 2: Manual end-to-end check.**

- `/page-patterns` route loads.
- Nav rail icon highlights when active.
- Eight cards render.
- Search filters by title/description.
- Category select narrows to auth/list/detail/dashboard/profile.
- Clicking a card thumb opens the preview modal; Esc closes it.
- Clicking "Use" navigates to home (Phase 2 wires the actual handoff).

**Step 3: Open the PR.**

Title: `feat(page-patterns): web gallery UI`. Surface area ticks UI. Screenshot the page in the PR body. Link the design doc and PR-1.

---

# PR-3 — i18n + project handoff wiring

## Task 16: Korean + Chinese translations for `pagePatterns.*`

**Files:**
- Modify: `apps/web/src/i18n/locales/ko.ts`
- Modify: `apps/web/src/i18n/locales/zh-CN.ts`

**Step 1: Append Korean values.**

In `ko.ts`, append before the closing `};`:

```ts
'entry.navPagePatterns': '페이지 패턴',
'pagePatterns.title': '페이지 패턴',
'pagePatterns.lede': '로그인·게시판 리스트·갤러리 같은 페이지급 패턴을 골라 한 페이지 프로젝트로 바로 시작하거나 미리 살펴보세요.',
'pagePatterns.searchPlaceholder': '페이지 패턴 검색…',
'pagePatterns.categoryAll': '전체',
'pagePatterns.category.auth': '인증',
'pagePatterns.category.list': '리스트',
'pagePatterns.category.detail': '상세',
'pagePatterns.category.dashboard': '대시보드',
'pagePatterns.category.profile': '프로필',
'pagePatterns.useAction': '이 패턴으로 새 프로젝트',
'pagePatterns.previewAction': '미리보기',
'pagePatterns.empty': '검색어와 일치하는 페이지 패턴이 없습니다.',
```

**Step 2: Append Chinese (Simplified) values to `zh-CN.ts`.**

```ts
'entry.navPagePatterns': '页面模板',
'pagePatterns.title': '页面模板',
'pagePatterns.lede': '从登录、列表、画廊等页面级模板中选一个,直接新建单页项目或先预览。',
'pagePatterns.searchPlaceholder': '搜索页面模板…',
'pagePatterns.categoryAll': '全部',
'pagePatterns.category.auth': '认证',
'pagePatterns.category.list': '列表',
'pagePatterns.category.detail': '详情',
'pagePatterns.category.dashboard': '仪表盘',
'pagePatterns.category.profile': '资料',
'pagePatterns.useAction': '用此模板新建项目',
'pagePatterns.previewAction': '预览',
'pagePatterns.empty': '没有匹配的页面模板。',
```

**Step 3: Typecheck.**

```bash
pnpm --filter @open-design/web typecheck
```

Expected: green.

**Step 4: Browser-verify Korean rendering.**

Reload `/page-patterns` in Korean locale. Header, lede, filter labels, button copy all in Korean.

**Step 5: Commit.**

```bash
git add apps/web/src/i18n/locales/ko.ts apps/web/src/i18n/locales/zh-CN.ts
git commit -m "feat(web): ko + zh-CN translations for pagePatterns"
```

---

## Task 17: Wire `pendingPluginUseHandoff` for page patterns

**Files:**
- Modify: `apps/web/src/components/EntryShell.tsx`
- Modify: `apps/web/src/components/HomeView.tsx` (only if the handoff currently rejects non-plugin ids)

**Step 1: Re-read the handoff path.**

`createPluginUseHandoff(id, pluginId, { action, inputs })` from `apps/web/src/components/home-hero/plugin-authoring.ts`. The handoff carries a `pluginId` string — for page patterns we pass the pattern id.

**Step 2: Verify HomeView's apply path accepts a page-pattern id.**

HomeView's effect handler (lines ~593–608 in the snapshot) calls `plugins.find((p) => p.id === pluginId)`. Page patterns are not in the `plugins` list. Decide:

**Option A (simplest, recommended):** add a parallel "page-pattern handoff" path. Add a new prop `pendingPagePatternHandoff?: { id: string; prompt: string } | null` on HomeView and a small effect that, when the prop is set, seeds the composer textarea with `prompt` and focuses it. No agent / plugin orchestration needed for Phase 1 — Open Design's existing first-turn flow then takes over with the seeded prompt.

**Option B:** extend the `'plugin-use'` discriminant to include `'page-pattern-use'`. Heavier refactor; defer.

Go with **A**.

**Step 3: Add the prop wiring.**

In `EntryShell.tsx`, when `PagePatternsTab` calls `onUsePattern(pattern)`, set state:

```tsx
const [pendingPagePatternHandoff, setPendingPagePatternHandoff] = useState<{
  id: string; prompt: string;
} | null>(null);

// ...
<PagePatternsTab
  onUsePattern={(pattern) => {
    setPendingPagePatternHandoff({
      id: pattern.id,
      prompt: pattern.examplePrompt ?? pattern.description ?? `Use the ${pattern.title} pattern.`,
    });
    changeView('home');
  }}
  onPreview={(pattern) => setPreviewPagePatternId(pattern.id)}
/>
```

Pass `pendingPagePatternHandoff` to `<HomeView>`:

```tsx
<HomeView
  /* ... existing props ... */
  pendingPagePatternHandoff={pendingPagePatternHandoff}
  onClearPagePatternHandoff={() => setPendingPagePatternHandoff(null)}
/>
```

**Step 4: HomeView accepts and consumes the handoff.**

In `HomeView.tsx`:

```tsx
interface Props {
  /* ... existing ... */
  pendingPagePatternHandoff?: { id: string; prompt: string } | null;
  onClearPagePatternHandoff?: () => void;
}

// inside the component:
useEffect(() => {
  if (!pendingPagePatternHandoff) return;
  setPrompt(pendingPagePatternHandoff.prompt);     // existing setter for the composer textarea
  promptTextareaRef.current?.focus();
  onClearPagePatternHandoff?.();
}, [pendingPagePatternHandoff, onClearPagePatternHandoff]);
```

Use whatever local state is already wired to the composer textarea (search for `setPrompt(` in HomeView).

**Step 5: Write a component test.**

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HomeView } from '../../src/components/HomeView';

describe('HomeView page-pattern handoff', () => {
  it('seeds the composer textarea when pendingPagePatternHandoff is set', async () => {
    const onClear = vi.fn();
    render(
      <HomeView
        /* fill in the minimal required props or use a wrapper helper from existing tests */
        pendingPagePatternHandoff={{ id: 'auth-login', prompt: 'Login prompt seed.' }}
        onClearPagePatternHandoff={onClear}
        /* ...other required props... */
      />,
    );
    await waitFor(() => {
      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(textarea.value).toBe('Login prompt seed.');
    });
    expect(onClear).toHaveBeenCalled();
  });
});
```

**Note:** HomeView has many required props. Use the existing test files in `apps/web/tests/components/HomeView*.test.tsx` as a template for filling them in. If they use a shared `renderHomeView()` helper, use that.

**Step 6: Run — expect pass.**

```bash
pnpm --filter @open-design/web test -- --run tests/components/HomeView*
pnpm --filter @open-design/web typecheck
```

**Step 7: Browser smoke.**

Navigate to `/page-patterns`, click "Use" on the auth-login card. Expected: home page opens with the composer textarea pre-filled with the pattern's `example_prompt` and focused. Pressing Enter creates a new project with that prompt.

**Step 8: Commit.**

```bash
git add apps/web/src/components/EntryShell.tsx apps/web/src/components/HomeView.tsx apps/web/tests/components/HomeView.handoff.test.tsx
git commit -m "feat(web): wire page-pattern \"Use\" to home composer handoff"
```

---

## Task 18: PR-3 verification + open the PR

**Files:** none.

**Step 1: Full verification.**

```bash
pnpm guard
pnpm typecheck
pnpm --filter @open-design/web test
```

**Step 2: i18n smoke.**

- Switch locale to Korean (Settings dialog).
- `/page-patterns` shows all UI strings in Korean.
- Switch to zh-CN — Chinese strings.
- Switch to en — English.

**Step 3: End-to-end smoke.**

- `/page-patterns` renders.
- Click "이 패턴으로 새 프로젝트" on `auth-login` → home opens with the Korean `example_prompt` text seeded.
- Press Enter → new project starts.

**Step 4: Open the PR.**

Title: `feat(page-patterns): i18n + project handoff`. Surface area ticks **i18n keys** and **UI**. Body links PR-1 and PR-2 and notes that this completes Phase 1.

---

# Done — Phase 1 complete

After PR-3 merges:

- `/page-patterns` is a fully-localized gallery of eight curated page patterns.
- Users can preview each pattern and launch a new project pre-seeded with the pattern's prompt.
- The daemon and CLI surfaces are at feature parity (UI/CLI dual-track).
- The data model carries `pageType` / `pageInputs` / `pageOutputs` so the future diagram surface (Phase 2 ② — out of scope here) can adopt the catalog without a migration.

**Next time the user comes back for ②:**

1. Read `page-patterns/AGENTS.md` page-type taxonomy.
2. Build a new canvas component that pulls from the same `/api/page-patterns` and uses `pageInputs` / `pageOutputs` to auto-suggest connections.
3. Add a sister `/api/sitemap-graphs` for storing user-drawn graphs.

That's a much bigger plan and lives in its own design doc.
