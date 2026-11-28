# Berkontribusi ke OpenDesign

Terima kasih sudah berpikir untuk berkontribusi. OD sengaja dibuat kecil — sebagian besar nilainya ada di **file** (skill, design system, fragmen prompt), bukan di kode framework. Karena itu, kontribusi yang paling berdampak biasanya berupa satu folder, satu file Markdown, atau satu adapter seukuran satu PR.

Panduan ini menjelaskan di mana Anda harus melihat untuk tiap jenis kontribusi dan standar apa yang harus dipenuhi sebuah PR sebelum kami merge.

<p align="center"><a href="../../CONTRIBUTING.md">English</a> · <a href="CONTRIBUTING.pt-BR.md">Português (Brasil)</a> · <a href="CONTRIBUTING.de.md">Deutsch</a> · <a href="CONTRIBUTING.fr.md">Français</a> · <a href="CONTRIBUTING.zh-CN.md">简体中文</a> · <a href="CONTRIBUTING.ja-JP.md">日本語</a> · <a href="CONTRIBUTING.ko.md">한국어</a> · <a href="CONTRIBUTING.th.md">ภาษาไทย</a> · <b>Bahasa Indonesia</b></p>

---

## Tiga hal yang bisa Anda selesaikan dalam satu sore

| Jika Anda ingin… | Sebenarnya Anda menambahkan | Lokasinya | Ukuran |
|---|---|---|---|
| Membuat OD merender jenis artifact baru (invoice, layar iOS Settings, one-pager…) | sebuah **Design template** | [`design-templates/<your-template>/`](../../design-templates/) | satu folder berisi `SKILL.md` beserta aset rendernya |
| Menambahkan kemampuan fungsional yang dipanggil agent selama mengerjakan tugas | sebuah **Skill** | [`skills/<your-skill>/`](../../skills/) | satu folder berisi `SKILL.md` dan resource opsional |
| Membuat OD berbicara dengan bahasa visual sebuah brand baru | sebuah **Design System** | [`design-systems/<brand>/`](../../design-systems/) | satu paket: `manifest.json`, `DESIGN.md`, dan `tokens.css` |
| Menghubungkan CLI coding-agent baru | sebuah **Agent adapter** | [`apps/daemon/src/runtimes/defs/`](../../apps/daemon/src/runtimes/defs/) | satu definisi plus satu entri registry |
| Menambahkan fitur, memperbaiki bug, mengadopsi pola UX dari [`open-codesign`][ocod] | kode | `apps/web/src/`, `apps/daemon/` | PR biasa |
| Memperbaiki dokumentasi, menerjemahkan satu bagian ke Français / Deutsch / 中文, memperbaiki typo | dokumentasi | `README.md`, `README.fr.md`, `README.de.md`, `README.zh-CN.md`, `docs/`, `QUICKSTART.md` | satu PR |

Jika Anda tidak yakin ide Anda masuk kategori mana, [buka discussion / issue lebih dulu](https://github.com/nexu-io/open-design/issues/new) dan kami akan mengarahkan Anda ke bagian yang tepat.

---

## Setup lokal

Setup lengkap satu halaman ada di [`QUICKSTART.md`](../../QUICKSTART.md). Versi singkat untuk kontributor:

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable           # selects the pinned pnpm from packageManager
pnpm install
pnpm tools-dev run web    # daemon + web foreground loop
pnpm typecheck            # tsc -b --noEmit
pnpm --filter @open-design/web build  # web package build when needed
```

Node `~24` dan pnpm `10.33.x` diperlukan. `nvm` / `fnm` bersifat opsional; gunakan `nvm install 24 && nvm use 24` atau `fnm install 24 && fnm use 24` jika Anda lebih suka mengelola Node dengan cara itu. macOS, Linux, dan WSL2 adalah jalur utama. Windows native juga didukung; lihat [`docs/windows-troubleshooting.md`](../../docs/windows-troubleshooting.md) untuk kendala setup yang umum.

## Setup Docker

Jalankan OpenDesign tanpa menginstal Node.js atau pnpm.

### Prasyarat

Pastikan Docker Desktop dengan Compose v2 sudah terinstal:

```bash
docker compose version
```

### Menjalankan OpenDesign

```bash
cd deploy
docker compose up -d
```

Buka di browser Anda:

```text
http://127.0.0.1:7456
```

### Perintah umum

```bash
# View logs
docker compose logs -f

# Restart containers
docker compose restart

# Stop containers
docker compose down

# Pull latest image
docker compose pull
docker compose up -d
```

### Override environment opsional

Buat file `deploy/.env`:

```env
OPEN_DESIGN_PORT=7456
OPEN_DESIGN_MEM_LIMIT=384m
OPEN_DESIGN_ALLOWED_ORIGINS=https://yourdomain.com
OPEN_DESIGN_IMAGE=ghcr.io/nexu-io/od:latest
```

> Proyek dan data database disimpan secara otomatis menggunakan Docker volume.

Untuk panduan Docker lengkap dan konfigurasi lanjutan, lihat `QUICKSTART.md`.

---

## Menambahkan Design template baru

Design template adalah folder di bawah [`design-templates/`](../../design-templates/) dengan `SKILL.md` di root, mengikuti [konvensi `SKILL.md`][skill] dari Claude Code plus ekstensi opsional `od:` kami. Folder ini mengemas bentuk dan resource render untuk sebuah artifact yang ditampilkan di galeri Templates.

### → Lihat [`docs/skills-contributing.md`](../../docs/skills-contributing.md) untuk panduan lengkap

File tersebut membahas:

- **Quick start** — clone → salin template terdekat yang sudah ada → jalankan `pnpm tools-dev run web` → lihat picker → buka PR.
- **Apa itu dan bukan apa itu design template** — menghemat seminggu Anda jika ternyata ide Anda adalah sebuah fitur atau integrasi vendor yang menyamar.
- **Anatomi design template** — tata letak folder minimum dan contekan frontmatter `SKILL.md`.
- **Menjalankan secara lokal** — empat perintah yang benar-benar penting.
- **Standar merge** — checklist siap salin berisi semua hal yang akan diperiksa reviewer.
- **Template deskripsi PR** — tempel ke body PR Anda lalu isi.
- **Pola penolakan yang umum** — alasan penutupan yang kami pakai belakangan ini, lengkap dengan contoh konkret.

Spesifikasi protokol (tata bahasa frontmatter aktif, referensi craft, dan primitif pengujian) ada terpisah di [`docs/skills-protocol.md`](../../docs/skills-protocol.md); field portabel lama seperti `od.inputs`, `od.parameters`, dan `od.capabilities_required` mungkin masih muncul di bundle eksternal tetapi tidak dipakai oleh registry skill/template.

---

## Menambahkan Skill fungsional

Skill fungsional adalah kemampuan yang dipanggil agent selama mengerjakan tugas untuk memproses input pengguna. Mulailah dari [`skills/README.md`](../../skills/README.md) untuk pembagian kepemilikan dan [`skills/AGENTS.md`](../../skills/AGENTS.md) untuk kontrak folder; tata bahasa `SKILL.md` bersama ada di [`docs/skills-protocol.md`](../../docs/skills-protocol.md). Scanner lazy milik daemon menelusuri root skill pada request `/api/skills` berikutnya, jadi skill lokal baru tidak memerlukan rebuild maupun restart daemon.

---

## Menambahkan Design System baru

Design system repository yang baru adalah sebuah paket di bawah [`design-systems/<slug>/`](../../design-systems/), bukan file Markdown tunggal. Seluruh 151 sistem bawaan kini memakai kontrak paket di bawah ini. Daemon masih menerima folder lama yang hanya berisi `DESIGN.md` sebagai jalur kompatibilitas untuk konten lama atau yang diinstal pengguna, tetapi jangan membuat sistem bawaan baru dalam bentuk itu. Katalog dipindai pada setiap request `/api/design-systems`, jadi segarkan surface Design System setelah mengedit; tidak perlu restart daemon.

### Tata letak paket minimum

```text
design-systems/your-brand/
├── manifest.json
├── DESIGN.md
└── tokens.css
```

`manifest.json` memegang id yang stabil, nama tampilan, kategori, deskripsi, provenance, dan path paket yang dideklarasikan. `DESIGN.md` menjelaskan maksud desain untuk agent. `tokens.css` adalah stylesheet semantic-token terkompilasi yang kanonis. Lihat [`docs/design-systems.md`](../../docs/design-systems.md) dan [`design-systems/_schema/AGENTS.md`](../../design-systems/_schema/AGENTS.md) untuk kontrak lengkap manifest, token, rich-package, dan kompatibilitas legacy.

### Bentuk `DESIGN.md`

Tidak ada skema sembilan bagian yang baku. Package-quality guard mensyaratkan minimal tujuh bagian H2 yang substantif, tanpa menetapkan nama, urutan, atau penomorannya. Gunakan heading yang sesuai dengan sistemnya; paket yang baik biasanya mencakup tema, warna, tipografi, layout, komponen, motion, aksesibilitas, dan anti-pattern.

```markdown
# YourBrand Design System

## Visual theme
…

## Color roles
…

## Typography
…

## Layout and spacing
## Components and states
## Motion and interaction
## Accessibility
## Anti-patterns
```

### Standar untuk merge design system baru

1. **Sertakan ketiga file wajib.** Slug folder dan `manifest.id` harus sama dan memakai ASCII ternormalisasi (`linear.app` → `linear-app`, `x.ai` → `x-ai`).
2. **Tulis minimal tujuh bagian H2 yang substantif.** Jangan menambah heading kosong hanya demi memenuhi jumlah.
3. **Jaga konsistensi antara prosa dan token.** Warna, tipe, spacing, dan motion yang disebut di `DESIGN.md` harus sesuai dengan `tokens.css`, yang harus lolos token guard bersama.
4. **Gunakan bukti nyata dan provenance yang jelas.** Ambil sampel dari produk atau situs sumber, bukan dari ingatan atau tebakan AI, dan catat sumbernya di manifest/bukti paket.
5. **Jaga agar teks katalog berguna.** `manifest.name`, `category`, dan `description` adalah metadata utama picker; hindari bahasa pemasaran yang bertele-tele.

Sistem produk turunan upstream diimpor dari [`VoltAgent/awesome-design-md`][acd2] melalui [`scripts/sync-design-systems.ts`](../../scripts/sync-design-systems.ts). Jika brand Anda cocok di upstream, **kirim PR ke sana lebih dulu** — kami akan mengambilnya secara otomatis pada sync berikutnya. Folder `design-systems/` juga memuat tambahan milik proyek yang tidak cocok di upstream.

---

## Menambahkan CLI coding-agent baru

Menghubungkan agent baru (misalnya CLI `foo-coder` dari vendor baru) dimulai dari satu definisi di bawah [`apps/daemon/src/runtimes/defs/`](../../apps/daemon/src/runtimes/defs/) dan satu import/entri di [`runtimes/registry.ts`](../../apps/daemon/src/runtimes/registry.ts):

```ts
import type { RuntimeAgentDef } from '../types.js';

export const fooAgentDef = {
  id: 'foo',
  name: 'Foo Coder',
  bin: 'foo',
  versionArgs: ['--version'],
  fallbackModels: [{ id: 'default', label: 'Default', default: true }],
  buildArgs: (prompt) => ['exec', '-p', prompt],
  streamFormat: 'plain',           // or 'claude-stream-json' if it speaks that
} satisfies RuntimeAgentDef;
```

Import definisi tersebut ke [`runtimes/registry.ts`](../../apps/daemon/src/runtimes/registry.ts) dan tambahkan ke `BASE_AGENT_DEFS`; engine bersama akan mendeteksinya di `PATH`, menampilkannya di picker, dan membangun invokasinya. Pakai ulang `streamFormat` yang sudah ada selama bentuk wire-nya cocok. Format wire yang benar-benar baru juga memerlukan parser di bawah [`apps/daemon/src/runtimes/`](../../apps/daemon/src/runtimes/) atau [`apps/daemon/src/agent-protocol/`](../../apps/daemon/src/agent-protocol/), tes parser, dan cabang dispatch yang sesuai di [`server.ts`](../../apps/daemon/src/server.ts).

Standar untuk merge:

1. **Sesi nyata berjalan end-to-end** dengan agent baru — tempel log daemon ke deskripsi PR yang menunjukkan bahwa agent berhasil men-stream sebuah artifact sampai selesai.
2. **`docs/agent-adapters.md`** diperbarui dengan keunikan CLI tersebut (apakah memerlukan key file? apakah mendukung input gambar? apa flag non-interaktifnya?).
3. **Tabel "Supported coding agents" di README** mendapat satu baris.

---

## Memperbarui metadata `max_tokens` model

Chat mode API mengirim `max_tokens` ke provider upstream pada setiap request. Klien web mengambil angka itu dari lookup tiga tingkat di [`apps/web/src/state/maxTokens.ts`](../../apps/web/src/state/maxTokens.ts):

1. Override eksplisit pengguna di Settings, jika ada.
2. Jika tidak, default per model di [`apps/web/src/state/litellm-models.json`](../../apps/web/src/state/litellm-models.json) — potongan vendored dari `model_prices_and_context_window.json` milik [BerriAI/litellm][litellm] (MIT). Mencakup ~2k model chat dari Anthropic, OpenAI, DeepSeek, Groq, Together, Mistral, Gemini, Bedrock, Vertex, OpenRouter, dan lainnya.
3. Jika tidak, `FALLBACK_MAX_TOKENS = 8192`.

Untuk mengakomodasi model yang baru dirilis, regenerasi JSON vendored tersebut:

```bash
node --experimental-strip-types scripts/sync-litellm-models.ts
```

Script ini mengambil katalog LiteLLM, menyaring entri `mode: 'chat'`, memproyeksikan tiap entri ke `max_output_tokens` (atau fallback `max_tokens`), dan menulis snapshot yang terurut. Commit `litellm-models.json` hasil regenerasi bersama PR apa pun yang memicu pembaruan.

Tabel OVERRIDES di `maxTokens.ts` diperuntukkan bagi kasus langka ketika LiteLLM tidak memiliki atau keliru untuk id model yang benar-benar kami pakai — misalnya `mimo-v2.5-pro` (LiteLLM hanya menyediakan MiMo lewat alias `openrouter/xiaomi/...` dan `novita/xiaomimimo/...`, yang tidak ada yang cocok dengan id kanonis yang dipakai API langsung Xiaomi). Jaga tetap kecil; semua yang sudah benar di LiteLLM sebaiknya diperbaiki di upstream.

[litellm]: https://github.com/BerriAI/litellm

---

## Pemeliharaan lokalisasi

Bahasa Jerman memakai bentuk formal `Sie` karena OD berbicara kepada audiens campuran: kreator solo, agensi, dan tim engineering; sampai ada masukan proyek yang menunjukkan bahwa nada informal `du` lebih cocok, bahasa Jerman formal adalah default yang paling tidak mengejutkan. PR locale sebaiknya menerjemahkan UI chrome, dokumen inti, dan metadata galeri yang hanya untuk tampilan di `apps/web/src/i18n/content.ts`, tetapi tidak menerjemahkan `skills/`, `design-systems/`, atau isi prompt yang dieksekusi agent. Prompt sumber tersebut dipelihara sebagai input workflow, dan mempertahankan satu bahasa sumber menghindari penggandaan QA prompt di setiap locale. Saat menambah atau mengganti nama skill, design system, atau template prompt, perbarui metadata tampilan bahasa Jerman dan jalankan `pnpm --filter @open-design/web test`; `content.test.ts` akan gagal jika cakupan tampilan bahasa Jerman tidak sinkron. Error daemon, nama file ekspor, dan teks artifact buatan agent adalah keterbatasan yang diketahui kecuali sebuah PR secara eksplisit mencakupnya.

Untuk instruksi langkah demi langkah menambahkan locale baru (kamus UI, README, language switcher, terminologi regional), lihat [`TRANSLATIONS.md`](../../TRANSLATIONS.md).

---

## Gaya kode

Kami tidak kaku soal format (Prettier saat save tidak masalah), tetapi dua aturan berikut tidak bisa ditawar karena muncul di prompt stack dan API yang dihadapi pengguna:

1. **Single quote di JS/TS.** String memakai single quote kecuali escaping membuatnya jelek. Codebase sudah konsisten — mohon ikuti.
2. **Komentar dalam bahasa Inggris.** Bahkan jika PR-nya menerjemahkan sesuatu ke Deutsch atau 中文, komentar kode tetap dalam bahasa Inggris agar kami punya satu set referensi yang mudah di-grep.

Selebihnya:

- **Jangan menarasikan.** Tidak perlu `// import the module` atau `// loop through items`. Jika kodenya sudah jelas dibaca, komentar hanyalah noise. Simpan komentar untuk maksud atau batasan yang tidak jelas yang tidak bisa diekspresikan kode.
- **TypeScript-first.** Simpan entrypoint, modul, script, tes, reporter, dan config milik proyek dalam TypeScript, termasuk kode di `apps/web/src/` dan `apps/daemon/src/`. File `.js`, `.mjs`, atau `.cjs` baru memerlukan alasan eksplisit (generated, vendored, atau kompatibilitas) dan harus lolos `pnpm guard`.
- **Jangan menambah dependensi top-level baru** tanpa satu paragraf di deskripsi PR tentang apa yang kita dapat dibanding berapa byte yang kita kirim. Daftar dependensi di [`package.json`](../../package.json) sengaja dibuat kecil.
- **Jalankan `pnpm typecheck`** sebelum push. CI menjalankannya; jika gagal, Anda akan mendapat komentar "please fix".

---

## Commit & pull request

- **Satu hal per PR.** Menambah skill + merefaktor parser + menaikkan versi dependensi adalah tiga PR.
- **PR tim dimulai dengan item Plane yang terverifikasi.** Contoh: `[OPEND-3693] fix(web): restore home scrolling`. Pertahankan prefix saat mengedit. Spasi diterima; beberapa identifier berurutan akan menautkan semua item, tetapi hanya yang pertama menerima atribusi code-line. Template body PR yang ada sudah cukup.
- **Gerbang Plane berlaku untuk akun internal dan ODCrew.** Kontributor eksternal dikecualikan. Setelah diaktifkan, `quality/plane` harus lolos sebelum merge. Bypass darurat mengharuskan `lefarcen` atau `mrcfps` melakukan Approve pada commit terkini dengan `quality-bypass: <specific reason>` di review; approval biasa tidak mem-bypass-nya.
- **Gunakan template PR.** Isi setiap bagian di [`.github/pull_request_template.md`](../../.github/pull_request_template.md) — Why, What users will see, Surface area, Screenshots (jika UI), Bug fix verification (jika perbaikan bug), Validation. Bagian yang kosong akan dibalas "please fill in".
- **Body menjelaskan alasannya.** "Apa yang dilakukan ini" biasanya jelas dari diff; "mengapa ini perlu ada" jarang demikian.
- **Rujuk issue** jika ada. Jika tidak ada dan PR-nya tidak sepele, buka satu terlebih dahulu agar kita sepakat bahwa perubahan itu diinginkan sebelum Anda menghabiskan waktu.
- **Jangan squash saat review.** Push fixup; kami akan squash saat merge.
- **Jangan force-push ke branch bersama** kecuali diminta reviewer.

Kami tidak mewajibkan CLA. Apache-2.0 sudah mencakup kita; kontribusi Anda dilisensikan di bawah lisensi yang sama.

---

## Melaporkan bug

Buka issue dengan menyertakan:

- Apa yang Anda jalankan (perintah `pnpm tools-dev ...` yang persis).
- CLI agent mana yang dipilih (atau apakah Anda memakai jalur BYOK).
- Pasangan skill + design system yang memicunya.
- **Bagian akhir stderr daemon** yang relevan — sebagian besar laporan "artifact tidak pernah dirender" terdiagnosis dalam 30 detik ketika kami bisa melihat `spawn ENOENT` atau error asli dari CLI.
- Screenshot jika terkait UI.

Untuk bug prompt-stack ("agent menghasilkan hero gradien ungu, padahal slop blacklist seharusnya melarangnya"), sertakan **pesan lengkap dari asisten** agar kami bisa melihat apakah pelanggarannya berasal dari model atau dari prompt.

---

## Mengajukan pertanyaan

- Pertanyaan arsitektur, pertanyaan desain, "ini bug atau salah pakai" → [GitHub Discussions](https://github.com/nexu-io/open-design/discussions) (lebih disukai — bisa dicari oleh orang berikutnya).
- "Bagaimana menulis skill yang melakukan X" → Buka discussion. Kami akan menjawabnya dan mengubah jawabannya menjadi bagian [`docs/skills-protocol.md`](../../docs/skills-protocol.md) jika itu pola yang belum ada.

---

## Apa yang tidak kami terima

Agar proyek tetap fokus, mohon jangan membuka PR yang:

- **Melakukan vendor model runtime.** Taruhan utama OD adalah "CLI yang sudah Anda punya sudah cukup". Kami tidak menyertakan `pi-ai`, key OpenAI, atau model loader.
- **Menulis ulang frontend dari stack saat ini tanpa diskusi sebelumnya.** Next.js 16 App Router + React 18 + TS adalah garis batasnya. Tidak ada Astro, Solid, Svelte, atau rewrite framework lain kecuali maintainer secara eksplisit menginginkan migrasi itu.
- **Mengganti daemon dengan serverless function.** Inti dari daemon adalah memiliki `cwd` nyata dan menjalankan CLI nyata. Deploy SPA ke Vercel tidak masalah; daemon tetap sebuah daemon.
- **Menambahkan telemetri atau pengumpulan data keluar di luar kontrak privasi.** Product analytics dan masked session replay bergantung pada persetujuan (consent-gated); telemetri keselamatan/keandalan yang sudah di-scrub selalu aktif pada build yang terkonfigurasi. Setiap event, field, atau tujuan baru harus menjaga batas consent, minimisasi, dan scrubbing yang didokumentasikan di [`PRIVACY.md`](../../PRIVACY.md).
- **Menyertakan binary** tanpa file lisensi dan atribusi penulis di sampingnya.

Jika Anda tidak yakin ide Anda cocok, buka discussion sebelum menulis kodenya.

---

## Menjadi Maintainer

Jika Anda berkontribusi secara konsisten dan ingin tahu seperti apa jalur menjadi Maintainer, aturannya ada di **[`MAINTAINERS.md`](../../MAINTAINERS.md)**. Singkatnya:

- Maintainer dapat me-review, meng-approve, dan menutup issue. Tombol merge tetap berada di Core Team — approval Anda tetap dihitung sebagai approval yang diperlukan untuk merge.
- Standarnya adalah **≥ 20 PR yang di-merge** plus pemeriksaan kualitas akun yang dipublikasikan (anti-bot, anti-sock-puppet) plus penilaian Core Team atas kualitas kontribusi. Tidak ada formulir pendaftaran; Core Team mengajukan kandidat secara internal dan menghubungi mereka.
- **Tidak ada kuota, tidak ada SLA, dan tidak ada masa jabatan tetap.** Mengundurkan diri mudah dan dapat dibatalkan (Emeritus → kembali saat keadaan sudah lebih tenang).
- Semua ambang batas, alur nominasi, aturan pengunduran diri, dan pengecualian untuk fase awal proyek ada di [`MAINTAINERS.md`](../../MAINTAINERS.md). Baca dokumen itu jika ada hal di atas yang menarik minat Anda.

Intinya: kirim PR yang bagus, review dengan cermat, bergabunglah di [Discussions][discussions] / [Discord][discord], dan sisanya akan mengikuti.

[discussions]: https://github.com/nexu-io/open-design/discussions
[discord]: https://discord.gg/mHAjSMV6gz

---

## Lisensi

Dengan berkontribusi, Anda setuju bahwa kontribusi Anda dilisensikan di bawah [Lisensi Apache-2.0](../../LICENSE) repositori ini, kecuali jika sebuah skill atau template bawaan membawa file `LICENSE` sendiri. Pengecualian berlisensi MIT yang diketahui mencakup [`design-templates/guizang-ppt/`](../../design-templates/guizang-ppt/), yang mempertahankan atribusi penulis kepada [op7418](https://github.com/op7418), dan [`skills/web-clone/`](../../skills/web-clone/), yang mempertahankan atribusi penulis kepada [Jane Xiaoer](https://github.com/Jane-xiaoer).

[skill]: https://docs.anthropic.com/en/docs/claude-code/skills
[guizang]: https://github.com/op7418/guizang-ppt-skill
[acd2]: https://github.com/VoltAgent/awesome-design-md
[ocod]: https://github.com/OpenCoworkAI/open-codesign
