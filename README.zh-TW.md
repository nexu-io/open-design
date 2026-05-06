# Open Design

> **[Claude Design][cd] 的開源替代品。** 本地優先、可部署到 Vercel、每一層都 BYOK —— **10 套 coding-agent CLI** 在 `PATH` 上自動檢測（Claude Code、Codex、Cursor Agent、Gemini CLI、OpenCode、Qwen、GitHub Copilot CLI、Hermes、Kimi、Pi）就是設計引擎，由 **31 個可組合 Skills** 和 **72 套品牌級 Design System** 驅動。一個都沒裝？還有 OpenAI 相容的 BYOK 代理 `/api/proxy/stream` 備援，同一條 loop，少一次 spawn 而已。

<p align="center">
  <img src="docs/assets/banner.png" alt="Open Design 封面：與本地 AI 智慧體共同設計" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/nexu-io/open-design/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=ffd700&logo=github&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/network/members"><img alt="Forks" src="https://img.shields.io/github/forks/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=2ecc71&logo=github&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/issues"><img alt="Issues" src="https://img.shields.io/github/issues/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=ff6b6b&logo=github&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/pulls"><img alt="Pull Requests" src="https://img.shields.io/github/issues-pr/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=9b59b6&logo=github&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/graphs/contributors"><img alt="Contributors" src="https://img.shields.io/github/contributors/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=3498db&logo=github&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/commits/main"><img alt="Commit activity" src="https://img.shields.io/github/commit-activity/m/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=e67e22&logo=git&logoColor=white" /></a>
  <a href="https://github.com/nexu-io/open-design/commits/main"><img alt="Last commit" src="https://img.shields.io/github/last-commit/nexu-io/open-design?style=for-the-badge&labelColor=0d1117&color=8e44ad&logo=git&logoColor=white" /></a>
</p>

<p align="center">
  <a href="https://open-design.ai/"><img alt="下載客戶端" src="https://img.shields.io/badge/%E4%B8%8B%E8%BC%89-%E5%AE%A2%E6%88%B6%E7%AB%AF-ff6b35?style=flat-square" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square" /></a>
  <a href="#支援的-coding-agent"><img alt="Agents" src="https://img.shields.io/badge/agents-10%20CLIs%20%2B%20BYOK%20proxy-black?style=flat-square" /></a>
  <a href="#design-system"><img alt="Design systems" src="https://img.shields.io/badge/design%20systems-72-orange?style=flat-square" /></a>
  <a href="#內建-skills"><img alt="Skills" src="https://img.shields.io/badge/skills-31-teal?style=flat-square" /></a>
  <a href="https://discord.gg/qhbcCH8Am4"><img alt="Discord" src="https://img.shields.io/badge/discord-加入-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="QUICKSTART.md"><img alt="Quickstart" src="https://img.shields.io/badge/quickstart-3%20commands-green?style=flat-square" /></a>
</p>

<p align="center"><a href="README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> · <a href="README.zh-CN.md">简体中文</a> · <b>繁體中文</b> · <a href="README.ko.md">한국어</a> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ar.md">العربية</a> · <a href="README.ru.md">Русский</a> · <a href="README.uk.md">Українська</a></p>

---

## 為什麼要做這個

Anthropic 的 [Claude Design][cd]（2026-04-17 釋出，基於 Opus 4.7）讓大家第一次看到：當一個 LLM 不再寫廢話、開始直接交付設計成品，會是什麼樣子。它瞬間爆紅 —— 然後保持**閉源**、付費、只跑在雲上、綁定 Anthropic 的模型和 Anthropic 的內部 skill。沒有 checkout，沒有自託管，沒有 Vercel 部署，也換不了自己的 agent。

**Open Design（OD）就是它的開源替代品。** 同一套 loop、同一種「artifact-first」心智模型，但沒有鎖定。我們不做 agent —— 你筆記本上最強的 coding agent 已經裝好了。我們要做的，是把它接進一個 skill 驅動的設計工作流：本地用 `pnpm tools-dev` 跑完整本地閉環，雲端可單獨部署 Web 層，每一層都 BYOK（自帶 Key）。

輸入「幫我做一份雜誌風的種子輪 pitch deck」。在模型揮灑第一個畫素之前，**初始化問題表單**已經先跳出來。Agent 從 5 套精選的視覺方向裡選一個。一張動態的 `TodoWrite` 計畫卡片即時流入 UI。Daemon 在磁碟上構建出一個真實的專案目錄，裡面有 seed 模板、佈局庫、自檢 checklist。Agent **強制 pre-flight** 讀取它們，對自己的輸出跑一輪**五維評審**，幾秒後吐出一個 `<artifact>`，渲染在沙盒 iframe 裡。

這不是「AI 試圖做點設計」。這是一個被提示詞堆疊訓練得像高階設計師一樣工作的 AI —— 有可用的檔案系統、有確定性的色票庫、有 checklist 文化 —— 也就是 Claude Design 立下的那條線，只是這次它開源、歸你。

OD 站在四個開源專案的肩膀上：

- [**`alchaincyf/huashu-design`**（花叔的畫術）](https://github.com/alchaincyf/huashu-design) —— 設計哲學的指南針。Junior-Designer 工作流、5 步品牌資產協議、anti-AI-slop checklist、五維自評審、以及方向選擇器背後的「5 流派 × 20 種設計哲學」思路 —— 全部蒸餾進 [`apps/web/src/prompts/discovery.ts`](apps/web/src/prompts/discovery.ts)。
- [**`op7418/guizang-ppt-skill`**（歸藏的雜誌風 PPT skill）](https://github.com/op7418/guizang-ppt-skill) —— Deck 模式。原樣納入在 [`skills/guizang-ppt/`](skills/guizang-ppt/) 下，原 LICENSE 保留；雜誌版式、WebGL hero、P0/P1/P2 checklist。
- [**`OpenCoworkAI/open-codesign`**](https://github.com/OpenCoworkAI/open-codesign) —— UX 北極星，也是我們最接近的同類。第一個開源的 Claude-Design 替代品。我們借鑑了它的流式 artifact 迴圈、沙盒 iframe 預覽模式（自帶 React 18 + Babel）、即時 agent 面板（todos + tool calls + 可中斷生成）、5 種匯出格式列表（HTML / PDF / PPTX / ZIP / Markdown）。我們刻意在形態上做出差異化 —— 它是桌面 Electron 應用，把 [`pi-ai`][piai] 打包進去做 agent；我們是 Web 應用 + 本地 daemon，把 agent 執行時**委託**給你已經裝好的 CLI。
- [**`multica-ai/multica`**](https://github.com/multica-ai/multica) —— Daemon 與執行時架構。PATH 掃描式 agent 檢測，本地 daemon 作為唯一的特權程序，agent-as-teammate 的世界觀。

## 一眼概覽

| | 你拿到的 |
|---|---|
| **Coding-agent CLI（10 套）** | Claude Code · Codex CLI · Cursor Agent · Gemini CLI · OpenCode · Qwen Code · GitHub Copilot CLI · Hermes（ACP）· Kimi CLI（ACP）· Pi（RPC）—— 在 `PATH` 上自動檢測，picker 一鍵切換 |
| **BYOK 備援** | OpenAI 相容代理 `/api/proxy/stream` —— 填 `baseUrl` + `apiKey` + `model`，任意 vendor（Anthropic-via-OpenAI、DeepSeek、Groq、MiMo、OpenRouter、自託管 vLLM，或任何 OpenAI 相容的 provider）都能直接當引擎用。daemon 邊界拒絕 loopback / link-local / RFC1918 防 SSRF。 |
| **內建 design system** | **72 套** —— 2 套手寫起手 + 70 套從 [`awesome-design-md`][acd2] 匯入的產品系統（Linear、Stripe、Vercel、Airbnb、Tesla、Notion、Anthropic、Apple、Cursor、Supabase、Figma、小紅書…） |
| **內建 skill** | **31 個** —— 27 個 `prototype` 模式（web-prototype、saas-landing、dashboard、mobile-app、gamified-app、social-carousel、magazine-poster、dating-web、sprite-animation、motion-frames、critique、tweaks、wireframe-sketch、pm-spec、eng-runbook、finance-report、hr-onboarding、invoice、kanban-board、team-okrs…）+ 4 個 `deck` 模式（`guizang-ppt` · `simple-deck` · `replit-deck` · `weekly-update`）。Picker 按 `scenario` 分組：design / marketing / operation / engineering / product / finance / hr / sale / personal。 |
| **視覺方向** | 5 套精選流派（Editorial Monocle · Modern Minimal · Warm Soft · Tech Utility · Brutalist Experimental），每套自帶 OKLch 色票 + 字型堆疊（[`apps/web/src/prompts/directions.ts`](apps/web/src/prompts/directions.ts)） |
| **裝置外殼** | iPhone 15 Pro · Pixel · iPad Pro · MacBook · Browser Chrome —— 畫素級精確，跨 skill 共享，統一在 [`assets/frames/`](assets/frames/) |
| **Agent 執行時** | 本地 daemon 在你的專案目錄裡 spawn CLI —— agent 擁有真實的 `Read` / `Write` / `Bash` / `WebFetch`，作用在真實磁碟上；每個 adapter 都有 Windows `ENAMETOOLONG` 備援（stdin / 臨時 prompt 檔案） |
| **匯入** | 把 [Claude Design][cd] 匯出的 ZIP 直接拖到歡迎彈窗 —— `POST /api/import/claude-design` 解壓成真實專案，agent 接著 Anthropic 停下的地方繼續編輯，不用再向模型重述上下文 |
| **持久化** | SQLite 在 `.od/app.sqlite`：projects · conversations · messages · tabs · 使用者 templates。明天再開，todo 卡片和開啟的檔案都還在原位。 |
| **生命週期** | 唯一入口 `pnpm tools-dev`（start / stop / run / status / logs / inspect / check）—— 用型別化 sidecar stamp 啟動 daemon + web（+ desktop） |
| **桌面版** | 可選 Electron 殼：渲染器 sandbox + sidecar IPC（STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN）—— 同一通道驅動 `tools-dev inspect desktop screenshot`，跑 E2E |
| **部署目標** | 本地 `pnpm tools-dev` · Vercel Web 層 · 打包好的 Electron 桌面端，支援 macOS（Apple Silicon）和 Windows（x64）—— 從 [open-design.ai](https://open-design.ai/) 或 [最新 release](https://github.com/nexu-io/open-design/releases) 直接下載 |
| **License** | Apache-2.0 |

[acd2]: https://github.com/VoltAgent/awesome-design-md

## 效果展示

<table>
<tr>
<td width="50%">
<img src="docs/screenshots/01-entry-view.png" alt="01 · 入口頁" /><br/>
<sub><b>入口頁</b> —— 選 skill、選 design system、寫一行需求。同一個表面服務原型、deck、行動版、dashboard、editorial 頁面所有 mode。</sub>
</td>
<td width="50%">
<img src="docs/screenshots/02-question-form.png" alt="02 · 初始化問題表單" /><br/>
<sub><b>初始化問題表單</b> —— 模型動筆之前，OD 先把需求鎖住：surface、受眾、調性、品牌上下文、規模。30 秒勾選項秒殺 30 分鐘來回返工。</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/03-direction-picker.png" alt="03 · 方向選擇器" /><br/>
<sub><b>方向選擇器</b> —— 使用者沒有品牌上下文時，agent 自動跳第二個表單，5 套精選方向（Monocle / Modern Minimal / Tech Utility / Brutalist / Soft Warm）一個 radio 選完，色票 + 字型堆疊直接鎖定，沒有 freestyle 空間。</sub>
</td>
<td width="50%">
<img src="docs/screenshots/04-todo-progress.png" alt="04 · 即時 todo 進度" /><br/>
<sub><b>即時 todo 進度</b> —— Agent 的計畫以即時卡片形式流入 UI。<code>in_progress</code> → <code>completed</code> 即時切換。使用者能在中途以極低成本介入修正。</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/05-preview-iframe.png" alt="05 · 沙盒預覽" /><br/>
<sub><b>沙盒預覽</b> —— 每個 <code>&lt;artifact&gt;</code> 都在乾淨的 srcdoc iframe 裡渲染。可在檔案工作區裡就地編輯；可下載為 HTML / PDF / ZIP。</sub>
</td>
<td width="50%">
<img src="docs/screenshots/06-design-systems-library.png" alt="06 · 72 套 design system 庫" /><br/>
<sub><b>72 套 design system 庫</b> —— 每套產品系統都展示 4 色色卡。點進去看完整的 <code>DESIGN.md</code>、色票網格、live showcase。</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/07-magazine-deck.png" alt="07 · 雜誌風 deck" /><br/>
<sub><b>Deck 模式（guizang-ppt）</b> —— 內建的 <a href="https://github.com/op7418/guizang-ppt-skill"><code>guizang-ppt-skill</code></a> 原樣接入。雜誌版式、WebGL hero 背景、單檔案 HTML 輸出、可導 PDF。</sub>
</td>
<td width="50%">
<img src="docs/screenshots/08-mobile-app.png" alt="08 · 行動版原型" /><br/>
<sub><b>行動版原型</b> —— 畫素級精確的 iPhone 15 Pro chrome（靈動島、狀態列 SVG、Home Indicator）。多螢幕原型直接複用 <code>/frames/</code> 共享資源，agent 永遠不需要重新畫一遍手機。</sub>
</td>
</tr>
</table>

## 內建 Skills

**31 個 skill，每個一個資料夾**，都遵循 Claude Code 的 [`SKILL.md`][skill] 規範，併疊加 OD 的 `od:` frontmatter，daemon 原樣解析 —— `mode`、`platform`、`scenario`、`preview.type`、`design_system.requires`、`default_for`、`featured`、`fidelity`、`speaker_notes`、`animations`、`example_prompt`（[`apps/daemon/src/skills.ts`](apps/daemon/src/skills.ts)）。

兩種頂層 **mode** 撐起整個目錄：**`prototype`**（27 個 —— 任何能被渲染成單頁 artifact 的產物，從雜誌風 landing 到手機螢幕到 PM 規格文件都算）和 **`deck`**（4 個 —— 橫滑式演示，自帶 deck framework 框架）。**`scenario`** 是 picker 用來分組的欄位：`design` · `marketing` · `operation` · `engineering` · `product` · `finance` · `hr` · `sale` · `personal`。

### 示例展示（Showcase examples）

視覺表現最強、最適合入門第一跑的幾條 skill。每條都附帶可直接開啟的 `example.html` —— 不用登入、不用配置，先看產出再動手。

<table>
<tr>
<td width="50%" valign="top">
<a href="skills/dating-web/"><img src="docs/screenshots/skills/dating-web.png" alt="dating-web" /></a><br/>
<sub><b><a href="skills/dating-web/"><code>dating-web</code></a></b> · <i>prototype</i><br/>消費級約會 / 婚戀儀表盤 —— 左側欄、社群動態 ticker、頭部 KPI、30 天雙向匹配柱狀圖，editorial 字型，剋制點綴色。</sub>
</td>
<td width="50%" valign="top">
<a href="skills/digital-eguide/"><img src="docs/screenshots/skills/digital-eguide.png" alt="digital-eguide" /></a><br/>
<sub><b><a href="skills/digital-eguide/"><code>digital-eguide</code></a></b> · <i>template</i><br/>兩頁數字 e-guide —— 封面（標題、作者、TOC 預告）+ 內文跨頁（pull-quote + 步驟列表），創作者 / 生活方式風。</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/email-marketing/"><img src="docs/screenshots/skills/email-marketing.png" alt="email-marketing" /></a><br/>
<sub><b><a href="skills/email-marketing/"><code>email-marketing</code></a></b> · <i>prototype</i><br/>品牌新品釋出郵件 —— 頂部 wordmark、hero 圖、標題鎖排、主 CTA、規格網格。居中單列 + 表格降級，郵件客戶端安全。</sub>
</td>
<td width="50%" valign="top">
<a href="skills/gamified-app/"><img src="docs/screenshots/skills/gamified-app.png" alt="gamified-app" /></a><br/>
<sub><b><a href="skills/gamified-app/"><code>gamified-app</code></a></b> · <i>prototype</i><br/>三螢幕遊戲化移動 app 原型，黑色舞臺 —— 封面 / 今日任務（XP 緞帶 + 等級條）/ 任務詳情。</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/mobile-onboarding/"><img src="docs/screenshots/skills/mobile-onboarding.png" alt="mobile-onboarding" /></a><br/>
<sub><b><a href="skills/mobile-onboarding/"><code>mobile-onboarding</code></a></b> · <i>prototype</i><br/>三螢幕行動版引導流 —— splash、價值主張、登入。狀態列、滑動點、主 CTA。</sub>
</td>
<td width="50%" valign="top">
<a href="skills/motion-frames/"><img src="docs/screenshots/skills/motion-frames.png" alt="motion-frames" /></a><br/>
<sub><b><a href="skills/motion-frames/"><code>motion-frames</code></a></b> · <i>prototype</i><br/>單幀 motion 設計 hero，CSS 迴圈動畫 —— 旋轉字環、地球、計時器。可直接交給 HyperFrames 等關鍵幀匯出。</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/social-carousel/"><img src="docs/screenshots/skills/social-carousel.png" alt="social-carousel" /></a><br/>
<sub><b><a href="skills/social-carousel/"><code>social-carousel</code></a></b> · <i>prototype</i><br/>1080×1080 三連社媒輪播圖 —— 三張電影感面板，標題前後呼應，品牌標識、loop 標記。</sub>
</td>
<td width="50%" valign="top">
<a href="skills/sprite-animation/"><img src="docs/screenshots/skills/sprite-animation.png" alt="sprite-animation" /></a><br/>
<sub><b><a href="skills/sprite-animation/"><code>sprite-animation</code></a></b> · <i>prototype</i><br/>畫素 / 8-bit 動畫直譯器單幀 —— 米白通螢幕、畫素吉祥物、動感日文標題、迴圈 CSS keyframes，可直接錄螢幕成豎版影片。</sub>
</td>
</tr>
</table>

### 設計與營銷類（prototype 模式）

| Skill | 平臺 | 場景 | 產出 |
|---|---|---|---|
| [`web-prototype`](skills/web-prototype/) | 桌面 | design | 單頁 HTML —— landing、營銷、hero（prototype 預設） |
| [`saas-landing`](skills/saas-landing/) | 桌面 | marketing | hero / features / pricing / CTA 營銷版式 |
| [`dashboard`](skills/dashboard/) | 桌面 | operation | 帶側欄 + 資料密集型的後臺 |
| [`pricing-page`](skills/pricing-page/) | 桌面 | sale | 獨立定價頁 + 對比表 |
| [`docs-page`](skills/docs-page/) | 桌面 | engineering | 三欄文件版式 |
| [`blog-post`](skills/blog-post/) | 桌面 | marketing | 長文 editorial |
| [`mobile-app`](skills/mobile-app/) | 移動 | design | 帶 iPhone 15 Pro / Pixel 外殼的 app 螢幕 |
| [`mobile-onboarding`](skills/mobile-onboarding/) | 移動 | design | 多螢幕行動版引導流（splash · 價值主張 · 登入） |
| [`gamified-app`](skills/gamified-app/) | 移動 | personal | 三螢幕遊戲化 app 原型 |
| [`email-marketing`](skills/email-marketing/) | 桌面 | marketing | 品牌新品釋出郵件（表格降級郵件客戶端安全） |
| [`social-carousel`](skills/social-carousel/) | 桌面 | marketing | 1080×1080 三連社媒輪播 |
| [`magazine-poster`](skills/magazine-poster/) | 桌面 | marketing | 單頁雜誌風海報 |
| [`motion-frames`](skills/motion-frames/) | 桌面 | marketing | CSS 迴圈動畫的 motion hero |
| [`sprite-animation`](skills/sprite-animation/) | 桌面 | marketing | 畫素 / 8-bit 動畫直譯器 |
| [`dating-web`](skills/dating-web/) | 桌面 | personal | 消費級約會 / 婚戀儀表盤 |
| [`digital-eguide`](skills/digital-eguide/) | 桌面 | marketing | 兩頁數字 e-guide（封面 + 內文跨頁） |
| [`wireframe-sketch`](skills/wireframe-sketch/) | 桌面 | design | 手繪風線框稿 —— 服務於 "先把灰塊拼出來給使用者看" 的早期回合 |
| [`critique`](skills/critique/) | 桌面 | design | 五維自評分卡（Philosophy · Hierarchy · Detail · Function · Innovation） |
| [`tweaks`](skills/tweaks/) | 桌面 | design | AI 自吐 tweaks 面板 —— 模型自己丟擲值得調的引數 |

### Deck 類（deck 模式）

| Skill | 預設 | 產出 |
|---|---|---|
| [`guizang-ppt`](skills/guizang-ppt/) | **deck 預設** | 雜誌風網頁 PPT —— 來自 [op7418/guizang-ppt-skill][guizang]，原 LICENSE 保留 |
| [`simple-deck`](skills/simple-deck/) | — | 極簡橫滑 deck |
| [`replit-deck`](skills/replit-deck/) | — | 產品演示 deck（Replit 風） |
| [`weekly-update`](skills/weekly-update/) | — | 團隊週報橫滑 deck（進度 · 阻塞 · 下一步） |

### 文件與辦公產物類（prototype 模式 + 文件場景）

| Skill | Scenario | 產出 |
|---|---|---|
| [`pm-spec`](skills/pm-spec/) | product | PM 規格文件 + 目錄 + 決策日誌 |
| [`team-okrs`](skills/team-okrs/) | product | OKR 計分表 |
| [`meeting-notes`](skills/meeting-notes/) | operation | 會議決策紀要 |
| [`kanban-board`](skills/kanban-board/) | operation | 看板快照 |
| [`eng-runbook`](skills/eng-runbook/) | engineering | 故障 runbook |
| [`finance-report`](skills/finance-report/) | finance | 高管財務摘要 |
| [`invoice`](skills/invoice/) | finance | 單頁發票 |
| [`hr-onboarding`](skills/hr-onboarding/) | hr | 崗位入職計畫 |

新增一個 skill 就是新增一個資料夾。讀 [`docs/skills-protocol.md`](docs/skills-protocol.md) 瞭解擴充套件 frontmatter，fork 一個現有 skill，重啟 daemon 即生效。目錄拉取走 `GET /api/skills`；單個 skill 的種子拼裝（template + 邊角檔案 references）走 `GET /api/skills/:id/example`。

## 六個底層設計

### 1 · 我們不帶 agent，你的就夠好

Daemon 啟動時掃 `PATH`，找 [`claude`](https://docs.anthropic.com/en/docs/claude-code)、[`codex`](https://github.com/openai/codex)、[`cursor-agent`](https://www.cursor.com/cli)、[`gemini`](https://github.com/google-gemini/gemini-cli)、[`opencode`](https://opencode.ai/)、[`qwen`](https://github.com/QwenLM/qwen-code)、[`copilot`](https://github.com/features/copilot/cli)、`hermes`、`kimi` 和 [`pi`](https://github.com/mariozechner/pi-ai)。能找到的都成為候選設計引擎 —— 走 stdio，每個 CLI 一個 adapter，model picker 一鍵切換。靈感來自 [`multica`](https://github.com/multica-ai/multica) 和 [`cc-switch`](https://github.com/farion1231/cc-switch)。一個 CLI 都沒裝？`POST /api/proxy/stream` 就是同一條管線減去 spawn —— 填任意 OpenAI 相容 `baseUrl` + `apiKey`，daemon 把 SSE 轉發回瀏覽器，loopback / link-local / RFC1918 在邊界直接拒絕。

### 2 · Skill 是檔案，不是外掛

遵循 Claude Code [`SKILL.md` 規範](https://docs.anthropic.com/en/docs/claude-code/skills)，每個 skill = `SKILL.md` + `assets/` + `references/`。把一個資料夾丟進 [`skills/`](skills/)，重啟 daemon，picker 裡就能看到。內建的 `magazine-web-ppt` 就是 [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) **原樣**納入 —— 原 LICENSE 保留、原作者歸屬保留。

### 3 · Design System 是可移植的 Markdown，不是 theme JSON

[`VoltAgent/awesome-design-md`][acd2] 的 9 段式 `DESIGN.md` —— color、typography、spacing、layout、components、motion、voice、brand、anti-patterns。每個 artifact 都從啟用的 system 裡讀 token。切換 system → 下一次渲染就用新的 token。下拉框裡現成的有：**Linear、Stripe、Vercel、Airbnb、Tesla、Notion、Apple、Anthropic、Cursor、Supabase、Figma、Resend、Raycast、Lovable、Cohere、Mistral、ElevenLabs、X.AI、Spotify、Webflow、Sanity、PostHog、Sentry、MongoDB、ClickHouse、Cal、Replicate、Clay、Composio、小紅書…** 共 72 套。

### 4 · 初始化問題表單幹掉 80% 的來回返工

OD 的提示詞堆疊把 `RULE 1` 寫死了：每個新設計任務都從 `<question-form id="discovery">` 開始，**不是程式碼**。Surface · 受眾 · 調性 · 品牌上下文 · 規模 · 約束。一段寫得很長的需求裡仍然有大量留白：視覺調性、色彩立場、規模 —— 而表單恰恰把這些用 30 秒勾選項鎖死。錯方向的代價是一輪對話，不是一份做完的 deck。

這就是從 [`huashu-design`](https://github.com/alchaincyf/huashu-design) 蒸餾出來的 **Junior-Designer 模式**：開工前一次性批次問完，儘早 show 出一些可見的東西（哪怕只是灰色方塊的 wireframe），讓使用者用最低成本介入修正。再疊加品牌資產協議（定位 · 下載 · `grep` hex · 寫 `brand-spec.md` · 複述），這是輸出從「AI freestyle」跳到「先看資料再畫圖的設計師」最關鍵的一步。

### 5 · Daemon 讓 agent 感覺自己就在你筆記本上 —— 因為它就是

Daemon `spawn` CLI 時，`cwd` 設到該專案在 `.od/projects/<id>/` 下的 artifact 資料夾。Agent 拿到的 `Read` / `Write` / `Bash` / `WebFetch` 都是真工具，作用在真檔案系統上。它能 `Read` skill 的 `assets/template.html`，能 `grep` 你的 CSS 拿 hex，能寫一份 `brand-spec.md`，能實作生成的圖片，能產出 `.pptx` / `.zip` / `.pdf` —— 這些檔案在 turn 結束的時候作為下載 chip 出現在檔案工作區裡。Session、對話、訊息、tab 都持久化在本地 SQLite 裡 —— 明天再開啟這個專案，agent 的 todo 卡片還在你昨天停下的地方。

### 6 · 提示詞堆疊本身就是產品

傳送時拼裝的不是「system + user」。它是：

```
DISCOVERY 指令         （turn-1 表單、turn-2 品牌分支、TodoWrite、五維評審）
  + 身份與工作流憲章   （OFFICIAL_DESIGNER_PROMPT、anti-AI-slop、Junior Designer 模式）
  + 啟用的 DESIGN.md   （72 套備選）
  + 啟用的 SKILL.md    （31 套備選）
  + 專案後設資料          （kind、fidelity、speakerNotes、animations、靈感 system id）
  + Skill 副檔案       （自動注入 pre-flight：先讀 assets/template.html + references/*.md）
  + （deck kind 且無 skill 種子時） DECK_FRAMEWORK_DIRECTIVE   （nav / counter / scroll / print）
```

每一層都可組合。每一層都是一個你能改的檔案。看 [`apps/web/src/prompts/system.ts`](apps/web/src/prompts/system.ts) 和 [`apps/web/src/prompts/discovery.ts`](apps/web/src/prompts/discovery.ts) 就知道真實契約長什麼樣。

## 技術架構

```
┌─────────────── 瀏覽器（Next.js 16）─────────────────────────────┐
│  chat · 檔案工作區 · iframe 預覽 · 設定 · 匯入                  │
└──────────────┬─────────────────────────────────┬───────────────┘
               │ /api/*（dev 走 rewrites）        │
               ▼                                  ▼
   ┌─────────────────────────────────┐  /api/proxy/stream (SSE)
   │  本地 daemon（Express + SQLite）│  ─→ 任意 OpenAI 相容
   │                                 │      端點（BYOK）
   │  /api/agents         /api/skills│      含 SSRF 防禦
   │  /api/design-systems /api/projects/…
   │  /api/chat (SSE)     /api/proxy/stream (SSE)
   │  /api/templates      /api/import/claude-design
   │  /api/artifacts/save /api/artifacts/lint
   │  /api/upload         /api/projects/:id/files…
   │  /artifacts (靜態)   /frames (靜態)
   │
   │  可選 sidecar IPC：/tmp/open-design/ipc/<ns>/<app>.sock
   │  （STATUS · EVAL · SCREENSHOT · CONSOLE · CLICK · SHUTDOWN）
   └─────────┬───────────────────────┘
             │ spawn(cli, [...], { cwd: .od/projects/<id> })
             ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  claude · codex · gemini · opencode · cursor-agent · qwen        │
   │  copilot · hermes (ACP) · kimi (ACP) · pi (RPC)                  │
   │  讀 SKILL.md + DESIGN.md，把 artifact 寫到磁碟                   │
   └──────────────────────────────────────────────────────────────────┘
```

| 層 | 技術堆疊 |
|---|---|
| 前端 | Next.js 16 App Router + React 18 + TypeScript，可部署到 Vercel |
| Daemon | Node 24 · Express · SSE 流 · `better-sqlite3`；表：`projects` · `conversations` · `messages` · `tabs` · `templates` |
| Agent 傳輸層 | `child_process.spawn`，Claude Code 走 `claude-stream-json`、Copilot 走 `copilot-stream-json`、Codex / Gemini / OpenCode / Cursor Agent 走 `json-event-stream`（每個 CLI 一個 parser）、Hermes / Kimi 走 `acp-json-rpc`（Agent Client Protocol）、Pi 走 `pi-rpc`（stdio JSON-RPC）、Qwen Code 走 `plain` |
| BYOK 代理 | `POST /api/proxy/stream` → OpenAI 相容 `/v1/chat/completions` 透傳 SSE；daemon 邊界拒絕 loopback / link-local / RFC1918 |
| 儲存 | 純檔案 `.od/projects/<id>/` + SQLite `.od/app.sqlite`（已 gitignore，daemon 啟動自建）。`OD_DATA_DIR` 可改根目錄用於測試隔離 |
| 預覽 | 沙盒 iframe（`srcdoc`）+ 每個 skill 的 `<artifact>` parser（[`apps/web/src/artifacts/parser.ts`](apps/web/src/artifacts/parser.ts)） |
| 匯出 | HTML（內聯資源）· PDF（瀏覽器列印，deck-aware）· PPTX（agent 驅動經由 skill）· ZIP（archiver）· Markdown |
| 生命週期 | `pnpm tools-dev start \| stop \| run \| status \| logs \| inspect \| check`；埠走 `--daemon-port` / `--web-port`，名稱空間走 `--namespace` |
| 桌面版（可選） | Electron 殼 —— 透過 sidecar IPC 拿 web URL，不猜埠；同一通道（`STATUS`/`EVAL`/`SCREENSHOT`/`CONSOLE`/`CLICK`/`SHUTDOWN`）驅動 `tools-dev inspect desktop …` 跑 E2E |

## Quickstart

### 下載桌面端（不需建置）

試用 Open Design 最快的方式是直接下載預編譯的桌面端 —— 不用裝 Node、不用 pnpm、不用 clone：

- **[open-design.ai](https://open-design.ai/)** —— 官方下載頁
- **[GitHub releases](https://github.com/nexu-io/open-design/releases)**

### 從原始碼執行

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable
corepack pnpm --version   # 應輸出 10.33.2
pnpm install
pnpm tools-dev run web
# 開啟 tools-dev 輸出的 web URL
```

環境要求：Node `~24`，pnpm `10.33.x`。`nvm` / `fnm` 只是可選輔助工具，不是專案必需步驟；如果使用它們，先執行 `nvm install 24 && nvm use 24` 或 `fnm install 24 && fnm use 24`，再執行 `pnpm install`。

桌面版/後臺啟動、固定埠重啟，以及 media 生成派發器檢查（`OD_BIN`、`OD_DAEMON_URL`、`apps/daemon/dist/cli.js`）見 [`QUICKSTART.md`](QUICKSTART.md)。

第一次載入會：

1. 檢測你 `PATH` 上有哪些 agent CLI，自動選一個。
2. 載入 31 個 skill + 72 套 design system。
3. 彈歡迎對話方塊，讓你貼 Anthropic key（僅 BYOK 備援路徑需要）。
4. **自動建立 `./.od/`** —— 本地執行時目錄，存放 SQLite 專案庫、各專案工作區、儲存下來的 artifact。**沒有** `od init` 這一步，daemon 啟動時會自己 `mkdir`。

輸入需求，回車，看 question form 跳出來，填，看 todo 卡片流動，看 artifact 渲染。點 **Save to disk** 或匯出整個專案 ZIP。

### 第一次跑起來（`./.od/` 解釋）

Daemon 在倉庫根下維護一個隱藏目錄，裡面所有內容都已 gitignore，純本機資料，**不要** commit。

```
.od/
├── app.sqlite                 ← 專案 · 對話 · 訊息 · 開啟的 tab
├── artifacts/                 ← Save to disk 一次性渲染（帶時間戳）
└── projects/<id>/             ← 每個專案的工作目錄，也是 agent 的 cwd
```

| 想做什麼 | 怎麼做 |
|---|---|
| 看一眼裡面有啥 | `ls -la .od && sqlite3 .od/app.sqlite '.tables'` |
| 完全清空，從零再來 | `pnpm tools-dev stop`，再 `rm -rf .od`，然後重新 `pnpm tools-dev run web` |
| 換到別的位置 | 暫不支援 —— 路徑是相對倉庫根寫死的 |

完整檔案地圖、指令碼、排錯 → [`QUICKSTART.md`](QUICKSTART.md)。

## 倉庫結構

```
open-design/
├── README.md                      ← 英文
├── README.de.md                   ← Deutsch
├── README.zh-CN.md                ← 简体中文
├── README.zh-TW.md                ← 本檔案
├── QUICKSTART.md                  ← 跑 / 構建 / 部署
├── package.json                   ← 單 bin: od
│
├── apps/
│   ├── daemon/                    ← Node + Express，唯一的服務端
│   │   ├── src/                   ← TypeScript daemon 原始碼
│   │   │   ├── cli.ts             ← `od` bin 原始碼，編譯到 dist/cli.js
│   │   │   ├── server.ts          ← /api/* 路由（projects、chat、files、exports）
│   │   │   ├── agents.ts          ← PATH 掃描器 + 各 CLI 的 argv 拼裝
│   │   │   ├── claude-stream.ts   ← Claude Code stdout 流式 JSON 解析
│   │   │   ├── skills.ts          ← SKILL.md frontmatter 載入器
│   │   │   └── db.ts              ← SQLite schema（projects/messages/templates/tabs）
│   │   ├── sidecar/               ← tools-dev daemon sidecar wrapper
│   │   └── tests/                 ← daemon 包測試
│   │
│   └── web/                       ← Next.js 16 App Router + React 客戶端
│       ├── app/                   ← App Router 入口
│       ├── next.config.ts         ← dev rewrites + 生產 out/ 靜態匯出
│       └── src/                   ← React + TS 客戶端模組
│           ├── App.tsx            ← 路由、bootstrap、設定
│           ├── components/        ← chat、composer、picker、preview、sketch…
│           ├── prompts/           ← system、discovery、directions、deck framework
│           ├── artifacts/         ← streaming <artifact> parser + manifest
│           ├── runtime/           ← iframe srcdoc、markdown、匯出輔助
│           ├── providers/         ← daemon SSE + BYOK API 傳輸
│           └── state/             ← localStorage + daemon-backed 專案狀態
│
├── e2e/                           ← Playwright UI + 外部整合/Vitest harness
│
├── packages/
│   ├── contracts/                 ← web/daemon 共享 app contracts
│   ├── sidecar-proto/             ← Open Design sidecar protocol contract
│   ├── sidecar/                   ← 通用 sidecar runtime primitives
│   └── platform/                  ← 通用 process/platform primitives
│
├── skills/                        ← 31 個 SKILL.md skill 包（27 prototype + 4 deck）
│   ├── web-prototype/             ← prototype 預設
│   ├── saas-landing/  dashboard/  pricing-page/  docs-page/  blog-post/
│   ├── mobile-app/  mobile-onboarding/  gamified-app/
│   ├── email-marketing/  social-carousel/  magazine-poster/
│   ├── motion-frames/  sprite-animation/  digital-eguide/  dating-web/
│   ├── critique/  tweaks/  wireframe-sketch/
│   ├── pm-spec/  team-okrs/  meeting-notes/  kanban-board/
│   ├── eng-runbook/  finance-report/  invoice/  hr-onboarding/
│   ├── simple-deck/  replit-deck/  weekly-update/   ← deck 模式
│   └── guizang-ppt/               ← 內建 magazine-web-ppt（deck 預設）
│       ├── SKILL.md
│       ├── assets/template.html   ← seed
│       └── references/{themes,layouts,components,checklist}.md
│
├── design-systems/                ← 72 套 DESIGN.md
│   ├── default/                   ← Neutral Modern（起手）
│   ├── warm-editorial/            ← Warm Editorial（起手）
│   ├── linear-app/  vercel/  stripe/  airbnb/  notion/  cursor/  apple/  …
│   └── README.md
│
├── assets/
│   └── frames/                    ← 跨 skill 共享裝置外殼
│       ├── iphone-15-pro.html
│       ├── android-pixel.html
│       ├── ipad-pro.html
│       ├── macbook.html
│       └── browser-chrome.html
│
├── templates/
│   └── deck-framework.html        ← deck 基線（nav / counter / print）
│
├── scripts/
│   └── sync-design-systems.ts     ← 從上游 awesome-design-md tarball 重新匯入
│
├── docs/
│   ├── spec.md                    ← 產品定義、場景、差異化
│   ├── architecture.md            ← 拓撲、資料流、元件
│   ├── skills-protocol.md         ← 擴充套件 SKILL.md 的 od: frontmatter
│   ├── agent-adapters.md          ← 各 CLI 檢測 + 派發
│   ├── modes.md                   ← prototype / deck / template / design-system
│   ├── references.md              ← 詳盡的引用與師承
│   ├── roadmap.md                 ← 分階段交付
│   ├── schemas/                   ← JSON schema
│   └── examples/                  ← 標準 artifact 樣例
│
└── .od/                           ← 執行時資料，已 gitignore，daemon 啟動自建
    ├── app.sqlite                 ← 專案 / 對話 / 訊息 / tab
    ├── projects/<id>/             ← 每個專案的工作目錄（agent 的 cwd）
    └── artifacts/                 ← 單次儲存的 artifact
```

## Design System

<p align="center">
  <img src="docs/assets/design-systems-library.png" alt="72 套 Design Systems 庫 — 編輯版式雙頁" width="100%" />
</p>

72 套開箱即用，每套一個 [`DESIGN.md`](design-systems/README.md)：

<details>
<summary><b>完整目錄</b>（點選展開）</summary>

**AI & LLM** —— `claude` · `cohere` · `mistral-ai` · `minimax` · `together-ai` · `replicate` · `runwayml` · `elevenlabs` · `ollama` · `x-ai`

**開發者工具** —— `cursor` · `vercel` · `linear-app` · `framer` · `expo` · `clickhouse` · `mongodb` · `supabase` · `hashicorp` · `posthog` · `sentry` · `warp` · `webflow` · `sanity` · `mintlify` · `lovable` · `composio` · `opencode-ai` · `voltagent`

**生產力** —— `notion` · `figma` · `miro` · `airtable` · `superhuman` · `intercom` · `zapier` · `cal` · `clay` · `raycast`

**金融科技** —— `stripe` · `coinbase` · `binance` · `kraken` · `mastercard` · `revolut` · `wise`

**電商 / 出行** —— `shopify` · `airbnb` · `uber` · `nike` · `starbucks` · `pinterest`

**媒體** —— `spotify` · `playstation` · `wired` · `theverge` · `meta`

**汽車** —— `tesla` · `bmw` · `ferrari` · `lamborghini` · `bugatti` · `renault`

**其他** —— `apple` · `ibm` · `nvidia` · `vodafone` · `sentry` · `resend` · `spacex`

**起手** —— `default`（Neutral Modern）· `warm-editorial`

</details>

整個庫透過 [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts) 從 [`VoltAgent/awesome-design-md`][acd2] 匯入。重新執行即可重新整理。

## 視覺方向

當用戶沒有品牌資產時，agent 會跳第二個表單，5 套精選方向 —— 這是 [`huashu-design` 的「設計方向顧問 · 5 流派 × 20 種設計哲學」 fallback](https://github.com/alchaincyf/huashu-design#%E8%AE%BE%E8%AE%A1%E6%96%B9%E5%90%91%E9%A1%BE%E9%97%AE-fallback) 在 OD 裡的實作。每一套都是確定性 spec —— OKLch 色票、字型堆疊、版式姿態、參考列表 —— agent 直接把它**原樣**綁進 seed 模板的 `:root`。一個 radio 選完，整套視覺系統全部鎖定。零 freestyle，零 AI slop。

| 方向 | 調性 | 參考 |
|---|---|---|
| Editorial — Monocle / FT | 印刷雜誌，墨水 + 米色紙 + 暖紅強調 | Monocle · FT Weekend · NYT Magazine |
| Modern minimal — Linear / Vercel | 冷調、結構化、剋制強調 | Linear · Vercel · Stripe |
| Tech utility | 資訊密度、等寬、終端感 | Bloomberg · Bauhaus 工具 |
| Brutalist | 粗糲、巨字、無陰影、刺眼強調 | Bloomberg Businessweek · Achtung |
| Soft warm | 大方、低對比、桃色中性 | Notion 營銷頁 · Apple Health |

完整 spec → [`apps/web/src/prompts/directions.ts`](apps/web/src/prompts/directions.ts)。

## 聊天迴圈之外，還交付了什麼

Chat / artifact 迴圈最顯眼，但這套倉庫裡還有幾個能力被埋得有點深，對照其它產品做選型之前值得先掃一遍：

- **Claude Design ZIP 匯入。** 把 claude.ai 匯出的 ZIP 拖到歡迎彈窗，`POST /api/import/claude-design` 把它解壓成真實 `.od/projects/<id>/`，把入口檔案作為 tab 開啟，並預置一句「接著 Anthropic 停下的地方繼續編輯」給本地 agent。不用再讓模型重述上下文，也不用「讓模型重新畫一遍」。([`apps/daemon/src/server.ts`](apps/daemon/src/server.ts) — `/api/import/claude-design`)
- **OpenAI 相容 BYOK 代理。** `POST /api/proxy/stream` 接收 `{ baseUrl, apiKey, model, messages }`，自動歸一化路徑（`…/v1/chat/completions`），把 SSE chunk 轉發回瀏覽器；同時拒絕 loopback / link-local / RFC1918 防 SSRF。任何說 OpenAI chat schema 的 vendor 都能直接用 —— Anthropic-via-OpenAI shim、DeepSeek、Groq、MiMo、OpenRouter、自託管 vLLM 都行。MiMo 會自動加 `tool_choice: 'none'`，因為它的 tool schema 和 free-form 生成不太合得來。
- **使用者自存 templates。** 喜歡某次渲染？`POST /api/templates` 把 HTML + 後設資料快照進 SQLite `templates` 表。下個專案的 picker 裡多一行「你的模板」 —— 跟內建 31 套同一個挑選面，但是你的。
- **Tab 持久化。** 每個專案記得自己開啟的檔案和當前 tab，存在 `tabs` 表裡。明天再開啟，工作區還是你昨天離開時的樣子。
- **Artifact lint API。** `POST /api/artifacts/lint` 對生成的 artifact 跑結構性檢查（`<artifact>` 框架是否破損、必需的副檔案是否缺失、palette token 是否過期），返回 agent 下一回合可以讀回去的 findings。五維自評審就是用它把分數落到證據上而不是 vibe。
- **Sidecar 協議 + 桌面版自動化。** Daemon、web、desktop 程序都帶型別化的 5 欄位 stamp（`app · mode · namespace · ipc · source`），並把 JSON-RPC IPC 通道暴露在 `/tmp/open-design/ipc/<namespace>/<app>.sock`。`tools-dev inspect desktop status \| eval \| screenshot` 就跑在這條通道上，所以 headless E2E 直接打到真實 Electron 殼，不用造定製夾具（[`packages/sidecar-proto/`](packages/sidecar-proto/)、[`apps/desktop/src/main/`](apps/desktop/src/main/)）。
- **Windows 友好的 spawn。** 任何在長 prompt 上會撞 `CreateProcess` 32 KB argv 上限的 adapter（Codex、Gemini、OpenCode、Cursor Agent、Qwen、Pi）都改走 stdin。Claude Code 和 Copilot 保留 `-p`；連 stdin 都裝不下時 daemon 退回臨時 prompt 檔案。
- **按 namespace 隔離的 runtime data。** `OD_DATA_DIR` 加 `--namespace` 給你完全隔離的 `.od/`-style 目錄樹，Playwright、beta channel、你正經的專案永遠不會共用同一個 SQLite 檔案。

## 反 AI Slop 機制

下面整套機制都是 [`huashu-design`](https://github.com/alchaincyf/huashu-design) 的 playbook，被移植進 OD 的提示詞堆疊，並透過 skill 副檔案 pre-flight 讓每個 skill 都能實作執行。看 [`apps/web/src/prompts/discovery.ts`](apps/web/src/prompts/discovery.ts) 是真實文案：

- **先表單。** Turn 1 必須是 `<question-form>`，**不準** thinking、不準 tools、不準旁白。使用者用 radio 速度選預設。
- **品牌資產協議。** 使用者貼截圖或 URL 時，agent 走 5 步流程（定位 · 下載 · grep hex · 寫 `brand-spec.md` · 複述）才能開始寫 CSS。**絕不從記憶裡猜品牌色**。
- **五維評審。** 在吐 `<artifact>` 之前，agent 默默給自己 1–5 分打分，五個維度：哲學 / 層級 / 執行 / 具體度 / 剋制。任一維 < 3/5 視為退步 —— 修完再評。兩輪是常態。
- **P0/P1/P2 checklist。** 每個 skill 都自帶 `references/checklist.md`，含硬性 P0。Agent 必須 P0 全過才能 emit。
- **Slop 黑名單。** 暴力紫漸變、通用 emoji 圖示、左 border 圓角卡片、手繪 SVG 真人臉、Inter 當 *display* 字型、自編指標 —— 提示詞裡全部明令禁止。
- **誠實佔位 > 假資料。** Agent 沒真數字時寫 `—` 或一個標註的灰塊，絕不寫「快 10 倍」。

## 橫向對比

| 維度 | [Claude Design][cd]（Anthropic） | [Open CoDesign][ocod] | **Open Design** |
|---|---|---|---|
| License | 閉源 | MIT | **Apache-2.0** |
| 形態 | Web (claude.ai) | 桌面 (Electron) | **Web 應用 + 本地 daemon** |
| 可部署 Vercel | ❌ | ❌ | **✅** |
| Agent 執行時 | 內建 (Opus 4.7) | 內建 ([`pi-ai`][piai]) | **委託給使用者已裝好的 CLI** |
| Skill | 私有 | 12 套自定義 TS 模組 + `SKILL.md` | **31 套基於檔案的 [`SKILL.md`][skill]，可丟入** |
| Design system | 私有 | `DESIGN.md`（v0.2 路線圖） | **`DESIGN.md` × 72 套，開箱即有** |
| Provider 靈活度 | 僅 Anthropic | 7+（[`pi-ai`][piai]） | **10 套 CLI adapter + OpenAI 相容 BYOK 代理** |
| 初始化問題表單 | ❌ | ❌ | **✅ 硬規則 turn 1** |
| 方向選擇器 | ❌ | ❌ | **✅ 5 套確定性方向** |
| 即時 todo 進度 + tool 流 | ❌ | ✅ | **✅**（UX 模式來自 open-codesign） |
| 沙盒 iframe 預覽 | ❌ | ✅ | **✅**（模式來自 open-codesign） |
| Claude Design ZIP 匯入 | n/a | ❌ | **✅ `POST /api/import/claude-design` —— 接著 Anthropic 停下的地方繼續編輯** |
| 評論模式手術刀編輯 | ❌ | ✅ | 🚧 路線圖（移植自 open-codesign） |
| AI 自吐 tweaks 面板 | ❌ | ✅ | 🟡 部分 —— [`tweaks` skill](skills/tweaks/) 已發，專屬 chat-side 面板 UX 仍在路線圖 |
| 檔案系統級工作區 | ❌ | 部分（Electron 沙盒） | **✅ 真 cwd、真工具、SQLite 持久化（projects · conversations · messages · tabs · templates）** |
| 五維自評審 | ❌ | ❌ | **✅ Emit 前必跑** |
| Artifact lint | ❌ | ❌ | **✅ `POST /api/artifacts/lint` —— 把 findings 喂回 agent** |
| Sidecar IPC + 無頭桌面版 | ❌ | ❌ | **✅ stamped 程序 + `tools-dev inspect desktop status \| eval \| screenshot`** |
| 匯出格式 | 受限 | HTML / PDF / PPTX / ZIP / Markdown | **HTML / PDF / PPTX（agent 驅動）/ ZIP / Markdown** |
| PPT skill 複用 | N/A | 內建 | **[`guizang-ppt-skill`][guizang] 直接接入（deck 模式預設）** |
| 計費門檻 | Pro / Max / Team | BYOK | **BYOK —— 填任意 OpenAI 相容 `baseUrl`** |

[cd]: https://x.com/claudeai/status/2045156267690213649
[ocod]: https://github.com/OpenCoworkAI/open-codesign
[piai]: https://github.com/mariozechner/pi-ai
[acd]: https://github.com/VoltAgent/awesome-claude-design
[guizang]: https://github.com/op7418/guizang-ppt-skill
[skill]: https://docs.anthropic.com/en/docs/claude-code/skills

## 支援的 Coding Agent

Daemon 啟動時從 `PATH` 自動檢測，無需配置。流式分發邏輯在 [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) 的 `AGENT_DEFS` 裡；每個 CLI 的 parser 也在同目錄。模型列表的來源要麼是探測 `<bin> --list-models` / `<bin> models` / ACP 握手，要麼走精選 fallback。

| Agent | 二進位制 | 流式格式 | argv 形態（拼裝好的 prompt 路徑） |
|---|---|---|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `claude` | `claude-stream-json`（型別化事件） | `claude -p <prompt> --output-format stream-json --verbose [--include-partial-messages] [--add-dir …] --permission-mode bypassPermissions` |
| [Codex CLI](https://github.com/openai/codex) | `codex` | `json-event-stream` + `codex` parser | `codex exec --json --skip-git-repo-check --sandbox workspace-write -c sandbox_workspace_write.network_access=true [-C cwd] [--model …] [-c model_reasoning_effort=…]`（prompt 走 stdin） |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `gemini` | `json-event-stream` + `gemini` parser | `GEMINI_CLI_TRUST_WORKSPACE=true gemini --output-format stream-json --yolo [--model …]`（prompt 走 stdin） |
| [OpenCode](https://opencode.ai/) | `opencode` | `json-event-stream` + `opencode` parser | `opencode run --format json --dangerously-skip-permissions [--model …] -`（prompt 走 stdin） |
| [Cursor Agent](https://www.cursor.com/cli) | `cursor-agent` | `json-event-stream` + `cursor-agent` parser | `cursor-agent --print --output-format stream-json --stream-partial-output --force --trust [--workspace cwd] [--model …] -`（prompt 走 stdin） |
| [Qwen Code](https://github.com/QwenLM/qwen-code) | `qwen` | `plain`（原始 stdout chunk） | `qwen --yolo [--model …] -`（prompt 走 stdin） |
| [GitHub Copilot CLI](https://github.com/features/copilot/cli) | `copilot` | `copilot-stream-json`（型別化事件） | `copilot -p <prompt> --allow-all-tools --output-format json [--model …] [--add-dir …]` |
| [Hermes](https://github.com/eqlabs/hermes) | `hermes` | `acp-json-rpc`（Agent Client Protocol） | `hermes acp --accept-hooks` |
| Kimi CLI | `kimi` | `acp-json-rpc` | `kimi acp` |
| [Pi](https://github.com/mariozechner/pi-ai) | `pi` | `pi-rpc`（stdio JSON-RPC） | `pi --mode rpc [--model …] [--thinking …]`（prompt 走 RPC `prompt` 命令） |
| **OpenAI 相容 BYOK** | n/a | SSE 透傳 | `POST /api/proxy/stream` → `<baseUrl>/v1/chat/completions`；拒絕 loopback / link-local / RFC1918 |

加一個新 CLI = 在 [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) 里加一項。流式格式從 `claude-stream-json` / `copilot-stream-json` / `json-event-stream`（搭配每 CLI 的 `eventParser`）/ `acp-json-rpc` / `pi-rpc` / `plain` 中選一個。

## 引用與師承

每一個被借鑑的開源專案都列在這裡。點連結可以驗證師承。

| 專案 | 在這裡的角色 |
|---|---|
| [`Claude Design`][cd] | 本倉庫為之提供開源替代的閉源產品。 |
| [**`alchaincyf/huashu-design`**（花叔的畫術）](https://github.com/alchaincyf/huashu-design) | 設計哲學的核心。Junior-Designer 工作流、5 步品牌資產協議、anti-AI-slop checklist、五維自評審、以及方向選擇器背後的「5 流派 × 20 種設計哲學」庫 —— 全部蒸餾進 [`apps/web/src/prompts/discovery.ts`](apps/web/src/prompts/discovery.ts) 與 [`apps/web/src/prompts/directions.ts`](apps/web/src/prompts/directions.ts)。 |
| [**`op7418/guizang-ppt-skill`**（歸藏）][guizang] | Magazine-web-PPT skill 原樣納入在 [`skills/guizang-ppt/`](skills/guizang-ppt/) 下，原 LICENSE 保留。Deck 模式預設。P0/P1/P2 checklist 文化也被借給了所有其他 skill。 |
| [**`multica-ai/multica`**](https://github.com/multica-ai/multica) | Daemon + adapter 架構。PATH 掃描式 agent 檢測、本地 daemon 作為唯一特權程序、agent-as-teammate 世界觀。我們採納模型，不 vendor 程式碼。 |
| [**`OpenCoworkAI/open-codesign`**][ocod] | 第一個開源的 Claude-Design 替代品，也是我們最接近的同類。已採納的 UX 模式：流式 artifact 迴圈、沙盒 iframe 預覽（自帶 React 18 + Babel）、即時 agent 面板（todos + tool calls + 可中斷）、5 種匯出格式列表（HTML/PDF/PPTX/ZIP/Markdown）、本地優先的 designs hub、`SKILL.md` 品味注入。路線圖上的 UX 模式：評論模式手術刀編輯、AI 自吐 tweaks 面板。**我們刻意不 vendor [`pi-ai`][piai]** —— open-codesign 把它打包成 agent 執行時；我們則委託給使用者已經裝好的 CLI。 |
| [`VoltAgent/awesome-claude-design`][acd] / [`awesome-design-md`][acd2] | 9 段式 `DESIGN.md` schema 的來源，69 套產品系統透過 [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts) 匯入。 |
| [`farion1231/cc-switch`](https://github.com/farion1231/cc-switch) | 跨多個 agent CLI 的 symlink 式 skill 分發靈感來源。 |
| [Claude Code skills][skill] | `SKILL.md` 規範原樣採納 —— 任何 Claude Code skill 丟進 `skills/` 都能被 daemon 識別。 |

詳盡的師承說明（每一項我們採納了什麼、刻意沒採納什麼）在 [`docs/references.md`](docs/references.md)。

## Roadmap

- [x] Daemon + agent 檢測（10 套 CLI adapter）+ skill registry + design-system 目錄
- [x] Web 應用 + 對話 + question form + 5 套方向選擇器 + todo progress + 沙盒預覽
- [x] 31 個 skill + 72 套 design system + 5 套視覺方向 + 5 個裝置外殼
- [x] SQLite 後端的 projects · conversations · messages · tabs · templates
- [x] OpenAI 相容 BYOK 代理（`/api/proxy/stream`）含 SSRF 防禦
- [x] Claude Design ZIP 匯入（`/api/import/claude-design`）
- [x] Sidecar 協議 + Electron 桌面版 + IPC 自動化（STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN）
- [x] Artifact lint API + 五維自評審 emit-前 gate
- [ ] 評論模式手術刀編輯（點元素 → 指令 → 區域性 patch）—— 模式來自 [`open-codesign`][ocod]
- [ ] AI 自吐 tweaks 面板 UX —— 基礎積木（[`tweaks` skill](skills/tweaks/)）已發，整合到 chat 的面板尚未完成
- [ ] Vercel + 隧道部署食譜（Topology B）
- [ ] 一行 `npx od init` 腳手架帶 `DESIGN.md`
- [ ] Skill 市場（`od skills install <github-repo>`）和 `od skill add | list | remove | test` CLI 表面（在 [`docs/skills-protocol.md`](docs/skills-protocol.md) 裡有草案，daemon 實現尚未跟上）
- [x] `apps/packaged/` 出可分發 Electron 安裝包 —— macOS（Apple Silicon）和 Windows（x64）下載已上線 [open-design.ai](https://open-design.ai/) 和 [GitHub releases 頁面](https://github.com/nexu-io/open-design/releases)

分階段交付計畫在 [`docs/roadmap.md`](docs/roadmap.md)。

## 專案狀態

這是一個早期實現 —— 閉環（檢測 → 選 skill + design system → 對話 → 解析 `<artifact>` → 預覽 → 儲存）已經端到端跑通。提示詞堆疊和 skill 庫是價值最重的部分，目前已穩定。元件級 UI 仍在每天迭代。

## 給我們點個 Star

<p align="center">
  <a href="https://github.com/nexu-io/open-design"><img src="docs/assets/star-us.png" alt="給 Open Design 點個 Star —— github.com/nexu-io/open-design" width="100%" /></a>
</p>

如果這套東西幫你省了半小時，給它一個 ★。Star 不付房租，但它告訴下一個設計師、Agent 和貢獻者：這個實驗值得他們的注意力。一次點選、三秒鐘、真實訊號：[github.com/nexu-io/open-design](https://github.com/nexu-io/open-design)。

## 貢獻

歡迎 issue、PR、新 skill、新 design system。收益最高的貢獻往往就是一個資料夾、一份 Markdown，或者一個 PR 大小的 adapter：

- **加一個 skill** —— 往 [`skills/`](skills/) 丟一個資料夾，遵循 [`SKILL.md`][skill] 規範。
- **加一套 design system** —— 往 [`design-systems/<brand>/`](design-systems/) 丟一份 `DESIGN.md`，用 9 段式 schema。
- **接入一個新的 coding-agent CLI** —— 在 [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) 里加一項。

完整流程、合併硬線、程式碼風格、我們不接收的 PR 型別 → [`CONTRIBUTING.zh-CN.md`](CONTRIBUTING.zh-CN.md)（[English](CONTRIBUTING.md)，[Deutsch](CONTRIBUTING.de.md)，[Français](CONTRIBUTING.fr.md)）。

## 貢獻者牆

感謝每一位讓 Open Design 變得更好的朋友 —— 無論是寫程式碼、修文檔、提 issue、加 skill 還是加 design system，每一次真實貢獻都會被記住。下面這面牆是最直觀的「Thank you」。

<a href="https://github.com/nexu-io/open-design/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nexu-io/open-design&cache_bust=2026-05-05" alt="Open Design 貢獻者" />
</a>

第一次提 PR？歡迎從 [`good-first-issue`/`help-wanted`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22%2C%22help+wanted%22) 標籤起步。

## 倉庫活躍度

<picture>
  <img alt="Open Design 倉庫指標" src="docs/assets/github-metrics.svg" />
</picture>

上面的 SVG 由 [`.github/workflows/metrics.yml`](.github/workflows/metrics.yml) 藉助 [`lowlighter/metrics`](https://github.com/lowlighter/metrics) 每天自動重新生成。想要立刻重新整理可以去 **Actions** 選項卡手動觸發；想開啟更豐富的外掛（traffic、follow-up time 等）可在倉庫 secrets 里加一個細粒度 PAT 命名為 `METRICS_TOKEN`。

## Star History

<a href="https://star-history.com/#nexu-io/open-design&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&theme=dark&cache_bust=2026-05-05" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-05" />
    <img alt="Open Design star history" src="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-05" />
  </picture>
</a>

曲線往上走 —— 那就是我們想看到的訊號。點 ★ 推它一把。

## License

Apache-2.0。內建的 [`skills/guizang-ppt/`](skills/guizang-ppt/) 保留它原始的 [LICENSE](skills/guizang-ppt/LICENSE)（MIT）和原作者 [op7418](https://github.com/op7418) 的歸屬。
