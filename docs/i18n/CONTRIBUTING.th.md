# การ contribute ให้ Open Design

ขอบคุณที่คิดจะ contribute. OD ตั้งใจให้เล็ก — คุณค่าส่วนใหญ่อยู่ใน **ไฟล์** (skills, design systems, prompt fragments) มากกว่า framework code. นั่นแปลว่า contribution ที่คุ้มที่สุดมักเป็น folder เดียว, Markdown file เดียว หรือ adapter ขนาดพอดี PR เดียว.

Guide นี้บอกชัด ๆ ว่า contribution แต่ละประเภทควรเริ่มดูตรงไหน และ PR ต้องผ่าน bar อะไรก่อนที่เราจะ merge.

<p align="center"><a href="../../CONTRIBUTING.md">English</a> · <a href="CONTRIBUTING.pt-BR.md">Português (Brasil)</a> · <a href="CONTRIBUTING.de.md">Deutsch</a> · <a href="CONTRIBUTING.fr.md">Français</a> · <a href="CONTRIBUTING.zh-CN.md">简体中文</a> · <a href="CONTRIBUTING.ja-JP.md">日本語</a> · <a href="CONTRIBUTING.ko.md">한국어</a> · <b>ภาษาไทย</b></p>

---

## สามอย่างที่ ship ได้ในหนึ่งบ่าย

| ถ้าคุณอยาก… | สิ่งที่คุณเพิ่มจริง ๆ | อยู่ที่ไหน | ขนาดงาน |
|---|---|---|---|
| ทำให้ OD render artifact ชนิดใหม่ (invoice, iOS Settings screen, one-pager…) | **Skill** | [`skills/<your-skill>/`](../../skills/) | หนึ่ง folder, ประมาณ 2 files |
| ทำให้ OD พูด visual language ของ brand ใหม่ | **Design System** | [`design-systems/<brand>/DESIGN.md`](../../design-systems/) | Markdown file เดียว |
| ต่อ coding-agent CLI ใหม่ | **Agent adapter** | [`apps/daemon/src/agents.ts`](../../apps/daemon/src/agents.ts) | ประมาณ 10 บรรทัดใน array เดียว |
| เพิ่ม feature, แก้ bug, ยก UX pattern จาก [`open-codesign`][ocod] | code | `apps/web/src/`, `apps/daemon/` | PR ปกติ |
| ปรับ docs, port section เป็น Français / Deutsch / 中文, แก้ typo | docs | `README.md`, `docs/i18n/README.fr.md`, `docs/i18n/README.de.md`, `docs/i18n/README.zh-CN.md`, `docs/`, `QUICKSTART.md` | หนึ่ง PR |

ถ้ายังไม่แน่ใจว่า idea ของคุณอยู่ bucket ไหน ให้ [เปิด discussion / issue ก่อน](https://github.com/nexu-io/open-design/issues/new) แล้วเราจะชี้ surface ที่ถูกให้.

---

## Local setup

Setup แบบหน้าเดียวเต็มอยู่ใน [`QUICKSTART.th.md`](QUICKSTART.th.md). TL;DR สำหรับ contributors:

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable           # selects the pinned pnpm from packageManager
pnpm install
pnpm tools-dev run web    # daemon + web foreground loop
pnpm typecheck            # tsc -b --noEmit
pnpm --filter @open-design/web build  # web package build when needed
```

ต้องใช้ Node `~24` และ pnpm `10.33.x`. `nvm` / `fnm` เป็น optional; ใช้ `nvm install 24 && nvm use 24` หรือ `fnm install 24 && fnm use 24` ถ้าคุณชอบจัดการ Node ด้วยวิธีนั้น. macOS, Linux และ WSL2 เป็น path หลัก. Windows native รองรับด้วย; ดู gotchas การ setup ที่พบบ่อยใน [`docs/windows-troubleshooting.md`](../../docs/windows-troubleshooting.md).

## Docker Setup

รัน Open Design โดยไม่ต้องติดตั้ง Node.js หรือ pnpm.

### Prerequisites

ตรวจว่า Docker Desktop พร้อม Compose v2 ติดตั้งแล้ว:

```bash
docker compose version
```

### Start Open Design

```bash
cd deploy
docker compose up -d
```

เปิดใน browser:

```text
http://localhost:7456
```

### Common Commands

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

### Optional Environment Overrides

สร้างไฟล์ `deploy/.env`:

```env
OPEN_DESIGN_PORT=7456
OPEN_DESIGN_MEM_LIMIT=384m
OPEN_DESIGN_ALLOWED_ORIGINS=https://yourdomain.com
OPEN_DESIGN_IMAGE=docker.io/vanjayak/open-design:latest
```

> Projects และ database data จะ persist อัตโนมัติด้วย Docker volumes.

สำหรับ Docker guide เต็มและ advanced configuration ดู `QUICKSTART.th.md`.



---

## เพิ่ม Skill ใหม่

Skill คือ folder ใต้ [`skills/`](../../skills/) ที่มี `SKILL.md` อยู่ที่ root ตาม [`SKILL.md` convention][skill] ของ Claude Code พร้อม extension `od:` แบบ optional ของเรา. **ไม่ต้อง registration.** วาง folder เข้าไป, restart daemon, picker ก็จะแสดง skill นั้น.

### → ดู guide เต็มที่ [`docs/skills-contributing.md`](../../docs/skills-contributing.md)

ไฟล์นั้นอธิบาย:

- **Quick start** — clone → copy skill ที่ใกล้ที่สุด → run `pnpm tools-dev run web` → เห็นใน picker → เปิด PR.
- **Skill คืออะไร / ไม่ใช่อะไร** — ช่วยประหยัดเวลาหนึ่งสัปดาห์ถ้า idea ของคุณกลายเป็น feature หรือ vendor integration แทน.
- **Skill anatomy** — minimum folder layout และ `SKILL.md` frontmatter cheat sheet.
- **Running locally** — command สี่ตัวที่สำคัญจริง ๆ.
- **Merge bar** — checklist ทุกอย่างที่ reviewer จะตรวจแบบ copy-paste ได้.
- **PR description template** — วางลง PR body แล้วกรอก.
- **Common rejection patterns** — เหตุผลที่เคยใช้ close พร้อมตัวอย่างจริง.

Protocol spec (frontmatter grammar แบบเต็ม — typed inputs, slider parameters, craft references, testing primitives) อยู่แยกใน [`docs/skills-protocol.md`](../../docs/skills-protocol.md).

---

## เพิ่ม Design System ใหม่

Design system คือไฟล์ [`DESIGN.md`](../../design-systems/README.md) ไฟล์เดียวใต้ `design-systems/<slug>/`. **ไฟล์เดียว, ไม่มี code.** วางเข้าไป, restart daemon, picker จะแสดงและ group ตาม category.

### โครงสร้าง folder ของ design system

```text
design-systems/your-brand/
└── DESIGN.md
```

### รูปทรงของ `DESIGN.md`

```markdown
# Design System Inspired by YourBrand

> Category: Developer Tools
> One-line summary that shows in the picker preview.

## 1. Visual Theme & Atmosphere
…

## 2. Color
- Primary: `#hex` / `oklch(...)`
- …

## 3. Typography
…

## 4. Spacing & Grid
## 5. Layout & Composition
## 6. Components
## 7. Motion & Interaction
## 8. Voice & Brand
## 9. Anti-patterns
```

Schema 9 section เป็น fixed — skill bodies ใช้ grep หา. H1 แรกจะกลายเป็น picker label (prefix `Design System Inspired by` จะถูก strip อัตโนมัติ), และบรรทัด `> Category: …` กำหนดว่าจะอยู่ group ไหน. Categories ที่มีอยู่ลิสต์ใน [`design-systems/README.md`](../../design-systems/README.md); ถ้า brand ของคุณไม่เข้าจริง ๆ คุณเพิ่ม category ใหม่ได้ แต่ **ลองใช้ category เดิมก่อน**.

### Bar สำหรับ merge design system ใหม่

1. **มีครบทั้ง 9 sections.** Section body ว่างได้ถ้าข้อมูลหายาก (เช่น motion tokens), แต่ heading ต้องมี ไม่งั้น prompt grep จะพัง.
2. **Hex codes ต้องจริง.** Sample จาก site หรือ product ของ brand โดยตรง ไม่ใช่จำจากความทรงจำหรือให้ AI เดา. Protocol "brand-spec extraction" 5 ขั้นใน README ใช้กับ maintainers ด้วย.
3. **OKLch values สำหรับ accent colors** เป็น nice-to-have. ช่วยให้ palette lerp คาดเดาได้ใน light/dark.
4. **ไม่มี marketing fluff.** Tagline ของ brand ไม่ใช่ design token. ตัดออก.
5. **Slug ใช้ ASCII** — `linear.app` เป็น `linear-app`, `x.ai` เป็น `x-ai`. Systems ที่ import มา 69 ชุดใช้ convention นี้อยู่แล้ว; ทำตามนั้น.

Product systems 69 ชุดที่เรา ship import จาก [`VoltAgent/awesome-design-md`][acd2] ผ่าน [`scripts/sync-design-systems.ts`](../../scripts/sync-design-systems.ts). ถ้า brand ของคุณควรอยู่ upstream, **ส่ง PR ไปที่นั่นก่อน** — เราจะดึงมาอัตโนมัติใน sync ถัดไป. Folder `design-systems/` มีไว้สำหรับ systems ที่ไม่ fit upstream รวมถึง starter ที่เราเขียนเองสองชุด.

---

## เพิ่ม coding-agent CLI ใหม่

การต่อ agent ใหม่ (เช่น CLI `foo-coder` จากเจ้าใหม่) คือ entry เดียวใน [`apps/daemon/src/agents.ts`](../../apps/daemon/src/agents.ts):

```javascript
{
  id: 'foo',
  name: 'Foo Coder',
  bin: 'foo',
  versionArgs: ['--version'],
  buildArgs: (prompt) => ['exec', '-p', prompt],
  streamFormat: 'plain',           // or 'claude-stream-json' if it speaks that
}
```

เท่านี้ — daemon จะ detect บน `PATH`, picker จะแสดง, chat path จะใช้งานได้. ถ้า CLI emit **typed events** (เหมือน `--output-format stream-json` ของ Claude Code), ให้ wire parser ใน [`apps/daemon/src/runtimes/claude-stream.ts`](../../apps/daemon/src/runtimes/claude-stream.ts) และตั้ง `streamFormat: 'claude-stream-json'`.

Bar สำหรับ merge:

1. **Session จริงทำงาน end-to-end** กับ agent ใหม่ — paste daemon log ใน PR description เพื่อแสดงว่ามัน stream artifact ผ่าน.
2. **อัปเดต `docs/agent-adapters.md`** พร้อม quirks ของ CLI (ต้องมี key file ไหม? รองรับ image input ไหม? non-interactive flag คืออะไร?).
3. **Table "Supported coding agents" ใน README** ได้ row ใหม่.

---

## อัปเดต metadata `max_tokens` ของ model

API-mode chat ส่ง `max_tokens` ไป upstream provider ทุก request. Web client เลือกค่านั้นจาก lookup สามชั้นใน [`apps/web/src/state/maxTokens.ts`](../../apps/web/src/state/maxTokens.ts):

1. ค่า override ที่ user ตั้งเองใน Settings, ถ้ามี.
2. ไม่งั้นใช้ per-model default ใน [`apps/web/src/state/litellm-models.json`](../../apps/web/src/state/litellm-models.json) — snapshot ที่ vendor มาจาก [`model_prices_and_context_window.json`][litellm] ของ [BerriAI/litellm][litellm] (MIT). ครอบคลุม chat models ประมาณ 2k รุ่นจาก Anthropic, OpenAI, DeepSeek, Groq, Together, Mistral, Gemini, Bedrock, Vertex, OpenRouter และอื่น ๆ.
3. ไม่งั้นใช้ `FALLBACK_MAX_TOKENS = 8192`.

เมื่อต้องการรับ model ที่เพิ่ง launch ใหม่ ให้ regenerate JSON ที่ vendor ไว้:

```bash
node --experimental-strip-types scripts/sync-litellm-models.ts
```

Script จะ fetch catalog ของ LiteLLM, filter เฉพาะ entry `mode: 'chat'`, project แต่ละ entry เป็น `max_output_tokens` (หรือ fallback เป็น `max_tokens`) แล้วเขียน snapshot ที่ sort แล้ว. Commit `litellm-models.json` ที่ regenerate พร้อม PR ที่ trigger refresh.

Table OVERRIDES ใน `maxTokens.ts` มีไว้สำหรับกรณีหายากที่ LiteLLM ไม่มีหรือผิดสำหรับ model id ที่เราใช้จริง — เช่น `mimo-v2.5-pro` (LiteLLM มี MiMo เฉพาะ alias `openrouter/xiaomi/...` และ `novita/xiaomimimo/...` ซึ่งไม่ match canonical id ที่ direct API ของ Xiaomi ใช้). เก็บ table นี้ให้เล็ก; อะไรก็ตามที่ LiteLLM ทำถูกควรอยู่ upstream.

[litellm]: https://github.com/BerriAI/litellm

---

## Localization maintenance

ภาษา German ใช้ formal `Sie` เพราะ OD พูดกับ audience ผสมทั้ง solo creators, agencies และ engineering teams; จนกว่า feedback ของ project จะบอกว่า informal `du` fit กว่า formal German เป็น default ที่ surprise น้อยที่สุด. Locale PRs ควรแปล UI chrome, core docs และ display-only gallery metadata ใน `apps/web/src/i18n/content.ts`, แต่ไม่ควรแปล `skills/`, `design-systems/` หรือ prompt bodies ที่ agents execute. Source prompts เหล่านั้นถูก maintain ในฐานะ workflow inputs และการคง source language เดียวช่วยเลี่ยงการคูณ prompt QA ไปตาม locales. เมื่อเพิ่มหรือ rename skill, design system หรือ prompt template ให้ update German display metadata และรัน `pnpm --filter @open-design/web test`; `content.test.ts` จะ fail ถ้า German display coverage drift. Daemon errors, export filenames และ agent-generated artifact text เป็น known limitations เว้นแต่ PR จะ scope เรื่องนั้นโดยตรง.

สำหรับขั้นตอนทีละขั้นในการเพิ่ม locale ใหม่ (UI dictionary, README, language switcher, regional terminology), ดู [`TRANSLATIONS.md`](../../TRANSLATIONS.md).

---

## Code style

เราไม่ได้ pedantic เรื่อง formatting (Prettier on save ก็ได้), แต่มีสองกฎที่ต่อรองไม่ได้ เพราะมันไปโผล่ใน prompt stack และ user-facing API:

1. **Single quotes ใน JS/TS.** Strings ใช้ single quotes เว้นแต่ escaping จะทำให้อ่านยาก. Codebase consistent อยู่แล้ว — match ตามนั้น.
2. **Comments เป็น English.** แม้ PR จะแปลบางอย่างเป็น Deutsch หรือ 中文, code comments ยังเป็น English เพื่อให้เรามี greppable references ชุดเดียว.

นอกเหนือจากนั้น:

- **อย่า narrate.** ไม่มี `// import the module`, ไม่มี `// loop through items`. ถ้า code อ่านชัดอยู่แล้ว comment คือ noise. เก็บ comment ไว้ให้ intent หรือ constraint ที่ code สื่อเองไม่ได้.
- **TypeScript** สำหรับ `apps/web/src/`. Daemon (`apps/daemon/`) เป็น plain ESM JavaScript พร้อม JSDoc เมื่อ types สำคัญ — รักษาแบบนั้น.
- **ไม่มี top-level dependencies ใหม่** ถ้าไม่มี paragraph ใน PR description อธิบายว่าเราได้อะไรเทียบกับ bytes ที่ ship. Dep list ใน [`package.json`](../../package.json) เล็กโดยตั้งใจ.
- **รัน `pnpm typecheck`** ก่อน push. CI รันอยู่แล้ว; ถ้า fail จะได้ comment "please fix".

---

## Commits & pull requests

- **หนึ่ง concern ต่อ PR.** เพิ่ม skill + refactor parser + bump dep คือสาม PR.
- **Title เป็น imperative + scope.** `add dating-web skill`, `fix daemon SSE backpressure when CLI hangs`, `docs: clarify .od layout`.
- **ใช้ PR template.** กรอกทุก section ของ [`.github/pull_request_template.md`](../../.github/pull_request_template.md) — Why, What users will see, Surface area, Screenshots (ถ้าเป็น UI), Bug fix verification (ถ้าเป็น bug fix), Validation. Section ว่างจะได้ reply "please fill in".
- **Body อธิบาย why.** "ทำอะไร" มักเห็นจาก diff อยู่แล้ว; "ทำไมต้องมีสิ่งนี้" ไม่ค่อยชัด.
- **Reference issue** ถ้ามี. ถ้าไม่มีและ PR ไม่ใช่งาน trivial ให้เปิด issue ก่อนเพื่อให้เรา agree ว่า change นี้เป็นที่ต้องการก่อนคุณใช้เวลา.
- **No squash-during-review.** Push fixups; เราจะ squash ตอน merge.
- **No force-push to a shared branch** เว้นแต่ reviewer ขอ.

เราไม่ enforce CLA. Apache-2.0 cover เราแล้ว; contribution ของคุณ licensed ภายใต้ license เดียวกัน.

---

## Reporting bugs

เปิด issue พร้อม:

- สิ่งที่คุณรัน (คำสั่ง `pnpm tools-dev ...` แบบ exact).
- Agent CLI ที่ถูกเลือก (หรือคุณอยู่บน BYOK path).
- คู่ skill + design system ที่ trigger.
- **daemon stderr tail** ที่เกี่ยวข้อง — report "artifact never rendered" ส่วนใหญ่ diagnose ได้ใน 30 วินาทีถ้าเราเห็น `spawn ENOENT` หรือ error จริงของ CLI.
- Screenshot ถ้าเป็น UI.

สำหรับ prompt-stack bugs ("agent emit purple gradient hero ทั้งที่ slop blacklist ควรห้าม"), ใส่ **assistant message เต็ม** เพื่อให้เราเห็นว่า violation มาจาก model หรือ prompt.

---

## Asking questions

- คำถาม architecture, design, "นี่คือ bug หรือ misuse" → [GitHub Discussions](https://github.com/nexu-io/open-design/discussions) (preferred — searchable สำหรับคนถัดไป).
- "จะเขียน skill ที่ทำ X ได้อย่างไร" → เปิด discussion. เราจะตอบและเปลี่ยนคำตอบเป็น [`docs/skills-protocol.md`](../../docs/skills-protocol.md) ถ้ามันเป็น pattern ที่ยังขาดอยู่.

---

## สิ่งที่เราไม่รับ

เพื่อให้ project focused โปรดอย่าเปิด PR ที่:

- **Vendor model runtime.** Bet ทั้งหมดของ OD คือ "CLI ที่คุณมีอยู่แล้วก็พอ". เราไม่ ship `pi-ai`, OpenAI keys หรือ model loaders.
- **Rewrite frontend ออกจาก stack ปัจจุบันโดยไม่คุยก่อน.** Next.js 16 App Router + React 18 + TS คือเส้น. ไม่มี Astro, Solid, Svelte หรือ framework rewrites อื่น เว้นแต่ maintainers ต้องการ migration นั้นชัดเจน.
- **แทน daemon ด้วย serverless function.** จุดประสงค์ทั้งหมดของ daemon คือถือ `cwd` จริงและ spawn CLI จริง. Vercel deployment ของ SPA ทำได้; daemon ยังเป็น daemon.
- **เพิ่ม telemetry / analytics / phone-home.** OD เป็น local-first. Outbound calls มีเฉพาะ providers ที่ user configure ชัดเจน.
- **Bundle binary** โดยไม่มี license file และ authorship attribution ข้าง ๆ.

ถ้าไม่แน่ใจว่า idea ของคุณ fit ไหม เปิด discussion ก่อนเขียน code.

---

## Becoming a Maintainer

ถ้าคุณ contribute อย่างสม่ำเสมอและอยากรู้ path สู่ Maintainer กติกาอยู่ใน **[`MAINTAINERS.md`](../../MAINTAINERS.md)**. Short version:

- Maintainer review, approve และ close issues ได้. ปุ่ม merge ยังอยู่กับ Core Team — approval ของคุณยังนับเป็น approval ที่ต้องมีสำหรับ merge.
- Bar คือ **≥ 20 merged PRs** พร้อม account-quality check ที่ publish แล้ว (anti-bot, anti-sock-puppet) และ judgment ของ Core Team เรื่อง contribution quality. ไม่มี application form; Core Team raise candidates ภายในแล้วติดต่อไป.
- **ไม่มี quotas, ไม่มี SLAs, ไม่มี fixed term.** Stepping down ง่ายและ reversible (Emeritus → กลับมาเมื่อชีวิตนิ่งขึ้น).
- Thresholds ทั้งหมด, nomination flow, step-down rules และ early-project waiver อยู่ใน [`MAINTAINERS.md`](../../MAINTAINERS.md). อ่านเอกสารนั้นถ้าสนใจข้อใดข้างต้น.

tl;dr: ship PR ดี ๆ, review อย่างใส่ใจ, อยู่ใน [Discussions][discussions] / [Discord][discord], แล้วที่เหลือจะตามมาเอง.

[discussions]: https://github.com/nexu-io/open-design/discussions
[discord]: https://discord.gg/qhbcCH8Am4

---

## License

เมื่อ contribute คุณยอมรับว่า contribution ของคุณ licensed ภายใต้ [Apache-2.0 License](../../LICENSE) ของ repository นี้ ยกเว้นไฟล์ใน [`design-templates/guizang-ppt/`](../../design-templates/guizang-ppt/) ซึ่งยังคง MIT license เดิมและ authorship attribution ของ [op7418](https://github.com/op7418).

[skill]: https://docs.anthropic.com/en/docs/claude-code/skills
[guizang]: https://github.com/op7418/guizang-ppt-skill
[acd2]: https://github.com/VoltAgent/awesome-design-md
[ocod]: https://github.com/OpenCoworkAI/open-codesign
