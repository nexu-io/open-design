# Schnellstart

<p align="center"><a href="../../QUICKSTART.md">English</a> · <a href="QUICKSTART.pt-BR.md">Português (Brasil)</a> · <b>Deutsch</b> · <a href="QUICKSTART.fr.md">Français</a> · <a href="QUICKSTART.ja-JP.md">日本語</a> · <a href="QUICKSTART.ko.md">한국어</a> · <a href="QUICKSTART.zh-CN.md">简体中文</a> · <a href="QUICKSTART.zh-TW.md">繁體中文</a> · <a href="QUICKSTART.th.md">ภาษาไทย</a></p>

Führen Sie das vollständige Produkt lokal aus.

## Umgebungsanforderungen

- **Node.js:** `~24` (Node 24.x). Das Repository erzwingt dies über `package.json#engines`.
- **pnpm:** `10.33.x`. Das Repository pinnt `pnpm@10.33.2` über `packageManager`; verwenden Sie Corepack, damit automatisch die gepinnte Version gewählt wird.
- **OS:** macOS, Linux und WSL2 sind die primären Pfade. Windows nativ sollte für die meisten Abläufe funktionieren, WSL2 ist aber die sicherere Basis.
- **Optionale lokale Agent-CLI:** Open Design unterstützt eine Registry lokaler Runtimes, darunter Claude Code, Codex, Devin for Terminal, OpenCode, Cursor Agent, Qwen, Qoder CLI, GitHub Copilot CLI und weitere. Die aktuelle Liste steht in [`apps/daemon/src/runtimes/registry.ts`](../../apps/daemon/src/runtimes/registry.ts). Wenn keine installiert ist, verwenden Sie eine in den Einstellungen konfigurierte BYOK-Runtime.

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

Beim ersten Laden erkennt die App die verfügbaren lokalen Runtimes und bietet zusätzlich die in den Einstellungen konfigurierten BYOK-Runtimes an. Wählen Sie eine Runtime, ein Design-Template und ein Design System, geben Sie einen Prompt ein und klicken Sie auf **Senden**. Strukturierte lokale Runtimes schreiben kanonische Projektdateien und streamen Datei-/Tool-Events; Dateiarbeitsbereich und Vorschau aktualisieren sich aus diesen Schreibvorgängen. Reine Text- und BYOK-Läufe liefern stattdessen einen vollständigen `<artifact>`-Block, den der Host parst. Bevor Sie einen Artifact-Speicherpfad dokumentieren oder ändern, MÜSSEN Sie `AGENTS.md` im Repository-Stamm lesen, Abschnitt **Daemon data directory contract**.

Der Katalog **Design Systems** wird direkt aus den `DESIGN.md`-Paketen unter [`design-systems/`](../../design-systems/) geladen. Wählen Sie eines aus, um die visuelle Sprache der Marke auf das Artifact anzuwenden.

Der Katalog **Templates** kommt aus [`design-templates/`](../../design-templates/) und gruppiert Artifact-Formate für Prototypen, Decks, Dokumente, Bilder, Video und Audio. [`skills/`](../../skills/) bleibt den funktionalen Fähigkeiten vorbehalten, die der Agent während der Arbeit aufruft. Kombinieren Sie ein Template mit einem Design System, um ein Artifact in der gewählten visuellen Sprache zu erzeugen.

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
pnpm --filter @open-design/web build     # Web-Paket bei Bedarf bauen
pnpm typecheck                 # Workspace-Typecheck
```

`pnpm tools-dev` ist der einzige lokale Lifecycle-Einstieg. Verwenden Sie nicht die entfernten Legacy-Root-Aliasse (`pnpm dev`, `pnpm dev:all`, `pnpm daemon`, `pnpm preview`, `pnpm start`).

Während lokaler Entwicklung startet `tools-dev` zuerst den daemon, übergibt dessen Port an `apps/web`, und `apps/web/next.config.ts` rewritet `/api/*`, `/artifacts/*` und `/frames/*` auf diesen daemon-Port. So kann die App-Router-App ohne CORS-Setup mit dem sibling Express-Prozess sprechen.

## Docker-Setup

Führen Sie Open Design in einer vollständig containerisierten Umgebung aus, ohne Node.js oder pnpm lokal zu installieren.

### Voraussetzungen

* Docker Desktop
* Docker Compose v2

Überprüfen Sie, ob Docker korrekt installiert ist:

```bash
docker compose version
```

---

## Open Design starten

Gehen Sie vom Repository-Stammverzeichnis aus wie folgt vor:

1. Wechseln Sie in das deploy-Verzeichnis und kopieren Sie die Umgebungsvorlage:

   ```bash
   cd deploy
   cp .env.example .env
   ```

2. Generieren Sie ein sicheres Token:

   ```bash
   openssl rand -hex 32
   ```

3. Öffnen Sie `.env` in Ihrem Editor, suchen Sie `OD_API_TOKEN=` und fügen Sie das generierte Token ein.

Starten Sie dann den Dienst:

```bash
docker compose up -d
```

Öffnen Sie die App in Ihrem Browser:

```text
http://localhost:7456
```

Beim ersten Start kann es einige Sekunden dauern, während Docker das neueste Image pullt.

---

## Häufige Docker-Befehle

### Logs anzeigen

```bash
docker compose logs -f
```

### Container neu starten

```bash
docker compose restart
```

### Container stoppen

```bash
docker compose down
```

### Neuestes Image pullen

```bash
docker compose pull
docker compose up -d
```

### Alle lokalen App-Daten entfernen

```bash
docker compose down -v
```

---

## Umgebungskonfiguration

Erstellen Sie eine `deploy/.env`-Datei, um die Standardkonfiguration zu überschreiben. Beginnen Sie mit dem bereitgestellten Beispiel:

```bash
cp deploy/.env.example deploy/.env
```

Bearbeiten Sie `deploy/.env`, um Ihr eigenes Token festzulegen und andere Werte nach Bedarf anzupassen:

```env
# Auf dem Host exponierter Port
OPEN_DESIGN_PORT=7456

# Container-Speicherlimit
OPEN_DESIGN_MEM_LIMIT=384m

# Erlaubte CORS-Ursprünge
OPEN_DESIGN_ALLOWED_ORIGINS=https://yourdomain.com

# Docker-Image-Tag
OPEN_DESIGN_IMAGE=ghcr.io/nexu-io/od:latest

# Erforderliches API-Token für die Daemon-Sicherheit
# Erzeugen Sie eines mit: openssl rand -hex 32
OD_API_TOKEN=
```

---

## Dauerhafter Speicher

Bevor Sie einen persistenten Daemon-Speicherpfad dokumentieren, ändern oder auswählen,
MÜSSEN Sie `AGENTS.md` im Repository-Stamm lesen, Abschnitt **Daemon data directory contract**.
Dieser Quickstart DARF diesen Vertrag NICHT wiederholen oder Speicherpfade definieren.

---

## Hinweise

* Der Docker-Modus ist ideal für Mitwirkende, die keine lokale Node.js- oder pnpm-Einrichtung wünschen.
* Der Container exponiert den Produktions-Daemon-Build direkt auf Port `7456`.
* Für Entwicklungsworkflows und erweiterte lokale Einrichtung siehe den Rest dieser Schnellstartanleitung.

---

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
| **Local CLI** (Standard, wenn der daemon einen Agent erkennt) | "Local CLI" | Frontend → daemon `/api/chat` → `spawn(<agent>, ...)` → strukturierte Tool-/Datei-Events über SSE → Projektdateien → Vorschau. Plain-Stream-CLIs nutzen stattdessen den Text-Artifact-Pfad. |
| **API-Modus** (Fallback / keine CLI) | "Anthropic API" / "OpenAI API" / "Atlas Cloud" / "Azure OpenAI" / "Google Gemini" | Frontend → daemon `/api/proxy/{provider}/stream` → Provider-SSE als `delta/end/error` normalisiert → `<artifact>`-Parser → Vorschau |

Beide Modi enden im selben Dateiarbeitsbereich und derselben sandboxed Vorschau, haben aber unterschiedliche Übergabeverträge. Dateisystemfähige Runtimes schreiben die kanonischen Dateien und dürfen deren Quelltext nicht als `<artifact>` wiederholen. Plain-/Text-only- und BYOK-Läufe haben keine Dateitools; ihre kanonische Ausgabe ist vollständiges HTML in `<artifact>`. Das Ausführungsprofil folgt dem Runtime-Transport.

## Prompt-Zusammensetzung

Bei jedem Senden baut die App einen System Prompt aus drei Schichten und sendet ihn an den Provider:

```
BASE_SYSTEM_PROMPT   (ausführungsprofilspezifische Datei- oder <artifact>-Übergabe)
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
│   │       ├── agents.ts          # compatibility exports for the runtime modules
│   │       ├── runtimes/
│   │       │   ├── registry.ts    # supported runtime registry
│   │       │   └── defs/          # per-runtime launch and argument definitions
│   │       ├── skills.ts          # SKILL.md loader (frontmatter parser)
│   │       └── design-systems/    # DESIGN.md loader and services
│   │   ├── sidecar/           # tools-dev daemon sidecar wrapper
│   │   └── tests/             # daemon package tests
│   ├── web/                   # Next.js 16 App Router + React client
│       ├── app/               # App Router entrypoints
│       ├── src/               # React + TypeScript client/runtime modules
│       │   ├── App.tsx        # orchestrates mode / skill / DS pickers + send
│       │   ├── providers/     # daemon + BYOK API transports
│       │   ├── prompts/       # system, discovery, directions, deck framework
│       │   ├── artifacts/     # Text-Artifact-Parsing + Artifact-Manifeste
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
├── skills/                    # functional capabilities invoked mid-task
├── design-templates/          # rendering catalog for prototypes, decks, docs, and media
├── design-systems/            # brand packages rooted at DESIGN.md
├── scripts/sync-design-systems.ts    # re-import from upstream getdesign tarball
├── docs/                      # product vision + spec
├── pnpm-workspace.yaml        # apps/* + packages/* + tools/* + e2e
└── package.json               # root quality scripts + `od` bin
```

## Fehlerbehebung

- **"no agents found on PATH"** — installieren Sie eine der in [`apps/daemon/src/runtimes/registry.ts`](../../apps/daemon/src/runtimes/registry.ts) registrierten lokalen Runtimes, stellen Sie sicher, dass der daemon deren Executable findet, und verwenden Sie danach **Rescan** unter **Settings → Execution mode**. Alternativ konfigurieren Sie in den Einstellungen eine BYOK-Runtime.
- **daemon 500 on /api/chat** — prüfen Sie das daemon-Terminal und den stderr-Auszug; meist hat die CLI ihre Argumente abgelehnt. Unterschiedliche CLIs haben unterschiedliche argv-Formen; prüfen Sie die passende Definition unter `apps/daemon/src/runtimes/defs/`, falls Sie nachjustieren müssen.
- **media generation says `OD_BIN` is missing or daemon URL is `:0`** — führen Sie die Media Dispatcher Checks oben aus. Setzen Sie keine alte CLI-Session fort; öffnen Sie das Projekt aus der Open Design App neu, damit der daemon frische `OD_*` Variablen injiziert.
- **Codex lädt zu viel Plugin-Kontext** — starten Sie Open Design mit `OD_CODEX_DISABLE_PLUGINS=1 pnpm tools-dev`, damit vom daemon gestartete Codex-Prozesse mit `--disable plugins` laufen.
- **artifact never renders** — bestimmen Sie zuerst das Übergabeprofil. Prüfen Sie bei einer dateisystemfähigen lokalen Runtime, ob der Agent eine darstellbare Projektdatei angelegt hat und Datei-Events den daemon erreicht haben; Quelltext gehört dort nicht in `<artifact>`. Prüfen Sie bei Plain-/Text-only- oder BYOK-Läufen auf genau einen vollständigen `<artifact>`-Block und suchen Sie im daemon-Log die erste fehlgeschlagene Grenze.

## Bezug zur Vision

Dieser Schnellstart ist der lauffähige Einstieg zur Spec in [`docs/`](../../docs/). Die Spec beschreibt, wohin das Projekt wächst (siehe [`docs/roadmap.md`](../../docs/roadmap.md)). Highlights:

- `docs/architecture.md` beschreibt den ausgelieferten Stack: Next.js 16 App Router vorne, lokaler daemon dahinter und `apps/web/next.config.ts` Rewrites in dev, damit der Browser mit derselben `/api` Oberfläche spricht.
- `docs/skills-protocol.md` beschreibt das aktuelle `SKILL.md`-/`od:`-Frontmatter und die Trennung zwischen funktionalen Skills und Rendering-Templates. Parser und Normalisierung in [`apps/daemon/src/skills.ts`](../../apps/daemon/src/skills.ts) sind die Implementierungsquelle der Wahrheit.
- `docs/agent-adapters.md` beschreibt den Adapter-Vertrag. Runtime-spezifische Launch-, Argument-, Modell- und Stream-Einstellungen liegen unter `apps/daemon/src/runtimes/defs/`; registriert werden sie in `apps/daemon/src/runtimes/registry.ts`. `apps/daemon/src/agents.ts` ist eine Kompatibilitäts-Exportfläche.
- `docs/modes.md` unterscheidet die sechs New-Project-Tabs von den sieben normalisierten Registry-Modi (`prototype`, `deck`, `template`, `design-system`, `image`, `video`, `audio`).
