# Open Design

> **Альтернатива з відкритим кодом до [Claude Design][cd].** Локально-перший, розгортується в web, BYOK на кожному рівні — **16 CLI агентів для кодування** автоматично виявляються у вашому `PATH` (Claude Code, Codex, Devin for Terminal, Cursor Agent, Gemini CLI, OpenCode, Qwen, Qoder CLI, GitHub Copilot CLI, Hermes, Kimi, Pi, Kiro, Kilo, Mistral Vibe, DeepSeek TUI) стають механізмом дизайну, керуються **31 компонуваною навичкою** та **72 системами дизайну комерційного класу**. Немає CLI? OpenAI-сумісний BYOK проксі — це той же цикл без spawn.

<p align="center">
  <img src="docs/assets/banner.png" alt="Open Design — editorial cover: design with the agent on your laptop" width="100%" />
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
  <a href="https://open-design.ai/"><img alt="Завантажити" src="https://img.shields.io/badge/%D0%B7%D0%B0%D0%B2%D0%B0%D0%BD%D1%82%D0%B0%D0%B6%D0%B8%D1%82%D0%B8-open--design.ai-ff6b35?style=flat-square" /></a>
  <a href="https://github.com/nexu-io/open-design/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/nexu-io/open-design?style=flat-square&color=blueviolet&label=release&include_prereleases&display_name=tag" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square" /></a>
  <a href="#підтримувані-агенти-для-кодування"><img alt="Agents" src="https://img.shields.io/badge/agents-16%20CLIs%20%2B%20BYOK%20proxy-black?style=flat-square" /></a>
  <a href="#системи-дизайну"><img alt="Design systems" src="https://img.shields.io/badge/design%20systems-72-orange?style=flat-square" /></a>
  <a href="#навички"><img alt="Skills" src="https://img.shields.io/badge/skills-31-teal?style=flat-square" /></a>
  <a href="https://discord.gg/qhbcCH8Am4"><img alt="Discord" src="https://img.shields.io/badge/discord-приєднатись-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="QUICKSTART.md"><img alt="Quickstart" src="https://img.shields.io/badge/quickstart-3%20commands-green?style=flat-square" /></a>
</p>

<p align="center"><a href="README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ko.md">한국어</a> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ar.md">العربية</a> · <a href="README.ru.md">Русский</a> · <b>Українська</b> · <a href="README.tr.md">Türkçe</a></p>

---

## Чому це існує

[Claude Design][cd] від Anthropic (випущено 17.04.2026, Opus 4.7) показав, що відбувається, коли LLM припиняє писати прозу й починає поставляти артефакти дизайну. Це стало вірусним — і залишилось закритим кодом, тільки платним, тільки хмарним, прив'язаним до моделі Anthropic та навичок Anthropic. Немає касси, немає self-hosting, немає Vercel deploy, немає зміни на свого власного агента.

**Open Design (OD) — це альтернатива з відкритим кодом.** Той же цикл, той же artifact-first менталітет, але без lock-in. Ми не поставляємо агента — найсильніші агенти для кодування вже живуть на вашому ноутбуці. Ми підключаємо їх до workflow дизайну, керованого навичками, що працює локально за допомогою `pnpm tools-dev`, може розгорнути веб-шар на Vercel, і залишається BYOK на кожному рівні.

Введіть `make me a magazine-style pitch deck for our seed round`. Інтерактивна форма запитань з'являється до того, як модель навіть імпровізує один піксель. Агент вибирає один із п'яти курованих візуальних напрямків. Живий план `TodoWrite` потокує в UI. Демон будує реальну папку проекту на диску з seed шаблоном, бібліотекою макетів і контрольним списком self-check. Агент читає їх — перевірка перед польотом обов'язкова — запускає п'яти-розмірну критику проти свого власного виходу й видає один `<artifact>`, який рендериться в пісочниці iframe через кілька секунд.

Це не "AI спробує щось спроектувати". Це AI, яка була навчена prompt stack, щоб поводитись як старший дизайнер з робочою файловою системою, детермінованою бібліотекою палітри та культурою контрольного списку — саме той стандарт, який встановив Claude Design, але відкритий і ваш.

OD стоїть на плечах чотирьох проектів з відкритим кодом:

- [**`alchaincyf/huashu-design`**](https://github.com/alchaincyf/huashu-design) — компас філософії дизайну. Workflow молодого дизайнера, протокол бренд-активів з 5 кроками, контрольний список anti-AI-slop, п'яти-розмірна self-critique та ідея "5 шкіл × 20 філософій дизайну" за нашим direction picker — все конденсоване в [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts).
- [**`op7418/guizang-ppt-skill`**](https://github.com/op7418/guizang-ppt-skill) — режим presentations. Включена без змін під [`skills/guizang-ppt/`](skills/guizang-ppt/) із збереженою оригінальною ліцензією; макети в стилі журналу, WebGL герой, контрольні списки P0/P1/P2.
- [**`OpenCoworkAI/open-codesign`**](https://github.com/OpenCoworkAI/open-codesign) — UX північна зірка й наш найближчий партнер. Перша альтернатива Claude Design з відкритим кодом. Ми запозичили цикл streaming-artifact, шаблон preview sandboxed-iframe (vendored React 18 + Babel), live agent panel (todos + tool calls + interruptible generation) та п'ять форматів експорту (HTML / PDF / PPTX / ZIP / Markdown). Ми навмисно розходимось за формою — вони настільна Electron app з bundled [`pi-ai`][piai]; ми веб-app + локальний daemon, яка делегує вашому наявному CLI.
- [**`multica-ai/multica`**](https://github.com/multica-ai/multica) — архітектура daemon та runtime. Виявлення агента PATH-scan, локальний daemon як єдиний привілейований процес, світогляд agent-as-teammate.

## Одним поглядом

| | Що ви отримуєте |
|---|---|
| **CLI агентів для кодування (16)** | Claude Code · Codex CLI · Devin for Terminal · Cursor Agent · Gemini CLI · OpenCode · Qwen Code · Qoder CLI · GitHub Copilot CLI · Hermes (ACP) · Kimi CLI (ACP) · Pi (RPC) · Kiro CLI (ACP) · Kilo (ACP) · Mistral Vibe CLI (ACP) · DeepSeek TUI — автоматично виявляються на `PATH`, одночисельний swap |
| **BYOK fallback** | Специфічний для протоколу API проксі за адресою `/api/proxy/{anthropic,openai,azure,google}/stream` — вставте `baseUrl` + `apiKey` + `model`, виберіть Anthropic / OpenAI / Azure OpenAI / Google Gemini, і демон нормалізує SSE назад у той самий потік чату. Внутрішні IP/SSRF заблоковані на краю демона. |
| **Системи дизайну вбудовані** | **129** — 2 hand-authored starter + 70 систем продукту (Linear, Stripe, Vercel, Airbnb, Tesla, Notion, Anthropic, Apple, Cursor, Supabase, Figma, Xiaohongshu, …) з [`awesome-design-md`][acd2], плюс 57 навичок дизайну з [`awesome-design-skills`][ads] додано безпосередньо під `design-systems/` |
| **Навички вбудовані** | **31** — 27 у режимі `prototype` (web-prototype, saas-landing, dashboard, mobile-app, gamified-app, social-carousel, magazine-poster, dating-web, sprite-animation, motion-frames, critique, tweaks, wireframe-sketch, pm-spec, eng-runbook, finance-report, hr-onboarding, invoice, kanban-board, team-okrs, …) + 4 у режимі `deck` (`guizang-ppt` · `simple-deck` · `replit-deck` · `weekly-update`). Згруповані у picker за `scenario`: design / marketing / operation / engineering / product / finance / hr / sale / personal. |
| **Медіа генерація** | Поверхні Image · video · audio поставляються разом з циклом дизайну. **gpt-image-2** (Azure / OpenAI) для плакатів, аватарів, інфографіки, ілюстрованих карт · **Seedance 2.0** (ByteDance) для кінематографічних 15-секундних text-to-video та image-to-video · **HyperFrames** ([heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)) для HTML→MP4 motion graphics (product reveals, kinetic typography, data charts, social overlays, logo outros). **93** готових до репліки підказки — 43 gpt-image-2 + 39 Seedance + 11 HyperFrames — під [`prompt-templates/`](prompt-templates/), з preview thumbnails та атрибуцією джерела. Той же chat surface як код; виходить реальний `.mp4` / `.png` chip у робочий простір проекту. |
| **Візуальні напрями** | 5 курованих шкіл (Editorial Monocle · Modern Minimal · Warm Soft · Tech Utility · Brutalist Experimental) — кожна поставляється детермінованою палітрою OKLch + font stack ([`apps/daemon/src/prompts/directions.ts`](apps/daemon/src/prompts/directions.ts)) |
| **Кадри пристроїв** | iPhone 15 Pro · Pixel · iPad Pro · MacBook · Browser Chrome — пікселем точні, спільні під [`assets/frames/`](assets/frames/) |
| **Agent runtime** | Локальний daemon запускає CLI у вашій папці проекту — агент отримує справжні `Read`, `Write`, `Bash`, `WebFetch` проти справжнього середовища на диску, з Windows `ENAMETOOLONG` fallbacks (stdin / prompt-file) у кожному адаптері |
| **Імпорти** | Перенесіть [Claude Design][cd] export ZIP на вікно приватних користувачів — `POST /api/import/claude-design` розбирає його на справжній проект, щоб ваш агент міг продовжувати там, де Anthropic закінчився |
| **Постійність** | SQLite за адресою `.od/app.sqlite`: projects · conversations · messages · tabs · saved templates. Пересніть завтра, todo card і відкриті файли саме там, де ви їх залишили. |
| **Життєвий цикл** | Одна точка входу: `pnpm tools-dev` (start / stop / run / status / logs / inspect / check) — завантажує daemon + web (+ desktop) під типізованими sidecar stamps |
| **Desktop** | Опціональна Electron shell із sandboxed renderer + sidecar IPC (STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN) — керує `tools-dev inspect desktop screenshot` для E2E |
| **Розгортувати до** | Локально (`pnpm tools-dev`) · Vercel web layer · спакований Electron desktop-додаток для macOS (Apple Silicon) і Windows (x64) — завантаження з [open-design.ai](https://open-design.ai/) або зі [сторінки останнього релізу](https://github.com/nexu-io/open-design/releases) |
| **Ліцензія** | Apache-2.0 |

[acd2]: https://github.com/VoltAgent/awesome-design-md
[ads]: https://github.com/bergside/awesome-design-skills

## Демонстрація

<table>
<tr>
<td width="50%">
<img src="docs/screenshots/01-entry-view.png" alt="01 · Entry view" /><br/>
<sub><b>Вид входу</b> — виберіть навичку, виберіть систему дизайну, введіть brief. Та сама поверхня для прототипів, presentations, мобільних додатків, dashboards та редакційних сторінок.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/02-question-form.png" alt="02 · Turn-1 discovery form" /><br/>
<sub><b>Форма discovery Turn-1</b> — до того, як модель напише піксель, OD блокує brief: surface, audience, tone, brand context, scale. 30 секунд радіо краще, ніж 30 хвилин редиректів.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/03-direction-picker.png" alt="03 · Direction picker" /><br/>
<sub><b>Вибір напрямку</b> — коли користувач не має бренду, агент видає другу форму з 5 курованими напрямами (Monocle / Modern Minimal / Tech Utility / Brutalist / Soft Warm). Один click радіо → детермінована палітра + font stack, без model freestyle.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/04-todo-progress.png" alt="04 · Live todo progress" /><br/>
<sub><b>Живий прогрес todo</b> — план агента потокує як live card. `in_progress` → `completed` оновлення приходять в реальному часі. Користувач може дешево перенаправити в польоті.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/05-preview-iframe.png" alt="05 · Sandboxed preview" /><br/>
<sub><b>Попередній перегляд в пісочниці</b> — кожен `<artifact>` рендериться в чистому srcdoc iframe. Редаговується на місці через файловий workspace; завантажується як HTML, PDF, ZIP.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/06-design-systems-library.png" alt="06 · 72-system library" /><br/>
<sub><b>72-система бібліотека</b> — кожна система продукту показує своїм 4-колірна підпис. Натисніть для повного `DESIGN.md`, сітки зразків та live showcase.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/07-magazine-deck.png" alt="07 · Magazine deck" /><br/>
<sub><b>Режим Deck (guizang-ppt)</b> — bundled <a href="https://github.com/op7418/guizang-ppt-skill"><code>guizang-ppt-skill</code></a> падає без змін. Макети журналу, WebGL герой backgrounds, однофайловий HTML output, PDF export.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/08-mobile-app.png" alt="08 · Mobile prototype" /><br/>
<sub><b>Мобільний прототип</b> — пікселем точна iPhone 15 Pro chrome (Dynamic Island, status bar SVGs, home indicator). Мультиекранні прототипи використовують спільні `/frames/` активи, тому агент ніколи не перерисовує телефон.</sub>
</td>
</tr>
</table>

## Навички

**31 навичка входить до комплекту.** Кожна — це папка під [`skills/`](skills/), яка слідує конвенції Claude Code [`SKILL.md`][skill] з розширеним `od:` frontmatter, який демон розбирає дослівно — `mode`, `platform`, `scenario`, `preview.type`, `design_system.requires`, `default_for`, `featured`, `fidelity`, `speaker_notes`, `animations`, `example_prompt` ([`apps/daemon/src/skills.ts`](apps/daemon/src/skills.ts)).

Два основні **режими** (modes) формують каталог: **`prototype`** (27 навичок — все, що рендериться як артефакт однієї сторінки, від журнального landing до екрана телефону чи специфікації PM) та **`deck`** (4 навички — horizontal-swipe presentations з deck-framework chrome). Поле **`scenario`** — це те, як вибір групує їх: `design` · `marketing` · `operation` · `engineering` · `product` · `finance` · `hr` · `sale` · `personal`.

### Показові приклади

Візуально характерні навички, які ви, ймовірно, захочете спробувати першими. Кожна з них містить реальний `example.html`, який ви можете відкрити прямо з репозиторію, щоб побачити, що саме створить агент — без реєстрації та налаштування.

<table>
<tr>
<td width="50%" valign="top">
<a href="skills/dating-web/"><img src="docs/screenshots/skills/dating-web.png" alt="dating-web" /></a><br/>
<sub><b><a href="skills/dating-web/"><code>dating-web</code></a></b> · <i>prototype</i><br/>Дашборд для знайомств — ліва навігація, стрічка новин, KPI, графік взаємних симпатій за 30 днів, редакційна типографіка.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/digital-eguide/"><img src="docs/screenshots/skills/digital-eguide.png" alt="digital-eguide" /></a><br/>
<sub><b><a href="skills/digital-eguide/"><code>digital-eguide</code></a></b> · <i>template</i><br/>Цифровий посібник на два розвороти — обкладинка (назва, автор, зміст) + розворот уроку з цитатою та списком кроків.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/email-marketing/"><img src="docs/screenshots/skills/email-marketing.png" alt="email-marketing" /></a><br/>
<sub><b><a href="skills/email-marketing/"><code>email-marketing</code></a></b> · <i>prototype</i><br/>HTML-лист для запуску продукту — шапка, головне зображення, заголовок, CTA, сітка характеристик. Одна колонка, безпечно для таблиць.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/gamified-app/"><img src="docs/screenshots/skills/gamified-app.png" alt="gamified-app" /></a><br/>
<sub><b><a href="skills/gamified-app/"><code>gamified-app</code></a></b> · <i>prototype</i><br/>Три кадри ігрового мобільного додатка на темній сцені — обкладинка, сьогоднішні квести з XP та шкалою рівня, деталі квесту.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/mobile-onboarding/"><img src="docs/screenshots/skills/mobile-onboarding.png" alt="mobile-onboarding" /></a><br/>
<sub><b><a href="skills/mobile-onboarding/"><code>mobile-onboarding</code></a></b> · <i>prototype</i><br/>Три кадри онбордингу мобільного додатка — заставка, цінність продукту, вхід. Статус-бар, точки прокрутки, основний CTA.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/motion-frames/"><img src="docs/screenshots/skills/motion-frames.png" alt="motion-frames" /></a><br/>
<sub><b><a href="skills/motion-frames/"><code>motion-frames</code></a></b> · <i>prototype</i><br/>Однокадровий герой моушн-дизайну з циклічною CSS-анімацією — кільце тексту, що обертається, анімований глобус, таймер. Готово для HyperFrames.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/social-carousel/"><img src="docs/screenshots/skills/social-carousel.png" alt="social-carousel" /></a><br/>
<sub><b><a href="skills/social-carousel/"><code>social-carousel</code></a></b> · <i>prototype</i><br/>Карусель для соцмереж з трьох карток 1080×1080 — кінематографічні панелі з заголовками, що з'єднуються в серію, логотип бренду.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/sprite-animation/"><img src="docs/screenshots/skills/sprite-animation.png" alt="sprite-animation" /></a><br/>
<sub><b><a href="skills/sprite-animation/"><code>sprite-animation</code></a></b> · <i>prototype</i><br/>Піксельний / 8-бітний анімований слайд-пояснення — кремова сцена на весь екран, анімований талісман, кінетичний японський шрифт, CSS-анімації.</sub>
</td>
</tr>
</table>

### Поверхні дизайну та маркетингу (режим prototype)

| Навичка | Платформа | Сценарій | Що створює |
|---|---|---|---|
| [`web-prototype`](skills/web-prototype/) | desktop | design | Односторінковий HTML — лендінги, маркетинг, головні сторінки (типово для прототипів) |
| [`saas-landing`](skills/saas-landing/) | desktop | marketing | Макет маркетингу: герой / переваги / ціни / CTA |
| [`dashboard`](skills/dashboard/) | desktop | operation | Адмінка / аналітика з бічною панеллю + щільний макет даних |
| [`pricing-page`](skills/pricing-page/) | desktop | sale | Окремі сторінки цін та таблиці порівняння |
| [`docs-page`](skills/docs-page/) | desktop | engineering | 3-колонковий макет документації |
| [`blog-post`](skills/blog-post/) | desktop | marketing | Редакційний лонгрід |
| [`mobile-app`](skills/mobile-app/) | mobile | design | Екран(и) додатка в рамці iPhone 15 Pro / Pixel |
| [`mobile-onboarding`](skills/mobile-onboarding/) | mobile | design | Багатоекранний онбординг (заставка · цінність · вхід) |
| [`gamified-app`](skills/gamified-app/) | mobile | personal | Трикадровий ігровий прототип мобільного додатка |
| [`email-marketing`](skills/email-marketing/) | desktop | marketing | Брендований HTML-лист для запуску продукту |
| [`social-carousel`](skills/social-carousel/) | desktop | marketing | Карусель для соцмереж з 3 карток 1080×1080 |
| [`magazine-poster`](skills/magazine-poster/) | desktop | marketing | Односторінковий плакат у журнальному стилі |
| [`motion-frames`](skills/motion-frames/) | desktop | marketing | Герой моушн-дизайну з циклічними CSS-анімаціями |
| [`sprite-animation`](skills/sprite-animation/) | desktop | marketing | Піксельний / 8-бітний анімований слайд-пояснення |
| [`dating-web`](skills/dating-web/) | desktop | personal | Макет дашборду для сервісу знайомств |
| [`digital-eguide`](skills/digital-eguide/) | desktop | marketing | Цифровий посібник на два розвороти (обкладинка + урок) |
| [`wireframe-sketch`](skills/wireframe-sketch/) | desktop | design | Намальований від руки ескіз — для ранньої візуалізації ідей |
| [`critique`](skills/critique/) | desktop | design | 5-вимірна оцінка самокритики (Філософія · Ієрархія · Деталі · Функція · Інновація) |
| [`tweaks`](skills/tweaks/) | desktop | design | Панель налаштувань від AI — модель виводить параметри, які варто підкоригувати |

### Поверхні презентацій (режим deck)

| Навичка | Типово для | Що створює |
|---|---|---|
| [`guizang-ppt`](skills/guizang-ppt/) | **типово** для deck | Веб-презентація у журнальному стилі — взято з [op7418/guizang-ppt-skill][guizang] |
| [`simple-deck`](skills/simple-deck/) | — | Мінімалістична презентація з горизонтальним гортанням |
| [`replit-deck`](skills/replit-deck/) | — | Презентація для огляду продукту (у стилі Replit) |
| [`weekly-update`](skills/weekly-update/) | — | Щотижневий звіт команди (прогрес · блокери · наступні кроки) |

### Поверхні для офісу та операцій (режим prototype, сценарії документів)

| Навичка | Сценарій | Що створює |
|---|---|---|
| [`pm-spec`](skills/pm-spec/) | product | Специфікація PM зі змістом + журналом рішень |
| [`team-okrs`](skills/team-okrs/) | product | Таблиця оцінки OKR |
| [`meeting-notes`](skills/meeting-notes/) | operation | Журнал рішень зустрічі |
| [`kanban-board`](skills/kanban-board/) | operation | Знімок канбан-дошки |
| [`eng-runbook`](skills/eng-runbook/) | engineering | Інструкція з реагування на інциденти |
| [`finance-report`](skills/finance-report/) | finance | Фінансовий звіт для керівництва |
| [`invoice`](skills/invoice/) | finance | Односторінковий рахунок-фактура |
| [`hr-onboarding`](skills/hr-onboarding/) | hr | План онбордингу на посаду |

Додавання навички займає одну папку. Прочитайте [`docs/skills-protocol.md`](docs/skills-protocol.md) про розширений frontmatter, скопіюйте існуючу навичку, перезапустіть демон, і вона з'явиться у виборі. Ендпоінт каталогу — `GET /api/skills`; збірка seed для кожної навички (шаблон + side-file посилання) живе на `GET /api/skills/:id/example`.

## Шість ключових ідей

### 1 · Ми не постачаємо агента. Ваш — достатньо хороший.

При запуску демон сканує ваш `PATH` на наявність [`claude`](https://docs.anthropic.com/en/docs/claude-code), [`codex`](https://github.com/openai/codex), `devin`, [`cursor-agent`](https://www.cursor.com/cli), [`gemini`](https://github.com/google-gemini/gemini-cli), [`opencode`](https://opencode.ai/), [`qwen`](https://github.com/QwenLM/qwen-code), `qodercli`, [`copilot`](https://github.com/features/copilot/cli), `hermes`, `kimi`, [`pi`](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent), [`kiro-cli`](https://kiro.dev) та [`vibe-acp`](https://github.com/mistralai/mistral-vibe) на старті. Ті, що знайдені, стають кандидатами на роль "двигуна" дизайну — вони керуються через stdio з одним адаптером на CLI, який можна змінити у виборі моделі. Натхненно [`multica`](https://github.com/multica-ai/multica) та [`cc-switch`](https://github.com/farion1231/cc-switch). Немає встановленого CLI? Режим API використовує той самий конвеєр — виберіть Anthropic, OpenAI-сумісний, Azure OpenAI або Google Gemini, і демон передаватиме нормалізовані фрагменти SSE, з блокуванням внутрішніх мереж на краю.

### 2 · Навички — це файли, а не плагіни.

Згідно з конвенцією Claude Code [`SKILL.md`][skill], кожна навичка — це `SKILL.md` + `assets/` + `references/`. Додайте папку в [`skills/`](skills/), перезапустіть демон, і вона з'явиться у виборі. Вбудована `magazine-web-ppt` — це [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill), додана без змін зі збереженням ліцензії та авторства.

### 3 · Системи дизайну — це портативний Markdown, а не JSON тем.

Схема `DESIGN.md` з 9 розділів від [`VoltAgent/awesome-design-md`][acd2] — колір, типографіка, відступи, макет, компоненти, рух, голос, бренд, антипатерни. Кожен артефакт базується на активній системі. Змініть систему → наступний рендер використовуватиме нові токени. Список включає **Linear, Stripe, Vercel, Airbnb, Tesla, Notion, Apple, Anthropic, Cursor, Supabase, Figma, Resend, Raycast, Lovable, Cohere, Mistral, ElevenLabs, X.AI, Spotify, Webflow, Sanity, PostHog, Sentry, MongoDB, ClickHouse, Cal, Replicate, Clay, Composio, Xiaohongshu…** — плюс 57 навичок дизайну з [`awesome-design-skills`][ads].

### 4 · Інтерактивна форма запитань запобігає 80% помилок.

Стек промптів OD жорстко кодує `RULE 1`: кожен новий бриф дизайну починається з `<question-form id="discovery">` замість коду. Поверхня · аудиторія · тон · контекст бренду · масштаб · обмеження. Довгий бриф все одно залишає відкритими рішення щодо дизайну — візуальний тон, колірна позиція — саме те, що форма фіксує за 30 секунд. Вартість неправильного напрямку — один раунд чату, а не готовий проект.

Це **режим Junior-Designer**, взятий з [`huashu-design`](https://github.com/alchaincyf/huashu-design): зберіть питання заздалегідь, покажіть щось візуальне на ранній стадії (навіть вайрфрейм), дозвольте користувачеві дешево змінити напрямок. Поєднано з протоколом бренд-активів, це головна причина, чому результат виглядає як робота дизайнера, а не випадкова генерація AI.

### 5 · Демон дає агенту відчуття, що він на вашому ноутбуці, бо так і є.

Демон запускає CLI з робочим каталогом (`cwd`), встановленим у папку артефактів проекту під `.od/projects/<id>/`. Агент отримує справжні інструменти `Read`, `Write`, `Bash`, `WebFetch` проти реальної файлової системи. Він може читати `assets/template.html` навички, шукати HEX-значення у вашому CSS, писати `brand-spec.md`, додавати зображення і створювати файли `.pptx` / `.zip` / `.pdf`, які з'являються у робочому просторі. Сесії та повідомлення зберігаються у локальній БД SQLite.

### 6 · Стек промптів — це і є продукт.

Те, що ви компонуєте під час відправки, — це не просто "система + користувач". Це:

```
DISCOVERY directives  (форма 1-го ходу, бранч бренду 2-го ходу, TodoWrite, 5-вимірна критика)
  + identity charter   (OFFICIAL_DESIGNER_PROMPT, anti-AI-slop, junior-pass)
  + active DESIGN.md   (72 системи доступні)
  + active SKILL.md    (31 навичка доступна)
  + project metadata   (тип, точність, нотатки доповідача, анімації, inspiration ids)
  + skill side files   (автоматично введені: read assets/template.html + references/*.md)
  + (тип deck, без skill seed) DECK_FRAMEWORK_DIRECTIVE   (навігація / лічильник / прокрутка / друк)
```

Кожен рівень можна комбінувати та редагувати. Прочитайте [`apps/daemon/src/prompts/system.ts`](apps/daemon/src/prompts/system.ts) та [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts), щоб побачити актуальний контракт.

## Архітектура

```
┌────────────────────── браузер (Next.js 16) ──────────────────────┐
│  чат · робочий простір · прев'ю в iframe · налаштування · імпорт │
└──────────────┬───────────────────────────────────┬───────────────┘
               │ /api/* (переписано в dev)          │
               ▼                                    ▼
   ┌──────────────────────────────────┐   /api/proxy/{provider}/stream (SSE)
   │  Локальний демон (Express + SQLite) │   ─→ будь-який OpenAI-сумісний
   │                                  │       ендпоінт (BYOK)
   │  /api/agents          /api/skills│       з блокуванням SSRF
   │  /api/design-systems  /api/projects/…
   │  /api/chat (SSE)      /api/proxy/{provider}/stream (SSE)
   │  /api/templates       /api/import/claude-design
   │  /api/artifacts/save  /api/artifacts/lint
   │  /api/upload          /api/projects/:id/files…
   │  /artifacts (static)  /frames (static)
   │
   │  опціонально: sidecar IPC у /tmp/open-design/ipc/<ns>/<app>.sock
   │  (STATUS · EVAL · SCREENSHOT · CONSOLE · CLICK · SHUTDOWN)
   └─────────┬────────────────────────┘
             │ spawn(cli, [...], { cwd: .od/projects/<id> })
             ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  claude · codex · devin (ACP) · gemini · opencode · cursor-agent │
   │  qwen · qoder · copilot · hermes (ACP) · kimi (ACP) · pi (RPC) · kiro (ACP) · vibe (ACP)   │
   │  читає SKILL.md + DESIGN.md, пише артефакти на диск              │
   └──────────────────────────────────────────────────────────────────┘
```

| Рівень | Стек |
|---|---|
| Frontend | Next.js 16 App Router + React 18 + TypeScript, розгортається на Vercel |
| Daemon | Node 24 · Express · SSE streaming · `better-sqlite3`; таблиці: `projects`, `conversations`, `messages`, `tabs`, `templates` |
| Транспорт агента | `child_process.spawn`; типізовані парсери для `claude-stream-json` (Claude Code), `qoder-stream-json` (Qoder CLI), `copilot-stream-json` (Copilot), `json-event-stream` (Codex / Gemini / OpenCode / Cursor Agent), `acp-json-rpc` (Devin / Hermes / Kimi / Kiro / Kilo / Mistral Vibe), `pi-rpc` (Pi), `plain` (Qwen Code / DeepSeek TUI) |
| BYOK проксі | `POST /api/proxy/{anthropic,openai,azure,google}/stream` → специфічні API провайдерів, нормалізований SSE `delta/end/error`; блокує loopback / RFC1918 на краю демона |
| Сховище | Звичайні файли в `.od/projects/<id>/` + SQLite у `.od/app.sqlite` (ігнорується git, автоматично створюється). Перевизначте корінь через `OD_DATA_DIR` для ізоляції тестів |
| Попередній перегляд | Ізольований iframe через `srcdoc` + парсер `<artifact>` для кожної навички ([`apps/web/src/artifacts/parser.ts`](apps/web/src/artifacts/parser.ts)) |
| Експорт | HTML (вбудовані активи) · PDF (друк браузера, deck-aware) · PPTX (через агента, через навичку) · ZIP (archiver) · Markdown |
| Життєвий цикл | `pnpm tools-dev start | stop | run | status | logs | inspect | check`; порти через `--daemon-port` / `--web-port`, простори імен через `--namespace` |
| Desktop (опц) | Electron shell — виявляє URL через sidecar IPC, без вгадування портів; той самий канал `STATUS`/`EVAL`/`SCREENSHOT`/`CONSOLE`/`CLICK`/`SHUTDOWN` керує `tools-dev inspect desktop …` для E2E |

## Швидкий старт

### Завантажити desktop-додаток (збірка не потрібна)

Найшвидший спосіб спробувати Open Design — готовий desktop-додаток, без Node, pnpm і клонування:

- **[open-design.ai](https://open-design.ai/)** — офіційна сторінка завантаження
- **[GitHub релізи](https://github.com/nexu-io/open-design/releases)**

### Запуск з вихідного коду

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable
corepack pnpm --version   # має вивести 10.33.2
pnpm install
pnpm tools-dev run web
# відкрийте URL у браузері, який виведе tools-dev
```

Вимоги до середовища: Node `~24` та pnpm `10.33.x`. `nvm`/`fnm` є лише додатковими помічниками; якщо ви використовуєте один з них, запустіть `nvm install 24 && nvm use 24` або `fnm install 24 && fnm use 24` перед `pnpm install`.

Для запуску desktop/background, перезапусків з фіксованими портами та перевірок диспетчера генерації медіа (`OD_BIN`, `OD_DAEMON_URL`, `apps/daemon/dist/cli.js`), див. [`QUICKSTART.md`](QUICKSTART.md).

Перше завантаження:

1. Виявляє, які CLI агенти ви маєте в `PATH`, і автоматично вибирає один.
2. Завантажує 31 навичку + 72 системи дизайну.
3. Виводить вітальне діалогове вікно, щоб ви могли вставити ключ Anthropic (потрібен лише для резервного шляху BYOK).
4. **Автоматично створює `./.od/`** — локальну папку для бази даних SQLite, артефактів для кожного проекту та збережених рендерів. Крок `od init` не потрібен; демон створює все, що йому потрібно при запуску.

Введіть промпт, натисніть **Send**, дочекайтеся появи форми запитань, заповніть її, дочекайтеся потоку картки завдання, дочекайтеся рендерингу артефакту. Натисніть **Save to disk** або завантажте як ZIP-архів проекту.

### Стан першого запуску (`./.od/`)

Демон володіє однією прихованою папкою в корені репозиторію. Все в ній ігнорується git і є локальним для машини — ніколи не комітьте її.

```
.od/
├── app.sqlite                 ← проекти · розмови · повідомлення · відкриті вкладки
├── artifacts/                 ← одноразові рендери "Зберегти на диск" (з відміткою часу)
└── projects/<id>/             ← робочий каталог для кожного проекту, також cwd агента
```

| Хочете… | Зробіть це |
|---|---|
| Перевірити, що там є | `ls -la .od && sqlite3 .od/app.sqlite '.tables'` |
| Скинути до чистого стану | `pnpm tools-dev stop`, `rm -rf .od`, запустіть `pnpm tools-dev run web` знову |
| Перемістити в інше місце | поки не підтримується — шлях жорстко закодований відносно репозиторію |

Повна карта файлів, скрипти та усунення несправностей → [`QUICKSTART.md`](QUICKSTART.md).

## Структура репозиторію

```
open-design/
├── README.md                      ← цей файл
├── README.de.md                   ← Deutsch
├── README.ru.md                   ← Русский
├── README.zh-CN.md                ← 简体中文
├── QUICKSTART.md                  ← посібник із запуску / збірки / розгортання
├── package.json                   ← pnpm workspace, бінарний файл: od
│
├── apps/
│   ├── daemon/                    ← Node + Express, основний сервер
│   │   ├── src/                   ← джерельний код демона на TypeScript
│   │   │   ├── cli.ts             ← код `od` bin, компілюється у dist/cli.js
│   │   │   ├── server.ts          ← маршрути /api/* (проекти, чат, файли, експорт)
│   │   │   ├── agents.ts          ← сканер PATH + збирачі аргументів CLI
│   │   │   ├── claude-stream.ts   ← потоковий JSON-парсер stdout Claude Code
│   │   │   ├── skills.ts          ← завантажувач frontmatter SKILL.md
│   │   │   └── db.ts              ← схема SQLite (проекти/повідомлення/шаблони/вкладки)
│   │   ├── sidecar/               ← обгортка sidecar демона tools-dev
│   │   └── tests/                 ← тести пакету демона
│   │
│   └── web/                       ← Next.js 16 App Router + React клієнт
│       ├── app/                   ← точки входу App Router
│       ├── next.config.ts         ← dev rewrites + prod static export у out/
│       └── src/                   ← React + TypeScript клієнтські модулі
│           ├── App.tsx            ← маршрутизація, bootstrap, налаштування
│           ├── components/        ← чат, композер, пікер, прев'ю, скетч, …
│           ├── prompts/
│           │   ├── system.ts      ← composeSystemPrompt(base, skill, DS, metadata)
│           │   ├── discovery.ts   ← форма 1-го ходу + бранч 2-го ходу + 5-вимірна критика
│           │   └── directions.ts  ← 5 візуальних напрямків × OKLch палітра + font stack
│           ├── artifacts/         ← потоковий парсер <artifact> + маніфести
│           ├── runtime/           ← iframe srcdoc, markdown, помічники експорту
│           ├── providers/         ← транспорт SSE демона + BYOK API
│           └── state/             ← конфіг + проекти (localStorage + daemon-backed)
│
├── e2e/                           ← Playwright UI + зовнішній інтеграційний/Vitest харнес
│
├── packages/
│   ├── contracts/                 ← спільні контракти веб/daemon додатку
│   ├── sidecar-proto/             ← контракт протоколу sidecar Open Design
│   ├── sidecar/                   ← загальні примітиви sidecar рантайму
│   └── platform/                  ← загальні примітиви процесів/платформи
│
├── skills/                        ← 31 комплект навичок SKILL.md (27 prototype + 4 deck)
│   ├── web-prototype/             ← типовий для режиму prototype
│   ├── saas-landing/  dashboard/  pricing-page/  docs-page/  blog-post/
│   ├── mobile-app/  mobile-onboarding/  gamified-app/
│   ├── email-marketing/  social-carousel/  magazine-poster/
│   ├── motion-frames/  sprite-animation/  digital-eguide/  dating-web/
│   ├── critique/  tweaks/  wireframe-sketch/
│   ├── pm-spec/  team-okrs/  meeting-notes/  kanban-board/
│   ├── eng-runbook/  finance-report/  invoice/  hr-onboarding/
│   ├── simple-deck/  replit-deck/  weekly-update/   ← режим deck
│   └── guizang-ppt/               ← bundled magazine-web-ppt (типово для deck)
│       ├── SKILL.md
│       ├── assets/template.html   ← seed
│       └── references/{themes,layouts,components,checklist}.md
│
├── design-systems/                ← 72 системи DESIGN.md
│   ├── default/                   ← Neutral Modern (стартер)
│   ├── warm-editorial/            ← Warm Editorial (стартер)
│   ├── linear-app/  vercel/  stripe/  airbnb/  notion/  cursor/  apple/  …
│   └── README.md                  ← огляд каталогу
│
├── assets/
│   └── frames/                    ← спільні кадри пристроїв (використовуються між навичками)
│       ├── iphone-15-pro.html
│       ├── android-pixel.html
│       ├── ipad-pro.html
│       ├── macbook.html
│       └── browser-chrome.html
│
├── templates/
│   ├── deck-framework.html        ← база deck (навігація / лічильник / друк)
│   └── kami-deck.html             ← kami-стильований deck стартер (пергамент / ink-blue serif)
│
├── scripts/
│   └── sync-design-systems.ts     ← реімпорт upstream awesome-design-md tarball
│
├── docs/
│   ├── spec.md                    ← специфікація продукту, сценарії, диференціація
│   ├── architecture.md            ← топології, потік даних, компоненти
│   ├── skills-protocol.md         ← розширений SKILL.md od: frontmatter
│   ├── agent-adapters.md          ← виявлення + диспетчеризація для кожного CLI
│   ├── modes.md                   ← prototype / deck / template / design-system
│   ├── references.md              ← довге походження
│   ├── roadmap.md                 ← поетапна поставка
│   ├── schemas/                   ← JSON-схеми
│   └── examples/                  ← канонічні приклади артефактів
│
└── .od/                           ← дані під час виконання, ігноруються git, створюються автоматично
    ├── app.sqlite                 ← проекти / розмови / повідомлення / вкладки
    ├── projects/<id>/             ← робоча папка проекту (cwd агента)
    └── artifacts/                 ← збережені одноразові рендери
```

## Системи дизайну

<p align="center">
  <img src="docs/assets/design-systems-library.png" alt="Бібліотека 72 систем дизайну — стиль-гайд розворот" width="100%" />
</p>

72 системи з коробки, кожна як один [`DESIGN.md`](design-systems/README.md):

<details>
<summary><b>Повний каталог</b> (натисніть, щоб розгорнути)</summary>

**AI & LLM** — `claude` · `cohere` · `mistral-ai` · `minimax` · `together-ai` · `replicate` · `runwayml` · `elevenlabs` · `ollama` · `x-ai`

**Інструменти розробника** — `cursor` · `vercel` · `linear-app` · `framer` · `expo` · `clickhouse` · `mongodb` · `supabase` · `hashicorp` · `posthog` · `sentry` · `warp` · `webflow` · `sanity` · `mintlify` · `lovable` · `composio` · `opencode-ai` · `voltagent`

**Продуктивність** — `notion` · `figma` · `miro` · `airtable` · `superhuman` · `intercom` · `zapier` · `cal` · `clay` · `raycast`

**Фінтех** — `stripe` · `coinbase` · `binance` · `kraken` · `mastercard` · `revolut` · `wise`

**E-Commerce** — `shopify` · `airbnb` · `uber` · `nike` · `starbucks` · `pinterest`

**Медіа** — `spotify` · `playstation` · `wired` · `theverge` · `meta`

**Автомобілі** — `tesla` · `bmw` · `ferrari` · `lamborghini` · `bugatti` · `renault`

**Інше** — `apple` · `ibm` · `nvidia` · `vodafone` · `sentry` · `resend` · `spacex`

**Стартери** — `default` (Neutral Modern) · `warm-editorial`

</details>

Бібліотека продуктових систем імпортується через [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts) з [`VoltAgent/awesome-design-md`][acd2]. Перезапустіть для оновлення. 57 навичок дизайну беруться з [`bergside/awesome-design-skills`][ads] та додаються безпосередньо у `design-systems/`.

## Візуальні напрями

Коли у користувача немає специфікації бренду, агент видає другу форму з п'ятьма курованими напрямками — адаптація OD [fallback "5 шкіл × 20 філософій дизайну" з `huashu-design`](https://github.com/alchaincyf/huashu-design#%E8%AE%BE%E8%AE%A1%E6%96%B9%E5%90%91%E9%A1%BE%E9%97%AE-fallback). Кожен напрямок — це детермінована специфікація (палітра в OKLch, font stack, підказки макетної позиції, референси), яку агент прив'язує дослівно у `:root` seed-шаблону. Один клік радіо → повністю специфікована візуальна система. Без імпровізації, без AI-slop.

| Напрямок | Настрій | Референси |
|---|---|---|
| Editorial — Monocle / FT | Друкований журнал, чорнило + крем + тепла іржа | Monocle · FT Weekend · NYT Magazine |
| Modern minimal — Linear / Vercel | Холодний, структурований, мінімальні акценти | Linear · Vercel · Stripe |
| Tech utility | Щільність інформації, моноширинний, термінал | Bloomberg · Bauhaus tools |
| Brutalist | Сирий, великий шрифт, без тіней, різкі акценти | Bloomberg Businessweek · Achtung |
| Soft warm | Щедрий, низький контраст, персикові нейтральні тони | Notion marketing · Apple Health |

Повна специфікація → [`apps/daemon/src/prompts/directions.ts`](apps/daemon/src/prompts/directions.ts).

## Медіа генерація

OD не зупиняється на коді. Та сама поверхня чату, яка створює `<artifact>` HTML, також керує генерацією **зображень**, **відео** та **аудіо**, з адаптерами моделей у медіа-конвеєрі демона ([`apps/daemon/src/media-models.ts`](apps/daemon/src/media-models.ts), [`apps/web/src/media/models.ts`](apps/web/src/media/models.ts)). Кожен рендер зберігається як реальний файл у робочому просторі проекту — `.png` для зображень, `.mp4` для відео — і з'являється як чіп для завантаження після завершення ходу.

Сьогодні підтримуються три сімейства моделей:

| Поверхня | Модель | Провайдер | Для чого |
|---|---|---|---|
| **Зображення** | `gpt-image-2` | Azure / OpenAI | Плакати, аватари профілів, карти, інфографіка, соціальні картки, розрізи продуктів |
| **Відео** | `seedance-2.0` | ByteDance Volcengine | 15с кінематографічного відео з аудіо за текстом або зображенням — короткометражки, великі плани, хореографія |
| **Відео** | `hyperframes-html` | [HeyGen / OSS](https://github.com/heygen-com/hyperframes) | HTML→MP4 моушн-графіка — презентації продуктів, кінетична типографіка, діаграми, логотипи, караоке-субтитри |

Зростаюча **галерея промптів** у [`prompt-templates/`](prompt-templates/) поставляє **93 готові до репліки промпти** — 43 зображення (`prompt-templates/image/*.json`), 39 Seedance (`prompt-templates/video/*.json` без `hyperframes-*`), 11 HyperFrames (`prompt-templates/video/hyperframes-*.json`). Кожен містить мініатюру попереднього перегляду, тіло промпту дослівно, цільову модель, співвідношення сторін та блок `source` для ліцензії та атрибуції. Демон обслуговує їх на `GET /api/prompt-templates`, веб-додаток відображає їх як сітку карток у вкладках **Шаблони зображень** та **Шаблони відео** на виді входу; один клік опускає промпт у композер з попередньо вибраною моделлю.

### gpt-image-2 — галерея зображень (вибірка з 43)

<table>
<tr>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776661968404_8a5flm_HGQc_KOaMAA2vt0.jpg" alt="3D Stone Staircase Evolution" /><br/><sub><b>3D-інфографіка «Еволюція кам'яних сходів»</b><br/>3-крокова інфографіка, естетика тесаного каменю</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776662673014_nf0taw_HGRMNDybsAAGG88.jpg" alt="Illustrated City Food Map" /><br/><sub><b>Ілюстрована міська гастрокарта</b><br/>Редакційний ілюстрований від руки туристичний плакат</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453149026_gd2k50_HHCSvymboAAVscc.jpg" alt="Cinematic Elevator Scene" /><br/><sub><b>Кінематографічна сцена в ліфті</b><br/>Однокадрова редакційна модна зйомка</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453164993_mt5b69_HHDoWfeaUAEA6Vt.jpg" alt="Cyberpunk Anime Portrait" /><br/><sub><b>Кіберпанк-аніме портрет</b><br/>Аватар профілю — неоновий текст на обличчі</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453184257_vb9hvl_HG9tAkOa4AAuRrn.jpg" alt="Glamorous Woman in Black" /><br/><sub><b>Гламурний портрет жінки в чорному</b><br/>Редакційний студійний портрет</sub></td>
</tr>
</table>

Повний набір → [`prompt-templates/image/`](prompt-templates/image/). Джерела: більшість запозичена з [`YouMind-OpenLab/awesome-gpt-image-prompts`](https://github.com/YouMind-OpenLab/awesome-gpt-image-prompts) (CC-BY-4.0) зі збереженням атрибуції автора для кожного шаблону.

### Seedance 2.0 — відеогалерея (вибірка з 39)

<table>
<tr>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c4515f4f328539e1ded2cc32f4ce63e7/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c4515f4f328539e1ded2cc32f4ce63e7/thumbnails/thumbnail.jpg" alt="Music Podcast Guitar" /></a><br/><sub><b>Музичний подкаст та гітарна техніка</b><br/>4K кінематографічна студійна зйомка</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/4a47ba646e7cedd79363c861864b8714/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/4a47ba646e7cedd79363c861864b8714/thumbnails/thumbnail.jpg" alt="Emotional Face" /></a><br/><sub><b>Емоційний крупний план обличчя</b><br/>Кінематографічне дослідження мікроемоцій</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7e8983364a95fe333f0f88bd1085a0e8/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7e8983364a95fe333f0f88bd1085a0e8/thumbnails/thumbnail.jpg" alt="Luxury Supercar" /></a><br/><sub><b>Кінематографічний люксовий суперкар</b><br/>Наративний продуктовий фільм</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/0279a674ce138ab5a0a6f020a7273d89/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/0279a674ce138ab5a0a6f020a7273d89/thumbnails/thumbnail.jpg" alt="Forbidden City Cat" /></a><br/><sub><b>Сатира «Кіт у Забороненому місті»</b><br/>Стилізований сатиричний короткометражний фільм</sub></td>
<td width="20%" valign="top"><a href="https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts/releases/download/videos/1402.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7f63ad253175a9ad1dac53de490efac8/thumbnails/thumbnail.jpg" alt="Japanese Romance" /></a><br/><sub><b>Японська романтична короткометражка</b><br/>15-секундний наратив Seedance 2.0</sub></td>
</tr>
</table>

Натисніть будь-яку мініатюру, щоб відтворити реальний MP4. Повний набір → [`prompt-templates/video/`](prompt-templates/video/) (записи `*-seedance-*` та з тегом Cinematic). Джерела: [`YouMind-OpenLab/awesome-seedance-2-prompts`](https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts) (CC-BY-4.0) зі збереженням оригінальних посилань на твіти та хендлів авторів.

### HyperFrames — HTML→MP4 моушн-графіка (11 готових до репліки шаблонів)

[**`heygen-com/hyperframes`**](https://github.com/heygen-com/hyperframes) — це фреймворк відео з відкритим кодом від HeyGen, нативний для агентів: ви (або агент) пишете HTML + CSS + GSAP, HyperFrames рендерить це у детермінований MP4 через headless Chrome + FFmpeg. Open Design поставляє HyperFrames як відеомодель першого класу (`hyperframes-html`), підключену до диспетчеризації демона, плюс навичку `skills/hyperframes/`, яка навчає агента контракту таймлайну, правил переходу між сценами, аудіо-реактивних патернів, субтитрів/TTS та каталог-блоків (`npx hyperframes add <slug>`).

Одинадцять промптів hyperframes поставляються у [`prompt-templates/video/hyperframes-*.json`](prompt-templates/video/), кожен — конкретний бриф, що створює певний архетип:

<table>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-product-reveal-minimal.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Product reveal" /></a><br/><sub><b>5с мінімальний продукт-ревіл</b> · 16:9 · титульна картка з push-in та шейдерним переходом</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-saas-product-promo-30s.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="SaaS promo" /></a><br/><sub><b>30с SaaS продукт-промо</b> · 16:9 · стиль Linear/ClickUp з 3D-ревілами UI</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-tiktok-karaoke-talking-head.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/tiktok-follow.png" alt="TikTok karaoke" /></a><br/><sub><b>TikTok караоке talking-head</b> · 9:16 · TTS + субтитри з синхронізацією по словах</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-brand-sizzle-reel.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Brand sizzle" /></a><br/><sub><b>30с бренд sizzle-reel</b> · 16:9 · кінетична типографіка під біт, аудіо-реактивна</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-data-bar-chart-race.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/data-chart.png" alt="Data chart" /></a><br/><sub><b>Анімована гонка стовпчикових діаграм</b> · 16:9 · NYT-стиль інфографіка даних</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-flight-map-route.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/nyc-paris-flight.png" alt="Flight map" /></a><br/><sub><b>Карта польоту (місце → призначення)</b> · 16:9 · кінематографічний ревіл маршруту в стилі Apple</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-logo-outro-cinematic.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Logo outro" /></a><br/><sub><b>4с кінематографічний logo-outro</b> · 16:9 · збірка по частинах + bloom</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-money-counter-hype.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/apple-money-count.png" alt="Money counter" /></a><br/><sub><b>Лічильник грошей $0 → $10K</b> · 9:16 · хайп в стилі Apple з зеленою спалаху + вибухом</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-app-showcase-three-phones.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="App showcase" /></a><br/><sub><b>3-телефонна вітрина додатка</b> · 16:9 · парящі телефони з підписами функцій</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-social-overlay-stack.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Social overlay" /></a><br/><sub><b>Стек соціальних оверлеїв</b> · 9:16 · X · Reddit · Spotify · Instagram послідовно</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-website-to-video-promo.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Website to video" /></a><br/><sub><b>Пайплайн сайт→відео</b> · 16:9 · захват сайту у 3 в'юпортах + переходи</sub></td>
<td width="25%" valign="top">&nbsp;</td>
</tr>
</table>

Патерн той самий, що й скрізь: виберіть шаблон, відредагуйте бриф, надішліть. Агент читає вбудований `skills/hyperframes/SKILL.md` (який містить OD-специфічний workflow рендерингу — композиція вихідних файлів у `.hyperframes-cache/`, щоб не засмічувати файловий робочий простір, демон диспетчеризує `npx hyperframes render`, щоб уникнути macOS sandbox-exec / Puppeteer зависання, лише фінальний `.mp4` з'являється як чіп проекту), створює композицію та поставляє MP4. Мініатюри каталог-блоків © HeyGen, подаються з їхнього CDN; сам OSS фреймворк — Apache-2.0.

> **Також підключені, але ще не представлені як шаблони:** Kling 2.0 / 1.6 / 1.5, Veo 3 / Veo 2, Sora 2 / Sora 2-Pro (через Fal), MiniMax video-01 — всі живі у `VIDEO_MODELS` ([`apps/web/src/media/models.ts`](apps/web/src/media/models.ts)). Suno v5 / v4.5, Udio v2, Lyria 2 (музика) та gpt-4o-mini-tts, MiniMax TTS (мовлення) покривають аудіо-поверхню. Шаблони для них відкриті для внесків — додайте JSON у `prompt-templates/video/` або `prompt-templates/audio/`, і він з'явиться у пікері.

## Поза чатом — що ще поставляється

Цикл чат / артефакт отримує головну увагу, але низка менш помітних можливостей вже підключені й варто знати перед тим, як порівнювати OD з чимось іншим:

- **Імпорт Claude Design ZIP.** Перетягніть експорт з claude.ai на вітальне діалогове вікно. `POST /api/import/claude-design` розпакує його у реальну `.od/projects/<id>/`, відкриє вхідний файл як вкладку та підготує промпт «продовжити там, де Anthropic зупинився» для вашого локального агента. Без перепромпту, без «попросіть модель відтворити те, що ми щойно мали». ([`apps/daemon/src/server.ts`](apps/daemon/src/server.ts) — `/api/import/claude-design`)
- **Багатопровайдерний BYOK проксі.** `POST /api/proxy/{anthropic,openai,azure,google}/stream` приймає `{ baseUrl, apiKey, model, messages }`, будує специфічний для провайдера запит, нормалізує SSE-фрагменти у `delta/end/error` та відхиляє loopback / link-local / RFC1918 адресати для захисту від SSRF. OpenAI-сумісний покриває OpenAI, Azure AI Foundry `/openai/v1`, DeepSeek, Groq, MiMo, OpenRouter та self-hosted vLLM; Azure OpenAI додає deployment URL + `api-version`; Google використовує Gemini `:streamGenerateContent`.
- **Збережені користувачем шаблони.** Коли рендер вам подобається, `POST /api/templates` створює знімок HTML + метаданих у таблиці `templates` SQLite. Наступний проект вибере його з ряду «ваші шаблони» у пікері — та ж поверхня, що й 31 вбудована, але ваша.
- **Збереження вкладок.** Кожен проект запам'ятовує свої відкриті файли та активну вкладку у таблиці `tabs`. Відкрийте проект завтра, і робочий простір виглядатиме саме так, як ви його залишили.
- **API лінтингу артефактів.** `POST /api/artifacts/lint` запускає структурні перевірки згенерованого артефакту (пошкоджене `<artifact>` обрамлення, відсутні необхідні side-файли, застарілі токени палітри) та повертає знахідки, які агент може прочитати у свій наступний хід. П'ятивимірна self-critique використовує це для обґрунтування оцінки реальними доказами, а не враженнями.
- **Протокол sidecar + автоматизація desktop.** Процеси демона, вебу та desktop несуть типізовані п'ятипольні штампи (`app · mode · namespace · ipc · source`) та надають JSON-RPC IPC канал за адресою `/tmp/open-design/ipc/<namespace>/<app>.sock`. `tools-dev inspect desktop status | eval | screenshot` керує цим каналом, тому headless E2E працює проти реальної Electron shell без спеціальних харнесів ([`packages/sidecar-proto/`](packages/sidecar-proto/), [`apps/desktop/src/main/`](apps/desktop/src/main/)).
- **Windows-дружнє породження.** Кожен адаптер, який інакше перевищив би ліміт argv ~32 КБ `CreateProcess` для довгих складених промптів (Codex, Gemini, OpenCode, Cursor Agent, Qwen, Qoder CLI, Pi), подає промпт через stdin. Claude Code та Copilot зберігають `-p`; демон відкатується до тимчасового файлу промпту, коли й це переповнюється.
- **Дані виконання для кожного простору імен.** `OD_DATA_DIR` та `--namespace` дають вам повністю ізольовані `.od/`-дерева, тому Playwright, бета-канали та ваші реальні проекти ніколи не ділять файл SQLite.

## Механізм Anti-AI-slop

Весь наведений нижче механізм — це плейбук [`huashu-design`](https://github.com/alchaincyf/huashu-design), портований у стек промптів OD та зроблений обов'язковим для кожної навички через pre-flight side-файлів. Прочитайте [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts) для актуального формулювання:

- **Спочатку форма запитань.** Хід 1 — лише `<question-form>` — ніякого мислення, інструментів чи описів. Користувач обирає дефолти зі швидкістю радіо.
- **Екстракція бренд-специфікації.** Коли користувач додає скріншот або URL, агент виконує п'ятикроковий протокол (знайти · завантажити · grep hex · кодифікувати `brand-spec.md` · озвучити) перед написанням CSS. **Ніколи не вгадує кольори бренду з пам'яті.**
- **П'ятивимірна критика.** Перед видачею `<artifact>` агент мовчки оцінює свій вихід 1–5 за філософією / ієрархією / виконанням / специфічністю / стриманістю. Все нижче 3/5 — регресія — виправити та переоцінити. Два проходи — це нормально.
- **Чек-лист P0/P1/P2.** Кожна навичка поставляє `references/checklist.md` з жорсткими воротами P0. Агент повинен пройти P0 перед видачею.
- **Чорний список slop.** Агресивні фіолетові градієнти, універсальні іконки-емодзі, закруглені картки з акцентною лівою рамкою, намальовані від руки SVG-люди, Inter як *display* шрифт, вигадані метрики — явно заборонені в промпті.
- **Чесні плейсхолдери кращі за фейкові статистики.** Коли агент не має реального числа, він пише `—` або позначений сірий блок, а не «в 10 разів швидше».

## Порівняння

| Вісь | [Claude Design][cd] (Anthropic) | [Open CoDesign][ocod] | **Open Design** |
|---|---|---|---|
| Ліцензія | Закрита | MIT | **Apache-2.0** |
| Форм-фактор | Веб (claude.ai) | Desktop (Electron) | **Веб-додаток + локальний демон** |
| Розгортання на Vercel | ❌ | ❌ | **✅** |
| Рантайм агента | Вбудований (Opus 4.7) | Вбудований ([`pi-ai`][piai]) | **Делеговано наявному CLI користувача** |
| Навички | Пропрієтарні | 12 кастомних TS-модулів + `SKILL.md` | **31 файлових [`SKILL.md`][skill] комплектів, що додаються перетягуванням** |
| Система дизайну | Пропрієтарна | `DESIGN.md` (дорожня карта v0.2) | **`DESIGN.md` × 129 систем поставлено** |
| Гнучкість провайдерів | Лише Anthropic | 7+ через [`pi-ai`][piai] | **16 CLI-адаптерів + OpenAI-сумісний BYOK проксі** |
| Початкова форма запитань | ❌ | ❌ | **✅ Жорстке правило, хід 1** |
| Вибір напрямку | ❌ | ❌ | **✅ 5 детермінованих напрямків** |
| Живий прогрес todo + потік інструментів | ❌ | ✅ | **✅** (UX-патерн з open-codesign) |
| Попередній перегляд у пісочниці iframe | ❌ | ✅ | **✅** (патерн з open-codesign) |
| Імпорт Claude Design ZIP | н/д | ❌ | **✅ `POST /api/import/claude-design` — продовжуйте редагувати там, де Anthropic зупинився** |
| Хірургічні редагування в режимі коментарів | ❌ | ✅ | 🟡 частково — коментарі елементів прев'ю + вкладення чату; надійність хірургічних патчів ще в процесі |
| Панель AI-налаштувань | ❌ | ✅ | 🚧 дорожня карта — виділена UX-панель налаштувань з боку чату ще не реалізована |
| Файлова система як робочий простір | ❌ | частково (Electron sandbox) | **✅ Реальний cwd, реальні інструменти, збережений SQLite (проекти · розмови · повідомлення · вкладки · шаблони)** |
| П'ятивимірна self-critique | ❌ | ❌ | **✅ Ворота перед видачею** |
| Лінтинг артефактів | ❌ | ❌ | **✅ `POST /api/artifacts/lint` — знахідки передаються назад агенту** |
| Sidecar IPC + headless desktop | ❌ | ❌ | **✅ Штамповані процеси + `tools-dev inspect desktop status | eval | screenshot`** |
| Формати експорту | Обмежені | HTML / PDF / PPTX / ZIP / Markdown | **HTML / PDF / PPTX (через агента) / ZIP / Markdown** |
| Повторне використання PPT-навички | Н/Д | Вбудована | **[`guizang-ppt-skill`][guizang] додається (типово для режиму deck)** |
| Мінімальний білінг | Pro / Max / Team | BYOK | **BYOK — вставте будь-який OpenAI-сумісний `baseUrl`** |

[cd]: https://x.com/claudeai/status/2045156267690213649
[ocod]: https://github.com/OpenCoworkAI/open-codesign
[piai]: https://github.com/badlogic/pi-mono/tree/main/packages/ai
[acd]: https://github.com/VoltAgent/awesome-claude-design
[guizang]: https://github.com/op7418/guizang-ppt-skill
[skill]: https://docs.anthropic.com/en/docs/claude-code/skills

## Підтримувані агенти для кодування

Автоматично виявляються з `PATH` при старті демона. Налаштування не потрібні. Диспетчеризація потоків живе у [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) (`AGENT_DEFS`); парсери для кожного CLI — поруч. Моделі заповнюються або через зондування `<bin> --list-models` / `<bin> models` / ACP handshake, або з курованого резервного списку, коли CLI не надає список.

| Агент | Бінар | Формат потоку | Форма argv (шлях складеного промпту) |
|---|---|---|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `claude` | `claude-stream-json` (типізовані події) | `claude -p <prompt> --output-format stream-json --verbose [--include-partial-messages] [--add-dir …] --permission-mode bypassPermissions` |
| [Codex CLI](https://github.com/openai/codex) | `codex` | `json-event-stream` + парсер `codex` | `codex exec --json --skip-git-repo-check --sandbox workspace-write -c sandbox_workspace_write.network_access=true [-C cwd] [--model …] [-c model_reasoning_effort=…]` (промпт на stdin) |
| Devin for Terminal | `devin` | `acp-json-rpc` | `devin --permission-mode dangerous --respect-workspace-trust false acp` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `gemini` | `json-event-stream` + парсер `gemini` | `gemini --output-format stream-json --skip-trust --yolo [--model …] -` (промпт на stdin) |
| [OpenCode](https://opencode.ai/) | `opencode` | `json-event-stream` + парсер `opencode` | `opencode run --format json --dangerously-skip-permissions [--model …] -` (промпт на stdin) |
| [Cursor Agent](https://www.cursor.com/cli) | `cursor-agent` | `json-event-stream` + парсер `cursor-agent` | `cursor-agent --print --output-format stream-json --stream-partial-output --force --trust [--workspace cwd] [--model …] -` (промпт на stdin) |
| [Qwen Code](https://github.com/QwenLM/qwen-code) | `qwen` | `plain` (сирий stdout) | `qwen --yolo [--model …] -` (промпт на stdin) |
| Qoder CLI | `qodercli` | `qoder-stream-json` (типізовані події) | `qodercli -p --output-format stream-json --permission-mode bypass_permissions [--cwd cwd] [--model …] [--add-dir …]` (промпт на stdin) |
| [GitHub Copilot CLI](https://github.com/features/copilot/cli) | `copilot` | `copilot-stream-json` (типізовані події) | `copilot -p <prompt> --allow-all-tools --output-format json [--model …] [--add-dir …]` |
| [Hermes](https://github.com/eqlabs/hermes) | `hermes` | `acp-json-rpc` (Agent Client Protocol) | `hermes acp --accept-hooks` |
| Kimi CLI | `kimi` | `acp-json-rpc` | `kimi acp` |
| [Kiro CLI](https://kiro.dev) | `kiro-cli` | `acp-json-rpc` | `kiro-cli acp` |
| Kilo | `kilo` | `acp-json-rpc` | `kilo acp` |
| [Mistral Vibe CLI](https://github.com/mistralai/mistral-vibe) | `vibe-acp` | `acp-json-rpc` | `vibe-acp` |
| DeepSeek TUI | `deepseek` | `plain` (raw stdout chunks) | `deepseek exec --auto [--model …] <prompt>` |
| [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | `pi` | `pi-rpc` (stdio JSON-RPC) | `pi --mode rpc [--model …] [--thinking …]` (промпт надсилається як RPC-команда `prompt`) |
| **Багатопровайдерний BYOK** | н/д | Нормалізація SSE | `POST /api/proxy/{provider}/stream` → Anthropic / OpenAI-сумісний / Azure OpenAI / Gemini; захист від SSRF проти loopback / link-local / RFC1918 |

Додавання нового CLI — це один запис у [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts). Формат потоку — один із `claude-stream-json`, `qoder-stream-json`, `copilot-stream-json`, `json-event-stream` (з `eventParser` для кожного CLI), `acp-json-rpc`, `pi-rpc` або `plain`.

## Посилання та лінія спадкоємності

Кожен зовнішній проект, який це сховище запозичило. Кожне посилання веде до джерела, щоб ви могли перевірити походження.

| Проект | Роль тут |
|---|---|
| [`Claude Design`][cd] | Закритий продукт, альтернативою з відкритим кодом до якого є це сховище. |
| [**`alchaincyf/huashu-design`**](https://github.com/alchaincyf/huashu-design) | Ядро філософії дизайну. Workflow молодого дизайнера, 5-кроковий протокол бренд-активів, чек-лист anti-AI-slop, п'ятивимірна self-critique та бібліотека «5 шкіл × 20 філософій дизайну» за нашим вибором напрямку — все дистильовано у [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts) та [`apps/daemon/src/prompts/directions.ts`](apps/daemon/src/prompts/directions.ts). |
| [**`op7418/guizang-ppt-skill`**][guizang] | Навичка magazine-web-PPT, вбудована дослівно під [`skills/guizang-ppt/`](skills/guizang-ppt/) зі збереженням оригінальної ЛІЦЕНЗІЇ. Типова для режиму deck. Культура чек-листів P0/P1/P2 запозичена для кожної іншої навички. |
| [**`multica-ai/multica`**](https://github.com/multica-ai/multica) | Архітектура демона + адаптерів. Виявлення агента через PATH-scan, локальний демон як єдиний привілейований процес, світогляд agent-as-teammate. Ми приймаємо модель; ми не вендоримо код. |
| [**`OpenCoworkAI/open-codesign`**][ocod] | Перша альтернатива Claude Design з відкритим кодом та наш найближчий партнер. Прийняті UX-патерни: цикл streaming-artifact, прев'ю у пісочниці iframe (вендовані React 18 + Babel), жива панель агента (todos + tool calls + переривається), п'ятиформатний список експорту (HTML/PDF/PPTX/ZIP/Markdown), локальний хаб зберігання, ін'єкція смаку через `SKILL.md`, та перший прох коментарів режиму прев'ю. UX-патерни, що ще в нашій дорожній карті: повна надійність хірургічних редагувань та панель AI-налаштувань. **Ми навмисно не вендоримо [`pi-ai`][piai]** — open-codesign вбудовує його як рантайм агента; ми делегуємо тому CLI, який вже є у користувача. |
| [`VoltAgent/awesome-claude-design`][acd] / [`awesome-design-md`][acd2] | Джерело 9-секційної схеми `DESIGN.md` та 70 продуктових систем, імпортованих через [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts). |
| [`bergside/awesome-design-skills`][ads] | Джерело 57 навичок дизайну, доданих безпосередньо як нормалізовані файли `DESIGN.md` під `design-systems/`. |
| [`farion1231/cc-switch`](https://github.com/farion1231/cc-switch) | Натхнення для розподілу навичок через symlink між кількома CLI агентів. |
| [Навички Claude Code][skill] | Конвенція `SKILL.md`, прийнята дослівно — будь-яка навичка Claude Code додається у `skills/` і підхоплюється демоном. |

Детальний опис походження — що ми беремо від кожного, що навмисно не беремо — живе у [`docs/references.md`](docs/references.md).

## Дорожня карта

- [x] Демон + виявлення агентів (16 CLI-адаптерів) + реєстр навичок + каталог систем дизайну
- [x] Веб-додаток + чат + форма запитань + вибір з 5 напрямків + прогрес todo + прев'ю в пісочниці
- [x] 31 навичка + 72 системи дизайну + 5 візуальних напрямків + 5 кадрів пристроїв
- [x] Проекти · розмови · повідомлення · вкладки · шаблони на SQLite
- [x] Багатопровайдерний BYOK проксі (`/api/proxy/{anthropic,openai,azure,google}/stream`) з захистом SSRF
- [x] Імпорт Claude Design ZIP (`/api/import/claude-design`)
- [x] Протокол sidecar + Electron desktop з IPC-автоматизацією (STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN)
- [x] API лінтингу артефактів + ворота п'ятивимірної self-critique перед видачею
- [ ] Хірургічні редагування в режимі коментарів — частково поставлено: коментарі елементів прев'ю та вкладення чату; надійне цілеспрямоване патчування ще в процесі
- [ ] UX панелі AI-налаштувань — ще не реалізовано
- [ ] Рецепт розгортання Vercel + тунель (Топологія B)
- [ ] Одна команда `npx od init` для скаффолдингу проекту з `DESIGN.md`
- [ ] Маркетплейс навичок (`od skills install <github-repo>`) та CLI-поверхня `od skill add | list | remove | test` (задрафтовано в [`docs/skills-protocol.md`](docs/skills-protocol.md), реалізація очікує)
- [x] Пакетна збірка Electron з `apps/packaged/` — завантаження для macOS (Apple Silicon) і Windows (x64) на [open-design.ai](https://open-design.ai/) та на [сторінці релізів GitHub](https://github.com/nexu-io/open-design/releases)

Поетапна поставка → [`docs/roadmap.md`](docs/roadmap.md).

## Статус

Це рання реалізація — замкнений цикл (виявити → вибрати навичку + систему дизайну → чат → розібрати `<artifact>` → прев'ю → зберегти) працює наскрізь. Стек промптів та бібліотека навичок — це те, де живе більшість цінності, і вони стабільні. UI на рівні компонентів постачається щодня.

## Поставте нам зірку

<p align="center">
  <a href="https://github.com/nexu-io/open-design"><img src="docs/assets/star-us.png" alt="Поставте зірку Open Design на GitHub — github.com/nexu-io/open-design" width="100%" /></a>
</p>

Якщо це зекономило вам тридцять хвилин — поставте ★. Зірки не сплачують оренду, але вони кажуть наступному дизайнеру, агенту та контриб'ютору, що цей експеримент вартий їхньої уваги. Один клік, три секунди, реальний сигнал: [github.com/nexu-io/open-design](https://github.com/nexu-io/open-design).

## Внесок

Питання, PR, нові навички та нові системи дизайну — всі вітаються. Найбільш впливові внески зазвичай — це одна папка, один Markdown-файл або один PR-розмірний адаптер:

- **Додати навичку** — додайте папку у [`skills/`](skills/) за конвенцією [`SKILL.md`][skill].
- **Додати систему дизайну** — додайте `DESIGN.md` у [`design-systems/<brand>/`](design-systems/) за 9-секційною схемою.
- **Підключити новий CLI агент** — один запис у [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts).

Повний посібник, критерії злиття, стиль коду та що ми не приймаємо → [`CONTRIBUTING.md`](CONTRIBUTING.md) ([Deutsch](CONTRIBUTING.de.md), [Français](CONTRIBUTING.fr.md), [简体中文](CONTRIBUTING.zh-CN.md)).

## Контриб'ютори

Дякуємо всім, хто допоміг просувати Open Design — через код, документацію, зворотний зв'язок, нові навички, нові системи дизайну або навіть гостре питання. Кожен реальний внесок рахується, а стіна нижче — найпростіший спосіб сказати це вголос.

<a href="https://github.com/nexu-io/open-design/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nexu-io/open-design&cache_bust=2026-05-13" alt="Контриб'ютори Open Design" />
</a>

Якщо ви злили свій перший PR — ласкаво просимо. Мітка [`good-first-issue`/`help-wanted`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22%2C%22help+wanted%22) — це точка входу.

## Активність репозиторію

<picture>
  <img alt="Open Design — метрики репозиторію" src="docs/assets/github-metrics.svg" />
</picture>

SVG вище перегенерується щодня [`.github/workflows/metrics.yml`](.github/workflows/metrics.yml) за допомогою [`lowlighter/metrics`](https://github.com/lowlighter/metrics). Зробіть ручне оновлення з вкладки **Actions**, якщо хочете швидше; для багатших плагінів (трафік, час відповіді) додайте секрет репозиторію `METRICS_TOKEN` з fine-grained PAT.

## Історія зірок

<a href="https://star-history.com/#nexu-io/open-design&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&theme=dark&cache_bust=2026-05-13" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-13" />
    <img alt="Історія зірок Open Design" src="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-13" />
  </picture>
</a>

Якщо крива вигинається вгору — це той сигнал, який ми шукаємо. ★ цей репо, щоб штовхнути її.

## Кредити

Сімейство навичок HTML PPT Studio — майстер-навичка [`skills/html-ppt/`](skills/html-ppt/) та обгортки для кожного шаблону під [`skills/html-ppt-*/`](skills/) (15 шаблонів повних колод, 36 тем, 31 односторінковий макет, 27 CSS-анімацій + 20 canvas FX, клавіатурний рантайм та режим презентації з магнітними картками) — інтегровані з проекту з відкритим кодом [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill) (MIT). Вихідна ЛІЦЕНЗІЯ поставляється in-tree у [`skills/html-ppt/LICENSE`](skills/html-ppt/LICENSE), авторство належить [@lewislulu](https://github.com/lewislulu). Кожна картка прикладу для шаблону (`html-ppt-pitch-deck`, `html-ppt-tech-sharing`, `html-ppt-presenter-mode`, `html-ppt-xhs-post`, …) делегує авторські вказівки майстер-навичці, щоб поведінка промпт → вихід зберігалася наскрізь при натисканні **Використати цей промпт**.

Потік журнал / горизонтального гортання під [`skills/guizang-ppt/`](skills/guizang-ppt/) інтегрований з [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) (MIT). Авторство належить [@op7418](https://github.com/op7418).

## Ліцензія

Apache-2.0. Вбудована `skills/guizang-ppt/` зберігає свою оригінальну [ЛІЦЕНЗІЮ](skills/guizang-ppt/LICENSE) (MIT) та атрибуцію авторства [op7418](https://github.com/op7418). Вбудована `skills/html-ppt/` зберігає свою оригінальну [ЛІЦЕНЗІЮ](skills/html-ppt/LICENSE) (MIT) та атрибуцію авторства [lewislulu](https://github.com/lewislulu).
