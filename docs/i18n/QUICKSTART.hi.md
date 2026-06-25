# क्विकस्टार्ट

<p align="center"><a href="../../QUICKSTART.md">English</a> · <a href="QUICKSTART.pt-BR.md">Português (Brasil)</a> · <a href="QUICKSTART.de.md">Deutsch</a> · <a href="QUICKSTART.fr.md">Français</a> · <a href="QUICKSTART.ko.md">한국어</a> · <a href="QUICKSTART.ja-JP.md">日本語</a> · <a href="QUICKSTART.zh-CN.md">简体中文</a> · <a href="QUICKSTART.zh-TW.md">繁體中文</a> · <b>हिन्दी</b></p>

पूरा प्रोडक्ट लोकल रूप से चलाएं।

## पर्यावरण आवश्यकताएं

- **Node.js:** `~24` (Node 24.x)। रेपो इसे `package.json#engines` के माध्यम से लागू करता है।
- **pnpm:** `10.33.x`। रेपो `packageManager` के माध्यम से `pnpm@10.33.2` पिन करता है; Corepack का उपयोग करें ताकि पिन किया गया वर्ज़न स्वतः चुना जाए।
- **OS:** macOS, Linux, और WSL2 मुख्य रास्ते हैं। Windows native समर्थित है; सामान्य सेटअप समस्याओं के लिए [`docs/windows-troubleshooting.md`](../../docs/windows-troubleshooting.md) देखें।
- **वैकल्पिक लोकल एजेंट CLI:** Claude Code, Codex, Devin for Terminal, Gemini CLI, OpenCode, Cursor Agent, Qwen, Qoder CLI, GitHub Copilot CLI, आदि। अगर कोई इंस्टॉल नहीं है, तो Settings से BYOK API मोड का उपयोग करें।

### लोकल एजेंट CLI और PATH

डेमन आपके **`PATH`** (साथ ही सामान्य यूज़र टूलचेन डायरेक्टरी) को स्कैन करता है। अगर आप किसी CLI को **`npm install -g`** या **Homebrew** से इंस्टॉल करते हैं और Open Design फिर भी उसे *इंस्टॉल नहीं* दिखाता, तो हो सकता है GUI एक न्यूनतम `PATH` के साथ शुरू हो रहा हो जिसमें आपकी ग्लोबल npm या Homebrew `bin` डायरेक्टरी शामिल नहीं है (macOS पर आम जब ऐप किसी पूर्ण लॉगिन शेल से लॉन्च नहीं होता)। सुनिश्चित करें कि निष्पादन योग्य की डायरेक्टरी उस प्रोसेस के `PATH` पर है जो डेमन चलाता है, फिर **Settings → Execution mode** में **Rescan** का उपयोग करें।

[`nvm`](https://github.com/nvm-sh/nvm) / [`fnm`](https://github.com/Schniz/fnm) वैकल्पिक सुविधा टूल हैं, आवश्यक प्रोजेक्ट सेटअप नहीं। अगर आप कोई उपयोग करते हैं, तो pnpm चलाने से पहले Node 24 इंस्टॉल/चुनें:

```bash
# nvm
nvm install 24
nvm use 24

# fnm
fnm install 24
fnm use 24
```

फिर Corepack सक्षम करें और रेपो को pnpm चुनने दें:

```bash
corepack enable
corepack pnpm --version   # should print 10.33.2
```

## Docker सेटअप

बिना Node.js या pnpm लोकल रूप से इंस्टॉल किए Open Design को पूर्णतः कंटेनराइज़्ड परिवेश में चलाएं।

### आवश्यकताएं

* Docker Desktop
* Docker Compose v2

सत्यापित करें कि Docker सही ढंग से इंस्टॉल है:

```bash
docker compose version
```

---

## Open Design शुरू करें

रिपॉज़िटरी रूट से:

1. deploy डायरेक्टरी में जाएं और परिवेश टेम्पलेट कॉपी करें:

   ```bash
   cd deploy
   cp .env.example .env
   ```

2. एक सुरक्षित टोकन जनरेट करें:

   ```bash
   openssl rand -hex 32
   ```

3. अपने एडिटर में `.env` खोलें, `OD_API_TOKEN=` ढूंढें, और जनरेट किया गया टोकन वहां पेस्ट करें।

फिर सर्विस शुरू करें:

```bash
docker compose up -d
```

ऐप को अपने ब्राउज़र में खोलें:

```text
http://localhost:7456
```

पहली शुरुआत में कुछ सेकंड लग सकते हैं जब Docker नवीनतम इमेज खींचता है।

---

## सामान्य Docker कमांड

### लॉग देखें

```bash
docker compose logs -f
```

### कंटेनर रीस्टार्ट करें

```bash
docker compose restart
```

### कंटेनर रोकें

```bash
docker compose down
```

### नवीनतम इमेज खींचें

```bash
docker compose pull
docker compose up -d
```

### सभी लोकल ऐप डेटा हटाएं

```bash
docker compose down -v
```

---

## परिवेश कॉन्फ़िगरेशन

डिफ़ॉल्ट कॉन्फ़िगरेशन को ओवरराइड करने के लिए एक `deploy/.env` फ़ाइल बनाएं। दिए गए उदाहरण से शुरू करें:

```bash
cp deploy/.env.example deploy/.env
```

अपना टोकन सेट करने और अन्य मानों को आवश्यकतानुसार समायोजित करने के लिए `deploy/.env` एडिट करें:

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

## परसिस्टेंट स्टोरेज

किसी भी परसिस्टेंट डेमन स्टोरेज पाथ को प्रलेखित करने, बदलने या चुनने से पहले,
आपको रूट `AGENTS.md` का सेक्शन **Daemon data directory contract** पढ़ना आवश्यक है।
इस क्विकस्टार्ट में उस अनुबंध को दोहराया नहीं जाना चाहिए या स्टोरेज पाथ परिभाषित नहीं किए जाने चाहिए।

---

## नोट्स

* Docker मोड उन योगदानकर्ताओं के लिए आदर्श है जो लोकल Node.js या pnpm सेटअप नहीं चाहते।
* कंटेनर प्रोडक्शन डेमन बिल्ड को सीधे पोर्ट `7456` पर उजागर करता है।
* डेवलपमेंट वर्कफ़्लो और उन्नत लोकल सेटअप के लिए, इस क्विकस्टार्ट गाइड के बाकी देखें।

---

## वन-शॉट (देव मोड)

```bash
corepack enable
pnpm install
pnpm tools-dev run web # starts daemon + web in the foreground
# open the web URL printed by tools-dev
```

डेस्कटॉप शेल और सभी मैनेज्ड साइडकार्स के लिए बैकग्राउंड में:

```bash
pnpm tools-dev # starts daemon + web + desktop in the background
```

पहली लोड पर, ऐप आपके इंस्टॉल किए गए code-agent CLI (Claude Code / Codex / Devin for Terminal / Gemini / OpenCode / Cursor Agent / Qwen / Qoder CLI) को डिटेक्ट करता है, स्वतः चुनता है, और डिफ़ॉल्ट रूप से `web-prototype` स्किल + `Neutral Modern` डिज़ाइन सिस्टम पर सेट होता है। एक प्रॉम्प्ट टाइप करें और **Send** दबाएं। एजेंट बाएं पैन में स्ट्रीम होता है; `<artifact>` टैग पार्स हो जाता है और HTML दाईं ओर लाइव रेंडर होता है। किसी भी आर्टिफैक्ट स्टोरेज पाथ को प्रलेखित करने या बदलने से पहले, आपको `AGENTS.md` → **Daemon data directory contract** पढ़ना आवश्यक है।

**Design system** ड्रॉपडाउन 71 बिल्ट-इन सिस्टम के साथ शिप होता है — 2 हाथ से लिखित स्टार्टर (Neutral Modern, Warm Editorial) और [`awesome-design-md`](https://github.com/VoltAgent/awesome-design-md) से इंपोर्ट किए गए 69 प्रोडक्ट सिस्टम, श्रेणी द्वारा समूहबद्ध (AI & LLM, Developer Tools, Productivity, Backend, Design Tools, Fintech, E-Commerce, Media, Automotive)। उस ब्रांड के सौंदर्य में हर प्रोटोटाइप स्किन करने के लिए एक चुनें, और [`awesome-design-skills`](https://github.com/bergside/awesome-design-skills) से लिए गए 57 डिज़ाइन स्किल का एक और सेट।

**Skill** ड्रॉपडाउन मोड (Prototype / Deck / Template / Design system) द्वारा समूहबद्ध करता है और प्रति मोड डिफ़ॉल्ट स्किल `· default` सफ़िक्स के साथ दिखाता है। बंडल की गई स्किल:

- **Prototype** — `web-prototype` (जेनेरिक), `saas-landing`, `dashboard`, `pricing-page`, `docs-page`, `blog-post`, `mobile-app`।
- **Deck / PPT** — `simple-deck` (सिंगल-फ़ाइल हॉरिज़ॉन्टल स्वाइप) और `magazine-web-ppt` ([`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) से `guizang-ppt` बंडल — डेक मोड के लिए डिफ़ॉल्ट, अपने एसेट/टेम्पलेट + 4 रेफ़रेंस शिप करता है)। साइड फ़ाइलों वाली स्किल को एक स्वचालित "Skill root (absolute)" प्रीएम्बल मिलता है ताकि एजेंट `assets/template.html` और `references/*.md` को अपने CWD के बजाय वास्तविक ऑन-डिस्क पाथ के विरुद्ध हल कर सके।

एक स्किल को डिज़ाइन सिस्टम के साथ जोड़ें और एकल प्रॉम्प्ट चुनी गई विज़ुअल भाषा में लेआउट-उपयुक्त प्रोटोटाइप या डेक बनाता है।

## अन्य स्क्रिप्ट

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

`pnpm tools-dev` एकमात्र लोकल लाइफ़साइकिल एंट्री पॉइंट है। हटाए गए लिगेसी रूट उपनाम (`pnpm dev`, `pnpm dev:all`, `pnpm daemon`, `pnpm preview`, `pnpm start`) का उपयोग न करें।

`tools-dev` पोर्ट, नेमस्पेस और चाइल्ड प्रोसेस परिवेश को हल करने से पहले स्वतः वर्कस्पेस env फ़ाइलें लोड करता है। डिफ़ॉल्ट प्राथमिकता `.env.development.local`, फिर `.env.local`, फिर `.env.development`, फिर `.env` है; env फ़ाइलें परिवेशी शेल एक्सपोर्ट को ओवरराइड करती हैं इसलिए प्रोजेक्ट-लोकल कॉन्फ़िग जीतता है। लोडिंग अक्षम करने के लिए `--no-env-file` का उपयोग करें या इसके बजाय स्पष्ट env फ़ाइलों का उपयोग करने के लिए `--env-file <path>` दोहराएं।

लोकल डेवलपमेंट के दौरान, `tools-dev` पहले डेमन शुरू करता है, उसके पोर्ट को `apps/web` में पास करता है, और `apps/web/next.config.ts` `/api/*`, `/artifacts/*`, और `/frames/*` को उस डेमन पोर्ट पर रीराइट करता है ताकि App Router ऐप बिना CORS सेटअप के सिबलिंग Express प्रोसेस से बात कर सके।

## मीडिया जनरेशन / एजेंट डिस्पैचर जांच

Image, video, audio, और HyperFrames स्किल डेमन द्वारा एजेंट स्पॉन करते समय इंजेक्ट किए गए परिवेश वेरिएबल के माध्यम से लोकल `od` CLI को कॉल करती हैं:

- `OD_BIN` — `apps/daemon/dist/cli.js` का पूर्ण पाथ।
- `OD_DAEMON_URL` — चल रहा डेमन URL।
- `OD_PROJECT_ID` — सक्रिय प्रोजेक्ट id।
- `OD_PROJECT_DIR` — सक्रिय प्रोजेक्ट की फ़ाइल डायरेक्टरी।

अगर मीडिया जनरेशन `OD_BIN: parameter not set`, `apps/daemon/dist/cli.js` गायब, या `failed to reach daemon at http://127.0.0.1:0` के साथ विफल होता है, तो डेमन CLI दोबारा बिल्ड करें और मैनेज्ड रनटाइम रीस्टार्ट करें:

```bash
pnpm --filter @open-design/daemon build
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
ls -la apps/daemon/dist/cli.js
curl -s http://127.0.0.1:7457/api/health
```

फिर पुराने टर्मिनल एजेंट सत्र को फिर से शुरू करने के बजाय Open Design ऐप से प्रोजेक्ट दोबारा खोलें। डेमन-स्पॉन किए गए एजेंट को इस तरह मान दिखने चाहिए:

```bash
echo "OD_BIN=$OD_BIN"
echo "OD_PROJECT_ID=$OD_PROJECT_ID"
echo "OD_PROJECT_DIR=$OD_PROJECT_DIR"
echo "OD_DAEMON_URL=$OD_DAEMON_URL"
ls -la "$OD_BIN"
```

`OD_DAEMON_URL` `http://127.0.0.1:7457` जैसा वास्तविक डेमन पोर्ट होना चाहिए, `http://127.0.0.1:0` नहीं। `:0` मान केवल एक आंतरिक "free port चुनें" लॉन्च संकेत है और एजेंट सत्रों में लीक नहीं होना चाहिए।

डेमन-ओनली प्रोडक्शन मोड के लिए, डेमन स्टैटिक Next.js एक्सपोर्ट को स्वयं `http://localhost:7456` पर सर्व करता है, इसलिए कोई रिवर्स प्रॉक्सी शामिल नहीं है।

अगर आप डेमन के सामने nginx रखते हैं, तो SSE रूट को अनबफ़र्ड और अनकंप्रेस्ड रखें। एक आम विफलता है कि 80-90 सेकंड बाद ब्राउज़र कंसोल `net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)` दिखाता है क्योंकि nginx `gzip on` डेमन द्वारा `X-Accel-Buffering: no` भेजने पर भी चंक्ड SSE रिस्पॉन्स को बफ़र करता है।

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

## दो एग्ज़ीक्यूशन मोड

| मोड | पिकर मान | अनुरोध कैसे बहता है |
|---|---|---|
| **Local CLI** (डेमन एजेंट डिटेक्ट करने पर डिफ़ॉल्ट) | "Local CLI" | Frontend → daemon `/api/chat` → `spawn(<agent>, ...)` → stdout → SSE → artifact parser → preview |
| **API mode** (फ़ॉलबैक / कोई CLI नहीं) | "Anthropic API" / "OpenAI API" / "Azure OpenAI" / "Google Gemini" | Frontend → daemon `/api/proxy/{provider}/stream` → provider SSE `delta/end/error` में सामान्यीकृत → artifact parser → preview |

दोनों मोड **समान** `<artifact>` पार्सर और **समान** सैंडबॉक्स्ड iframe को फ़ीड करते हैं। केवल ट्रांसपोर्ट और सिस्टम-प्रॉम्प्ट डिलीवरी भिन्न है (लोकल CLI का कोई अलग सिस्टम चैनल नहीं है, इसलिए रचित प्रॉम्प्ट यूज़र संदेश में समाहित हो जाता है)।

## प्रॉम्प्ट रचना

हर भेजने के लिए, ऐप तीन परतों से एक सिस्टम प्रॉम्प्ट बनाता है और उसे प्रोवाइडर को भेजता है:

```
BASE_SYSTEM_PROMPT   (output contract: wrap in <artifact>, no code fences)
   + active design system body  (DESIGN.md — palette/type/layout)
   + active skill body          (SKILL.md — workflow and output rules)
```

टॉप बार में स्किल या डिज़ाइन सिस्टम स्वैप करें और अगला भेजना नया स्टैक उपयोग करता है। बॉडी प्रति सत्र इन-मेमोरी कैश होते हैं इसलिए यह प्रति चयन एकल डेमन फ़ेच है।

## फ़ाइल मैप

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

## समस्या निवारण

- **Node.js वर्ज़न बदलने के बाद `better-sqlite3` लोड विफल / ABI मिसमैच** — `pnpm install` स्वतः `postinstall` दोबारा चलाता है और वर्तमान Node.js के लिए नेटिव ऐड-ऑन दोबारा बिल्ड करता है। मैन्युअल रूप से दोबारा बिल्ड करने या समाधान सत्यापित करने के लिए: `pnpm --filter @open-design/daemon rebuild better-sqlite3` फिर `pnpm --filter @open-design/daemon exec node -e "require('better-sqlite3')"`। बिल्ड टूल चाहिए: `python3`, `make`, `g++` (या `clang++`)। अगर आपके `.npmrc` में `ignore-scripts=true` है, तो `pnpm install` के बाद `node scripts/postinstall.mjs` चलाएं।
- **"PATH पर कोई एजेंट नहीं मिला"** — इनमें से एक इंस्टॉल करें: `claude`, `codex`, `devin`, `gemini`, `opencode`, `cursor-agent`, `qwen`, `qodercli`, `copilot`। या Settings में API मोड पर स्विच करें और कोई प्रोवाइडर key पेस्ट करें।
- **Claude Code कोड 1 के साथ बाहर निकलता है** — Open Design `claude` शुरू करने में सक्षम था, लेकिन स्पॉन किया गया नॉन-इंटरैक्टिव रन रिस्पॉन्स देने से पहले विफल हो गया। उसी शेल या ऐप परिवेश से जो Open Design शुरू करता है, जांचें:
  ```bash
  claude --version
  claude auth status --text
  printf 'hello' | claude -p --output-format stream-json --verbose --permission-mode bypassPermissions
  ```
  अगर स्मोक टेस्ट `401`, `apiKeySource: "none"`, या किसी कस्टम एंडपॉइंट के बिना कोई और auth त्रुटि रिपोर्ट करता है, तो `claude` चलाएं, `/login` उपयोग करें, Claude से बाहर निकलें, और Open Design दोबारा आज़माएं। अगर आप कई Claude प्रोफ़ाइल उपयोग करते हैं, तो **Settings -> Execution mode -> Claude Code config directory** को प्रोफ़ाइल पाथ जैसे `~/.claude-2` पर सेट करें। अगर `ANTHROPIC_BASE_URL` या कोई प्रॉक्सी सेट है, तो एंडपॉइंट URL, प्रॉक्सी क्रेडेंशियल, एंडपॉइंट auth परिवेश, और मॉडल एक्सेस जांचें; केवल तभी कस्टम एंडपॉइंट हटाएं जब आप मानक Claude Code auth के साथ दोबारा आज़माना चाहते हैं। Windows पर, नेटिव PowerShell और WSL अलग Claude इंस्टॉल और क्रेडेंशियल स्टोर उपयोग करते हैं; उसी परिवेश में दोबारा प्रमाणित करें जो Open Design उपयोग करता है, और अगर `/login` नेटिव Windows क्रेडेंशियल ठीक नहीं करता तो Windows Credential Manager जांचें।
- **/api/chat पर daemon 500** — stderr tail के लिए डेमन टर्मिनल जांचें; आमतौर पर CLI ने अपने args अस्वीकार कर दिए। अलग CLI अलग argv आकार लेते हैं; ट्वीक करना हो तो `apps/daemon/src/agents.ts` `buildArgs` देखें।
- **मीडिया जनरेशन कहता है `OD_BIN` गायब है या डेमन URL `:0` है** — ऊपर मीडिया डिस्पैचर जांच चलाएं। पुराने CLI सत्र फिर से न शुरू करें; Open Design ऐप से प्रोजेक्ट दोबारा खोलें ताकि डेमन नए `OD_*` वेरिएबल इंजेक्ट कर सके।
- **Codex बहुत ज़्यादा प्लगइन कॉन्टेक्स्ट लोड करता है** — `OD_CODEX_DISABLE_PLUGINS=1 pnpm tools-dev` के साथ Open Design शुरू करें ताकि डेमन-स्पॉन किए गए Codex प्रोसेस `--disable plugins` के साथ चलें।
- **आर्टिफैक्ट कभी रेंडर नहीं होता** — मॉडल ने `<artifact>` में लपेटे बिना टेक्स्ट दिया। पुष्टि करें कि सिस्टम प्रॉम्प्ट जा रहा है (डेमन लॉग जांचें) और अधिक सक्षम मॉडल या सख्त स्किल पर स्विच करने पर विचार करें।
- **macOS पर `Authorization: Bearer <OD_API_TOKEN>` आवश्यक** — Docker Desktop ब्रिज नेटवर्किंग डेमन को अनुरोध गैर-लूपबैक दिखाती है। Docker Desktop में होस्ट नेटवर्किंग सक्षम करें और `network_mode: host` उपयोग करें। [`deploy/README.md` — Docker Desktop on macOS](../../deploy/README.md#docker-desktop-on-macos) देखें।

## विज़न से वापस मैपिंग

यह क्विकस्टार्ट [`docs/`](../../docs/) में स्पेक का रनने योग्य बीज है। स्पेक बताता है कि यह कहां बढ़ता है ([`docs/roadmap.md`](../../docs/roadmap.md) देखें)। मुख्य बिंदु:

- `docs/architecture.md` शिप किए गए स्टैक का वर्णन करता है: सामने Next.js 16 App Router, उसके पीछे लोकल डेमन, और देव में `apps/web/next.config.ts` रीराइट ताकि ब्राउज़र उसी `/api` सतह से बात करता रहे।
- `docs/skills-protocol.md` पूर्ण `od:` फ़््रंटमैटर (टाइप्ड इनपुट, स्लाइडर, क्षमता गेटिंग) का वर्णन करता है। यह MVP केवल `name` / `description` / `triggers` / `od.mode` / `od.design_system.requires` पढ़ता है — बाकी जोड़ने के लिए `apps/daemon/src/skills.ts` विस्तारित करें।
- `docs/agent-adapters.md` समृद्ध डिस्पैच (क्षमता डिटेक्शन, स्ट्रीमिंग टूल-कॉल) का अनुमान लगाता है। हमारा `apps/daemon/src/agents.ts` एक न्यूनतम डिस्पैचर है — वायरिंग साबित करने के लिए पर्याप्त।
- `docs/modes.md` चार मोड सूचीबद्ध करता है: prototype / deck / template / design-system। हम पहले दो के लिए स्किल शिप करते हैं; पिकर पहले से `mode` द्वारा फ़िल्टर करता है।
