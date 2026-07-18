# Quickstart

<p align="center"><a href="../../QUICKSTART.md">English</a> · <a href="QUICKSTART.pt-BR.md">Português (Brasil)</a> · <a href="QUICKSTART.de.md">Deutsch</a> · <a href="QUICKSTART.fr.md">Français</a> · <a href="QUICKSTART.ja-JP.md">日本語</a> · <a href="QUICKSTART.ko.md">한국어</a> · <a href="QUICKSTART.zh-CN.md">简体中文</a> · <a href="QUICKSTART.zh-TW.md">繁體中文</a> · <b>ภาษาไทย</b></p>

รันผลิตภัณฑ์เต็มชุดในเครื่องของคุณ.

## ข้อกำหนดของ environment

- **Node.js:** `~24` (Node 24.x). Repo บังคับเวอร์ชันนี้ผ่าน `package.json#engines`.
- **pnpm:** `10.33.x`. Repo pin `pnpm@10.33.2` ผ่าน `packageManager`; ใช้ Corepack เพื่อให้เลือกเวอร์ชันที่ pin ไว้อัตโนมัติ.
- **OS:** macOS, Linux และ WSL2 เป็น path หลัก. Windows native รองรับด้วย; ดูปัญหา setup ที่พบบ่อยใน [`docs/windows-troubleshooting.md`](../../docs/windows-troubleshooting.md).
- **Optional local agent CLI:** Open Design รองรับ registry ของ local runtimes เช่น Claude Code, Codex, Devin for Terminal, OpenCode, Cursor Agent, Qwen, Qoder CLI, GitHub Copilot CLI และอื่น ๆ. รายการปัจจุบันอยู่ใน [`apps/daemon/src/runtimes/registry.ts`](../../apps/daemon/src/runtimes/registry.ts). ถ้าไม่ได้ติดตั้ง runtime ใดเลย ให้ใช้ BYOK runtime ที่ตั้งค่าไว้ใน Settings.

### Local agent CLI และ PATH

Daemon จะ scan **`PATH`** ของคุณ (รวมถึง directory toolchain ของ user ที่พบบ่อย). ถ้าคุณติดตั้ง CLI ด้วย **`npm install -g`** หรือ **Homebrew** แล้ว Open Design ยังแสดงว่า *not installed*, GUI อาจเริ่มด้วย `PATH` แบบ minimal ที่ไม่มี global npm หรือ Homebrew `bin` directory (พบบ่อยบน macOS เมื่อไม่ได้ launch แอปจาก full login shell). ตรวจให้แน่ใจว่า directory ของ executable อยู่ใน `PATH` สำหรับ process ที่รัน daemon แล้วใช้ **Rescan** ใน **Settings → Execution mode**.

[`nvm`](https://github.com/nvm-sh/nvm) / [`fnm`](https://github.com/Schniz/fnm) เป็น convenience tools แบบ optional ไม่ใช่สิ่งจำเป็นในการ setup project. ถ้าคุณใช้ตัวใดตัวหนึ่ง ให้ติดตั้ง/เลือก Node 24 ก่อนรัน pnpm:

```bash
# nvm
nvm install 24
nvm use 24

# fnm
fnm install 24
fnm use 24
```

จากนั้นเปิด Corepack แล้วให้ repo เลือก pnpm:

```bash
corepack enable
corepack pnpm --version   # should print 10.33.2
```

## Docker Setup

รัน Open Design ใน environment ที่ containerized เต็มรูปแบบโดยไม่ต้องติดตั้ง Node.js หรือ pnpm ในเครื่อง.

### Requirements

* Docker Desktop
* Docker Compose v2

ตรวจว่า Docker ติดตั้งถูกต้อง:

```bash
docker compose version
```

---

## เริ่ม Open Design

จาก repository root:

1. เปลี่ยนไปที่ deploy directory และ copy environment template:

   ```bash
   cd deploy
   cp .env.example .env
   ```

2. Generate token ที่ปลอดภัย:

   ```bash
   openssl rand -hex 32
   ```

3. เปิด `.env` ใน editor ของคุณ, หา `OD_API_TOKEN=`, แล้ว paste token ที่ generate ลงไป.

จากนั้น start service:

```bash
docker compose up -d
```

เปิดแอปใน browser:

```text
http://localhost:7456
```

การ start ครั้งแรกอาจใช้เวลาสักครู่ขณะ Docker pull image ล่าสุด.

---

## Docker Commands ที่ใช้บ่อย

### ดู logs

```bash
docker compose logs -f
```

### Restart containers

```bash
docker compose restart
```

### Stop containers

```bash
docker compose down
```

### Pull image ล่าสุด

```bash
docker compose pull
docker compose up -d
```

### ลบ local app data ทั้งหมด

```bash
docker compose down -v
```

---

## Environment Configuration

สร้างไฟล์ `deploy/.env` เพื่อ override default configuration. เริ่มจาก example ที่ให้มา:

```bash
cp deploy/.env.example deploy/.env
```

แก้ `deploy/.env` เพื่อตั้ง token ของคุณเองและปรับค่าอื่นตามต้องการ:

```env
# Port exposed on the host
OPEN_DESIGN_PORT=7456

# Container memory limit
OPEN_DESIGN_MEM_LIMIT=384m

# Allowed CORS origins
OPEN_DESIGN_ALLOWED_ORIGINS=https://yourdomain.com

# Docker image tag
OPEN_DESIGN_IMAGE=docker.io/vanjayak/open-design:latest

# Required API token for daemon security
# Generate one with: openssl rand -hex 32
OD_API_TOKEN=
```

---

## Persistent Storage

Open Design เก็บ projects และ SQLite data ไว้ใน Docker volume:

```text
open_design_data
```

Volume นี้ mount ไปที่:

```text
/app/.od
```

Data จะคงอยู่ข้ามการ restart container และการ update image.

Inspect volume:

```bash
docker volume inspect open-design_open_design_data
```

---

## Notes

* Docker mode เหมาะสำหรับ contributors ที่ไม่ต้องการ setup Node.js หรือ pnpm ในเครื่อง.
* Container expose production daemon build โดยตรงที่ port `7456`.
* สำหรับ development workflows และ advanced local setup ดูส่วนที่เหลือของ Quickstart guide นี้.

---

## One-shot (dev mode)

```bash
corepack enable
pnpm install
pnpm tools-dev run web # starts daemon + web in the foreground
# open the web URL printed by tools-dev
```

สำหรับ desktop shell และ managed sidecars ทั้งหมดใน background:

```bash
pnpm tools-dev # starts daemon + web + desktop in the background
```

เมื่อโหลดครั้งแรก แอปจะตรวจ local runtimes ที่พร้อมใช้และแสดง BYOK runtimes ที่ตั้งค่าไว้ใน Settings ด้วย. เลือก runtime, design template และ design system จากนั้นพิมพ์ prompt แล้วกด **Send**. Structured local runtime จะเขียน canonical project files และ stream file/tool events; file workspace กับ preview จะอัปเดตจากการเขียนเหล่านั้น. ส่วน text-only และ BYOK runs จะส่ง `<artifact>` block ที่สมบูรณ์ให้ host parse. ก่อน document หรือเปลี่ยน artifact storage path ต้องอ่าน `AGENTS.md` ที่ root ในส่วน **Daemon data directory contract**.

Catalog **Design systems** โหลดโดยตรงจาก packages `DESIGN.md` ใน [`design-systems/`](../../design-systems/). เลือกหนึ่งชุดเพื่อใช้ visual language ของ brand นั้นกับ artifact.

Catalog **Templates** มาจาก [`design-templates/`](../../design-templates/) และ group artifact formats สำหรับ prototype, deck, document, image, video และ audio. [`skills/`](../../skills/) สงวนไว้สำหรับ functional capabilities ที่ agent เรียกใช้ระหว่างทำงาน. จับคู่ template กับ design system เพื่อสร้าง artifact ใน visual language ที่เลือก.

## Other scripts

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

`pnpm tools-dev` เป็น local lifecycle entry point เพียงตัวเดียว. อย่าใช้ legacy root aliases ที่ถูกลบแล้ว (`pnpm dev`, `pnpm dev:all`, `pnpm daemon`, `pnpm preview`, `pnpm start`).

ระหว่าง local development, `tools-dev` จะ start daemon ก่อน, ส่ง port ของ daemon เข้า `apps/web`, และ `apps/web/next.config.ts` rewrite `/api/*`, `/artifacts/*`, และ `/frames/*` ไปยัง daemon port นั้น เพื่อให้ App Router app คุยกับ Express process ข้างเคียงได้โดยไม่ต้อง setup CORS.

## Media generation / agent dispatcher checks

Skills สำหรับ image, video, audio และ HyperFrames เรียก local `od` CLI ผ่าน environment variables ที่ daemon inject เมื่อ spawn agent:

- `OD_BIN` — absolute path ไปยัง `apps/daemon/dist/cli.js`.
- `OD_DAEMON_URL` — URL ของ daemon ที่กำลังรัน.
- `OD_PROJECT_ID` — active project id.
- `OD_PROJECT_DIR` — file directory ของ active project.

ถ้า media generation fail ด้วย `OD_BIN: parameter not set`, `apps/daemon/dist/cli.js` หาย, หรือ `failed to reach daemon at http://127.0.0.1:0`, ให้ rebuild daemon CLI และ restart managed runtime:

```bash
pnpm --filter @open-design/daemon build
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
ls -la apps/daemon/dist/cli.js
curl -s http://127.0.0.1:7457/api/health
```

จากนั้นเปิด project จาก Open Design app อีกครั้งแทนการ resume terminal agent session เก่า. Agent ที่ spawn จาก daemon ควรเห็นค่าเช่น:

```bash
echo "OD_BIN=$OD_BIN"
echo "OD_PROJECT_ID=$OD_PROJECT_ID"
echo "OD_PROJECT_DIR=$OD_PROJECT_DIR"
echo "OD_DAEMON_URL=$OD_DAEMON_URL"
ls -la "$OD_BIN"
```

`OD_DAEMON_URL` ต้องเป็น daemon port จริง เช่น `http://127.0.0.1:7457`, ไม่ใช่ `http://127.0.0.1:0`. ค่า `:0` เป็นเพียง launch hint ภายในสำหรับ "เลือก free port" และไม่ควรรั่วเข้า agent sessions.

สำหรับ daemon-only production mode, daemon จะ serve static Next.js export เองที่ `http://localhost:7456` จึงไม่ต้องมี reverse proxy.

ถ้าวาง nginx ไว้หน้า daemon ให้ SSE routes เป็น unbuffered และ uncompressed. Failure ที่พบบ่อยคือ browser console แสดง `net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)` หลัง 80-90 วินาที เพราะ nginx `gzip on` buffer chunked SSE responses แม้ daemon จะส่ง `X-Accel-Buffering: no`.

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

## สอง execution modes

| Mode | Picker value | Request flow |
|---|---|---|
| **Local CLI** (default เมื่อ daemon ตรวจพบ agent) | "Local CLI" | Frontend → daemon `/api/chat` → `spawn(<agent>, ...)` → structured tool/file events ผ่าน SSE → project files → preview. Plain-stream CLIs ใช้ text-artifact path. |
| **API mode** (fallback / ไม่มี CLI) | "Anthropic API" / "OpenAI API" / "Atlas Cloud" / "Azure OpenAI" / "Google Gemini" | Frontend → daemon `/api/proxy/{provider}/stream` → provider SSE normalized เป็น `delta/end/error` → parser `<artifact>` → preview |

ทั้งสอง mode จบที่ file workspace และ sandboxed preview เดียวกัน แต่ handoff contract ต่างกัน. Runtime ที่ใช้ filesystem ได้จะเขียน canonical files และไม่ echo source ใน `<artifact>`. Plain/text-only และ BYOK runs ไม่มี file tools จึงใช้ HTML ที่สมบูรณ์ใน `<artifact>` เป็น canonical deliverable. Execution profile ถูกเลือกจาก runtime transport.

## Prompt composition

ทุกครั้งที่ send, แอปจะ build system prompt จากสาม layer แล้วส่งให้ provider:

```
BASE_SYSTEM_PROMPT   (file หรือ <artifact> handoff ตาม execution profile)
   + active design system body  (DESIGN.md — palette/type/layout)
   + active skill body          (SKILL.md — workflow and output rules)
```

สลับ skill หรือ design system ใน top bar แล้ว send ครั้งถัดไปจะใช้ stack ใหม่. Bodies ถูก cache in-memory ต่อ session ดังนั้นการเลือกแต่ละครั้งคือ daemon fetch ครั้งเดียว.

## File map

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
│       │   ├── artifacts/     # text-artifact parsing + artifact manifests
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

## Troubleshooting

- **`better-sqlite3` fails to load / ABI mismatch after a Node.js version change** — `pnpm install` จะ re-run `postinstall` อัตโนมัติและ rebuild native addon สำหรับ Node.js ปัจจุบัน. ถ้าต้องการ rebuild เองหรือตรวจ fix: `pnpm --filter @open-design/daemon rebuild better-sqlite3` แล้ว `pnpm --filter @open-design/daemon exec node -e "require('better-sqlite3')"`. ต้องมี build tools: `python3`, `make`, `g++` (หรือ `clang++`). ถ้าคุณมี `ignore-scripts=true` ใน `.npmrc`, ให้รัน `node scripts/postinstall.mjs` หลัง `pnpm install`.
- **"no agents found on PATH"** — ติดตั้ง local runtime ที่ register ไว้ใน [`apps/daemon/src/runtimes/registry.ts`](../../apps/daemon/src/runtimes/registry.ts), ตรวจว่า daemon มองเห็น executable แล้วใช้ **Rescan** ใน **Settings → Execution mode**. หรือ configure BYOK runtime ใน Settings.
- **Claude Code exits with code 1** — Open Design start `claude` ได้แล้ว แต่ spawned non-interactive run fail ก่อน produce response. จาก shell หรือ app environment เดียวกับที่ start Open Design ให้เช็ค:
  ```bash
  claude --version
  claude auth status --text
  printf 'hello' | claude -p --output-format stream-json --verbose --permission-mode bypassPermissions
  ```
  ถ้า smoke test รายงาน `401`, `apiKeySource: "none"` หรือ auth error อื่นโดยไม่มี custom endpoint ให้รัน `claude`, ใช้ `/login`, exit Claude แล้วลอง Open Design ใหม่. ถ้าคุณใช้หลาย Claude profiles ให้ตั้ง **Settings -> Execution mode -> Claude Code config directory** ไปที่ profile path เช่น `~/.claude-2`. ถ้าตั้ง `ANTHROPIC_BASE_URL` หรือ proxy ไว้ ให้เช็ค endpoint URL, proxy credentials, endpoint auth environment และ model access; ลบ custom endpoint เฉพาะเมื่ออยาก retry ด้วย standard Claude Code auth. บน Windows, native PowerShell และ WSL ใช้ Claude installs และ credential stores แยกกัน; ให้ re-authenticate ใน environment เดียวกับที่ Open Design ใช้ และเช็ค Windows Credential Manager ถ้า `/login` ไม่ซ่อม native Windows credentials.
- **daemon 500 on /api/chat** — ดู stderr tail ใน daemon terminal; โดยมาก CLI reject args. CLI แต่ละตัวใช้ argv shapes ต่างกัน; ดู definition ที่ตรงกันใน `apps/daemon/src/runtimes/defs/` ถ้าต้องปรับ.
- **media generation says `OD_BIN` is missing or daemon URL is `:0`** — รัน media dispatcher checks ด้านบน. อย่า resume CLI session เก่า; เปิด project จาก Open Design app ใหม่เพื่อให้ daemon inject variables `OD_*` ชุดใหม่.
- **Codex loads too much plugin context** — start Open Design ด้วย `OD_CODEX_DISABLE_PLUGINS=1 pnpm tools-dev` เพื่อให้ daemon-spawned Codex processes รันด้วย `--disable plugins`.
- **artifact never renders** — ตรวจ handoff profile ก่อน. สำหรับ local runtime ที่ใช้ filesystem ได้ ให้ตรวจว่า agent สร้าง project file ที่ preview ได้และ file events มาถึง daemon; path นี้ไม่ควรส่ง source ใน `<artifact>`. สำหรับ plain/text-only หรือ BYOK run ให้ตรวจว่ามี `<artifact>` block ที่สมบูรณ์หนึ่งก้อน แล้วหา boundary แรกที่ fail ใน daemon log.
- **`Authorization: Bearer <OD_API_TOKEN>` required on macOS** — Docker Desktop bridge networking ทำให้ daemon มอง request เป็น non-loopback. เปิด host networking ใน Docker Desktop และใช้ `network_mode: host`. ดู [`deploy/README.md` — Docker Desktop on macOS](../../deploy/README.md#docker-desktop-on-macos).

## Mapping back to the vision

Quickstart นี้คือ runnable seed ของ spec ใน [`docs/`](../../docs/). Spec อธิบายว่าโปรเจกต์จะโตไปทางไหน (ดู [`docs/roadmap.md`](../../docs/roadmap.md)). Highlights:

- `docs/architecture.md` อธิบาย shipped stack: Next.js 16 App Router อยู่หน้า local daemon และ `apps/web/next.config.ts` rewrite ใน dev เพื่อให้ browser คุยกับ `/api` surface เดียวกัน.
- `docs/skills-protocol.md` อธิบาย `SKILL.md`/`od:` frontmatter ปัจจุบันและการแยก functional skills ออกจาก rendering templates. Parser และ normalization ใน `apps/daemon/src/skills.ts` คือ implementation source of truth.
- `docs/agent-adapters.md` อธิบาย adapter contract. Launch, argument, model และ stream settings ของแต่ละ runtime อยู่ใน `apps/daemon/src/runtimes/defs/` และ register ใน `apps/daemon/src/runtimes/registry.ts`; `apps/daemon/src/agents.ts` เป็น compatibility export surface.
- `docs/modes.md` แยก New Project tabs หกแบบออกจาก normalized registry modes เจ็ดแบบ (`prototype`, `deck`, `template`, `design-system`, `image`, `video`, `audio`).
