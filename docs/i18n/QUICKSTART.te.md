# క్విక్‌స్టార్ట్

<p align="center"><a href="../../QUICKSTART.md">English</a> · <a href="QUICKSTART.pt-BR.md">Português (Brasil)</a> · <a href="QUICKSTART.de.md">Deutsch</a> · <a href="QUICKSTART.fr.md">Français</a> · <a href="QUICKSTART.ko.md">한국어</a> · <a href="QUICKSTART.ja-JP.md">日本語</a> · <a href="QUICKSTART.zh-CN.md">简体中文</a> · <a href="QUICKSTART.zh-TW.md">繁體中文</a> · <b>తెలుగు</b></p>

మొత్తం ప్రొడక్ట్ ను లోకల్ గా రన్ చేయండి.

## ఎన్విరాన్మెంట్ అవసరాలు

- **Node.js:** `~24` (Node 24.x). ఈ రెపో `package.json#engines` ద్వారా దీన్ని ఎన్‌ఫోర్స్ చేస్తుంది.
- **pnpm:** `10.33.x`. ఈ రెపో `packageManager` ద్వారా `pnpm@10.33.2` ను పిన్ చేస్తుంది; పిన్ చేసిన వెర్షన్ ఆటోమేటిక్ గా సెలెక్ట్ అయ్యేలా Corepack ఉపయోగించండి.
- **OS:** macOS, Linux, మరియు WSL2 ప్రాథమిక పాత్‌లు. Windows native సపోర్ట్ చేయబడుతుంది; సాధారణ సెటప్ సమస్యల కోసం [`docs/windows-troubleshooting.md`](../../docs/windows-troubleshooting.md) చూడండి.
- **ఐచ్ఛిక లోకల్ ఏజెంట్ CLI:** Claude Code, Codex, Devin for Terminal, Gemini CLI, OpenCode, Cursor Agent, Qwen, Qoder CLI, GitHub Copilot CLI, మొదలైనవి. ఏదీ ఇన్‌స్టాల్ చేయబడకపోతే, Settings లో BYOK API మోడ్ ఉపయోగించండి.

### లోకల్ ఏజెంట్ CLI మరియు PATH

డెమోన్ మీ **`PATH`** ను (ప్లస్ సాధారణ యూజర్ టూల్‌చెయిన్ డైరెక్టరీలను) స్కాన్ చేస్తుంది. మీరు ఒక CLI ని **`npm install -g`** లేదా **Homebrew** తో ఇన్‌స్టాల్ చేసినా Open Design ఇంకా దాన్ని *ఇన్‌స్టాల్ కాలేదు* అని చూపిస్తే, GUI మీ గ్లోబల్ npm లేదా Homebrew `bin` డైరెక్టరీని కలిగి ఉండని మినిమల్ `PATH` తో స్టార్ట్ అవుతోంది (macOS లో యాప్ పూర్తి లాగిన్ షెల్ నుండి లాంచ్ కానప్పుడు సర్వసాధారణం). డెమోన్ ను రన్ చేసే ప్రాసెస్ కోసం ఎగ్జిక్యూటబుల్ యొక్క డైరెక్టరీ `PATH` లో ఉందని నిర్ధారించుకోండి, తర్వాత **Settings → Execution mode** లో **Rescan** ఉపయోగించండి.

[`nvm`](https://github.com/nvm-sh/nvm) / [`fnm`](https://github.com/Schniz/fnm) ఐచ్ఛిక కన్వీనియన్స్ టూల్స్, అవసరమైన ప్రాజెక్ట్ సెటప్ కాదు. మీరు ఒకటి ఉపయోగిస్తే, pnpm రన్ చేయడానికి ముందు Node 24 ఇన్‌స్టాల్/సెలెక్ట్ చేయండి:

```bash
# nvm
nvm install 24
nvm use 24

# fnm
fnm install 24
fnm use 24
```

తర్వాత Corepack ఎనేబుల్ చేసి రెపో pnpm ను సెలెక్ట్ చేయనివ్వండి:

```bash
corepack enable
corepack pnpm --version   # 10.33.2 ప్రింట్ అవ్వాలి
```

## Docker సెటప్

Node.js లేదా pnpm ను లోకల్ గా ఇన్‌స్టాల్ చేయకుండా పూర్తి కంటైనరైజ్డ్ ఎన్విరాన్మెంట్ లో Open Design ను రన్ చేయండి.

### అవసరాలు

* Docker Desktop
* Docker Compose v2

Docker సరిగ్గా ఇన్‌స్టాల్ అయిందని నిర్ధారించుకోండి:

```bash
docker compose version
```

---

## Open Design స్టార్ట్

రెపోసిటరీ రూట్ నుండి:

1. డిప్లాయ్ డైరెక్టరీకి మారి ఎన్విరాన్మెంట్ టెంప్లేట్ కాపీ చేయండి:

   ```bash
   cd deploy
   cp .env.example .env
   ```

2. ఒక సురక్షిత టోకెన్ జనరేట్ చేయండి:

   ```bash
   openssl rand -hex 32
   ```

3. మీ ఎడిటర్ లో `.env` తెరిచి, `OD_API_TOKEN=` కనుగొని, జనరేట్ చేసిన టోకెన్ అక్కడ పేస్ట్ చేయండి.

తర్వాత సర్వీస్ స్టార్ట్ చేయండి:

```bash
docker compose up -d
```

యాప్ ను మీ బ్రౌజర్ లో తెరవండి:

```text
http://localhost:7456
```

Docker తాజా ఇమేజ్ ను పుల్ చేసేటప్పుడు మొదటి స్టార్టప్ కు కొన్ని సెకన్లు పట్టవచ్చు.

---

## సాధారణ Docker కమాండ్‌లు

### లాగ్‌లు చూడటం

```bash
docker compose logs -f
```

### కంటైనర్లను రీస్టార్ట్ చేయడం

```bash
docker compose restart
```

### కంటైనర్లను ఆపడం

```bash
docker compose down
```

### తాజా ఇమేజ్ పుల్

```bash
docker compose pull
docker compose up -d
```

### అన్ని లోకల్ యాప్ డేటా తొలగించడం

```bash
docker compose down -v
```

---

## ఎన్విరాన్మెంట్ కాన్ఫిగరేషన్

డిఫాల్ట్ కాన్ఫిగరేషన్ ను ఓవర్‌రైడ్ చేయడానికి ఒక `deploy/.env` ఫైల్ సృష్టించండి. అందించిన ఉదాహరణ నుండి ప్రారంభించండి:

```bash
cp deploy/.env.example deploy/.env
```

మీ స్వంత టోకెన్ సెట్ చేయడానికి మరియు అవసరమైన ఇతర విలువలను సర్దుబాటు చేయడానికి `deploy/.env` సవరించండి:

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

## పర్సిస్టెంట్ స్టోరేజ్

ఏ పర్సిస్టెంట్ డెమోన్ స్టోరేజ్ పాత్ ను డాక్యుమెంట్ చేయడానికి, మార్చడానికి, లేదా ఎంచుకోవడానికి ముందు, మీరు తప్పనిసరిగా రూట్ `AGENTS.md` సెక్షన్ **Daemon data directory contract** చదవాలి. ఈ క్విక్‌స్టార్ట్ ఆ కాంట్రాక్ట్ ను రీస్టేట్ చేయకూడదు లేదా స్టోరేజ్ పాత్‌లను నిర్వచించకూడదు.

---

## గమనికలు

* Docker మోడ్ లోకల్ Node.js లేదా pnpm సెటప్ కావాలని అనుకోని కంట్రిబ్యూటర్లకు అనువుగా ఉంటుంది.
* కంటైనర్ ప్రొడక్షన్ డెమోన్ బిల్డ్ ను నేరుగా పోర్ట్ `7456` పై ఎక్స్‌పోజ్ చేస్తుంది.
* డెవలప్‌మెంట్ వర్క్‌ఫ్లోలు మరియు అడ్వాన్స్డ్ లోకల్ సెటప్ కోసం, ఈ క్విక్‌స్టార్ట్ గైడ్ యొక్క మిగిలిన భాగం చూడండి.

---

## వన్-షాట్ (dev మోడ్)

```bash
corepack enable
pnpm install
pnpm tools-dev run web # ఫోర్‌గ్రౌండ్ లో daemon + web స్టార్ట్ చేస్తుంది
# tools-dev ప్రింట్ చేసిన web URL తెరవండి
```

డెస్క్‌టాప్ షెల్ మరియు అన్ని మేనేజ్డ్ సైడ్‌కార్‌లను బ్యాక్‌గ్రౌండ్ లో రన్ చేయడానికి:

```bash
pnpm tools-dev # బ్యాక్‌గ్రౌండ్ లో daemon + web + desktop స్టార్ట్ చేస్తుంది
```

మొదటి లోడ్ లో, యాప్ మీ ఇన్‌స్టాల్ చేసిన కోడ్-ఏజెంట్ CLI (Claude Code / Codex / Devin for Terminal / Gemini / OpenCode / Cursor Agent / Qwen / Qoder CLI) ను గుర్తించి, ఆటోమేటిక్ గా పిక్ చేస్తుంది మరియు `web-prototype` స్కిల్ + `Neutral Modern` డిజైన్ సిస్టమ్ కు డిఫాల్ట్ అవుతుంది. ఒక ప్రాంప్ట్ టైప్ చేసి **Send** నొక్కండి. ఏజెంట్ ఎడమ పేన్ లోకి స్ట్రీమ్ అవుతుంది; `<artifact>` ట్యాగ్ పార్స్ అయి ఆ HTML కుడి వైపు లైవ్ గా రెండర్ అవుతుంది. ఏ ఆర్టిఫ్యాక్ట్ స్టోరేజ్ పాత్ ను డాక్యుమెంట్ చేయడానికి లేదా మార్చడానికి ముందు, మీరు తప్పనిసరిగా `AGENTS.md` → **Daemon data directory contract** చదవాలి.

**Design system** డ్రాప్‌డౌన్ 71 బిల్ట్-ఇన్ సిస్టమ్‌లతో వస్తుంది — 2 హ్యాండ్-ఆథర్డ్ స్టార్టర్లు (Neutral Modern, Warm Editorial) మరియు [`awesome-design-md`](https://github.com/VoltAgent/awesome-design-md) నుండి ఇంపోర్ట్ చేసిన 69 ప్రొడక్ట్ సిస్టమ్‌లు, కేటగిరీ ద్వారా గ్రూప్ చేయబడ్డాయి (AI & LLM, Developer Tools, Productivity, Backend, Design Tools, Fintech, E-Commerce, Media, Automotive). ఆ బ్రాండ్ యొక్క ఎస్థెటిక్ లో ప్రతి ప్రొటోటైప్ ను స్కిన్ చేయడానికి ఒకటి పిక్ చేయండి, మరియు [`awesome-design-skills`](https://github.com/bergside/awesome-design-skills) నుండి సోర్స్ చేసిన మరొక సెట్ ఆఫ్ 57 డిజైన్ స్కిల్స్.

**Skill** డ్రాప్‌డౌన్ మోడ్ ద్వారా గ్రూప్ చేస్తుంది (Prototype / Deck / Template / Design system) మరియు మోడ్ కు డిఫాల్ట్ స్కిల్ ను `· default` సఫిక్స్ తో చూపుతుంది. బండిల్డ్ స్కిల్స్:

- **Prototype** — `web-prototype` (జెనరిక్), `saas-landing`, `dashboard`, `pricing-page`, `docs-page`, `blog-post`, `mobile-app`.
- **Deck / PPT** — `simple-deck` (సింగిల్-ఫైల్ హారిజాంటల్ స్వైప్) మరియు `magazine-web-ppt` ([`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) నుండి `guizang-ppt` బండిల్ — deck మోడ్ కు డిఫాల్ట్, దాని స్వంత యాసెట్స్/టెంప్లేట్ + 4 రిఫరెన్స్‌లతో వస్తుంది). సైడ్ ఫైల్‌లతో కూడిన స్కిల్స్ కు ఆటోమేటిక్ "Skill root (absolute)" ప్రీయాంబుల్ లభిస్తుంది తద్వారా ఏజెంట్ దాని CWD కి బదులుగా నిజమైన ఆన్-డిస్క్ పాత్ కి `assets/template.html` మరియు `references/*.md` ను రిజాల్వ్ చేయగలుగుతుంది.

ఒక స్కిల్ ను డిజైన్ సిస్టమ్ తో జతచేస్తే ఒక ప్రాంప్ట్ ఎంచుకున్న విజువల్ లాంగ్వేజ్ లో లేఅవుట్-అప్రాప్రియేట్ ప్రొటోటైప్ లేదా deck ను ఉత్పత్తి చేస్తుంది.

## ఇతర స్క్రిప్ట్‌లు

```bash
pnpm tools-dev                 # బ్యాక్‌గ్రౌండ్ లో daemon + web + desktop
pnpm tools-dev start web       # బ్యాక్‌గ్రౌండ్ లో daemon + web
pnpm tools-dev run web         # ఫోర్‌గ్రౌండ్ లో daemon + web (e2e/dev సర్వర్)
pnpm tools-dev restart         # daemon + web + desktop రీస్టార్ట్
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
pnpm tools-dev status          # మేనేజ్డ్ రన్‌టైమ్‌లను ఇన్స్పెక్ట్
pnpm tools-dev logs            # daemon/web/desktop లాగ్‌లు చూపు
pnpm tools-dev check           # status + ఇటీవలి లాగ్‌లు + సాధారణ డయాగ్నొస్టిక్స్
pnpm tools-dev stop            # మేనేజ్డ్ రన్‌టైమ్‌లను ఆపు
pnpm --filter @open-design/daemon build  # `od` కోసం apps/daemon/dist/cli.js బిల్డ్
pnpm --filter @open-design/web build     # అవసరమైనప్పుడు web ప్యాకేజ్ బిల్డ్
pnpm typecheck                 # వర్క్‌స్పేస్ టైప్‌చెక్
```

`pnpm tools-dev` మాత్రమే ఏకైక లోకల్ లైఫ్‌సైకిల్ ఎంట్రీ పాయింట్. తొలగించబడిన లెగసీ రూట్ అలియాస్‌లు (`pnpm dev`, `pnpm dev:all`, `pnpm daemon`, `pnpm preview`, `pnpm start`) ఉపయోగించవద్దు.

`tools-dev` పోర్ట్‌లు, నేమ్‌స్పేస్‌లు, మరియు చైల్డ్ ప్రాసెస్ ఎన్విరాన్మెంట్‌లను రిజాల్వ్ చేయడానికి ముందు వర్క్‌స్పేస్ env ఫైల్‌లను ఆటోమేటిక్ గా లోడ్ చేస్తుంది. డిఫాల్ట్ ప్రిసిడెన్స్ `.env.development.local`, తర్వాత `.env.local`, తర్వాత `.env.development`, తర్వాత `.env`; env ఫైల్‌లు ఎంబియంట్ షెల్ ఎక్స్‌పోర్ట్‌లను ఓవర్‌రైడ్ చేస్తాయి తద్వారా ప్రాజెక్ట్-లోకల్ కాన్ఫిగ్ గెలుస్తుంది. లోడింగ్ ను డిసేబుల్ చేయడానికి `--no-env-file` ఉపయోగించండి లేదా స్పష్టమైన env ఫైల్‌లను ఉపయోగించడానికి `--env-file <path>` ను రిపీట్ చేయండి.

లోకల్ డెవలప్‌మెంట్ లో, `tools-dev` మొదట డెమోన్ ను స్టార్ట్ చేస్తుంది, దాని పోర్ట్ ను `apps/web` కు పాస్ చేస్తుంది, మరియు `apps/web/next.config.ts` CORS సెటప్ లేకుండా App Router యాప్ సిబ్లింగ్ Express ప్రాసెస్ తో మాట్లాడగలిగేలా `/api/*`, `/artifacts/*`, మరియు `/frames/*` ను ఆ డెమోన్ పోర్ట్ కు రీరైట్ చేస్తుంది.

## మీడియా జనరేషన్ / ఏజెంట్ డిస్పాచర్ తనిఖీలు

ఇమేజ్, వీడియో, ఆడియో, మరియు HyperFrames స్కిల్స్ ఏజెంట్ ను spawn చేసినప్పుడు డెమోన్ ఇంజెక్ట్ చేసే ఎన్విరాన్మెంట్ వేరియబుల్స్ ద్వారా లోకల్ `od` CLI ను కాల్ చేస్తాయి:

- `OD_BIN` — `apps/daemon/dist/cli.js` కు యాబ్సల్యూట్ పాత్.
- `OD_DAEMON_URL` — రన్ అవుతున్న డెమోన్ URL.
- `OD_PROJECT_ID` — యాక్టివ్ ప్రాజెక్ట్ id.
- `OD_PROJECT_DIR` — యాక్టివ్ ప్రాజెక్ట్ యొక్క ఫైల్ డైరెక్టరీ.

మీడియా జనరేషన్ `OD_BIN: parameter not set`, `apps/daemon/dist/cli.js` మిస్సింగ్, లేదా `failed to reach daemon at http://127.0.0.1:0` తో విఫలమైతే, డెమోన్ CLI ను రీబిల్డ్ చేసి మేనేజ్డ్ రన్‌టైమ్ ను రీస్టార్ట్ చేయండి:

```bash
pnpm --filter @open-design/daemon build
pnpm tools-dev restart --daemon-port 7457 --web-port 5175
ls -la apps/daemon/dist/cli.js
curl -s http://127.0.0.1:7457/api/health
```

తర్వాత పాత టెర్మినల్ ఏజెంట్ సెషన్ ను రిజ్యూమ్ చేయకుండా Open Design యాప్ నుండి ప్రాజెక్ట్ మళ్లీ తెరవండి. డెమోన్-స్పాన్డ్ చేసిన ఏజెంట్ ఈ విలువలను చూడాలి:

```bash
echo "OD_BIN=$OD_BIN"
echo "OD_PROJECT_ID=$OD_PROJECT_ID"
echo "OD_PROJECT_DIR=$OD_PROJECT_DIR"
echo "OD_DAEMON_URL=$OD_DAEMON_URL"
ls -la "$OD_BIN"
```

`OD_DAEMON_URL` `http://127.0.0.1:7457` వంటి నిజమైన డెమోన్ పోర్ట్ అయి ఉండాలి, `http://127.0.0.1:0` కాదు. `:0` విలువ కేవలం ఒక ఇంటర్నల్ "ఒక ఫ్రీ పోర్ట్ పిక్ చేయి" లాంచ్ హింట్ మాత్రమే, ఏజెంట్ సెషన్‌లలోకి లీక్ కాకూడదు.

డెమోన్-మాత్రమే ప్రొడక్షన్ మోడ్ కోసం, డెమోన్ `http://localhost:7456` వద్ద స్టాటిక్ Next.js ఎక్స్‌పోర్ట్ ను తానే సర్వ్ చేస్తుంది, కాబట్టి ఎలా రివర్స్ ప్రాక్సీ పాల్గొనదు.

మీరు డెమోన్ ముందు nginx ఉంచితే, SSE రూట్‌లను అన్-బఫర్డ్ మరియు అన్-కంప్రెస్డ్ గా ఉంచండి. ఒక సర్వసాధారణ వైఫల్యం: డెమోన్ `X-Accel-Buffering: no` పంపినా nginx `gzip on` చంక్డ్ SSE రెస్పాన్స్‌లను బఫర్ చేస్తుంది తద్వారా 80-90 సెకన్ల తర్వాత బ్రౌజర్ కన్సోల్ `net::ERR_INCOMPLETE_CHUNKED_ENCODING 200 (OK)` చూపుతుంది.

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

## రెండు ఎగ్జిక్యూషన్ మోడ్‌లు

| మోడ్ | పికర్ విలువ | ఒక అభ్యర్థన ఎలా ఫ్లో అవుతుంది |
|---|---|---|
| **Local CLI** (డెమోన్ ఒక ఏజెంట్ ను గుర్తించినప్పుడు డిఫాల్ట్) | "Local CLI" | Frontend → daemon `/api/chat` → `spawn(<agent>, ...)` → stdout → SSE → artifact parser → preview |
| **API మోడ్** (ఫాల్‌బ్యాక్ / CLI లేదు) | "Anthropic API" / "OpenAI API" / "Azure OpenAI" / "Google Gemini" | Frontend → daemon `/api/proxy/{provider}/stream` → provider SSE `delta/end/error` గా నార్మలైజ్ → artifact parser → preview |

రెండు మోడ్‌లు **ఒకే** `<artifact>` పార్సర్ మరియు **ఒకే** సాండ్‌బాక్స్డ్ iframe కు ఫీడ్ అవుతాయి. తేడా ఒక్కటే — ట్రాన్స్‌పోర్ట్ మరియు సిస్టమ్-ప్రాంప్ట్ డెలివరీ (లోకల్ CLI లకు ప్రత్యేక సిస్టమ్ ఛానెల్ లేదు, కాబట్టి కంపోజ్ చేసిన ప్రాంప్ట్ యూజర్ మెసేజ్ లోకి ఫోల్డ్ అవుతుంది).

## ప్రాంప్ట్ కంపోజిషన్

ప్రతి send కు, యాప్ మూడు లేయర్‌ల నుండి ఒక సిస్టమ్ ప్రాంప్ట్ బిల్డ్ చేసి దాన్ని ప్రొవైడర్ కు పంపుతుంది:

```
BASE_SYSTEM_PROMPT   (అవుట్‌పుట్ కాంట్రాక్ట్: <artifact> లో రాప్, కోడ్ ఫెన్స్‌లు లేవు)
   + యాక్టివ్ డిజైన్ సిస్టమ్ బాడీ  (DESIGN.md — palette/type/layout)
   + యాక్టివ్ స్కిల్ బాడీ          (SKILL.md — వర్క్‌ఫ్లో మరియు అవుట్‌పుట్ రూల్స్)
```

టాప్ బార్ లో స్కిల్ లేదా డిజైన్ సిస్టమ్ స్వాప్ చేస్తే తదుపరి send కొత్త స్టాక్ ను ఉపయోగిస్తుంది. బాడీలు సెషన్‌కు in-memory క్యాష్ చేయబడతాయి తద్వారా ఇది పిక్ కు ఒకే డెమోన్ ఫెచ్.

## ఫైల్ మ్యాప్

```
open-design/
├── apps/
│   ├── daemon/                # Node/Express — లోకల్ ఏజెంట్‌లను spawn చేస్తుంది + API లను సర్వ్ చేస్తుంది
│   │   └── src/
│   │       ├── cli.ts             # `od` bin ఎంట్రీ
│   │       ├── server.ts          # /api/* + static సర్వింగ్
│   │       ├── agents.ts          # claude/codex/devin/gemini/opencode/cursor-agent/qwen/qoder/copilot కోసం PATH స్కానర్
│   │       ├── skills.ts          # SKILL.md లోడర్ (frontmatter పార్సర్)
│   │       └── design-systems.ts  # DESIGN.md లోడర్
│   │   ├── sidecar/           # tools-dev daemon sidecar రేపర్
│   │   └── tests/             # daemon ప్యాకేజ్ టెస్ట్‌లు
│   ├── web/                   # Next.js 16 App Router + React క్లయింట్
│       ├── app/               # App Router ఎంట్రీపాయింట్‌లు
│       ├── src/               # React + TypeScript క్లయింట్/రన్‌టైమ్ మాడ్యూల్స్
│       │   ├── App.tsx        # మోడ్ / స్కిల్ / DS పికర్లు + send ఆర్కెస్ట్రేట్
│       │   ├── providers/     # daemon + BYOK API ట్రాన్స్‌పోర్ట్‌లు
│       │   ├── prompts/       # system, discovery, directions, deck framework
│       │   ├── artifacts/     # స్ట్రీమింగ్ <artifact> పార్సర్ + manifests
│       │   ├── runtime/       # iframe srcdoc, markdown, export helpers
│       │   └── state/         # localStorage + daemon-backed ప్రాజెక్ట్ స్టేట్
│       ├── sidecar/           # tools-dev web sidecar రేపర్
│       └── next.config.ts     # tools-dev రీరైట్‌లు + prod apps/web/out ఎక్స్‌పోర్ట్ కాన్ఫిగ్
│   └── desktop/               # Electron రన్‌టైమ్, tools-dev ద్వారా లాంచ్/ఇన్స్పెక్ట్
├── packages/
│   ├── contracts/             # షేర్డ్ web/daemon యాప్ కాంట్రాక్ట్‌లు
│   ├── sidecar-proto/         # Open Design sidecar ప్రొటోకాల్ కాంట్రాక్ట్
│   ├── sidecar/               # జెనరిక్ sidecar రన్‌టైమ్ ప్రిమిటివ్‌లు
│   └── platform/              # జెనరిక్ process/platform ప్రిమిటివ్‌లు
├── tools/dev/                 # `pnpm tools-dev` లైఫ్‌సైకిల్ మరియు inspect CLI
├── e2e/                       # Playwright UI + external integration/Vitest harness
├── skills/                    # SKILL.md — ఏ Claude Code స్కిల్ రెపో నుండి డ్రాప్ అవుతుంది
│   ├── web-prototype/         # జెనరిక్ single-screen ప్రొటోటైప్ (prototype మోడ్ కు డిఫాల్ట్)
│   ├── saas-landing/          # మార్కెటింగ్ పేజీ (hero / features / pricing / CTA)
│   ├── dashboard/             # admin / analytics dashboard
│   ├── pricing-page/          # standalone pricing + comparison
│   ├── docs-page/             # 3-column documentation layout
│   ├── blog-post/             # editorial long-form
│   ├── mobile-app/            # phone-frame single screen
│   ├── simple-deck/           # minimal horizontal-swipe deck
│   └── guizang-ppt/           # magazine-web-ppt — bundled deck/PPT డిఫాల్ట్
│       ├── SKILL.md
│       ├── assets/template.html
│       └── references/{themes,layouts,components,checklist}.md
├── design-systems/            # DESIGN.md — 9-section schema (awesome-claude-design)
│   ├── default/               # Neutral Modern (starter)
│   ├── warm-editorial/        # Warm Editorial (starter)
│   ├── README.md              # catalog overview
│   └── …129 systems           # 2 starters · 70 product systems · 57 design skills
├── scripts/sync-design-systems.ts    # upstream getdesign tarball నుండి రీ-ఇంపోర్ట్
├── docs/                      # ప్రొడక్ట్ vision + spec
├── pnpm-workspace.yaml        # apps/* + packages/* + tools/* + e2e
└── package.json               # root quality scripts + `od` bin
```

## ట్రబుల్‌షూటింగ్

- **`better-sqlite3` లోడ్ విఫలం / Node.js వెర్షన్ మార్పు తర్వాత ABI మిస్‌మ్యాచ్** — `pnpm install` ఆటోమేటిక్ గా `postinstall` ను రీ-రన్ చేస్తుంది మరియు ప్రస్తుత Node.js కోసం native addon రీబిల్డ్ చేస్తుంది. మాన్యువల్ గా రీబిల్డ్ చేయడానికి లేదా ఫిక్స్ ను వెరిఫై చేయడానికి: `pnpm --filter @open-design/daemon rebuild better-sqlite3` తర్వాత `pnpm --filter @open-design/daemon exec node -e "require('better-sqlite3')"`. బిల్డ్ టూల్స్ కావాలి: `python3`, `make`, `g++` (లేదా `clang++`). మీ `.npmrc` లో `ignore-scripts=true` ఉంటే, `pnpm install` తర్వాత `node scripts/postinstall.mjs` రన్ చేయండి.
- **"no agents found on PATH"** — వీటిలో ఒకటి ఇన్‌స్టాల్ చేయండి: `claude`, `codex`, `devin`, `gemini`, `opencode`, `cursor-agent`, `qwen`, `qodercli`, `copilot`. లేదా Settings లో API మోడ్ కు స్విచ్ చేసి ఒక ప్రొవైడర్ కీ పేస్ట్ చేయండి.
- **Claude Code exit code 1** తో నిష్క్రమిస్తే — Open Design `claude` ను స్టార్ట్ చేయగలిగింది, కానీ spawn అయిన non-interactive run ఒక రెస్పాన్స్ ఉత్పత్తి చేయడానికి ముందు విఫలమైంది. Open Design స్టార్ట్ చేసే అదే షెల్ లేదా యాప్ ఎన్విరాన్మెంట్ నుండి, తనిఖీ చేయండి:
  ```bash
  claude --version
  claude auth status --text
  printf 'hello' | claude -p --output-format stream-json --verbose --permission-mode bypassPermissions
  ```
  smoke test `401`, `apiKeySource: "none"`, లేదా కస్టమ్ ఎండ్‌పాయింట్ లేకుండా మరొక auth ఎర్రర్ రిపోర్ట్ చేస్తే, `claude` రన్ చేసి, `/login` ఉపయోగించి, Claude ని ఎగ్జిట్ చేసి, Open Design మళ్లీ ట్రై చేయండి. మీరు బహుళ Claude ప్రొఫైల్‌లు ఉపయోగిస్తే, `~/.claude-2` వంటి ప్రొఫైల్ పాత్ కు **Settings -> Execution mode -> Claude Code config directory** సెట్ చేయండి. `ANTHROPIC_BASE_URL` లేదా ప్రాక్సీ సెట్ అయితే, ఎండ్‌పాయింట్ URL, ప్రాక్సీ క్రెడెన్షియల్స్, ఎండ్‌పాయింట్ auth ఎన్విరాన్మెంట్, మరియు మోడల్ యాక్సెస్ తనిఖీ చేయండి; స్టాండర్డ్ Claude Code auth తో మళ్లీ ట్రై చేయాలనుకుంటే మాత్రమే కస్టమ్ ఎండ్‌పాయింట్ తొలగించండి. Windows లో, native PowerShell మరియు WSL వేర్వేరు Claude ఇన్‌స్టాల్‌లు మరియు క్రెడెన్షియల్ స్టోర్‌లు ఉపయోగిస్తాయి; Open Design ఉపయోగించే అదే ఎన్విరాన్మెంట్ లో రీ-ఆథెంటికేట్ చేయండి, మరియు `/login` native Windows క్రెడెన్షియల్స్ రిపేర్ చేయకపోతే Windows Credential Manager తనిఖీ చేయండి.
- **/api/chat లో daemon 500** — stderr tail కోసం డెమోన్ టెర్మినల్ తనిఖీ చేయండి; సాధారణంగా CLI దాని args తిరస్కరించింది. విభిన్న CLI లు విభిన్న argv ఆకృతులను తీసుకుంటాయి; ట్వీక్ చేయాలంటే `apps/daemon/src/agents.ts` `buildArgs` చూడండి.
- **మీడియా జనరేషన్ `OD_BIN` మిస్సింగ్ లేదా daemon URL `:0` అని చెబుతుంటే** — పై మీడియా డిస్పాచర్ తనిఖీలు రన్ చేయండి. పాత CLI సెషన్ ను రిజ్యూమ్ చేయవద్దు; డెమోన్ ఫ్రెష్ `OD_*` వేరియబుల్స్ ఇంజెక్ట్ చేయగలగడానికి Open Design యాప్ నుండి ప్రాజెక్ట్ మళ్లీ తెరవండి.
- **Codex మరీ ఎక్కువ ప్లగిన్ కాంటెక్స్ట్ లోడ్ చేస్తే** — daemon-spawned Codex ప్రాసెస్‌లు `--disable plugins` తో రన్ అయ్యేలా `OD_CODEX_DISABLE_PLUGINS=1 pnpm tools-dev` తో Open Design స్టార్ట్ చేయండి.
- **artifact ఎప్పటికీ రెండర్ కాకపోతే** — మోడల్ `<artifact>` లో రాప్ చేయకుండా టెక్స్ట్ ఉత్పత్తి చేసింది. సిస్టమ్ ప్రాంప్ట్ వెళ్తోందని (డెమోన్ లాగ్ తనిఖీ) నిర్ధారించుకోండి మరియు మరింత సామర్థ్యం గల మోడల్ లేదా స్ట్రిక్టర్ స్కిల్ కు స్విచ్ చేయడం పరిగణించండి.
- **macOS లో `Authorization: Bearer <OD_API_TOKEN>` అవసరం** — Docker Desktop bridge నెట్‌వర్కింగ్ వల్ల డెమోన్ అభ్యర్థనలను non-loopback గా చూస్తుంది. Docker Desktop లో host నెట్‌వర్కింగ్ ఎనేబుల్ చేసి `network_mode: host` ఉపయోగించండి. [`deploy/README.md` — Docker Desktop on macOS](../../deploy/README.md#docker-desktop-on-macos) చూడండి.

## vision కు తిరిగి మ్యాపింగ్

ఈ క్విక్‌స్టార్ట్ [`docs/`](../../docs/) లో spec యొక్క runnable seed. spec ఇది ఎక్కడకు పెరుగుతుందో వివరిస్తుంది ([`docs/roadmap.md`](../../docs/roadmap.md) చూడండి). ముఖ్యాంశలు:

- `docs/architecture.md` షిప్ చేసిన స్టాక్ వివరిస్తుంది: ముందు Next.js 16 App Router, దాని వెనుక లోకల్ డెమోన్, మరియు dev లో బ్రౌజర్ ఒకే `/api` surface తో మాట్లాడేలా `apps/web/next.config.ts` రీరైట్‌లు.
- `docs/skills-protocol.md` పూర్తి `od:` frontmatter (typed inputs, sliders, capability gating) వివరిస్తుంది. ఈ MVP `name` / `description` / `triggers` / `od.mode` / `od.design_system.requires` మాత్రమే చదువుతుంది — మిగిలినవి జోడించడానికి `apps/daemon/src/skills.ts` ఎక్స్‌టెండ్ చేయండి.
- `docs/agent-adapters.md` రిచర్ dispatch (capability detection, streaming tool-calls) ఊహిస్తుంది. మా `apps/daemon/src/agents.ts` ఒక మినిమల్ డిస్పాచర్ — వైరింగ్ ను రుజువు చేయడానికి సరిపోతుంది.
- `docs/modes.md` నాలుగు మోడ్‌లను జాబితా చేస్తుంది: prototype / deck / template / design-system. మేము మొదటి రెండింటి కోసం స్కిల్స్ షిప్ చేస్తాము; పికర్ ఇప్పటికే `mode` ద్వారా ఫిల్టర్ చేస్తుంది.
