# Super-System Shipping Log — 2026-05-19

> Internal record of the multi-CLI fan-out / super-system / Components-browser ship.
> Session run on EOSmini (Mac mini M4 24GB). Author: enochodu.

## TL;DR

A single Claude Code session added a multi-CLI fan-out workflow, a Compare tab, a Components browser with live previews of 158 brands, a Cmd-K palette, a per-skill detail page, a Welcome tour, an Agent Builder form, and per-run git snapshots to the Open Design web app (nexu-io/open-design fork). It also imported two internal design systems from the user's existing projects (`multica`, `eos-design`), shipped 14 cross-cutting design patterns as a `super-system` skill, and wired live HTML preview into the Compare cards so fan-out outputs can be visually compared instead of read.

All changes land inside `apps/web/src/`, `apps/daemon/src/`, `packages/contracts/`, and `design-systems/<brand>/`. No new top-level apps or packages. `pnpm guard` and `pnpm typecheck` both green end-of-session.

## The 5-minute tour

Run `pnpm tools-dev start daemon web` and open the web URL. From there:

1. Press `⌘K` — command palette opens, searches skills + brands + views.
2. Click the **Compare** icon in the left nav rail → see persisted fan-out groups with HTML preview iframes.
3. Click the **Components** icon → 158-brand grid with live `components.html` previews, sortable by selector count / A→Z / AA-pass first, filterable by vibe (pastel / editorial / cyberpunk / etc.) and WCAG AA. Search supports brand name + selector name.
4. Open any project → in the chat composer, the **grid** icon (next to send) opens the Fan Out picker; tick 2+ CLIs and send. Each gets a role suffix (claude=design taste, codex=logic+tests, cursor-agent=fast iterate, gemini=long-context, ollama=local·free).
5. Above the composer, suggested skills surface when your draft contains a known trigger (220ms debounce).
6. The composer now has 4 new icon buttons: 📎 attach files, 🔗 import URL, 🎨 extract design system from image, 🖼️ search Mobbin.

## Feature inventory

### 1. Multi-CLI Fan Out

- **Composer button** at `apps/web/src/components/FanOutButton.tsx` — multi-select popover with per-agent role labels.
- **Per-agent role suffix** appended to each run's history so the same brief produces 4-5 distinct dimensions (not 4 copies of the same answer).
- **Available roles:** claude (design taste), codex (logic + tests), cursor-agent (fast iterate), gemini (long-context extract), ollama (local · free).
- **Auto-attach playbook**: checkbox in the popover (on by default) threads `super-system` into `skillIds`, so PATTERNS.md + RESEARCH.md land in every sibling's system prompt.

### 2. Compare tab (`/compare`)

- New left-nav route + `CompareView` component (`apps/web/src/components/CompareView.tsx`).
- Lists groups bucketed by `fanoutGroupId`, newest first.
- Each sibling card live-tails the run's event stream via `reattachDaemonRun()` — text accumulates in real-time.
- **HTML preview iframe**: when a sibling's content is `<!doctype html>` or `<html…>` (raw or fenced), the card swaps to a sandboxed iframe with a Preview/HTML toggle.
- **Winner picker**: star button on every succeeded sibling. Daemon persists the choice (single-select per group) and clears every other sibling's flag.
- **Suggest Winner**: heuristic synthesizer endpoint picks the longest succeeded output and pre-marks it. Hook point for upgrading to a judge model.
- **Copy output**: clipboard button per card.
- **Convert chips**: → React / → Vue / → Svelte chips copy a pre-built conversion follow-up prompt.
- **Deep-link**: every assistant message in a fan-out run shows "Open in Compare →" linking to `/compare?group=<id>`; the view auto-expands that group on mount.
- **SQLite persistence**: `fanout_runs` table survives daemon restart; new module `apps/daemon/src/fanout-persistence.ts`.

### 3. Super-System skill

Lives at `skills/super-system/`. Three files:

- `SKILL.md` — Open Design skill manifest. Triggers on "super system", "clone this site", "awwwards", "run all CLIs", "premium site", etc.
- `PATTERNS.md` — 15 cross-cutting design + AI-coding rules. Threaded into the agent's system prompt at run-time.
- `RESEARCH.md` — full 14-video synthesis with concrete tool stacks, prompt strategies, anti-patterns.

### 4. Components browser (`/components`)

- New route + `ComponentsView` (`apps/web/src/components/ComponentsView.tsx`).
- 158 brands grouped by brand (not by selector), each rendered as a card with a 220px live iframe preview of the brand's `components.html`.
- Lazy-mount via `IntersectionObserver` so 158 iframes don't crash the page.
- **Filters**: category (button/card/hero/pricing/footer/…), vibe (pastel/editorial/cyberpunk/dark/warm/mono/minimal/retro/corporate/brutalist), AA-only.
- **Sort**: most selectors / A→Z / AA-pass first.
- **Search**: brand name + selector name.
- **Cross-brand diff**: multi-select up to 4 brands → "Compare N" button opens a full-screen side-by-side iframe grid.
- **"Use in project"**: button on every card → modal picks a project → `patchProject(id, {designSystemId})` → navigates.

### 5. Design-system imports

- **`design-systems/multica/`** — imported from `~/Projects/multica/packages/ui/styles/tokens.css`. Indigo (`oklch(0.55 0.16 255)`) operator-console tokens. Sidebar + priority chips + 5-stop chart palette.
- **`design-systems/eos-design/`** — imported from `~/Projects/EOS AGENCY/enoch-macos-portfolio/src/css/theme.css`. Apple Action Blue + 9-stop grey ramp. macOS window chrome.
- Both registered in `design-systems/_schema/tokens.schema.ts` via `BRAND_EXTENSION_PREFIXES` (`--multica-`, `--eos-`).

### 6. Composer enhancements

All in `apps/web/src/components/ChatComposer.tsx`:

- **Fan Out button** (see #1)
- **Import URL button** — new daemon endpoint `POST /api/import-url` fetches a public URL, strips JS noise, writes the cleaned HTML to `<project>/.imports/`, stages it as an attachment.
- **Extract design system from image** — pre-fills a strict extraction prompt (asks for `tokens.css` + `DESIGN.md` blocks) and opens the file picker.
- **Mobbin search** — opens `https://mobbin.com/search?q=<draft>` in a new tab.
- **Skill recommendations** — `SkillRecommendations.tsx` watches the draft (220ms debounce); when keywords match any skill's `triggers[]`, surface up to 3 dismissible "+ skill" chips above the textarea.
- **Design-system quick-chips** strip above the composer — top 8 systems by `updatedAt`, one-click attach.
- **Featured skills float to top** of the @-mention picker when no query is typed (`skillMentionRank` now boosts `featured > 0`).

### 7. Cmd-K command palette

- `apps/web/src/components/CommandPalette.tsx`. Mounted globally in `App.tsx`.
- Triggered by `⌘K` (Mac) / `Ctrl-K` (other). `Esc` closes.
- Searches skills, brands, views in one pane. Arrow keys + Enter to navigate.
- Lazy-fetches catalogs on first open; refreshes on each re-open.

### 8. Per-skill detail page (`/skills/<id>`)

- `SkillDetailView.tsx`. Fetches `/api/skills/:id` + `/api/skills/:id/files`.
- Renders SKILL.md prose + clickable file chips for the skill's adjacent files (PATTERNS.md, RESEARCH.md, etc.).
- Critical for super-system — the 14-video research is now actually readable.

### 9. Welcome / feature tour (`/welcome`)

- `WelcomeView.tsx`. Three feature cards (Super-System / Fan Out / Brand library) + keyboard cheatsheet.
- Distinct from the existing `OnboardingView` (a BYOK/agent config wizard inside `EntryShell.tsx`).

### 10. Agent Builder (`/agent-builder`)

- `AgentBuilderView.tsx`. Form: name, description, triggers (comma/newline), body (SKILL.md markdown).
- POSTs to existing `/api/skills/import`. Saved skill jumps to skill-detail view.
- Writes to `<runtimeData>/user-skills/<slug>/SKILL.md`.

### 11. Snapshot per-run diff

- `apps/daemon/src/runs.ts` `start()` hook: before every run, calls `git stash create` in the project's working directory (if it's a git repo).
- Hash stored on the run record as `preRunStashHash`; surfaced on `ChatRunStatusResponse`.
- Rollback: `git stash apply <hash>` in the project dir. UI button is TODO.
- Best-effort — never aborts a run.

### 12. Save-as-design-system

- `POST /api/design-systems/save-from-extraction` accepts `{slug, name, tokensCss, designMd, componentsHtml?}` → writes 3 files to `<runtimeData>/design-systems/<slug>/`.
- AssistantMessage now detects fenced `tokens.css` + `DESIGN.md` blocks in the agent's reply and surfaces a "Save as design system" button.
- Saved brands appear immediately in `/components` (the endpoint scans both built-in and user dirs).

## New API endpoints (daemon)

All registered in both `apps/daemon/src/server.ts` and `apps/daemon/src/chat-routes.ts` (per the existing duplicate-registration pattern):

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/import-url` | Fetch + clean a public URL, optionally write to a project's `.imports/` |
| `GET` | `/api/components` | All brands grouped by brand with categories + contrast + vibe |
| `GET` | `/api/design-systems/:id/components-html` | Raw `components.html` for one brand (user dir takes precedence) |
| `GET` | `/api/runs/fanout-groups` | Bucket-by-fanoutGroupId list with sibling status + winner |
| `POST` | `/api/runs/:id/winner` | Mark a run as the winner; clears siblings in the same group |
| `POST` | `/api/runs/fanout-groups/:groupId/suggest-winner` | Heuristic synthesizer (longest-output picks winner) |
| `POST` | `/api/design-systems/save-from-extraction` | Save tokens.css + DESIGN.md + components.html as a new brand |

## New web routes

| Path | Component | What |
|---|---|---|
| `/compare` | `CompareView` | Fan-out group review |
| `/components` | `ComponentsView` | 158-brand grid with live previews |
| `/welcome` | `WelcomeView` | Feature tour |
| `/agent-builder` | `AgentBuilderView` | Skill authoring form |
| `/skills/<id>` | `SkillDetailView` | Per-skill prose + files |

## New `od` CLI subcommand

`od fanout` — registered in `apps/daemon/src/cli.ts` `SUBCOMMAND_MAP`:

```
od fanout --agents claude,codex,cursor-agent --prompt "Build a hero" \
          --project super-system-demo \
          [--skill super-system] [--design-system monarch-money] \
          [--prompt-file <path|->] [--json]

od fanout status [<fanoutGroupId>] [--json]
```

External agents (hermes-agent, shell scripts, slack bots) can drive the same parallel flow as the web UI's Fan Out button.

## Contract types added

In `packages/contracts/src/api/chat.ts`:

- `ChatRequest.fanoutGroupId?: string | null`
- `ChatRequest.skillIds?: string[]` (already existed; now used by the auto-attach playbook checkbox)
- `ChatRunStatusResponse.fanoutGroupId?: string | null`
- `ChatRunStatusResponse.preRunStashHash?: string | null`
- `ChatMessage.fanoutGroupId?: string | null`
- `FanoutGroupSummary`
- `FanoutGroupListResponse`
- `FanoutSuggestWinnerResponse`
- `ChatRunListQuery`

## File inventory

### New web files

- `apps/web/src/components/FanOutButton.tsx`
- `apps/web/src/components/CompareView.tsx`
- `apps/web/src/components/ComponentsView.tsx`
- `apps/web/src/components/CommandPalette.tsx`
- `apps/web/src/components/SkillDetailView.tsx`
- `apps/web/src/components/WelcomeView.tsx`
- `apps/web/src/components/AgentBuilderView.tsx`
- `apps/web/src/components/SkillRecommendations.tsx`
- `apps/web/src/components/DesignSystemQuickChips.tsx`

### New daemon files

- `apps/daemon/src/fanout-persistence.ts`

### New design systems

- `design-systems/multica/{tokens.css,DESIGN.md,components.html}`
- `design-systems/eos-design/{tokens.css,DESIGN.md,components.html}`

### New skill

- `skills/super-system/{SKILL.md,PATTERNS.md,RESEARCH.md}`

### Modified files (notable)

- `apps/web/src/App.tsx` — mounted `<CommandPalette/>` globally; routed `/skills/:id`
- `apps/web/src/components/ChatComposer.tsx` — Fan Out button, URL/Image/Mobbin icons, skill recs, playbook toggle plumbing
- `apps/web/src/components/ChatPane.tsx` — agents/currentAgentId/fanoutSupported pass-through
- `apps/web/src/components/AssistantMessage.tsx` — "Open in Compare" + "Save as design system" buttons
- `apps/web/src/components/EntryNavRail.tsx` — nav buttons for compare + components + welcome + agent-builder
- `apps/web/src/components/EntryShell.tsx` — view dispatch for the 4 new views
- `apps/web/src/components/WorkspaceTabsBar.tsx` — entryTitle/entryIcon entries for new views
- `apps/web/src/router.ts` — `EntryHomeView` union expanded; `Route` adds `skill-detail`
- `apps/web/src/providers/daemon.ts` — new helpers: `listFanoutGroups`, `setRunWinner`, `suggestFanoutWinner`, `importUrl`, `saveExtractedDesignSystem`, `reattachDaemonRun` (existing)
- `apps/web/src/i18n/types.ts` + all 19 locales — ~25 new keys (`fanout.*`, `compare.*`, `entry.navCompare`, `entry.navComponents`, `chat.importUrl*`, `components.*`, `designSystemChips.*`)
- `apps/daemon/src/runs.ts` — `fanoutGroupId` field, `listFanoutGroups`, `setWinner`, snapshot-pre-run hook
- `apps/daemon/src/server.ts` — `/api/components`, `/api/import-url`, `/api/runs/fanout-groups`, `/api/runs/:id/winner`, suggest-winner, save-from-extraction
- `apps/daemon/src/chat-routes.ts` — mirror of the above routes (route registration is split across two files)
- `apps/daemon/src/db.ts` — `fanout_runs` table
- `apps/daemon/src/cli.ts` — `od fanout` subcommand + help
- `packages/contracts/src/api/chat.ts` — new DTOs (see above)
- `design-systems/_schema/tokens.schema.ts` — `BRAND_EXTENSION_PREFIXES` additions: `--multica-`, `--eos-`, and the 5 earlier brand prefixes
- `scripts/guard.ts` — `.browser-pilot` added to `residualSkippedDirectories`
- `apps/web/src/index.css` — ~900 lines of new CSS for all new surfaces

### Removed / renamed

- `skills/super-system/example.html` — deleted (replaced by in-app Compare view)
- `skills/super-system/assets/runner.html` — deleted (replaced by in-app FanOutButton)
- `design-systems/eos-mac/` → `design-systems/eos-design/` (renamed)

## Known unverified surfaces

The following ship code is complete and typechecks, but I didn't drive it through a full visual end-to-end during the session:

- `⌘K` keyboard handler — code path exists; no browser keypress test
- `WelcomeView` card layout
- `AgentBuilderView` form submission — API path verified via curl; UI flow not visually walked
- `preRunStashHash` field on **new** runs — works for in-memory; DB-hydrated runs don't carry it (snapshot persistence is a TODO)
- Cross-brand diff modal layout at 3-4 brands

If any of these break in real use, the fix is small — call them out and I'll patch on the next session.

## Deferred

- **`od fanout` scheduled-runs** — cron-style scheduler adds real infrastructure complexity (DB table + tick loop + dispatch). Use `launchd` / `cron` wrapping `od fanout` instead.
- **Real Image → Theme extraction with vision-model dispatch** — current ship is a prompt template + Save-as-design-system endpoint. A full daemon-side vision pipeline (upload image → spawn Claude with image content block → parse response → write brand) is a larger ship and not yet started.

## Verification

```bash
cd /Users/enochodu/Projects/open-design
pnpm guard               # green
pnpm typecheck           # green across all packages
pnpm tools-dev start daemon web
```

Smoke-tests (run against the daemon port):

```bash
DPORT=<see `pnpm tools-dev status`>

# 1. Components catalog (should be 158 brands)
curl -s http://127.0.0.1:$DPORT/api/components | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['totalBrands'])"

# 2. Components-html for a brand (should be 200)
curl -sI http://127.0.0.1:$DPORT/api/design-systems/multica/components-html | head -1

# 3. Fan out a real brief
RESP=$(curl -s -X POST http://127.0.0.1:$DPORT/api/projects -H 'content-type: application/json' -d '{"id":"smoke","name":"Smoke"}')
CID=$(echo $RESP | python3 -c "import sys,json; print(json.load(sys.stdin)['conversationId'])")
od fanout --agents claude,codex --prompt "Say hi" --project smoke --conversation $CID --json

# 4. Watch groups
od fanout status --json | python3 -m json.tool
```

## Source-of-truth files for future work

- **Patterns**: `skills/super-system/PATTERNS.md`
- **Research**: `skills/super-system/RESEARCH.md`
- **Plan that approved most of this**: `~/.claude-full/plans/tingly-squishing-boot.md`
- **Memory pointers (cross-session feedback)**: `~/.claude-full/projects/-Users-enochodu-Projects/memory/`
