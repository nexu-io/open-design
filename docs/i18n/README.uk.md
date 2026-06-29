<h1 align="center">Open Design: відкрита альтернатива Claude Design</h1>

> 🔥 **Open Design 0.10.0 вже тут: універсальний Agentic-робочий простір для дизайну.** Усе ремесло тепер живе в одному вікні — від розмитої ідеї до пошуку референсів, збирання матеріалу, інтерактивного редагування, черги коментарів, шліфування анімацій і передачі результату редактору чи Code Agent — не виходячи із застосунку. З паралельними сесіями це вже не один асистент, а ціла локальна команда дизайнерів, що працює на вас. [Завантажити 0.10.0](https://github.com/nexu-io/open-design/releases) · [Долучитися до обговорення](https://github.com/nexu-io/open-design/discussions/4153)
>
> ⚡ **Open Design AMR (Agentic Model Router) — офіційний сервіс моделей.** Одне поповнення — і GPT, Claude, Gemini та DeepSeek доступні просто в Open Design: 20+ флагманських моделей, нуль налаштувань, оплата за реальне використання токенів. [Спробувати AMR](https://open-design.ai/amr/)
>
> 🏅 **Програма Open Design Fellow тепер відкрита.** Якщо ви теж вірите, що дизайн має бути відкритим — станьте Open Design Fellow, формуйте продукт разом із основною командою та допомагайте більшій кількості людей брати участь у визначенні майбутнього дизайну. Деталі → [`MAINTAINERS.md`](../../MAINTAINERS.md) та [Discord](https://discord.gg/mHAjSMV6gz).

<p align="center">
  <img src="https://repo-assets.open-design.ai/resources/images/hero.png" alt="Open Design — The open-source Claude Design alternative · 150 Design Systems · 261 Plugins · 21 Coding Agents · 14 Media Providers" width="100%" />
</p>

<p align="center">
  <a href="https://open-design.ai/">Вебсайт</a> ·
  <a href="https://open-design.ai/">Завантажити</a> ·
  <a href="https://open-design.ai/amr/">Model Router</a> ·
  <a href="https://discord.gg/mHAjSMV6gz">Discord</a> ·
  <a href="https://x.com/OpenDesignHQ">Стежити за @OpenDesignHQ</a>
</p>

<p align="center">
  <a href="https://github.com/nexu-io/open-design/releases"><img alt="release" src="https://img.shields.io/github/v/release/nexu-io/open-design?style=flat&color=blueviolet&label=release&include_prereleases&display_name=tag" /></a>
  <a href="../../LICENSE"><img alt="license" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat" /></a>
  <a href="https://discord.gg/mHAjSMV6gz"><img alt="discord" src="https://img.shields.io/discord/1479002485040480266?style=flat&logo=discord&logoColor=white&label=discord&color=5865F2&cacheSeconds=3600" /></a>
  <a href="../../QUICKSTART.md"><img alt="quickstart" src="https://img.shields.io/badge/quickstart-3%20commands-green?style=flat" /></a>
</p>

<p align="center"><a href="../../README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ko.md">한국어</a> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ar.md">العربية</a> · <a href="README.ru.md">Русский</a> · <b>Українська</b> · <a href="README.tr.md">Türkçe</a></p>

---

## Що таке Open Design

🎨 **Локально-орієнтована альтернатива [Claude Design][cd] з відкритим кодом.** &nbsp;🖥️ **Нативний десктопний застосунок для macOS і Windows.** &nbsp;⚡ **100+ навичок** · ✨ **150 систем `DESIGN.md` брендового рівня** · 📦 **261 готовий до використання плагін.** &nbsp;🖼️ Генерує **вебпрототипи · десктопні · мобільні прототипи**, **живі дашборди / артефакти**, **презентації**, **зображення**, **відео**, а також моушн-графіку **HyperFrames**. 🔒 Попередній перегляд у пісочниці iframe · експорт у HTML / PDF / PPTX / MP4. &nbsp;🤖 **Працює на Claude Code · OpenClaw · Codex · Cursor · OpenCode · Qwen · Copilot · Hermes · Kimi · Antigravity і 21 локальному CLI**, або на будь-якій OpenAI-сумісній кінцевій точці через BYOK.

Open Design — це те, що ви отримуєте, коли **agent-native** цикл, який Anthropic випустила разом із Claude Design — з'ясуй бриф, зафіксуй напрям, передавай артефакт потоком, критикуй, доставляй — перестає бути закритим і стає **файловою системою навичок, дизайн-систем і плагінів**, яку кодувальні агенти, що вже є на вашому ноутбуці, можуть читати, записувати та реміксувати. Ваш CLI стає рушієм дизайну, ваш ноутбук стає студією, а `DESIGN.md` вашої команди стає контрактом бренду.

Це також **альтернатива Figma для епохи агентів** — замість того, щоб пересувати пікселі на полотні, вона доставляє односторінкові артефакти на справжньому CSS, справжніх шрифтах, справжніх компонентах, експортовані одразу в HTML / PDF / PPTX / MP4 — уже сформовані вашою дизайн-системою, уже готові до запуску всередині агента, яким ви користуєтеся щодня.

[cd]: https://x.com/claudeai/status/2045156267690213649

---

## Огляд продукту

Швидкий погляд на те, що таке Open Design і що він робить. Почніть з **Home**, оркеструйте повторювані робочі процеси за допомогою **Automation**, виокремте контракт бренду в **Design System** та розширюйте можливості за допомогою **Plugins** і **integrations**; усередині **Studio** будь-якого проєкту та сама дизайн-система передає потоком прототипи, живі артефакти, HyperFrames, презентації та зображення.

### Основні сторінки

<table>
<tr>
<td valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/home.png" alt="Home page" /><br/>
<sub><b>Home</b> — оглядова точка входу. Виберіть навичку та дизайн-систему, введіть бриф і запустіть усе з одного місця.</sub>
</td>
</tr>
</table>

<table>
<tr>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/automation.png" alt="Automation page" /><br/>
<sub><b>Automation</b> — оркеструйте повторювані дизайн-процеси в багаторазові автоматизації з можливістю планування.</sub>
</td>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/design-system.png" alt="Design System page" /><br/>
<sub><b>Design System</b> — виокремте <code>DESIGN.md</code> вашої команди в контракт бренду, який формує кожен результат.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/plugin.png" alt="Plugin page" /><br/>
<sub><b>Plugin</b> — переглядайте, встановлюйте та поширюйте плагіни робочих процесів, щоб розширювати генерацію на вимогу.</sub>
</td>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/integrations.png" alt="Integrations page" /><br/>
<sub><b>Integrations</b> — підключайте зовнішні системи та інструменти MCP й використовуйте Open Design з будь-якого IDE, скрипта чи автоматизації.</sub>
</td>
</tr>
</table>

### Studio — багато типів артефактів в одному проєкті

Усередині Studio проєкту та сама дизайн-система передає потоком кілька типів артефактів:

<table>
<tr>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/studio-prototype.png" alt="Prototype" /><br/>
<sub><b>Prototype</b> — односторінкові HTML-артефакти, які зчитують вашу дизайн-систему та рендеряться в iframe-пісочниці, доступні для миттєвого перегляду й завантаження як вихідний код.</sub>
</td>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/studio-hyperframe.png" alt="HyperFrame" /><br/>
<sub><b>HyperFrame</b> — програмний рух і анімована графіка, відрендерені у справжній MP4 (наприклад, 1920×1080 · 30fps).</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/studio-ppt.png" alt="Deck" /><br/>
<sub><b>Deck</b> — презентації, які можна гортати, навігувати з клавіатури та експортувати в PPTX / PDF.</sub>
</td>
<td width="50%" valign="top">
<img src="https://repo-assets.open-design.ai/resources/images/product/studio-image.png" alt="Image" /><br/>
<sub><b>Image</b> — зображення та візуальні ресурси брендового рівня з генерацією та завантаженням у високій роздільності.</sub>
</td>
</tr>
</table>

---

## Сумісність платформ

> Open Design постачається як **навички, CLI та сервер MCP**, які основні кодувальні агенти споживають нативно. Щойно OD встановлено, одна команда `od mcp install <agent>` під'єднує сервер MCP до конфігурації цього агента, і ви викликаєте ті самі інструменти зсередини будь-якого агента.

| Кодувальний агент / платформа &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | Статус &nbsp;&nbsp; | Встановлення сервера MCP одним рядком &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; |
|---|:---:|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | ✅ Підтримується | `od mcp install claude` |
| [Codex CLI](https://github.com/openai/codex) | ✅ Підтримується | `od mcp install codex` |
| [Cursor](https://www.cursor.com/cli) | ✅ Підтримується | `od mcp install cursor` |
| [VS Code + GitHub Copilot](https://github.com/features/copilot) | ✅ Підтримується | `od mcp install copilot` |
| [GitHub Copilot CLI](https://github.com/features/copilot/cli) | ✅ Підтримується | `od mcp install copilot` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | ✅ Підтримується | `od mcp install gemini` |
| [OpenCode](https://opencode.ai/) | ✅ Підтримується | `od mcp install opencode` |
| [OpenClaw](https://github.com/openclaw/openclaw) | ✅ Підтримується | `od mcp install openclaw` |
| [Antigravity](https://antigravity.google) | ✅ Підтримується | `od mcp install antigravity` |
| [Cline](https://github.com/cline/cline) | ✅ Підтримується | `od mcp install cline` |
| [Trae](https://www.trae.ai/) | ✅ Підтримується | `od mcp install trae` |
| [Kimi CLI](https://github.com/MoonshotAI/kimi-cli) | ✅ Підтримується | `od mcp install kimi` |
| [Pi Agent](https://github.com/badlogic/pi-mono) | ✅ Підтримується | `od mcp install pi` |
| [Mistral Vibe CLI](https://github.com/mistralai/mistral-vibe) | ✅ Підтримується | `od mcp install vibe` |
| [Hermes Agent](https://github.com/nousresearch/hermes-agent) | ✅ Підтримується | `od mcp install hermes` |

`od mcp install <agent> --print` для попереднього перегляду без застосування · `--uninstall` для видалення · повний список через `od mcp install --help`.

<p align="center">
  <img src="https://repo-assets.open-design.ai/resources/images/coding-agents.png" alt="The 21 coding-agent CLIs Open Design supports — Claude Code · Codex · OpenCode · Hermes · Antigravity · Gemini · Grok Build · Kimi · Cursor Agent · Qwen · Qoder · GitHub Copilot · Pi · Kiro · Kilo · Mistral Vibe · DeepSeek · Reasonix · Aider · Devin · Trae" width="100%" />
</p>

**Не встановлено жодного CLI?** Проксі BYOK на `POST /api/proxy/{anthropic,openai,azure,google,ollama,senseaudio}/stream` дає вам той самий цикл (без породження процесу) — вставте `baseUrl` + `apiKey` + `model`, з підтримкою OpenAI, Anthropic, Azure OpenAI, Google Gemini, Ollama, LM Studio, vLLM або будь-якої OpenAI-сумісної кінцевої точки. Захист від SSRF для кожної цілі блокує внутрішні IP / link-local / CGNAT на межі демона.

Контракт адаптера та парсери потоку містяться в [`apps/daemon/src/agents.ts`](../../apps/daemon/src/agents.ts). Додавання нового CLI — це один запис, див. [`docs/agent-adapters.md`](../../docs/agent-adapters.md).

---

## Демо

Чотири основні категорії продукту, усі відрендерені кодувальним агентом, що працює на вашому ноутбуці. Натисніть на мініатюру, щоб побачити реальний приклад.

### 1 · Прототипи — веб · десктоп · мобільні

Типова поверхня виведення. Односторінкові HTML-артефакти, які зчитують ваш `DESIGN.md` і рендеряться в iframe-пісочниці.

<table>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/01-entry-view.png" alt="Entry view" /><br/>
<sub><b>Вікно входу</b> — виберіть навичку, виберіть дизайн-систему, введіть бриф. Єдина поверхня для прототипів, дашбордів, презентацій, мобільних застосунків, журнальних сторінок.</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/mobile-onboarding.png" alt="Mobile onboarding" /><br/>
<sub><b>Мобільний прототип</b> — піксельно точна оболонка iPhone 15 Pro, багатоекранні потоки. Агент ніколи не перемальовує рамку телефона; спільні рамки пристроїв містяться в <code>assets/frames/</code>.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/dating-web.png" alt="Web prototype dating-web" /><br/>
<sub><b>Вебпрототип</b> — редакторський дашборд зі смугами прокрутки, KPI та діаграмами. Відрендерено прямо з <code>design-templates/dating-web/</code>.</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/gamified-app.png" alt="Gamified app" /><br/>
<sub><b>Прототип мобільного застосунку</b> — гейміфікований потік із трьох екранів зі стрічками XP та деталями квестів. Передавайте прямо в Cursor / Codex / Claude Code, щоб перетворити на React/Next/Vue.</sub>
</td>
</tr>
</table>

### 2 · Живі артефакти та дашборди

Живі дашборди, кімнати рішень, стіни KPI — односторінкові артефакти, які підтягують дані через панель налаштувань і залишаються редагованими на місці.

<table>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/live-dashboard.png" alt="Live dashboard" /><br/>
<sub><b>Живий дашборд</b> — редагована стіна KPI, чия панель налаштувань виводить на поверхню параметри, які варто підкоригувати. Агент видає маніфест, і iframe перерендерюється без перезавантаження.</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/research-decision-room.png" alt="Decision room" /><br/>
<sub><b>Кімната рішень</b> — багатоджерельний брифінговий артефакт для зустрічей із продукту / досліджень / операцій.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/github-dashboard.png" alt="GitHub dashboard" /><br/>
<sub><b>Дашборд у стилі GitHub</b> — метрики репозиторію, подані як живий артефакт.</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/flowai-live-dashboard-template.png" alt="Flow live dashboard" /><br/>
<sub><b>Шаблон живого дашборда Flow</b> — KPI-шаблон для конкретної предметної області, брендований через активний <code>DESIGN.md</code>.</sub>
</td>
</tr>
</table>

### 3 · Презентації — журнальні презентації, щотижневі оновлення, пітчі

<table>
<tr>
<td width="50%" valign="top">
<img src="../../docs/screenshots/07-magazine-deck.png" alt="Magazine deck (guizang-ppt)" /><br/>
<sub><b>Режим презентації (guizang-ppt)</b> — журнальні макети, WebGL-герой, чеклісти P0/P1/P2. Включено дослівно з <a href="https://github.com/op7418/guizang-ppt-skill"><code>op7418/guizang-ppt-skill</code></a> зі збереженням оригінальної ліцензії.</sub>
</td>
<td width="50%" valign="top">
<img src="../../docs/screenshots/skills/deck-swiss-international.png" alt="Swiss deck" /><br/>
<sub><b>Презентація у швейцарському інтернаціональному стилі</b> — закріплена на сітці, монохромні акценти. Один із <b>15 шаблонів презентацій</b> та <b>36 тем</b> у <code>design-templates/html-ppt-*/</code>.</sub>
</td>
</tr>
</table>

Кожна презентація експортується в **HTML** (один файл, вбудовані ресурси), **PDF** (друк із браузера, з урахуванням презентації), **PPTX** (навичка під керуванням агента), **ZIP** (архів) або **Markdown**.

### 4 · Зображення — `gpt-image-2`, ImageRouter, користувацький API

<table>
<tr>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776662673014_nf0taw_HGRMNDybsAAGG88.jpg" alt="Illustrated city food map" /><br/><sub><b>Ілюстрована мапа міської їжі</b><br/>Намальований від руки редакторський тревел-постер</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453149026_gd2k50_HHCSvymboAAVscc.jpg" alt="Cinematic elevator scene" /><br/><sub><b>Кінематографічна сцена в ліфті</b><br/>Редакторський однокадровий стоп-кадр</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453164993_mt5b69_HHDoWfeaUAEA6Vt.jpg" alt="Cyberpunk anime portrait" /><br/><sub><b>Кіберпанк-портрет</b><br/>Аватар профілю — неоновий текст на обличчі</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776661968404_8a5flm_HGQc_KOaMAA2vt0.jpg" alt="3D stone staircase evolution" /><br/><sub><b>3D кам'яні сходи</b><br/>Інфографіка з тесаного каменю</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453184257_vb9hvl_HG9tAkOa4AAuRrn.jpg" alt="Glamorous portrait" /><br/><sub><b>Гламурний портрет</b><br/>Редакторський студійний знімок</sub></td>
</tr>
</table>

**93 готових до відтворення промпти** містяться в [`prompt-templates/`](../../prompt-templates/) — мініатюри попереднього перегляду, повний текст промпта, цільова модель, співвідношення сторін та зазначення джерела. Один клік скидає бриф у композитор.

### 5 · Відео та HyperFrames — моушн-графіка agent-native

**[HyperFrames][hyperframes]** — це відкрита, agent-native відеоплатформа від HeyGen, інтегрована як повноправний учасник в Open Design. Агент пише HTML + CSS + GSAP, а HyperFrames рендерить це в детермінований MP4 через headless Chrome + FFmpeg. Поєднайте її з **Seedance 2.0** для кінематографічного t2v / i2v, **Veo 3 / Sora 2 / Kling 2** для маршрутизованих варіантів моделей та **Suno v5 / Lyria 2** для аудіошару.

<table>
<tr>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-saas-product-promo-30s.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="SaaS promo" /></a><br/><sub><b>30-секундне промо SaaS-продукту</b> · 16:9 · 3D-розкриття UI</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-tiktok-karaoke-talking-head.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/tiktok-follow.png" alt="TikTok karaoke" /></a><br/><sub><b>TikTok-караоке з говорильною головою</b> · 9:16 · TTS + синхронізовані за словами субтитри</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-brand-sizzle-reel.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Brand sizzle reel" /></a><br/><sub><b>30-секундний брендовий sizzle-ролик</b> · 16:9 · аудіореактивна кінетична типографіка</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-data-bar-chart-race.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/data-chart.png" alt="Bar chart race" /></a><br/><sub><b>Гонка стовпчикових діаграм</b> · 16:9 · інфографіка даних у стилі NYT</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-flight-map-route.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/nyc-paris-flight.png" alt="Flight map" /></a><br/><sub><b>Мапа польоту</b> · 16:9 · розкриття маршруту в стилі Apple</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-logo-outro-cinematic.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Logo outro" /></a><br/><sub><b>4-секундна кінематографічна заставка логотипа</b> · 16:9 · поелементне складання + bloom</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-money-counter-hype.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/apple-money-count.png" alt="Money counter" /></a><br/><sub><b>Лічильник грошей $0 → $10K</b> · 9:16 · хайп у стилі Apple</sub></td>
<td width="25%" valign="top"><a href="../../prompt-templates/video/hyperframes-website-to-video-promo.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Website to video" /></a><br/><sub><b>Сайт-у-відео</b> · 16:9 · захоплює сайт у 3 вікнах перегляду</sub></td>
</tr>
</table>

11 шаблонів HyperFrames + 39 промптів Seedance постачаються разом із репозиторієм. Мініатюри каталогу © HeyGen; платформа під ліцензією Apache-2.0. Специфічний для OD робочий процес рендерингу (кеш композиції, обхідний шлях sandbox-exec, MP4-як-чип) детально описаний у [`design-templates/hyperframes/`](../../design-templates/hyperframes/).

[hyperframes]: https://github.com/heygen-com/hyperframes

---

## Чому Open Design

> **У квітні 2026 року Anthropic випустила [Claude Design][cd] — уперше LLM перестала писати прозу й почала доставляти дизайн-артефакти безпосередньо.** Це стало вірусним. Але вона залишилася закритою, лише платною, лише хмарною, прив'язаною до моделі Anthropic, навичок Anthropic, поверхні Anthropic. Без виходу, без самохостингу, без розгортання на Vercel, без можливості підставити власного агента.

Open Design (OD) — це альтернатива з відкритим кодом. Той самий цикл, та сама ментальна модель «спершу артефакт», без жодної прив'язки:

- 🤖 **Agent-native, незалежна від моделі.** Ми не постачаємо агента. `claude` / `codex` / `cursor-agent` / `copilot` / `hermes` / `kimi`, які вже є у вашому `PATH`, і є рушієм дизайну. Замінюйте одним кліком.
- 🧠 **Брендовий рівень за замовчуванням.** Кожен рендер зчитує активний `DESIGN.md` — схему з 9 розділів, що охоплює палітру, типографіку, відступи, рух, голос, антипатерни. 150 систем постачаються разом із репозиторієм (Linear, Stripe, Vercel, Airbnb, Apple, Tesla, Notion, Anthropic, Cursor, Supabase, Figma…). Покладіть теку всередину — селектор її знайде.
- 🖥️ **Локально-орієнтована, BYOK на кожному шарі.** Нативні десктопні застосунки залишаються локальними, без звернень у хмару. Перш ніж описувати шляхи даних демона, необхідно прочитати кореневий `AGENTS.md`, розділ **Daemon data directory contract**.
- 🌍 **Композиційна на трьох площинах.** **Плагіни** несуть робочі процеси, що запускаються · **навички** несуть дизайнерський смак агента · **дизайн-системи** несуть бренд. Усі три — це звичайні файли, які будь-хто може створювати, версіонувати та публікувати.
- 🔁 **Оновлюйте наявну кодову базу.** Передайте агенту репозиторій `git` + `DESIGN.md`, і він рефакторить ваші реальні компоненти відповідно до специфікації бренду. Спеціальні плагіни мігрують робочі процеси Figma / Pencil у код React / Next.js / Vue.
- 🔒 **Приватність за переконанням.** Усе працює там, де живуть ваші дані — на вашому ноутбуці, на сервері вашої команди, у вашому проєкті Vercel. Коли потрібна мережа, проксі BYOK захищений від SSRF.

### Порівняння

| | [Claude Design][cd] | Figma | Lovable / v0 / Bolt | **Open Design** |
|---|---|---|---|---|
| Відкритий код | ❌ | ❌ | ❌ | **✅ Apache-2.0** |
| Самохостинг / десктоп | ❌ | ❌ | ❌ | **✅ macOS + Windows + Vercel** |
| Agent-native (працює у вашому CLI) | Лише Anthropic | ❌ | Лише хмарний агент | **✅ 21 CLI + BYOK** |
| `DESIGN.md` брендового рівня | Пропрієтарний | Theme JSON | Обмежені токени | **✅ 150 готових систем** |
| Навички / плагіни / шаблони | Закриті | Магазин плагінів | Закриті | **✅ 100+ навичок · 261 плагін** |
| HyperFrames (HTML→MP4) | ❌ | ❌ | ❌ | **✅ Повноправно** |
| Оновлення наявного репозиторію до бренду | ❌ | ❌ | ❌ | **✅ через агента + `DESIGN.md`** |
| Мінімальний білінг | Pro / Max / Team | Pro / Org | Pro / Team | **BYOK · будь-яка сумісна кінцева точка** |

---

## Швидкий старт

### 🖥️ Завантажте десктопний застосунок (рекомендовано — нуль конфігурації)

Найшвидший спосіб скористатися Open Design. Без Node, без pnpm, без клонування.

- **macOS** (Apple Silicon · Intel x64) → [**open-design.ai**](https://open-design.ai/) або [GitHub Releases](https://github.com/nexu-io/open-design/releases)
- **Windows** (x64) → [**open-design.ai**](https://open-design.ai/) або [GitHub Releases](https://github.com/nexu-io/open-design/releases)
- **Linux** (AppImage, опціональна лінія) → [GitHub Releases](https://github.com/nexu-io/open-design/releases)

Після встановлення: застосунок автоматично виявляє кожен CLI кодувального агента у вашому `PATH`, завантажує 100+ навичок і 150 дизайн-систем та дозволяє ввести бриф у вікні входу.

### 🤖 Встановіть у свого кодувального агента (без UI)

Ви можете користуватися Open Design, жодного разу не відкриваючи GUI — викликайте його як навичку, плагін або сервер MCP усередині Claude Code, Codex, Cursor, Copilot, OpenClaw, Antigravity, Hermes, Kimi тощо.

```bash
# One-line install into the agent you're using:
od mcp install <agent>
# <agent> = claude | codex | cursor | copilot | openclaw | antigravity | gemini
#         | pi | vibe | hermes | cline | kimi | trae | opencode
```

Потім усередині агента:

```
> Use open-design to generate a landing page with the Linear design system
```

Агент зчитує `skills/`, обирає правильний `SKILL.md`, прив'язує названий вами `DESIGN.md` і видає `<artifact>`, доступний для перегляду за адресою `http://localhost:7456`.

### 🐳 Запуск через Docker

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design/deploy
cp .env.example .env
echo "OD_API_TOKEN=$(openssl rand -hex 32)" >> .env
docker compose up -d
# open http://localhost:7456
```

### 🚀 Розгортання на Sealos

[![Deploy on Sealos](https://sealos.io/Deploy-on-Sealos.svg)](https://sealos.io/products/app-store/open-design/)

Шаблон Sealos App Store запускає опублікований Docker-образ Open Design із постійним сховищем робочої області та Basic Auth на публічному проксі. Для користувацьких публічних або спільних Docker-розгортань дотримуйтеся рекомендацій щодо зворотного проксі та `OPEN_DESIGN_ALLOWED_ORIGINS` у [`deploy/README.md`](../../deploy/README.md#local-compose).

### 🧑‍💻 Запуск із вихідного коду

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable && pnpm install
pnpm tools-dev run web
```

Node `~24`, pnpm `10.33.x`. Користувачі Windows, див. [`docs/windows-troubleshooting.md`](../../docs/windows-troubleshooting.md). Повний швидкий старт, змінні середовища, Nix flake та процес упакованого збирання → [`QUICKSTART.md`](../../QUICKSTART.md).

### Повний робочий процес — від брифа до артефакта

`бриф → плагін → напрям → дизайн-система → артефакт → передача → пам'ять`

1. **PM подає бриф.** Селектор плагінів пропонує лендинг · пітч-презентацію · дашборд · допис у соцмережі · PM-специфікацію · табель OKR…
2. **Дизайнер (або агент) фіксує напрям.** Немає бренду? Виберіть з-поміж 5 курованих напрямів. Маєте бренд? Скиньте скриншот / URL → агент під'єднує GitHub, імпортує Figma та кодифікує багаторазовий `DESIGN.md`.
3. **Агент видає перший `<artifact>`.** Плагін + навичка + `DESIGN.md` прив'язані. Він передається потоком в iframe-пісочницю, редагований на місці — не «згенерувати з нуля».
4. **Передача в інженерію.** Артефакт — це справжній HTML/CSS — скиньте його в Cursor, Codex або Claude Code, щоб продовжувати будувати як код. Або експортуйте PPTX / PDF / MP4 прямо в маркетинг.
5. **Open Design стає розумнішим у міру використання.** Ваші скриншоти, шрифти, палітри та підтверджені артефакти накопичуються як значення за замовчуванням для наступної сесії. Менше переробки, менше дрейфу.

---

## Використання Open Design зі свого кодувального агента

Open Design постачає **сервер MCP через stdio** та **скрипти встановлення** для кожного агента. Будь-який MCP-сумісний агент в іншому репозиторії може читати файли з ваших локальних проєктів Open Design безпосередньо — CSS токенів, JSX-компоненти, вхідний HTML — як структурований API, до якого можна звертатися за іменем. Агент завжди бачить живий файл, а не застарілий експорт.

```bash
# One-line install (16+ CLIs supported):
od mcp install <agent>

# Then the agent can:
od search-files "primary button"      # search files across projects
od get-file design-systems/linear-app/DESIGN.md
od get-artifact <slug>                # latest rendered artifact
od plugin run web-prototype --brief "..."
od skill list --scenario marketing
```

**Чому MCP?** Експорт і повторне приєднання zip-архіву на кожній ітерації порушує потік. MCP відкриває джерело дизайну безпосередньо — агент завжди бачить живий файл.

**Для агента, що починає з нуля,** інсталятор розміщує `~/.config/<agent>/open-design.json` (або платформенний еквівалент) плюс готовий до вставлення фрагмент MCP. Cursor отримує deeplink в один клік; Claude Code отримує однорядкову команду `claude mcp add-json`; кожен інший агент отримує JSON у схемі, якої очікує його конфігурація. Повний процес для кожного агента → **Settings → MCP server** у десктопному застосунку або [`docs/agent-adapters.md`](../../docs/agent-adapters.md).

**Модель безпеки.** За замовчуванням лише для читання, демон прив'язується до `127.0.0.1`, а SSRF блокується на межі проксі. Доступ із LAN вимагає явного `OD_BIND_HOST` плюс `OD_ALLOWED_ORIGINS`. Облікові дані конекторів та маршрути попереднього перегляду живих артефактів залишаються лише на петлевому інтерфейсі незалежно від цього.

---

## Навички

**100+ навичок постачаються «з коробки»** — кожна є текою в [`skills/`](../../skills/), що дотримується конвенції [`SKILL.md`][skill] Claude Code, розширеної frontmatter `od:` (`mode`, `platform`, `scenario`, `preview.type`, `design_system.requires`, `default_for`, `fidelity`, `example_prompt`). Покладіть теку всередину, перезапустіть демон — і вона з'явиться в селекторі.

Два **режими** є основою каталогу: `prototype` (односторінкові артефакти web/mobile/desktop) та `deck` (презентації з горизонтальним гортанням). Також режими `image`, `video`, `audio`, `template`, `design-system` та `utility`. Поле **`scenario`** групує їх за аудиторією: `design` · `marketing` · `operation` · `engineering` · `product` · `finance` · `hr` · `sale` · `personal`.

| Навичка | Режим | Сценарій | Що вона створює |
|---|---|---|---|
| [`web-prototype`](../../design-templates/web-prototype/) | prototype | design | Типовий лендинг / герой |
| [`saas-landing`](../../design-templates/saas-landing/) | prototype | marketing | Герой / функції / ціни / CTA |
| [`dashboard`](../../design-templates/dashboard/) | prototype | operation | Адмін / аналітика (з бічною панеллю) |
| [`mobile-app`](../../design-templates/mobile-app/) | prototype | design | Застосунок у рамці iPhone 15 Pro / Pixel |
| [`mobile-onboarding`](../../design-templates/mobile-onboarding/) | prototype | design | Заставка · ціннісна пропозиція · потік входу |
| [`social-carousel`](../../design-templates/social-carousel/) | prototype | marketing | Карусель із 3 карток 1080×1080 |
| [`email-marketing`](../../design-templates/email-marketing/) | prototype | marketing | Брендований email із безпечним табличним фолбеком |
| [`magazine-poster`](../../design-templates/magazine-poster/) | prototype | marketing | Односторінковий журнальний макет |
| [`motion-frames`](../../design-templates/motion-frames/) | prototype | marketing | Зациклений CSS-моушн-герой |
| [`sprite-animation`](../../design-templates/sprite-animation/) | prototype | marketing | 8-бітний піксельний анімований пояснювач |
| [`pm-spec`](../../design-templates/pm-spec/) | prototype | product | PM-специфікація (з ToC + журналом рішень) |
| [`team-okrs`](../../design-templates/team-okrs/) | prototype | product | Табель OKR |
| [`eng-runbook`](../../design-templates/eng-runbook/) | prototype | engineering | Runbook інцидентів |
| [`finance-report`](../../design-templates/finance-report/) | prototype | finance | Виконавче фінансове резюме |
| [`hr-onboarding`](../../design-templates/hr-onboarding/) | prototype | hr | План онбордингу на посаду |
| [`guizang-ppt`](../../design-templates/guizang-ppt/) | deck | marketing | Веб-PPT у журнальному стилі (типовий для презентацій) |
| [`html-ppt-*`](../../design-templates/) | deck | marketing | 15 шаблонів презентацій × 36 тем (головний шаблон у [`design-templates/html-ppt/`](../../design-templates/html-ppt/)) |
| [`hyperframes`](../../design-templates/hyperframes/) | video | marketing | Моушн-графіка HTML → MP4 (OSS-платформа HeyGen) |
| [`critique`](../../design-templates/critique/) | utility | design | П'ятивимірний табель самокритики |
| [`tweaks`](../../design-templates/tweaks/) | utility | design | Маніфест панелі налаштувань, виданий ШІ |

Повний протокол навичок → [`docs/skills-protocol.md`](../../docs/skills-protocol.md). Кінцева точка реєстру навичок: `GET /api/skills`.

---

## Дизайн-системи

**150 систем `DESIGN.md` брендового рівня** постачаються разом із репозиторієм — кожна є одним файлом Markdown зі схемою з 9 розділів (колір, типографіка, відступи, макет, компоненти, рух, голос, бренд, антипатерни), з [`VoltAgent/awesome-design-md`][acd2]. Перемкніть систему → наступний рендер використовує нові токени. Без theme JSON.

<details>
<summary><b>Повний каталог (натисніть, щоб розгорнути)</b></summary>

**AI та LLM** — `claude` · `cohere` · `mistral-ai` · `minimax` · `together-ai` · `replicate` · `runwayml` · `elevenlabs` · `ollama` · `x-ai`

**Інструменти розробника** — `cursor` · `vercel` · `linear-app` · `framer` · `expo` · `clickhouse` · `mongodb` · `supabase` · `hashicorp` · `posthog` · `sentry` · `warp` · `webflow` · `sanity` · `mintlify` · `lovable` · `composio` · `opencode-ai` · `voltagent`

**Продуктивність** — `notion` · `figma` · `miro` · `airtable` · `superhuman` · `intercom` · `zapier` · `cal` · `clay` · `raycast`

**Fintech** — `stripe` · `coinbase` · `binance` · `kraken` · `mastercard` · `revolut` · `wise`

**Електронна комерція** — `shopify` · `airbnb` · `uber` · `nike` · `starbucks` · `pinterest`

**Медіа** — `spotify` · `playstation` · `wired` · `theverge` · `meta`

**Автомобільна сфера** — `tesla` · `bmw` · `ferrari` · `lamborghini` · `bugatti` · `renault`

**Інше** — `apple` · `ibm` · `nvidia` · `vodafone` · `resend` · `spacex`

**Стартери** — `default` (Neutral Modern) · `warm-editorial`

</details>

Повторно імпортуйте бібліотеку через [`scripts/sync-design-systems.ts`](../../scripts/sync-design-systems.ts). Додайте власний бренд → покладіть `DESIGN.md` у `design-systems/<brand>/`. Повний посібник → [`design-systems/README.md`](../../design-systems/README.md).

[acd2]: https://github.com/VoltAgent/awesome-design-md

---

## Плагіни

**261 офіційний плагін** міститься в [`plugins/_official/`](../../plugins/_official/). Кожен плагін — це **портативна тека agent-skill** — `SKILL.md` (зчитувана будь-яким агентом, що підтримує Agent Skills), плюс опціональний маніфест `open-design.json`, який надає Open Design метадані маркетплейсу, входи, попередні перегляди, конвеєри та декларації можливостей. Перейдіть одразу до категорії:

| Категорія | Кількість | Вміст |
|---|---|---|
| [`scenarios/`](../../plugins/_official/scenarios/) | 11 | Повні дизайн-сценарії — [`od-default`](../../plugins/_official/scenarios/od-default/), [`od-design-refine`](../../plugins/_official/scenarios/od-design-refine/), [`od-figma-migration`](../../plugins/_official/scenarios/od-figma-migration/), [`od-code-migration`](../../plugins/_official/scenarios/od-code-migration/), [`od-react-export`](../../plugins/_official/scenarios/od-react-export/), [`od-nextjs-export`](../../plugins/_official/scenarios/od-nextjs-export/), [`od-vue-export`](../../plugins/_official/scenarios/od-vue-export/), [`od-media-generation`](../../plugins/_official/scenarios/od-media-generation/), [`od-new-generation`](../../plugins/_official/scenarios/od-new-generation/), [`od-tune-collab`](../../plugins/_official/scenarios/od-tune-collab/), [`od-plugin-authoring`](../../plugins/_official/scenarios/od-plugin-authoring/) |
| [`image-templates/`](../../plugins/_official/image-templates/) | 45 | Одношотові промпти зображень — редакторські, кінематографічні, продуктові, портретні |
| [`video-templates/`](../../plugins/_official/video-templates/) | 50 | Моушн-шаблони HyperFrames / Seedance / Veo |
| [`design-systems/`](../../plugins/_official/design-systems/) | 142 | Брендові `DESIGN.md`, обгорнуті як плагіни |
| [`atoms/`](../../plugins/_official/atoms/) | 13 | Багаторазові фрагменти UI (кнопки, герої, KPI-картки) |
| [`examples/`](../../plugins/_official/examples/) | 140 | Реміксувані еталонні результати |

Також [`plugins/community/`](../../plugins/community/) для плагінів спільноти та [`plugins/registry/`](../../plugins/registry/) для процесу публікації.

### Що можуть робити плагіни

- 🤖 **Працюють у будь-якому кодувальному агенті** — [Claude Code](../../docs/agent-adapters.md), Codex, Cursor, Copilot, [OpenClaw](https://github.com/openclaw/openclaw), [Antigravity](https://antigravity.google), Hermes, Kimi… через той самий протокол навичок, який агент уже знає.
- 🔁 **Мігрують робочі процеси Figma / Pencil** → вихідний код React, Next.js або Vue. Див. [`od-figma-migration`](../../plugins/_official/scenarios/od-figma-migration/).
- 🛠️ **Оновлюють наявну кодову базу до специфікації бренду** — спрямуйте плагін на репозиторій `git` + `DESIGN.md`, отримайте PR. Див. [`od-code-migration`](../../plugins/_official/scenarios/od-code-migration/).
- 💾 **Зберігають користувацькі робочі процеси** — багаторазові шаблони вашої команди стоять поряд із тими, що постачаються.

### Використання плагінів

Плагіни мають повний паритет між **вебінтерфейсом** та **CLI `od`** — ті самі кінцеві точки `/api/plugins`, виберіть те, що підходить.

**У десктопному / вебзастосунку:** відкрийте сторінку **Plugin**, щоб переглянути маркетплейс, і натисніть **Install**; усередині Studio проєкту плагіни з'являються як чипи композитора, на які ви натискаєте для застосування (з входами, які вони декларують).

**У командному рядку** (працює без UI — це шлях, який використовують зовнішні агенти):

```bash
od plugin list                       # list installed plugins (--task-kind / --mode / --tag filters)
od plugin search "landing page"      # search by keyword
od plugin info od-default            # inspect a plugin's metadata, inputs, capabilities
od plugin install od-figma-migration # install from a registry; also accepts ./local-folder or an https://… link
od plugin apply od-default --input brief="a one-page pitch for our seed round"
od plugin upgrade od-default         # upgrade
od plugin uninstall od-default       # uninstall
```

Кожна команда підтримує `--json`, тож ви можете пропустити її через `jq` / `xargs` в автоматизацію.

### Створення плагіна

Плагіну **щонайменше потрібен лише `SKILL.md`**; щоб помістити його в маркетплейс Open Design, додайте `open-design.json`:

```
my-plugin/
├── SKILL.md            ← required: YAML frontmatter (name · description) + trigger phrasing + workflow (aim for < 500 lines)
├── open-design.json    ← needed to list: marketplace metadata + inputs + pipeline + capabilities
├── README.md           ← optional: usage, install, registry links
├── preview/            ← optional: index.html / poster.png (strongly recommended for visual plugins)
└── examples/           ← optional: concrete use cases
```

Основні поля `open-design.json`: `specVersion` (наразі `1.0.0`), `name` (стабільний ID), `version` (semver), `compat.agentSkills[].path` (вказує на `./SKILL.md`), `od.kind` (`skill` / `scenario` / `atom` / `bundle`), `od.taskKind` (`new-generation` / `figma-migration` / `code-migration` / `tune-collab`), `od.mode` (поверхня виведення, наприклад `prototype` / `deck` / `live-artifact` / `image` / `video` / `hyperframes` / `audio` / `design-system` / `scenario`), `od.capabilities[]` (**декларуйте мінімум** — обмежене встановлення за замовчуванням надає лише `prompt:inject`), `od.inputs[]` (параметри часу застосування).

Каркасування + валідація локально:

```bash
od plugin scaffold --id my-plugin --title "My Plugin"   # generate the skeleton
od plugin validate ./my-plugin                          # check manifest / file layout
pnpm guard && pnpm --filter @open-design/plugin-runtime typecheck
```

Повний набір полів та рантайм-контракт → [`plugins/spec/SPEC.md`](../../plugins/spec/SPEC.md); розробка плагіна з кодувальним агентом → [`plugins/spec/AGENT-DEVELOPMENT.md`](../../plugins/spec/AGENT-DEVELOPMENT.md); мінімальні шаблони для копіювання → [`plugins/spec/examples/`](../../plugins/spec/examples/).

### Внесок плагіна

1. Покладіть теку плагіна в [`plugins/community/`](../../plugins/community/) (сторонні плагіни), або — щоб постачати його в комплекті з Open Design — у відповідний рівень [`plugins/_official/`](../../plugins/_official/).
2. Пройдіть валідацію: `od plugin validate`, `pnpm guard`, `pnpm --filter @open-design/plugin-runtime typecheck`.
3. Заповніть PR за шаблоном у [`plugins/spec/CONTRIBUTING.md`](../../plugins/spec/CONTRIBUTING.md) (ID, версія, лінія, режим, можливості, приклади тригерів; додайте скриншот / попередній перегляд для візуальних плагінів).
4. Щоб опублікувати у зовнішньому реєстрі (skills.sh / ClawHub / окремий GitHub) → [`plugins/spec/PUBLISHING-REGISTRIES.md`](../../plugins/spec/PUBLISHING-REGISTRIES.md).

Кінцева точка реєстру плагінів: `GET /api/plugins`. Огляд директорій → [`plugins/README.md`](../../plugins/README.md) ([简体中文](../../plugins/README.zh-CN.md)).

---

## Архітектура

```
┌────────────────── browser (Next.js 16) / Electron shell ──────────────┐
│  chat · file workspace · iframe preview · settings · import · MCP     │
└──────────────┬─────────────────────────────────────┬─────────────────┘
               │ /api/*                              │
               ▼                                     ▼
   ┌─────────────────────────────────┐   /api/proxy/{provider}/stream (SSE)
   │  local daemon (Express+SQLite)  │   ─→ any OpenAI-compatible BYOK,
   │                                  │       SSRF-guarded at the edge
   │  /api/skills    /api/plugins    │
   │  /api/design-systems            │
   │  /api/chat (SSE)   /api/proxy/* │
   │  /api/projects/:id/files/...    │
   │  /api/artifacts/{save,lint}     │
   │  /api/import/claude-design      │
   │  MCP stdio server                │
   └─────────┬───────────────────────┘
             │ spawn(cli, [...], { cwd: managed project cwd })
             ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  claude · codex · cursor-agent · copilot · openclaw · antigravity ·│
   │  gemini · opencode · qwen · qoder · hermes (ACP) · kimi (ACP) ·    │
   │  pi (RPC) · kiro · kilo · vibe (ACP) · cline · trae · deepseek     │
   │  reads SKILL.md + DESIGN.md, writes artifacts to disk             │
   └──────────────────────────────────────────────────────────────────┘
```

| Шар | Стек |
|---|---|
| Фронтенд | Next.js 16 App Router + React 18 + TypeScript |
| Демон | Node 24 · Express · потокова передача SSE · `better-sqlite3` |
| Сховище | Перш ніж змінювати або документувати шляхи сховища демона, необхідно прочитати кореневий `AGENTS.md`, розділ **Daemon data directory contract**. Цей README НЕ ПОВИНЕН переказувати його. |
| Попередній перегляд | iframe-пісочниця `srcdoc` + парсер потокового `<artifact>` |
| Експорт | HTML (вбудований) · PDF (друк із браузера) · PPTX (під керуванням агента) · ZIP · Markdown · MP4 (HyperFrames) |
| Десктоп | Оболонка Electron + рендерер у пісочниці + sidecar IPC (STATUS · EVAL · SCREENSHOT · CONSOLE · CLICK · SHUTDOWN) |
| Життєвий цикл | Одна точка входу: `pnpm tools-dev` (start / stop / run / status / logs / inspect / check) |

Повна архітектура → [`docs/architecture.md`](../../docs/architecture.md). Протокол навичок → [`docs/skills-protocol.md`](../../docs/skills-protocol.md). Контракт адаптера агента → [`docs/agent-adapters.md`](../../docs/agent-adapters.md).

---

## Дорожня карта

- [x] Демон + 21 адаптер CLI кодувальних агентів + реєстр навичок + каталог дизайн-систем
- [x] Вебзастосунок + чат + форма запитань + селектор 5 напрямів + прогрес todo + попередній перегляд у пісочниці
- [x] 100+ навичок · 150 дизайн-систем · 5 візуальних напрямів · 5 рамок пристроїв
- [x] Проєкти · розмови · повідомлення · вкладки · шаблони на основі SQLite
- [x] Мультипровайдерний проксі BYOK (`/api/proxy/{anthropic,openai,azure,google,ollama,senseaudio}/stream`) + захист від SSRF
- [x] Імпорт ZIP Claude Design (`/api/import/claude-design`)
- [x] Протокол sidecar + десктоп Electron + автоматизація IPC
- [x] API лінтингу артефактів + 5-вимірний шлюз самокритики перед видачею
- [x] **0.8.0** — інфраструктура маркетплейсу плагінів (261 офіційний плагін, специфікація маніфесту, скрипти встановлення для кожного агента)
- [x] **0.9.0** — Open Design AMR (офіційний Model Router, вбудований у застосунок: нуль конфігурації, вхід в один клік)
- [x] Упаковані збірки Electron — macOS (Apple Silicon + Intel) + Windows (x64) + Linux AppImage (опціональна лінія)
- [ ] Хірургічні правки в режимі коментарів — частково випущено; надійне цільове патчування в розробці
- [ ] UX панелі налаштувань, виданої ШІ — ще не реалізовано
- [ ] `npx od init` для каркасування проєкту з `DESIGN.md`
- [ ] Plugin SDK + CLI `od plugin {add,list,remove,test,publish}`
- [ ] Плагіни міграції Figma / Pencil → React / Next / Vue (alpha)
- [ ] Плагін оновлення наявної кодової бази (спрямувати на репозиторій git + `DESIGN.md`)

Поетапна доставка → [`docs/roadmap.md`](../../docs/roadmap.md).

---

## Спільнота

За кожним каналом — реальні люди.

- 💬 **Discord** — щоденний чат, обмін плагінами, запитання → [**discord.gg/mHAjSMV6gz**](https://discord.gg/mHAjSMV6gz)
- 🐦 **X / Twitter** — нотатки до релізів, віхи, закулісся → [**@OpenDesignHQ**](https://x.com/OpenDesignHQ)
- 🗣️ **GitHub Discussions** — глибокі Q&A, RFC, «покажи свою роботу» → [**Discussions**](https://github.com/nexu-io/open-design/discussions)
- 🐛 **GitHub Issues** — звіти про баги, запити на функції → [**Issues**](https://github.com/nexu-io/open-design/issues)

Мітки [`good-first-issue`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) та [`help-wanted`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22) — найлегший спосіб долучитися.

---

## Внесок

Open Design продовжує рухатися, бо контриб'ютори — дизайнери, інженери, автори промптів — продовжують приходити. Багато з найуживаніших навичок, дизайн-систем і плагінів написали люди поза основною командою.

### 🎯 З чого почати (максимальний важіль, мінімальна зміна)

| Хочете випустити… | Як | Де |
|---|---|---|
| Нову **навичку** | Покладіть теку з `SKILL.md` + `assets/` + `references/` | [`skills/`](../../skills/) · специфікація в [`docs/skills-protocol.md`](../../docs/skills-protocol.md) |
| Нову **дизайн-систему** | Покладіть `DESIGN.md` за схемою з 9 розділів | [`design-systems/<brand>/`](../../design-systems/) |
| Новий **плагін** | Покладіть `open-design.json` + маніфест під текою категорії | [`plugins/community/`](../../plugins/community/) · специфікація в [`plugins/spec/SPEC.md`](../../plugins/spec/SPEC.md) · посібник із розробки агентом у [`plugins/spec/AGENT-DEVELOPMENT.md`](../../plugins/spec/AGENT-DEVELOPMENT.md) |
| Підтримку нового **CLI кодувального агента** | Один запис адаптера + парсер потоку | [`apps/daemon/src/agents.ts`](../../apps/daemon/src/agents.ts) |
| Виправити баг або відполірувати UI | Перегляньте мітку [`good-first-issue`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) | [Issues →](https://github.com/nexu-io/open-design/issues) |
| Перекласти документацію | Оновіть файли `README.<lang>.md` | [`TRANSLATIONS.md`](../../TRANSLATIONS.md) |

### 🤖 Внесок як агент

Якщо *ви — агент, який це читає*, найшвидший шлях такий:

```bash
# 1. Boot locally
git clone https://github.com/nexu-io/open-design.git
cd open-design && corepack enable && pnpm install
pnpm tools-dev run web

# 2. Find a good-first-issue and assign yourself
gh issue list --label "good first issue" --state open --limit 20
gh issue develop <number>   # create a branch and worktree

# 3. Make the change, run the checks
pnpm guard && pnpm typecheck
pnpm --filter @open-design/<package> test

# 4. Open the PR
gh pr create --fill
```

Повний дружній до агентів процес внеску, стиль коду та планка PR → [`CONTRIBUTING.md`](../../CONTRIBUTING.md) ([Deutsch](CONTRIBUTING.de.md) · [Français](CONTRIBUTING.fr.md) · [简体中文](CONTRIBUTING.zh-CN.md) · [日本語](CONTRIBUTING.ja-JP.md) · [Português](CONTRIBUTING.pt-BR.md)).

### 🏅 Програма Open Design Fellow

Ми набираємо **Open Design Fellows** по всьому світу — Fellows формують продукт разом із основною командою, офіційно представляють Open Design у своєму регіоні та розвивають спільноту локально, маючи фінансовану підтримку ($1,000 / MR), безкоштовні LLM-кредити та прямий трек рев'ю. Деталі → [`MAINTAINERS.md`](../../MAINTAINERS.md) та анонс у [Discord](https://discord.gg/mHAjSMV6gz).

---

## Maintainer'и

Вони несуть значну частину навантаження — щоденне обслуговування, рев'ю та підтримку спільноти.

<table>
  <tr>
    <td align="center" valign="top" width="200">
      <a href="https://github.com/Nagendhra-web">
        <img src="https://github.com/Nagendhra-web.png" width="96" alt="@Nagendhra-web" /><br/>
        <sub><b>@Nagendhra-web</b></sub>
      </a><br/>
      <sub>Maintainer</sub>
    </td>
    <td align="center" valign="top" width="200">
      <a href="https://github.com/Sid-Qin">
        <img src="https://github.com/Sid-Qin.png" width="96" alt="@Sid-Qin" /><br/>
        <sub><b>@Sid-Qin</b></sub>
      </a><br/>
      <sub>Maintainer</sub>
    </td>
  </tr>
</table>

Правила для maintainer'ів, критерії підвищення та протокол виходу → [`MAINTAINERS.md`](../../MAINTAINERS.md) (також [Deutsch](MAINTAINERS.de.md) · [Français](MAINTAINERS.fr.md) · [简体中文](MAINTAINERS.zh-CN.md) · [日本語](MAINTAINERS.ja-JP.md) · [Português](MAINTAINERS.pt-BR.md)).

## Контриб'ютори

Дякуємо всім, хто долучився — кодом, документацією, відгуками, влучним issue, новою навичкою, новою дизайн-системою.

<a href="https://github.com/nexu-io/open-design/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nexu-io/open-design&max=500&columns=20&anon=1&cache_bust=2026-06-29" alt="Open Design contributors" />
</a>

---

## Активність репозиторію

<picture>
  <img alt="Open Design — repository metrics" src="https://repo-assets.open-design.ai/resources/images/github-metrics.svg" />
</picture>

SVG вище щодня перегенеровується [`.github/workflows/metrics.yml`](../../.github/workflows/metrics.yml) за допомогою [`lowlighter/metrics`](https://github.com/lowlighter/metrics).

---

## Поставте нам зірку

<p align="center">
  <a href="https://github.com/nexu-io/open-design"><img src="https://repo-assets.open-design.ai/resources/images/star-us.png" alt="Star Open Design on GitHub — github.com/nexu-io/open-design" width="100%" /></a>
</p>

Якщо це зекономило вам тридцять хвилин, поставте ★. Зірки не платять за оренду — але вони кажуть наступному дизайнеру, агенту й контриб'ютору, що цей експеримент вартий їхньої уваги. Один клік, три секунди, реальний сигнал.

<a href="https://star-history.com/#nexu-io/open-design&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&theme=dark&cache_bust=2026-06-29" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-06-29" />
    <img alt="Open Design star history" src="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-06-29" />
  </picture>
</a>

---

## Посилання та родовід

| Проєкт | Роль |
|---|---|
| [Claude Design][cd] | Закритий продукт, відкритою альтернативою якому є цей репозиторій. |
| [`alchaincyf/huashu-design`](https://github.com/alchaincyf/huashu-design) | Компас дизайн-філософії — робочий процес джуніор-дизайнера, протокол брендових ресурсів, чекліст проти AI-slop, п'ятивимірна критика. |
| [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) | Навичка веб-PPT у журнальному стилі, включена дослівно під [`design-templates/guizang-ppt/`](../../design-templates/guizang-ppt/). Типова для режиму презентацій. |
| [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill) | Сімейство HTML PPT Studio — 15 шаблонів презентацій, 36 тем, 31 макет сторінки, рантайм анімації, режим презентера з магнітними картками. |
| [`OpenCoworkAI/open-codesign`](https://github.com/OpenCoworkAI/open-codesign) | Перша відкрита альтернатива Claude Design; UX-патерни, які ми запозичуємо (цикл потокового артефакта, iframe-пісочниця, жива панель агента). |
| [`multica-ai/multica`](https://github.com/multica-ai/multica) | Архітектура демон + адаптер — виявлення агентів скануванням PATH, локальний демон як єдиний привілейований процес. |
| [`VoltAgent/awesome-design-md`](https://github.com/VoltAgent/awesome-design-md) | Джерело схеми `DESIGN.md` з 9 розділів та 70 продуктових систем. |
| [`bergside/awesome-design-skills`](https://github.com/bergside/awesome-design-skills) | Джерело 57 дизайн-навичок, доданих під `design-systems/`. |
| [`heygen-com/hyperframes`](https://github.com/heygen-com/hyperframes) | Платформа моушн-графіки HTML→MP4, інтегрована як повноправний `hyperframes-html` в Open Design. |
| [Claude Code skills][skill] | Конвенція `SKILL.md`, яку ми приймаємо дослівно. |

Детальне походження → [`docs/references.md`](../../docs/references.md).

[skill]: https://docs.anthropic.com/en/docs/claude-code/skills

## Ліцензія

Apache-2.0. Включений `design-templates/guizang-ppt/` зберігає свою оригінальну [LICENSE](../../design-templates/guizang-ppt/LICENSE) (MIT, [@op7418](https://github.com/op7418)). Включений `design-templates/html-ppt/` зберігає свою оригінальну [LICENSE](../../design-templates/html-ppt/LICENSE) (MIT, [@lewislulu](https://github.com/lewislulu)).
