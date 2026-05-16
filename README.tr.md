# Open Design

> [!IMPORTANT]
> ### 🔥 `0.8.0-preview` burada. Tasarımın eski dünyası burada bitiyor.
>
> Claude Design / Figma'ya açık kaynaklı, agent-native bir alternatif — iki haftada 40k stars bizi buraya getirdi. **Yolun geri kalanını birlikte yürüyelim.**
>
> **`main` üzerinde hızlı iterasyon** — 0.8.0 Open Design'in bir sonraki aşaması. Bir PR gönder, çılgın bir fikir at, bir bug bildir — sen ne getirirsen bu hareket o olur.
>
> → [**Duyuruyu oku · kurulum dosyasını indir · harekete katıl**](https://github.com/nexu-io/open-design/discussions/1727) · mevcut 0.7'nin yanına paralel kurulur.

> **[Claude Design][cd] için açık kaynak alternatif.** Yerel öncelikli, web'e dağıtılabilir, her katmanda BYOK; `PATH` üzerinde otomatik algılanan **16 coding-agent CLI** (Claude Code, Codex, Devin for Terminal, Cursor Agent, Gemini CLI, OpenCode, Qwen, Qoder CLI, GitHub Copilot CLI, Hermes, Kimi, Pi, Kiro, Kilo, Mistral Vibe, DeepSeek TUI) tasarım motoruna dönüşür. Hepsi **31 birleştirilebilir Skill** ve **72 marka kalitesinde Design System** tarafından yönlendirilir. CLI yok mu? OpenAI uyumlu BYOK proxy aynı döngünün agent spawn olmadan çalışan halidir.

<p align="center">
  <img src="docs/assets/banner.png" alt="Open Design — dizüstü bilgisayarındaki agent ile tasarım yapma editoryal kapağı" width="100%" />
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
  <a href="https://open-design.ai/"><img alt="Download" src="https://img.shields.io/badge/download-open--design.ai-ff6b35?style=flat-square" /></a>
  <a href="https://github.com/nexu-io/open-design/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/nexu-io/open-design?style=flat-square&color=blueviolet&label=release&include_prereleases&display_name=tag" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square" /></a>
  <a href="#supported-coding-agents"><img alt="Agents" src="https://img.shields.io/badge/agents-16%20CLIs%20%2B%20BYOK%20proxy-black?style=flat-square" /></a>
  <a href="#design-systems"><img alt="Design systems" src="https://img.shields.io/badge/design%20systems-72-orange?style=flat-square" /></a>
  <a href="#skills"><img alt="Skills" src="https://img.shields.io/badge/skills-31-teal?style=flat-square" /></a>
  <a href="https://discord.gg/qhbcCH8Am4"><img alt="Discord" src="https://img.shields.io/badge/discord-join-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="https://x.com/nexudotio"><img alt="Follow @nexudotio on X" src="https://img.shields.io/badge/follow-%40nexudotio-1DA1F2?style=flat-square&logo=x&logoColor=white" /></a>
  <a href="QUICKSTART.md"><img alt="Quickstart" src="https://img.shields.io/badge/quickstart-3%20commands-green?style=flat-square" /></a>
</p>

<p align="center"><a href="README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ko.md">한국어</a> · <a href="README.ja-JP.md">日本語</a> · <a href="README.ar.md">العربية</a> · <a href="README.ru.md">Русский</a> · <a href="README.uk.md">Українська</a> · <b>Türkçe</b></p>

---

## Neden var

Anthropic'in [Claude Design][cd] ürünü (2026-04-17'de Opus 4.7 ile yayımlandı), bir LLM düz yazı üretmeyi bırakıp tasarım artefaktları göndermeye başladığında neler olacağını gösterdi. Viral oldu; ama kapalı kaynak, ücretli, yalnızca bulutta çalışan, Anthropic modeline ve Anthropic skill'lerine kilitli bir ürün olarak kaldı. Checkout yok, self-host yok, Vercel deploy yok, kendi agent'ını takıp çıkarma yok.

**Open Design (OD) açık kaynak alternatiftir.** Aynı döngü, aynı artefakt öncelikli düşünme modeli, ama kilitlenme yok. Biz bir agent göndermiyoruz; en güçlü coding agent'lar zaten dizüstü bilgisayarında yaşıyor. Onları `pnpm tools-dev` ile yerelde çalışan, web katmanı Vercel'e dağıtılabilen ve her katmanda BYOK kalan skill odaklı bir tasarım iş akışına bağlıyoruz.

`make me a magazine-style pitch deck for our seed round` yaz. Model tek piksel uydurmadan önce etkileşimli soru formu açılır. Agent beş küratörlü görsel yönden birini seçer. Canlı bir `TodoWrite` planı UI'a akar. Daemon, seed template, layout kütüphanesi ve self-check checklist içeren gerçek bir disk üstü proje klasörü oluşturur. Agent bunları okur; pre-flight zorunludur; kendi çıktısına beş boyutlu critique uygular ve saniyeler sonra sandbox iframe içinde render edilen tek bir `<artifact>` üretir.

Bu "AI bir şey tasarlamaya çalışıyor" değildir. Bu, prompt stack tarafından çalışan dosya sistemi, deterministik palet kütüphanesi ve checklist kültürü olan kıdemli bir tasarımcı gibi davranmaya eğitilmiş bir AI'dır; Claude Design'ın koyduğu çıtanın açık ve senin olan hali.

OD dört açık kaynak omuz üzerinde durur:

- [**`alchaincyf/huashu-design`**](https://github.com/alchaincyf/huashu-design) — tasarım felsefesi pusulası. Junior-Designer iş akışı, 5 adımlı marka varlığı protokolü, anti-AI-slop checklist, 5 boyutlu self-critique ve direction picker arkasındaki "5 okul × 20 tasarım felsefesi" fikri; hepsi [`packages/contracts/src/prompts/discovery.ts`](packages/contracts/src/prompts/discovery.ts) içine damıtıldı.
- [**`op7418/guizang-ppt-skill`**](https://github.com/op7418/guizang-ppt-skill) — deck modu. Özgün LICENSE korunarak [`skills/guizang-ppt/`](skills/guizang-ppt/) altında aynen paketlendi; dergi tarzı layout'lar, WebGL hero, P0/P1/P2 checklist'leri.
- [**`OpenCoworkAI/open-codesign`**](https://github.com/OpenCoworkAI/open-codesign) — UX kuzey yıldızı ve en yakın eşdeğerimiz. İlk açık kaynak Claude Design alternatifi. Streaming artefakt döngüsünü, sandbox iframe preview kalıbını (vendored React 18 + Babel), canlı agent panelini (todo'lar + tool call'lar + kesilebilir üretim) ve beş formatlı export listesini (HTML / PDF / PPTX / ZIP / Markdown) ödünç alıyoruz. Form faktöründe bilinçli olarak ayrışıyoruz: onlar [`pi-ai`][piai] paketleyen bir Electron masaüstü app'i; biz mevcut CLI'ına delege eden web app + local daemon'ız.
- [**`multica-ai/multica`**](https://github.com/multica-ai/multica) — daemon ve runtime mimarisi. PATH taramalı agent algılama, tek ayrıcalıklı süreç olarak local daemon, agent-as-teammate dünya görüşü.

## Kısa bakış

| | Ne elde edersin |
|---|---|
| **Coding-agent CLI'ları (16)** | Claude Code · Codex CLI · Devin for Terminal · Cursor Agent · Gemini CLI · OpenCode · Qwen Code · Qoder CLI · GitHub Copilot CLI · Hermes (ACP) · Kimi CLI (ACP) · Pi (RPC) · Kiro CLI (ACP) · Kilo (ACP) · Mistral Vibe CLI (ACP) · DeepSeek TUI — `PATH` üzerinde otomatik algılanır, tek tıkla değiştirilir |
| **BYOK fallback** | `/api/proxy/{anthropic,openai,azure,google}/stream` üzerinde protokole özel API proxy — `baseUrl` + `apiKey` + `model` yapıştır, Anthropic / OpenAI / Azure OpenAI / Google Gemini seç; daemon SSE'yi aynı chat stream'ine normalize eder. Internal-IP/SSRF daemon kenarında engellenir. |
| **Yerleşik design system'ler** | **129** — el yazımı 2 starter + [`awesome-design-md`][acd2] kaynaklı 70 ürün sistemi (Linear, Stripe, Vercel, Airbnb, Tesla, Notion, Anthropic, Apple, Cursor, Supabase, Figma, Xiaohongshu, …) ve `design-systems/` altına doğrudan eklenen [`awesome-design-skills`][ads] kaynaklı 57 design skill |
| **Yerleşik skill'ler** | **31** — `prototype` modunda 27 skill (web-prototype, saas-landing, dashboard, mobile-app, gamified-app, social-carousel, magazine-poster, dating-web, sprite-animation, motion-frames, critique, tweaks, wireframe-sketch, pm-spec, eng-runbook, finance-report, hr-onboarding, invoice, kanban-board, team-okrs, …) + `deck` modunda 4 skill (`guizang-ppt` · `simple-deck` · `replit-deck` · `weekly-update`). Picker'da `scenario` ile gruplanır: design / marketing / operation / engineering / product / finance / hr / sale / personal. |
| **Medya üretimi** | Görsel · video · ses yüzeyleri tasarım döngüsünün yanında gelir. Posterler, avatarlar, infografikler ve illüstre haritalar için **gpt-image-2** (Azure / OpenAI) · sinematik 15s text-to-video ve image-to-video için **Seedance 2.0** (ByteDance) · HTML→MP4 motion graphics için **HyperFrames** ([heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)). [`prompt-templates/`](prompt-templates/) altında **93** yeniden üretilebilir prompt — 43 gpt-image-2 + 39 Seedance + 11 HyperFrames — preview thumbnail ve kaynak atfıyla gelir. Kodla aynı chat yüzeyi; çıktılar proje workspace'ine gerçek `.mp4` / `.png` chip'i olarak düşer. |
| **Görsel yönler** | 5 küratörlü okul (Editorial Monocle · Modern Minimal · Warm Soft · Tech Utility · Brutalist Experimental) — her biri deterministik OKLch palet + font stack ile gelir ([`packages/contracts/src/prompts/directions.ts`](packages/contracts/src/prompts/directions.ts)) |
| **Cihaz frame'leri** | iPhone 15 Pro · Pixel · iPad Pro · MacBook · Browser Chrome — pixel-accurate, skill'ler arasında [`assets/frames/`](assets/frames/) altında paylaşılır |
| **Agent runtime** | Local daemon CLI'ı proje klasöründe spawn eder — agent gerçek disk ortamında gerçek `Read`, `Write`, `Bash`, `WebFetch` alır; her adapter'da Windows `ENAMETOOLONG` fallback'leri (stdin / prompt-file) vardır |
| **Import'lar** | Bir [Claude Design][cd] export ZIP'ini welcome dialog'a bırak — `POST /api/import/claude-design` onu gerçek bir projeye parse eder, böylece agent Anthropic'in bıraktığı yerden düzenlemeyi sürdürebilir |
| **Kalıcılık** | `.od/app.sqlite`: projects · conversations · messages · tabs · saved templates. Yarın tekrar açtığında todo card ve açık dosyalar bıraktığın yerdedir. |
| **Lifecycle** | Tek giriş noktası: `pnpm tools-dev` (start / stop / run / status / logs / inspect / check) — typed sidecar stamp'ler altında daemon + web (+ desktop) başlatır |
| **Desktop** | Sandbox renderer + sidecar IPC içeren opsiyonel Electron shell (STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN) — E2E için `tools-dev inspect desktop screenshot` çalıştırır |
| **Dağıtılabilir hedefler** | Local (`pnpm tools-dev`) · Vercel web katmanı · macOS (Apple Silicon) ve Windows (x64) için paketlenmiş Electron desktop app — [open-design.ai](https://open-design.ai/) veya [latest release](https://github.com/nexu-io/open-design/releases) üzerinden indir |
| **Lisans** | Apache-2.0 |

[acd2]: https://github.com/VoltAgent/awesome-design-md
[ads]: https://github.com/bergside/awesome-design-skills

## Demo

<table>
<tr>
<td width="50%">
<img src="docs/screenshots/01-entry-view.png" alt="01 · Entry view" /><br/>
<sub><b>Entry view</b> — bir skill seç, bir design system seç, brief'i yaz. Prototipler, deck'ler, mobil app'ler, dashboard'lar ve editoryal sayfalar için aynı yüzey.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/02-question-form.png" alt="02 · Turn-1 discovery form" /><br/>
<sub><b>Turn-1 discovery form</b> — model tek piksel yazmadan önce OD brief'i kilitler: yüzey, hedef kitle, ton, marka bağlamı, ölçek. 30 saniyelik radio seçimleri 30 dakikalık redirect'ten iyidir.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/03-direction-picker.png" alt="03 · Direction picker" /><br/>
<sub><b>Direction picker</b> — kullanıcının markası yoksa agent 5 küratörlü yön içeren ikinci formu üretir (Monocle / Modern Minimal / Tech Utility / Brutalist / Soft Warm). Tek radio tıklaması → deterministik palet + font stack; model freestyle yok.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/04-todo-progress.png" alt="04 · Live todo progress" /><br/>
<sub><b>Canlı todo ilerlemesi</b> — agent planı canlı kart olarak akar. <code>in_progress</code> → <code>completed</code> güncellemeleri gerçek zamanlı iner. Kullanıcı üretim sırasında ucuza yön değiştirebilir.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/05-preview-iframe.png" alt="05 · Sandboxed preview" /><br/>
<sub><b>Sandbox preview</b> — her <code>&lt;artifact&gt;</code> temiz bir srcdoc iframe içinde render edilir. File workspace üzerinden yerinde düzenlenebilir; HTML, PDF, ZIP olarak indirilebilir.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/06-design-systems-library.png" alt="06 · 72-system library" /><br/>
<sub><b>72 sistemlik kütüphane</b> — her ürün sistemi 4 renkli imzasını gösterir. Tam <code>DESIGN.md</code>, swatch grid ve canlı showcase için tıkla.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/07-magazine-deck.png" alt="07 · Magazine deck" /><br/>
<sub><b>Deck modu (guizang-ppt)</b> — paketlenmiş <a href="https://github.com/op7418/guizang-ppt-skill"><code>guizang-ppt-skill</code></a> değişmeden gelir. Dergi layout'ları, WebGL hero arka planları, tek dosyalı HTML çıktısı, PDF export.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/08-mobile-app.png" alt="08 · Mobile prototype" /><br/>
<sub><b>Mobil prototip</b> — pixel-accurate iPhone 15 Pro chrome (Dynamic Island, status bar SVG'leri, home indicator). Çok ekranlı prototipler paylaşılan <code>/frames/</code> asset'lerini kullanır; agent telefonu yeniden çizmez.</sub>
</td>
</tr>
</table>

## Skills

**Kutudan 31 skill çıkar.** Her biri [`skills/`](skills/) altında Claude Code [`SKILL.md`][skill] konvansiyonunu izleyen bir klasördür ve daemon'un aynen parse ettiği genişletilmiş `od:` frontmatter taşır: `mode`, `platform`, `scenario`, `preview.type`, `design_system.requires`, `default_for`, `featured`, `fidelity`, `speaker_notes`, `animations`, `example_prompt` ([`apps/daemon/src/skills.ts`](apps/daemon/src/skills.ts)).

Katalog iki üst düzey **mod** taşır: **`prototype`** (27 skill — dergi landing'inden telefon ekranına ve PM spec doc'a kadar tek sayfalık artefakt render eden her şey) ve **`deck`** (4 skill — deck-framework chrome ile yatay kaydırmalı sunumlar). Picker gruplamasını **`scenario`** alanı yapar: `design` · `marketing` · `operation` · `engineering` · `product` · `finance` · `hr` · `sale` · `personal`.

### Showcase örnekleri

İlk çalıştırma ihtimalin en yüksek olan görsel olarak ayırt edici skill'ler. Her biri repodan doğrudan açabileceğin gerçek bir `example.html` gönderir; auth yok, setup yok.

<table>
<tr>
<td width="50%" valign="top">
<a href="skills/dating-web/"><img src="docs/screenshots/skills/dating-web.png" alt="dating-web" /></a><br/>
<sub><b><a href="skills/dating-web/"><code>dating-web</code></a></b> · <i>prototype</i><br/>Consumer dating / matchmaking dashboard — sol rail nav, ticker bar, KPI'lar, 30 günlük mutual-match grafiği, editoryal tipografi.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/digital-eguide/"><img src="docs/screenshots/skills/digital-eguide.png" alt="digital-eguide" /></a><br/>
<sub><b><a href="skills/digital-eguide/"><code>digital-eguide</code></a></b> · <i>template</i><br/>İki spread'li dijital e-guide — kapak (başlık, yazar, TOC teaser) + pull-quote ve adım listeli ders spread'i. Creator / lifestyle tonu.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/email-marketing/"><img src="docs/screenshots/skills/email-marketing.png" alt="email-marketing" /></a><br/>
<sub><b><a href="skills/email-marketing/"><code>email-marketing</code></a></b> · <i>prototype</i><br/>Marka ürün lansmanı HTML e-postası — masthead, hero image, headline lockup, CTA, specs grid. Ortalanmış tek kolon, table fallback güvenli.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/gamified-app/"><img src="docs/screenshots/skills/gamified-app.png" alt="gamified-app" /></a><br/>
<sub><b><a href="skills/gamified-app/"><code>gamified-app</code></a></b> · <i>prototype</i><br/>Koyu showcase sahnesinde üç frame'li gamified mobil app prototipi — cover, XP ribbon'lı günlük görevler + level bar, görev detayı.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/mobile-onboarding/"><img src="docs/screenshots/skills/mobile-onboarding.png" alt="mobile-onboarding" /></a><br/>
<sub><b><a href="skills/mobile-onboarding/"><code>mobile-onboarding</code></a></b> · <i>prototype</i><br/>Üç frame'li mobil onboarding flow — splash, value-prop, sign-in. Status bar, swipe dot'ları, birincil CTA.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/motion-frames/"><img src="docs/screenshots/skills/motion-frames.png" alt="motion-frames" /></a><br/>
<sub><b><a href="skills/motion-frames/"><code>motion-frames</code></a></b> · <i>prototype</i><br/>Loop eden CSS animasyonlu tek frame motion-design hero — dönen type ring, animasyonlu globe, ticking timer. HyperFrames'e hand-off hazır.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/social-carousel/"><img src="docs/screenshots/skills/social-carousel.png" alt="social-carousel" /></a><br/>
<sub><b><a href="skills/social-carousel/"><code>social-carousel</code></a></b> · <i>prototype</i><br/>Üç kartlı 1080×1080 social-media carousel — seri boyunca bağlanan display başlıkları, marka işareti, loop affordance.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/sprite-animation/"><img src="docs/screenshots/skills/sprite-animation.png" alt="sprite-animation" /></a><br/>
<sub><b><a href="skills/sprite-animation/"><code>sprite-animation</code></a></b> · <i>prototype</i><br/>Pixel / 8-bit animasyonlu explainer slide — full-bleed cream sahne, animasyonlu pixel maskot, kinetik Japon display type, loop CSS keyframe'leri.</sub>
</td>
</tr>
</table>

### Design & marketing yüzeyleri (prototype modu)

| Skill | Platform | Scenario | Ne üretir |
|---|---|---|---|
| [`web-prototype`](skills/web-prototype/) | desktop | design | Tek sayfalık HTML — landing, marketing, hero sayfaları (prototype için varsayılan) |
| [`saas-landing`](skills/saas-landing/) | desktop | marketing | Hero / features / pricing / CTA marketing layout |
| [`dashboard`](skills/dashboard/) | desktop | operation | Sidebar + yoğun veri layout'lu admin / analytics |
| [`pricing-page`](skills/pricing-page/) | desktop | sale | Bağımsız pricing + karşılaştırma tabloları |
| [`docs-page`](skills/docs-page/) | desktop | engineering | 3 kolonlu dokümantasyon layout'u |
| [`blog-post`](skills/blog-post/) | desktop | marketing | Editoryal long-form |
| [`mobile-app`](skills/mobile-app/) | mobile | design | iPhone 15 Pro / Pixel frame'li app ekranları |
| [`mobile-onboarding`](skills/mobile-onboarding/) | mobile | design | Çok ekranlı mobil onboarding flow (splash · value-prop · sign-in) |
| [`gamified-app`](skills/gamified-app/) | mobile | personal | Üç frame'li gamified mobil app prototipi |
| [`email-marketing`](skills/email-marketing/) | desktop | marketing | Marka ürün lansmanı HTML e-postası (table fallback güvenli) |
| [`social-carousel`](skills/social-carousel/) | desktop | marketing | 3 kartlı 1080×1080 social carousel |
| [`magazine-poster`](skills/magazine-poster/) | desktop | marketing | Tek sayfalık dergi tarzı poster |
| [`motion-frames`](skills/motion-frames/) | desktop | marketing | Loop CSS animasyonlu motion-design hero |
| [`sprite-animation`](skills/sprite-animation/) | desktop | marketing | Pixel / 8-bit animasyonlu explainer slide |
| [`dating-web`](skills/dating-web/) | desktop | personal | Consumer dating dashboard mockup |
| [`digital-eguide`](skills/digital-eguide/) | desktop | marketing | İki spread'li dijital e-guide (kapak + ders) |
| [`wireframe-sketch`](skills/wireframe-sketch/) | desktop | design | Elle çizilmiş fikir eskizi — "erken görünür bir şey göster" geçişi için |
| [`critique`](skills/critique/) | desktop | design | Beş boyutlu self-critique skor sayfası (Philosophy · Hierarchy · Detail · Function · Innovation) |
| [`tweaks`](skills/tweaks/) | desktop | design | AI-emitted tweaks panel — model oynatmaya değer parametreleri yüzeye çıkarır |

### Deck yüzeyleri (deck modu)

| Skill | Varsayılan olduğu yer | Ne üretir |
|---|---|---|
| [`guizang-ppt`](skills/guizang-ppt/) | deck için **varsayılan** | Dergi tarzı web PPT — [op7418/guizang-ppt-skill][guizang] kaynaklı aynen paketlenmiş, özgün LICENSE korunmuş |
| [`simple-deck`](skills/simple-deck/) | — | Minimal yatay kaydırmalı deck |
| [`replit-deck`](skills/replit-deck/) | — | Ürün walkthrough deck'i (Replit tarzı) |
| [`weekly-update`](skills/weekly-update/) | — | Kaydırmalı deck olarak ekip weekly cadence'i (progress · blockers · next) |

### Office & operations yüzeyleri (prototype modu, doküman tadında scenario'lar)

| Skill | Scenario | Ne üretir |
|---|---|---|
| [`pm-spec`](skills/pm-spec/) | product | TOC + decision log içeren PM specification doc |
| [`team-okrs`](skills/team-okrs/) | product | OKR skor sayfası |
| [`meeting-notes`](skills/meeting-notes/) | operation | Toplantı karar kaydı |
| [`kanban-board`](skills/kanban-board/) | operation | Board snapshot |
| [`eng-runbook`](skills/eng-runbook/) | engineering | Incident runbook |
| [`finance-report`](skills/finance-report/) | finance | Exec finance özeti |
| [`invoice`](skills/invoice/) | finance | Tek sayfalık invoice |
| [`hr-onboarding`](skills/hr-onboarding/) | hr | Rol onboarding planı |

Skill eklemek tek klasörlük iştir. Genişletilmiş frontmatter için [`docs/skills-protocol.md`](docs/skills-protocol.md) oku, mevcut bir skill'i fork'la, daemon'u yeniden başlat; picker'da görünür. Katalog endpoint'i `GET /api/skills`; skill başına seed assembly (template + side-file references) `GET /api/skills/:id/example` içinde yaşar.

## Altı taşıyıcı fikir

### 1 · Agent göndermiyoruz. Seninki yeterince iyi.

Daemon başlangıçta `PATH` üzerinde [`claude`](https://docs.anthropic.com/en/docs/claude-code), [`codex`](https://github.com/openai/codex), `devin`, [`cursor-agent`](https://www.cursor.com/cli), [`gemini`](https://github.com/google-gemini/gemini-cli), [`opencode`](https://opencode.ai/), [`qwen`](https://github.com/QwenLM/qwen-code), `qodercli`, [`copilot`](https://github.com/features/copilot/cli), `hermes`, `kimi`, [`pi`](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent), [`kiro-cli`](https://kiro.dev), `kilo`, [`vibe-acp`](https://github.com/mistralai/mistral-vibe) ve `deepseek` arar. Buldukları aday tasarım motorları olur; her CLI için bir adapter ile stdio üzerinden sürülür ve model picker'dan değiştirilebilir. [`multica`](https://github.com/multica-ai/multica) ve [`cc-switch`](https://github.com/farion1231/cc-switch) ilham verdi. CLI kurulu değil mi? API modu, spawn çıkarılmış aynı pipeline'dır: Anthropic, OpenAI-compatible, Azure OpenAI veya Google Gemini seç; daemon normalize SSE chunk'larını geri iletir, loopback / link-local / RFC1918 hedefler kenarda reddedilir.

### 2 · Skill'ler plugin değil, dosyadır.

Claude Code'un [`SKILL.md` konvansiyonunu](https://docs.anthropic.com/en/docs/claude-code/skills) izleyerek her skill `SKILL.md` + `assets/` + `references/` olur. [`skills/`](skills/) altına klasör bırak, daemon'u yeniden başlat, picker'da görünür. Paketlenmiş `magazine-web-ppt`, [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) olarak aynen commit'lendi; özgün lisans ve attribution korundu.

### 3 · Design System'ler theme JSON değil, taşınabilir Markdown'dır.

[`VoltAgent/awesome-design-md`][acd2] kaynaklı 9 bölümlü `DESIGN.md` şeması — renk, tipografi, spacing, layout, component'ler, motion, voice, brand, anti-pattern'ler. Her artefakt aktif sistemden okur. Sistemi değiştir → sonraki render yeni token'ları kullanır. Dropdown **Linear, Stripe, Vercel, Airbnb, Tesla, Notion, Apple, Anthropic, Cursor, Supabase, Figma, Resend, Raycast, Lovable, Cohere, Mistral, ElevenLabs, X.AI, Spotify, Webflow, Sanity, PostHog, Sentry, MongoDB, ClickHouse, Cal, Replicate, Clay, Composio, Xiaohongshu…** ile gelir; ayrıca [`awesome-design-skills`][ads] kaynaklı 57 design skill vardır.

### 4 · Etkileşimli soru formu redirect'lerin %80'ini önler.

OD'nin prompt stack'i `RULE 1`'i sabitler: her yeni tasarım brief'i kod yerine `<question-form id="discovery">` ile başlar. Yüzey · hedef kitle · ton · marka bağlamı · ölçek · kısıtlar. Uzun bir brief hâlâ tasarım kararlarını açık bırakır — görsel ton, renk tavrı, ölçek — form tam bunları 30 saniyede kilitler. Yanlış yönün maliyeti bitmiş bir deck değil, tek chat turudur.

Bu, [`huashu-design`](https://github.com/alchaincyf/huashu-design) içinden damıtılmış **Junior-Designer mode**'dur: soruları önden topla, erken görünür bir şey göster (gri bloklu wireframe bile olur), kullanıcının ucuza yön değiştirmesine izin ver. Marka varlığı protokolüyle (locate · download · `grep` hex · `brand-spec.md` yaz · vocalise) birleşince, çıktının AI freestyle gibi değil de boyamadan önce dikkat etmiş bir tasarımcı gibi hissettirmesinin en büyük nedeni olur.

### 5 · Daemon, agent'a dizüstü bilgisayarındaymış hissi verir; çünkü öyledir.

Daemon CLI'ı `.od/projects/<id>/` altındaki proje artefakt klasörü `cwd` olacak şekilde spawn eder. Agent gerçek dosya sistemine karşı `Read`, `Write`, `Bash`, `WebFetch` alır. Skill'in `assets/template.html` dosyasını `Read` edebilir, CSS'inde hex değerleri için `grep` yapabilir, `brand-spec.md` yazabilir, üretilmiş görselleri bırakabilir ve turn bitince file workspace'te download chip'i olarak görünen `.pptx` / `.zip` / `.pdf` dosyaları üretebilir. Session'lar, conversation'lar, message'lar ve tab'lar local SQLite DB'de kalır; projeyi yarın açtığında agent'ın todo card'ı bıraktığın yerde durur.

### 6 · Prompt stack ürünün kendisidir.

Send anında compose edilen şey "system + user" değildir. Şudur:

```text
DISCOVERY directives  (turn-1 form, turn-2 brand branch, TodoWrite, 5-dim critique)
  + identity charter   (OFFICIAL_DESIGNER_PROMPT, anti-AI-slop, junior-pass)
  + active DESIGN.md   (72 systems available)
  + active SKILL.md    (31 skills available)
  + project metadata   (kind, fidelity, speakerNotes, animations, inspiration ids)
  + skill side files   (auto-injected pre-flight: read assets/template.html + references/*.md)
  + (deck kind, no skill seed) DECK_FRAMEWORK_DIRECTIVE   (nav / counter / scroll / print)
```

Her katman birleştirilebilir. Her katman düzenleyebileceğin bir dosyadır. Gerçek contract'ı görmek için [`packages/contracts/src/prompts/system.ts`](packages/contracts/src/prompts/system.ts) ve [`packages/contracts/src/prompts/discovery.ts`](packages/contracts/src/prompts/discovery.ts) oku.

## Mimari

```text
browser (Next.js 16)
  chat · file workspace · iframe preview · settings · imports
        │ /api/* (dev'de rewritten)
        ▼
Local daemon (Express + SQLite)
  /api/agents          /api/skills
  /api/design-systems  /api/projects/...
  /api/chat (SSE)      /api/proxy/{provider}/stream (SSE)
  /api/templates       /api/import/claude-design
  /api/artifacts/save  /api/artifacts/lint
  /api/upload          /api/projects/:id/files...
  /artifacts (static)  /frames (static)
        │ spawn(cli, [...], { cwd: .od/projects/<id> })
        ▼
claude · codex · devin (ACP) · gemini · opencode · cursor-agent · qwen · qoder · copilot · hermes (ACP) · kimi (ACP) · pi (RPC) · kiro (ACP) · kilo (ACP) · vibe (ACP) · deepseek
  SKILL.md + DESIGN.md okur, artefaktları diske yazar
```

| Katman | Stack |
|---|---|
| Frontend | Next.js 16 App Router + React 18 + TypeScript, Vercel'e dağıtılabilir |
| Daemon | Node 24 · Express · SSE streaming · `better-sqlite3`; tablolar: `projects` · `conversations` · `messages` · `tabs` · `templates` |
| Agent transport | `child_process.spawn`; `claude-stream-json` (Claude Code), `qoder-stream-json` (Qoder CLI), `copilot-stream-json` (Copilot), CLI başına `json-event-stream` parser'ları (Codex / Gemini / OpenCode / Cursor Agent), `acp-json-rpc` (Devin / Hermes / Kimi / Kiro / Kilo / Mistral Vibe via Agent Client Protocol), `pi-rpc` (Pi via stdio JSON-RPC), `plain` (Qwen Code / DeepSeek TUI) |
| BYOK proxy | `POST /api/proxy/{anthropic,openai,azure,google}/stream` → provider'a özel upstream API'ler, normalize `delta/end/error` SSE; daemon kenarında loopback / link-local / RFC1918 host'ları reddeder |
| Storage | `.od/projects/<id>/` içinde düz dosyalar + `.od/app.sqlite` SQLite + `.od/media-config.json` credential'ları (gitignored, otomatik oluşur). `OD_DATA_DIR=<dir>` tüm daemon verisini taşır; `OD_MEDIA_CONFIG_DIR=<dir>` sadece `media-config.json` için override'ı daraltır |
| Preview | `srcdoc` ile sandbox iframe + skill başına `<artifact>` parser ([`apps/web/src/artifacts/parser.ts`](apps/web/src/artifacts/parser.ts)) |
| Export | HTML (inline asset'ler) · PDF (browser print, deck-aware) · PPTX (agent-driven via skill) · ZIP (archiver) · Markdown |
| Lifecycle | `pnpm tools-dev start \| stop \| run \| status \| logs \| inspect \| check`; port'lar `--daemon-port` / `--web-port`, namespace'ler `--namespace` |
| Desktop (opsiyonel) | Electron shell — web URL'ini sidecar IPC üzerinden bulur, port tahmini yok; aynı `STATUS`/`EVAL`/`SCREENSHOT`/`CONSOLE`/`CLICK`/`SHUTDOWN` kanalı E2E için `tools-dev inspect desktop ...` sağlar |

## Quickstart

### Desktop app'i indir (build gerekmez)

Open Design'ı denemenin en hızlı yolu prebuilt desktop app'tir; Node yok, pnpm yok, clone yok:

- **[open-design.ai](https://open-design.ai/)** — resmi indirme sayfası
- **[GitHub releases](https://github.com/nexu-io/open-design/releases)**

### Kaynaktan çalıştır

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable
corepack pnpm --version   # 10.33.2 yazmalı
pnpm install
pnpm tools-dev run web
# tools-dev'in yazdırdığı web URL'ini aç
```

Ortam gereksinimleri: Node `~24` ve pnpm `10.33.x`. `nvm`/`fnm` yalnızca opsiyonel yardımcılardır; birini kullanıyorsan `pnpm install` öncesinde `nvm install 24 && nvm use 24` veya `fnm install 24 && fnm use 24` çalıştır.

Desktop/background startup, fixed-port restart'lar ve medya üretimi dispatcher kontrolleri (`OD_BIN`, `OD_DAEMON_URL`, `apps/daemon/dist/cli.js`) için [`QUICKSTART.md`](QUICKSTART.md) oku.

İlk yükleme:

1. `PATH` üzerindeki agent CLI'larını algılar ve birini otomatik seçer.
2. 31 skill + 72 design system yükler.
3. Anthropic key yapıştırabilmen için welcome dialog'u açar (yalnızca BYOK fallback path için gerekir).
4. **`./.od/` klasörünü otomatik oluşturur** — SQLite project DB, proje artefaktları ve kayıtlı render'lar için local runtime klasörü. `od init` adımı yoktur; daemon boot sırasında ihtiyacı olan her şeyi `mkdir` eder.

Bir prompt yaz, **Send**'e bas, soru formunun gelmesini izle, doldur, todo card'ın akmasını izle, artefaktın render edilmesini izle. **Save to disk**'e tıkla veya proje ZIP'i indir.

### İlk çalışma durumu (`./.od/`)

Daemon repo root'unda gizli bir klasöre sahiptir. İçindeki her şey gitignored ve makineye özeldir; asla commit'leme.

```text
.od/
├── app.sqlite                 ← projects · conversations · messages · open tabs
├── artifacts/                 ← tek seferlik "Save to disk" render'ları (timestamp'li)
└── projects/<id>/             ← proje başına working dir, aynı zamanda agent cwd'si
```

| İstediğin şey | Yapılacak |
|---|---|
| İçinde ne var bakmak | `ls -la .od && sqlite3 .od/app.sqlite '.tables'` |
| Temiz başlangıca sıfırlamak | `pnpm tools-dev stop`, `rm -rf .od`, sonra tekrar `pnpm tools-dev run web` |
| Başka yere taşımak | `OD_DATA_DIR=<absolute-or-relative-path> pnpm tools-dev run web` — daemon `~/` çözer ve relative path'leri repo root'a bağlar. Credential'ları ayrı yerde tutmak istiyorsan `OD_MEDIA_CONFIG_DIR=<dir>` override'ı sadece `media-config.json` için daraltır. |

#### Desktop app öncesi `.od/` verisini kurulu Desktop app'e taşıma

Önce repoyu çalıştırıp daha sonra paketli Desktop app'i kurduysan iki writer farklı root'lara yazar:

- Repo dev-server (`pnpm tools-dev start web`) `<repo-root>/.od/` içine yazar.
- Kurulu Desktop app `<appData>/Open Design/namespaces/<channel>/data/` altına yazar; `<appData>`, Electron'un OS bazlı app-data köküdür. Channel suffix'i **platforma özeldir**; release workflow'ları `-win`/`-linux` ekler:

  | Platform | `<appData>` (Electron `appData` base) | Stable channel | Beta channel |
  |---|---|---|---|
  | macOS | `~/Library/Application Support` | `release-stable` | `release-beta` |
  | Windows | `%APPDATA%` (= `%USERPROFILE%\AppData\Roaming`) | `release-stable-win` | `release-beta-win` |
  | Linux | `$XDG_CONFIG_HOME` (varsayılan `~/.config`) | `release-stable-linux` | `release-beta-linux` |

Örnek çözümlenen path'ler:

- macOS beta: `~/Library/Application Support/Open Design/namespaces/release-beta/data/`
- Windows beta: `%APPDATA%\Open Design\namespaces\release-beta-win\data\`
- Linux beta: `~/.config/Open Design/namespaces/release-beta-linux/data/`

Emin değilsen app boot olur olmaz paketli daemon log'una bak; çözümlenen `daemonDataRoot` değerini log'lar.

> **Uyarı: bunu temiz durumda yap.** Migration, Desktop app'in data dir'ini repo `.od/` ile değiştirir; merge etmez. Kopyalamadan önce iki writer da tamamen durmuş olmalı: Desktop app'ten çık **ve** repo dev-server'ını durdur. SQLite-WAL iki tarafta da temiz flush etmelidir; daemon'lardan biri çalışıyorsa snapshot ortasında SQLite/WAL page'leri veya proje/artefakt dosyaları yazabilir. Desktop app'te önemsediğin projeler varsa devam etmeden önce hangi tarafın authoritative olduğuna karar ver; aşağıdaki adımlar Desktop'ın mevcut `data/` klasörünü sibling backup'a alır ama merge etmez.

##### Option A: `OD_LEGACY_DATA_DIR` ile tek seferlik auto-migration

Desktop app'in `data/` klasörü hâlâ boşsa bunu kullan; [#710](https://github.com/nexu-io/open-design/issues/710) ile görünür olan upgrade'den hemen sonraki tipik durum budur. Önce Desktop app'ten çık (daemon `app.sqlite` tutmasın), sonra `OD_LEGACY_DATA_DIR` eski repo `.od/` değerini gösterecek şekilde yeniden başlat. Daemon payload'u sibling tmp dizinine stage eder ve ancak başarıda `data/` içine promote eder; hatada staging dizini kaldırılır, sonraki boot temiz retry eder.

Daemon görünür startup hatasıyla şu durumlarda reddeder:

- `OD_LEGACY_DATA_DIR` içindeki path `app.sqlite` içermezse (typo, silinmiş kaynak, yanlış path), veya
- Desktop'ın `data/` klasörü zaten `app.sqlite`, `projects/`, `artifacts/`, `media-config.json` vb. içeriyorsa. SQLite/WAL çiftleri ve proje ağaçları güvenle iç içe geçirilemez; daemon sessizce iki tarafı bozmak yerine merge'i reddeder. Desktop zaten boot edip kendi `data/` içeriğini seed ettiyse Option B kullan ve hangi tarafın kazanacağını açıkça seç.

Başarıda `.migrated-from` marker yazılır; sonraki boot'lar no-op olur.

Önce Desktop app'ten çık, sonra bu env ile yeniden başlat. Launcher değişkeni sadece `open` / `xdg-open` çalıştıran shell'e değil, *app process* environment'ına koymalıdır.

**macOS** (LaunchServices shell env devralmaz, doğrudan binary kullan):

```bash
OD_LEGACY_DATA_DIR="/path/to/old/repo/.od" \
  "/Applications/Open Design.app/Contents/MacOS/Open Design"
```

Dock launcher istiyorsan önce `launchctl` içinde değişkeni set et, app'i aç, sonra unset et:

```bash
launchctl setenv OD_LEGACY_DATA_DIR "/path/to/old/repo/.od"
open "/Applications/Open Design.app"
# Migration log satırı göründükten sonra:
launchctl unsetenv OD_LEGACY_DATA_DIR
```

**Linux** (env var gerçekten ulaşsın diye binary'yi doğrudan çalıştır):

```bash
OD_LEGACY_DATA_DIR="/path/to/old/repo/.od" /path/to/open-design
# (ör. çalıştırdığın AppImage veya /opt altındaki unpacked binary)
```

**Windows (PowerShell):**

```powershell
$env:OD_LEGACY_DATA_DIR="C:\path\to\old\repo\.od"
& "$env:LOCALAPPDATA\Programs\Open Design\Open Design.exe"
```

Daemon log'u `[od-migrate] migration complete: copied N entries (...)` kaydeder. İlk launch sonrası env variable'ı temizleyebilirsin; marker sonraki run'larda re-migration'ı engeller.

##### Option B: manuel kopya

Option A uygun değilse (Desktop zaten kendi verisine sahip ve onu açıkça değiştirmek istiyorsan) mevcut projelerini, SQLite'ı, artefaktları ve `media-config.json` dosyasını Desktop app'e taşımak için.

**macOS / Linux (bash):**

```bash
set -euo pipefail
# 1. İki writer'ı da durdur; kaynak ve hedef quiescent olsun.
#    - Desktop app'ten çık (macOS'ta Cmd+Q, Linux'ta File → Exit).
#    - Repo root'tan repo dev-server'ı durdur: `pnpm tools-dev stop`.
# 2. REPO ve APP_DATA değerlerini gerçek path'lerine ayarla; aşağıdaki örnek macOS + beta.
REPO="/path/to/open-design"
APP_DATA="$HOME/Library/Application Support/Open Design/namespaces/release-beta/data"

# 3. Preflight: Desktop app'te ne var bak.
ls "$APP_DATA/projects" 2>/dev/null && echo "Desktop already has projects, confirm this is a replace, not a merge."

# 4. Önce sibling'e stage et, sonra atomik olarak yerine koy.
STAGE="${APP_DATA}.staged-$(date +%F-%H%M)"
mkdir -p "$STAGE"
rsync -a --exclude='backup-*' "$REPO/.od/" "$STAGE/" || { echo "rsync failed, aborting before swap"; exit 1; }

# 5. Desktop'ın mevcut verisini yedekle, staging'i promote et.
mv "$APP_DATA" "${APP_DATA}.fresh-baseline-$(date +%F-%H%M)"
mv "$STAGE" "$APP_DATA"

# 6. Desktop app'i yeniden başlat. Daemon boot'ta forward schema değişikliklerini uygular.
```

**Windows (PowerShell):**

```powershell
$ErrorActionPreference = 'Stop'
# 1. Kaynak ve hedef quiescent olsun diye iki writer'ı durdur.
#    - Desktop app'ten çık (File > Exit).
#    - Repo root'tan repo dev-server'ı durdur: `pnpm tools-dev stop`.
# 2. $Repo ve $AppData değerlerini gerçek path'lerine ayarla; örnek stable channel.
$Repo    = 'C:\path\to\open-design'
$AppData = Join-Path $env:APPDATA 'Open Design\namespaces\release-stable-win\data'

# 3. Preflight: Desktop app'te ne var bak.
if (Test-Path (Join-Path $AppData 'projects')) {
  Write-Host 'Desktop already has projects, confirm this is a replace, not a merge.'
}

# 4. Önce sibling'e stage et. Robocopy /MIR source'u staging'e mirror eder.
$Stamp = Get-Date -Format 'yyyy-MM-dd-HHmm'
$Stage = "$AppData.staged-$Stamp"
robocopy "$Repo\.od" $Stage /MIR /XD 'backup-*' | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed (exit $LASTEXITCODE), aborting before swap" }

# 5. Desktop'ın mevcut verisini yedekle, staging'i promote et.
if (Test-Path $AppData) { Rename-Item $AppData "$AppData.fresh-baseline-$Stamp" }
Rename-Item $Stage $AppData

# 6. Desktop app'i yeniden başlat. Daemon boot'ta forward schema değişikliklerini uygular.
```

Relaunch sonrası bir şey yanlış görünürse `$APP_DATA` (Windows'ta `$AppData`) klasörünü silip `.fresh-baseline-*` dizinini tekrar yerine adlandırarak özgün Desktop verisini geri yükle.

> **Uyarı: schema migration'ları forward-only'dir.** Daemon boot'ta `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` değişiklikleri uygular; version guard yoktur. Migration sonrası aynı data dir'i daha eski repo checkout ile açma; desteklenmeyen kolonlar veya davranış farkları workspace'i tutarsız bırakabilir. Yeni app ile ilk launch öncesi `app.sqlite*` yedeği al.

> **İleri seviye: repo dev-server ve Desktop app arasında tek data dir paylaşmak.** `OD_DATA_DIR` ile iki tarafı aynı dir'e yönlendirmek mümkün ama **yalnızca aynı anda biri çalışıyorsa** güvenlidir. Daemon `app.sqlite` dosyasını WAL modunda açar ve `projects/` ile `artifacts/` altında koordine edilmemiş dosya yazar; iki writer'ı aynı anda çalıştırmak SQLite'ı bozabilir veya artefaktları clobber edebilir. Dev-server'ı başlatmadan önce Desktop app'i, Desktop app'i açmadan önce dev-server'ı daima durdur:
>
> ```bash
> OD_DATA_DIR="$HOME/Library/Application Support/Open Design/namespaces/release-beta/data" \
>   pnpm tools-dev start web
> ```

Tam dosya haritası, script'ler ve troubleshooting → [`QUICKSTART.md`](QUICKSTART.md).

## Projeyi çalıştırma

Open Design tarayıcıda web app veya Electron desktop app olarak çalışabilir. İki mod da aynı local daemon + web mimarisini paylaşır.

### Web / Localhost (varsayılan)

```bash
# Foreground mode — lifecycle komutunu foreground'da tutar (log'lar dosyalara yazılır)
pnpm tools-dev run web

# Son log'ları görüntüle:
pnpm tools-dev logs

# Background mode — daemon + web background process olarak çalışır
pnpm tools-dev start web
```

Varsayılan olarak `tools-dev` uygun ephemeral port'lara bind eder ve başlangıçta gerçek URL'leri yazdırır. Durdurulmuş durumdan fixed port kullanmak için:

```bash
pnpm tools-dev run web --daemon-port 17456 --web-port 17573
```

Daemon/web zaten çalışıyorsa mevcut session'da port değiştirmek için `restart` kullan:

```bash
pnpm tools-dev restart --daemon-port 17456 --web-port 17573
```

### Desktop / Electron

```bash
# Daemon + web + desktop'ı background'da başlat
pnpm tools-dev

# Desktop durumunu kontrol et
pnpm tools-dev inspect desktop status

# Desktop app screenshot al
pnpm tools-dev inspect desktop screenshot --path /tmp/open-design.png
```

Desktop app web URL'ini sidecar IPC üzerinden otomatik bulur; port tahmini gerekmez.

### Diğer faydalı komutlar

| Komut | Ne yapar |
|---|---|
| `pnpm tools-dev status` | Çalışan sidecar durumlarını gösterir |
| `pnpm tools-dev logs` | Daemon/web/desktop log tail'lerini gösterir |
| `pnpm tools-dev stop` | Tüm çalışan sidecar'ları durdurur |
| `pnpm tools-dev restart` | Tüm sidecar'ları durdurup yeniden başlatır |
| `pnpm tools-dev check` | Durum + son log'lar + yaygın diagnostic'ler |

Fixed-port restart'lar, background startup ve tam troubleshooting için [`QUICKSTART.md`](QUICKSTART.md) oku.

## Open Design'ı coding agent'ından kullanma

Open Design bir stdio MCP server gönderir. Claude Code, Codex, Cursor, VS Code, Antigravity, Zed, Windsurf veya MCP uyumlu herhangi bir client'a bağla; başka repodaki agent yerel Open Design projelerinden dosyaları doğrudan okuyabilir. Export-then-attach döngüsünün yerine geçer. Agent `search_files`, `get_file` veya `get_artifact` çağırırken project argümanı vermezse MCP, Open Design'da o anda açık olan proje (ve dosya) neyse onu varsayar; *"build this in my app"* veya *"match these styles"* gibi prompt'lar doğrudan çalışır.

**Neden MCP?** Her tasarım iterasyonunda zip export edip tekrar attach etmek akışı bozar. MCP server tasarım kaynağını — token CSS, JSX component'leri, entry HTML — agent'ın ada göre sorgulayabileceği structured API olarak açar. Agent son export'tan kalma stale copy'yi değil, her zaman canlı dosyayı görür.

Client başına install flow için Open Design app içinde **Settings → MCP server** aç. Panel, `node` binary'nin absolute path'ini ve daemon'un build edilmiş `cli.js` dosyasını her snippet içine işler; böylece `od` PATH'te yokken bile taze source clone'da çalışır. Cursor one-click deeplink alır; diğerleri config dosyalarının beklediği schema'da copy-paste JSON snippet alır (Claude Code, `~/.claude.json` dosyasını elle düzenlememek için `claude mcp add-json` one-liner içerir). Server'ın görünmesi için install sonrası client'ını yeniden başlat veya reload et.

MCP tool call'larının başarılı olması için daemon lokal olarak çalışmalıdır. Agent Open Design'dan önce başlatıldıysa, Open Design açıldıktan sonra agent'ı yeniden başlat; canlı daemon'a ulaşabilsin. Daemon offline iken yapılan tool call'ları crash yerine net `"daemon not reachable"` hatası döndürür.

**Güvenlik modeli.** MCP server read-only'dir; dosya okuma, dosya metadata ve search açar; diske yazan veya harici servis çağıran bir şey yoktur. Coding agent'ın child process'i olarak stdio üzerinden çalışır, yani kaydettiğin MCP client yerel Open Design projelerine read access devralır. Bunu bir VS Code extension kurmak gibi ele al: yalnızca güvendiğin client'ları kaydet. Daemon varsayılan olarak `127.0.0.1` üzerinde bind eder; LAN'a açmak açık `OD_BIND_HOST` opt-in ister.

## Repository structure

```text
open-design/
├── README.md                      ← this file
├── README.de.md                   ← Deutsch
├── README.ru.md                   ← Русский
├── README.zh-CN.md                ← 简体中文
├── README.tr.md                   ← Türkçe
├── QUICKSTART.md                  ← run / build / deploy guide
├── package.json                   ← pnpm workspace, single bin: od
│
├── apps/
│   ├── daemon/                    ← Node + Express, the only server
│   │   ├── src/                   ← TypeScript daemon source
│   │   │   ├── cli.ts             ← `od` bin source, compiled to dist/cli.js
│   │   │   ├── server.ts          ← /api/* routes (projects, chat, files, exports)
│   │   │   ├── agents.ts          ← PATH scanner + per-CLI argv builders
│   │   │   ├── claude-stream.ts   ← streaming JSON parser for Claude Code stdout
│   │   │   ├── skills.ts          ← SKILL.md frontmatter loader
│   │   │   └── db.ts              ← SQLite schema (projects/messages/templates/tabs)
│   │   ├── sidecar/               ← tools-dev daemon sidecar wrapper
│   │   └── tests/                 ← daemon package tests
│   │
│   └── web/                       ← Next.js 16 App Router + React client
│       ├── app/                   ← App Router entrypoints
│       ├── next.config.ts         ← dev rewrites + prod static export to out/
│       └── src/                   ← React + TypeScript client modules
│           ├── App.tsx            ← routing, bootstrap, settings
│           ├── components/        ← chat, composer, picker, preview, sketch, …
│           ├── prompts/
│           │   ├── system.ts      ← composeSystemPrompt(base, skill, DS, metadata)
│           │   ├── discovery.ts   ← turn-1 form + turn-2 branch + 5-dim critique
│           │   └── directions.ts  ← 5 visual directions × OKLch palette + font stack
│           ├── artifacts/         ← streaming <artifact> parser + manifests
│           ├── runtime/           ← iframe srcdoc, markdown, export helpers
│           ├── providers/         ← daemon SSE + BYOK API transports
│           └── state/             ← config + projects (localStorage + daemon-backed)
│
├── e2e/                           ← Playwright UI + external integration/Vitest harness
│
├── packages/
│   ├── contracts/                 ← shared web/daemon app contracts
│   ├── sidecar-proto/             ← Open Design sidecar protocol contract
│   ├── sidecar/                   ← generic sidecar runtime primitives
│   └── platform/                  ← generic process/platform primitives
│
├── skills/                        ← 31 SKILL.md skill bundles (27 prototype + 4 deck)
├── design-systems/                ← 72 DESIGN.md systems
├── assets/frames/                 ← shared device frames (used cross-skill)
├── templates/                     ← deck baselines
├── scripts/                       ← sync/import utilities
├── docs/                          ← specs, architecture, protocols, roadmap
└── .od/                           ← runtime data, gitignored, auto-created
```

## Design Systems

<p align="center">
  <img src="docs/assets/design-systems-library.png" alt="72 design system kütüphanesi — style guide spread" width="100%" />
</p>

Kutudan tekil [`DESIGN.md`](design-systems/README.md) dosyaları olarak 72 sistem çıkar:

<details>
<summary><b>Tam katalog</b> (açmak için tıkla)</summary>

**AI & LLM** — `claude` · `cohere` · `mistral-ai` · `minimax` · `together-ai` · `replicate` · `runwayml` · `elevenlabs` · `ollama` · `x-ai`

**Developer Tools** — `cursor` · `vercel` · `linear-app` · `framer` · `expo` · `clickhouse` · `mongodb` · `supabase` · `hashicorp` · `posthog` · `sentry` · `warp` · `webflow` · `sanity` · `mintlify` · `lovable` · `composio` · `opencode-ai` · `voltagent`

**Productivity** — `notion` · `figma` · `miro` · `airtable` · `superhuman` · `intercom` · `zapier` · `cal` · `clay` · `raycast`

**Fintech** — `stripe` · `coinbase` · `binance` · `kraken` · `mastercard` · `revolut` · `wise`

**E-Commerce** — `shopify` · `airbnb` · `uber` · `nike` · `starbucks` · `pinterest`

**Media** — `spotify` · `playstation` · `wired` · `theverge` · `meta`

**Automotive** — `tesla` · `bmw` · `ferrari` · `lamborghini` · `bugatti` · `renault`

**Other** — `apple` · `ibm` · `nvidia` · `vodafone` · `sentry` · `resend` · `spacex`

**Starters** — `default` (Neutral Modern) · `warm-editorial`

</details>

Ürün sistemi kütüphanesi [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts) ile [`VoltAgent/awesome-design-md`][acd2] kaynağından import edilir. Yenilemek için tekrar çalıştır. 57 design skill [`bergside/awesome-design-skills`][ads] kaynağından gelir ve doğrudan `design-systems/` içine eklenir.

## Görsel yönler

Kullanıcının brand spec'i yoksa agent beş küratörlü direction içeren ikinci formu üretir — OD'nin [`huashu-design` "5 schools × 20 design philosophies" fallback](https://github.com/alchaincyf/huashu-design#%E8%AE%BE%E8%AE%A1%E6%96%B9%E5%90%91%E9%A1%BE%E9%97%AE-fallback) uyarlaması. Her direction deterministik bir spec'tir: OKLch palet, font stack, layout posture cue'ları, referanslar. Agent bunları seed template'in `:root` içine aynen bağlar. Tek radio tıklaması → tamamen belirlenmiş görsel sistem. Doğaçlama yok, AI-slop yok.

| Direction | Mood | Refs |
|---|---|---|
| Editorial — Monocle / FT | Basılı dergi, mürekkep + krem + sıcak pas | Monocle · FT Weekend · NYT Magazine |
| Modern minimal — Linear / Vercel | Serin, yapısal, minimal vurgu | Linear · Vercel · Stripe |
| Tech utility | Bilgi yoğunluğu, monospace, terminal | Bloomberg · Bauhaus tools |
| Brutalist | Ham, oversized type, gölge yok, sert vurgular | Bloomberg Businessweek · Achtung |
| Soft warm | Cömert, düşük kontrast, şeftali nötrleri | Notion marketing · Apple Health |

Tam spec → [`packages/contracts/src/prompts/directions.ts`](packages/contracts/src/prompts/directions.ts).

## Medya üretimi

OD kodda durmaz. `<artifact>` HTML üreten aynı chat yüzeyi, daemon'un medya pipeline'ına bağlı model adapter'larıyla **görsel**, **video** ve **ses** üretimini de yürütür ([`apps/daemon/src/media-models.ts`](apps/daemon/src/media-models.ts), [`apps/web/src/media/models.ts`](apps/web/src/media/models.ts)). Her render proje workspace'ine gerçek dosya olarak iner — görsel için `.png`, video için `.mp4` — ve turn bitince download chip'i olarak görünür.

Bugün yükü üç model ailesi taşır:

| Surface | Model | Provider | Ne için |
|---|---|---|---|
| **Image** | `gpt-image-2` | Azure / OpenAI | Posterler, profil avatarları, illüstre haritalar, infografikler, dergi tarzı social card'lar, foto restorasyonu, exploded-view product art |
| **Video** | `seedance-2.0` | ByteDance Volcengine | Sesli 15s sinematik t2v + i2v — narrative short'lar, karakter close-up'ları, ürün filmleri, MV tarzı koreografi |
| **Video** | `hyperframes-html` | [HeyGen / OSS](https://github.com/heygen-com/hyperframes) | HTML→MP4 motion graphics — ürün reveal'ları, kinetik tipografi, data chart'ları, social overlay'ler, logo outro'ları, karaoke caption'lı TikTok vertical'ları |

[`prompt-templates/`](prompt-templates/) altında büyüyen **prompt gallery**, **93 yeniden üretilebilir prompt** gönderir: 43 image (`prompt-templates/image/*.json`), 39 Seedance (`hyperframes-*` hariç `prompt-templates/video/*.json`), 11 HyperFrames (`prompt-templates/video/hyperframes-*.json`). Her biri preview thumbnail, prompt body, target model, aspect ratio ve license + attribution için `source` bloğu taşır. Daemon bunları `GET /api/prompt-templates` ile servis eder; web app entry view'daki **Image templates** ve **Video templates** tab'lerinde card grid olarak gösterir; tek tık prompt'u doğru model seçili şekilde composer'a düşürür.

### gpt-image-2 — image gallery (43 örnekten seçki)

<table>
<tr>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776661968404_8a5flm_HGQc_KOaMAA2vt0.jpg" alt="3D Stone Staircase Evolution" /><br/><sub><b>3D Stone Staircase Evolution Infographic</b><br/>3 adımlı infografik, yontulmuş taş estetiği</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776662673014_nf0taw_HGRMNDybsAAGG88.jpg" alt="Illustrated City Food Map" /><br/><sub><b>Illustrated City Food Map</b><br/>Editoryal elle illüstre edilmiş seyahat posteri</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453149026_gd2k50_HHCSvymboAAVscc.jpg" alt="Cinematic Elevator Scene" /><br/><sub><b>Cinematic Elevator Scene</b><br/>Tek frame editoryal fashion still</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453164993_mt5b69_HHDoWfeaUAEA6Vt.jpg" alt="Cyberpunk Anime Portrait" /><br/><sub><b>Cyberpunk Anime Portrait</b><br/>Profil avatarı — neon face text</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453184257_vb9hvl_HG9tAkOa4AAuRrn.jpg" alt="Glamorous Woman in Black" /><br/><sub><b>Glamorous Woman in Black Portrait</b><br/>Editoryal stüdyo portresi</sub></td>
</tr>
</table>

Tam set → [`prompt-templates/image/`](prompt-templates/image/). Kaynaklar: çoğu [`YouMind-OpenLab/awesome-gpt-image-prompts`](https://github.com/YouMind-OpenLab/awesome-gpt-image-prompts) (CC-BY-4.0) üzerinden gelir; yazar attribution'ı template başına korunur.

### Seedance 2.0 — video gallery (39 örnekten seçki)

<table>
<tr>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c4515f4f328539e1ded2cc32f4ce63e7/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c4515f4f328539e1ded2cc32f4ce63e7/thumbnails/thumbnail.jpg" alt="Music Podcast Guitar" /></a><br/><sub><b>Music Podcast & Guitar Technique</b><br/>4K sinematik stüdyo filmi</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/4a47ba646e7cedd79363c861864b8714/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/4a47ba646e7cedd79363c861864b8714/thumbnails/thumbnail.jpg" alt="Emotional Face" /></a><br/><sub><b>Emotional Face Close-up</b><br/>Sinematik mikro-ifade çalışması</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7e8983364a95fe333f0f88bd1085a0e8/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7e8983364a95fe333f0f88bd1085a0e8/thumbnails/thumbnail.jpg" alt="Luxury Supercar" /></a><br/><sub><b>Luxury Supercar Cinematic</b><br/>Narrative ürün filmi</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/0279a674ce138ab5a0a6f020a7273d89/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/0279a674ce138ab5a0a6f020a7273d89/thumbnails/thumbnail.jpg" alt="Forbidden City Cat" /></a><br/><sub><b>Forbidden City Cat Satire</b><br/>Stilize satire short</sub></td>
<td width="20%" valign="top"><a href="https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts/releases/download/videos/1402.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7f63ad253175a9ad1dac53de490efac8/thumbnails/thumbnail.jpg" alt="Japanese Romance" /></a><br/><sub><b>Japanese Romance Short Film</b><br/>15s Seedance 2.0 narrative</sub></td>
</tr>
</table>

Gerçek render edilmiş MP4'ü oynatmak için herhangi bir thumbnail'e tıkla. Tam set → [`prompt-templates/video/`](prompt-templates/video/) (`*-seedance-*` ve Cinematic-tag'li entry'ler). Kaynaklar: [`YouMind-OpenLab/awesome-seedance-2-prompts`](https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts) (CC-BY-4.0); özgün tweet linkleri ve yazar handle'ları korunur.

### HyperFrames — HTML→MP4 motion graphics (11 yeniden üretilebilir template)

[**`heygen-com/hyperframes`**](https://github.com/heygen-com/hyperframes), HeyGen'in açık kaynak agent-native video framework'üdür: sen (veya agent) HTML + CSS + GSAP yazarsın, HyperFrames headless Chrome + FFmpeg ile deterministik MP4 render eder. Open Design, HyperFrames'i daemon dispatch'e bağlı birinci sınıf video modeli (`hyperframes-html`) olarak gönderir; ayrıca agent'a timeline contract, scene-transition kuralları, audio-reactive pattern'ler, captions/TTS ve catalog block'ları (`npx hyperframes add <slug>`) öğreten `skills/hyperframes/` skill'i vardır.

On bir hyperframes prompt'u [`prompt-templates/video/hyperframes-*.json`](prompt-templates/video/) altında gelir; her biri belirli bir archetype üreten somut brief'tir:

<table>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-product-reveal-minimal.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Product reveal" /></a><br/><sub><b>5s minimal product reveal</b> · 16:9 · shader transition'lı push-in title card</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-saas-product-promo-30s.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="SaaS promo" /></a><br/><sub><b>30s SaaS product promo</b> · 16:9 · UI 3D reveal'larıyla Linear/ClickUp tarzı</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-tiktok-karaoke-talking-head.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/tiktok-follow.png" alt="TikTok karaoke" /></a><br/><sub><b>TikTok karaoke talking-head</b> · 9:16 · TTS + kelime senkronlu caption'lar</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-brand-sizzle-reel.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Brand sizzle" /></a><br/><sub><b>30s brand sizzle reel</b> · 16:9 · beat-synced kinetik tipografi, audio-reactive</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-data-bar-chart-race.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/data-chart.png" alt="Data chart" /></a><br/><sub><b>Animated bar-chart race</b> · 16:9 · NYT tarzı data infografik</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-flight-map-route.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/nyc-paris-flight.png" alt="Flight map" /></a><br/><sub><b>Flight map (origin → dest)</b> · 16:9 · Apple tarzı sinematik rota reveal</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-logo-outro-cinematic.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Logo outro" /></a><br/><sub><b>4s cinematic logo outro</b> · 16:9 · parça parça assembly + bloom</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-money-counter-hype.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/apple-money-count.png" alt="Money counter" /></a><br/><sub><b>$0 → $10K money counter</b> · 9:16 · yeşil flash + burst ile Apple tarzı hype</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-app-showcase-three-phones.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="App showcase" /></a><br/><sub><b>3-phone app showcase</b> · 16:9 · feature callout'lu floating phone'lar</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-social-overlay-stack.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Social overlay" /></a><br/><sub><b>Social overlay stack</b> · 9:16 · X · Reddit · Spotify · Instagram sequence'i</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-website-to-video-promo.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Website to video" /></a><br/><sub><b>Website-to-video pipeline</b> · 16:9 · siteyi 3 viewport'ta capture eder + transition'lar</sub></td>
<td width="25%" valign="top">&nbsp;</td>
</tr>
</table>

Kalıp geri kalanla aynıdır: template seç, brief'i düzenle, gönder. Agent paketlenmiş `skills/hyperframes/SKILL.md` dosyasını okur (OD'ye özel render workflow taşır — composition source'larını `.hyperframes-cache/` içine koyar, file workspace'i kirletmez; daemon macOS sandbox-exec / Puppeteer takılmasını aşmak için `npx hyperframes render` dispatch eder; yalnızca final `.mp4` proje chip'i olur), composition'ı yazar ve MP4 gönderir. Catalog block thumbnail'leri © HeyGen, CDN'lerinden servis edilir; OSS framework Apache-2.0'dır.

> **Bağlı ama template olarak henüz yüzeye çıkarılmamış:** Kling 2.0 / 1.6 / 1.5, Veo 3 / Veo 2, Sora 2 / Sora 2-Pro (Fal üzerinden), MiniMax video-01 — hepsi `VIDEO_MODELS` içinde yaşar ([`apps/web/src/media/models.ts`](apps/web/src/media/models.ts)). Suno v5 / v4.5, Udio v2, Lyria 2 (music) ve gpt-4o-mini-tts, MiniMax TTS (speech) audio yüzeyini kapsar. Bunlar için template'ler açık contribution'dır — `prompt-templates/video/` veya `prompt-templates/audio/` içine JSON bırak, picker'da görünür.

## Chat dışında neler geliyor

Chat / artefakt döngüsü spot ışığını alır, ama OD'yi başka şeylerle karşılaştırmadan önce bilmeye değer daha az görünür birkaç yetenek de bağlı:

- **Claude Design ZIP import.** claude.ai export'unu welcome dialog'a bırak. `POST /api/import/claude-design` onu gerçek `.od/projects/<id>/` içine çıkarır, entry file'ı tab olarak açar ve local agent'ın Anthropic'in bıraktığı yerden devam etmesi için prompt hazırlar. Yeniden prompt yok, "modele az önce sahip olduğumuz şeyi tekrar yaptır" yok. ([`apps/daemon/src/server.ts`](apps/daemon/src/server.ts) — `/api/import/claude-design`)
- **Multi-provider BYOK proxy.** `POST /api/proxy/{anthropic,openai,azure,google}/stream` `{ baseUrl, apiKey, model, messages }` alır, provider'a özel upstream request oluşturur, SSE chunk'larını `delta/end/error` olarak normalize eder ve SSRF'i önlemek için loopback / link-local / RFC1918 hedefleri reddeder. OpenAI-compatible; OpenAI, Azure AI Foundry `/openai/v1`, DeepSeek, Groq, MiMo, OpenRouter ve self-hosted vLLM'i kapsar; Azure OpenAI deployment URL + `api-version` ekler; Google Gemini `:streamGenerateContent` kullanır.
- **Kullanıcı kayıtlı template'leri.** Render'ı beğenince `POST /api/templates` HTML + metadata'yı SQLite `templates` tablosuna snapshot'lar. Sonraki proje picker'daki "your templates" satırından onu seçer; gönderilen 31 ile aynı yüzey, ama senin.
- **Tab persistence.** Her proje açık dosyalarını ve aktif tab'ını `tabs` tablosunda hatırlar. Yarın projeyi tekrar aç, workspace bıraktığın gibi görünür.
- **Artifact lint API.** `POST /api/artifacts/lint`, üretilmiş artefakt üzerinde structural check'ler çalıştırır (bozuk `<artifact>` framing, eksik required side file'lar, stale palette token'ları) ve agent'ın sonraki turda okuyabileceği finding'ler döndürür. Beş boyutlu self-critique, skorunu vibe'a değil gerçek kanıta bağlamak için bunu kullanır.
- **Sidecar protocol + desktop automation.** Daemon, web ve desktop process'leri typed five-field stamp taşır (`app · mode · namespace · ipc · source`) ve `/tmp/open-design/ipc/<namespace>/<app>.sock` üzerinde JSON-RPC IPC kanalı açar. `tools-dev inspect desktop status \| eval \| screenshot` bu kanalı sürer; böylece headless E2E, özel harness olmadan gerçek Electron shell'e karşı çalışır ([`packages/sidecar-proto/`](packages/sidecar-proto/), [`apps/desktop/src/main/`](apps/desktop/src/main/)).
- **Windows dostu spawn.** Uzun composed prompt'larda `CreateProcess`'in ~32 KB argv limitini patlatabilecek her adapter (Codex, Gemini, OpenCode, Cursor Agent, Qwen, Qoder CLI, Pi) prompt'u stdin üzerinden verir. Claude Code ve Copilot `-p` tutar; daemon o bile taşarsa temp prompt-file'a düşer.
- **Namespace başına runtime data.** `OD_DATA_DIR` ve `--namespace`, tamamen izole `.od/` tarzı ağaçlar sağlar; Playwright, beta channel'lar ve gerçek projelerin aynı SQLite dosyasını asla paylaşmaz.

## Anti-AI-slop mekanizması

Aşağıdaki tüm mekanizma, [`huashu-design`](https://github.com/alchaincyf/huashu-design) playbook'unun OD prompt-stack'e taşınmış ve skill başına side-file pre-flight ile enforce edilebilir hale getirilmiş halidir. Canlı wording için [`packages/contracts/src/prompts/discovery.ts`](packages/contracts/src/prompts/discovery.ts) oku:

- **Önce soru formu.** Turn 1 yalnızca `<question-form>` — thinking yok, tool yok, narration yok. Kullanıcı radio hızında varsayılan seçer.
- **Brand-spec extraction.** Kullanıcı screenshot veya URL eklediğinde agent CSS yazmadan önce 5 adımlı protokol çalıştırır (locate · download · grep hex · `brand-spec.md` kodla · vocalise). **Marka renklerini asla hafızadan tahmin etmez.**
- **Five-dim critique.** `<artifact>` göndermeden önce agent çıktısını philosophy / hierarchy / execution / specificity / restraint boyunca sessizce 1-5 puanlar. 3/5 altı regression'dır — düzelt ve yeniden skorla. İki geçiş normaldir.
- **P0/P1/P2 checklist.** Her skill hard P0 gate'ler içeren `references/checklist.md` gönderir. Agent emit etmeden önce P0'ı geçmek zorundadır.
- **Slop blacklist.** Agresif mor gradient'ler, generic emoji icon'lar, sol border accent'li rounded card'lar, elle çizilmiş SVG insanları, display face olarak Inter, uydurma metrikler — prompt içinde açıkça yasaktır.
- **Dürüst placeholder > sahte istatistik.** Agent gerçek sayıya sahip değilse "10× faster" değil, `—` veya etiketli gri blok yazar.

## Karşılaştırma

| Eksen | [Claude Design][cd] (Anthropic) | [Open CoDesign][ocod] | **Open Design** |
|---|---|---|---|
| Lisans | Kapalı | MIT | **Apache-2.0** |
| Form faktörü | Web (claude.ai) | Desktop (Electron) | **Web app + local daemon** |
| Vercel'e deploy | ❌ | ❌ | **✅** |
| Agent runtime | Paketli (Opus 4.7) | Paketli ([`pi-ai`][piai]) | **Kullanıcının mevcut CLI'ına delege** |
| Skill'ler | Proprietary | 12 custom TS module + `SKILL.md` | **31 dosya tabanlı [`SKILL.md`][skill] bundle, drop edilebilir** |
| Design system | Proprietary | `DESIGN.md` (v0.2 roadmap) | **`DESIGN.md` × 129 sistem gönderilir** |
| Provider esnekliği | Yalnızca Anthropic | [`pi-ai`][piai] üzerinden 7+ | **16 CLI adapter + OpenAI-compatible BYOK proxy** |
| Init question form | ❌ | ❌ | **✅ Hard rule, turn 1** |
| Direction picker | ❌ | ❌ | **✅ 5 deterministik direction** |
| Canlı todo progress + tool stream | ❌ | ✅ | **✅** (open-codesign UX pattern'i) |
| Sandboxed iframe preview | ❌ | ✅ | **✅** (open-codesign pattern'i) |
| Claude Design ZIP import | n/a | ❌ | **✅ `POST /api/import/claude-design` — Anthropic'in bıraktığı yerden düzenle** |
| Comment-mode surgical edits | ❌ | ✅ | 🟡 kısmi — preview element comment'leri + chat attachment'ları; güvenilir surgical patch hâlâ devam ediyor |
| AI-emitted tweaks panel | ❌ | ✅ | 🚧 roadmap — dedicated chat-side panel UX henüz uygulanmadı |
| Filesystem-grade workspace | ❌ | kısmi (Electron sandbox) | **✅ Gerçek cwd, gerçek tool'lar, kalıcı SQLite (projects · conversations · messages · tabs · templates)** |
| 5-dim self-critique | ❌ | ❌ | **✅ Pre-emit gate** |
| Artifact lint | ❌ | ❌ | **✅ `POST /api/artifacts/lint` — finding'ler agent'a geri verilir** |
| Sidecar IPC + headless desktop | ❌ | ❌ | **✅ Stamped process'ler + `tools-dev inspect desktop status \| eval \| screenshot`** |
| Export formatları | Sınırlı | HTML / PDF / PPTX / ZIP / Markdown | **HTML / PDF / PPTX (agent-driven) / ZIP / Markdown** |
| PPT skill reuse | N/A | Built-in | **[`guizang-ppt-skill`][guizang] drop-in gelir (deck modu varsayılanı)** |
| Minimum billing | Pro / Max / Team | BYOK | **BYOK — herhangi bir OpenAI-compatible `baseUrl` yapıştır** |

[cd]: https://x.com/claudeai/status/2045156267690213649
[ocod]: https://github.com/OpenCoworkAI/open-codesign
[piai]: https://github.com/badlogic/pi-mono/tree/main/packages/ai
[acd]: https://github.com/VoltAgent/awesome-claude-design
[guizang]: https://github.com/op7418/guizang-ppt-skill
[skill]: https://docs.anthropic.com/en/docs/claude-code/skills

## Desteklenen coding agent'lar

Daemon boot sırasında `PATH` üzerinden otomatik algılanır. Config gerekmez. Streaming dispatch [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) (`AGENT_DEFS`) içinde yaşar; CLI başına parser'lar yanında durur. Model listesi ya `<bin> --list-models` / `<bin> models` / ACP handshake ile probe edilir ya da CLI liste açığa çıkarmıyorsa küratörlü fallback listeden gelir.

| Agent | Bin | Stream format | Argv shape (composed prompt path) |
|---|---|---|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `claude` | `claude-stream-json` (typed events) | `claude -p <prompt> --output-format stream-json --verbose [--include-partial-messages] [--add-dir …] --permission-mode bypassPermissions` |
| [Codex CLI](https://github.com/openai/codex) | `codex` | `json-event-stream` + `codex` parser | `codex exec --json --skip-git-repo-check --sandbox workspace-write -c sandbox_workspace_write.network_access=true [-C cwd] [--add-dir …] [--model …] [-c model_reasoning_effort=…]` (prompt stdin'de) |
| Devin for Terminal | `devin` | `acp-json-rpc` | `devin --permission-mode dangerous --respect-workspace-trust false acp` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `gemini` | `json-event-stream` + `gemini` parser | `GEMINI_CLI_TRUST_WORKSPACE=true gemini --output-format stream-json --yolo [--model …]` (prompt stdin'de) |
| [OpenCode](https://opencode.ai/) | `opencode` | `json-event-stream` + `opencode` parser | `opencode run --format json --dangerously-skip-permissions [--model …] -` (prompt stdin'de) |
| [Cursor Agent](https://www.cursor.com/cli) | `cursor-agent` | `json-event-stream` + `cursor-agent` parser | `cursor-agent --print --output-format stream-json --stream-partial-output --force --trust [--workspace cwd] [--model …] -` (prompt stdin'de) |
| [Qwen Code](https://github.com/QwenLM/qwen-code) | `qwen` | `plain` (raw stdout chunk'ları) | `qwen --yolo [--model …] -` (prompt stdin'de) |
| Qoder CLI | `qodercli` | `qoder-stream-json` (typed events) | `qodercli -p --output-format stream-json --permission-mode bypass_permissions [--cwd cwd] [--model …] [--add-dir …]` (prompt stdin'de) |
| [GitHub Copilot CLI](https://github.com/features/copilot/cli) | `copilot` | `copilot-stream-json` (typed events) | `copilot -p <prompt> --allow-all-tools --output-format json [--model …] [--add-dir …]` |
| [Hermes](https://github.com/eqlabs/hermes) | `hermes` | `acp-json-rpc` (Agent Client Protocol) | `hermes acp --accept-hooks` |
| Kimi CLI | `kimi` | `acp-json-rpc` | `kimi acp` |
| [Kiro CLI](https://kiro.dev) | `kiro-cli` | `acp-json-rpc` | `kiro-cli acp` |
| Kilo | `kilo` | `acp-json-rpc` | `kilo acp` |
| [Mistral Vibe CLI](https://github.com/mistralai/mistral-vibe) | `vibe-acp` | `acp-json-rpc` | `vibe-acp` |
| DeepSeek TUI | `deepseek` | `plain` (raw stdout chunk'ları) | `deepseek exec --auto [--model …] <prompt>` (prompt positional arg olarak) |
| [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | `pi` | `pi-rpc` (stdio JSON-RPC) | `pi --mode rpc [--model …] [--thinking …]` (prompt RPC `prompt` komutu olarak gönderilir) |
| **Multi-provider BYOK** | n/a | SSE normalization | `POST /api/proxy/{provider}/stream` → Anthropic / OpenAI-compatible / Azure OpenAI / Gemini; loopback / link-local / RFC1918'e karşı SSRF guard'lı |

Yeni CLI eklemek [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) içinde tek entry'dir. Streaming format `claude-stream-json`, `qoder-stream-json`, `copilot-stream-json`, `json-event-stream` (CLI başına `eventParser` ile), `acp-json-rpc`, `pi-rpc` veya `plain` olabilir.

## Referanslar ve soy ağacı

Bu repo'nun ödünç aldığı her dış proje. Her link kaynağa gider; provenance'ı doğrulayabilirsin.

| Proje | Buradaki rolü |
|---|---|
| [`Claude Design`][cd] | Bu repo'nun açık kaynak alternatifi olduğu kapalı kaynak ürün. |
| [**`alchaincyf/huashu-design`**](https://github.com/alchaincyf/huashu-design) | Tasarım felsefesi çekirdeği. Junior-Designer workflow, 5 adımlı brand-asset protocol, anti-AI-slop checklist, 5 boyutlu self-critique ve direction picker arkasındaki "5 schools × 20 design philosophies" kütüphanesi; hepsi [`packages/contracts/src/prompts/discovery.ts`](packages/contracts/src/prompts/discovery.ts) ve [`packages/contracts/src/prompts/directions.ts`](packages/contracts/src/prompts/directions.ts) içine damıtıldı. |
| [**`op7418/guizang-ppt-skill`**][guizang] | [`skills/guizang-ppt/`](skills/guizang-ppt/) altında özgün LICENSE korunarak aynen paketlenmiş magazine-web-PPT skill. Deck modu varsayılanı. P0/P1/P2 checklist kültürü diğer skill'lere de ödünç alındı. |
| [**`multica-ai/multica`**](https://github.com/multica-ai/multica) | Daemon + adapter mimarisi. PATH taramalı agent detection, tek ayrıcalıklı süreç olarak local daemon, agent-as-teammate dünya görüşü. Modeli benimsiyoruz; kodu vendor etmiyoruz. |
| [**`OpenCoworkAI/open-codesign`**][ocod] | İlk açık kaynak Claude-Design alternatifi ve en yakın eşdeğerimiz. Benimsenen UX pattern'leri: streaming-artifact loop, sandbox iframe preview (vendored React 18 + Babel), canlı agent paneli (todo'lar + tool call'lar + interruptible), beş formatlı export listesi (HTML/PDF/PPTX/ZIP/Markdown), local-first storage hub, `SKILL.md` taste-injection ve comment-mode preview annotation'larının ilk geçişi. Roadmap'teki UX pattern'leri: tam surgical-edit reliability ve AI-emitted tweaks panel. **[`pi-ai`][piai] vendor etmiyoruz** — open-codesign onu agent runtime olarak paketliyor; biz kullanıcının zaten sahip olduğu CLI'a delege ediyoruz. |
| [`VoltAgent/awesome-claude-design`][acd] / [`awesome-design-md`][acd2] | 9 bölümlü `DESIGN.md` şemasının ve [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts) ile import edilen 70 ürün sisteminin kaynağı. |
| [`bergside/awesome-design-skills`][ads] | `design-systems/` altında normalize `DESIGN.md` dosyaları olarak eklenen 57 design skill'in kaynağı. |
| [`farion1231/cc-switch`](https://github.com/farion1231/cc-switch) | Birden fazla agent CLI arasında symlink tabanlı skill dağıtımı ilhamı. |
| [Claude Code skills][skill] | Aynen benimsenen `SKILL.md` konvansiyonu — herhangi bir Claude Code skill'i `skills/` içine düşer ve daemon tarafından alınır. |

Uzun biçimli provenance yazısı — her birinden ne aldığımız ve neyi bilinçli olarak almadığımız — [`docs/references.md`](docs/references.md) içinde.

## Roadmap

- [x] Daemon + agent detection (16 CLI adapter) + skill registry + design-system katalog
- [x] Web app + chat + question form + 5-direction picker + todo progress + sandboxed preview
- [x] 31 skill + 72 design system + 5 görsel direction + 5 cihaz frame'i
- [x] SQLite-backed projects · conversations · messages · tabs · templates
- [x] SSRF guard'lı multi-provider BYOK proxy (`/api/proxy/{anthropic,openai,azure,google}/stream`)
- [x] Claude Design ZIP import (`/api/import/claude-design`)
- [x] Sidecar protocol + IPC automation'lı Electron desktop (STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN)
- [x] Artifact lint API + 5-dim self-critique pre-emit gate
- [ ] Comment-mode surgical edits — kısmi gönderildi: preview element comment'leri ve chat attachment'ları; güvenilir targeted patching hâlâ devam ediyor
- [ ] AI-emitted tweaks panel UX — henüz uygulanmadı
- [ ] Vercel + tunnel deployment recipe (Topology B)
- [ ] Projeyi `DESIGN.md` ile scaffold eden tek komut `npx od init`
- [ ] Skill marketplace (`od skills install <github-repo>`) ve `od skill add | list | remove | test` CLI yüzeyi ([`docs/skills-protocol.md`](docs/skills-protocol.md) içinde draft, implementation bekliyor)
- [x] `apps/packaged/` üzerinden paketlenmiş Electron build — macOS (Apple Silicon) ve Windows (x64) indirmeleri [open-design.ai](https://open-design.ai/) ve [GitHub releases page](https://github.com/nexu-io/open-design/releases) üzerinde

Fazlı teslimat → [`docs/roadmap.md`](docs/roadmap.md).

## Durum

Bu erken bir implementation; kapalı döngü (detect → skill + design system seç → chat → `<artifact>` parse et → preview → save) uçtan uca çalışır. Değerin büyük kısmı prompt stack ve skill kütüphanesinde yaşar; ikisi de stabildir. Component-level UI günlük olarak gönderiliyor.

## Döngüde kal

Release note'lar, yeni skill'ler, yeni design system'ler ve arada sırada sıradaki gönderilerle ilgili perde arkası thread'ler için X'te **[@nexudotio](https://x.com/nexudotio)** takip et. Discord sohbet için, X milestone'lar için; iki link de yukarıdaki badge'lerde.

## Star ver

<p align="center">
  <a href="https://github.com/nexu-io/open-design"><img src="docs/assets/star-us.png" alt="GitHub'da Open Design'a star ver — github.com/nexu-io/open-design" width="100%" /></a>
</p>

Bu sana otuz dakika kazandırdıysa bir ★ ver. Star'lar kira ödemiyor, ama sonraki tasarımcıya, agent'a ve contributor'a bu deneyin dikkat etmeye değer olduğunu gösteriyor. Tek tık, üç saniye, gerçek sinyal: [github.com/nexu-io/open-design](https://github.com/nexu-io/open-design).

## Katkı

Issue'lar, PR'lar, yeni skill'ler ve yeni design system'ler memnuniyetle karşılanır. En yüksek kaldıraçlı katkılar genelde tek klasör, tek Markdown dosyası veya PR boyutunda tek adapter olur:

- **Skill ekle** — [`SKILL.md`][skill] konvansiyonunu izleyen bir klasörü [`skills/`](skills/) altına bırak.
- **Design system ekle** — 9 bölümlü şemayı kullanarak [`design-systems/<brand>/`](design-systems/) içine `DESIGN.md` bırak.
- **Yeni coding-agent CLI bağla** — [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) içinde tek entry.

Tam walkthrough, merge çıtası, code style ve kabul etmediklerimiz → [`CONTRIBUTING.md`](CONTRIBUTING.md) ([Deutsch](CONTRIBUTING.de.md), [Français](CONTRIBUTING.fr.md), [简体中文](CONTRIBUTING.zh-CN.md)).

## Contributors

Open Design'ı kod, doküman, feedback, yeni skill, yeni design system veya keskin bir issue ile ileri taşıyan herkese teşekkürler. Her gerçek katkı önemlidir; aşağıdaki wall bunu yüksek sesle söylemenin en kolay yolu.

<a href="https://github.com/nexu-io/open-design/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nexu-io/open-design&cache_bust=2026-05-15" alt="Open Design contributors" />
</a>

İlk PR'ını gönderdiysen hoş geldin. [`good-first-issue`/`help-wanted`](https://github.com/nexu-io/open-design/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22%2C%22help+wanted%22) label'ı giriş noktasıdır.

## Repository activity

<picture>
  <img alt="Open Design — repository metrics" src="docs/assets/github-metrics.svg" />
</picture>

Yukarıdaki SVG [`.github/workflows/metrics.yml`](.github/workflows/metrics.yml) tarafından [`lowlighter/metrics`](https://github.com/lowlighter/metrics) kullanılarak günlük yenilenir. Daha erken istiyorsan **Actions** tab'inden manuel refresh tetikle; daha zengin plugin'ler (traffic, follow-up time) için fine-grained PAT ile `METRICS_TOKEN` repository secret ekle.

## Star History

<a href="https://star-history.com/#nexu-io/open-design&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&theme=dark&cache_bust=2026-05-15" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-15" />
    <img alt="Open Design star history" src="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-15" />
  </picture>
</a>

Eğri yukarı kıvrılırsa aradığımız sinyal budur. Bu repo'yu ileri itmek için ★ ver.

## Credits

HTML PPT Studio skill ailesi — master [`skills/html-ppt/`](skills/html-ppt/) ve [`skills/html-ppt-*/`](skills/) altındaki template wrapper'ları (15 full-deck template, 36 theme, 31 single-page layout, 27 CSS animation + 20 canvas FX, keyboard runtime ve magnetic-card presenter mode) — açık kaynak [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill) (MIT) projesinden entegre edilmiştir. Upstream LICENSE repo içinde [`skills/html-ppt/LICENSE`](skills/html-ppt/LICENSE) olarak gelir ve authorship credit [@lewislulu](https://github.com/lewislulu)'ya aittir. Her per-template Examples card (`html-ppt-pitch-deck`, `html-ppt-tech-sharing`, `html-ppt-presenter-mode`, `html-ppt-xhs-post`, …) authoring guidance'ı master skill'e delege eder; böylece **Use this prompt** tıklandığında upstream prompt → output davranışı uçtan uca korunur.

[`skills/guizang-ppt/`](skills/guizang-ppt/) altındaki magazine / horizontal-swipe deck flow, [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) (MIT) üzerinden entegre edilmiştir. Authorship credit [@op7418](https://github.com/op7418)'e aittir.

## Lisans

Apache-2.0. Paketli `skills/guizang-ppt/` özgün [LICENSE](skills/guizang-ppt/LICENSE) (MIT) ve [op7418](https://github.com/op7418) authorship attribution'ını korur. Paketli `skills/html-ppt/` özgün [LICENSE](skills/html-ppt/LICENSE) (MIT) ve [lewislulu](https://github.com/lewislulu) authorship attribution'ını korur.
