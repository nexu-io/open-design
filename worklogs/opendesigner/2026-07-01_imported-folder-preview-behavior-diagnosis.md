# Worklog — Imported-folder preview mismatch (ADHDWorks Next.js redesign)

- **Date:** 2026-07-01
- **Author:** Oliver + Grok (Open Design session)
- **Area:** Product behavior / preview pane vs imported-folder (`code-migration`) workflows
- **Project affected:** `CANONICAL ADHDWorks Repo` (`00d952fa-5995-46f0-a5c7-455aa18e5f76`)
- **Conversation:** `b24b56a7-24b1-4a16-8e7d-392e3a2887da` — "What Is Status This Website Redesgin"
- **Status:** Diagnosed against official product docs. Not a runtime bug in the narrow sense — a documented product-model gap.

---

# ★ HANDOFF — START HERE (next session) ★

**Problem (one line):** During an imported-folder Next.js redesign, the preview pane showed a stale static landing page (`index.html`, including a `Downloads/` copy) while the agent edited `.tsx` source — which is **not** the intended preview model for this workflow.

### What the user saw

- Preview content: old funhouse landing copy ("Neurodivergent operations // est. 2024", etc.)
- Reported path: `/Users/returntoinnocense/Downloads/index.html`
- Project `baseDir`: `/Users/returntoinnocense/adhdworks-biz` (imported folder; OD reads/writes there directly)
- Agent actually edited: `src/components/store/dossier/DossierStorefront.tsx`, `DossierStorePage.tsx`, `src/data/store-narrative.ts`, etc.
- Agent did **not** rewrite project `index.html` this session
- Screenshots saved to project: `screenshots/store-dossier.png`, `screenshots/store-front.png`

### Intended product behavior (docs-grounded)

Open Design is **artifact-first**, not a generic IDE with embedded dev-server preview.

| Source | What it says |
|---|---|
| `docs/spec.md` §1 | Product turns briefs into editable, previewable **design artifacts** (prototypes, decks, templates) |
| `docs/architecture.md` §4–5 | Preview iframe loads **primary output file** when agent signals done; hot-reloads on **HTML/JSX artifact writes**; sandboxed iframe, not `localhost:3000` |
| `docs/architecture.md` § Folder import | Imported folder = `metadata.baseDir`; OD edits the real repo in place (Cursor-like); file panel, not live app compile |
| `docs/plugins-spec.md` §1 / §12 | `code-migration` scenario → file workspace + diff review; `live-artifact` preview = hot-reloading iframe for single-page HTML artifacts; CLI mirror = `od files watch` |
| `README.md` workflow | `brief → plugin → direction → design system → **artifact** → handoff → memory`; step 4 = hand off HTML/CSS to engineering |
| `docs/rfc-drafts/dev-server-auto-detect.md` | **Current shipped behavior:** static file panel only; user launches dev server externally. **Proposed (not shipped):** detect `next dev`, iframe `localhost:3000` |

**Conclusion:** Showing stale `index.html` while editing Next.js components is **not** intended. The preview pane is designed for generated HTML/JSX artifacts and whichever previewable file is selected — not automatic reflection of a running Next.js dev server.

### What *is* intended for this session type

1. Agent edits real source in `adhdworks-biz/`
2. User reviews changes in file workspace / git diffs
3. Live UI verification = external browser at dev server (e.g. `http://localhost:3000/store`)
4. Visual proof in OD = open agent-saved screenshots in file panel
5. Do **not** treat static `index.html` (project root or Downloads copy) as the redesign preview

### Related fix (same session, separate issue)

- **AMR runtime error** (`opencode binary not found`) — resolved by installing `opencode-ai` globally (`~/.npm-global/bin/opencode` v1.17.13). No daemon restart required; `resolveAmrOpenCodeExecutable` picks it up via spawn env.

### Docs-aligned workflow (ADHDWorks)

```text
# See live Next.js changes (outside OD preview pane)
cd ~/adhdworks-biz && pnpm dev   # or npm run dev
open http://localhost:3000/store

# See agent visual proof inside OD
# Open in file panel:
#   screenshots/store-dossier.png
#   screenshots/store-front.png
```

### Product gap (tracked, not fixed here)

- `docs/rfc-drafts/dev-server-auto-detect.md` describes the missing bridge: auto-detect `package.json` dev script on folder import, offer inline dev-server launch, iframe live app in preview pane.
- Until that ships, "port window" / live Next preview inside OD is aspirational, not current product promise.
- Tension: README markets `od-code-migration` for refreshing existing codebases, but preview UX still centers artifact iframe — users can reasonably expect live app preview.

### Open questions / follow-ups

1. Should OD auto-open screenshots when agent saves them during `code-migration` runs?
2. Should `.tsx` edits in imported folders surface a banner: "Preview shows static files; run dev server for live UI"?
3. Priority for implementing RFC `dev-server-auto-detect` vs better in-session guidance copy?
4. Why did user see `Downloads/index.html` path — manual open, copy absolute path, or UI showing a file outside `baseDir`?

### References

- `docs/spec.md`
- `docs/architecture.md` (§4 data flow, §5 preview renderer, § Folder import)
- `docs/plugins-spec.md` (§1 scenarios, §12 live artifact preview)
- `docs/rfc-drafts/dev-server-auto-detect.md`
- `README.md` (workflow § "from brief to artifact", `od-code-migration`)

---

## Notes / housekeeping

- This file lives in `worklogs/opendesigner/` per the agreed split: core-app/daemon
  logs isolated from website/marketing logs to keep agent context scoped.
- No source changes in `open-design` from this diagnosis; observation + docs alignment only.