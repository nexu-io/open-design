# References

**Parent:** [`spec.md`](spec.md)

Every external project this spec leans on. Three questions per entry: what is it, what do we borrow, and what do we deliberately not take.

---

## Primary references

### [Anthropic Claude Design][cd]
- **URL:** [claude.ai/design][cd] · [release announcement](https://www.infoq.cn/article/TH0QVHpvVGZ7VP3hAEmm) · [ifanr review](https://www.ifanr.com/1662860)

[cd]: https://x.com/claudeai/status/2045156267690213649
- **What it is:** Anthropic's closed-source AI design product. Released 2026-04-17. Powered by Opus 4.7. Web-only (claude.ai). Generates prototypes, wireframes, decks, marketing pages, complex prototypes with voice/video/3D/shaders.
- **Why it matters to us:** Defines the category. Its viral moment (~60M X impressions week 1) proves the market.
- **What we borrow:** The high-level value prop — "natural language → editable visual design." Feature inspiration for modes (prototype, deck, marketing). UI ideas around inline editing and custom sliders.
- **What we don't:** Closed source. Anthropic-only models. No self-hosting. Paid tiers (Pro/Max/Team/Enterprise) only. We are not trying to be a drop-in clone; we are an **open substrate** for the same category.

### [Open CoDesign][ocod] (OpenCoworkAI)
- **Repo:** [github.com/OpenCoworkAI/open-codesign][ocod]
- **Site:** [opencoworkai.github.io/open-codesign](https://opencoworkai.github.io/open-codesign/)
- **What it is:** The main open-source Claude Design alternative. MIT-licensed. Electron desktop app. React 19 + Vite + Tailwind v4. [`@mariozechner/pi-ai`][piai] for multi-provider. SQLite for version history. 12 built-in design skill modules. HTML/JSX sandboxed iframe preview. Exports HTML/PDF/PPTX/ZIP/MD. 15 templates. Comment mode + slider controls + multi-frame preview.

[ocod]: https://github.com/OpenCoworkAI/open-codesign
[piai]: https://github.com/mariozechner/pi-ai
- **Why it matters:** Direct competitor; most overlap with what we're building.
- **What we borrow:**
  - UI concepts: **comment mode** (click-to-pin element edits), **tweak sliders** (agent-emitted parameters), **multi-frame preview** (desktop/tablet/phone).
  - Sandboxed iframe preview (`<iframe sandbox="allow-scripts">` with vendored React 18 + Babel standalone for JSX).
  - Export pipeline shape (HTML/PDF/PPTX/ZIP/MD).
- **What we don't:**
  - **Electron** — we go Next.js web app instead (runs local and deploys to Vercel).
  - **Bundled agent on `pi-ai`** — we delegate to the user's existing CLI.
  - **Proprietary skill format** (TypeScript modules compiled into the app) — we use Claude Code's `SKILL.md` so third-party skills drop in.
  - **SQLite for artifacts** — plain files + `.jsonl` history, so git tracks it naturally.
  - **Sole focus on UI panels** — we add Design System mode and `DESIGN.md` as first-class.

### [multica][multica] (multica-ai)
- **Repo:** [github.com/multica-ai/multica][multica]

[multica]: https://github.com/multica-ai/multica
- **What it is:** Open-source "managed agents platform." Frontend: Next.js 16. Backend: Go + Chi + WebSocket. DB: PostgreSQL + pgvector. **Local daemon auto-detects CLIs on PATH: Claude Code, Codex, OpenClaw, OpenCode, Hermes, Gemini, Pi, Cursor Agent.** Assigns work via a web board view; agents execute; WebSocket streams progress.
- **Why it matters:** They already solved the "detect and wrap local code agents" problem.
- **What we borrow:**
  - **PATH-scan + config-dir probe detection** strategy.
  - **Local daemon + WebSocket** topology (daemon on user's machine, thin web client).
  - Agent catalog (our P0–P2 list maps closely to theirs).
- **What we don't:**
  - Go backend + PostgreSQL — overkill for our scope; Node daemon + filesystem is enough.
  - Team / board / issue-assignment model — not our domain.
  - pgvector — we don't embed anything in MVP.

### [cc-switch][ccsw] (farion1231)
- **Repo:** [github.com/farion1231/cc-switch][ccsw]

[ccsw]: https://github.com/farion1231/cc-switch
- **What it is:** Tauri desktop app for managing five CLI tools (Claude Code, Codex, Gemini CLI, OpenCode, OpenClaw). Provider management, MCP server config, skills install, session browsing. SQLite at `~/.cc-switch/cc-switch.db`. **Skills dir at `~/.cc-switch/skills/` with symlinks into each agent's config dir.** 50+ provider presets.
- **Why it matters:** Shows exactly how to live beside multiple code-agent CLIs without stepping on their config.
- **What we borrow:**
  - **Symlink-based skill distribution.** Canonical skill location + symlinks to each agent's skills dir.
  - Knowledge of per-agent config dir locations (`~/.claude/`, `~/.codex/`, …).
  - "Provider presets" idea — a curated list we can ship so users don't have to hand-enter endpoint URLs for OpenAI-compatible relays.
- **What we don't:**
  - Tauri / desktop app — not our shape.
  - Provider-switching as core feature — we defer that to the underlying agent. If a user wants to switch providers inside Claude Code, they use Claude Code's config, not ours.
  - Tray icon / system integration — out of scope.

### [awesome-claude-design][acd] (VoltAgent)
- **Repo:** [github.com/VoltAgent/awesome-claude-design][acd]

[acd]: https://github.com/VoltAgent/awesome-claude-design
- **Ecosystem:** 68 DESIGN.md files for named brands. Referenced schema has **9 standardized sections**: Visual Theme & Atmosphere, Color Palette & Roles, Typography Rules, Component Stylings, Layout Principles, Depth & Elevation, Do's and Don'ts, Responsive Behavior, Agent Prompt Guide.
- **Related URLs:** claude.ai/design, getdesign.md, Discord community
- **Why it matters:** Defines the de-facto portable design-system format for AI agents.
- **What we borrow:**
  - **The entire `DESIGN.md` format, unchanged.** We adopt their 9-section schema as OD's canonical design-system format.
  - Ecosystem compatibility: any of their 68 DESIGN.md files works as an OD active design system out of the box.
- **What we don't:**
  - Their curated list itself — we don't fork their 68 files; we reference upstream.
  - Their Discord / community layer — not our product.

### [guizang-ppt-skill][guizang] (op7418)
- **Repo:** [github.com/op7418/guizang-ppt-skill][guizang]

[guizang]: https://github.com/op7418/guizang-ppt-skill
- **What it is:** A Claude Code skill producing magazine-style, horizontal-swipe web decks. Structure: `SKILL.md` + `assets/template.html` + `references/{components,layouts,themes,checklist}.md`. 6-step workflow. Single-file HTML output with embedded CSS/WebGL. Keyboard/scroll/touch navigation.
- **Why it matters:** Reference implementation of a high-quality Claude skill, and our default deck skill.
- **What we borrow:**
  - **The whole skill, unmodified.** It's our default v1 `deck-skill`. A user runs `od skill add https://github.com/op7418/guizang-ppt-skill` and it works.
  - Skill directory convention (`assets/` + `references/` + `SKILL.md`) as the pattern we document for skill authors.
  - The "6-step workflow + quality-checklist rubric" pattern for authoring new skills.
- **What we don't:** Nothing — this is pure reuse. We add an `od:` block to its front-matter only if we want to expose theme sliders; the skill works without it.

---

## Secondary references (format / protocol / UI ideas)

| Project | Relevance |
|---|---|
| [Claude Code skills docs](https://docs.anthropic.com/) | Source of the `SKILL.md` format we adopt |
| [Cursor .cursorrules](https://docs.cursor.com/) | Informs how the Cursor Agent adapter injects skill context |
| [Reveal.js](https://revealjs.com/) / [Marp](https://marp.app/) | Reference for deck HTML navigation patterns |
| [Shadcn/ui](https://ui.shadcn.com/) | Likely component library for the web UI shell |
| [Vercel AI SDK](https://sdk.vercel.ai/) | Streaming primitives for the API-fallback adapter |
| [Puppeteer](https://pptr.dev/) | PDF export engine |
| [pptxgenjs](https://gitbrent.github.io/PptxGenJS/) | PPTX export engine |
| [chokidar](https://github.com/paulmillr/chokidar) | Filesystem watching for skill / artifact hot-reload |

---

## Compatibility & differentiation matrix

| Dimension | [Claude Design][cd] | [Open CoDesign][ocod] | [multica][multica] | [cc-switch][ccsw] | **OD** |
|---|---|---|---|---|---|
| Open source | ❌ | ✅ | ✅ | ✅ | ✅ |
| Primary form factor | Web (hosted) | Electron | Web + Go daemon | Tauri | **Next.js web + Node daemon** |
| Vercel-deployable | ❌ | ❌ | ❌ | ❌ | **✅** |
| Runs local-only | ❌ | ✅ | ✅ | ✅ | **✅** |
| Generates design artifacts | ✅ | ✅ | ❌ (general coding) | ❌ | **✅** |
| Uses existing code agent | — (owns it) | ❌ | ✅ | ✅ | **✅** |
| Supports Claude Code skills (`SKILL.md`) | — | ❌ | ✅ | ✅ | **✅** |
| `DESIGN.md` as first-class | ❌ | ❌ | — | — | **✅** |
| Deck mode / PPTX export | ✅ | ✅ | ❌ | ❌ | **✅ (via skill)** |
| Template gallery | ✅ | ✅ (15) | ❌ | ❌ | **✅** |
| Design-system authoring mode | ❌ | ❌ | ❌ | ❌ | **✅** |

The two empty-column crossings where OD lights up and others don't: **Vercel-deployable + design-system authoring**, and **uses existing code agent + first-class DESIGN.md**. That's the niche.

---

## What we explicitly don't borrow (and why)

- **Desktop packaging** (Electron / Tauri). Every minute spent on code-signing is a minute not spent on skills. If a user wants a tray icon, [`cc-switch`][ccsw] already does that — install both.
- **SQLite for artifacts** (from [Open CoDesign][ocod] and [cc-switch][ccsw]). Plain files + JSONL history are reviewable in git, trivially portable, and match the "skills are files" ethos.
- **Bundled model router** ([`pi-ai`][piai] from [Open CoDesign][ocod]). The user's code agent already routes. Two routers is worse than one.
- **PostgreSQL + pgvector** (from [multica][multica]). We don't embed anything in MVP. When we do, SQLite + `sqlite-vec` is enough for single-user scale.
- **Board / issue model** (from [multica][multica]). Off-brand for a design tool.

These "don'ts" are what keep the MVP achievable in 6–8 weeks.

---

## Living references

This file is maintained. When we add an adapter or borrow a pattern from a new upstream, add it here with the same three-question format. When upstream licensing or direction changes materially, flag it here and cross-link from [`spec.md`](spec.md).
