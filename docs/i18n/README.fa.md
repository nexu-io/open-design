<h1 align="center">OpenDesign: جایگزین متن‌باز Claude Design</h1>

> ⚡ **[OpenDesign Cloud — سرویس رسمی مدل.](https://open-design.ai/zh/pricing/)** یک‌بار شارژ کنید تا از هر دو مدل agent و تصویر داخل OpenDesign استفاده کنید: GPT، Claude و DeepSeek برای agentها؛ GPT Image 2.0، Seedream 5.0 Pro و Nano Banana 2.0 برای تصاویر.
>
> 🚀 **[DeepSeek V4 Flash و V4 Pro اکنون در دسترس هستند.](https://open-design.ai/zh/pricing/)** هوش سطح بالا را در پروتوتایپ‌ها، دک‌ها، سیستم‌های طراحی و وظایف روزمره agent به کار بگیرید. اعضای OpenDesign می‌توانند هر دو مدل را برای دو هفته بدون محدودیت، مستقیماً در برنامه استفاده کنند.
>
> 🧩 **[DeepSeek Harness اکنون پشتیبانی می‌شود.](https://open-design.ai/zh/agents/deepseek-harness-design/)** harness رسمی `dsh` agent از DeepSeek را به OpenDesign به‌عنوان یک runtime بومی متصل کنید، با تفکر ساختاریافته، فراخوانی ابزار، کشف مدل، لغو و ادامه جلسه. فایل‌های تولید شده در گردش کار OpenDesign برای پیش‌نمایش زنده و تحویل باقی می‌مانند.

<p align="center">
  <img src="https://repo-assets.open-design.ai/resources/images/hero.png" alt="OpenDesign hero banner — the headline &quot;The open-source Claude Design alternative&quot; over a classical scene of columns and robed figures on a digital-code backdrop, with stat cards for design systems, plugins, coding agents, and media providers" width="100%" />
</p>

<p align="center">
  <a href="https://open-design.ai/?utm_source=github&utm_medium=referral&utm_content=readme_website">Website</a> ·
  <a href="https://open-design.ai/?utm_source=github&utm_medium=referral&utm_content=readme_download">Download</a> ·
  <a href="https://open-design.ai/cloud/?utm_source=github&utm_medium=referral&utm_content=readme_cloud">OpenDesign Cloud</a> ·
  <a href="https://discord.gg/mHAjSMV6gz">Discord</a> ·
  <a href="https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=c06v4df1-9676-4672-8c77-7a30eab76154">Feishu Chinese Community</a> ·
  <a href="https://x.com/OpenDesignHQ">Follow @OpenDesignHQ</a>
</p>

<p align="center">
  <a href="https://github.com/nexu-io/open-design/releases"><img alt="release" src="https://img.shields.io/github/v/release/nexu-io/open-design?style=flat&color=blueviolet&label=release&include_prereleases&display_name=tag" /></a>
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat" /></a>
  <a href="https://discord.gg/mHAjSMV6gz"><img alt="discord" src="https://img.shields.io/discord/1479002485040480266?style=flat&logo=discord&logoColor=white&label=discord&color=5865F2&cacheSeconds=3600" /></a>
  <a href="QUICKSTART.md"><img alt="quickstart" src="https://img.shields.io/badge/quickstart-3%20commands-green?style=flat" /></a>
</p>

<p align="center"><a href="../../README.md"><b>English</b></a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ko.md">한국어</a> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ar.md">العربية</a> · <a href="README.ru.md">Русский</a> · <a href="README.uk.md">Українська</a> · <a href="README.tr.md">Türkçe</a> · <a href="README.th.md">ภาษาไทย</a> · <b>فارسی</b></p>

---

## OpenDesign چیست

🎨 **جایگزین متن‌باز Claude Design.** &nbsp;🖥️ **برنامه دسکتاپ بومی local-first برای macOS و Windows.** &nbsp;⚡ **مهارت‌های قابل ترکیب، سیستم‌های طراحی `DESIGN.md` در سطح برند و افزونه‌های آماده استفاده.** &nbsp;🖼️ تولید **پروتوتایپ‌های وب · دسکتاپ · موبایل**، **داشبوردها / artifactهای زنده**، **دک‌ها**، **تصاویر**، **ویدیو**، به‌علاوه گرافیک‌های موشن **HyperFrames**. 🔒 پیش‌نمایش iframe با sandbox · خروجی HTML / PDF / PPTX / MP4. &nbsp;🤖 **روی DeepSeek Harness (`dsh`) · Claude Code · OpenClaw · Codex · Cursor · OpenCode · Qwen · Copilot · Amp · Hermes · Kimi · Antigravity و 26 فایل اجرایی CLI محلی مجزا اجرا می‌شود**، یا هر endpoint سازگار با OpenAI از طریق BYOK.

OpenDesign چیزی است که وقتی حلقه **بومی agent** که Anthropic با Claude Design ارائه داد — کشف خلاصه، قفل کردن جهت، جریان artifact، نقد، تحویل — دیگر بسته نباشد و تبدیل به **یک فایل‌سیستم از مهارت‌های کاربردی، الگوهای طراحی رندرینگ، سیستم‌های طراحی و افزونه‌ها** شود که agentهای کدنویسی روی لپ‌تاپ شما می‌توانند بخوانند، بنویسند و ریمیکس کنند، به دست می‌آید. CLI شما به موتور طراحی تبدیل می‌شود، لپ‌تاپ شما به استودیو تبدیل می‌شود و `DESIGN.md` تیم شما به قرارداد برند تبدیل می‌شود.

همچنین **جایگزین Figma برای عصر agent** است — به جای فشار دادن پیکسل‌ها روی یک بوم، artifactهای تک‌صفحه‌ای را با CSS واقعی، فونت‌های واقعی، کامپوننت‌های واقعی تحویل می‌دهد که مستقیماً به HTML / PDF / PPTX / MP4 خروجی می‌گیرند — قبلاً توسط سیستم طراحی شما شکل‌گرفته، قبلاً درون agentای که هر روز استفاده می‌کنید قابل اجرا.


---

## تور محصول

نگاهی سریع به گردش کار اصلی OpenDesign. از **صفحه اصلی** با یک خلاصه شروع کنید، مهارت‌های قابل استفاده مجدد را در **افزونه‌ها** کاوش کنید، و مراجع برند را به یک **سیستم طراحی** تبدیل کنید. سپس وارد **استودیو** یک پروژه شوید تا پروتوتایپ‌ها، دک‌ها، برنامه‌های موبایل، تصاویر، اسناد و HyperFrameها را در یک مکان ایجاد و بهبود دهید.

### صفحات اصلی

<table>
<tr>
<td valign="top">
<img src="docs/screenshots/product-tour/home.png" alt="صفحه خانه OpenDesign با انواع artifact، نویسنده خلاصه، انتخابگر مدل و مثال‌ها" /><br/>
<sub><b>صفحه اصلی</b> — یک نوع artifact را انتخاب کنید، یک خلاصه وارد کنید، و سیستم طراحی، دایرکتوری کاری و مدل را قبل از شروع تنظیم کنید.</sub>
</td>
</tr>
</table>

<table>
<tr>
<td width="50%" valign="top">
<img src="docs/screenshots/product-tour/plugins.png" alt="صفحه افزونه‌های OpenDesign که کاتالوگ مهارت‌های رسمی را نشان می‌دهد" /><br/>
<sub><b>افزونه‌ها</b> — مهارت‌های رسمی را بر اساس دسته‌بندی مرور کنید، کاتالوگ را جستجو کنید، و با <code>امتحان کنید</code> یک گردش کار را راه‌اندازی کنید.</sub>
</td>
<td width="50%" valign="top">
<img src="docs/screenshots/product-tour/design-system.png" alt="پیش‌نمایش سیستم طراحی Shopify درون استودیو OpenDesign" /><br/>
<sub><b>سیستم طراحی</b> — زبان بصری یک برند را استخراج و اصلاح کنید، نتیجه را پیش‌نمایش کنید و با آن در همان فضای کاری ایجاد کنید.</sub>
</td>
</tr>
</table>

### استودیو — انواع مختلف artifact در یک پروژه

درون استودیو یک پروژه، مکالمه، فایل‌های تولید شده و پیش‌نمایش زنده در شش نوع artifact با هم باقی می‌مانند:

<table>
<tr>
<td width="50%" valign="top">
<img src="docs/screenshots/product-tour/studio-prototype.png" alt="پیش‌نمایش پروتوتایپ وب در استودیو OpenDesign" /><br/>
<sub><b>پروتوتایپ</b> — تجربیات وب را تولید یا بازسازی کنید، صفحه رندر شده را بازرسی کنید و با agent در محل تکرار کنید.</sub>
</td>
<td width="50%" valign="top">
<img src="docs/screenshots/product-tour/studio-deck.png" alt="پیش‌نمایش دک چند اسلایدی در استودیو OpenDesign" /><br/>
<sub><b>دک</b> — ارائه‌های چند اسلایدی ایجاد کنید، تامبنیل‌ها و یادداشت‌های سخنران را بررسی کنید و در صورت آمادگی خروجی بگیرید.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="docs/screenshots/product-tour/studio-mobile-app.png" alt="پیش‌نمایش artifact برنامه موبایل در استودیو OpenDesign" /><br/>
<sub><b>برنامه موبایل</b> — رابط‌های موبایل را در یک پیش‌نمایش دستگاه تولید و صیقل دهید، با مکالمه، فایل‌های خروجی و اقدامات گام بعدی در کنار آن.</sub>
</td>
<td width="50%" valign="top">
<img src="docs/screenshots/product-tour/studio-image.png" alt="پیش‌نمایش تصویر تولید شده در استودیو OpenDesign" /><br/>
<sub><b>تصویر</b> — دارایی‌های بصری را از مکالمه پروژه تولید کنید، نتیجه را در اندازه کامل پیش‌نمایش کنید، سپس دانلود یا باز کنید.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="docs/screenshots/product-tour/studio-document.png" alt="پیش‌نمایش سند چند صفحه‌ای در استودیو OpenDesign" /><br/>
<sub><b>سند</b> — راهنماها و اسناد ویرایشی چند صفحه‌ای صیقلی ایجاد کنید، چینش رندر شده را بازرسی کنید و در صورت آمادگی خروجی بگیرید یا به اشتراک بگذارید.</sub>
</td>
<td width="50%" valign="top">
<img src="docs/screenshots/product-tour/studio-hyperframe.png" alt="پیش‌نمایش گرافیک موشن HyperFrame در استودیو OpenDesign" /><br/>
<sub><b>HyperFrame</b> — گرافیک‌های موشن مبتنی بر کد بسازید، انیمیشن را درون استودیو پیش‌نمایش کنید و ویدیوی نهایی را خروجی بگیرید.</sub>
</td>
</tr>
</table>

---

## سازگاری پلتفرم

> OpenDesign به دو روش به agentهای کدنویسی جریان اصلی متصل می‌شود: **مهارت‌ها، CLI و MCP** برای agentهایی که OD را مصرف می‌کنند، به‌علاوه **آداپترهای runtime بومی** برای agentهایی که OD مستقیماً راه‌اندازی می‌کند. DeepSeek Harness یک runtime بومی درجه یک از طریق CLI رسمی `dsh` است، با streaming ساختاریافته، کشف مدل، لغو و ادامه جلسه.

| agent / پلتفرم کدنویسی &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | وضعیت &nbsp;&nbsp; | تنظیم سریع &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; |
|---|:---:|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | ✅ پشتیبانی می‌شود | `od mcp install claude` |
| [Claude Desktop](https://claude.ai/download) | ✅ پشتیبانی می‌شود¹ | `od mcp install claude-desktop` |
| [Codex CLI](https://github.com/openai/codex) | ✅ پشتیبانی می‌شود | `od mcp install codex` |
| [DeepSeek Reasonix](https://github.com/esengine/DeepSeek-Reasonix) | ✅ پشتیبانی می‌شود | `od mcp install reasonix` |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) | ✅ Runtime بومی | `od agent setup deepseek-harness` |
| [Raven](https://github.com/EverMind-AI/Raven) | ✅ پشتیبانی می‌شود | `od mcp install raven` |
| [Cursor](https://www.cursor.com/cli) | ✅ پشتیبانی می‌شود | `od mcp install cursor` |
| [VS Code + GitHub Copilot](https://github.com/features/copilot) | ✅ پشتیبانی می‌شود | `od mcp install copilot` |
| [GitHub Copilot CLI](https://github.com/features/copilot/cli) | ✅ پشتیبانی می‌شود | `od mcp install copilot` |
| [OpenCode](https://opencode.ai/) | ✅ پشتیبانی می‌شود | `od mcp install opencode` |
| [OpenClaw](https://github.com/openclaw/openclaw) | ✅ پشتیبانی می‌شود | `od mcp install openclaw` |
| [Antigravity](https://antigravity.google) | ✅ پشتیبانی می‌شود | `od mcp install antigravity` |
| [Cline](https://github.com/cline/cline) | ✅ پشتیبانی می‌شود | `od mcp install cline` |
| [Trae](https://www.trae.ai/) | ✅ پشتیبانی می‌شود | `od mcp install trae` |
| [Kimi CLI](https://github.com/MoonshotAI/kimi-cli) | ✅ پشتیبانی می‌شود | `od mcp install kimi` |
| [Kiro](https://kiro.dev) | ✅ پشتیبانی می‌شود | `od mcp install kiro` |
| [Pi Agent](https://github.com/badlogic/pi-mono) | ✅ پشتیبانی می‌شود | `od mcp install pi` |
| [Mistral Vibe CLI](https://github.com/mistralai/mistral-vibe) | ✅ پشتیبانی می‌شود | `od mcp install vibe` |
| [Hermes Agent](https://github.com/nousresearch/hermes-agent) | ✅ پشتیبانی می‌شود | `od mcp install hermes` |

برای DeepSeek Harness، ابتدا CLI رسمی `dsh` را نصب کنید، سپس آن را در OpenDesign انتخاب کنید یا `od agent setup deepseek-harness` را اجرا کنید تا کامپوننت اتصال OD را نصب/تعمیر کنید. برای ادغام‌های MCP: `od mcp install <agent> --print` برای پیش‌نمایش خشک · `--uninstall` برای حذف · لیست کامل با `od mcp install --help`.

¹ پیکربندی خودکار MCP برای Claude Desktop در حال حاضر فقط روی macOS و Windows پشتیبانی می‌شود.

<p align="center">
  <img src="https://repo-assets.open-design.ai/resources/images/coding-agents.png" alt="The 26 coding-agent CLIs OpenDesign supports — DeepSeek Harness · Claude Code · Codex · OpenCode · Hermes · Antigravity · Vela · Grok Build · Kimi · Cursor Agent · Qwen · Qoder · GitHub Copilot · Pi · Kiro · Kilo · Mistral Vibe · DeepSeek · Reasonix · Aider · Amp · CodeBuddy · Mimo · AtomCode · Devin · Trae" width="100%" />
</p>

**CLI نصب نشده؟** پروکسی BYOK در `POST /api/proxy/{anthropic,openai,azure,google,ollama,senseaudio}/stream` همان حلقه را به شما می‌دهد (بدون spawn فرآیند) — `baseUrl` + `apiKey` + `model` را وارد کنید، با پیش‌تنظیمات برای OpenAI، Atlas Cloud، Anthropic، Azure OpenAI، Google Gemini، Ollama، LM Studio، vLLM یا هر endpoint سازگار با OpenAI. Atlas Cloud از `https://api.atlascloud.ai/v1` با کلید خودتان و شناسه‌های مدل سازگار با OpenAI مانند `qwen/qwen3.5-flash` استفاده می‌کند. محافظت SSRF در هر هدف IP های داخلی / link-local / CGNAT را در لبه daemon مسدود می‌کند.

تعاریف Runtime در [`apps/daemon/src/runtimes/defs/`](apps/daemon/src/runtimes/defs/) قرار دارند، با ثبت و مدیریت stream مشترک در [`apps/daemon/src/runtimes/`](apps/daemon/src/runtimes/). برای قرارداد آداپتر [`docs/agent-adapters.md`](docs/agent-adapters.md) را ببینید.

---

## دمو

چهار دسته اصلی محصول، همگی توسط یک agent کدنویسی که روی لپ‌تاپ شما اجرا می‌شود، رندر شده‌اند. برای دیدن مثال واقعی روی یک تامبنیل کلیک کنید.

### 1 · پروتوتایپ‌ها — وب · دسکتاپ · موبایل

سطح خروجی پیش‌فرض. artifactهای HTML تک‌صفحه‌ای که `DESIGN.md` شما را می‌خوانند و در یک iframe ایمن رندر می‌شوند.

<table>
<tr>
<td width="50%" valign="top">
<img src="docs/screenshots/skills/dating-web.png" alt="پروتوتایپ وب dating-web" /><br/>
<sub><b>پروتوتایپ وب</b> — یک داشبورد ویرایشی با نوارهای پیمایش، KPI ها و نمودارها. رندر شده مستقیماً از <code>design-templates/dating-web/</code>.</sub>
</td>
<td width="50%" valign="top">
<img src="docs/screenshots/skills/gamified-app.png" alt="برنامه گیمیفای شده" /><br/>
<sub><b>پروتوتایپ برنامه موبایل</b> — یک جریان گیمیفای شده سه صفحه‌ای با روبان‌های XP و جزئیات ماموریت. مستقیماً به Cursor / Codex / Claude Code تحویل دهید تا به React/Next/Vue تبدیل شود.</sub>
</td>
</tr>
</table>

### 2 · artifactها و داشبوردهای زنده

داشبوردهای زنده، اتاق‌های تصمیم، دیوارهای KPI — artifactهای تک‌صفحه‌ای که داده را از طریق یک پنل تنظیمات دریافت می‌کنند و در محل قابل ویرایش باقی می‌مانند.

<table>
<tr>
<td width="50%" valign="top">
<img src="docs/screenshots/skills/live-dashboard.png" alt="داشبورد زنده" /><br/>
<sub><b>داشبورد زنده</b> — یک دیوار KPI قابل ویرایش که پنل تنظیمات آن پارامترهای ارزشمند را به سطح می‌آورد. agent یک manifest منتشر می‌کند و iframe بدون بارگذاری مجدد رندر می‌شود.</sub>
</td>
<td width="50%" valign="top">
<img src="docs/screenshots/skills/research-decision-room.png" alt="اتاق تصمیم" /><br/>
<sub><b>اتاق تصمیم</b> — یک artifact بریفینگ چند منبعی برای جلسات محصول / تحقیق / عملیات.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="docs/screenshots/skills/github-dashboard.png" alt="داشبورد GitHub" /><br/>
<sub><b>داشبورد به سبک GitHub</b> — معیارهای مخزن به عنوان یک artifact زنده ارائه شده‌اند.</sub>
</td>
<td width="50%" valign="top">
<img src="docs/screenshots/skills/flowai-live-dashboard-template.png" alt="داشبورد زنده Flow" /><br/>
<sub><b>الگوی داشبورد زنده Flow</b> — یک الگوی KPI خاص دامنه، برندسازی شده از طریق <code>DESIGN.md</code> فعال.</sub>
</td>
</tr>
</table>

### 3 · دک‌ها — دک‌های مجله‌ای، به‌روزرسانی‌های هفتگی، ارائه‌ها

<table>
<tr>
<td width="50%" valign="top">
<img src="docs/screenshots/07-magazine-deck.png" alt="دک مجله‌ای (guizang-ppt)" /><br/>
<sub><b>حالت دک (guizang-ppt)</b> — چینش‌های مجله‌ای، hero WebGL، چک‌لیست‌های P0/P1/P2. بسته‌بندی شده دقیقاً از <a href="https://github.com/op7418/guizang-ppt-skill"><code>op7418/guizang-ppt-skill</code></a> با حفظ مجوز اصلی آن.</sub>
</td>
<td width="50%" valign="top">
<img src="docs/screenshots/skills/deck-swiss-international.png" alt="دک Swiss" /><br/>
<sub><b>دک به سبک Swiss International</b> — لنگرگاه شبکه‌ای، تأکیدات تک‌رنگ. یکی از <b>15 الگوی دک</b> و <b>36 تم</b> در <code>design-templates/html-ppt-*/</code>.</sub>
</td>
</tr>
</table>

هر دک به **HTML** (فایل واحد، دارایی‌های درون‌خطی)، **PDF** (چاپ مرورگر، آگاه از دک)، **PPTX** (مهارت محرک agent)، **ZIP** (آرشیو) یا **Markdown** خروجی می‌گیرد.

### 4 · تصاویر — `gpt-image-2`، ImageRouter، API سفارشی

<table>
<tr>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776662673014_nf0taw_HGRMNDybsAAGG88.jpg" alt="نقشه غذای شهر تصویرسازی شده" /><br/><sub><b>نقشه غذای شهر تصویرسازی شده</b><br/>پوستر سفر ویرایشی دست‌کشیده</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453149026_gd2k50_HHCSvymboAAVscc.jpg" alt="صحنه سینمایی آسانسور" /><br/><sub><b>صحنه سینمایی آسانسور</b><br/>فریم واحد ویرایشی ثابت</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453164993_mt5b69_HHDoWfeaUAEA6Vt.jpg" alt="پرتره انیمه سایبرپانک" /><br/><sub><b>پرتره سایبرپانک</b><br/>آواتار پروفایل — متن صورت نئون</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776661968404_8a5flm_HGQc_KOaMAA2vt0.jpg" alt="تکامل پلکان سنگی سه‌بعدی" /><br/><sub><b>پلکان سنگی سه‌بعدی</b><br/>اینفوگرافیک سنگ تراشیده</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453184257_vb9hvl_HG9tAkOa4AAuRrn.jpg" alt="پرتره باشکوه" /><br/><sub><b>پرتره باشکوه</b><br/>عکس استودیویی ویرایشی</sub></td>
</tr>
</table>

**93 پرامپت آماده تکرار** در [`prompt-templates/`](prompt-templates/) قرار دارند — تامبنیل‌های پیش‌نمایش، متن کامل پرامپت، مدل هدف، نسبت تصویر و انتساب منبع. یک کلیک یک خلاصه را در نویسنده رها می‌کند.

### 5 · ویدیو و HyperFrames — گرافیک‌های موشن بومی agent

**[HyperFrames][hyperframes]** فریم‌ورک ویدیوی متن‌باز و بومی agent HeyGen است که به عنوان یک شهروند درجه یک در OpenDesign ادغام شده است. agent HTML + CSS + GSAP می‌نویسد، و HyperFrames آن را به یک MP4 قطعی از طریق headless Chrome + FFmpeg رندر می‌کند. آن را با **Seedance 2.0** برای t2v / i2v سینمایی، **Veo 3 / Sora 2 / Kling 2** برای انواع مدل مسیریابی شده و **Suno v5 / Lyria 2** برای لایه صوتی جفت کنید.

<table>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-saas-product-promo-30s.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="تبلیغ SaaS" /></a><br/><sub><b>تبلیغ محصول SaaS 30 ثانیه‌ای</b> · 16:9 · نمایش‌های سه‌بعدی UI</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-tiktok-karaoke-talking-head.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/tiktok-follow.png" alt="کارائوکه TikTok" /></a><br/><sub><b>سر صحبت‌کننده کارائوکه TikTok</b> · 9:16 · TTS + زیرنویس‌های همگام با کلمات</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-brand-sizzle-reel.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="رول جذاب برند" /></a><br/><sub><b>رول جذاب برند 30 ثانیه‌ای</b> · 16:9 · تایپ جنبشی واکنش‌پذیر به صدا</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-data-bar-chart-race.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/data-chart.png" alt="مسابقه نمودار میله‌ای" /></a><br/><sub><b>مسابقه نمودار میله‌ای</b> · 16:9 · اینفوگرافیک داده به سبک NYT</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-flight-map-route.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/nyc-paris-flight.png" alt="نقشه پرواز" /></a><br/><sub><b>نقشه پرواز</b> · 16:9 · نمایش مسیر به سبک Apple</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-logo-outro-cinematic.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="پایان‌بندی لوگو" /></a><br/><sub><b>پایان‌بندی سینمایی لوگو 4 ثانیه‌ای</b> · 16:9 · مونتاژ قطعه به قطعه + درخشش</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-money-counter-hype.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/apple-money-count.png" alt="شمارنده پول" /></a><br/><sub><b>شمارنده پول $0 → $10K</b> · 9:16 · هیجان به سبک Apple</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-website-to-video-promo.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="وب‌سایت به ویدیو" /></a><br/><sub><b>وب‌سایت به ویدیو</b> · 16:9 · سایت را در 3 viewport ضبط می‌کند</sub></td>
</tr>
</table>

11 الگوی HyperFrames + 39 پرامپت Seedance با مخزن ارسال می‌شوند. تامبنیل‌های کاتالوگ © HeyGen؛ فریم‌ورک Apache-2.0 است. گردش کار رندر خاص OD (کش ترکیب، راه‌حل sandbox-exec، MP4-as-chip) در [`design-templates/hyperframes/`](design-templates/hyperframes/) توضیح داده شده است.

[hyperframes]: https://github.com/heygen-com/hyperframes

---

## چرا OpenDesign

> **در آوریل 2026، Anthropic از Claude Design رونمایی کرد — اولین باری که یک LLM از نوشتن متن دست کشید و شروع به تحویل مستقیم artifactهای طراحی کرد.** وایرال شد. اما متن‌بسته، فقط پولی، فقط ابری باقی ماند، قفل شده به مدل Anthropic، مهارت‌های Anthropic، سطح Anthropic. بدون checkout، بدون self-host، بدون دپلوی Vercel، بدون تعویض با agent خودتان.

OpenDesign (OD) جایگزین متن‌باز است. همان حلقه، همان مدل ذهنی artifact-first، بدون هیچ قفلی:

- 🤖 **بومی-agent، مستقل از مدل.** ما agent ارسال نمی‌کنیم. `claude` / `codex` / `cursor-agent` / `copilot` / `hermes` / `kimi` که قبلاً روی `PATH` شما هستند، موتور طراحی هستند. با یک کلیک تعویض کنید.
- 🧠 **به‌طور پیش‌فرض در سطح برند.** هر رندر `DESIGN.md` بسته فعال را به‌عنوان قرارداد اصلی برند می‌خواند. 151 بسته سیستم طراحی با repo ارسال می‌شوند؛ بسته‌های قدیمی ممکن است فقط `DESIGN.md` داشته باشند، در حالی که بسته‌های جدیدتر می‌توانند `manifest.json`، `tokens.css`، کامپوننت‌ها، دارایی‌ها و منشأ را اضافه کنند. یک پوشه بیاندازید، انتخابگر آن را پیدا می‌کند.
- 🖥️ **ابتدا محلی، BYOK در هر لایه.** برنامه‌های دسکتاپ بومی برای macOS (Apple Silicon + Intel) و Windows (x64). Linux AppImage در مسیر انتشار اختیاری. آنالیتیکس محصول و بازپخش جلسه تحت رضایت محافظت می‌شوند؛ تله‌متری پاک‌شده ایمنی و قابلیت اطمینان همیشه روشن است. قبل از توصیف مسیرهای داده daemon، مشارکت‌کنندگان و اپراتورها باید `AGENTS.md` → **قرارداد دایرکتوری داده Daemon** را بخوانند. این README نباید آن را دوباره بیان کند.
- 🌍 **قابل ترکیب در چهار سطح.** **افزونه‌ها** گردش‌های کاری قابل اجرا را حمل می‌کنند · **مهارت‌های** کاربردی رفتار agent را حمل می‌کنند · **الگوهای طراحی** نقشه‌های رندرینگ را حمل می‌کنند · **سیستم‌های طراحی** برند را حمل می‌کنند. هر چهار از دایرکتوری‌های قابل حمل و نسخه‌بندی استفاده می‌کنند که هر کسی می‌تواند نویسنده و منتشر کند.
- 🔁 **تازه‌سازی یک کدبیس موجود.** یک repo `git` + `DESIGN.md` را به agent بدهید و کامپوننت‌های واقعی شما را به مشخصات برند بازسازی می‌کند. افزونه‌های اختصاصی گردش‌های کاری Figma / Pencil را به کد React / Next.js / Vue منتقل می‌کنند.
- 🔒 **حریم خصوصی با اعتقاد.** همه چیز جایی که داده‌های شما زندگی می‌کنند اجرا می‌شود — لپ‌تاپ شما، سرور تیم شما، پروژه Vercel شما. وقتی شبکه مورد نیاز است، پروکسی BYOK محافظت SSRF دارد.

### مقایسه

| | Claude Design | Figma | Lovable / v0 / Bolt | **OpenDesign** |
|---|---|---|---|---|
| متن‌باز | ❌ | ❌ | ❌ | **✅ Apache-2.0** |
| Self-host / دسکتاپ | ❌ | ❌ | ❌ | **✅ macOS + Windows + Docker + Vercel web** |
| بومی Agent (در CLI شما اجرا می‌شود) | فقط Anthropic | ❌ | فقط agent ابری | **✅ 25 CLI + BYOK** |
| `DESIGN.md` در سطح برند | اختصاصی | Theme JSON | توکن‌های محدود | **✅ 151 سیستم ارسال شده** |
| مهارت‌ها / افزونه‌ها / الگوها | بسته | فروشگاه افزونه | بسته | **✅ بیش از 100 مهارت کاربردی · الگوهای رندرینگ · 277 افزونه** |
| HyperFrames (HTML→MP4) | ❌ | ❌ | ❌ | **✅ درجه یک** |
| تازه‌سازی مخزن موجود به برند | ❌ | ❌ | ❌ | **✅ از طریق agent + `DESIGN.md`** |
| حداقل صورت‌حساب | Pro / Max / Team | Pro / Org | Pro / Team | **BYOK · هر endpoint سازگار** |

---

## شروع سریع

### 🖥️ دانلود برنامه دسکتاپ (توصیه می‌شود — پیکربندی صفر)

سریع‌ترین راه برای استفاده از OpenDesign. بدون Node، بدون pnpm، بدون clone.

- **macOS** (Apple Silicon · Intel x64) → [**open-design.ai**](https://open-design.ai/?utm_source=github&utm_medium=referral&utm_content=readme_download_macos) یا [GitHub Releases](https://github.com/nexu-io/open-design/releases)
- **Windows** (x64) → [**open-design.ai**](https://open-design.ai/?utm_source=github&utm_medium=referral&utm_content=readme_download_windows) یا [GitHub Releases](https://github.com/nexu-io/open-design/releases)
- **Linux** (AppImage، مسیر اختیاری) → [GitHub Releases](https://github.com/nexu-io/open-design/releases)

بعد از نصب: برنامه به‌طور خودکار هر CLI agent کدنویسی روی `PATH` شما را تشخیص می‌دهد، بیش از 100 مهارت کاربردی، کاتالوگ الگوی رندرینگ جداگانه و 151 سیستم طراحی را بارگذاری می‌کند و به شما اجازه می‌دهد در نمای ورودی یک خلاصه تایپ کنید.

### 🤖 نصب در agent کدنویسی شما (بدون UI)

می‌توانید از OpenDesign بدون باز کردن GUI استفاده کنید — آن را به عنوان یک مهارت، افزونه یا سرور MCP درون Claude Code، Codex، Cursor، Copilot، OpenClaw، Antigravity، Hermes، Kimi و موارد دیگر فراخوانی کنید.

اگر برنامه دسکتاپ macOS را از طریق DMG یا Homebrew cask نصب کرده‌اید، shell شما
ممکن است هنوز `od` را به ابزار octal-dump داخلی Apple در `/usr/bin/od` حل کند. در
این صورت، **تنظیمات → سرور MCP** را در برنامه دسکتاپ باز کنید و قطعه
خاص کلاینت را کپی کنید؛ از مسیرهای مطلق استفاده می‌کند و به دستور
خالی `od` وابسته نیست.

```bash
# نصب یک‌خطی در agent ای که استفاده می‌کنید:
od mcp install <agent>
# <agent> = claude | codex | reasonix | raven | cursor | copilot | openclaw
#         | antigravity | pi | vibe | hermes | cline | kimi | kiro
#         | trae | opencode

# معادل میزبانی شده برای راه‌اندازی مبتنی بر curl:
curl -fsSL https://open-design.ai/install.sh | sh -s <agent>
```

`install.sh` یک wrapper shell نازک در اطراف `od mcp install` است؛ وجود دارد تا
URL میزبانی شده shell را برگرداند به جای فالبک HTML صفحه فرود و به سرعت شکست بخورد
اگر shell شما یک باینری `od` غیر-Open-Design را حل کند.

> **کاربران macOS / WSL2:** `/usr/bin/od` یک دستور octal-dump سیستمی است و می‌تواند
> دستور `od` OpenDesign را سایه‌اندازی کند. کاربران برنامه دسکتاپ باید قطعه
> **تنظیمات → سرور MCP** را ترجیح دهند؛ کاربران WSL2 باید ابتدا
> راهنمای [`راه‌اندازی WSL2`](docs/wsl-setup.md) را دنبال کنند.

سپس، درون agent:

```
> از open-design برای تولید یک صفحه فرود با سیستم طراحی Linear استفاده کن
```

در یک اجرای CLI محلی پشتیبانی شده توسط فایل‌سیستم، agent مهارت کاربردی یا الگوی طراحی انتخاب شده را با `DESIGN.md` شما ترکیب می‌کند، فایل‌های پروژه اصلی را می‌نویسد و OpenDesign آن فایل‌ها را پیش‌نمایش می‌کند. یک اجرای BYOK/plain-API بدون ابزارهای فایل‌سیستم به جای آن یک بلوک کامل `<artifact>` برمی‌گرداند.

### 🐳 اجرا با Docker

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design/deploy
cp .env.example .env
echo "OD_API_TOKEN=$(openssl rand -hex 32)" >> .env
docker compose up -d
# باز کنید http://127.0.0.1:7456
```

اگر مرورگر درخواست اعتبارنامه کرد، از `open-design` به عنوان نام کاربری و
مقدار `OD_API_TOKEN` از `deploy/.env` به عنوان رمز عبور استفاده کنید. این ترافیک bridge Docker را
احراز هویت شده نگه می‌دارد بدون نیاز به شبکه host. کلاینت‌های API می‌توانند همچنان
از `Authorization: Bearer <OD_API_TOKEN>` استفاده کنند.

### 🚀 استقرار در Sealos

[![Deploy on Sealos](https://sealos.io/Deploy-on-Sealos.svg)](https://sealos.io/products/app-store/open-design/)

الگوی App Store Sealos تصویر Docker منتشر شده OpenDesign را با ذخیره‌سازی فضای کاری پایدار و Basic Auth روی پروکسی عمومی اجرا می‌کند. برای استقرارهای سفارشی عمومی یا مشترک Docker، راهنمای reverse-proxy و `OPEN_DESIGN_ALLOWED_ORIGINS` را در [`deploy/README.md`](deploy/README.md#local-compose) دنبال کنید.

### 🧑‍💻 اجرا از منبع

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable && pnpm install
pnpm tools-dev run web
```

URL چاپ شده توسط `tools-dev` را باز کنید؛ پورت‌های توسعه به صورت پویا اختصاص داده می‌شوند مگر اینکه پرچم‌های پورت صریح را پاس دهید.

Node `~24`، pnpm `10.33.x`. کاربران WSL2، [`docs/wsl-setup.md`](docs/wsl-setup.md) را ببینید؛ کاربران Windows بومی، [`docs/windows-troubleshooting.md`](docs/windows-troubleshooting.md) را ببینید. شروع سریع کامل، متغیرهای env، Nix flake و جریان ساخت بسته‌بندی شده → [`QUICKSTART.md`](QUICKSTART.md).

### یک گردش کار کامل — از خلاصه تا artifact

`خلاصه → افزونه → جهت → سیستم طراحی → artifact → تحویل → حافظه`

1. **یک PM یک خلاصه ارسال می‌کند.** انتخابگر افزونه صفحه فرود · دک ارائه · داشبورد · پست اجتماعی · مشخصات PM · کارت امتیازی OKR را ارائه می‌دهد…
2. **یک طراح (یا agent) جهت را قفل می‌کند.** برند ندارید؟ از 5 جهت منتخب انتخاب کنید. برند دارید؟ یک اسکرین‌شات / URL بیاندازید → agent به GitHub متصل می‌شود، Figma را وارد می‌کند و یک `DESIGN.md` قابل استفاده مجدد کدگذاری می‌کند.
3. **agent اولین محصول را ایجاد می‌کند.** افزونه + مهارت کاربردی یا الگوی طراحی + `DESIGN.md` متصل هستند. اجراهای CLI پشتیبانی شده توسط فایل‌سیستم فایل‌های پروژه اصلی را می‌نویسند و پیش‌نمایش آنها را دنبال می‌کند؛ اجراهای BYOK/plain-API بدون ابزارهای فایل یک بلوک کامل `<artifact>` برمی‌گردانند.
4. **تحویل به مهندسی.** artifact HTML/CSS واقعی است — آن را در Cursor، Codex یا Claude Code بیاندازید تا به‌عنوان کد به ساخت ادامه دهید. یا PPTX / PDF / MP4 را مستقیماً به بازاریابی خروجی بگیرید.
5. **OpenDesign با استفاده از آن هوشمندتر می‌شود.** اسکرین‌شات‌ها، فونت‌ها، پالت‌ها و artifactهای تأیید شده شما به‌عنوان پیش‌فرض برای جلسه بعدی جمع می‌شوند. کار مجدد کمتر، انحراف کمتر.

---

## استفاده از OpenDesign از agent کدنویسی شما

OpenDesign یک **سرور MCP stdio** و **اسکریپت‌های نصب برای هر agent** را ارسال می‌کند. هر agent سازگار با MCP در مخزن دیگری می‌تواند مستقیماً فایل‌ها را از پروژه‌های محلی OpenDesign شما بخواند — CSS توکن‌ها، کامپوننت‌های JSX، HTML ورودی — به عنوان یک API ساختاریافته قابل پرس‌وجو با نام. agent همیشه فایل زنده را می‌بیند، نه یک خروجی قدیمی.

```bash
# نصب یک‌خطی (بیش از 16 CLI پشتیبانی می‌شود):
od mcp install <agent>

# سپس agent می‌تواند:
od project list --json
od files list <project-id> --json
od files read <project-id> <relative-path>
od plugin list --json
od skills list --json
```

**چرا MCP؟** خروجی گرفتن و پیوست مجدد یک zip در هر تکرار جریان را می‌شکند. MCP منبع طراحی را مستقیماً در معرض دید قرار می‌دهد — agent همیشه فایل زنده را می‌بیند.

**برای یک agent که از صفر شروع می‌کند،** نصب‌کننده `~/.config/<agent>/open-design.json` (یا معادل پلتفرم) به‌علاوه یک قطعه MCP کپی-پیست قرار می‌دهد. Cursor یک deeplink یک‌کلیکی دریافت می‌کند؛ Claude Code یک one-liner `claude mcp add-json` دریافت می‌کند؛ هر agent دیگری JSON را در اسکیمایی که config آن انتظار دارد دریافت می‌کند. در نصب‌های دسکتاپ macOS، آن قطعه تنظیمات را به جای تایپ `od mcp install <agent>` خالی در Terminal ترجیح دهید، زیرا `/usr/bin/od` ممکن است در PATH برنده شود. جریان کامل هر agent → **تنظیمات → سرور MCP** در برنامه دسکتاپ، یا [`docs/agent-adapters.md`](docs/agent-adapters.md).

**مدل امنیتی.** به‌طور پیش‌فرض فقط خواندنی، daemon به `127.0.0.1` متصل می‌شود و SSRF در لبه پروکسی مسدود می‌شود. قرارگیری در معرض LAN نیاز به یک `OD_BIND_HOST` صریح به‌علاوه `OD_ALLOWED_ORIGINS` دارد. اعتبارنامه‌های کانکتور و مسیرهای پیش‌نمایش artifact زنده بدون توجه به آن فقط loopback باقی می‌مانند.

**endpointهای مدل میزبانی‌شده داخلی.** برای جلوگیری از SSRF، daemon به‌طور پیش‌فرض URLهای پایه ارائه‌دهنده که به محدوده‌های آدرس خصوصی/داخلی (RFC1918، link-local، CGNAT و IPهای cloud-metadata) حل می‌شوند را مسدود می‌کند، و `Internal IPs blocked` را نمایش می‌دهد. اگر یک دروازه میزبانی‌شده داخلی اجرا می‌کنید (مثلاً LiteLLM یا Ollama روی یک آدرس فقط VPN `10.x`/`192.168.x`)، آن میزبان را با `OD_ALLOWED_INTERNAL_HOSTS=<host1>,<host2>,...` خارج کنید — یک لیست جدا شده با کاما یا فضای خالی از hostnameهای خالی یا IPها (`10.0.0.5`، `litellm.internal.corp`؛ یک `host:port` یا URL کامل پذیرفته شده و به hostname خود کاهش می‌یابد؛ IPv6 باید بین براکت باشد، مثلاً `[fd00::1]`). allowlist ورود صریح سختگیرانه است (به‌طور پیش‌فرض خالی)، دقیقاً میزبان (بدون تطبیق subdomain/substring)، و **فقط** برای endpointهای ارائه‌دهنده‌ای که پیکربندی می‌کنید اعمال می‌شود (تست اتصال، کشف مدل، چت BYOK). عمداً محافظ را روی URLهای دانلودی که در پاسخ‌های upstream برگردانده می‌شوند شل **نمی‌کند**، که مسدود باقی می‌مانند. یک ورودی ناقص — یا نشانه‌گذاری CIDR که پشتیبانی نمی‌شود — با یک هشدار رها می‌شود به‌جای اینکه بی‌صدا مورد اعتماد قرار گیرد، بنابراین یک غلط‌تایپی هرگز به آرامی محافظ را گسترش نمی‌دهد (یا نمی‌تواند گسترش دهد). allowlist کردن یک hostname به هر چیزی که به آن حل می‌شود اعتماد می‌کند (مانند `OD_ALLOWED_ORIGINS`)؛ به‌جای آن IP حل شده را allowlist کنید اگر می‌خواهید آدرس حل شده DNS دوباره بررسی شود.

---

## مهارت‌ها و الگوهای طراحی

**بیش از 100 مهارت کاربردی در [`skills/`](skills/) ارسال می‌شوند**. هر یک از قرارداد [`SKILL.md`][skill] Agent Skills پیروی می‌کند و رفتار، مراجع یا ابزارهای قابل استفاده مجدد agent را ارائه می‌دهد. starterهای قابل رندر به‌صورت جداگانه در [`design-templates/`](design-templates/) قرار دارند؛ آنها نیز ممکن است از `SKILL.md` استفاده کنند، اما کاتالوگ الگوی طراحی را به‌جای رجیستری مهارت کاربردی پر می‌کنند.

دو **حالت** کاتالوگ الگوی طراحی را لنگر می‌زنند: `prototype` (artifactهای تک‌صفحه‌ای وب/موبایل/دسکتاپ) و `deck` (ارائه‌های swipe افقی). الگوهای دیگر سطوح `image`، `video`، `audio` و utility را پوشش می‌دهند. فیلد **`scenario`** الگوها را بر اساس مخاطب گروه‌بندی می‌کند: `design` · `marketing` · `operation` · `engineering` · `product` · `finance` · `hr` · `sale` · `personal`.

| الگوی طراحی | حالت | سناریو | چه چیزی تولید می‌کند |
|---|---|---|---|
| [`web-prototype`](design-templates/web-prototype/) | prototype | design | صفحه فرود / hero پیش‌فرض |
| [`saas-landing`](design-templates/saas-landing/) | prototype | marketing | Hero / ویژگی‌ها / قیمت‌گذاری / CTA |
| [`dashboard`](design-templates/dashboard/) | prototype | operation | مدیریت / تحلیل (با sidebar) |
| [`mobile-app`](design-templates/mobile-app/) | prototype | design | برنامه فریم شده iPhone 15 Pro / Pixel |
| [`mobile-onboarding`](design-templates/mobile-onboarding/) | prototype | design | جریان Splash · value-prop · sign-in |
| [`social-carousel`](design-templates/social-carousel/) | prototype | marketing | چرخ فلک 3 کارتی 1080×1080 |
| [`email-marketing`](design-templates/email-marketing/) | prototype | marketing | ایمیل برند با فالبک جدول ایمن |
| [`magazine-poster`](design-templates/magazine-poster/) | prototype | marketing | چینش مجله تک‌صفحه‌ای |
| [`motion-frames`](design-templates/motion-frames/) | prototype | marketing | hero موشن CSS حلقه‌ای |
| [`sprite-animation`](design-templates/sprite-animation/) | prototype | marketing | توضیح‌دهنده انیمیشن پیکسلی 8 بیتی |
| [`pm-spec`](design-templates/pm-spec/) | prototype | product | سند مشخصات PM (با TOC + log تصمیم) |
| [`team-okrs`](design-templates/team-okrs/) | prototype | product | کارت امتیازی OKR |
| [`eng-runbook`](design-templates/eng-runbook/) | prototype | engineering | runbook حادثه |
| [`finance-report`](design-templates/finance-report/) | prototype | finance | خلاصه مالی اجرایی |
| [`hr-onboarding`](design-templates/hr-onboarding/) | prototype | hr | برنامه ورود به نقش |
| [`guizang-ppt`](design-templates/guizang-ppt/) | deck | marketing | PPT وب به سبک مجله (پیش‌فرض دک) |
| [`html-ppt-*`](design-templates/) | deck | marketing | 15 الگوی دک × 36 تم (الگوی اصلی در [`design-templates/html-ppt/`](design-templates/html-ppt/)) |
| [`hyperframes`](design-templates/hyperframes/) | video | marketing | گرافیک‌موشن HTML → MP4 (فریم‌ورک OSS HeyGen) |
| [`critique`](design-templates/critique/) | utility | design | برگه امتیاز خودنقدی پنج بعدی |
| [`tweaks`](design-templates/tweaks/) | utility | design | manifest پنل تنظیمات منتشر شده توسط AI |

پروتکل کامل و تقسیم دایرکتوری → [`docs/skills-protocol.md`](docs/skills-protocol.md). endpointهای رجیستری: `GET /api/skills` برای مهارت‌های کاربردی و `GET /api/design-templates` برای الگوهای رندرینگ.

---

## سیستم‌های طراحی

**151 بسته سیستم طراحی در سطح برند متمرکز بر `DESIGN.md`** با مخزن ارسال می‌شوند. بسته‌های قدیمی ممکن است فقط حاوی آن قرارداد Markdown باشند؛ بسته‌های جدیدتر همچنین می‌توانند `manifest.json`، `tokens.css` کامپایل شده، fixtureهای کامپوننت، داراییها و شواهد منشأ را حمل کنند. کاتالوگ سیستم‌های مشتق شده upstream را با افزودنی‌های متعلق به پروژه مخلوط می‌کند؛ [`design-systems/README.md`](design-systems/README.md) شکل بسته و منشأ را ثبت می‌کند. تعویض یک سیستم → رندر بعدی از توکن‌های جدید استفاده می‌کند.

<details>
<summary><b>کاتالوگ کامل (کلیک کنید تا باز شود)</b></summary>

**AI & LLM** — `claude` · `cohere` · `mistral-ai` · `minimax` · `together-ai` · `replicate` · `runwayml` · `elevenlabs` · `ollama` · `x-ai`

**ابزارهای توسعه‌دهنده** — `cursor` · `vercel` · `linear-app` · `framer` · `expo` · `clickhouse` · `mongodb` · `supabase` · `hashicorp` · `posthog` · `sentry` · `warp` · `webflow` · `sanity` · `mintlify` · `lovable` · `composio` · `opencode-ai` · `voltagent`

**بهره‌وری** — `notion` · `figma` · `miro` · `airtable` · `superhuman` · `intercom` · `zapier` · `cal` · `clay` · `raycast`

**Fintech** — `stripe` · `coinbase` · `binance` · `kraken` · `mastercard` · `revolut` · `wise`

**تجارت الکترونیک** — `shopify` · `airbnb` · `uber` · `nike` · `starbucks` · `pinterest`

**رسانه** — `spotify` · `playstation` · `wired` · `theverge` · `meta`

**خودرو** — `tesla` · `bmw` · `ferrari` · `lamborghini` · `bugatti` · `renault`

**سایر** — `apple` · `ibm` · `nvidia` · `vodafone` · `resend` · `spacex`

**Starters** — `default` (Neutral Modern) · `warm-editorial`

</details>

وارد کردن مجدد کتابخانه از طریق [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts). اضافه کردن برند خودتان → یک `DESIGN.md` در `design-systems/<brand>/` بیاندازید. راهنمای کامل → [`design-systems/README.md`](design-systems/README.md).

[acd2]: https://github.com/VoltAgent/awesome-design-md

---

## افزونه‌ها

**277 افزونه رسمی به‌علاوه 183 مثال مرجع قابل ترکیب مجدد** در [`plugins/_official/`](plugins/_official/) قرار دارند. هر ورودی یک دایرکتوری افزونه قابل حمل است که توسط `open-design.json` به‌علاوه payload مورد نیاز نوع آن لنگر شده است: به عنوان مثال `SKILL.md` برای گردش‌های کاری agent، `template.json` برای الگوهای رسانه‌ای، یا `DESIGN.md` برای ورودی‌های سیستم طراحی. مستقیماً به یک دسته بپرید:

| دسته | تعداد | محتویات |
|---|---|---|
| [`scenarios/`](plugins/_official/scenarios/) | 13 | سناریوهای طراحی کامل — [`od-default`](plugins/_official/scenarios/od-default/), [`od-design-refine`](plugins/_official/scenarios/od-design-refine/), [`od-figma-migration`](plugins/_official/scenarios/od-figma-migration/), [`od-code-migration`](plugins/_official/scenarios/od-code-migration/), [`od-react-export`](plugins/_official/scenarios/od-react-export/), [`od-nextjs-export`](plugins/_official/scenarios/od-nextjs-export/), [`od-vue-export`](plugins/_official/scenarios/od-vue-export/), [`od-media-generation`](plugins/_official/scenarios/od-media-generation/), [`od-new-generation`](plugins/_official/scenarios/od-new-generation/), [`od-tune-collab`](plugins/_official/scenarios/od-tune-collab/), [`od-plugin-authoring`](plugins/_official/scenarios/od-plugin-authoring/), [`od-share-to-community`](plugins/_official/scenarios/od-share-to-community/), [`od-web-effect-extractor`](plugins/_official/scenarios/od-web-effect-extractor/) |
| [`image-templates/`](plugins/_official/image-templates/) | 45 | پرامپت‌های تصویری یک‌ضربی — ویرایشی، سینمایی، محصول، پرتره |
| [`video-templates/`](plugins/_official/video-templates/) | 63 | الگوهای موشن HyperFrames / Seedance / Veo |
| [`design-systems/`](plugins/_official/design-systems/) | 143 | `DESIGN.md` برند بسته‌بندی شده به عنوان افزونه |
| [`atoms/`](plugins/_official/atoms/) | 13 | قطعات UI قابل استفاده مجدد (دکمه‌ها، hero ها، کارت‌های KPI) |
| [`examples/`](plugins/_official/examples/) | 183 | خروجی‌های مرجع قابل ترکیب مجدد |

همچنین [`plugins/community/`](plugins/community/) برای افزونه‌های جامعه و [`plugins/registry/`](plugins/registry/) برای جریان انتشار.

### افزونه‌ها چه کاری می‌توانند انجام دهند

- 🤖 **در هر agent کدنویسی اجرا شوند** — [Claude Code](docs/agent-adapters.md)، Codex، Cursor، Copilot، [OpenClaw](https://github.com/openclaw/openclaw)، [Antigravity](https://antigravity.google)، Hermes، Kimi… از طریق همان پروتکل مهارتی که agent قبلاً می‌شناسد.
- 🔁 **انتقال گردش‌های کاری Figma / Pencil** → منبع React، Next.js یا Vue. [`od-figma-migration`](plugins/_official/scenarios/od-figma-migration/) را ببینید.
- 🛠️ **تازه‌سازی یک کدبیس موجود به مشخصات برند** — یک افزونه را به یک مخزن `git` + `DESIGN.md` اشاره دهید، یک PR دریافت کنید. [`od-code-migration`](plugins/_official/scenarios/od-code-migration/) را ببینید.
- 💾 **پایدارسازی گردش‌های کاری سفارشی** — الگوهای قابل استفاده مجدد تیم شما در کنار آنهایی که ارسال شده‌اند قرار می‌گیرند.

### استفاده از افزونه‌ها

افزونه‌ها در تساوی کامل در **UI وب** و **`od` CLI** هستند — همان endpoint های `/api/plugins`، هر کدام که مناسب است را انتخاب کنید.

**در برنامه دسکتاپ / وب:** صفحه **افزونه** را برای مرور بازار باز کنید و روی **نصب** کلیک کنید؛ درون استودیوی یک پروژه، افزونه‌ها به عنوان چیپ‌های نویسنده ظاهر می‌شوند که برای اعمال (با ورودی‌هایی که اعلام می‌کنند) روی آنها کلیک می‌کنید.

**در خط فرمان** (بدون UI اجرا می‌شود — این مسیری است که agent های خارجی استفاده می‌کنند):

```bash
od plugin list                       # لیست افزونه‌های نصب شده (فیلترهای --task-kind / --mode / --tag)
od plugin search "landing page"      # جستجو با کلیدواژه
od plugin info od-default            # بازرسی متادیتا، ورودی‌ها، قابلیت‌های یک افزونه
od plugin install od-figma-migration # نصب از یک رجیستری؛ همچنین ./local-folder یا یک لینک https://… را می‌پذیرد
od plugin apply od-default --input brief="a one-page pitch for our seed round"
od plugin upgrade od-default         # ارتقا
od plugin uninstall od-default       # حذف نصب
```

هر دستور از `--json` پشتیبانی می‌کند، بنابراین می‌توانید آن را از طریق `jq` / `xargs` به خودکارسازی پایپ کنید.

### ساخت یک افزونه

یک افزونه OpenDesign نیاز به `open-design.json` به علاوه payload مورد نیاز نوع آن دارد. یک مهارت گردش کاری یا سناریو همچنین شامل `SKILL.md` است؛ ورودی‌های الگوی فقط-manifest و سیستم طراحی به جای آن از payload های خودشان استفاده می‌کنند:

```
my-plugin/
├── open-design.json    ← الزامی: متادیتای بازار + ورودی‌ها + پایپلاین + قابلیت‌ها
├── SKILL.md            ← الزامی برای ورودی‌های agent-skill/scenario؛ برای انواع افزونه دیگر حذف شده
├── README.md           ← اختیاری: استفاده، نصب، لینک‌های رجیستری
├── preview/            ← اختیاری: index.html / poster.png (قویاً توصیه می‌شود برای افزونه‌های بصری)
└── examples/           ← اختیاری: موارد استفاده ملموس
```

فیلدهای اصلی `open-design.json`: `specVersion` (در حال حاضر `1.0.0`)، `name` (شناسه پایدار)، `version` (semver)، `compat.agentSkills[].path` اختیاری (به `./SKILL.md` اشاره می‌کند وقتی ورودی یک Agent Skill را در معرض دید قرار می‌دهد)، `od.kind` (`skill` / `scenario` / `atom` / `bundle`)، `od.taskKind` (`new-generation` / `figma-migration` / `code-migration` / `tune-collab`)، `od.mode` (سطح خروجی، مثلاً `prototype` / `deck` / `live-artifact` / `image` / `video` / `hyperframes` / `audio` / `design-system` / `scenario`)، `od.capabilities[]` (**حداقل را اعلام کنید** — یک نصب محدود شده به‌طور پیش‌فرض فقط `prompt:inject` را اعطا می‌کند)، `od.inputs[]` (پارامترهای زمان اعمال).

اسکلت + اعتبارسنجی محلی:

```bash
od plugin scaffold --id my-plugin --title "My Plugin"   # تولید اسکلت
od plugin validate ./my-plugin                          # بررسی manifest / چینش فایل
pnpm guard && pnpm --filter @open-design/plugin-runtime typecheck
```

مجموعه فیلد کامل و قرارداد runtime → [`plugins/spec/SPEC.md`](plugins/spec/SPEC.md)؛ توسعه یک افزونه با یک agent کدنویسی → [`plugins/spec/AGENT-DEVELOPMENT.md`](plugins/spec/AGENT-DEVELOPMENT.md)؛ الگوهای حداقلی کپی-پیست → [`plugins/spec/examples/`](plugins/spec/examples/).

### مشارکت یک افزونه

1. پوشه افزونه را در [`plugins/community/`](plugins/community/) بیاندازید (افزونه‌های شخص ثالث)، یا — برای ارسال آن بسته‌بندی شده با OpenDesign — در سطح تطبیقی [`plugins/_official/`](plugins/_official/).
2. اعتبارسنجی را پاس کنید: `od plugin validate`، `pnpm guard`، `pnpm --filter @open-design/plugin-runtime typecheck`.
3. PR را با استفاده از الگو در [`plugins/spec/CONTRIBUTING.md`](plugins/spec/CONTRIBUTING.md) پر کنید (شناسه، نسخه، مسیر، حالت، قابلیت‌ها، مثال‌های محرک؛ یک اسکرین‌شات / پیش‌نمایش برای افزونه‌های بصری پیوست کنید).
4. برای انتشار در یک رجیستری خارجی (skills.sh / ClawHub / GitHub مستقل) → [`plugins/spec/PUBLISHING-REGISTRIES.md`](plugins/spec/PUBLISHING-REGISTRIES.md).

endpoint رجیستری افزونه: `GET /api/plugins`. نمای کلی دایرکتوری → [`plugins/README.md`](plugins/README.md) ([简体中文](plugins/README.zh-CN.md)).

---

## معماری

```
┌────────────────── مرورگر (Next.js 16) / پوسته Electron ──────────────┐
│  چت · فضای کاری فایل · پیش‌نمایش iframe · تنظیمات · وارد کردن · MCP     │
└──────────────┬─────────────────────────────────────┬─────────────────┘
               │ /api/*                              │
               ▼                                     ▼
   ┌─────────────────────────────────┐   /api/proxy/{provider}/stream (SSE)
   │  daemon محلی (Express+SQLite)  │   ─→ هر BYOK سازگار با OpenAI،
   │                                  │       محافظت شده SSRF در لبه
   │  /api/skills    /api/design-templates    /api/plugins    │
   │  /api/design-systems            │
   │  /api/chat (SSE)   /api/proxy/* │
   │  /api/projects/:id/files/...    │
   │  /api/artifacts/{save,lint}     │
   │  /api/import/claude-design      │
   │  سرور stdio MCP                │
   └─────────┬───────────────────────┘
             │ spawn(cli, [...], { cwd: managed project cwd })
             ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  تعاریف runtime محلی از runtimes/registry.ts می‌آیند؛                 │
   │  رجیستری پایه 27 تعریف دارد (شامل byok-opencode)،           │
   │  پشتیبانی شده توسط 26 فایل اجرایی CLI محلی مجزا زیرا byok-opencode │
   │  فایل اجرایی OpenCode را به اشتراک می‌گذارد. docs/agent-adapters.md را ببینید.                     │
   │  یک مهارت کاربردی یا الگوی طراحی + DESIGN.md را ترکیب می‌کند؛ فایل‌ها را می‌نویسد │
   └──────────────────────────────────────────────────────────────────┘
```

| لایه | استک |
|---|---|
| Frontend | Next.js 16 App Router + React 18 + TypeScript |
| Daemon | Node 24 · Express · SSE streaming · `better-sqlite3` |
| Storage | قبل از تغییر یا مستندسازی مسیرهای ذخیره‌سازی daemon، باید `AGENTS.md` → **قرارداد دایرکتوری داده Daemon** را بخوانید. این README نباید آن را دوباره بیان کند. |
| پیش‌نمایش | اجراهای فایل‌سیستم فایل‌های پروژه اصلی را رندر می‌کنند؛ اجراهای BYOK/plain-API یک بلوک کامل `<artifact>` را به یک iframe ایمن `srcdoc` تجزیه می‌کنند |
| خروجی | HTML (درون‌خطی) · PDF (چاپ مرورگر) · PPTX (محرک agent) · ZIP · Markdown · MP4 (HyperFrames) |
| دسکتاپ | پوسته Electron + رندرر ایمن + IPC sidecar (STATUS · EVAL · SCREENSHOT · CONSOLE · CLICK · SHUTDOWN) |
| چرخه حیات | یک نقطه ورود: `pnpm tools-dev` (start / stop / run / status / logs / inspect / check) |

معماری کامل → [`docs/architecture.md`](docs/architecture.md). پروتکل مهارت → [`docs/skills-protocol.md`](docs/skills-protocol.md). قرارداد آداپتر agent → [`docs/agent-adapters.md`](docs/agent-adapters.md).

---

## نقشه راه

- [x] Daemon + 27 تعریف runtime در 26 فایل اجرایی CLI agent کدنویسی مجزا + رجیستری‌های skill/design-template + کاتالوگ سیستم طراحی
- [x] برنامه وب + چت + فرم سؤال + انتخابگر 5 جهت + پیشرفت todo + پیش‌نمایش ایمن
- [x] بیش از 100 مهارت کاربردی · کاتالوگ الگوی رندرینگ جداگانه · 151 بسته سیستم طراحی · 5 جهت بصری · 5 فریم دستگاه
- [x] پروژه‌های پشتیبانی شده توسط SQLite · مکالمات · پیام‌ها · تب‌ها · الگوها
- [x] پروکسی BYOK چند ارائه‌دهنده (`/api/proxy/{anthropic,openai,azure,google,ollama,senseaudio}/stream`) با پیش‌تنظیمات سازگار با OpenAI شامل Atlas Cloud + محافظ SSRF
- [x] وارد کردن ZIP Claude Design (`/api/import/claude-design`)
- [x] پروتکل Sidecar + دسکتاپ Electron + خودکارسازی IPC
- [x] API lint Artifact + دروازه پیش-انتشار خودنقدی 5 بعدی
- [x] **0.8.0** — زیرساخت بازار افزونه (261 افزونه رسمی، مشخصات manifest، اسکریپت‌های نصب هر agent)
- [x] **0.9.0** — OpenDesign Cloud (سرویس مدل رسمی ساخته شده در برنامه: بدون پیکربندی، ورود یک‌کلیکی)
- [x] **0.10.0** — فضای کاری طراحی همه‌کاره: کل حلقه craft در یک پنجره (مراجع → مواد → ویرایش تعاملی → موشن → تحویل)
- [x] **0.11.0** — _بازار_: ساخته شده به صورت باز — یک بازار جامعه از افزونه‌ها و سیستم‌های طراحی که هر کسی می‌تواند از آنها انتخاب کند و به آنها کمک کند
- [x] **0.12.0** — _سیستم طراحی پشتیبانی شده توسط برند_: برندی که قبلاً دارید را به یک سیستم `DESIGN.md` قابل استفاده مجدد و قابل حمل تبدیل کنید
- [x] **0.13.0** — _در جریان بمانید_: ادامه جلسه بومی، انتخاب سریع‌تر مدل و خروجی مستقیم به PPTX / PDF پشتیبانی شده توسط اسکرین‌شات
- [x] بیلدهای Electron بسته‌بندی شده — macOS (Apple Silicon + Intel) + Windows (x64) + Linux AppImage (مسیر اختیاری)
- [ ] ویرایش‌های جراحی حالت نظر — بخشی ارسال شده؛ وصله‌گذاری هدفمند قابل اعتماد در حال انجام
- [ ] UX پنل تنظیمات منتشر شده توسط AI — هنوز پیاده‌سازی نشده
- [ ] `npx od init` برای اسکافولد کردن یک پروژه با `DESIGN.md`
- [ ] SDK افزونه + `od plugin {add,list,remove,test,publish}` CLI
- [ ] افزونه‌های انتقال Figma / Pencil → React / Next / Vue (آلفا)
- [ ] افزونه تازه‌سازی-کدبیس-موجود (به یک مخزن git + `DESIGN.md` اشاره کنید)

تحویل مرحله‌ای → [`docs/roadmap.md`](docs/roadmap.md).

---

## جامعه

افراد واقعی پشت هر کانال.

- 💬 **Discord** — چت روزانه، اشتراک‌گذاری افزونه، سؤالات → [**discord.gg/mHAjSMV6gz**](https://discord.gg/mHAjSMV6gz)
- 🐦 **X / Twitter** — یادداشت‌های انتشار، نقاط عطف، پشت صحنه → [**@OpenDesignHQ**](https://x.com/OpenDesignHQ)
- 🗣️ **بحث‌های GitHub** — پرسش و پاسخ عمیق، RFC ها، "کار خود را نشان دهید" → [**Discussions**](https://github.com/nexu-io/open-design/discussions)
- 🐛 **مسائل GitHub** — گزارش باگ، درخواست ویژگی → [**Issues**](https://github.com/nexu-io/open-design/issues)

برچسب‌های [`good-first-issue`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) و [`help-wanted`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) آسان‌ترین راه برای ورود هستند.

---

## مشارکت

OpenDesign به حرکت ادامه می‌دهد زیرا مشارکت‌کنندگان — طراحان، مهندسان، نویسندگان پرامپت — به نمایش می‌آیند. بسیاری از پرکاربردترین مهارت‌ها، سیستم‌های طراحی و افزونه‌ها توسط افرادی خارج از تیم اصلی نوشته شده‌اند.

### 🎯 از کجا شروع کنیم (بیشترین اهرم، کمترین تغییر)

| می‌خواهید ارسال کنید… | چگونه | کجا |
|---|---|---|
| یک **مهارت** کاربردی جدید | یک پوشه با `SKILL.md` + `assets/` اختیاری + `references/` بیاندازید | [`skills/`](skills/) · مشخصات در [`docs/skills-protocol.md`](docs/skills-protocol.md) |
| یک **الگوی طراحی** رندرینگ جدید | یک بسته `SKILL.md` قابل رندر اضافه کنید | [`design-templates/`](design-templates/) |
| یک **سیستم طراحی** جدید | یک بسته متمرکز بر `DESIGN.md` بیاندازید؛ `manifest.json`، `tokens.css`، کامپوننت‌ها، دارایی‌ها یا منشأ را در صورت نیاز اضافه کنید | [`design-systems/<brand>/`](design-systems/) |
| یک **افزونه** جدید | `open-design.json` + payload خاص نوع را زیر یک پوشه دسته بیاندازید | [`plugins/community/`](plugins/community/) · مشخصات در [`plugins/spec/SPEC.md`](plugins/spec/SPEC.md) · راهنمای توسعه agent در [`plugins/spec/AGENT-DEVELOPMENT.md`](plugins/spec/AGENT-DEVELOPMENT.md) |
| پشتیبانی از یک **CLI agent کدنویسی** جدید | یک تعریف runtime + ورودی رجیستری؛ یک parser فقط برای یک فرمت سیم جدید اضافه کنید | [`apps/daemon/src/runtimes/defs/`](apps/daemon/src/runtimes/defs/) |
| رفع باگ یا صیقل دادن UI | برچسب [`good-first-issue`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) را مرور کنید | [Issues →](https://github.com/nexu-io/open-design/issues) |
| ترجمه اسناد | فایل‌های `README.<lang>.md` را به‌روزرسانی کنید | [`TRANSLATIONS.md`](TRANSLATIONS.md) |

### 🤖 مشارکت به عنوان یک agent

اگر *شما agent ای هستید که این را می‌خوانید*، سریع‌ترین مسیر این است:

```bash
# 1. راه‌اندازی محلی
git clone https://github.com/nexu-io/open-design.git
cd open-design && corepack enable && pnpm install
pnpm tools-dev run web

# 2. یک good-first-issue پیدا کنید و خودتان را اختصاص دهید
gh issue list --label "good first issue" --state open --limit 20
gh issue develop <number>   # ایجاد یک branch و worktree

# 3. تغییر را ایجاد کنید، بررسی‌ها را اجرا کنید
pnpm guard && pnpm typecheck
pnpm --filter @open-design/<package> test

# 4. PR را باز کنید
gh pr create --fill
```

جریان مشارکت دوستانه برای agent، سبک کد و میله PR → [`CONTRIBUTING.md`](CONTRIBUTING.md) ([Deutsch](docs/i18n/CONTRIBUTING.de.md) · [Français](docs/i18n/CONTRIBUTING.fr.md) · [简体中文](docs/i18n/CONTRIBUTING.zh-CN.md) · [日本語](docs/i18n/CONTRIBUTING.ja-JP.md) · [한국어](docs/i18n/CONTRIBUTING.ko.md) · [Português](docs/i18n/CONTRIBUTING.pt-BR.md) · [ภาษาไทย](docs/i18n/CONTRIBUTING.th.md)).

### 🏅 برنامه OpenDesign Fellow

ما در حال استخدام **OpenDesign Fellow** در سراسر جهان هستیم — Fellow ها محصول را در کنار تیم اصلی شکل می‌دهند، OpenDesign را به صورت رسمی در منطقه خود نمایندگی می‌کنند و جامعه را به صورت محلی رشد می‌دهند، با پشتیبانی مالی ($1,000 / MR)، اعتبار رایگان LLM و یک مسیر بررسی مستقیم. جزئیات → [`MAINTAINERS.md`](MAINTAINERS.md) و اعلامیه در [Discord](https://discord.gg/mHAjSMV6gz).

---

## نگهدارندگان

آنها بار زیادی را تحمل می‌کنند — نگهداری روزانه، بررسی و پشتیبانی جامعه.

<table>
  <tr>
    <td align="center" valign="top" width="200">
      <a href="https://github.com/Nagendhra-web">
        <img src="https://github.com/Nagendhra-web.png" width="96" alt="@Nagendhra-web" /><br/>
        <sub><b>@Nagendhra-web</b></sub>
      </a><br/>
      <sub>نگهدارنده</sub>
    </td>
    <td align="center" valign="top" width="200">
      <a href="https://github.com/Sid-Qin">
        <img src="https://github.com/Sid-Qin.png" width="96" alt="@Sid-Qin" /><br/>
        <sub><b>@Sid-Qin</b></sub>
      </a><br/>
      <sub>نگهدارنده</sub>
    </td>
    <td align="center" valign="top" width="200">
      <a href="https://github.com/YOMXXX">
        <img src="https://github.com/YOMXXX.png" width="96" alt="@YOMXXX" /><br/>
        <sub><b>@YOMXXX</b></sub>
      </a><br/>
      <sub>نگهدارنده</sub>
    </td>
  </tr>
</table>

قوانین نگهدارنده، معیارهای ترفیع و پروتکل خروج → [`MAINTAINERS.md`](MAINTAINERS.md) (همچنین [Deutsch](docs/i18n/MAINTAINERS.de.md) · [Français](docs/i18n/MAINTAINERS.fr.md) · [简体中文](docs/i18n/MAINTAINERS.zh-CN.md) · [日本語](docs/i18n/MAINTAINERS.ja-JP.md) · [한국어](docs/i18n/MAINTAINERS.ko.md) · [Português](docs/i18n/MAINTAINERS.pt-BR.md) · [ภาษาไทย](docs/i18n/MAINTAINERS.th.md)).

## مشارکت‌کنندگان

از همه کسانی که شرکت کرده‌اند تشکر — کد، اسناد، بازخورد، یک مسئله دقیق، یک مهارت جدید، یک سیستم طراحی جدید.

<a href="https://github.com/nexu-io/open-design/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nexu-io/open-design&max=500&columns=20&anon=1&cache_bust=2026-08-04" alt="مشارکت‌کنندگان OpenDesign" />
</a>

---

## فعالیت مخزن

<picture>
  <img alt="OpenDesign — معیارهای مخزن" src="https://repo-assets.open-design.ai/resources/images/github-metrics.svg" />
</picture>

SVG بالا هر روز توسط [`.github/workflows/metrics.yml`](.github/workflows/metrics.yml) با استفاده از [`lowlighter/metrics`](https://github.com/lowlighter/metrics) دوباره تولید می‌شود.

---

## به ما ستاره بدهید

<p align="center">
  <a href="https://github.com/nexu-io/open-design"><img src="https://repo-assets.open-design.ai/resources/images/star-us.png" alt="به OpenDesign در GitHub ستاره بدهید — github.com/nexu-io/open-design" width="100%" /></a>
</p>

اگر این سی دقیقه از شما را ذخیره کرد، یک ★ به آن بدهید. ستاره‌ها اجاره نمی‌پردازند — اما به طراح، agent و مشارکت‌کننده بعدی می‌گویند که این آزمایش ارزش توجه آنها را دارد. یک کلیک، سه ثانیه، یک سیگنال واقعی.

<a href="https://star-history.com/#nexu-io/open-design&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&theme=dark&cache_bust=2026-08-04" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-08-04" />
    <img alt="تاریخچه ستاره OpenDesign" src="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-08-04" />
  </picture>
</a>

---

## مراجع و تبار

| پروژه | نقش |
|---|---|
| Claude Design | محصول متن‌بسته‌ای که این مخزن جایگزین متن‌باز آن است. |
| [`alchaincyf/huashu-design`](https://github.com/alchaincyf/huashu-design) | قطب‌نمای فلسفه طراحی — گردش کار طراح جونیور، پروتکل دارایی برند، چک‌لیست ضد-AI-slop، نقد پنج بعدی. |
| [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) | مهارت PPT وب به سبک مجله، بسته‌بندی شده دقیقاً در [`design-templates/guizang-ppt/`](design-templates/guizang-ppt/). پیش‌فرض برای حالت دک. |
| [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill) | خانواده HTML PPT Studio — 15 الگوی دک، 36 تم، 31 چینش صفحه، runtime انیمیشن، حالت ارائه‌دهنده کارت مغناطیسی. |
| [`OpenCoworkAI/open-codesign`](https://github.com/OpenCoworkAI/open-codesign) | اولین جایگزین متن‌باز Claude Design؛ الگوهای UX که قرض می‌گیریم (حلقه streaming-artifact، iframe ایمن، پنل agent زنده). |
| [`multica-ai/multica`](https://github.com/multica-ai/multica) | معماری daemon + آداپتر — شناسایی agent اسکن PATH، daemon محلی به عنوان تنها فرآیند ممتاز. |
| [`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md) | منبع تاریخی اسکیمای 9 بخشی اصلی `DESIGN.md` و 70 سیستم مشتق شده upstream؛ بسته‌های فعلی ممکن است آن baseline را گسترش دهند. |
| [`bergside/awesome-design-skills`](https://github.com/bergside/awesome-design-skills) | منبع 57 مهارت طراحی اضافه شده در `design-systems/`. |
| [`heygen-com/hyperframes`](https://github.com/heygen-com/hyperframes) | فریم‌ورک گرافیک‌موشن HTML→MP4، به عنوان `hyperframes-html` درجه یک در OpenDesign ادغام شده است. |
| [Claude Code skills][skill] | قرارداد `SKILL.md` که دقیقاً اتخاذ می‌کنیم. |

منشأ دقیق → [`docs/references.md`](docs/references.md).

[skill]: https://docs.anthropic.com/en/docs/claude-code/skills

## مجوز

Apache-2.0. مهارت‌ها و الگوهای بسته‌بندی شده با فایل‌های `LICENSE` خودشان آن مجوزها را حفظ می‌کنند، از جمله `design-templates/guizang-ppt/` (MIT، [@op7418](https://github.com/op7418))، `design-templates/html-ppt/` (MIT، [@lewislulu](https://github.com/lewislulu))، و `skills/web-clone/` (MIT، [@Jane-xiaoer](https://github.com/Jane-xiaoer)).
