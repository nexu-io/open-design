# Mulai Cepat

<p align="center"><a href="../../QUICKSTART.md">English</a> · <a href="QUICKSTART.pt-BR.md">Português (Brasil)</a> · <a href="QUICKSTART.de.md">Deutsch</a> · <a href="QUICKSTART.fr.md">Français</a> · <a href="QUICKSTART.ja-JP.md">日本語</a> · <a href="QUICKSTART.ko.md">한국어</a> · <a href="QUICKSTART.zh-CN.md">简体中文</a> · <a href="QUICKSTART.zh-TW.md">繁體中文</a> · <a href="QUICKSTART.th.md">ภาษาไทย</a> · <b>Bahasa Indonesia</b></p>

Jalankan produk lengkap secara lokal.

## Persyaratan lingkungan

- **Node.js:** `~24` (Node 24.x). Repositori menegakkannya melalui `package.json#engines`.
- **pnpm:** `10.33.x`. Repositori mengunci `pnpm@10.33.2` melalui `packageManager`; gunakan Corepack agar versi yang dikunci dipilih secara otomatis.
- **OS:** macOS, Linux, dan WSL2 adalah jalur utama. Jika CLI agen Anda berjalan di dalam WSL2, gunakan [`panduan penyiapan WSL2`](../wsl-setup.md). Windows native didukung; lihat [`docs/windows-troubleshooting.md`](../windows-troubleshooting.md) untuk kendala umum penyiapan PowerShell.
- **CLI agen lokal (opsional):** OpenDesign mendukung registry runtime lokal, termasuk Claude Code, Codex, Devin for Terminal, OpenCode, Cursor Agent, Qwen, Qoder CLI, GitHub Copilot CLI, dan lainnya. Daftar terbaru ada di [`apps/daemon/src/runtimes/registry.ts`](../../apps/daemon/src/runtimes/registry.ts). Jika tidak ada yang terpasang, gunakan runtime BYOK yang dikonfigurasi di Settings.

### CLI agen lokal dan PATH

Daemon memindai **`PATH`** Anda (ditambah direktori toolchain pengguna yang umum). Jika Anda memasang CLI dengan **`npm install -g`** atau **Homebrew** dan OpenDesign tetap menampilkannya sebagai *not installed*, kemungkinan GUI dijalankan dengan `PATH` minimal yang tidak menyertakan direktori `bin` global npm atau Homebrew Anda (umum di macOS saat aplikasi tidak diluncurkan dari login shell lengkap). Pastikan direktori executable tersebut ada di `PATH` untuk proses yang menjalankan daemon, lalu gunakan **Rescan** di **Models & providers → Local CLI**.

[`nvm`](https://github.com/nvm-sh/nvm) / [`fnm`](https://github.com/Schniz/fnm) hanyalah alat bantu opsional, bukan syarat penyiapan proyek. Jika Anda memakainya, pasang/pilih Node 24 sebelum menjalankan pnpm:

```bash
# nvm
nvm install 24
nvm use 24

# fnm
fnm install 24
fnm use 24
```

Kemudian aktifkan Corepack dan biarkan repositori memilih pnpm:

```bash
corepack enable
corepack pnpm --version   # harus mencetak 10.33.2
```

## Penyiapan Docker

Jalankan OpenDesign di lingkungan yang sepenuhnya terkontainerisasi tanpa memasang Node.js atau pnpm secara lokal.

### Persyaratan

* Docker Desktop
* Docker Compose v2

Pastikan Docker terpasang dengan benar:

```bash
docker compose version
```

---

## Menjalankan OpenDesign

Dari root repositori:

1. Pindah ke direktori deploy dan salin templat environment:

   ```bash
   cd deploy
   cp .env.example .env
   ```

2. Buat token yang aman:

   ```bash
   openssl rand -hex 32
   ```

3. Buka `.env` di editor Anda, cari `OD_API_TOKEN=`, lalu tempel token yang dihasilkan di sana.

Kemudian jalankan layanan:

```bash
docker compose up -d
```

Buka aplikasi di browser Anda:

```text
http://127.0.0.1:7456
```

Startup pertama mungkin memerlukan beberapa detik karena Docker menarik image terbaru.

---

## Perintah Docker Umum

### Melihat log

```bash
docker compose logs -f
```

### Memulai ulang kontainer

```bash
docker compose restart
```

### Menghentikan kontainer

```bash
docker compose down
```

### Menarik image terbaru

```bash
docker compose pull
docker compose up -d
```

### Menghapus semua data aplikasi lokal

```bash
docker compose down -v
```

---

## Konfigurasi Environment

Buat file `deploy/.env` untuk menimpa konfigurasi default. Mulailah dari contoh yang disediakan:

```bash
cp deploy/.env.example deploy/.env
```

Edit `deploy/.env` untuk mengatur token Anda sendiri dan menyesuaikan nilai lainnya sesuai kebutuhan:

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

## Penyimpanan Persisten

Sebelum mendokumentasikan, mengubah, atau memilih path penyimpanan daemon yang persisten,
Anda WAJIB membaca bagian **Daemon data directory contract** di `AGENTS.md` root.
Quickstart ini TIDAK BOLEH mengulang kontrak tersebut atau mendefinisikan path penyimpanan.

---

## Catatan

* Mode Docker ideal bagi kontributor yang tidak ingin menyiapkan Node.js atau pnpm secara lokal.
* Kontainer mengekspos build daemon produksi secara langsung pada port `7456`.
* Untuk alur kerja pengembangan dan penyiapan lokal tingkat lanjut, lihat bagian lain dari panduan Quickstart ini.

---

## Sekali jalan (mode dev)

```bash
corepack enable
pnpm install
pnpm tools-dev run web # starts daemon + web in the foreground
# open the web URL printed by tools-dev
```

Untuk shell desktop dan semua sidecar terkelola di latar belakang:

```bash
pnpm tools-dev # starts daemon + web + desktop in the background
```

Pada pemuatan pertama, aplikasi mendeteksi runtime lokal yang tersedia dan juga menawarkan runtime BYOK yang dikonfigurasi di Settings. Pilih runtime, templat desain, dan design system, lalu ketik prompt dan tekan **Send**. Runtime lokal terstruktur menulis file proyek kanonis dan men-stream event file/tool; ruang kerja file dan pratinjau diperbarui dari penulisan tersebut. Sebaliknya, eksekusi teks biasa dan BYOK mengembalikan blok `<artifact>` lengkap untuk di-parse oleh host. Sebelum mendokumentasikan atau mengubah path penyimpanan artifact apa pun, Anda WAJIB membaca `AGENTS.md` → **Daemon data directory contract**.

Katalog **Design systems** dimuat dari paket `DESIGN.md` di [`design-systems/`](../../design-systems/). Pilih salah satu untuk menerapkan bahasa visual merek tersebut pada artifact.

Katalog **Templates** berasal dari [`design-templates/`](../../design-templates/) dan mengelompokkan format artifact untuk prototipe, deck, dokumen, gambar, video, dan audio. [`skills/`](../../skills/) dicadangkan untuk kapabilitas fungsional yang dipanggil agen saat bekerja. Pasangkan templat dengan design system untuk menghasilkan artifact dalam bahasa visual yang dipilih.

## Skrip lainnya

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

`pnpm tools-dev` adalah satu-satunya titik masuk siklus hidup lokal. Jangan gunakan alias root lama yang sudah dihapus (`pnpm dev`, `pnpm dev:all`, `pnpm daemon`, `pnpm preview`, `pnpm start`).

`tools-dev` secara otomatis memuat file env workspace sebelum menentukan port, namespace, dan environment proses anak. Prioritas default adalah `.env.development.local`, lalu `.env.local`, lalu `.env.development`, lalu `.env`; file env menimpa export shell ambient sehingga konfigurasi lokal proyek yang menang. Gunakan `--no-env-file` untuk menonaktifkan pemuatan, atau ulangi `--env-file <path>` untuk memakai file env tertentu sebagai gantinya.

Daemon pengembangan secara default memakai Vela CLI yang dikunci workspace dan dipasang oleh `pnpm install`, termasuk pendamping OpenCode yang sesuai. Ini mencegah `vela` global yang lebih lama menerima sign-in tetapi gagal pada penagihan workspace atau peluncuran task. `VELA_BIN` eksplisit atau pilihan Settings → CLI env tetap diutamakan. Saat startup, binary workspace yang dipilih akan dicetak; jika paket opsionalnya tidak ada, akan muncul peringatan sebelum beralih ke PATH.

Selama pengembangan lokal, `tools-dev` menjalankan daemon terlebih dahulu, meneruskan port-nya ke `apps/web`, dan `apps/web/next.config.ts` me-rewrite `/api/*`, `/artifacts/*`, dan `/frames/*` ke port daemon tersebut sehingga aplikasi App Router dapat berkomunikasi dengan proses Express saudaranya tanpa penyiapan CORS.

## Pemeriksaan pembuatan media / agent dispatcher

Skill gambar, video, audio, dan HyperFrames memanggil CLI `od` lokal melalui variabel environment yang disuntikkan daemon saat menjalankan agen:

- `OD_BIN` — path absolut ke `apps/daemon/dist/cli.js`.
- `OD_DAEMON_URL` — URL daemon yang sedang berjalan.
- `OD_PROJECT_ID` — id proyek yang aktif.
- `OD_PROJECT_DIR` — direktori file proyek yang aktif.

Jika pembuatan media gagal dengan `OD_BIN: parameter not set`, `apps/daemon/dist/cli.js` hilang, atau `failed to reach daemon at http://127.0.0.1:0`, bangun ulang CLI daemon dan mulai ulang runtime terkelola:

```bash
pnpm --filter @open-design/daemon build
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
ls -la apps/daemon/dist/cli.js
curl -s http://127.0.0.1:7457/api/health
```

Lalu buka kembali proyek dari aplikasi OpenDesign, jangan melanjutkan sesi agen terminal lama. Agen yang dijalankan daemon seharusnya melihat nilai seperti:

```bash
echo "OD_BIN=$OD_BIN"
echo "OD_PROJECT_ID=$OD_PROJECT_ID"
echo "OD_PROJECT_DIR=$OD_PROJECT_DIR"
echo "OD_DAEMON_URL=$OD_DAEMON_URL"
ls -la "$OD_BIN"
```

`OD_DAEMON_URL` harus berupa port daemon yang sebenarnya, seperti `http://127.0.0.1:7457`, bukan `http://127.0.0.1:0`. Nilai `:0` hanyalah petunjuk peluncuran internal "pilih port bebas" dan tidak boleh bocor ke sesi agen.

Untuk mode produksi khusus daemon, daemon menyajikan ekspor statis Next.js sendiri di `http://127.0.0.1:7456`, sehingga tidak ada reverse proxy yang terlibat.

Jika Anda menempatkan nginx di depan daemon, jaga rute SSE tetap tanpa buffering dan tanpa kompresi. Kegagalan yang umum adalah konsol browser menampilkan `net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)` setelah 80-90 detik karena nginx `gzip on` mem-buffer respons SSE chunked meskipun daemon mengirim `X-Accel-Buffering: no`.

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

## Dua mode eksekusi

| Mode | Nilai pemilih | Alur permintaan |
|---|---|---|
| **Local CLI** (default saat daemon mendeteksi agen) | "Local CLI" | Frontend → daemon `/api/chat` → `spawn(<agent>, ...)` → event tool/file terstruktur lewat SSE → file proyek → pratinjau. CLI plain-stream memakai jalur text-artifact. |
| **API mode** (cadangan / tanpa CLI) | "Anthropic API" / "OpenAI API" / "Atlas Cloud" / "Azure OpenAI" / "Google Gemini" | Frontend → daemon `/api/proxy/{provider}/stream` → SSE provider dinormalisasi menjadi `delta/end/error` → parser `<artifact>` → pratinjau |

Kedua mode berakhir di ruang kerja file dan pratinjau sandbox yang sama, tetapi kontrak serah terimanya berbeda. Runtime yang mampu mengakses filesystem menulis file kanonis dan tidak boleh menggemakan sumbernya di `<artifact>`; eksekusi teks biasa dan BYOK tidak memiliki tool file, sehingga hasil kanoniknya adalah HTML lengkap di dalam `<artifact>`. Profil eksekusi dipilih dari transport runtime, dan CLI lokal menerima prompt gabungan melalui bentuk pemanggilan yang dideklarasikan oleh definisi runtime-nya.

## Komposisi prompt

Pada setiap pengiriman, aplikasi membangun system prompt dari tiga lapisan dan mengirimkannya ke provider:

```
BASE_SYSTEM_PROMPT   (execution-profile-specific file or <artifact> handoff)
   + active design system body  (DESIGN.md — palette/type/layout)
   + active skill body          (SKILL.md — workflow and output rules)
```

Ganti skill atau design system di bilah atas dan pengiriman berikutnya akan memakai kombinasi baru. Isi di-cache di memori per sesi, sehingga hanya perlu satu kali fetch ke daemon per pilihan.

## Peta file

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
│   ├── sidecar-proto/         # OpenDesign sidecar protocol contract
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

## Pemecahan masalah

- **`better-sqlite3` gagal dimuat / ABI tidak cocok setelah versi Node.js berubah** — `pnpm install` menjalankan ulang `postinstall` secara otomatis dan membangun ulang addon native untuk Node.js saat ini. Untuk membangun ulang secara manual atau memverifikasi perbaikan: `pnpm --filter @open-design/daemon rebuild better-sqlite3` lalu `pnpm --filter @open-design/daemon exec node -e "require('better-sqlite3')"`. Memerlukan build tools: `python3`, `make`, `g++` (atau `clang++`). Jika Anda memakai `ignore-scripts=true` di `.npmrc` (umum untuk paket AUR), jalankan `pnpm bootstrap` setelah `pnpm install`.
- **"no agents found on PATH"** — pasang salah satu runtime lokal yang terdaftar di [`apps/daemon/src/runtimes/registry.ts`](../../apps/daemon/src/runtimes/registry.ts), pastikan executable-nya terlihat oleh daemon, lalu gunakan **Rescan** di **Models & providers → Local CLI**. Atau konfigurasikan runtime BYOK di Settings.
- **Claude Code keluar dengan kode 1** — OpenDesign berhasil menjalankan `claude`, tetapi eksekusi non-interaktif yang dijalankan gagal sebelum menghasilkan respons. Dari shell atau environment aplikasi yang sama yang menjalankan OpenDesign, periksa:
  ```bash
  claude --version
  claude auth status --text
  printf 'hello' | claude -p --output-format stream-json --verbose --permission-mode bypassPermissions
  ```
  Jika smoke test melaporkan `401`, `apiKeySource: "none"`, atau error autentikasi lain tanpa endpoint kustom, jalankan `claude`, gunakan `/login`, keluar dari Claude, lalu coba lagi OpenDesign. Jika Anda memakai beberapa profil Claude, atur **Models & providers → Local CLI → Claude Code config directory** ke path profil seperti `~/.claude-2`. Jika `ANTHROPIC_BASE_URL` atau proxy diatur, periksa URL endpoint, kredensial proxy, environment autentikasi endpoint, dan akses model; hapus endpoint kustom hanya jika Anda ingin mencoba lagi dengan autentikasi Claude Code standar. Di Windows, PowerShell native dan WSL memakai instalasi Claude dan penyimpanan kredensial yang terpisah; autentikasi ulang di environment yang sama dengan yang dipakai OpenDesign, dan periksa Windows Credential Manager jika `/login` tidak memperbaiki kredensial Windows native.
- **daemon 500 pada /api/chat** — periksa terminal daemon untuk ekor stderr; biasanya CLI menolak argumennya. CLI yang berbeda menerima bentuk argv yang berbeda; periksa definisi yang sesuai di `apps/daemon/src/runtimes/defs/` jika perlu menyesuaikannya.
- **pembuatan media menyatakan `OD_BIN` hilang atau URL daemon adalah `:0`** — jalankan pemeriksaan media dispatcher di atas. Jangan melanjutkan sesi CLI lama; buka kembali proyek dari aplikasi OpenDesign agar daemon dapat menyuntikkan variabel `OD_*` yang baru.
- **Codex memuat terlalu banyak konteks plugin** — jalankan OpenDesign dengan `OD_CODEX_DISABLE_PLUGINS=1 pnpm tools-dev` agar proses Codex yang dijalankan daemon berjalan dengan `--disable plugins`.
- **artifact tidak pernah dirender** — pertama, identifikasi profil serah terima eksekusi tersebut. Untuk runtime lokal yang mampu mengakses filesystem, pastikan agen membuat file proyek yang dapat dipratinjau dan event penulisan file sampai ke daemon; agen tidak boleh mengeluarkan sumber di `<artifact>`. Untuk eksekusi teks biasa atau BYOK, pastikan respons berisi satu blok `<artifact>` yang lengkap. Periksa log daemon untuk menemukan batas pertama yang gagal, alih-alih meminta runtime filesystem untuk beralih ke sumber inline.
- **Prompt autentikasi browser di macOS** — pertahankan jaringan bridge default Docker Desktop. Masuk dengan username `open-design` dan nilai `OD_API_TOKEN` dari `deploy/.env` sebagai kata sandi. Host networking tidak diperlukan. Lihat [`deploy/README.md` — Docker Desktop on macOS](../../deploy/README.md#docker-desktop-on-macos).

## Kembali ke visi

Quickstart ini adalah benih yang dapat dijalankan dari spesifikasi di [`docs/`](../). Spesifikasi tersebut menjelaskan ke mana proyek ini akan berkembang (lihat [`docs/roadmap.md`](../roadmap.md)). Sorotan:

- `docs/architecture.md` menjelaskan stack yang dirilis: Next.js 16 App Router di depan, daemon lokal di belakang, dan rewrite `apps/web/next.config.ts` saat dev agar browser tetap berkomunikasi dengan permukaan `/api` yang sama.
- `docs/skills-protocol.md` menjelaskan frontmatter `SKILL.md`/`od:` saat ini dan pemisahan antara skill fungsional dan templat rendering. Sumber kebenaran untuk parser dan normalisasi adalah `apps/daemon/src/skills.ts`.
- `docs/agent-adapters.md` menjelaskan kontrak adapter. Pengaturan peluncuran, argumen, model, dan stream spesifik runtime berada di `apps/daemon/src/runtimes/defs/`, dengan registrasi di `apps/daemon/src/runtimes/registry.ts`; `apps/daemon/src/agents.ts` adalah permukaan ekspor kompatibilitas.
- `docs/modes.md` membedakan enam tab New Project dari tujuh mode registry yang dinormalisasi (`prototype`, `deck`, `template`, `design-system`, `image`, `video`, dan `audio`).
