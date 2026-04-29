# Quickstart

Run the full product locally.

## One-shot (dev mode)

```bash
nvm use                # uses Node 22 from .nvmrc
corepack enable
pnpm install
pnpm dev:all           # starts daemon (:7456) + Vite (:5173) together
open http://localhost:5173
```

On first load, the app detects your installed code-agent CLI (Claude Code / Codex / Gemini / OpenCode / Cursor Agent / Qwen), picks it automatically, and defaults to `web-prototype` skill + `Neutral Modern` design system. Type a prompt and hit **Send**. The agent streams into the left pane; the `<artifact>` tag is parsed out and the HTML renders live on the right. When it finishes, click **Save to disk** to persist the artifact under `./.od/artifacts/<timestamp>-<slug>/index.html`.

The **Design system** dropdown ships with 71 built-in systems — 2 hand-authored starters (Neutral Modern, Warm Editorial) and 69 product systems imported from [`awesome-design-md`](https://github.com/VoltAgent/awesome-design-md), grouped by category (AI & LLM, Developer Tools, Productivity, Backend, Design Tools, Fintech, E-Commerce, Media, Automotive). Pick one to skin every prototype in that brand's aesthetic.

The **Skill** dropdown groups by mode (Prototype / Deck / Template / Design system) and shows the default skill per mode with a `· default` suffix. Bundled skills:

- **Prototype** — `web-prototype` (generic), `saas-landing`, `dashboard`, `pricing-page`, `docs-page`, `blog-post`, `mobile-app`.
- **Deck / PPT** — `simple-deck` (single-file horizontal swipe) and `magazine-web-ppt` (the `guizang-ppt` bundle from [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) — default for deck mode, ships its own assets/template + 4 references). Skills with side files get an automatic "Skill root (absolute)" preamble so the agent can resolve `assets/template.html` and `references/*.md` against the real on-disk path instead of its CWD.

Pair a skill with a design system and a single prompt produces a layout-appropriate prototype or deck in the chosen visual language.

## Other scripts

```bash
pnpm daemon            # just the daemon (no web UI build)
pnpm dev               # just Vite (fails /api calls unless daemon is up)
pnpm build             # production build of the frontend → dist/
pnpm start             # build + daemon serving dist/ (single-process prod mode)
pnpm typecheck         # tsc -b --noEmit
```

Use Node 20–22. The repo pins pnpm via `packageManager`; Node 24 is not supported because `better-sqlite3` may lack matching prebuilt binaries and fall back to native compilation.

For the daemon-only production mode, the daemon serves the built SPA itself at `http://localhost:7456`, so no proxy involved.

## Two execution modes

| Mode | Picker value | How a request flows |
|---|---|---|
| **Local CLI** (default when daemon detects an agent) | "Local CLI" | Frontend → daemon `/api/chat` → `spawn(<agent>, ...)` → stdout → SSE → artifact parser → preview |
| **Anthropic API** (fallback / no CLI) | "Anthropic API · BYOK" | Frontend → `@anthropic-ai/sdk` direct (`dangerouslyAllowBrowser`) → artifact parser → preview |

Both modes feed the **same** `<artifact>` parser and the **same** sandboxed iframe. The only thing that differs is the transport and the system-prompt delivery (local CLIs have no separate system channel, so the composed prompt is folded into the user message).

## Prompt composition

For every send, the app builds a system prompt from three layers and sends it to the provider:

```
BASE_SYSTEM_PROMPT   (output contract: wrap in <artifact>, no code fences)
   + active design system body  (DESIGN.md — palette/type/layout)
   + active skill body          (SKILL.md — workflow and output rules)
```

Swap the skill or the design system in the top bar and the next send uses the new stack. Bodies are cached in-memory per session so this is a single daemon fetch per pick.

## File map

```
open-design/
├── daemon/                    # Node/Express — spawns local agents + serves APIs
│   ├── cli.js                 # `od` bin entry (also used by npm scripts)
│   ├── server.js              # /api/agents /api/skills /api/design-systems /api/chat /api/upload /api/artifacts/save
│   ├── agents.js              # PATH scanner for claude/codex/gemini/opencode/cursor-agent/qwen/copilot
│   ├── skills.js              # SKILL.md loader (frontmatter parser)
│   ├── design-systems.js      # DESIGN.md loader
│   └── frontmatter.js         # tiny YAML-subset parser (no deps)
├── skills/                    # SKILL.md — drops in from any Claude Code skill repo
│   ├── web-prototype/         # generic single-screen prototype (default for prototype mode)
│   ├── saas-landing/          # marketing page (hero / features / pricing / CTA)
│   ├── dashboard/             # admin / analytics dashboard
│   ├── pricing-page/          # standalone pricing + comparison
│   ├── docs-page/             # 3-column documentation layout
│   ├── blog-post/             # editorial long-form
│   ├── mobile-app/            # phone-frame single screen
│   ├── simple-deck/           # minimal horizontal-swipe deck
│   └── guizang-ppt/           # magazine-web-ppt — bundled deck/PPT default
│       ├── SKILL.md
│       ├── assets/template.html
│       └── references/{themes,layouts,components,checklist}.md
├── design-systems/            # DESIGN.md — 9-section schema (awesome-claude-design)
│   ├── default/               # Neutral Modern (starter)
│   ├── warm-editorial/        # Warm Editorial (starter)
│   ├── README.md              # catalog overview
│   └── …69 product systems    # claude · cohere · linear-app · vercel · stripe · airbnb …
├── scripts/sync-design-systems.mjs   # re-import from upstream getdesign tarball
├── src/                       # Vite + React SPA
│   ├── App.tsx                # orchestrates mode / skill / DS pickers + send
│   ├── providers/
│   │   ├── anthropic.ts       # SDK stream (BYOK path)
│   │   ├── daemon.ts          # fetch-SSE against /api/chat (local-CLI path)
│   │   └── registry.ts        # /api/agents /api/skills /api/design-systems fetchers
│   ├── prompts/system.ts      # composeSystemPrompt(base, skill, DS)
│   ├── artifacts/parser.ts    # streaming <artifact> parser
│   ├── runtime/srcdoc.ts      # sandbox wrapper for iframe srcDoc
│   ├── components/            # ChatPane, PreviewPane, AgentPicker, SkillPicker, DesignSystemPicker, SettingsDialog
│   └── state/config.ts        # localStorage persistence
├── docs/                      # product vision + spec
├── .od/                       # runtime data (gitignored, auto-created)
│   ├── app.sqlite              #   projects / conversations / messages / tabs
│   ├── artifacts/              #   one-off "Save to disk" renders
│   └── projects/<id>/          #   per-project working dir + agent cwd
└── vite.config.ts             # /api proxy to :7456
```

## Troubleshooting

- **"no agents found on PATH"** — install one of: `claude`, `codex`, `gemini`, `opencode`, `cursor-agent`, `qwen`, `copilot`. Or switch to "Anthropic API · BYOK" in the top bar and paste a key in **Settings**.
- **daemon 500 on /api/chat** — check the daemon terminal for the stderr tail; usually the CLI rejected its args. Different CLIs take different argv shapes; see `daemon/agents.js` `buildArgs` if you need to tweak.
- **artifact never renders** — the model produced text without wrapping in `<artifact>`. Confirm the system prompt is going through (check daemon log) and consider switching to a more capable model or a stricter skill.

## Mapping back to the vision

This Quickstart is the runnable seed of the spec in [`docs/`](docs/). The spec describes where this grows (see [`docs/roadmap.md`](docs/roadmap.md)). Highlights:

- `docs/architecture.md` proposes Next.js; we picked Vite for a simpler dev loop. The daemon contract is identical, so migrating is a port, not a rewrite.
- `docs/skills-protocol.md` describes the full `od:` frontmatter (typed inputs, sliders, capability gating). This MVP reads `name` / `description` / `triggers` / `od.mode` / `od.design_system.requires` only — extend `daemon/skills.js` to add the rest.
- `docs/agent-adapters.md` foresees richer dispatch (capability detection, streaming tool-calls). Our `daemon/agents.js` is a minimal dispatcher — enough to prove the wiring.
- `docs/modes.md` lists four modes: prototype / deck / template / design-system. We ship skills for the first two; the picker already filters by `mode`.
