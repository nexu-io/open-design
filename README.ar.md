<div dir="rtl">

# Open Design

> **البديل مفتوح المصدر لـ [Claude Design][cd].** يعمل محلياً أولاً، قابل للنشر على Vercel، ويدعم BYOK في كل طبقة — **16 أداة CLI لوكلاء البرمجة** يكتشفها تلقائياً من `PATH` (Claude Code, Codex, Devin for Terminal, Cursor Agent, Gemini CLI, OpenCode, Qwen, Qoder CLI, GitHub Copilot CLI, Hermes, Kimi, Pi, Kiro, Kilo, Mistral Vibe, DeepSeek TUI) لتصبح هي محرّك التصميم، مدفوعةً بـ **31 Skill قابلة للتركيب** و**72 نظام تصميم بمستوى الهوية البصرية**. لا توجد لديك CLI؟ بروكسي BYOK متوافق مع OpenAI يقدّم نفس الحلقة بدون عملية الـ spawn.

<p align="center">
  <img src="docs/assets/banner.png" alt="Open Design — غلاف افتتاحي: صمّم مع الوكيل على حاسوبك المحمول" width="100%" />
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
  <a href="https://open-design.ai/"><img alt="تنزيل" src="https://img.shields.io/badge/%D8%AA%D9%86%D8%B2%D9%8A%D9%84-open--design.ai-ff6b35?style=flat-square" /></a>
  <a href="https://github.com/nexu-io/open-design/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/nexu-io/open-design?style=flat-square&color=blueviolet&label=release&include_prereleases&display_name=tag" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square" /></a>
  <a href="#الوكلاء-المدعومون"><img alt="Agents" src="https://img.shields.io/badge/agents-16%20CLIs%20%2B%20BYOK%20proxy-black?style=flat-square" /></a>
  <a href="#أنظمة-التصميم"><img alt="Design systems" src="https://img.shields.io/badge/design%20systems-72-orange?style=flat-square" /></a>
  <a href="#الـ-skills"><img alt="Skills" src="https://img.shields.io/badge/skills-31-teal?style=flat-square" /></a>
  <a href="https://discord.gg/qhbcCH8Am4"><img alt="Discord" src="https://img.shields.io/badge/discord-انضم-5865F2?style=flat-square&logo=discord&logoColor=white" /></a>
  <a href="QUICKSTART.md"><img alt="Quickstart" src="https://img.shields.io/badge/quickstart-3%20commands-green?style=flat-square" /></a>
</p>

<p align="center"><a href="README.md">English</a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português (Brasil)</a> · <a href="README.de.md">Deutsch</a> · <a href="README.fr.md">Français</a> · <a href="README.zh-CN.md">简体中文</a> · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ko.md">한국어</a> · <a href="README.ja-JP.md">日本語</a> · <b>العربية</b> · <a href="README.ru.md">Русский</a> · <a href="README.uk.md">Українська</a> · <a href="README.tr.md">Türkçe</a></p>

---

## لماذا وُجد هذا المشروع

أظهر [Claude Design][cd] من Anthropic (الذي صدر في 2026-04-17 مبنياً على Opus 4.7) ما يحدث حين يتوقّف الـ LLM عن كتابة النصوص ويبدأ بتسليم منتجات تصميم فعلية. انتشر بسرعة — وبقي **مغلق المصدر**، مدفوعاً، يعمل في السحابة فقط، ومرتبطاً بنماذج Anthropic ومهاراتها الداخلية. لا checkout، لا استضافة ذاتية، لا نشر على Vercel، ولا إمكانية لاستبدال الوكيل.

**Open Design (OD) هو البديل مفتوح المصدر.** نفس الحلقة، نفس النموذج الذهني المتمحور حول الـ artifact، بدون أيّ قيود. نحن لا نشحن وكيلاً — أقوى وكلاء البرمجة موجودون أصلاً على حاسوبك. ما نقدّمه هو ربطهم بسير عمل تصميمي مدفوع بالـ Skills يعمل محلياً عبر `pnpm tools-dev`، يمكن نشر طبقة الويب منه على Vercel، ويبقى BYOK في كل طبقة.

اكتب `اصنع لي pitch deck بأسلوب مجلّة لجولة seed`. ينبثق نموذج الأسئلة التفاعلي قبل أن يرتجل النموذج بكسلاً واحداً. يختار الوكيل أحد خمسة اتجاهات بصرية منتقاة. تنساب خطّة `TodoWrite` حيّة إلى الواجهة. يبني الـ daemon مجلد مشروع حقيقياً على القرص يحوي قالب seed، مكتبة layouts، و checklist للفحص الذاتي. يقرأها الوكيل — pre-flight إلزامي — ثم يجري تقييماً ذاتياً خماسي الأبعاد على ناتجه، ويُصدر `<artifact>` واحداً يُعرض في iframe معزول خلال ثوانٍ.

هذا ليس "ذكاء اصطناعي يحاول التصميم". هذا ذكاء اصطناعي دُرِّب — عبر مكدّس البرومبت — ليتصرّف كمصمّم خبير لديه نظام ملفات يعمل، مكتبة ألوان حتميّة، وثقافة checklist — تماماً المستوى الذي حدّده Claude Design، لكنه هذه المرة مفتوح وملك لك.

يرتكز OD على أربعة مشاريع مفتوحة المصدر:

- [**`alchaincyf/huashu-design`**](https://github.com/alchaincyf/huashu-design) — بوصلة فلسفة التصميم. سير عمل Junior-Designer، بروتوكول الأصول البصرية المؤلف من 5 خطوات، checklist مكافحة AI-slop، التقييم الذاتي خماسي الأبعاد، وفكرة "5 مدارس × 20 فلسفة تصميم" خلف منتقي الاتجاه — كل ذلك مكثّف في [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts).
- [**`op7418/guizang-ppt-skill`**](https://github.com/op7418/guizang-ppt-skill) — وضع الـ deck. مُضمَّن حرفياً تحت [`skills/guizang-ppt/`](skills/guizang-ppt/) مع الحفاظ على LICENSE الأصلية؛ تخطيطات بأسلوب المجلّات، WebGL hero، و checklist بمستويات P0/P1/P2.
- [**`OpenCoworkAI/open-codesign`**](https://github.com/OpenCoworkAI/open-codesign) — نجم UX الشمالي وأقرب أقراننا. أوّل بديل مفتوح المصدر لـ Claude-Design. اقتبسنا منه حلقة الـ artifact المُتدفّق، نمط معاينة iframe المعزول (مع React 18 + Babel مضمّنين)، لوحة الوكيل الحيّة (todos + tool calls + إمكانية المقاطعة)، وقائمة التصدير بخمسة صيغ (HTML / PDF / PPTX / ZIP / Markdown). تعمّدنا التباعد في الشكل العام — هم تطبيق سطح مكتب Electron يضمّ [`pi-ai`][piai]، ونحن تطبيق ويب + daemon محلي يفوّض المهمة لـ CLI الموجودة لديك.
- [**`multica-ai/multica`**](https://github.com/multica-ai/multica) — معمارية الـ daemon ومنظومة التشغيل. اكتشاف الوكلاء بمسح `PATH`، والـ daemon المحلي بوصفه العملية المميَّزة الوحيدة، ورؤية "الوكيل كزميل فريق".

## نظرة سريعة

| | ما تحصل عليه |
|---|---|
| **أدوات CLI لوكلاء البرمجة (16)** | Claude Code · Codex CLI · Devin for Terminal · Cursor Agent · Gemini CLI · OpenCode · Qwen Code · Qoder CLI · GitHub Copilot CLI · Hermes (ACP) · Kimi CLI (ACP) · Pi (RPC) · Kiro CLI (ACP) · Kilo (ACP) · Mistral Vibe CLI (ACP) · DeepSeek TUI — يكتشفها تلقائياً من `PATH`، وتبدّل بينها بنقرة واحدة |
| **بديل BYOK** | بروكسي API خاص بكل بروتوكول على `/api/proxy/{anthropic,openai,azure,google}/stream` — الصق `baseUrl` + `apiKey` + `model`، اختر Anthropic / OpenAI / Azure OpenAI / Google Gemini، ويُطبّع الـ daemon أحداث SSE إلى نفس chat stream. يتمّ صدّ عناوين IP الداخلية وثغرات SSRF عند حدود الـ daemon. |
| **أنظمة تصميم مدمجة** | **129** — 2 starters مكتوبة يدوياً + 70 نظاماً للمنتجات (Linear، Stripe، Vercel، Airbnb، Tesla، Notion، Anthropic، Apple، Cursor، Supabase، Figma، Xiaohongshu، …) من [`awesome-design-md`][acd2]، إضافة إلى 57 design skill من [`awesome-design-skills`][ads] أُضيفت مباشرة تحت `design-systems/` |
| **Skills مدمجة** | **31** — 27 في وضع `prototype` (web-prototype، saas-landing، dashboard، mobile-app، gamified-app، social-carousel، magazine-poster، dating-web، sprite-animation، motion-frames، critique، tweaks، wireframe-sketch، pm-spec، eng-runbook، finance-report، hr-onboarding، invoice، kanban-board، team-okrs، …) + 4 في وضع `deck` (`guizang-ppt` · `simple-deck` · `replit-deck` · `weekly-update`). مُجمَّعة في الـ picker حسب `scenario`: design / marketing / operation / engineering / product / finance / hr / sale / personal. |
| **توليد الوسائط** | تشتغل أسطح الصورة والفيديو والصوت بالتوازي مع حلقة التصميم. **gpt-image-2** (Azure / OpenAI) للملصقات والصور الرمزية والإنفوغرافيك وخرائط المدن المرسومة · **Seedance 2.0** (ByteDance) لـ 15 ثانية t2v + i2v بطابع سينمائي · **HyperFrames** ([heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)) لتحويل HTML→MP4 (إعلانات منتجات، طباعة حركية، رسومات بيانية، بطاقات اجتماعية، Logo outros). معرض **93** برومبت جاهزة للاستنساخ — 43 لـ gpt-image-2 + 39 لـ Seedance + 11 لـ HyperFrames — تحت [`prompt-templates/`](prompt-templates/) مع صور معاينة وبيانات المصدر. نفس واجهة الـ chat كما في الكود؛ المخرجات ملفات `.mp4` / `.png` حقيقية تنزل في مساحة عمل المشروع. |
| **الاتجاهات البصرية** | 5 مدارس منتقاة (Editorial Monocle · Modern Minimal · Warm Soft · Tech Utility · Brutalist Experimental) — كل واحدة تأتي بلوحة OKLch حتميّة + font stack ([`apps/daemon/src/prompts/directions.ts`](apps/daemon/src/prompts/directions.ts)) |
| **إطارات الأجهزة** | iPhone 15 Pro · Pixel · iPad Pro · MacBook · Browser Chrome — دقيقة على مستوى البكسل، مُشتركة عبر الـ skills تحت [`assets/frames/`](assets/frames/) |
| **Agent runtime** | الـ daemon المحلي يُشغّل CLI داخل مجلد مشروعك — يحصل الوكيل على أدوات `Read` / `Write` / `Bash` / `WebFetch` حقيقية على نظام ملفات حقيقي، مع fallbacks على Windows لتجاوز قيود `ENAMETOOLONG` (stdin / ملف برومبت مؤقت) في كل adapter |
| **الاستيراد** | اسحب ملف ZIP مُصدَّر من [Claude Design][cd] إلى مربّع الترحيب — `POST /api/import/claude-design` يفكّه إلى مشروع حقيقي ليُكمل وكيلك من حيث توقّف Anthropic |
| **الاستمرارية** | SQLite في `.od/app.sqlite`: projects · conversations · messages · tabs · قوالب المستخدم. افتح المشروع غداً، فتجد بطاقة todo والملفات المفتوحة في مكانها تماماً. |
| **دورة الحياة** | مدخل واحد: `pnpm tools-dev` (start / stop / run / status / logs / inspect / check) — يُقلع daemon + web (+ desktop) بـ stamps مكتوبة |
| **سطح المكتب** | غلاف Electron اختياري بسبيل renderer معزول + sidecar IPC (STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN) — يُشغّل `tools-dev inspect desktop screenshot` لاختبارات E2E |
| **أهداف النشر** | محلياً (`pnpm tools-dev`) · طبقة الويب على Vercel · تطبيق سطح مكتب Electron مُحزَّم لـ macOS (Apple Silicon) و Windows (x64) — حمّله من [open-design.ai](https://open-design.ai/) أو من [أحدث release](https://github.com/nexu-io/open-design/releases) |
| **الترخيص** | Apache-2.0 |

[acd2]: https://github.com/VoltAgent/awesome-design-md
[ads]: https://github.com/bergside/awesome-design-skills

## عرض توضيحي

<table>
<tr>
<td width="50%">
<img src="docs/screenshots/01-entry-view.png" alt="01 · واجهة الدخول" /><br/>
<sub><b>واجهة الدخول</b> — اختر skill، اختر نظام تصميم، واكتب الطلب. نفس السطح يخدم prototypes و decks وتطبيقات الموبايل و dashboards وصفحات editorial.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/02-question-form.png" alt="02 · نموذج اكتشاف turn-1" /><br/>
<sub><b>نموذج الاكتشاف turn-1</b> — قبل أن يكتب النموذج بكسلاً واحداً، يُثبّت OD التفاصيل: surface، الجمهور، النبرة، السياق البصري، النطاق. 30 ثانية من خانات الاختيار توفّر 30 دقيقة من التراجعات.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/03-direction-picker.png" alt="03 · منتقي الاتجاه" /><br/>
<sub><b>منتقي الاتجاه</b> — حين لا يملك المستخدم هوية بصرية، يُطلق الوكيل نموذجاً ثانياً فيه 5 اتجاهات منتقاة (Monocle / Modern Minimal / Tech Utility / Brutalist / Soft Warm). نقرة واحدة → لوحة ألوان حتميّة + font stack، بلا ارتجال.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/04-todo-progress.png" alt="04 · تقدّم الـ todo الحيّ" /><br/>
<sub><b>تقدّم الـ todo الحيّ</b> — تنساب خطّة الوكيل كبطاقة حيّة. تنتقل العناصر من <code>in_progress</code> إلى <code>completed</code> آنياً. يمكن للمستخدم التدخّل وتصحيح المسار بتكلفة منخفضة جداً.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/05-preview-iframe.png" alt="05 · المعاينة المعزولة" /><br/>
<sub><b>المعاينة المعزولة</b> — كلّ <code>&lt;artifact&gt;</code> يُعرض في srcdoc iframe نظيف. قابل للتحرير في المكان عبر مساحة الملفات؛ قابل للتنزيل HTML / PDF / ZIP.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/06-design-systems-library.png" alt="06 · مكتبة الأنظمة الـ72" /><br/>
<sub><b>مكتبة الأنظمة الـ72</b> — كل نظام منتج يعرض بطاقته رباعية الألوان. اضغط لرؤية ملف <code>DESIGN.md</code> الكامل وشبكة الألوان والعرض الحيّ.</sub>
</td>
</tr>
<tr>
<td width="50%">
<img src="docs/screenshots/07-magazine-deck.png" alt="07 · Magazine deck" /><br/>
<sub><b>وضع Deck (guizang-ppt)</b> — الـ <a href="https://github.com/op7418/guizang-ppt-skill"><code>guizang-ppt-skill</code></a> المُضمَّن يدخل دون تعديل. تخطيطات مجلّة، خلفيات WebGL hero، خرج HTML بملف واحد، تصدير PDF.</sub>
</td>
<td width="50%">
<img src="docs/screenshots/08-mobile-app.png" alt="08 · نموذج موبايل" /><br/>
<sub><b>نموذج موبايل</b> — chrome دقيق على مستوى البكسل لـ iPhone 15 Pro (Dynamic Island، رموز SVG لشريط الحالة، Home Indicator). النماذج متعدّدة الشاشات تستخدم أصول <code>/frames/</code> المشتركة، فلا يعيد الوكيل رسم الهاتف أبداً.</sub>
</td>
</tr>
</table>

## الـ Skills

**31 skill جاهزة في الصندوق.** كل واحدة مجلد تحت [`skills/`](skills/) يتبع اصطلاح Claude Code [`SKILL.md`][skill] مع frontmatter موسّع `od:` يفسّره الـ daemon حرفياً — `mode`، `platform`، `scenario`، `preview.type`، `design_system.requires`، `default_for`، `featured`، `fidelity`، `speaker_notes`، `animations`، `example_prompt` ([`apps/daemon/src/skills.ts`](apps/daemon/src/skills.ts)).

يحمل الكتالوج وضعان رئيسيان: **`prototype`** (27 skill — أيّ شيء يُعرض كصفحة artifact واحدة، من landing بأسلوب مجلّة إلى شاشة هاتف إلى مستند PM spec) و**`deck`** (4 skills — عروض أفقية مع إطار deck-framework). حقل **`scenario`** هو ما يُجمِّع به الـ picker: `design` · `marketing` · `operation` · `engineering` · `product` · `finance` · `hr` · `sale` · `personal`.

### أمثلة العرض

الـ skills الأكثر تميّزاً بصرياً والأنسب لأوّل تجربة. كل واحدة تأتي بـ `example.html` حقيقي يمكنك فتحه مباشرة من المستودع لرؤية ما سيُنتجه الوكيل بالضبط — بدون auth ولا إعداد.

<table>
<tr>
<td width="50%" valign="top">
<a href="skills/dating-web/"><img src="docs/screenshots/skills/dating-web.png" alt="dating-web" /></a><br/>
<sub><b><a href="skills/dating-web/"><code>dating-web</code></a></b> · <i>prototype</i><br/>لوحة معلومات استهلاكية للمواعدة / التوافق — شريط جانبي للتنقّل، شريط أخبار، KPIs، رسم بياني للتطابق المتبادل خلال 30 يوماً، طباعة editorial.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/digital-eguide/"><img src="docs/screenshots/skills/digital-eguide.png" alt="digital-eguide" /></a><br/>
<sub><b><a href="skills/digital-eguide/"><code>digital-eguide</code></a></b> · <i>template</i><br/>دليل رقمي من صفحتين — غلاف (عنوان، مؤلف، تشويق TOC) + صفحة درس بـ pull-quote وقائمة خطوات. نبرة المنشئين / lifestyle.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/email-marketing/"><img src="docs/screenshots/skills/email-marketing.png" alt="email-marketing" /></a><br/>
<sub><b><a href="skills/email-marketing/"><code>email-marketing</code></a></b> · <i>prototype</i><br/>إيميل HTML لإطلاق منتج — masthead، صورة hero، عنوان مقفَّل، CTA، شبكة مواصفات. عمود واحد متمركز، آمن مع table-fallback.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/gamified-app/"><img src="docs/screenshots/skills/gamified-app.png" alt="gamified-app" /></a><br/>
<sub><b><a href="skills/gamified-app/"><code>gamified-app</code></a></b> · <i>prototype</i><br/>نموذج تطبيق موبايل بطابع لعبة من ثلاث شاشات على خلفية عرض داكنة — غلاف، مهام اليوم بـ XP وشريط مستوى، تفاصيل المهمة.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/mobile-onboarding/"><img src="docs/screenshots/skills/mobile-onboarding.png" alt="mobile-onboarding" /></a><br/>
<sub><b><a href="skills/mobile-onboarding/"><code>mobile-onboarding</code></a></b> · <i>prototype</i><br/>تدفّق onboarding للموبايل بثلاث شاشات — splash، عرض القيمة، تسجيل الدخول. شريط الحالة، نقاط التمرير، CTA رئيسي.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/motion-frames/"><img src="docs/screenshots/skills/motion-frames.png" alt="motion-frames" /></a><br/>
<sub><b><a href="skills/motion-frames/"><code>motion-frames</code></a></b> · <i>prototype</i><br/>إطار motion-design واحد بحركات CSS متكرّرة — حلقة طباعة دوّارة، كرة أرضية متحرّكة، مؤقّت. جاهز للتسليم إلى HyperFrames.</sub>
</td>
</tr>
<tr>
<td width="50%" valign="top">
<a href="skills/social-carousel/"><img src="docs/screenshots/skills/social-carousel.png" alt="social-carousel" /></a><br/>
<sub><b><a href="skills/social-carousel/"><code>social-carousel</code></a></b> · <i>prototype</i><br/>كاروسيل ثلاثي 1080×1080 لمنصّات التواصل — لوحات سينمائية بعناوين تتداخل عبر السلسلة، علامة هوية، إشارة loop.</sub>
</td>
<td width="50%" valign="top">
<a href="skills/sprite-animation/"><img src="docs/screenshots/skills/sprite-animation.png" alt="sprite-animation" /></a><br/>
<sub><b><a href="skills/sprite-animation/"><code>sprite-animation</code></a></b> · <i>prototype</i><br/>شريحة شرح متحرّكة بأسلوب pixel / 8-bit — مسرح كريمي ممتلئ، تميمة بكسل متحرّكة، طباعة يابانية حركية، CSS keyframes تتكرّر.</sub>
</td>
</tr>
</table>

### أسطح التصميم والتسويق (وضع prototype)

| Skill | المنصّة | السيناريو | المُخرَج |
|---|---|---|---|
| [`web-prototype`](skills/web-prototype/) | desktop | design | HTML بصفحة واحدة — landings، تسويق، صفحات hero (الافتراضي لـ prototype) |
| [`saas-landing`](skills/saas-landing/) | desktop | marketing | تخطيط Hero / features / pricing / CTA |
| [`dashboard`](skills/dashboard/) | desktop | operation | لوحة إدارة / تحليلات بشريط جانبي + بيانات كثيفة |
| [`pricing-page`](skills/pricing-page/) | desktop | sale | صفحة تسعير مستقلّة + جداول مقارنة |
| [`docs-page`](skills/docs-page/) | desktop | engineering | تخطيط توثيق ثلاثي الأعمدة |
| [`blog-post`](skills/blog-post/) | desktop | marketing | مقال طويل بنمط editorial |
| [`mobile-app`](skills/mobile-app/) | mobile | design | شاشة(ات) تطبيق داخل إطار iPhone 15 Pro / Pixel |
| [`mobile-onboarding`](skills/mobile-onboarding/) | mobile | design | تدفّق onboarding متعدّد الشاشات (splash · عرض القيمة · تسجيل الدخول) |
| [`gamified-app`](skills/gamified-app/) | mobile | personal | نموذج تطبيق موبايل بطابع لعبة من ثلاث شاشات |
| [`email-marketing`](skills/email-marketing/) | desktop | marketing | إيميل HTML لإطلاق منتج (آمن مع table-fallback) |
| [`social-carousel`](skills/social-carousel/) | desktop | marketing | كاروسيل ثلاثي 1080×1080 |
| [`magazine-poster`](skills/magazine-poster/) | desktop | marketing | ملصق مجلّة بصفحة واحدة |
| [`motion-frames`](skills/motion-frames/) | desktop | marketing | إطار motion-design بحركات CSS متكرّرة |
| [`sprite-animation`](skills/sprite-animation/) | desktop | marketing | شريحة شرح متحرّكة بأسلوب pixel / 8-bit |
| [`dating-web`](skills/dating-web/) | desktop | personal | mockup لـ dashboard مواعدة استهلاكي |
| [`digital-eguide`](skills/digital-eguide/) | desktop | marketing | دليل رقمي من صفحتين (غلاف + درس) |
| [`wireframe-sketch`](skills/wireframe-sketch/) | desktop | design | إسكتش يدوي للأفكار الأوليّة — يخدم جولة "أرِ شيئاً مرئياً مبكراً" |
| [`critique`](skills/critique/) | desktop | design | بطاقة تقييم ذاتي خماسية الأبعاد (Philosophy · Hierarchy · Detail · Function · Innovation) |
| [`tweaks`](skills/tweaks/) | desktop | design | لوحة tweaks يطلقها الذكاء الاصطناعي — يقترح النموذج بنفسه القيم التي تستحقّ التعديل |

### أسطح Deck (وضع deck)

| Skill | الافتراضي لـ | المُخرَج |
|---|---|---|
| [`guizang-ppt`](skills/guizang-ppt/) | **الافتراضي** لوضع deck | PPT ويب بأسلوب مجلّة — مُضمَّن حرفياً من [op7418/guizang-ppt-skill][guizang] مع الحفاظ على LICENSE الأصلية |
| [`simple-deck`](skills/simple-deck/) | — | deck أفقي بسيط |
| [`replit-deck`](skills/replit-deck/) | — | deck لاستعراض منتج (بأسلوب Replit) |
| [`weekly-update`](skills/weekly-update/) | — | إيقاع أسبوعي لفريق على شكل deck (التقدّم · العوائق · التالي) |

### أسطح المكتب والعمليات (وضع prototype مع سيناريوهات الوثائق)

| Skill | السيناريو | المُخرَج |
|---|---|---|
| [`pm-spec`](skills/pm-spec/) | product | مستند PM spec بفهرس + سجل قرارات |
| [`team-okrs`](skills/team-okrs/) | product | بطاقة OKR |
| [`meeting-notes`](skills/meeting-notes/) | operation | سجل قرارات اجتماع |
| [`kanban-board`](skills/kanban-board/) | operation | لقطة لوحة Kanban |
| [`eng-runbook`](skills/eng-runbook/) | engineering | runbook لحوادث الإنتاج |
| [`finance-report`](skills/finance-report/) | finance | ملخّص مالي تنفيذي |
| [`invoice`](skills/invoice/) | finance | فاتورة بصفحة واحدة |
| [`hr-onboarding`](skills/hr-onboarding/) | hr | خطّة onboarding لدور وظيفي |

إضافة skill جديدة = مجلّد واحد. اقرأ [`docs/skills-protocol.md`](docs/skills-protocol.md) لمعرفة الـ frontmatter الموسّع، fork لـ skill قائمة، أعد تشغيل الـ daemon، وستظهر في الـ picker. نقطة الكتالوج هي `GET /api/skills`؛ تجميع seed لكل skill (template + ملفات references) يقع على `GET /api/skills/:id/example`.

## ستّة أفكار حاملة

### 1 · لا نشحن وكيلاً، وكيلك كافٍ

الـ daemon يمسح `PATH` بحثاً عن [`claude`](https://docs.anthropic.com/en/docs/claude-code) و [`codex`](https://github.com/openai/codex) و `devin` و [`cursor-agent`](https://www.cursor.com/cli) و [`gemini`](https://github.com/google-gemini/gemini-cli) و [`opencode`](https://opencode.ai/) و [`qwen`](https://github.com/QwenLM/qwen-code) و `qodercli` و [`copilot`](https://github.com/features/copilot/cli) و `hermes` و `kimi` و [`pi`](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) و [`kiro-cli`](https://kiro.dev) و [`vibe-acp`](https://github.com/mistralai/mistral-vibe) عند الإقلاع. ما يجده يصبح محرّك تصميم مرشّحاً — يُشغَّل عبر stdio بـ adapter لكل CLI، قابل للتبديل من الـ model picker. الإلهام من [`multica`](https://github.com/multica-ai/multica) و [`cc-switch`](https://github.com/farion1231/cc-switch). لا CLI مثبتة؟ وضع API هو نفس خط الأنابيب بدون spawn — اختر Anthropic أو متوافق مع OpenAI أو Azure OpenAI أو Google Gemini ويُعيد الـ daemon توجيه قطع SSE المُطبَّعة، مع رفض loopback / link-local / RFC1918 عند الحدّ.

### 2 · الـ Skills ملفات، لا plugins

اتّباعاً لاصطلاح Claude Code [`SKILL.md`](https://docs.anthropic.com/en/docs/claude-code/skills)، كل skill = `SKILL.md` + `assets/` + `references/`. ضع مجلّداً في [`skills/`](skills/)، أعد تشغيل الـ daemon، وستظهر في الـ picker. الـ `magazine-web-ppt` المضمَّنة هي [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) **حرفياً** — مع الحفاظ على الترخيص والإسناد الأصلي.

### 3 · أنظمة التصميم Markdown قابل للنقل، لا theme JSON

مخطّط `DESIGN.md` المؤلف من 9 أقسام من [`VoltAgent/awesome-design-md`][acd2] — color، typography، spacing، layout، components، motion، voice، brand، anti-patterns. كلّ artifact يقرأ من النظام النشط. بدّل النظام → الرندر التالي يستخدم الـ tokens الجديدة. القائمة المنسدلة تأتي بـ **Linear، Stripe، Vercel، Airbnb، Tesla، Notion، Apple، Anthropic، Cursor، Supabase، Figma، Resend، Raycast، Lovable، Cohere، Mistral، ElevenLabs، X.AI، Spotify، Webflow، Sanity، PostHog، Sentry، MongoDB، ClickHouse، Cal، Replicate، Clay، Composio، Xiaohongshu…** — إضافة إلى 57 design skill من [`awesome-design-skills`][ads].

### 4 · نموذج الأسئلة التفاعلي يمنع 80% من التراجعات

يُحدِّد مكدّس برومبت OD `RULE 1` بشكل صارم: كل brief تصميم جديد يبدأ بـ `<question-form id="discovery">` وليس بكود. Surface · الجمهور · النبرة · سياق الهوية · النطاق · القيود. حتى الـ brief الطويل يترك قرارات تصميمية مفتوحة — النبرة البصرية، موقف الألوان، النطاق — وهي تحديداً ما يُثبّته النموذج خلال 30 ثانية. تكلفة الاتجاه الخاطئ هي جولة chat واحدة، لا deck كامل.

هذا هو **وضع Junior-Designer** المستخلص من [`huashu-design`](https://github.com/alchaincyf/huashu-design): اجمع الأسئلة دفعة واحدة في البداية، أرِ شيئاً مرئياً مبكراً (حتى لو wireframe بكتل رمادية)، ودَع المستخدم يصحّح المسار بتكلفة منخفضة. مدمجاً مع بروتوكول الأصول البصرية (locate · download · `grep` للـ hex · كتابة `brand-spec.md` · vocalise)، هذا هو السبب الأكبر في أن المخرج يتوقّف عن الإحساس بكونه AI freestyle ويبدأ يبدو كمصمّم انتبه لمصادره قبل أن يبدأ الرسم.

### 5 · الـ daemon يجعل الوكيل يحسّ أنه على حاسوبك، لأنه فعلاً كذلك

عند `spawn` الـ CLI، يضبط الـ daemon `cwd` على مجلّد artifacts المشروع تحت `.od/projects/<id>/`. يحصل الوكيل على `Read` / `Write` / `Bash` / `WebFetch` — أدوات حقيقية على نظام ملفات حقيقي. يستطيع `Read` لـ `assets/template.html` الخاص بالـ skill، `grep` على CSS لاستخراج قيم hex، كتابة `brand-spec.md`، إنزال صور مولّدة، وإنتاج ملفات `.pptx` / `.zip` / `.pdf` تظهر في مساحة الملفات كقطع تنزيل عند انتهاء الجولة. الجلسات والمحادثات والرسائل والـ tabs تُحفظ كلها في SQLite محلية — افتح المشروع غداً تجد بطاقة todo حيث تركتها.

### 6 · مكدّس البرومبت هو المنتج

ما تُكوِّنه عند الإرسال ليس "system + user". بل:

```
DISCOVERY directives  (turn-1 form, turn-2 brand branch, TodoWrite, 5-dim critique)
  + identity charter   (OFFICIAL_DESIGNER_PROMPT, anti-AI-slop, junior-pass)
  + active DESIGN.md   (72 systems available)
  + active SKILL.md    (31 skills available)
  + project metadata   (kind, fidelity, speakerNotes, animations, inspiration ids)
  + skill side files   (auto-injected pre-flight: read assets/template.html + references/*.md)
  + (deck kind, no skill seed) DECK_FRAMEWORK_DIRECTIVE   (nav / counter / scroll / print)
```

كل طبقة قابلة للتركيب. كل طبقة ملف يمكنك تعديله. اقرأ [`apps/daemon/src/prompts/system.ts`](apps/daemon/src/prompts/system.ts) و [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts) لرؤية العقد الحقيقي.

## المعمارية

```
┌────────────────────── browser (Next.js 16) ──────────────────────┐
│  chat · file workspace · iframe preview · settings · imports     │
└──────────────┬───────────────────────────────────┬───────────────┘
               │ /api/* (rewritten in dev)          │
               ▼                                    ▼
   ┌──────────────────────────────────┐   /api/proxy/{provider}/stream (SSE)
   │  Local daemon (Express + SQLite) │   ─→ any OpenAI-compat
   │                                  │       endpoint (BYOK)
   │  /api/agents          /api/skills│       w/ SSRF blocking
   │  /api/design-systems  /api/projects/…
   │  /api/chat (SSE)      /api/proxy/{provider}/stream (SSE)
   │  /api/templates       /api/import/claude-design
   │  /api/artifacts/save  /api/artifacts/lint
   │  /api/upload          /api/projects/:id/files…
   │  /artifacts (static)  /frames (static)
   │
   │  optional: sidecar IPC at /tmp/open-design/ipc/<ns>/<app>.sock
   │  (STATUS · EVAL · SCREENSHOT · CONSOLE · CLICK · SHUTDOWN)
   └─────────┬────────────────────────┘
             │ spawn(cli, [...], { cwd: .od/projects/<id> })
             ▼
   ┌──────────────────────────────────────────────────────────────────┐
   │  claude · codex · devin (ACP) · gemini · opencode · cursor-agent │
   │  qwen · qoder · copilot · hermes (ACP) · kimi (ACP) · pi (RPC) · kiro (ACP) · vibe (ACP)     │
   │  reads SKILL.md + DESIGN.md, writes artifacts to disk            │
   └──────────────────────────────────────────────────────────────────┘
```

| الطبقة | المكدّس |
|---|---|
| الواجهة الأمامية | Next.js 16 App Router + React 18 + TypeScript، قابل للنشر على Vercel |
| Daemon | Node 24 · Express · بثّ SSE · `better-sqlite3`؛ الجداول: `projects` · `conversations` · `messages` · `tabs` · `templates` |
| نقل الوكلاء | `child_process.spawn`؛ بمحلّلات أحداث مكتوبة لـ `claude-stream-json` (Claude Code)، `qoder-stream-json` (Qoder CLI)، `copilot-stream-json` (Copilot)، محلّلات `json-event-stream` لكل CLI (Codex / Gemini / OpenCode / Cursor Agent)، `acp-json-rpc` (Devin / Hermes / Kimi / Kiro / Kilo / Mistral Vibe عبر Agent Client Protocol)، `pi-rpc` (Pi عبر stdio JSON-RPC)، `plain` (Qwen Code / DeepSeek TUI) |
| BYOK proxy | `POST /api/proxy/{anthropic,openai,azure,google}/stream` → APIs أعلى التيار خاصة بكل provider، SSE مُطبَّعة `delta/end/error`؛ يرفض loopback / link-local / RFC1918 عند حدّ الـ daemon |
| التخزين | ملفات عادية في `.od/projects/<id>/` + SQLite في `.od/app.sqlite` + اعتمادات في `.od/media-config.json` (في gitignore، تُنشأ تلقائياً). `OD_DATA_DIR=<dir>` ينقل كل بيانات الـ daemon (تُستخدم لعزل الاختبارات وإعدادات التثبيت للقراءة فقط)؛ `OD_MEDIA_CONFIG_DIR=<dir>` يضيّق التجاوز إلى `media-config.json` فقط لإبقاء مفاتيح API في موقع منفصل |
| المعاينة | iframe معزولة عبر `srcdoc` + محلّل `<artifact>` لكل skill ([`apps/web/src/artifacts/parser.ts`](apps/web/src/artifacts/parser.ts)) |
| التصدير | HTML (مع inlining للأصول) · PDF (طباعة المتصفّح، مع وعي بالـ deck) · PPTX (مدفوع بالوكيل عبر skill) · ZIP (archiver) · Markdown |
| دورة الحياة | `pnpm tools-dev start \| stop \| run \| status \| logs \| inspect \| check`؛ المنافذ عبر `--daemon-port` / `--web-port`، النطاقات عبر `--namespace` |
| سطح المكتب (اختياري) | غلاف Electron — يكتشف رابط الويب عبر sidecar IPC، بدون تخمين منافذ؛ نفس قناة `STATUS`/`EVAL`/`SCREENSHOT`/`CONSOLE`/`CLICK`/`SHUTDOWN` تُشغّل `tools-dev inspect desktop …` لاختبارات E2E |

## Quickstart

### تنزيل تطبيق سطح المكتب (بدون بناء)

أسرع طريقة لتجربة Open Design هي تطبيق سطح المكتب الجاهز — بدون Node، بدون pnpm، بدون clone:

- **[open-design.ai](https://open-design.ai/)** — صفحة التنزيل الرسمية
- **[إصدارات GitHub](https://github.com/nexu-io/open-design/releases)**

### التشغيل من المصدر

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable
corepack pnpm --version   # should print 10.33.2
pnpm install
pnpm tools-dev run web
# open the web URL printed by tools-dev
```

متطلّبات البيئة: Node `~24` و pnpm `10.33.x`. أدوات `nvm`/`fnm` اختيارية فقط؛ إن استخدمت إحداها فشغّل `nvm install 24 && nvm use 24` أو `fnm install 24 && fnm use 24` قبل `pnpm install`.

لتشغيل سطح المكتب / الخلفية، إعادة التشغيل بمنافذ ثابتة، وفحوص dispatcher توليد الوسائط (`OD_BIN`، `OD_DAEMON_URL`، `apps/daemon/dist/cli.js`) راجع [`QUICKSTART.md`](QUICKSTART.md).

عند أوّل تحميل:

1. يكتشف أيّ CLI وكلاء على `PATH` ويختار واحدة تلقائياً.
2. يحمّل 31 skill + 72 نظام تصميم.
3. يُظهر مربع الترحيب لتلصق Anthropic key (مطلوب فقط لمسار BYOK البديل).
4. **ينشئ `./.od/` تلقائياً** — مجلد التشغيل المحلي الذي يحوي SQLite للمشاريع، artifacts كل مشروع، والرندرز المحفوظة. لا يوجد `od init`؛ الـ daemon يعمل `mkdir` لما يحتاجه عند الإقلاع.

اكتب طلباً، اضغط **Send**، شاهد نموذج الأسئلة يصل، املأه، شاهد بطاقة todo تنساب، شاهد الـ artifact يُرسم. اضغط **Save to disk** أو نزِّل المشروع كـ ZIP.

### حالة أوّل تشغيل (`./.od/`)

يمتلك الـ daemon مجلداً مخفياً واحداً في جذر المستودع. كلّ ما فيه في gitignore ومحلّي للجهاز — لا تُجرِ commit له أبداً.

```
.od/
├── app.sqlite                 ← projects · conversations · messages · open tabs
├── artifacts/                 ← one-off "Save to disk" renders (timestamped)
└── projects/<id>/             ← per-project working dir, also the agent's cwd
```

| تريد… | افعل |
|---|---|
| فحص ما بداخله | `ls -la .od && sqlite3 .od/app.sqlite '.tables'` |
| الإعادة إلى حالة نظيفة | `pnpm tools-dev stop` ثم `rm -rf .od` ثم `pnpm tools-dev run web` |
| نقله إلى مكان آخر | غير مدعوم بعد — المسار مُكوَّد نسبياً إلى المستودع |

خريطة الملفات الكاملة، السكربتات، واستكشاف الأخطاء → [`QUICKSTART.md`](QUICKSTART.md).

## تشغيل المشروع

يمكن تشغيل Open Design كتطبيق ويب في متصفّحك، أو كتطبيق سطح مكتب Electron. كلا الوضعين يتشاركان نفس معمارية الـ daemon المحلي + الويب.

### الويب / Localhost (الافتراضي)

```bash
# Foreground mode — keeps the lifecycle command in the foreground (logs written to files)
pnpm tools-dev run web

# View recent logs:
pnpm tools-dev logs

# Background mode — daemon + web run as background processes
pnpm tools-dev start web
```

افتراضياً، يربط `tools-dev` نفسه بمنافذ ephemeral متاحة ويطبع الروابط الفعلية عند الإقلاع. لاستخدام منافذ ثابتة من حالة متوقّفة:

```bash
pnpm tools-dev run web --daemon-port 17456 --web-port 17573
```

إذا كان daemon/web يعملان بالفعل، استخدم `restart` لتبديل المنافذ في الجلسة القائمة:

```bash
pnpm tools-dev restart --daemon-port 17456 --web-port 17573
```

### سطح المكتب / Electron

```bash
# Start daemon + web + desktop in the background
pnpm tools-dev

# Check desktop status
pnpm tools-dev inspect desktop status

# Take a screenshot of the desktop app
pnpm tools-dev inspect desktop screenshot --path /tmp/open-design.png
```

تطبيق سطح المكتب يكتشف رابط الويب تلقائياً عبر sidecar IPC — لا حاجة لتخمين المنافذ.

### أوامر مفيدة أخرى

| الأمر | ما يفعله |
|---|---|
| `pnpm tools-dev status` | يُظهر حالات الـ sidecar العاملة |
| `pnpm tools-dev logs` | يُظهر ذيول سجلات daemon/web/desktop |
| `pnpm tools-dev stop` | يوقف كل sidecars العاملة |
| `pnpm tools-dev restart` | يوقف ثم يعيد تشغيل كل sidecars |
| `pnpm tools-dev check` | الحالة + سجلات حديثة + تشخيصات شائعة |

لإعادة التشغيل بمنافذ ثابتة، الإقلاع في الخلفية، واستكشاف الأخطاء الكامل، راجع [`QUICKSTART.md`](QUICKSTART.md).

## استخدام Open Design من وكيل البرمجة لديك

يشحن Open Design خادم MCP عبر stdio. اربطه بـ Claude Code أو Codex أو Cursor أو VS Code أو Antigravity أو Zed أو Windsurf أو أيّ عميل متوافق مع MCP، وسيتمكّن الوكيل في مستودع آخر من قراءة الملفات من مشاريع Open Design المحلية مباشرة. يحلّ هذا محلّ حلقة export-ثم-attach. حين يستدعي الوكيل `search_files` أو `get_file` أو `get_artifact` بدون وسيط مشروع، يأخذ MCP افتراضياً المشروع (والملف) المفتوح حالياً في Open Design، بحيث تعمل برومبتات مثل *«ابنِ هذا في تطبيقي»* أو *«طابِق هذه الأنماط»* مباشرة.

**لماذا MCP؟** تصدير zip وإعادة إرفاقه مع كل دورة تصميم يكسر التدفّق. خادم MCP يكشف مصدر تصميمك مباشرة — tokens CSS، مكوّنات JSX، entry HTML — كـ API منظَّم يمكن للوكيل الاستعلام منه بالاسم. الوكيل يرى دائماً الملف الحيّ، لا نسخة قديمة من آخر export.

افتح **Settings → MCP server** في تطبيق Open Design للحصول على تدفّق تثبيت لكلّ عميل. تُضمِّن اللوحة المسار المطلق لـ `node` ولـ `cli.js` المبني للـ daemon داخل كل snippet، فتعمل على نسخة source جديدة لا يكون فيها `od` على الـ PATH. Cursor يحصل على deeplink بنقرة واحدة؛ والباقي يحصلون على JSON snippet للنسخ واللصق بالشكل الذي يتوقّعه ملفّ تكوينهم (Claude Code يتضمّن سطر `claude mcp add-json` واحداً، فلا تحتاج لتحرير `~/.claude.json` يدوياً). أعد تشغيل أو reload لعميلك بعد التثبيت ليظهر الخادم.

يجب أن يكون الـ daemon يعمل محلياً لتنجح استدعاءات أدوات MCP. إن كان الوكيل قد أُقلع قبل Open Design، أعد تشغيل الوكيل بعد جاهزية Open Design ليصل إلى الـ daemon الحيّ. الاستدعاءات أثناء توقّف الـ daemon تعيد خطأً واضحاً `"daemon not reachable"` بدلاً من crash.

**نموذج الأمان.** خادم MCP للقراءة فقط؛ يكشف قراءة ملفات، metadata، وبحث — لا شيء يكتب على القرص أو يستدعي خدمة خارجية. يعمل كعملية ابن لوكيل البرمجة عبر stdio، لذا أيّ عميل MCP تسجّله يرث صلاحية قراءة لمشاريع Open Design المحلية لديك. عامله مثل تثبيت إضافة VS Code: لا تسجّل إلا العملاء الذين تثق بهم. الـ daemon يربط نفسه بـ `127.0.0.1` افتراضياً؛ التعرّض للشبكة المحلية بأكملها يتطلّب `OD_BIND_HOST` صريحاً.

## بنية المستودع

```
open-design/
├── README.md                      ← English
├── README.ar.md                   ← العربية (this file)
├── README.de.md                   ← Deutsch
├── README.ru.md                   ← Русский
├── README.zh-CN.md                ← 简体中文
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
│   ├── web-prototype/             ← default for prototype mode
│   ├── saas-landing/  dashboard/  pricing-page/  docs-page/  blog-post/
│   ├── mobile-app/  mobile-onboarding/  gamified-app/
│   ├── email-marketing/  social-carousel/  magazine-poster/
│   ├── motion-frames/  sprite-animation/  digital-eguide/  dating-web/
│   ├── critique/  tweaks/  wireframe-sketch/
│   ├── pm-spec/  team-okrs/  meeting-notes/  kanban-board/
│   ├── eng-runbook/  finance-report/  invoice/  hr-onboarding/
│   ├── simple-deck/  replit-deck/  weekly-update/   ← deck mode
│   └── guizang-ppt/               ← bundled magazine-web-ppt (default for deck)
│       ├── SKILL.md
│       ├── assets/template.html   ← seed
│       └── references/{themes,layouts,components,checklist}.md
│
├── design-systems/                ← 72 DESIGN.md systems
│   ├── default/                   ← Neutral Modern (starter)
│   ├── warm-editorial/            ← Warm Editorial (starter)
│   ├── linear-app/  vercel/  stripe/  airbnb/  notion/  cursor/  apple/  …
│   └── README.md                  ← catalog overview
│
├── assets/
│   └── frames/                    ← shared device frames (used cross-skill)
│       ├── iphone-15-pro.html
│       ├── android-pixel.html
│       ├── ipad-pro.html
│       ├── macbook.html
│       └── browser-chrome.html
│
├── templates/
│   ├── deck-framework.html        ← deck baseline (nav / counter / print)
│   └── kami-deck.html             ← kami-flavored deck starter (parchment / ink-blue serif)
│
├── scripts/
│   └── sync-design-systems.ts     ← re-import upstream awesome-design-md tarball
│
├── docs/
│   ├── spec.md                    ← product spec, scenarios, differentiation
│   ├── architecture.md            ← topologies, data flow, components
│   ├── skills-protocol.md         ← extended SKILL.md od: frontmatter
│   ├── agent-adapters.md          ← per-CLI detection + dispatch
│   ├── modes.md                   ← prototype / deck / template / design-system
│   ├── references.md              ← long-form provenance
│   ├── roadmap.md                 ← phased delivery
│   ├── schemas/                   ← JSON schemas
│   └── examples/                  ← canonical artifact examples
│
└── .od/                           ← runtime data, gitignored, auto-created
    ├── app.sqlite                 ← projects / conversations / messages / tabs
    ├── projects/<id>/             ← per-project working folder (agent's cwd)
    └── artifacts/                 ← saved one-off renders
```

## أنظمة التصميم

<p align="center">
  <img src="docs/assets/design-systems-library.png" alt="مكتبة أنظمة التصميم الـ72 — افتتاحية style guide" width="100%" />
</p>

72 نظاماً جاهزاً، كلٌّ منها [`DESIGN.md`](design-systems/README.md) واحد:

<details>
<summary><b>الكتالوج الكامل</b> (انقر للتوسيع)</summary>

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

تُستورد مكتبة أنظمة المنتجات عبر [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts) من [`VoltAgent/awesome-design-md`][acd2]. أعد تشغيل السكربت للتحديث. الـ 57 design skills مصدرها [`bergside/awesome-design-skills`][ads] وأُضيفت مباشرة في `design-systems/`.

## الاتجاهات البصرية

حين لا يملك المستخدم brand spec، يُطلق الوكيل نموذجاً ثانياً بخمسة اتجاهات منتقاة — وهو تكييف OD لـ [نظام huashu-design "5 مدارس × 20 فلسفة تصميم" البديل](https://github.com/alchaincyf/huashu-design#%E8%AE%BE%E8%AE%A1%E6%96%B9%E5%90%91%E9%A1%BE%E9%97%AE-fallback). كل اتجاه مواصفات حتميّة — لوحة OKLch، font stack، تلميحات هيئة، references — يربطها الوكيل حرفياً بـ `:root` لقالب الـ seed. نقرة واحدة → نظام بصري كامل المواصفات. لا ارتجال، لا AI-slop.

| الاتجاه | المزاج | المراجع |
|---|---|---|
| Editorial — Monocle / FT | مجلّة مطبوعة، حبر + كريمي + صدئ دافئ | Monocle · FT Weekend · NYT Magazine |
| Modern minimal — Linear / Vercel | بارد، منظَّم، تفاصيل بسيطة | Linear · Vercel · Stripe |
| Tech utility | كثافة معلومات، monospace، terminal | Bloomberg · Bauhaus tools |
| Brutalist | خشن، طباعة عملاقة، بدون ظلال، تفاصيل قاسية | Bloomberg Businessweek · Achtung |
| Soft warm | كريم، تباين منخفض، ألوان خوخية محايدة | Notion marketing · Apple Health |

المواصفات الكاملة → [`apps/daemon/src/prompts/directions.ts`](apps/daemon/src/prompts/directions.ts).

## توليد الوسائط

OD لا يقف عند الكود. نفس واجهة الـ chat التي تنتج HTML للـ `<artifact>` تقود أيضاً توليد **الصورة** و**الفيديو** و**الصوت**، مع adapters للنماذج موصولة في خط أنابيب الوسائط للـ daemon ([`apps/daemon/src/media-models.ts`](apps/daemon/src/media-models.ts)، [`apps/web/src/media/models.ts`](apps/web/src/media/models.ts)). كل رندر ينزل كملف حقيقي في مساحة عمل المشروع — `.png` للصورة، `.mp4` للفيديو — ويظهر كقطعة تنزيل عند انتهاء الجولة.

ثلاث عائلات نماذج تحمل العبء حالياً:

| السطح | النموذج | المزوّد | الاستخدام |
|---|---|---|---|
| **صورة** | `gpt-image-2` | Azure / OpenAI | ملصقات، صور رمزية، خرائط مرسومة، إنفوغرافيك، بطاقات اجتماعية بأسلوب مجلّة، ترميم صور، رسوم منتجات بانفجار |
| **فيديو** | `seedance-2.0` | ByteDance Volcengine | 15 ثانية t2v + i2v سينمائي بالصوت — قصص قصيرة، لقطات شخصية مقرّبة، أفلام منتج، تصميم بأسلوب MV |
| **فيديو** | `hyperframes-html` | [HeyGen / OSS](https://github.com/heygen-com/hyperframes) | HTML→MP4 motion graphics — إعلانات منتجات، طباعة حركية، مخطّطات بيانية، طبقات اجتماعية، logo outros، عمودي بأسلوب TikTok مع karaoke captions |

معرض البرومبت المتنامي في [`prompt-templates/`](prompt-templates/) يحوي **93 برومبت جاهزة للاستنساخ** — 43 صورة (`prompt-templates/image/*.json`)، 39 لـ Seedance (`prompt-templates/video/*.json` باستثناء `hyperframes-*`)، 11 لـ HyperFrames (`prompt-templates/video/hyperframes-*.json`). كل واحد يحمل صورة معاينة، نصّ البرومبت حرفياً، النموذج المستهدف، نسبة العرض إلى الارتفاع، وكتلة `source` للترخيص والإسناد. الـ daemon يخدمها على `GET /api/prompt-templates`، وتطبيق الويب يعرضها كشبكة بطاقات في تبويبات **Image templates** و**Video templates** بواجهة الدخول؛ نقرة واحدة تضع البرومبت في الـ composer مع النموذج الصحيح مُختاراً مسبقاً.

### gpt-image-2 — معرض الصور (عيّنة من 43)

<table>
<tr>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776661968404_8a5flm_HGQc_KOaMAA2vt0.jpg" alt="3D Stone Staircase Evolution" /><br/><sub><b>3D Stone Staircase Evolution Infographic</b><br/>إنفوغرافيك من 3 خطوات بجمالية الحجر المنحوت</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1776662673014_nf0taw_HGRMNDybsAAGG88.jpg" alt="Illustrated City Food Map" /><br/><sub><b>Illustrated City Food Map</b><br/>ملصق سفر editorial مرسوم باليد</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453149026_gd2k50_HHCSvymboAAVscc.jpg" alt="Cinematic Elevator Scene" /><br/><sub><b>Cinematic Elevator Scene</b><br/>لقطة ثابتة سينمائية لأزياء editorial</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453164993_mt5b69_HHDoWfeaUAEA6Vt.jpg" alt="Cyberpunk Anime Portrait" /><br/><sub><b>Cyberpunk Anime Portrait</b><br/>صورة رمزية — وجه نيون مع نص</sub></td>
<td width="20%" valign="top"><img src="https://cms-assets.youmind.com/media/1777453184257_vb9hvl_HG9tAkOa4AAuRrn.jpg" alt="Glamorous Woman in Black" /><br/><sub><b>Glamorous Woman in Black Portrait</b><br/>بورتريه استوديو editorial</sub></td>
</tr>
</table>

المجموعة الكاملة → [`prompt-templates/image/`](prompt-templates/image/). المصادر: معظمها من [`YouMind-OpenLab/awesome-gpt-image-prompts`](https://github.com/YouMind-OpenLab/awesome-gpt-image-prompts) (CC-BY-4.0) مع الحفاظ على إسناد المؤلفين في كل قالب.

### Seedance 2.0 — معرض الفيديو (عيّنة من 39)

<table>
<tr>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c4515f4f328539e1ded2cc32f4ce63e7/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/c4515f4f328539e1ded2cc32f4ce63e7/thumbnails/thumbnail.jpg" alt="Music Podcast Guitar" /></a><br/><sub><b>Music Podcast & Guitar Technique</b><br/>فيلم استوديو سينمائي 4K</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/4a47ba646e7cedd79363c861864b8714/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/4a47ba646e7cedd79363c861864b8714/thumbnails/thumbnail.jpg" alt="Emotional Face" /></a><br/><sub><b>Emotional Face Close-up</b><br/>دراسة ميكرو-تعابير سينمائية</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7e8983364a95fe333f0f88bd1085a0e8/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7e8983364a95fe333f0f88bd1085a0e8/thumbnails/thumbnail.jpg" alt="Luxury Supercar" /></a><br/><sub><b>Luxury Supercar Cinematic</b><br/>فيلم منتج روائي</sub></td>
<td width="20%" valign="top"><a href="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/0279a674ce138ab5a0a6f020a7273d89/downloads/default.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/0279a674ce138ab5a0a6f020a7273d89/thumbnails/thumbnail.jpg" alt="Forbidden City Cat" /></a><br/><sub><b>Forbidden City Cat Satire</b><br/>قصة قصيرة ساخرة بأسلوب stylised</sub></td>
<td width="20%" valign="top"><a href="https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts/releases/download/videos/1402.mp4"><img src="https://customer-qs6wnyfuv0gcybzj.cloudflarestream.com/7f63ad253175a9ad1dac53de490efac8/thumbnails/thumbnail.jpg" alt="Japanese Romance" /></a><br/><sub><b>Japanese Romance Short Film</b><br/>15 ثانية بنمط Seedance 2.0 السردي</sub></td>
</tr>
</table>

اضغط أيّ صورة معاينة لتشغيل MP4 المُرَنْدَر فعلاً. المجموعة الكاملة → [`prompt-templates/video/`](prompt-templates/video/) (المداخل `*-seedance-*` والمُعلَّمة Cinematic). المصادر: [`YouMind-OpenLab/awesome-seedance-2-prompts`](https://github.com/YouMind-OpenLab/awesome-seedance-2-prompts) (CC-BY-4.0) مع الحفاظ على روابط التغريدات الأصلية ومعرّفات المؤلفين.

### HyperFrames — HTML→MP4 motion graphics (11 قالباً جاهزاً للاستنساخ)

[**`heygen-com/hyperframes`**](https://github.com/heygen-com/hyperframes) هو إطار فيديو agent-native مفتوح المصدر من HeyGen — تكتب أنت (أو الوكيل) HTML + CSS + GSAP، فيرنده HyperFrames إلى MP4 حتمي عبر headless Chrome + FFmpeg. يشحن Open Design لـ HyperFrames كنموذج فيديو من الدرجة الأولى (`hyperframes-html`) موصول في dispatch الـ daemon، إضافة إلى `skills/hyperframes/` التي تعلّم الوكيل عقد timeline، قواعد الانتقال بين المشاهد، أنماط audio-reactive، captions/TTS، وكتل الكتالوج (`npx hyperframes add <slug>`).

11 برومبت hyperframes تُشحن تحت [`prompt-templates/video/hyperframes-*.json`](prompt-templates/video/)، كل واحد brief محدّد ينتج archetype بعينه:

<table>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-product-reveal-minimal.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Product reveal" /></a><br/><sub><b>5 ثوانٍ minimal product reveal</b> · 16:9 · بطاقة عنوان push-in بانتقال shader</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-saas-product-promo-30s.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="SaaS promo" /></a><br/><sub><b>30 ثانية SaaS product promo</b> · 16:9 · بأسلوب Linear/ClickUp مع كشف UI ثلاثي الأبعاد</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-tiktok-karaoke-talking-head.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/tiktok-follow.png" alt="TikTok karaoke" /></a><br/><sub><b>TikTok karaoke talking-head</b> · 9:16 · TTS + captions متزامنة بالكلمة</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-brand-sizzle-reel.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Brand sizzle" /></a><br/><sub><b>30 ثانية brand sizzle reel</b> · 16:9 · طباعة حركية متزامنة مع الإيقاع، audio-reactive</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-data-bar-chart-race.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/data-chart.png" alt="Data chart" /></a><br/><sub><b>Animated bar-chart race</b> · 16:9 · إنفوغرافيك بيانات بأسلوب NYT</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-flight-map-route.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/nyc-paris-flight.png" alt="Flight map" /></a><br/><sub><b>خريطة طيران (مصدر → وجهة)</b> · 16:9 · كشف مسار سينمائي بأسلوب Apple</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-logo-outro-cinematic.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/logo-outro.png" alt="Logo outro" /></a><br/><sub><b>4 ثوانٍ logo outro سينمائي</b> · 16:9 · تجميع جزء بجزء + bloom</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-money-counter-hype.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/apple-money-count.png" alt="Money counter" /></a><br/><sub><b>عدّاد $0 → $10K</b> · 9:16 · hype بأسلوب Apple مع وميض أخضر + burst</sub></td>
</tr>
<tr>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-app-showcase-three-phones.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/app-showcase.png" alt="App showcase" /></a><br/><sub><b>عرض تطبيق على 3 هواتف</b> · 16:9 · هواتف عائمة مع نقاط تركيز للميزات</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-social-overlay-stack.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Social overlay" /></a><br/><sub><b>Social overlay stack</b> · 9:16 · X · Reddit · Spotify · Instagram بالتسلسل</sub></td>
<td width="25%" valign="top"><a href="prompt-templates/video/hyperframes-website-to-video-promo.json"><img src="https://static.heygen.ai/hyperframes-oss/docs/images/catalog/blocks/instagram-follow.png" alt="Website to video" /></a><br/><sub><b>خطّ موقع → فيديو</b> · 16:9 · يلتقط الموقع بـ 3 viewports + انتقالات</sub></td>
<td width="25%" valign="top">&nbsp;</td>
</tr>
</table>

النمط نفسه: اختر قالباً، عدّل الـ brief، أرسل. يقرأ الوكيل `skills/hyperframes/SKILL.md` المضمَّن (الذي يحمل سير عمل OD-specific للرندر — تجميع ملفات المصدر في `.hyperframes-cache/` لتفادي ازدحام مساحة الملفات، يوزّع الـ daemon `npx hyperframes render` لتفادي تعليق macOS sandbox-exec / Puppeteer، وتنزل MP4 النهائية فقط كقطعة مشروع)، ويصوغ التركيب، ويسلّم MP4. صور معاينة كتل الكتالوج © HeyGen، تُخدم من CDN الخاص بهم؛ الإطار OSS بنفسه Apache-2.0.

> **موصول لكنه لم يُسطَّح بعد كقوالب:** Kling 2.0 / 1.6 / 1.5، Veo 3 / Veo 2، Sora 2 / Sora 2-Pro (عبر Fal)، MiniMax video-01 — جميعها داخل `VIDEO_MODELS` ([`apps/web/src/media/models.ts`](apps/web/src/media/models.ts)). Suno v5 / v4.5، Udio v2، Lyria 2 (موسيقى) و gpt-4o-mini-tts، MiniMax TTS (كلام) تغطي سطح الصوت. القوالب لهذه مفتوحة لمساهمات — ضع JSON في `prompt-templates/video/` أو `prompt-templates/audio/` ويظهر في الـ picker.

## ما وراء الـ chat — ماذا يُشحن أيضاً

تأخذ حلقة الـ chat / artifact الأضواء، لكن حفنة من القدرات الأقل ظهوراً موصولة بالفعل وتستحق أن تعرفها قبل أن تقارن OD بأيّ شيء آخر:

- **استيراد ZIP من Claude Design.** اسحب ملف export من claude.ai إلى مربّع الترحيب. `POST /api/import/claude-design` يستخرجه إلى `.od/projects/<id>/` حقيقي، يفتح ملف الإدخال كتبويب، ويُجهّز برومبت "أكمل من حيث ترك Anthropic" لوكيلك المحلّي. لا إعادة برومبت، ولا "اطلب من النموذج إعادة إنشاء ما كان لدينا للتوّ". ([`apps/daemon/src/server.ts`](apps/daemon/src/server.ts) — `/api/import/claude-design`)
- **بروكسي BYOK متعدّد المزوّدين.** `POST /api/proxy/{anthropic,openai,azure,google}/stream` يأخذ `{ baseUrl, apiKey, model, messages }`، يبني الطلب الخاص بالمزوّد، يُطبّع قطع SSE إلى `delta/end/error`، ويرفض loopback / link-local / RFC1918 لتفادي SSRF. متوافق OpenAI يغطّي OpenAI و Azure AI Foundry `/openai/v1` و DeepSeek و Groq و MiMo و OpenRouter و vLLM المستضاف ذاتياً؛ Azure OpenAI يضيف رابط deployment + `api-version`؛ Google يستخدم Gemini `:streamGenerateContent`.
- **قوالب يحفظها المستخدم.** ما إن يعجبك رندر، يلتقط `POST /api/templates` HTML + metadata في جدول `templates` بـ SQLite. المشروع التالي يلتقطه من صف "your templates" في الـ picker — نفس السطح كما الـ 31 المشحونة، لكن خاصّة بك.
- **حفظ الـ tabs.** كل مشروع يتذكّر ملفاته المفتوحة والتبويب النشط في جدول `tabs`. أعد فتح المشروع غداً، تجد مساحة العمل كما تركتها بالضبط.
- **API لفحص الـ artifact.** `POST /api/artifacts/lint` يُجري فحوصات بنيوية على artifact مولَّد (كسر إطار `<artifact>`، ملفات side files مفقودة، tokens لوحة قديمة) ويعيد نتائج يمكن للوكيل قراءتها في الجولة التالية. التقييم الذاتي خماسي الأبعاد يستخدم هذا ليؤسّس درجته على دليل حقيقي، لا انطباع.
- **بروتوكول sidecar + أتمتة سطح المكتب.** عمليات الـ daemon والويب وسطح المكتب تحمل stamps خماسية الحقول (`app · mode · namespace · ipc · source`) وتعرض قناة JSON-RPC IPC على `/tmp/open-design/ipc/<namespace>/<app>.sock`. `tools-dev inspect desktop status \| eval \| screenshot` يقود تلك القناة، فيعمل E2E بدون رأس على غلاف Electron حقيقي بدون harnesses خاصة ([`packages/sidecar-proto/`](packages/sidecar-proto/)، [`apps/desktop/src/main/`](apps/desktop/src/main/)).
- **spawn ودود لـ Windows.** كل adapter قد ينفجر `CreateProcess` عند حدّ ~32 KB لـ argv ببرومبتات طويلة (Codex، Gemini، OpenCode، Cursor Agent، Qwen، Qoder CLI، Pi) يُمرَّر له البرومبت عبر stdin بدلاً من ذلك. Claude Code و Copilot يحتفظان بـ `-p`؛ ويتراجع الـ daemon إلى ملف برومبت مؤقت إن تجاوز ذلك أيضاً.
- **بيانات runtime لكل namespace.** `OD_DATA_DIR` و`--namespace` يمنحانك أشجار `.od/`-style معزولة تماماً، فلا تتشارك Playwright وقنوات beta ومشاريعك الفعلية ملف SQLite واحد.

## ميكانيكا مكافحة AI-slop

كل المنظومة أدناه هي playbook الخاص بـ [`huashu-design`](https://github.com/alchaincyf/huashu-design)، نُقل إلى مكدّس برومبت OD وأصبح قابلاً للإنفاذ لكل skill عبر pre-flight لملفات side. اقرأ [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts) للاطّلاع على الصياغة الحيّة:

- **نموذج الأسئلة أوّلاً.** الجولة الأولى `<question-form>` فقط — لا تفكير، لا أدوات، لا سرد. يختار المستخدم الافتراضيات بسرعة الـ radio.
- **استخراج brand-spec.** حين يُرفق المستخدم لقطة شاشة أو URL، يُجري الوكيل بروتوكولاً من خمس خطوات (locate · download · grep hex · تدوين `brand-spec.md` · vocalise) قبل كتابة CSS. **لا يخمّن ألوان الهوية من الذاكرة أبداً.**
- **تقييم خماسي الأبعاد.** قبل إصدار `<artifact>`، يُقيّم الوكيل ناتجه بصمت من 1 إلى 5 عبر philosophy / hierarchy / execution / specificity / restraint. أيّ شيء أقل من 3/5 تراجع — أصلح وأعد التقييم. مرّتان أمر طبيعي.
- **checklist بمستويات P0/P1/P2.** كلّ skill تشحن `references/checklist.md` ببوابات P0 صارمة. على الوكيل المرور بـ P0 قبل الإصدار.
- **قائمة سوداء للـ slop.** تدرّجات بنفسجية عدوانية، أيقونات emoji عامة، بطاقات مدوّرة بحدود يسارية بارزة، أشخاص SVG مرسومون يدوياً، Inter كخط *display*، metrics مخترعة — كلها ممنوعة صراحة في البرومبت.
- **placeholders صادقة > إحصائيات وهمية.** حين لا يملك الوكيل رقماً حقيقياً، يكتب `—` أو كتلة رمادية معنونة، لا "أسرع 10×".

## مقارنة

| المحور | [Claude Design][cd] (Anthropic) | [Open CoDesign][ocod] | **Open Design** |
|---|---|---|---|
| الترخيص | مغلق | MIT | **Apache-2.0** |
| الشكل | ويب (claude.ai) | سطح مكتب (Electron) | **تطبيق ويب + daemon محلي** |
| قابل للنشر على Vercel | ❌ | ❌ | **✅** |
| Agent runtime | مُضمَّن (Opus 4.7) | مُضمَّن ([`pi-ai`][piai]) | **مفوَّض إلى CLI الموجودة لدى المستخدم** |
| Skills | خاصّة | 12 وحدة TS مخصّصة + `SKILL.md` | **31 حزمة [`SKILL.md`][skill] قابلة للسحب والإفلات** |
| نظام التصميم | خاصّ | `DESIGN.md` (v0.2 roadmap) | **`DESIGN.md` × 129 نظاماً مشحوناً** |
| مرونة المزوّد | Anthropic فقط | 7+ عبر [`pi-ai`][piai] | **16 CLI adapter + بروكسي BYOK متوافق OpenAI** |
| نموذج أسئلة الإقلاع | ❌ | ❌ | **✅ قاعدة صارمة، الجولة 1** |
| منتقي الاتجاه | ❌ | ❌ | **✅ 5 اتجاهات حتميّة** |
| تقدّم todo حيّ + بثّ الأدوات | ❌ | ✅ | **✅** (نمط UX من open-codesign) |
| معاينة iframe معزولة | ❌ | ✅ | **✅** (نمط من open-codesign) |
| استيراد ZIP من Claude Design | n/a | ❌ | **✅ `POST /api/import/claude-design` — أكمل من حيث ترك Anthropic** |
| تعديلات comment-mode دقيقة | ❌ | ✅ | 🟡 جزئي — تعليقات على عناصر المعاينة + مرفقات chat؛ موثوقية الـ patch الدقيقة لا تزال قيد العمل |
| لوحة tweaks يطلقها الذكاء الاصطناعي | ❌ | ✅ | 🚧 roadmap — لوحة UX مخصّصة في جانب الـ chat لم تُنفَّذ بعد |
| مساحة عمل بمستوى نظام الملفات | ❌ | جزئي (sandbox الـ Electron) | **✅ cwd حقيقي، أدوات حقيقية، SQLite دائم (projects · conversations · messages · tabs · templates)** |
| تقييم ذاتي خماسي الأبعاد | ❌ | ❌ | **✅ بوابة pre-emit** |
| فحص Artifact | ❌ | ❌ | **✅ `POST /api/artifacts/lint` — نتائج تُغذّى للوكيل** |
| Sidecar IPC + سطح مكتب headless | ❌ | ❌ | **✅ عمليات بـ stamps + `tools-dev inspect desktop status \| eval \| screenshot`** |
| صيغ التصدير | محدودة | HTML / PDF / PPTX / ZIP / Markdown | **HTML / PDF / PPTX (مدفوع بالوكيل) / ZIP / Markdown** |
| إعادة استخدام skill PPT | N/A | مدمج | **[`guizang-ppt-skill`][guizang] يدخل (الافتراضي لوضع deck)** |
| الحدّ الأدنى للفوترة | Pro / Max / Team | BYOK | **BYOK — الصق أي `baseUrl` متوافق مع OpenAI** |

[cd]: https://x.com/claudeai/status/2045156267690213649
[ocod]: https://github.com/OpenCoworkAI/open-codesign
[piai]: https://github.com/badlogic/pi-mono/tree/main/packages/ai
[acd]: https://github.com/VoltAgent/awesome-claude-design
[guizang]: https://github.com/op7418/guizang-ppt-skill
[skill]: https://docs.anthropic.com/en/docs/claude-code/skills

## الوكلاء المدعومون

يكتشفها الـ daemon تلقائياً من `PATH` عند الإقلاع. لا حاجة لإعداد. dispatch البثّ في [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) (`AGENT_DEFS`)؛ محلّلات كل CLI بجانبه. النماذج تُملأ إمّا بفحص `<bin> --list-models` / `<bin> models` / مصافحة ACP، أو من قائمة fallback منتقاة عند عدم كشف الـ CLI لقائمة.

| الوكيل | Bin | صيغة البثّ | شكل argv (مسار البرومبت المُركَّب) |
|---|---|---|---|
| [Claude Code](https://docs.anthropic.com/en/docs/claude-code) | `claude` | `claude-stream-json` (أحداث مكتوبة) | `claude -p <prompt> --output-format stream-json --verbose [--include-partial-messages] [--add-dir …] --permission-mode bypassPermissions` |
| [Codex CLI](https://github.com/openai/codex) | `codex` | `json-event-stream` + محلّل `codex` | `codex exec --json --skip-git-repo-check --full-auto [-C cwd] [--model …] [-c model_reasoning_effort=…] -` (البرومبت على stdin) |
| Devin for Terminal | `devin` | `acp-json-rpc` | `devin --permission-mode dangerous --respect-workspace-trust false acp` |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | `gemini` | `json-event-stream` + محلّل `gemini` | `GEMINI_CLI_TRUST_WORKSPACE=true gemini --output-format stream-json --yolo [--model …]` (البرومبت على stdin) |
| [OpenCode](https://opencode.ai/) | `opencode` | `json-event-stream` + محلّل `opencode` | `opencode run --format json --dangerously-skip-permissions [--model …] -` (البرومبت على stdin) |
| [Cursor Agent](https://www.cursor.com/cli) | `cursor-agent` | `json-event-stream` + محلّل `cursor-agent` | `cursor-agent --print --output-format stream-json --stream-partial-output --force --trust [--workspace cwd] [--model …] -` (البرومبت على stdin) |
| [Qwen Code](https://github.com/QwenLM/qwen-code) | `qwen` | `plain` (قطع stdout خام) | `qwen --yolo [--model …] -` (البرومبت على stdin) |
| Qoder CLI | `qodercli` | `qoder-stream-json` (أحداث مكتوبة) | `qodercli -p --output-format stream-json --permission-mode bypass_permissions [--cwd cwd] [--model …] [--add-dir …]` (البرومبت على stdin) |
| [GitHub Copilot CLI](https://github.com/features/copilot/cli) | `copilot` | `copilot-stream-json` (أحداث مكتوبة) | `copilot -p <prompt> --allow-all-tools --output-format json [--model …] [--add-dir …]` |
| [Hermes](https://github.com/eqlabs/hermes) | `hermes` | `acp-json-rpc` (Agent Client Protocol) | `hermes acp --accept-hooks` |
| Kimi CLI | `kimi` | `acp-json-rpc` | `kimi acp` |
| [Kiro CLI](https://kiro.dev) | `kiro-cli` | `acp-json-rpc` | `kiro-cli acp` |
| Kilo | `kilo` | `acp-json-rpc` | `kilo acp` |
| [Mistral Vibe CLI](https://github.com/mistralai/mistral-vibe) | `vibe-acp` | `acp-json-rpc` | `vibe-acp` |
| DeepSeek TUI | `deepseek` | `plain` (raw stdout chunks) | `deepseek exec --auto [--model …] <prompt>` |
| [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) | `pi` | `pi-rpc` (stdio JSON-RPC) | `pi --mode rpc [--model …] [--thinking …]` (البرومبت يُرسل كأمر RPC `prompt`) |
| **BYOK متعدّد المزوّدين** | n/a | تطبيع SSE | `POST /api/proxy/{provider}/stream` → Anthropic / متوافق OpenAI / Azure OpenAI / Gemini؛ محمي SSRF ضد loopback / link-local / RFC1918 |

إضافة CLI جديدة = مدخل واحد في [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts). صيغة البثّ واحدة من `claude-stream-json` أو `qoder-stream-json` أو `copilot-stream-json` أو `json-event-stream` (مع `eventParser` لكل CLI) أو `acp-json-rpc` أو `pi-rpc` أو `plain`.

## المراجع والنسب

كل مشروع خارجي يقتبس منه هذا المستودع. كل رابط يقود إلى المصدر لتحقّق من الـ provenance.

| المشروع | الدور هنا |
|---|---|
| [`Claude Design`][cd] | المنتج المغلق المصدر الذي يُمثّل هذا المستودع البديل المفتوح له. |
| [**`alchaincyf/huashu-design`**](https://github.com/alchaincyf/huashu-design) | نواة فلسفة التصميم. سير عمل Junior-Designer، بروتوكول الأصول البصرية المؤلف من 5 خطوات، checklist مكافحة AI-slop، التقييم الذاتي خماسي الأبعاد، ومكتبة "5 مدارس × 20 فلسفة تصميم" خلف منتقي الاتجاه — كلّها مكثّفة في [`apps/daemon/src/prompts/discovery.ts`](apps/daemon/src/prompts/discovery.ts) و [`apps/daemon/src/prompts/directions.ts`](apps/daemon/src/prompts/directions.ts). |
| [**`op7418/guizang-ppt-skill`**][guizang] | skill Magazine-web-PPT المضمَّن حرفياً تحت [`skills/guizang-ppt/`](skills/guizang-ppt/) مع الحفاظ على LICENSE الأصلية. الافتراضي لوضع deck. ثقافة checklist بمستويات P0/P1/P2 مستعارة لكل skill أخرى. |
| [**`multica-ai/multica`**](https://github.com/multica-ai/multica) | معمارية الـ daemon + adapter. اكتشاف الوكلاء بمسح PATH، الـ daemon المحلي بوصفه العملية المميَّزة الوحيدة، ورؤية "الوكيل كزميل فريق". نتبنّى النموذج، لا نضمّ الكود. |
| [**`OpenCoworkAI/open-codesign`**][ocod] | أوّل بديل مفتوح المصدر لـ Claude-Design، وأقرب أقراننا. أنماط UX المُتبنّاة: حلقة الـ artifact المتدفّقة، معاينة iframe المعزولة (مع React 18 + Babel مضمّنين)، لوحة الوكيل الحيّة (todos + tool calls + قابلة للمقاطعة)، قائمة التصدير بخمس صيغ (HTML/PDF/PPTX/ZIP/Markdown)، مركز تخزين محلي أوّلاً، حقن الذوق عبر `SKILL.md`، والتمرير الأوّل لتعليقات comment-mode على المعاينة. أنماط UX لا تزال على roadmap لدينا: موثوقية surgical-edit الكاملة ولوحة tweaks يطلقها الذكاء. **نتعمّد عدم ضمّ [`pi-ai`][piai]** — open-codesign يحزمه كـ agent runtime؛ نحن نفوّض لأيّ CLI لدى المستخدم. |
| [`VoltAgent/awesome-claude-design`][acd] / [`awesome-design-md`][acd2] | مصدر مخطّط `DESIGN.md` ذي 9 أقسام و70 نظام منتج مستوردة عبر [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts). |
| [`bergside/awesome-design-skills`][ads] | مصدر 57 design skill أُضيفت مباشرة كملفات `DESIGN.md` مُطبَّعة تحت `design-systems/`. |
| [`farion1231/cc-switch`](https://github.com/farion1231/cc-switch) | الإلهام لتوزيع skills قائم على symlink عبر CLI وكلاء متعدّدين. |
| [Claude Code skills][skill] | اصطلاح `SKILL.md` متبنّى حرفياً — أيّ skill من Claude Code تُسقط في `skills/` ويلتقطها الـ daemon. |

تدوينة provenance طويلة — ما نأخذه من كل واحد، وما نتعمّد عدم أخذه — في [`docs/references.md`](docs/references.md).

## Roadmap

- [x] Daemon + اكتشاف الوكلاء (16 CLI adapter) + سجلّ skills + كتالوج أنظمة التصميم
- [x] تطبيق ويب + chat + نموذج أسئلة + منتقي 5 اتجاهات + تقدّم todo + معاينة معزولة
- [x] 31 skill + 72 نظام تصميم + 5 اتجاهات بصرية + 5 إطارات أجهزة
- [x] مشاريع · محادثات · رسائل · tabs · قوالب مدعومة بـ SQLite
- [x] بروكسي BYOK متعدّد المزوّدين (`/api/proxy/{anthropic,openai,azure,google}/stream`) مع حماية SSRF
- [x] استيراد ZIP من Claude Design (`/api/import/claude-design`)
- [x] بروتوكول sidecar + سطح مكتب Electron مع أتمتة IPC (STATUS / EVAL / SCREENSHOT / CONSOLE / CLICK / SHUTDOWN)
- [x] API لفحص Artifact + بوابة pre-emit للتقييم الذاتي خماسي الأبعاد
- [ ] تعديلات comment-mode الدقيقة — جزء جاهز: تعليقات عناصر المعاينة ومرفقات الـ chat؛ patching دقيق موثوق لا يزال قيد العمل
- [ ] UX لوحة tweaks يطلقها الذكاء — لم تُنفَّذ بعد
- [ ] وصفة نشر Vercel + tunnel (Topology B)
- [ ] أمر واحد `npx od init` لإنشاء مشروع بـ `DESIGN.md`
- [ ] متجر skills (`od skills install <github-repo>`) وسطح CLI `od skill add | list | remove | test` (مسوَّد في [`docs/skills-protocol.md`](docs/skills-protocol.md)، التنفيذ معلَّق)
- [x] حزمة Electron من `apps/packaged/` — تنزيلات macOS (Apple Silicon) و Windows (x64) على [open-design.ai](https://open-design.ai/) و [صفحة إصدارات GitHub](https://github.com/nexu-io/open-design/releases)

تسليم بمراحل → [`docs/roadmap.md`](docs/roadmap.md).

## الحالة

هذا تنفيذ مبكّر — الحلقة المغلقة (اكتشاف → اختيار skill + نظام تصميم → chat → تحليل `<artifact>` → معاينة → حفظ) تعمل من البداية إلى النهاية. مكدّس البرومبت ومكتبة الـ skills هما حيث تكمن معظم القيمة، وهما مستقرّان. واجهة المستخدم على مستوى المكوّنات تُشحن يومياً.

## أعطنا ★

<p align="center">
  <a href="https://github.com/nexu-io/open-design"><img src="docs/assets/star-us.png" alt="Star Open Design on GitHub — github.com/nexu-io/open-design" width="100%" /></a>
</p>

إن وفّر هذا عليك ثلاثين دقيقة — أعطه ★. النجوم لا تدفع الإيجار، لكنها تخبر المصمّم والوكيل والمساهم القادم أن هذه التجربة تستحقّ انتباههم. نقرة واحدة، ثلاث ثوانٍ، إشارة حقيقية: [github.com/nexu-io/open-design](https://github.com/nexu-io/open-design).

## المساهمة

Issues و PRs و skills جديدة وأنظمة تصميم جديدة، كلّها مرحَّب بها. أعلى المساهمات أثراً عادةً تكون مجلّداً واحداً، أو ملف Markdown واحداً، أو adapter بحجم PR:

- **أضِف skill** — ضع مجلّداً في [`skills/`](skills/) متّبعاً اصطلاح [`SKILL.md`][skill].
- **أضِف نظام تصميم** — ضع `DESIGN.md` في [`design-systems/<brand>/`](design-systems/) باستخدام مخطّط 9 أقسام.
- **اربط CLI وكيل برمجة جديد** — مدخل واحد في [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts).

الجولة الكاملة، حدّ الدمج، أسلوب الكود، وما لا نقبله → [`CONTRIBUTING.md`](CONTRIBUTING.md) ([Deutsch](CONTRIBUTING.de.md)، [Français](CONTRIBUTING.fr.md)، [简体中文](CONTRIBUTING.zh-CN.md)).

## المساهمون

شكراً لكلّ من ساعد في دفع Open Design للأمام — بكود، بوثائق، بملاحظات، بـ skills جديدة، بأنظمة تصميم جديدة، أو حتى بـ issue حادّة. كلّ مساهمة حقيقية تهمّ، والجدار أدناه أسهل طريقة لقول ذلك علناً.

<a href="https://github.com/nexu-io/open-design/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=nexu-io/open-design&cache_bust=2026-05-10" alt="Open Design contributors" />
</a>

إن شحنت أوّل PR — مرحباً. تصنيف [`good-first-issue`](https://github.com/nexu-io/open-design/labels/good-first-issue) هو نقطة الدخول.

## نشاط المستودع

<picture>
  <img alt="Open Design — repository metrics" src="docs/assets/github-metrics.svg" />
</picture>

يُعاد توليد SVG أعلاه يومياً عبر [`.github/workflows/metrics.yml`](.github/workflows/metrics.yml) باستخدام [`lowlighter/metrics`](https://github.com/lowlighter/metrics). أطلق تحديثاً يدوياً من تبويب **Actions** إن أردته أسرع؛ لإضافات أغنى (traffic، follow-up time)، أضف سرّ مستودع `METRICS_TOKEN` بـ PAT دقيق التحكّم.

## تاريخ النجوم

<a href="https://star-history.com/#nexu-io/open-design&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&theme=dark&cache_bust=2026-05-10" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-10" />
    <img alt="Open Design star history" src="https://api.star-history.com/svg?repos=nexu-io/open-design&type=Date&cache_bust=2026-05-10" />
  </picture>
</a>

إن انحنى المنحنى صعوداً، فتلك الإشارة التي نبحث عنها. ★ هذا المستودع لتدفعه.

## شكر وتقدير

عائلة skills HTML PPT Studio — الـ master [`skills/html-ppt/`](skills/html-ppt/) والأغلفة لكل قالب تحت [`skills/html-ppt-*/`](skills/) (15 قالب deck كامل، 36 ثيم، 31 layout صفحة واحدة، 27 حركة CSS + 20 canvas FX، runtime لوحة المفاتيح، ووضع magnetic-card presenter) — مدمجة من المشروع المفتوح [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill) (MIT). LICENSE المصدر يُشحن داخل الشجرة في [`skills/html-ppt/LICENSE`](skills/html-ppt/LICENSE) وتعود نسبة التأليف لـ [@lewislulu](https://github.com/lewislulu). كل بطاقة Examples لكل قالب (`html-ppt-pitch-deck`، `html-ppt-tech-sharing`، `html-ppt-presenter-mode`، `html-ppt-xhs-post`، …) تفوّض إرشاد التأليف للـ master skill ليُحفظ سلوك المصدر prompt → output من البداية للنهاية عند ضغط **Use this prompt**.

تدفّق deck الأفقي / المجلّة تحت [`skills/guizang-ppt/`](skills/guizang-ppt/) مدمج من [`op7418/guizang-ppt-skill`](https://github.com/op7418/guizang-ppt-skill) (MIT). نسبة التأليف لـ [@op7418](https://github.com/op7418).

## الترخيص

Apache-2.0. تحتفظ `skills/guizang-ppt/` المضمَّنة بترخيصها الأصلي [LICENSE](skills/guizang-ppt/LICENSE) (MIT) ونسبة التأليف لـ [op7418](https://github.com/op7418). تحتفظ `skills/html-ppt/` المضمَّنة بترخيصها الأصلي [LICENSE](skills/html-ppt/LICENSE) (MIT) ونسبة التأليف لـ [lewislulu](https://github.com/lewislulu).

[cd]: https://x.com/claudeai/status/2045156267690213649

</div>
