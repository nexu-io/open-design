# விரைவு தொடக்கம்

<p align="center"><a href="../../QUICKSTART.md">English</a> · <a href="QUICKSTART.pt-BR.md">Português (Brasil)</a> · <a href="QUICKSTART.de.md">Deutsch</a> · <a href="QUICKSTART.fr.md">Français</a> · <a href="QUICKSTART.ko.md">한국어</a> · <a href="QUICKSTART.ja-JP.md">日本語</a> · <a href="QUICKSTART.zh-CN.md">简体中文</a> · <a href="QUICKSTART.zh-TW.md">繁體中文</a> · <b>தமிழ்</b></p>

முழு தயாரிப்பையும் உள்ளகமாக ஓட்டு.

## சூழல் தேவைகள்

- **Node.js:** `~24` (Node 24.x). Repo இதை `package.json#engines` வழியாக செயல்படுத்துகிறது.
- **pnpm:** `10.33.x`. Repo `packageManager` வழியாக `pnpm@10.33.2`-ஐ pin செய்கிறது; pinned பதிப்பு தானாகத் தேர்ந்தெடுக்கப்பட Corepack-ஐப் பயன்படுத்து.
- **OS:** macOS, Linux, மற்றும் WSL2 முக்கிய பாதைகள். Windows native ஆதரிக்கப்படுகிறது; பொதுவான அமைப்பு சிக்கல்களுக்கு [`docs/windows-troubleshooting.md`](../../docs/windows-troubleshooting.md)-ஐப் பார்.
- **Optional உள்ளக agent CLI:** Claude Code, Codex, Devin for Terminal, Gemini CLI, OpenCode, Cursor Agent, Qwen, Qoder CLI, GitHub Copilot CLI, போன்றவை. எதுவும் நிறுவப்படவில்லை என்றால், Settings-இல் இருந்து BYOK API பயன்முறையைப் பயன்படுத்து.

### உள்ளக agent CLI மற்றும் PATH

Daemon உங்கள் **`PATH`**-ஐ (மற்றும் பொதுவான user toolchain கோப்பகங்களை) ஸ்கேன் செய்கிறது. நீங்கள் ஒரு CLI-ஐ **`npm install -g`** அல்லது **Homebrew** உடன் நிறுவியும் Open Design அதை *நிறுவப்படவில்லை* எனக் காட்டினால், GUI உங்கள் உலகளாவிய npm அல்லது Homebrew `bin` கோப்பகத்தை உள்ளடக்காத ஒரு குறைந்த `PATH` உடன் தொடங்கலாம் (app ஒரு முழு login shell-இலிருந்து தொடங்கப்படாவிட்டால் macOS-ல் பொதுவானது). daemon-ஐ ஓட்டும் process-க்கான `PATH`-ல் executable-ன் கோப்பகம் இருப்பதை உறுதிப்படுத்து, பிறகு **Settings → Execution mode**-ல் **Rescan**-ஐப் பயன்படுத்து.

[`nvm`](https://github.com/nvm-sh/nvm) / [`fnm`](https://github.com/Schniz/fnm) என்பவை optional convenience கருவிகள், தேவையான திட்ட அமைப்பு அல்ல. நீங்கள் ஒன்றைப் பயன்படுத்தினால், pnpm ஓட்டுவதற்கு முன் Node 24-ஐ நிறுவு/தேர்:

```bash
# nvm
nvm install 24
nvm use 24

# fnm
fnm install 24
fnm use 24
```

பிறகு Corepack-ஐ இயக்கி repo pnpm-ஐத் தேர்வு செய்ய அனுமதி:

```bash
corepack enable
corepack pnpm --version   # should print 10.33.2
```

## Docker அமைப்பு

Open Design-ஐ Node.js அல்லது pnpm-ஐ உள்ளமையாக நிறுவாமல் ஒரு முழுமையான containerised சூழலில் ஓட்டு.

### தேவைகள்

* Docker Desktop
* Docker Compose v2

Docker சரியாக நிறுவப்பட்டுள்ளதை சரிபார்:

```bash
docker compose version
```

---

## Open Design-ஐத் தொடங்கு

Repository root-இலிருந்து:

1. deploy கோப்பகத்திற்கு மாறி சூழல் template-ஐ நகலெடு:

   ```bash
   cd deploy
   cp .env.example .env
   ```

2. ஒரு பாதுகாப்பான token உருவாக்கு:

   ```bash
   openssl rand -hex 32
   ```

3. உங்கள் editor-ல் `.env`-ஐத் திற, `OD_API_TOKEN=`-ஐக் கண்டுபிடி, மற்றும் உருவாக்கப்பட்ட token-ஐ அங்கே ஒட்டு.

பிறகு சேவையைத் தொடங்கு:

```bash
docker compose up -d
```

app-ஐ உங்கள் உலாவியில் திற:

```text
http://localhost:7456
```

முதல் தொடக்கம் Docker சமீபத்திய image-ஐ இழுக்கும்போது சில நொடிகள் ஆகலாம்.

---

## பொதுவான Docker கட்டளைகள்

### Logs பார்

```bash
docker compose logs -f
```

### Containers மறுதொடக்கம்

```bash
docker compose restart
```

### Containers நிறுத்து

```bash
docker compose down
```

### சமீபத்திய image-ஐ இழு

```bash
docker compose pull
docker compose up -d
```

### அனைத்து உள்ளக app தரவை அகற்று

```bash
docker compose down -v
```

---

## சூழல் உள்ளமைப்பு

இயல்புநிலை உள்ளமைப்பை மேலெழுத ஒரு `deploy/.env` கோப்பை உருவாக்கு. வழங்கப்பட்ட உதாரணத்திலிருந்து தொடங்கு:

```bash
cp deploy/.env.example deploy/.env
```

உங்கள் சொந்த token-ஐ அமைக்கவும் மற்ற மதிப்புகளைத் தேவைக்கேற்ப சரிசெய்யவும் `deploy/.env`-ஐத் திருத்து:

```env
# Port exposed on the host
OPEN_DESIGN_PORT=7456

# Container memory limit
OPEN_DESIGN_MEM_LIMIT=384m

# Allowed CORS origins
OPEN_DESIGN_ALLOWED_ORIGINS=https://yourdomain.com

# Docker image tag
OPEN_DESIGN_IMAGE=ghcr.io/nexu-io/od:latest

# Required API token for daemon security
# Generate one with: openssl rand -hex 32
OD_API_TOKEN=
```

---

## Persistent storage

எந்த persistent daemon storage பாதையையும் ஆவணப்படுத்துவதற்கு, மாற்றுவதற்கு, அல்லது தேர்வு செய்வதற்கு முன்,
நீங்கள் root `AGENTS.md` பிரிவு **Daemon data directory contract**-ஐப் படிக்க வேண்டும்.
இந்த Quickstart அந்த ஒப்பந்தத்தை மறுசொல்லவோ storage பாதைகளை வரையறுக்கவோ கூடாது.

---

## குறிப்புகள்

* Docker பயன்முறை உள்ளக Node.js அல்லது pnpm அமைப்பு விரும்பாத contributors-க்கு சிறந்தது.
* Container production daemon build-ஐ நேரடியாக port `7456`-ல் வெளிப்படுத்துகிறது.
* மேம்பாட்டு பணிப்பாய்வுகள் மற்றும் மேம்பட்ட உள்ளக அமைப்புக்கு, இந்த Quickstart வழிகாட்டியின் மீதியைப் பார்.

---

## ஒரு-வரி (dev பயன்முறை)

```bash
corepack enable
pnpm install
pnpm tools-dev run web # starts daemon + web in the foreground
# open the web URL printed by tools-dev
```

desktop shell மற்றும் அனைத்து நிர்வகிக்கப்பட்ட sidecars-ஐ பின்னணியில்:

```bash
pnpm tools-dev # starts daemon + web + desktop in the background
```

முதல் ஏற்றத்தின்போது, app உங்கள் நிறுவப்பட்ட code-agent CLI-ஐ (Claude Code / Codex / Devin for Terminal / Gemini / OpenCode / Cursor Agent / Qwen / Qoder CLI) கண்டறியும், தானாகத் தேர்ந்தெடுக்கும், மற்றும் `web-prototype` திறன் + `Neutral Modern` வடிவமைப்பு அமைப்பிற்கு இயல்புநிலையாகும். ஒரு prompt தட்டச்சு செய்து **Send**-ஐ அழுத்து. Agent இடது பலகத்தில் stream ஆகிறது; `<artifact>` tag parse செய்யப்பட்டு HTML வலதுபுறத்தில் live render ஆகிறது. எந்த artifact storage பாதையையும் ஆவணப்படுத்துவதற்கு முன் அல்லது மாற்றுவதற்கு முன், நீங்கள் `AGENTS.md` → **Daemon data directory contract**-ஐப் படிக்க வேண்டும்.

**Design system** கீழ்த்தோன்றல் 71 built-in அமைப்புகளுடன் வருகிறது — 2 hand-authored starters (Neutral Modern, Warm Editorial) மற்றும் [`awesome-design-md`](https://github.com/VoltAgent/awesome-design-md)-இலிருந்து இறக்குமதி செய்யப்பட்ட 69 product அமைப்புகள், பிரிவு மூலம் குழுவாக்கப்பட்டவை (AI & LLM, Developer Tools, Productivity, Backend, Design Tools, Fintech, E-Commerce, Media, Automotive). ஒவ்வொரு prototype-ஐயும் அந்த brand-ன் அழகியலில் skin செய்ய ஒன்றைத் தேர், மற்றும் [`awesome-design-skills`](https://github.com/bergside/awesome-design-skills)-இலிருந்து மூலமாகக் கொண்ட மற்றொரு 57 வடிவமைப்பு திறன்கள் தொகுப்பு.

**Skill** கீழ்த்தோன்றல் mode (Prototype / Deck / Template / Design system) மூலம் குழுவாக்குகிறது மற்றும் ஒவ்வொரு mode-ன் இயல்புநிலை திறனை ஒரு `· default` பின்னொட்டுடன் காட்டுகிறது. Bundled திறன்கள்:

- **Prototype** — `web-prototype` (generic), `saas-landing`, `dashboard`, `pricing-page`, `docs-page`, `blog-post`, `mobile-app`.
- **Deck / PPT** — `simple-deck` (single-file கிடைமட்ட ஸ்வைப்) மற்றும் `magazine-web-ppt` ([`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill)-இலிருந்து `guizang-ppt` bundle — deck பயன்முறைக்கான இயல்புநிலை, அதன் சொந்த assets/template + 4 references உடன் வருகிறது). Side files உடைய திறன்கள் ஒரு தானியங்கி "Skill root (absolute)" preamble பெறுகின்றன, இதனால் agent அதன் CWD-க்கு பதிலாக நிகழ் on-disk பாதைக்கு எதிராக `assets/template.html` மற்றும் `references/*.md`-ஐ resolve செய்ய முடியும்.

ஒரு திறனை ஒரு வடிவமைப்பு அமைப்புடன் இணை, ஒரு ஒற்றை prompt தேர்ந்தெடுக்கப்பட்ட visual மொழியில் layout-பொருத்தமான ஒரு prototype அல்லது deck-ஐ உருவாக்குகிறது.

## பிற scripts

```bash
pnpm tools-dev                 # daemon + web + desktop in the background
pnpm tools-dev start web       # daemon + web in the background
pnpm tools-dev run web         # daemon + web in the foreground (e2e/dev server)
pnpm tools-dev restart         # restart daemon + web + desktop
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
pnpm tools-dev status          # inspect managed runtimes
pnpm tools-dev logs            # show daemon/web/desktop logs
pnpm tools-dev check           # status + recent logs + common diagnostics
pnpm tools-dev stop            # stop managed runtimes
pnpm --filter @open-design/daemon build  # build apps/daemon/dist/cli.js for `od`
pnpm --filter @open-design/web build     # build the web package when needed
pnpm typecheck                 # workspace typecheck
```

`pnpm tools-dev` மட்டுமே உள்ளக lifecycle நுழைவு புள்ளி. நீக்கப்பட்ட legacy root aliases-ஐ (`pnpm dev`, `pnpm dev:all`, `pnpm daemon`, `pnpm preview`, `pnpm start`) பயன்படுத்த வேண்டாம்.

`tools-dev` ports, namespaces, மற்றும் child process சூழல்களை resolve செய்வதற்கு முன் workspace env files-ஐ தானாக ஏற்றுகிறது. இயல்புநிலை precedence `.env.development.local`, பிறகு `.env.local`, பிறகு `.env.development`, பிறகு `.env`; env files ambient shell exports-ஐ மேலெழுதுகின்றன எனவே project-local config வெல்கிறது. ஏற்றுவதை முடக்க `--no-env-file` அல்லது வெளிப்படையான env files பயன்படுத்த `--env-file <path>`-ஐ மீண்டும் மீண்டும் செய்.

உள்ளக மேம்பாட்டின் போது, `tools-dev` daemon-ஐ முதலில் தொடங்குகிறது, அதன் port-ஐ `apps/web`-க்கு அனுப்புகிறது, மற்றும் `apps/web/next.config.ts` `/api/*`, `/artifacts/*`, மற்றும் `/frames/*`-ஐ அந்த daemon port-க்கு மறுஎழுதுகிறது, இதனால் App Router app CORS அமைப்பு இல்லாமல் sibling Express process-உடன் பேச முடியும்.

## ஊடக உருவாக்கம் / agent dispatcher சரிபார்வைகள்

Image, video, audio, மற்றும் HyperFrames திறன்கள் உள்ளக `od` CLI-ஐ daemon ஒரு agent-ஐ spawn செய்யும்போது செலுத்தும் சூழல் மாறிகள் வழியாக அழைக்கின்றன:

- `OD_BIN` — `apps/daemon/dist/cli.js`-க்கு absolute பாதை.
- `OD_DAEMON_URL` — ஓடும் daemon URL.
- `OD_PROJECT_ID` — செயலில் உள்ள திட்ட id.
- `OD_PROJECT_DIR` — செயலில் உள்ள திட்டத்தின் கோப்பு கோப்பகம்.

ஊடக உருவாக்கம் `OD_BIN: parameter not set`, `apps/daemon/dist/cli.js` missing, அல்லது `failed to reach daemon at http://127.0.0.1:0` உடன் தோல்வியடைந்தால், daemon CLI-ஐ rebuild செய்து நிர்வகிக்கப்பட்ட runtime-ஐ மறுதொடக்கம் செய்:

```bash
pnpm --filter @open-design/daemon build
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
ls -la apps/daemon/dist/cli.js
curl -s http://127.0.0.1:7457/api/health
```

பிறகு பழைய terminal agent அமர்வை மீண்டும் தொடங்குவதற்கு பதிலாக Open Design app-இலிருந்து திட்டத்தை மீண்டும் திற. ஒரு daemon-spawned agent பின்வரும் மதிப்புகளைப் பார்க்க வேண்டும்:

```bash
echo "OD_BIN=$OD_BIN"
echo "OD_PROJECT_ID=$OD_PROJECT_ID"
echo "OD_PROJECT_DIR=$OD_PROJECT_DIR"
echo "OD_DAEMON_URL=$OD_DAEMON_URL"
ls -la "$OD_BIN"
```

`OD_DAEMON_URL` `http://127.0.0.1:7457` போன்ற ஒரு நிகழ் daemon port ஆக இருக்க வேண்டும், `http://127.0.0.1:0` அல்ல. `:0` மதிப்பு வெறும் ஒரு உள்ளக "pick a free port" தொடக்க hint மட்டுமே மற்றும் agent அமர்வுகளுக்குள் கசியக் கூடாது.

Daemon-மட்டும் production பயன்முறைக்கு, daemon நிலையான Next.js ஏற்றுமதியை `http://localhost:7456`-லேயே பணியாற்றுகிறது, எனவே எந்த reverse proxy-ம் ஈடுபடுத்தப்படவில்லை.

நீங்கள் daemon-ன் முன் nginx வைத்தால், SSE routes-ஐ unbuffered மற்றும் uncompressed ஆக வை. ஒரு பொதுவான தோல்வி daemon `X-Accel-Buffering: no` அனுப்பினாலும் கூட nginx `gzip on` chunked SSE responses-ஐ buffer செய்வதால் 80-90 நொடிகளுக்குப் பிறகு browser console `net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)`-ஐக் காட்டுவதாகும்.

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

## இரண்டு execution modes

| Mode | Picker மதிப்பு | ஒரு கோரிக்கை எப்படி ஓடுகிறது |
|---|---|---|
| **Local CLI** (daemon ஒரு agent-ஐக் கண்டறியும்போது இயல்புநிலை) | "Local CLI" | Frontend → daemon `/api/chat` → `spawn(<agent>, ...)` → stdout → SSE → artifact parser → preview |
| **API mode** (fallback / CLI இல்லை) | "Anthropic API" / "OpenAI API" / "Azure OpenAI" / "Google Gemini" | Frontend → daemon `/api/proxy/{provider}/stream` → provider SSE `delta/end/error`-ஆக normalize → artifact parser → preview |

இரண்டு modes-ம் **அதே** `<artifact>` parser மற்றும் **அதே** sandboxed iframe-க்கு உணவளிக்கின்றன. வேறுபடுவது வெறும் transport மற்றும் system-prompt delivery மட்டுமே (உள்ளக CLIs-க்கு தனி system channel இல்லை, எனவே composed prompt user செய்தியில் மடக்கப்படுகிறது).

## Prompt composition

ஒவ்வொரு send-க்கும், app மூன்று அடுக்குகளிலிருந்து ஒரு system prompt உருவாக்கி provider-க்கு அனுப்புகிறது:

```
BASE_SYSTEM_PROMPT   (output contract: wrap in <artifact>, no code fences)
   + active design system body  (DESIGN.md — palette/type/layout)
   + active skill body          (SKILL.md — workflow and output rules)
```

மேல் bar-ல் திறன் அல்லது வடிவமைப்பு அமைப்பை மாற்று, அடுத்த send புதிய stack-ஐப் பயன்படுத்துகிறது. Bodies ஒரு அமர்வுக்கு in-memory cache செய்யப்படுகின்றன எனவே இது ஒரு pick-க்கு ஒரு ஒற்றை daemon fetch.

## கோப்பு வரைபடம்

```
open-design/
├── apps/
│   ├── daemon/                # Node/Express — spawns local agents + serves APIs
│   │   └── src/
│   │       ├── cli.ts             # `od` bin entry
│   │       ├── server.ts          # /api/* + static serving
│   │       ├── agents.ts          # PATH scanner for claude/codex/devin/gemini/opencode/cursor-agent/qwen/qoder/copilot
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
│   └── …129 systems           # 2 starters · 70 product systems · 57 design skills
├── scripts/sync-design-systems.ts    # re-import from upstream getdesign tarball
├── docs/                      # product vision + spec
├── pnpm-workspace.yaml        # apps/* + packages/* + tools/* + e2e
└── package.json               # root quality scripts + `od` bin
```

## சரசரிப்பு

- **Node.js பதிப்பு மாற்றத்திற்குப் பிறகு `better-sqlite3` load செய்ய / ABI mismatch தோல்வி** — `pnpm install` தானாக `postinstall`-ஐ மறு-ஓட்டி நடப்பு Node.js-க்கான native addon-ஐ rebuild செய்கிறது. கைமுறையாக rebuild செய்ய அல்லது தீர்வை சரிபார்க்க: `pnpm --filter @open-design/daemon rebuild better-sqlite3` பிறகு `pnpm --filter @open-design/daemon exec node -e "require('better-sqlite3')"`. Build கருவிகள் தேவை: `python3`, `make`, `g++` (அல்லது `clang++`). உங்கள் `.npmrc`-ல் `ignore-scripts=true` இருந்தால், `pnpm install`-க்குப் பிறகு `node scripts/postinstall.mjs`-ஐ ஓட்டு.
- **"PATH-ல் agents கிடைக்கவில்லை"** — இவற்றில் ஒன்றை நிறுவு: `claude`, `codex`, `devin`, `gemini`, `opencode`, `cursor-agent`, `qwen`, `qodercli`, `copilot`. அல்லது Settings-ல் API பயன்முறைக்கு மாறி ஒரு provider key ஒட்டு.
- **Claude Code code 1 உடன் வெளியேறுகிறது** — Open Design `claude`-ஐத் தொடங்க முடிந்தது, ஆனால் spawned non-interactive run ஒரு பதில் உருவாக்குவதற்கு முன் தோல்வியடைந்தது. Open Design-ஐத் தொடங்கும் அதே shell அல்லது app சூழலிலிருந்து சரிபார்:
  ```bash
  claude --version
  claude auth status --text
  printf 'hello' | claude -p --output-format stream-json --verbose --permission-mode bypassPermissions
  ```
  smoke test `401`, `apiKeySource: "none"`, அல்லது தனிப்பயன் endpoint இல்லாமல் மற்றொரு auth பிழையைப் புகாரளித்தால், `claude`-ஐ ஓட்டு, `/login` பயன்படுத்து, Claude-இலிருந்து வெளியேறி, Open Design-ஐ மறுமுயற்சி செய். நீங்கள் பல Claude profiles பயன்படுத்தினால், **Settings -> Execution mode -> Claude Code config directory**-ஐ `~/.claude-2` போன்ற profile பாதையாக அமை. `ANTHROPIC_BASE_URL` அல்லது ஒரு proxy அமைந்திருந்தால், endpoint URL, proxy credentials, endpoint auth சூழல், மற்றும் model அணுகலை சரிபார்; நிலையான Claude Code auth உடன் மறுமுயற்சி செய்ய விரும்பினால் மட்டுமே தனிப்பயன் endpoint-ஐ அகற்று. Windows-ல், native PowerShell மற்றும் WSL தனி Claude installs மற்றும் credential stores பயன்படுத்துகின்றன; Open Design பயன்படுத்தும் அதே சூழலில் மறு-அங்கீகரி, மற்றும் `/login` native Windows credentials-ஐ சரிசெய்யவில்லை என்றால் Windows Credential Manager-ஐ சரிபார்.
- **/api/chat-ல் daemon 500** — daemon terminal-ல் stderr tail-ஐ சரிபார்; பொதுவாக CLI அதன் args-ஐ நிராகரித்தது. வெவ்வேறு CLIs வெவ்வேறு argv shapes எடுக்கின்றன; tweak செய்ய நீங்கள் விரும்பினால் `apps/daemon/src/agents.ts` `buildArgs`-ஐப் பார்.
- **ஊடக உருவாக்கம் `OD_BIN` missing அல்லது daemon URL `:0` எனக் கூறுகிறது** — மேலே உள்ள ஊடக dispatcher சரிபார்வைகளை ஓட்டு. பழைய CLI அமர்வை மீண்டும் தொடங்க வேண்டாம்; daemon புதிய `OD_*` மாறிகளை செலுத்த உதவ Open Design app-இலிருந்து திட்டத்தை மறு-திற.
- **Codex அதிகமான plugin context ஏற்றுகிறது** — daemon-spawned Codex processes `--disable plugins` உடன் ஓட `OD_CODEX_DISABLE_PLUGINS=1 pnpm tools-dev` உடன் Open Design-ஐத் தொடங்கு.
- **artifact ஒருபோதும் render ஆகவில்லை** — model `<artifact>`-ல் மடக்காமல் உரை உருவாக்கியது. system prompt செல்கிறதா என்பதை உறுதிப்படுத்து (daemon log சரிபார்) மற்றும் ஒரு திறமையான model அல்லது கடுமையான திறனுக்கு மாறுவதைக் கருத்தில் கொள்.
- **macOS-ல் `Authorization: Bearer <OD_API_TOKEN>` தேவை** — Docker Desktop bridge networking daemon கோரிக்கைகளை non-loopback ஆகப் பார்க்கச் செய்கிறது. Docker Desktop-ல் host networking-ஐ இயக்கி `network_mode: host`-ஐப் பயன்படுத்து. [`deploy/README.md` — Docker Desktop on macOS](../../deploy/README.md#docker-desktop-on-macos)-ஐப் பார்.

## காட்சிக்கு மீண்டும் வரைபடம்

இந்த Quickstart [`docs/`](../../docs/)-ல் உள்ள spec-ன் runnable seed. spec இது எங்கு வளர்கிறது என்பதை விவரிக்கிறது ([`docs/roadmap.md`](../../docs/roadmap.md)-ஐப் பார்). சிறப்பம்சங்கள்:

- `docs/architecture.md` shipped stack-ஐ விவரிக்கிறது: முன்னிலையில் Next.js 16 App Router, அதற்குப் பின்னால் உள்ளக daemon, மற்றும் browser அதே `/api` மேற்பரப்புடன் பேசுவதை வைக்க dev-ல் `apps/web/next.config.ts` மறுஎழுத்து.
- `docs/skills-protocol.md` முழு `od:` frontmatter (typed inputs, sliders, capability gating)-ஐ விவரிக்கிறது. இந்த MVP வெறும் `name` / `description` / `triggers` / `od.mode` / `od.design_system.requires`-ஐப் படிக்கிறது — மீதியைச் சேர்க்க `apps/daemon/src/skills.ts`-ஐ நீட்டி.
- `docs/agent-adapters.md` வளமான dispatch (capability detection, streaming tool-calls)-ஐ முன்கூட்டியே காட்டுகிறது. எங்கள் `apps/daemon/src/agents.ts` ஒரு குறைந்தபட்ச dispatcher — wiring-ஐ நிரூபிக்கப் போதுமானது.
- `docs/modes.md` நான்கு modes-ஐ பட்டியலிடுகிறது: prototype / deck / template / design-system. நாங்கள் முதல் இரண்டிற்கு திறன்களை வழங்குகிறோம்; picker ஏற்கனவே `mode` மூலம் வடிகட்டுகிறது.
