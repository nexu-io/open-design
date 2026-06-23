🎨 **`141 PRs` · `50 contributors` · `2 days`** — **The all-in-one Agentic design workspace.** 0.9.0 put the AI engine in everyone's hands; 0.10.0 makes Open Design the only window a designer needs open. The whole craft now lives in one place — go from a vague idea to discovering references, gathering raw material, editing interactively, queuing notes, polishing motion and animation, and handing the result off to an editor or a Code Agent for production — **without leaving the app.** And because you can fire comments into a queue, run several sessions at once, and gather assets in parallel, it stops feeling like one assistant and starts feeling like **a whole local design team working for you.** 🚀

## 🔥 Highlights

- 🎨 **The design workspace — one window for the whole craft.** The centerpiece of 0.10.0: a single, sprawling consolidation (211 files, +36k lines) that turns the project view into a real all-in-one studio. A **Lexical-powered composer** makes `@mentions` atomic pills with caret-anchored mention/slash popovers; **interactive terminals** run a session right beside the chat; **comments carry drag-and-drop image and note attachments**; a **browser-style reference board** with page capture pulls external references straight into a project; and you can **fork a conversation** from any message. Discover, gather, edit, and review without ever switching tools. (#3516) Thanks `@pftom`.
- 💬 **Comment at the speed of thought — into a queue.** Fire preview comments while a run is still going; they queue, deck markers pin in place, and nothing blocks on the previous turn finishing. (#3314, #3347) Thanks `@CtriXin`, `@zoeforfun`.
- 🗂️ **Bring your own models — and gather material in parallel.** A full BYOK pass lands: validate API keys in the field, draft-validate before saving, prefer models fetched live from your account, and track configuration outcomes — across providers, with several sessions pulling assets at once. (#3506, #3484, #3510, #3505, #3564) Thanks `@zoeforfun`.
- 🧭 **Idea → discovery, with the questions out of your way.** Discovery questions move into a dedicated right-side Questions tab and are skipped entirely for unmodified example prompts, and generation now streams **staged preview feedback** so you watch the design take shape instead of waiting on a black box. (#3355, #3257, #3227) Thanks `@elihahah666`, `@zoeforfun`.
- ✏️ **Interactive editing that stays put.** The manual-edit inspector pins instead of flickering on hover, the edit canvas fills the full height, and the composer caret finally lines up with the mention overlay. (#3438, #3398, #3392) Thanks `@zoeforfun`, `@daltonnyx`, `@portseif`.
- 🎞️ **Polish and motion across the product.** Product-wide UI animations replace hard snaps with intentional motion, and the chat surface gets a full visual overhaul with a live-streaming code card. (#3294, #3382) Thanks `@elihahah666`.
- 🤝 **Hand off to an editor or a Code Agent for production.** A sandbox runtime foundation, run-scoped MCP tool bundles, a project export manifest, and contained project preview URLs lay the groundwork for taking a design out of the studio and into real business production — and the editor hand-off now performs a real reveal instead of a dead end. (#3242, #3244, #3245, #3246, #2494) Thanks `@dredozubov`, `@leessju`.
- 🩺 **When a run goes wrong, you can see why.** Identifiable generation-failure causes with contextual recovery, run-failure classification with Langfuse correlation, prompt-stack diagnostics, and safe-retry policy contracts turn mystery failures into something you can actually trace. (#3397, #3412, #3557, #3569) Thanks `@zoeforfun`, `@yinjialu`, `@Siri-Ray`.
- 🧩 **A front door for the team and the community.** The community page splits into a hub plus Contributors / Ambassadors / Moderators, a refreshed homepage hero lands, and a new `/download` page auto-reflects the latest release. (#3491, #3444, #3538) Thanks `@leilei926524-tech`, `@LeonWang-52`, `@522700967-wq`.
- ⚡ **Lighter, faster landing.** Hero decorations route through Image Resizing for ~92% smaller payloads. (#3523) Thanks `@lefarcen`.
- 🔒 **Security.** Resolved a vulnerable `tmp` transitive dependency. (#3379) Thanks `@gateway`.

> 📥 **Download:** assets for `open-design-v0.10.0` are built by the prerelease pipeline and publish to GitHub Releases and `releases.open-design.ai` — macOS arm64/Intel `.dmg`, Windows x64 installer — when the build completes.

## ✨ Added

### 🎨 Studio, editing & canvas
- **Product-wide UI animations.** (#3294) Thanks `@elihahah666`.
- **Revamped chat UI with a live-streaming code card.** (#3382) Thanks `@elihahah666`.
- **The design workspace** (211 files, +36k lines): a Lexical composer with atomic `@mention` pills, interactive terminals beside the chat, drag-and-drop comment attachments, a browser reference board with page capture, conversation forking, and a shared tooltip system — backed by new `terminals` / `community` / `social-share` contracts and SQLite migrations. (#3516) Thanks `@pftom`.
- **Staged preview feedback** during generation. (#3227) Thanks `@zoeforfun`.
- **Pinned manual-edit inspector** instead of hover-switching. (#3438) Thanks `@zoeforfun`.

### 🔑 BYOK, models & media
- **In-field BYOK API-key validation**, **draft validation**, **fetched account models**, and **configuration-outcome tracking.** (#3506, #3484, #3510, #3505) Thanks `@zoeforfun`.
- **MMS redesign workflow** in the CLI. (#3311) Thanks `@CtriXin`.

### 🧠 Agents, runtimes & sandbox
- **Sandbox runtime foundation**, **run-scoped MCP tool bundles**, **project export manifest**, and **contained project preview URLs.** (#3242, #3244, #3245, #3246) Thanks `@dredozubov`.
- **`od templates` CLI subcommand** for user-saved templates. (#2428) Thanks `@YOMXXX`.
- **Reference design contract** skill and a new **Hallmark** community skill. (#3321, #3479) Thanks `@CtriXin`, `@Tuola-waj`.

### 🏠 Home, projects & landing
- **Help menu Contact / Report / Discord links** on desktop. (#3284) Thanks `@lefarcen`.
- **Platform-aware direct-download CTAs**, **`/download` page** that auto-reflects the latest release, and a **refreshed homepage hero** with new logo and statue collage. (#3402, #3538, #3444) Thanks `@elihahah666`, `@522700967-wq`, `@LeonWang-52`.
- **AMR header entry** on landing. (#3385) Thanks `@jinmeihong0201-gif`.
- **Community hub** with Contributors / Ambassadors / Moderators sub-pages. (#3491) Thanks `@leilei926524-tech`.
- **Configurable project locations.** (#2041) Thanks `@coconilu`.

### 📊 Diagnostics & reliability
- **Identifiable generation-failure cause with contextual recovery.** (#3397) Thanks `@zoeforfun`.
- **Run-failure classification with Langfuse correlation**, **prompt-stack diagnostics**, and **safe-retry policy contracts.** (#3412, #3557, #3569) Thanks `@yinjialu`, `@Siri-Ray`.
- **Launch-review regression coverage** and **expanded project + onboarding coverage.** (#3300, #3513) Thanks `@AmyShang-alt`.

### ☁️ Deployment & docs
- **Production-ready CloudFormation template**, **Azure Container Instances guide**, and **Alibaba Cloud (阿里云) deployment guide**, with the Docker section synced across all translated READMEs. (#3011, #3163, #3275, #3228) Thanks `@shaarron`, `@shivam2931120`, `@crimsondhaks`, `@RoverKai`.

## 🔁 Changed

- **Simplified BYOK settings flow** and extracted BYOK settings fields. (#3564, #3480) Thanks `@zoeforfun`.
- **Skip discovery questions for unmodified example prompts.** (#3257) Thanks `@elihahah666`.
- **Refactors:** shared web UI primitives (#2879) and the project chrome header consolidated into the workspace rows (#3447). Thanks `@mrcfps`, `@elihahah666`.
- **Studio share-menu hierarchy** fixed up. (#3266) Thanks `@zoeforfun`.
- **AMR engine** bumped to vela-cli 0.0.10. (#3577) Thanks `@alchemistklk`.
- **Editor polish via Codex:** inline color swatches for hex output, reduced composer input lag, centered home wordmark, hidden placeholder cost values, and workspace tabs aligned to the shell edge. (#3467, #3466, #3472, #3498, #3501) Thanks `@Sid-Qin`.

## 🐛 Fixed

### 🎨 Editing, preview & comments
- **Queue preview comments during runs** and pin deck markers while busy. (#3314, #3347) Thanks `@CtriXin`, `@zoeforfun`.
- **Preserve preview scroll across tools**, **cross-origin-safe draw scroll**, and **full-height manual-edit canvas.** (#3313, #3312, #3398) Thanks `@CtriXin`, `@daltonnyx`.
- **Composer caret alignment** with the mention overlay, **no caret reset** on tools-menu mousedown, and **keep the pet composer menu expanded.** (#3392, #3368, #3336) Thanks `@portseif`, `@estelledc`, `@ramarivera`.
- **Remove design-file mentions with chips**, **prune draft tokens** when the chip strip clears, and **insert skill references** from the tools panel. (#3204, #3356, #3220) Thanks `@mturac`, `@estelledc`, `@xxiaoxiong`.
- **IME Enter key** trusts `compositionEnd` over `isComposing`, and **dismissed todo-card state persists** across tab switches. (#3432, #3515) Thanks `@xxiaoxiong`.
- **Harden image export downloads** and **send Anthropic proxy image attachments.** (#3318, #3273) Thanks `@RyanCheng77`.

### 🧠 Agents, runtimes & daemon
- **Confine sandbox project roots and host discovery** and **harden sandbox orchestration chokepoints.** (#3243, #3420) Thanks `@dredozubov`.
- **Surface OpenCode usage-limit / provider failures** instead of bare timeouts, **deliver OpenCode memory extraction on stdin**, and **raise the OpenCode model-list timeout to 15s.** (#3316, #3238, #3394) Thanks `@whoughton`, `@Felipe2077`.
- **Normalize cumulative ACP message chunks**, **tolerate multiline ACP startup**, **dedupe Claude stream wrappers**, and **surface Pi turn errors.** (#3333, #3363, #3334, #3349) Thanks `@ramarivera`, `@mturac`, `@RyanCheng77`.
- **Finalize canceled daemon runs**, **validate `skillId` against the runtime source-of-truth**, and **allow a Codex sandbox override.** (#3364, #3293, #3288) Thanks `@alucero270`, `@YOMXXX`, `@YUHAO-corn`.
- **Handle Gemini stream-json tool events**, **capture Antigravity diagnostic logs**, and **harden local CLI prompt routing.** (#3457, #3395, #3452) Thanks `@YOMXXX`, `@AriaShishegaran`.
- **Detect and terminate fabricated role markers** across all agent paths. (#3303) Thanks `@JasonBroderick`.

### 🏠 Web, landing & platform
- **Preserve newly created project routes**, **persist design-files view state across navigation**, and **preserve bulk-edit file paths.** (#2159, #2303, #3475) Thanks `@bulai0408`, `@neogenix`, `@PerishCode`.
- **Remove stray overlay icons** from card variants and the HomeHero example card, **truncate long filenames / project names**, and **theme the home-hero select menu.** (#3453, #3369, #3370, #3317, #3309) Thanks `@israad1`, `@estelledc`, `@YOMXXX`, `@CtriXin`.
- **Real hand-off reveal** when there are no editors, and a **harder Comment-scope constraint.** (#2494, #2796) Thanks `@leessju`.
- **Search mise shim dirs** so mise-installed CLIs are detected, **route `shell:open-path` through explorer.exe on WSL**, **discover the tools-dev daemon URL**, and **link the `od` bin after a fresh install.** (#3319, #3298, #2807, #2069) Thanks `@ramarivera`, `@YOMXXX`, `@VIVAAN-DHAWAN`, `@bulai0408`.
- **Localize scheduled-routine empty-output errors**, **show cumulative conversation duration**, and **keep auth redirects on the AMR wallet.** (#3022, #3354, #3449) Thanks `@leno23`, `@Lanzhou3`, `@lefarcen`.
- **Protect BYOK provider model-cache keys**, **hide OpenAI OAuth-only image credentials**, and **explain the Composio custom-auth requirement.** (#3286, #3308, #3464) Thanks `@YUHAO-corn`, `@CtriXin`, `@bulai0408`.
- **Self-contained Dockerfile** (stage-2 asset copies moved into the build stage) and **bound DB param** for design-system tool routes. (#3350, #3418) Thanks `@chasekafei`, `@justasdev`.
- **Align the homepage footer Plugins column** with the nav and **301 legacy `/skills` `/systems` `/templates` to `/plugins`.** (#3437, #3352, #3386) Thanks `@522700967-wq`.

## 🙏 Thanks to everyone who shipped 0.10.0

`@2YoungKim` · `@522700967-wq` · `@AmyShang-alt` · `@AriaShishegaran` · `@CtriXin` · `@Felipe2077` · `@JasonBroderick` · `@Lanzhou3` · `@LeonWang-52` · `@PerishCode` · `@RoverKai` · `@RyanCheng77` · `@Sid-Qin` · `@Siri-Ray` · `@Tuola-waj` · `@VIVAAN-DHAWAN` · `@YOMXXX` · `@YUHAO-corn` · `@alchemistklk` · `@alucero270` · `@bulai0408` · `@chasekafei` · `@coconilu` · `@crimsondhaks` · `@daltonnyx` · `@dredozubov` · `@elihahah666` · `@estelledc` · `@gateway` · `@israad1` · `@jinmeihong0201-gif` · `@justasdev` · `@leessju` · `@lefarcen` · `@leilei926524-tech` · `@leno23` · `@mrcfps` · `@mturac` · `@neogenix` · `@nettee` · `@pftom` · `@portseif` · `@ramarivera` · `@sdanpo` · `@shaarron` · `@shivam2931120` · `@whoughton` · `@xxiaoxiong` · `@yinjialu` · `@zoeforfun`

_Plus the 0.9.0 release tooling, contributor-wall, and metrics automation that ran in the background._
