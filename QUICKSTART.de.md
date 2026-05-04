# Schnellstart

<p align="center"><a href="QUICKSTART.md">English</a> · <b>Deutsch</b> · <a href="QUICKSTART.fr.md">Français</a> · <a href="QUICKSTART.ja-JP.md">日本語</a></p>

Führen Sie das vollständige Produkt lokal aus.

## Umgebungsanforderungen

- **Node.js:** `~24` (Node 24.x). Das Repository erzwingt dies über `package.json#engines`.
- **pnpm:** `10.33.x`. Das Repository pinnt `pnpm@10.33.2` über `packageManager`; verwenden Sie Corepack, damit automatisch die gepinnte Version gewählt wird.
- **OS:** macOS, Linux und WSL2 sind die primären Pfade. Windows nativ sollte für die meisten Abläufe funktionieren, WSL2 ist aber die sicherere Basis.
- **Optionale lokale Agent-CLI:** Claude Code, Codex, Gemini CLI, OpenCode, Cursor Agent, Qwen, GitHub Copilot CLI usw. Wenn keine installiert ist, verwenden Sie den BYOK-API-Modus in den Einstellungen.

`nvm` / `fnm` sind optionale Komfortwerkzeuge, keine Voraussetzung für das Projektsetup. Wenn Sie eines davon verwenden, installieren/selektieren Sie Node 24 vor pnpm:

```bash
# nvm
nvm install 24
nvm use 24

# fnm
fnm install 24
fnm use 24
```

Aktivieren Sie dann Corepack und lassen Sie das Repository pnpm auswählen:

```bash
corepack enable
corepack pnpm --version   # sollte 10.33.2 ausgeben
```

## One-shot (Dev-Modus)

```bash
corepack enable
pnpm install
pnpm tools-dev run web # startet daemon + web im Vordergrund
# öffnen Sie die von tools-dev ausgegebene Web-URL
```

Für die Desktop-Shell und alle verwalteten Sidecars im Hintergrund:

```bash
pnpm tools-dev # startet daemon + web + desktop im Hintergrund
```

Beim ersten Laden erkennt die App Ihre installierte Code-Agent-CLI (Claude Code / Codex / Gemini / OpenCode / Cursor Agent / Qwen), wählt sie automatisch und nutzt standardmäßig den `web-prototype` Skill sowie das `Neutral Modern` Design System. Geben Sie einen Prompt ein und klicken Sie auf **Senden**. Der Agent streamt in den linken Bereich; das `<artifact>` Tag wird herausgeparst und das HTML rechts live gerendert. Nach Abschluss können Sie das Artifact mit **Auf Datenträger speichern** unter `./.od/artifacts/<timestamp>-<slug>/index.html` speichern.

Das Dropdown **Designsystem** enthält 71 integrierte Systeme: 2 handgeschriebene Starter (Neutral Modern, Warm Editorial) und 69 Produktsysteme, importiert aus [`awesome-design-md`](https://github.com/VoltAgent/awesome-design-md), gruppiert nach Kategorie (AI & LLM, Developer Tools, Productivity, Backend, Design Tools, Fintech, E-Commerce, Media, Automotive). Wählen Sie eines aus, um jeden Prototyp in der Ästhetik dieser Marke zu gestalten.

Das Dropdown **Skill** gruppiert nach Modus (Prototyp / Deck / Template / Designsystem) und zeigt den Default-Skill pro Modus mit dem Suffix `· default`. Gebündelte Skills:

- **Prototype** — `web-prototype` (generisch), `saas-landing`, `dashboard`, `pricing-page`, `docs-page`, `blog-post`, `mobile-app`.
- **Deck / PPT** — `simple-deck` (single-file horizontal swipe) und `magazine-web-ppt` (das `guizang-ppt` Bundle aus [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) — default für deck mode, bringt eigene Assets/Template + 4 References mit). Skills mit Side Files bekommen automatisch eine "Skill root (absolute)" Präambel, damit der Agent `assets/template.html` und `references/*.md` gegen den echten Pfad auf der Festplatte auflösen kann statt gegen sein CWD.

Kombinieren Sie Skill, Design System und einen einzelnen Prompt, und Sie erhalten einen layoutpassenden Prototyp oder ein Deck in der gewählten visuellen Sprache.

## Weitere Skripte

```bash
pnpm tools-dev                 # daemon + web + desktop im Hintergrund
pnpm tools-dev start web       # daemon + web im Hintergrund
pnpm tools-dev run web         # daemon + web im Vordergrund (e2e/dev server)
pnpm tools-dev restart         # daemon + web + desktop neu starten
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
pnpm tools-dev status          # verwaltete Runtimes prüfen
pnpm tools-dev logs            # daemon/web/desktop logs anzeigen
pnpm tools-dev check           # status + aktuelle logs + gängige Diagnosen
pnpm tools-dev stop            # verwaltete Runtimes stoppen
pnpm --filter @open-design/daemon build  # apps/daemon/dist/cli.js für `od` bauen
pnpm build                     # Production Build + static export nach apps/web/out/
pnpm typecheck                 # Workspace-Typecheck
```

`pnpm tools-dev` ist der einzige lokale Lifecycle-Einstieg. Verwenden Sie nicht die entfernten Legacy-Root-Aliasse (`pnpm dev`, `pnpm dev:all`, `pnpm daemon`, `pnpm preview`, `pnpm start`).

Während lokaler Entwicklung startet `tools-dev` zuerst den daemon, übergibt dessen Port an `apps/web`, und `apps/web/next.config.ts` rewritet `/api/*`, `/artifacts/*` und `/frames/*` auf diesen daemon-Port. So kann die App-Router-App ohne CORS-Setup mit dem sibling Express-Prozess sprechen.

## Prüfungen für Mediengenerierung und Agent-Dispatcher

Image-, Video-, Audio- und HyperFrames-Skills rufen die lokale `od` CLI über Umgebungsvariablen auf, die der daemon beim Start eines Agent injiziert:

- `OD_BIN` — absoluter Pfad zu `apps/daemon/dist/cli.js`.
- `OD_DAEMON_URL` — die laufende daemon-URL.
- `OD_PROJECT_ID` — die aktive Projekt-ID.
- `OD_PROJECT_DIR` — das Dateiverzeichnis des aktiven Projekts.

Wenn Mediengenerierung mit `OD_BIN: parameter not set`, fehlendem `apps/daemon/dist/cli.js` oder `failed to reach daemon at http://127.0.0.1:0` fehlschlägt, bauen Sie die daemon-CLI neu und starten Sie die verwaltete Runtime neu:

```bash
pnpm --filter @open-design/daemon build
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
ls -la apps/daemon/dist/cli.js
curl -s http://127.0.0.1:7457/api/health
```

Öffnen Sie danach das Projekt erneut aus der Open Design App, statt eine alte Terminal-Agent-Session fortzusetzen. Ein vom daemon gestarteter Agent sollte Werte wie diese sehen:

```bash
echo "OD_BIN=$OD_BIN"
echo "OD_PROJECT_ID=$OD_PROJECT_ID"
echo "OD_PROJECT_DIR=$OD_PROJECT_DIR"
echo "OD_DAEMON_URL=$OD_DAEMON_URL"
ls -la "$OD_BIN"
```

`OD_DAEMON_URL` muss ein echter daemon-Port wie `http://127.0.0.1:7457` sein, nicht `http://127.0.0.1:0`. Der Wert `:0` ist nur ein interner Hinweis für "freien Port wählen" und darf nicht in Agent-Sessions gelangen.

Im daemon-only Production Mode serviert der daemon den statischen Next.js Export selbst unter `http://localhost:7456`; ein Reverse Proxy ist dafür nicht beteiligt.

Wenn Sie nginx vor den daemon setzen, halten Sie SSE-Routen ungepuffert und unkomprimiert. Ein häufiger Fehler ist, dass die Browser-Konsole nach 80-90 Sekunden `net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)` zeigt, weil nginx `gzip on` chunked SSE Antworten puffert, obwohl der daemon `X-Accel-Buffering: no` sendet.

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

## Zwei Ausführungsmodi

| Modus | Picker-Wert | Ablauf einer Anfrage |
|---|---|---|
| **Local CLI** (Standard, wenn der daemon einen Agent erkennt) | "Local CLI" | Frontend → daemon `/api/chat` → `spawn(<agent>, ...)` → stdout → SSE → artifact parser → preview |
| **Anthropic API** (Fallback / keine CLI) | "Anthropic API · BYOK" | Frontend → `@anthropic-ai/sdk` direkt (`dangerouslyAllowBrowser`) → artifact parser → preview |

Beide Modi speisen denselben `<artifact>` Parser und denselben sandboxed iframe. Unterschiedlich sind nur Transport und System-Prompt-Auslieferung: lokale CLIs haben keinen separaten Systemkanal, daher wird der zusammengesetzte Prompt in die User Message gefaltet.

## Prompt-Zusammensetzung

Bei jedem Senden baut die App einen System Prompt aus drei Schichten und sendet ihn an den Provider:

```
BASE_SYSTEM_PROMPT   (output contract: wrap in <artifact>, no code fences)
   + active design system body  (DESIGN.md — palette/type/layout)
   + active skill body          (SKILL.md — workflow and output rules)
```

Wechseln Sie Skill oder Designsystem in der oberen Leiste, nutzt die nächste Anfrage den neuen Stack. Bodies werden pro Session im Speicher gecacht; pro Auswahl ist also nur ein daemon fetch nötig.

## Dateistruktur

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
│       ├── src/               # React + TypeScript client/runtime modules
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

## Fehlerbehebung

- **"no agents found on PATH"** — installieren Sie eine davon: `claude`, `codex`, `gemini`, `opencode`, `cursor-agent`, `qwen`, `copilot`. Alternativ wechseln Sie in der oberen Leiste zu "Anthropic API · BYOK" und fügen in **Einstellungen** einen Key ein.
- **daemon 500 on /api/chat** — prüfen Sie das daemon-Terminal und den stderr-Auszug; meist hat die CLI ihre Argumente abgelehnt. Unterschiedliche CLIs haben unterschiedliche argv-Formen; siehe `apps/daemon/src/agents.ts` `buildArgs`, falls Sie nachjustieren müssen.
- **media generation says `OD_BIN` is missing or daemon URL is `:0`** — führen Sie die Media Dispatcher Checks oben aus. Setzen Sie keine alte CLI-Session fort; öffnen Sie das Projekt aus der Open Design App neu, damit der daemon frische `OD_*` Variablen injiziert.
- **Codex lädt zu viel Plugin-Kontext** — starten Sie Open Design mit `OD_CODEX_DISABLE_PLUGINS=1 pnpm tools-dev`, damit vom daemon gestartete Codex-Prozesse mit `--disable plugins` laufen.
- **artifact never renders** — das Modell hat Text ohne `<artifact>` Wrapper erzeugt. Prüfen Sie, ob der System Prompt ankommt (daemon log), und wechseln Sie ggf. zu einem stärkeren Modell oder strengeren Skill.

## Bezug zur Vision

Dieser Schnellstart ist der lauffähige Einstieg zur Spec in [`docs/`](docs/). Die Spec beschreibt, wohin das Projekt wächst (siehe [`docs/roadmap.md`](docs/roadmap.md)). Highlights:

- `docs/architecture.md` beschreibt den ausgelieferten Stack: Next.js 16 App Router vorne, lokaler daemon dahinter und `apps/web/next.config.ts` Rewrites in dev, damit der Browser mit derselben `/api` Oberfläche spricht.
- `docs/skills-protocol.md` beschreibt das vollständige `od:` Frontmatter (typed inputs, sliders, capability gating). Dieses MVP liest nur `name` / `description` / `triggers` / `od.mode` / `od.design_system.requires`; erweitern Sie [`apps/daemon/src/skills.ts`](apps/daemon/src/skills.ts), um den Rest hinzuzufügen.
- `docs/agent-adapters.md` sieht reicheren Dispatch vor (capability detection, streaming tool-calls). Unser `apps/daemon/src/agents.ts` ist ein minimaler Dispatcher: genug, um die Verdrahtung zu beweisen.
- `docs/modes.md` listet vier Modi: prototype / deck / template / design-system. Wir liefern Skills für die ersten beiden; der Picker filtert bereits nach `mode`.
