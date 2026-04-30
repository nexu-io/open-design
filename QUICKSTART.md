# Quickstart

Run the full product locally.

## Environment requirements

- **Node.js:** `~24` (Node 24.x). The repo enforces this through `package.json#engines`.
- **pnpm:** `10.33.x`. The repo pins `pnpm@10.33.2` through `packageManager`; use Corepack so the pinned version is selected automatically.
- **OS:** macOS, Linux, and WSL2 are the primary paths. Windows native should work for most flows, but WSL2 is the safer baseline.
- **Optional local agent CLI:** Claude Code, Codex, Gemini CLI, OpenCode, Cursor Agent, Qwen, GitHub Copilot CLI, etc. If none are installed, use the BYOK API mode from Settings.

`nvm` / `fnm` are optional convenience tools, not required project setup. If you use one, install/select Node 24 before running pnpm:

```bash
# nvm
nvm install 24
nvm use 24

# fnm
fnm install 24
fnm use 24
```

Then enable Corepack and let the repo select pnpm:

```bash
corepack enable
corepack pnpm --version   # should print 10.33.2
```

## One-shot (dev mode)

```bash
corepack enable
pnpm install
pnpm tools-dev run web # starts daemon + web in the foreground
# open the web URL printed by tools-dev
```

On first load, the app detects your installed code-agent CLI (Claude Code / Codex / Gemini / OpenCode / Cursor Agent / Qwen), picks it automatically, and defaults to `web-prototype` skill + `Neutral Modern` design system. Type a prompt and hit **Send**. The agent streams into the left pane; the `<artifact>` tag is parsed out and the HTML renders live on the right. When it finishes, click **Save to disk** to persist the artifact under `./.od/artifacts/<timestamp>-<slug>/index.html`.

The **Design system** dropdown ships with 71 built-in systems — 2 hand-authored starters (Neutral Modern, Warm Editorial) and 69 product systems imported from [`awesome-design-md`](https://github.com/VoltAgent/awesome-design-md), grouped by category (AI & LLM, Developer Tools, Productivity, Backend, Design Tools, Fintech, E-Commerce, Media, Automotive). Pick one to skin every prototype in that brand's aesthetic.

The **Skill** dropdown groups by mode (Prototype / Deck / Template / Design system) and shows the default skill per mode with a `· default` suffix. Bundled skills:

- **Prototype** — `web-prototype` (generic), `saas-landing`, `dashboard`, `pricing-page`, `docs-page`, `blog-post`, `mobile-app`.
- **Deck / PPT** — `simple-deck` (single-file horizontal swipe) and `magazine-web-ppt` (the `guizang-ppt` bundle from [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) — default for deck mode, ships its own assets/template + 4 references). Skills with side files get an automatic "Skill root (absolute)" preamble so the agent can resolve `assets/template.html` and `references/*.md` against the real on-disk path instead of its CWD.

Pair a skill with a design system and a single prompt produces a layout-appropriate prototype or deck in the chosen visual language.

## Other scripts

```bash
pnpm tools-dev                 # daemon + web + desktop in the background
pnpm tools-dev start web       # daemon + web in the background
pnpm tools-dev run web         # daemon + web in the foreground (e2e/dev server)
pnpm tools-dev status          # inspect managed runtimes
pnpm tools-dev logs            # show daemon/web/desktop logs
pnpm tools-dev stop            # stop managed runtimes
pnpm build                     # production build + static export to apps/web/out/
pnpm typecheck                 # workspace typecheck
```

`pnpm tools-dev` is the only local lifecycle entry point. Do not use the removed legacy root aliases (`pnpm dev`, `pnpm dev:all`, `pnpm daemon`, `pnpm preview`, `pnpm start`).

During local development, `tools-dev` starts the daemon first, passes its port into `apps/web`, and `apps/web/next.config.ts` rewrites `/api/*`, `/artifacts/*`, and `/frames/*` to that daemon port so the App Router app can talk to the sibling Express process without CORS setup.

For the daemon-only production mode, the daemon serves the static Next.js export itself at `http://localhost:7456`, so no reverse proxy is involved.

If you place nginx in front of the daemon, keep SSE routes unbuffered and uncompressed. A common failure is the browser console showing `net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)` after 80-90 seconds because nginx `gzip on` buffers chunked SSE responses even when the daemon sends `X-Accel-Buffering: no`.

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:7456;

    proxy_buffering off;
    gzip off;

    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
    proxy_http_version 1.1;
    proxy_set_header Connection "";

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

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
├── apps/
│   ├── daemon/                # Node/Express — spawns local agents + serves APIs
│   │   └── src/
│   │       ├── cli.ts             # `od` bin entry
│   │       ├── server.ts          # /api/* + static serving
│   │       ├── agents.ts          # PATH scanner for claude/codex/gemini/opencode/cursor-agent/qwen/copilot
│   │       ├── skills.ts          # SKILL.md loader (frontmatter parser)
│   │       └── design-systems.ts  # DESIGN.md loader
│   │   ├── sidecar/           # tools-dev daemon sidecar wrapper
│   │   └── tests/             # daemon package tests
│   ├── web/                   # Next.js 16 App Router + React client
│       ├── app/               # App Router entrypoints
│       ├── src/               # shared React + TypeScript client/runtime modules
│       │   ├── App.tsx        # orchestrates mode / skill / DS pickers + send
│       │   ├── providers/     # daemon + BYOK API transports
│       │   ├── prompts/       # system, discovery, directions, deck framework
│       │   ├── artifacts/     # streaming <artifact> parser + manifests
│       │   ├── runtime/       # iframe srcdoc, markdown, export helpers
│       │   └── state/         # localStorage + daemon-backed project state
│       ├── sidecar/           # tools-dev web sidecar wrapper
│       └── next.config.ts     # tools-dev rewrites + prod apps/web/out export config
│   └── desktop/               # Electron runtime, launched/inspected by tools-dev
├── packages/
│   ├── contracts/             # shared web/daemon app contracts
│   ├── sidecar-proto/         # Open Design sidecar protocol contract
│   ├── sidecar/               # generic sidecar runtime primitives
│   └── platform/              # generic process/platform primitives
├── tools/dev/                 # `pnpm tools-dev` lifecycle and inspect CLI
├── e2e/                       # Playwright UI + external integration/Vitest harness
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
├── scripts/sync-design-systems.ts    # re-import from upstream getdesign tarball
├── docs/                      # product vision + spec
├── .od/                       # runtime data (gitignored, auto-created)
│   ├── app.sqlite              #   projects / conversations / messages / tabs
│   ├── artifacts/              #   one-off "Save to disk" renders
│   └── projects/<id>/          #   per-project working dir + agent cwd
├── pnpm-workspace.yaml        # apps/* + packages/* + tools/* + e2e
└── package.json               # root quality scripts + `od` bin
```

## Troubleshooting

- **"no agents found on PATH"** — install one of: `claude`, `codex`, `gemini`, `opencode`, `cursor-agent`, `qwen`, `copilot`. Or switch to "Anthropic API · BYOK" in the top bar and paste a key in **Settings**.
- **daemon 500 on /api/chat** — check the daemon terminal for the stderr tail; usually the CLI rejected its args. Different CLIs take different argv shapes; see `apps/daemon/src/agents.ts` `buildArgs` if you need to tweak.
- **artifact never renders** — the model produced text without wrapping in `<artifact>`. Confirm the system prompt is going through (check daemon log) and consider switching to a more capable model or a stricter skill.

## Mapping back to the vision

This Quickstart is the runnable seed of the spec in [`docs/`](docs/). The spec describes where this grows (see [`docs/roadmap.md`](docs/roadmap.md)). Highlights:

- `docs/architecture.md` describes the shipped stack: Next.js 16 App Router in front, local daemon behind it, and `apps/web/next.config.ts` rewrites in dev to keep the browser talking to the same `/api` surface.
- `docs/skills-protocol.md` describes the full `od:` frontmatter (typed inputs, sliders, capability gating). This MVP reads `name` / `description` / `triggers` / `od.mode` / `od.design_system.requires` only — extend `apps/daemon/src/skills.ts` to add the rest.
- `docs/agent-adapters.md` foresees richer dispatch (capability detection, streaming tool-calls). Our `apps/daemon/src/agents.ts` is a minimal dispatcher — enough to prove the wiring.
- `docs/modes.md` lists four modes: prototype / deck / template / design-system. We ship skills for the first two; the picker already filters by `mode`.
