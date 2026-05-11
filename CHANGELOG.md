# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.6.0] - 2026-05-09

A connectivity-and-iteration release: Open Design becomes a fully bidirectional MCP citizen (external MCP client with 39 templates), ships **Cloudflare Pages deployment** for generated artifacts (with custom domains), advances Critique Theater to **Phase 6** (interrupt + project-keyed run registry), and lands a redesigned top bar, draggable file tabs, batch delete, **vector PDF export**, **agent-callable research/search**, and **Orbit activity summaries**. Hyperframes learns the HTML-in-Canvas API. New BYOK provider (Ollama Cloud), new agent capabilities (Gemini 3 preview + GPT-5.1 codex picker + DeepSeek v4), new design systems (BMW M, Slack, Cisco, Webex, Mission Control, Urdu Modern), eight new skill bundles, and Turkish + Thai locales. 136 merged PRs since 0.5.0.

### Added

#### MCP, deployment & connectors
- **External MCP client with daemon-managed OAuth and 39 design-focused templates.** Open Design can now consume MCP servers, not just expose itself as one. ([#898])
- **Cloudflare Pages artifact deployment.** One-shot publish of generated artifacts to Pages from the desktop app. ([#729])
- **Cloudflare Pages custom domains.** Bind your own domain to deployed artifacts. ([#851])
- Preserve OAuth state and advertised tool counts when reconnecting MCP/connector providers. ([#1036])
- Optimized Composio connector previews. ([#907])

#### Critique Theater
- **Phase 6.1: critique interrupt endpoint + project-keyed run registry.** Long critiques can now be interrupted cleanly per project. ([#819])
- Shared `CritiqueRoundSummary` / `CritiqueRunStatus` types via the `@open-design/contracts` package. ([#1016])

#### Web / UI
- **Top bar redesign** — Share/Present lifted to the top bar, zoom dropdown, and an explicit focus toggle. ([#1048])
- **Draggable file tab reordering** in the workspace. ([#936])
- **Batch delete for selected design files.** ([#783])
- **Sortable Design Files table columns.** ([#804])
- **Privacy consent choices made explicit** at first launch. ([#1031])
- Differentiated "recent" vs "your designs" sorting. ([#845])
- Inspect / Picker now renders an empty-annotation state instead of a blank panel. ([#1005])
- Toggle to reveal saved media-provider API keys. ([#867])

#### Desktop & artifacts
- **Direct PDF export for artifacts.** ([#532])
- Hyperframes skill learns the **HTML-in-Canvas** API for richer in-canvas previews. ([#852])
- Consolidated Hyperframes video template updates. ([#1079])
- Inspect overlay support on Windows packaged builds. ([#944])
- Allow `od://` URLs through `setWindowOpenHandler` so live-artifact previews open in a child window. ([#933])

#### Daemon, agents & runtime
- **Import existing local folder as a project.** ([#624])
- **Agent-callable research command + `/search`.** Agents can ask the project for grounded research without leaving the chat. ([#615])
- **Orbit activity summaries.** ([#681])
- Finalized the design-package endpoint (closes #450). ([#832])
- Closed pi adapter parity gaps (`imagePaths`, `extraAllowedDirs`, error events, `sendAgentEvent` routing). ([#763])
- Language-boost support for Minimax TTS. ([#773])
- Expose Gemini 3 preview models and Gemini 2.5 Flash Lite in the picker. ([#986])
- Add GPT-5.1 entries to the Codex picker. ([#946])
- Expand Codex picker coverage. ([#757])
- Stable nightly promotion gate for `[codex]`. ([#962])
- `VP_HOME` environment variable support in agent resolution. ([#859])
- Auto-rebuild `better-sqlite3` on Node.js ABI mismatch postinstall. ([#813])
- Increase agent inactivity timeout. ([#1071])
- Reset inactivity watchdog on raw stdout bytes, not just parsed events. ([#976])

#### BYOK & integrations
- **Ollama Cloud** as a BYOK provider. ([#923])
- **Opt-in Langfuse telemetry.** ([#800])
- Make Azure API version optional. ([#941])

#### Skills, design systems & prompt templates
- **`ib-pitch-book` skill** — investment-banking strategic-alternatives pitch book (Anthropic financial-services Pitch Agent port). ([#888])
- **`github-dashboard` skill.** ([#666])
- **`clinical-case-report` skill.** ([#581])
- **`social-media-matrix-tracker` skill** — live-artifact tracker. ([#810])
- **`trading-analysis` live-artifact dashboard skill.** ([#824])
- **`otd-operations-brief` live-artifact template.** ([#794])
- **32 zhangzara HTML deck templates.** ([#704])
- **7 example dashboards + contract demo** for the live-artifact skill. ([#716])
- **`after-hours-editorial` template skill.** ([#1053])
- **`swiss-user-research-video` template skill.** ([#1054])
- **`editorial-burgundy-principles` template skill.** ([#1065])
- **`swiss-creative-mode` template skill.** ([#1068])
- **BMW M design system.** ([#579])
- **Slack design system.** ([#899])
- **Cisco and Webex design systems.** ([#991])
- **Mission Control design system.** ([#858])
- **Urdu Modern (Indus Script) design system.** ([#714])
- Craft `laws-of-ux` module so generated UIs respect working-memory limits. ([#809])
- Craft `typography-hierarchy` and `typography-hierarchy-editorial` rules. ([#975], [#979])

#### Internationalization
- **Turkish README translation.** ([#843])
- **Full Thai (`th`) UI locale.** ([#1018])
- Renamed live-artifact tab label in zh-CN and zh-TW. ([#969])
- Default `id` locale to English for keys not yet translated. ([#822])
- Trim BYOK proxy fallback line from zh-CN intro. ([#915])

#### Packaging & deployment
- **Docker Compose deployment workflow.** ([#65])
- Preserve beta e2e spec reports in R2. ([#812])
- Document the Colima build-swap helper. ([#967])

#### Community
- **Vaunt contributor recognition** (5-tier system). ([#908])

### Changed

- Hardened security scan findings and upgraded dependencies. ([#806])
- Strengthened e2e PR coverage and entry/settings automation coverage. ([#796], [#811])
- Refreshed contributors wall and GitHub metrics. ([#856], [#1004], [#853], [#998])
- Refined `typography-hierarchy` craft docs — clarify edge cases and make lint measurable. ([#979])

### Fixed

#### MCP & connectors
- MCP install snippet survives daemon port changes. ([#846])
- Pin `OD_DATA_DIR` in `/api/mcp/install-info` env so the macOS-packaged MCP server stops EPERM'ing on `.od/projects`. ([#857])
- Reserve clearance for the MCP server Copy button so it stops overlapping the snippet. ([#847])
- Give the MCP server Copy button a solid surface so it reads against the code block. ([#840])
- Stable curated tool count in the connector card badge. ([#767])
- Remove redundant "Connect GitHub" placeholder from the import menu. ([#964])
- Connector "Close window" button always gives feedback. ([#995])
- Confirm before clearing the saved Composio API key. ([#877])
- Keep saved Composio API key indicator visible while typing a replacement. ([#751])
- Confirm before clearing a saved Media provider API key. ([#875])

#### Cloudflare Pages
- Cloudflare Pages custom-domain lookup. ([#958])

#### Web UI
- Surface explicit error/retry state when example preview HTML fails to load. ([#863])
- Confirm before closing a dirty sketch so unsaved strokes are not lost. ([#988])
- Keep chat auto-scroll glued to the bottom across streaming chunks. ([#989])
- Preserve Chat scroll position across Chat/Comments tab switches. ([#841], [#886])
- Differentiate selected, hover, and focus states in the language switcher. ([#987])
- Scroll the active workspace tab into view when the strip overflows. ([#990])
- Keep the Design Files tab visible when workspace tabs scroll. ([#842])
- Wrap long note text inside picker/comment popovers. ([#830])
- Wrap comment-popover action row so the Save/Sending button can't exceed the popover edge. ([#829])
- Prevent comment popover header overflow when the label is too long. ([#833])
- Truncate long Inspect-panel labels so they cannot spill past the panel edge. ([#838])
- Keep Inspect-panel close button on a stable single-line layout. ([#839])
- Increase project meta line-height to prevent descender clipping. ([#834])
- Give the deploy modal primary action more breathing room. ([#992])
- Hide the unsupported "Save comment" button on Pods selections. ([#993])
- Clear stale upload error banner when previewing existing files. ([#994])
- Expand design file row click target. ([#1039])
- Keep entry footer pills compact. ([#1045])
- Hide stale upload error banner when previewing other files. ([#994])
- Scope settings save validation + sanitize payload to the active sidebar section. ([#827])
- Ensure the Settings close button is always clickable. ([#971])
- Correct `srcdoc` injection and deck bridge for JS strings containing closing `</script>`. ([#938])
- Unbreak the Create button on plain HTTP / LAN-IP deployments. ([#900])
- Differentiate recent vs your-designs sorting. ([#845])
- Keep examples filter counts consistent. ([#949])

#### Desktop & packaging
- Cleanly quit the macOS packaged app. ([#422])
- Keep modal controls clickable in drag regions. ([#1032])
- Improve Orbit and packaged data-dir startup errors. ([#1067])
- Fix desktop preview interactions and connector auth feedback. ([#864])
- Fix desktop preview and packaged app interactions. ([#879])
- Fix desktop prompt template close hitbox. ([#1056])
- Pack/win: close detection gaps that let `Open Design.exe` stay locked at install time. ([#823])
- Tools-pack: mark `blake3-wasm` as external in the macOS prebundle. ([#844])
- Packaged: swallow harmless `setTypeOfService EINVAL` from undici. ([#906])

#### Daemon
- Settle completed runs and clean up shutdown children. ([#924])
- Fix stuck chat runs and unintended cancels. ([#896])
- Write SSE events atomically in `createSseResponse.send`. ([#972])
- Media generation task state survives daemon restart (#648). ([#884])
- Sync Orbit last run with the selected prompt template. ([#937])
- Image template creations execute the selected prompt automatically. ([#752])
- Serve Python files as text. ([#947])
- Type-check core server paths and leaf modules. ([#943], [#952])

#### Codex / OpenCode
- OpenCode todowrite footer state. ([#1046])

#### Skills & docs
- Stale internal links across docs. ([#950])

### Documentation

- **Repository-wide code review guidelines.** ([#927])
- **Design system authoring guide.** ([#961])
- **Skills contributing guide.** ([#1035])
- Docker setup instructions in QUICKSTART, CONTRIBUTING, and README. ([#935])
- Re-add `awesome-design-md` reference to QUICKSTART. ([#940])
- Update prompts path from web to daemon in README files. ([#756])

### Internal

- Test: cover model option rendering. ([#948])
- Test: de-flake chat-scroll-preservation across tab switches. ([#886])
- Auto-generated metrics + contributors wall refreshes. ([#853], [#998], [#856], [#1004])
- Release: Open Design 0.5.0 changelog landing. ([#820])

## [0.5.0] - 2026-05-07

A minor release focused on iteration: live-data dashboards graduate to a first-class artifact category, an in-preview Inspect mode lands for per-element style tuning, the desktop launcher gets an accent color theme, Critique Theater advances to Phase 5, and Linux gains headless lifecycle support. New Qoder CLI agent, Nano Banana image provider, and Indonesian locale. 51 merged PRs since 0.4.1, accumulated across 16 beta cycles.

### Added

#### Web / UI
- **Inspect mode** — live per-element style tuning in the HTML preview. ([#362])
- **Accent color control + launcher** — a global accent persists across the desktop launcher and entry view. ([#683])
- **Connection tests for execution settings** — verify provider config without launching a chat. ([#507])
- Replaced the SketchEditor `window.prompt()` text tool with an in-app modal so long prompts stop getting clipped. ([#738])

#### Skills, design systems & prompt templates
- **`live-dashboard` skill** — generic Live Artifact dashboard template. ([#778])
- **`clinic-console` live-artifact template.** ([#795])
- **FlowAI live dashboard template skill.** ([#801])
- **Notion-style team dashboard prompt template (Live Artifact).** ([#799])
- **`waitlist-page` skill.** ([#555])
- **`social-media-dashboard` skill + Totality Festival design system.** ([#678])
- **Five Orbit briefing prompt templates.** ([#671])
- **Craft `form-validation` module** — generated forms follow modern RHF/Zod patterns instead of 2018 Formik habits. ([#625])

#### Critique Theater
- **Phase 5** — panel prompt template + system composer wiring. ([#524])

#### Daemon and agents
- **Qoder CLI** agent adapter. ([#626])
- **Project transcript export to disk** for downstream tools (replay, audit, sharing) — prereq for #450. ([#493])
- Override the Codex executable path for nvm / mise / fnm-installed toolchains. ([#755])
- Codex image projects can use built-in imagegen. ([#622])
- DeepSeek v4 models in the model catalog. ([#722])
- `OD_LEGACY_DATA_DIR` migrator for 0.3.x → 0.4.x data recovery. ([#712])

#### Media generation
- **Nano Banana image provider.** ([#631])
- HyperFrames video previews, provider badge, and source filter on the templates surface. ([#293])

#### Linux & packaging
- **Linux headless lifecycle** — `install` / `start` / `stop` from CLI without a desktop session. ([#686])
- Improved Windows beta packaging and installer flow. ([#768])
- Migrated beta release publishing to R2. ([#805])

#### Internationalization
- **Indonesian (`id`) UI locale.** ([#414])

### Changed

- Project file watcher now ignores `.venv` and other large dirs so Python projects stop overwhelming it. ([#531])
- Daemon CORS whitelist accepts portless `Origin` headers for Chrome compatibility. ([#735])
- Extended OpenAI image request timeouts so larger generations stop being killed mid-flight. ([#788])
- Surfaced the `@nexudotio` X account in README and entry sidebar. ([#696])

### Fixed

#### Daemon and agents
- Delivered Copilot prompts via stdin to avoid Windows `ENAMETOOLONG`. ([#727])
- Surfaced OpenCode error frames; treated empty-output runs as failed instead of silently succeeding. ([#700])
- Discovered toolchain paths for GUI-launched agents on minimal `PATH`. ([#614])

#### Web and desktop
- Removed Tweaks-mode element-selector tooltip noise. ([#697])
- Fixed chat pane overflow. ([#740])
- Narrowed the `ws-tabs-bar` scrollbar so filenames stop overlapping. ([#781])
- Improved settings dialog scroll behavior. ([#667])
- Widened settings subtitle so the English copy fits on one line. ([#747])
- Persisted design system selection across sessions. ([#621])
- Aligned the design system default test fixture. ([#708])
- Showed an alert when the PDF export popup is blocked. ([#664])
- Fixed the Windows link-code-folder dialog. ([#698])
- Made desktop entry chrome consistent. ([#655])

#### Packaging & runtime
- Unbroke Claude Design ZIP import on Node 24 and raised the file ceiling. ([#591])
- Diagnosed missing Next package during `tools-dev` web startup. ([#675])

#### Internationalization
- Aligned `README.es` UI references to the `es-ES.ts` locale. ([#611])
- Fixed Ukrainian prompt template translations and removed duplicate keys. ([#674], [#680])

#### Miscellaneous
- Batched small fixes for [#283], [#275], and [#390]. ([#530])

### Documentation

- Documented the Linux namespace env var in `tools-pack`. ([#670])
- Fixed broken `pi-ai` links after the package split. ([#277])

### Internal

- Added desktop settings + project flow e2e coverage. ([#306])
- CI: notify Discord `#resolved` when issues are closed by a merged PR. ([#685])
- Refreshed generated GitHub metrics SVG and contributors wall. ([#718], [#720])

## [0.4.1] - 2026-05-06

0.4.1 is the startup hotfix for the broken 0.4.0 desktop packages. It restores packaged app startup on macOS and Windows, adds release validation so the failure mode is caught before publication, and includes the small UI, agent, documentation, i18n, and craft updates that landed while the hotfix was being verified.

### Added

#### Web / UI
- **Manual edit mode** for direct artifact edits. ([#620])
- **Cmd/Ctrl+P quick file switcher** for faster project navigation. ([#556])
- Resizable chat panel. ([#563])

#### Daemon and agents
- Added model name to PI initial status and RPC abort on cancel. ([#618])

#### Craft and i18n
- Craft `accessibility-baseline` module with opt-ins for dashboard, HR onboarding, and mobile onboarding. ([#587])
- Craft `rtl-and-bidi` module so artifacts handle Arabic, Hebrew, and Persian content more reliably. ([#595])
- Added i18n structure checks. ([#608])

### Changed

- Updated README first-PR links so `help-wanted` issues are surfaced alongside `good-first-issue`. ([#605])

### Fixed

#### Packaging
- Fixed packaged desktop startup by building `@open-design/contracts` to `dist/*.mjs` + `.d.ts`, pointing its exports at compiled JavaScript, and building contracts before all packaged lanes pack workspace tarballs. ([#577])
- Added packaged runtime beta gating so release candidates install, start, inspect `/api/health`, collect logs, stop, and uninstall before promotion. ([#637])

#### Daemon and agents
- Added the required stdio MCP server env field and recover from `-32602` on `session/set_model`. ([#627])
- Normalized ACP `mcpServers` to the stdio shape for Kimi/Hermes ACP. ([#612])
- Fixed agent CLI configuration and workspace focus mode. ([#604])

#### Web and desktop
- Preserved error messages across conversation reloads. ([#623])
- Kept chat recoverable after conversation load failures. ([#637])
- Honored native macOS quit behavior in the packaged desktop shell. ([#637])

### Documentation

- Documented `OD_DATA_DIR` and migration from `.od/` to the Desktop app. ([#570])
- Added Chinese (Simplified) QUICKSTART. ([#578])
- Backported missing zh-TW README sections from the English README. ([#586])
- Synced and improved the Korean README. ([#619])

### Internal

- Refined release workflows, CI scope, e2e layout, and packaged runtime smoke coverage for beta validation. ([#637])
- Refreshed generated GitHub metrics. ([#592])

## [0.4.0] - 2026-05-05

A multi-protocol leap: Open Design now ships as an MCP server, ships Critique Theater (Design Jury) Phase 4, gains live-reload + Tweaks mode + live artifacts in the preview pane, and adds five new agent / runtime adapters. 71 merged PRs from 40+ contributors over two days. Linux AppImage packaging landed in tooling, but the stable Linux artifact is deferred from 0.4.0 while containerized release packaging is hardened.

### Added

#### MCP & agent integration
- **`od mcp` — expose Open Design as a stdio MCP server.** Coding agents in other repos (Claude Code, Codex, Cursor, VS Code, Antigravity, Zed, Windsurf) can read files from local Open Design projects directly, including the project the user has open in the Open Design app right now. ([#399])
- **Link code folder support for agent context** — point agents at any local code folder alongside the design project. ([#455])
- Kilo CLI (ACP) agent adapter. ([#480])
- DeepSeek TUI agent adapter. ([#439])

#### Critique workflow
- **Critique Theater Phase 4** — persistence, transcript, and orchestrator. The "Design Jury" multi-panelist scoring pipeline is now end-to-end. ([#481])
- Critique Theater foundation — shared contracts and streaming v1 parser (Phases 0–2). ([#387])

#### Preview pane
- **Live-reload preview iframes** when project files change on disk. ([#409])
- **Tweaks mode for HTML previews** — element picker, pod selection, batched chat attachments. ([#513])
- URL-load HTML preview iframes by default (`?forceInline=1` opt-out). ([#384])
- **Live artifacts and Composio connector catalog.** ([#381])

#### Packaging & deployment
- **Linux x64 AppImage tooling** in `tools-pack`; stable release artifact deferred from 0.4.0 while the containerized packaging lane is hardened. ([#369])
- Optimize packaged mac artifact size. ([#424])

#### Daemon
- `OD_MEDIA_CONFIG_DIR` to relocate `media-config.json` (Nix store, immutable images, sandboxes). ([#411])
- Modernized multi-provider API proxy routing (Anthropic, OpenAI-compatible, Azure OpenAI, Google Gemini). ([#385])
- Seed daemon with pre-baked decks and web prototypes. ([#457])

#### Skills, design systems & prompt templates
- **Atelier Zero** editorial collage landing-page design system. ([#366])
- `open-design-landing` rename, **kami skill bundle**, and landing OG assets. ([#428])
- Craft `animation-discipline` module + opt-ins on mobile-app, mobile-onboarding, gamified-app. ([#515])
- Craft `state-coverage` module + opt-ins on dashboard, mobile-app, kanban-board. ([#502])

#### Web / UI
- Skills & design systems management page in Settings. ([#535])

#### Design Files
- Batch ZIP download with multi-select. ([#405])

#### Internationalization
- Complete **French** localization, README, and Quickstart. ([#326], [#397], [#434])
- **Ukrainian** UI localization. ([#395])
- **Russian** UI locale refresh + README + gallery metadata. ([#393], [#396])
- Brazilian Portuguese README translation. ([#460])
- Arabic README translation. ([#458])

### Changed

- Refactor `RUNTIME_DATA_DIR` resolution logic. ([#391])
- Update Codex sandbox invocation. ([#477])

### Fixed

#### Security
- Bind daemon to localhost by default + origin validation. ([#365])
- Strip `ANTHROPIC_API_KEY` when spawning Claude Code. ([#400])
- Preserve `ANTHROPIC_API_KEY` when `ANTHROPIC_BASE_URL` is set. ([#514])
- Preserve `*_API_KEY` env vars for CLI agents in packaged builds. ([#404])
- Normalize daemon proxy origins. ([#392])

#### Daemon
- Resolve daemon `package.json` from any compiled layout so the packaged app reports the correct version. ([#537])
- Correct Claude Code `--add-dir` capability detection. ([#440])
- Handle ACP `-32603` errors gracefully in `session/set_model`. ([#492])
- Expose skill resources via cwd-relative aliases. ([#435])
- Support nested paths in project file serve route. ([#401])
- Respect baseUrl path verbatim in OpenAI-compat proxy. ([#410])

#### Web UI
- Prevent vertical scrollbar on artifact preview frame. ([#453])
- Prevent vertical scrollbar on `ws-tabs-bar`. ([#448])
- Language option button height truncation in Settings. ([#447])
- Aspect-ratio cards no longer overflow into siblings. ([#476])
- Add copy buttons for FileViewer code blocks. ([#471])
- Lowercase `todowrite` compatibility in ToolCard. ([#523])
- Cap `htmlPreviewSlideState` Map to prevent memory leak. ([#488])
- Isolate preview blob export paths. ([#429])
- Split execution-mode tabs and align active chip visuals. ([#418])
- Tighten entry-tab layout and design-system showcase color picker. ([#412])
- Lift coming-soon tip above sticky tabs and make it readable in dark theme. ([#382])
- Fix file tab wheel scrolling. ([#549])

#### Design Files
- Clear selection on project switch. ([#465])

#### Agents
- Copilot prompt processing with correct command format. ([#466])
- Codex Gemini CLI trust handling. ([#352])

#### Desktop
- Show window on macOS dock activate. ([#270])

#### Packaging
- Bundle prompt templates in packaged desktop resources. ([#417])

#### Landing page
- Deploy with `npm wrangler`. ([#421])

### Documentation

- Discord invite badge in README. ([#504])
- Surface desktop downloads in README. ([#522])
- "Running the Project" section in README. ([#468])
- First-PR link points to /contribute page. ([#494])
- Defer README template-driven generation; capture #195 discussion. ([#403])
- Fix typo in zh-TW README. ([#548])
- Auto-generated metrics SVG and contributors wall refresh. ([#406], [#407], [#489], [#490])

### Internal

- Enforce test directory conventions. ([#496])

## [0.3.0] - 2026-05-03

A fast follow-up to 0.2.0 focused on richer design workflows, packaged-agent reliability, export/deploy flows, and broader internationalization. 39 merged PRs from 25 contributors.

### Added

#### Web / UI
- Pet companion with Codex hatch-pet integration. ([#296])
- Brand design-system cards, thumbnails, and DESIGN.md side-by-side preview. ([#289])
- Per-tool renderer registry for generative UI. ([#282])
- Task completion sound and browser notification. ([#359])

#### Agents & daemon
- Persist code-agent startup state. ([#255])
- Mistral Vibe CLI agent adapter. ([#354])
- Devin for Terminal support. ([#301])
- `OD_BIND_HOST` and `--host` for interface binding. ([#328])

#### Skills & exports
- Taste-skill-derived web prototype and HTML PPT examples. ([#358])
- `pptx-html-fidelity-audit` skill wired into export prompts. ([#307])
- Broader PPTX fidelity script coverage beyond CJK. ([#308])
- Native desktop Save As dialog for `.pptx` downloads. ([#330])
- Export as Markdown from the share menu. ([#345])

#### Deployment
- `/api/projects/:id/deploy/preflight` for pre-upload inspection. ([#320])

#### Internationalization
- Arabic (`ar`) UI locale with RTL layout. ([#316])
- French (`fr`) UI locale. ([#376])

### Fixed

#### Agents, packaged runtime & Windows
- Include `nvm` / `fnm` / `mise` agent CLI bins in packaged PATH. ([#364])
- Detect Codex and Gemini CLIs from user toolchain paths. ([#346])
- Upgrade `better-sqlite3` for Node 24 Windows prebuilt support. ([#357])
- Lead Copilot spawn with `-p -` so prompt-via-stdin is consumed. ([#351])
- Drop literal `-` argv from Codex spawn so prompts deliver via stdin pipe alone. ([#342])
- Wrap `cmd.exe` shim invocations to survive `/s /c` quote stripping. ([#339])

#### Web UI & files
- Download as `.zip` now returns the actual project tree. ([#341])
- Keep Design Files view active after deleting a file. ([#329])
- Scroll workspace tabs in place instead of the window. ([#363])
- Treat inlined script content as literal in FileViewer. ([#343])
- Use response-order matching for bulk upload aggregation. ([#323])
- Serve `.jsx` / `.tsx` with JS-family MIME types so browser loaders accept them. ([#340])
- Fix macOS entry view drag region. ([#373])

#### Daemon & deployment
- Increase project upload limit from 20MB to 200MB. ([#319])
- Bundle and rewrite assets referenced from inline `<style>` blocks and `style=""` attributes. ([#314])

#### Internationalization
- Update locale coverage after main merge. ([#251])
- Add missing `designFiles.showMore` keys to `ar`, `hu`, `ko`, `pl`, and `tr`. ([#335])

### Documentation

- Japanese documentation update. ([#309])
- README contributors wall refresh. ([#360])
- Spelling fixes in CLI comments, spec, and video prompt docs. ([#300])

## [0.2.0] - 2026-05-02

A feature-heavy follow-up to 0.1.0 — dark mode, xAI Grok Imagine media generation, headless deploy mode, OpenClaude fallback, four new locales, and a much richer skill / design-system / prompt-template catalog. 45 merged PRs from 27 contributors.

### Added

#### Web / UI
- Dark mode with system / light / dark toggle. ([#259])
- Visible conversation timestamps. ([#120])
- React artifact output support. ([#121])
- Preview comment attachments. ([#284])

#### Agents & daemon
- Auto-detect OpenClaude as a fallback for Claude Code. ([#263])
- Standardize agent communication via stdin and remove Windows-specific shims. ([#258])

#### Media generation
- xAI Grok Imagine integration covering image, video, and native audio. ([#276])

#### Skills, design systems & prompt templates
- `kami` editorial paper design system with deck starter. ([#226])
- `html-ppt` skill (lewislulu/html-ppt-skill) with 15 per-template Examples cards. ([#193])
- `design-brief` skill with structured I-Lang input format. ([#184])
- Brand-agnostic craft references and Refero-derived lint rules. ([#225])
- 11 HyperFrames video prompt templates and media generation README section. ([#227])
- Three Kingdoms ARPG Seedance 2.0 video templates (3). ([#212])
- Three Kingdoms ARPG gameplay screenshot templates (3). ([#207])
- Otaku-dance choreography breakdown infographic template. ([#209])
- Anime fighting game screenshot template. ([#208])

#### Deployment & tooling
- `--prod` flag and `OD_HOST` for headless server deployment in `tools-dev`. ([#222])
- GitHub CI workflow. ([#271])
- Daemon `kindFor` / `mimeFor` file classifier tests. ([#269])

#### Internationalization
- Hungarian (`hu`) UI locale. ([#288])
- Polish (`pl`) UI locale. ([#273])
- Korean (`ko`) UI locale. ([#253])
- Turkish (`tr`) UI locale. ([#233])

### Changed

- Image / video projects now pick from prompt templates (not design systems). ([#192])
- Optimize Electron release artifact size. ([#249])

### Fixed

#### Daemon
- Restore `startServer` Promise contract — return `url` / `{ url, server }`. ([#268])
- Emit `tool_use` from `tool_execution_start` in pi-rpc. ([#186])
- Clamp Codex reasoning effort to model-supported values. ([#223])
- Deliver Claude Code prompt via stdin to avoid spawn `E2BIG` / `ENAMETOOLONG`. ([#143])
- Include `package.json` in tarball so packaged app reports correct version. ([#260])
- Treat `.py` files as previewable code in Design Files. ([#261])
- `OD_DAEMON_URL` uses port 0 instead of actual allocated port (now reports the real port). ([#240])
- Quote agent bin path when spawning with `shell:true` on Windows. ([#232])
- Make `max_tokens` configurable. ([#78])

#### Web UI
- Suppress hydration warning on `<body>`. ([#248])
- Fix language dropdown overflow in Settings modal. ([#281], [#287])
- Add scroll to Settings language menu when it overflows view. ([#247])
- Preserve deck preview pagination per file. ([#119])
- Fix deck preview pagination controls. ([#112])

#### Cross-platform
- Use junction instead of dir symlink on Windows in `tools-dev`. ([#231])

#### Internationalization
- Replace hardcoded `Claude` with `助手` in zh-TW assistant role copy. ([#262])

### Documentation

- Traditional Chinese (繁體中文) README. ([#194])

### Internal

- Auto-generated metrics SVG updates. ([#228], [#241])
- Fix metrics workflow protected branch updates. ([#219])

## [0.1.0] - 2026-05-01

First public release of Open Design — a local-first, open-source alternative to Anthropic's Claude Design. It detects your installed code-agent CLI, runs design skills against curated design systems, and streams artifacts into a sandboxed in-app preview.

### Added

#### Agent runtimes & providers
- Multi-agent runtime detection and dispatch: Claude Code, Codex, Cursor, Gemini CLI, OpenCode, Qwen, GitHub Copilot CLI, Hermes, Kimi CLI, Pi, and Kiro. ([#28], [#71], [#117], [#185])
- Per-CLI model picker for local agents. ([#14])
- OpenAI-compatible provider support and Anthropic-compatible stream proxy for non-native providers. ([#80], [#180])
- App version awareness shared across daemon and web. ([#204])

#### Skills, design systems & prompt templates
- 72 brand-grade design systems and 31 composable skills, including Xiaohongshu and Replit Deck (8 themes). ([#24], [#74])
- 57 DESIGN.md specs imported from awesome-design-skills. ([#92])
- Dance storyboard and ancient-China MMO HUD prompt templates. ([#187])

#### Artifacts & preview
- Artifact platform foundation with sandboxed in-app preview. ([#68])
- First-class SVG and Markdown artifact renderers / viewer. ([#73], [#177])
- HTML preview support for relative-asset references. ([#156])
- Document preview support for uploaded files and multi-file design uploads. ([#31], [#63])
- Claude Design `.zip` import. ([#46])
- Image / video / audio media surfaces with unified `od media generate` dispatcher. ([#12])

#### Packaging & deployment
- Mac arm64 packaged runtime with signed/notarized DMG + update ZIP and beta release flow. ([#170])
- Windows x64 NSIS installer (unsigned beta) and release assets. ([#191])
- Vercel self-deploy flow with `vercel.json` configuration. ([#167], [#169])

#### Internationalization
- UI locales: zh-CN, zh-TW, en, ja, de, es-ES, ru, fa, pt-BR. ([#79], [#80], [#155], [#159], [#182], [#190], [#197])
- Improved language switcher UI. ([#107])

#### Developer experience & tools
- `tools-dev` / `tools-pack` workspace tooling for development and packaging, with native addon diagnostics and improved web startup flow. ([#127], [#128], [#153])
- `dev:all` auto-switches to a free port when defaults are busy. ([#9])
- UI end-to-end automation suite and reporting under `apps/e2e`. ([#64], [#102])
- Frontend toolchain migrated from Vite to Next.js 16 App Router. ([#66])
- Project code migrated to TypeScript with shared contracts. ([#118])
- Refreshed desktop integration control plane. ([#123])
- Star-us prompt to surface GitHub repo. ([#5])

### Fixed

#### Stability & reliability
- Chat runs survive web reconnects. ([#146])
- Daemon project-root resolution when launched from src via tsx. ([#162])
- SSE keepalive behind nginx. ([#111])
- Standalone pnpm binary supported in postinstall; install toolchain pinned. ([#35], [#151])
- Surface unfinished todo runs in chat. ([#76])

#### Cross-platform / Windows
- Spawn agents via resolved absolute path on Windows. ([#13])
- Deliver prompts via stdin for non-Claude agents to avoid `spawn ENAMETOOLONG`. ([#15])
- Mitigate Windows `ENAMETOOLONG` and fix daemon crash on cleanup. ([#75])
- Fix `PROMPT_TEMP_FILE()` call and Claude Code stdin delivery on Windows. ([#97])
- Normalize web dev tsconfig paths on Windows for `tools-dev`. ([#174])
- Support Claude Code CLI <1.0.86 (avoid `--include-partial-messages`, parse assistant wrapper text). ([#34])

#### Daemon & providers
- CORS header on raw project file endpoint. ([#140])
- Preserve non-ASCII filenames on multipart upload. ([#166])
- Stop passing literal dash to `cursor-agent`. ([#160])
- Non-interactive permissions for agent CLIs in web UI. ([#26])
- Codex plugin disable env. ([#133])
- Codex assistant agent labels. ([#70])

#### Web UI
- Welcome dialog: stop overwriting user's agent pick on Save. ([#4])
- Allow Claude Code to read skill seeds and design-system specs. ([#7])
- Question form checkbox selection limits enforced. ([#81])
- SettingsDialog content overflow + scrolling, refactored layout and modal styling. ([#83], [#88])
- Duplicate `H.` heading in `discovery.ts` (→ `I.`). ([#87])
- guizang-ppt: sync host slide counter on transform-paginated decks. ([#19])
- Toolbar button text wrapping prevented for CJK languages. ([#178])
- PreviewModal exits fullscreen on first Esc. ([#168])
- Dev indicator moved to bottom-right corner. ([#108])
- Design Files: align upload picker with dropzone, neutral agent copy, remove unsupported Figma copy. ([#199], [#200], [#201])
- Web locale registry test includes Japanese. ([#202])

### Documentation

- README refresh with stats, agents, skills, and metrics workflow. ([#173])
- Korean (한국어) and Japanese README and docs translations. ([#105], [#183])
- `TRANSLATIONS.md` i18n contribution guide. ([#196])
- Refresh environment setup guidance. ([#104])
- Xiaohongshu design-system docs review feedback. ([#54])

### Internal

- Initial project structure, project rename "Open Claude Design" → "Open Design", naming optimization. ([#1], [#2])
- Initial AGENTS.md and OpenCode agent instructions. ([#114])
- Beta release workflow placeholder. ([#36])
- Git commit co-author policy. ([#131])

[Unreleased]: https://github.com/nexu-io/open-design/compare/open-design-v0.5.0...HEAD
[0.5.0]: https://github.com/nexu-io/open-design/releases/tag/open-design-v0.5.0
[0.4.1]: https://github.com/nexu-io/open-design/releases/tag/open-design-v0.4.1
[0.4.0]: https://github.com/nexu-io/open-design/releases/tag/open-design-v0.4.0
[0.3.0]: https://github.com/nexu-io/open-design/releases/tag/open-design-v0.3.0
[0.2.0]: https://github.com/nexu-io/open-design/releases/tag/open-design-v0.2.0
[0.1.0]: https://github.com/nexu-io/open-design/releases/tag/open-design-v0.1.0

[#1]: https://github.com/nexu-io/open-design/pull/1
[#2]: https://github.com/nexu-io/open-design/pull/2
[#4]: https://github.com/nexu-io/open-design/pull/4
[#5]: https://github.com/nexu-io/open-design/pull/5
[#7]: https://github.com/nexu-io/open-design/pull/7
[#9]: https://github.com/nexu-io/open-design/pull/9
[#12]: https://github.com/nexu-io/open-design/pull/12
[#13]: https://github.com/nexu-io/open-design/pull/13
[#14]: https://github.com/nexu-io/open-design/pull/14
[#15]: https://github.com/nexu-io/open-design/pull/15
[#19]: https://github.com/nexu-io/open-design/pull/19
[#24]: https://github.com/nexu-io/open-design/pull/24
[#26]: https://github.com/nexu-io/open-design/pull/26
[#28]: https://github.com/nexu-io/open-design/pull/28
[#31]: https://github.com/nexu-io/open-design/pull/31
[#34]: https://github.com/nexu-io/open-design/pull/34
[#35]: https://github.com/nexu-io/open-design/pull/35
[#36]: https://github.com/nexu-io/open-design/pull/36
[#46]: https://github.com/nexu-io/open-design/pull/46
[#54]: https://github.com/nexu-io/open-design/pull/54
[#63]: https://github.com/nexu-io/open-design/pull/63
[#64]: https://github.com/nexu-io/open-design/pull/64
[#66]: https://github.com/nexu-io/open-design/pull/66
[#68]: https://github.com/nexu-io/open-design/pull/68
[#70]: https://github.com/nexu-io/open-design/pull/70
[#71]: https://github.com/nexu-io/open-design/pull/71
[#73]: https://github.com/nexu-io/open-design/pull/73
[#74]: https://github.com/nexu-io/open-design/pull/74
[#75]: https://github.com/nexu-io/open-design/pull/75
[#76]: https://github.com/nexu-io/open-design/pull/76
[#79]: https://github.com/nexu-io/open-design/pull/79
[#80]: https://github.com/nexu-io/open-design/pull/80
[#81]: https://github.com/nexu-io/open-design/pull/81
[#83]: https://github.com/nexu-io/open-design/pull/83
[#87]: https://github.com/nexu-io/open-design/pull/87
[#88]: https://github.com/nexu-io/open-design/pull/88
[#92]: https://github.com/nexu-io/open-design/pull/92
[#97]: https://github.com/nexu-io/open-design/pull/97
[#102]: https://github.com/nexu-io/open-design/pull/102
[#104]: https://github.com/nexu-io/open-design/pull/104
[#105]: https://github.com/nexu-io/open-design/pull/105
[#107]: https://github.com/nexu-io/open-design/pull/107
[#108]: https://github.com/nexu-io/open-design/pull/108
[#111]: https://github.com/nexu-io/open-design/pull/111
[#114]: https://github.com/nexu-io/open-design/pull/114
[#117]: https://github.com/nexu-io/open-design/pull/117
[#118]: https://github.com/nexu-io/open-design/pull/118
[#123]: https://github.com/nexu-io/open-design/pull/123
[#127]: https://github.com/nexu-io/open-design/pull/127
[#128]: https://github.com/nexu-io/open-design/pull/128
[#131]: https://github.com/nexu-io/open-design/pull/131
[#133]: https://github.com/nexu-io/open-design/pull/133
[#140]: https://github.com/nexu-io/open-design/pull/140
[#146]: https://github.com/nexu-io/open-design/pull/146
[#151]: https://github.com/nexu-io/open-design/pull/151
[#153]: https://github.com/nexu-io/open-design/pull/153
[#155]: https://github.com/nexu-io/open-design/pull/155
[#156]: https://github.com/nexu-io/open-design/pull/156
[#159]: https://github.com/nexu-io/open-design/pull/159
[#160]: https://github.com/nexu-io/open-design/pull/160
[#162]: https://github.com/nexu-io/open-design/pull/162
[#166]: https://github.com/nexu-io/open-design/pull/166
[#167]: https://github.com/nexu-io/open-design/pull/167
[#168]: https://github.com/nexu-io/open-design/pull/168
[#169]: https://github.com/nexu-io/open-design/pull/169
[#170]: https://github.com/nexu-io/open-design/pull/170
[#173]: https://github.com/nexu-io/open-design/pull/173
[#174]: https://github.com/nexu-io/open-design/pull/174
[#177]: https://github.com/nexu-io/open-design/pull/177
[#178]: https://github.com/nexu-io/open-design/pull/178
[#180]: https://github.com/nexu-io/open-design/pull/180
[#182]: https://github.com/nexu-io/open-design/pull/182
[#183]: https://github.com/nexu-io/open-design/pull/183
[#185]: https://github.com/nexu-io/open-design/pull/185
[#187]: https://github.com/nexu-io/open-design/pull/187
[#190]: https://github.com/nexu-io/open-design/pull/190
[#191]: https://github.com/nexu-io/open-design/pull/191
[#196]: https://github.com/nexu-io/open-design/pull/196
[#197]: https://github.com/nexu-io/open-design/pull/197
[#199]: https://github.com/nexu-io/open-design/pull/199
[#200]: https://github.com/nexu-io/open-design/pull/200
[#201]: https://github.com/nexu-io/open-design/pull/201
[#202]: https://github.com/nexu-io/open-design/pull/202
[#204]: https://github.com/nexu-io/open-design/pull/204
[#78]: https://github.com/nexu-io/open-design/pull/78
[#112]: https://github.com/nexu-io/open-design/pull/112
[#119]: https://github.com/nexu-io/open-design/pull/119
[#120]: https://github.com/nexu-io/open-design/pull/120
[#121]: https://github.com/nexu-io/open-design/pull/121
[#143]: https://github.com/nexu-io/open-design/pull/143
[#184]: https://github.com/nexu-io/open-design/pull/184
[#186]: https://github.com/nexu-io/open-design/pull/186
[#192]: https://github.com/nexu-io/open-design/pull/192
[#193]: https://github.com/nexu-io/open-design/pull/193
[#194]: https://github.com/nexu-io/open-design/pull/194
[#207]: https://github.com/nexu-io/open-design/pull/207
[#208]: https://github.com/nexu-io/open-design/pull/208
[#209]: https://github.com/nexu-io/open-design/pull/209
[#212]: https://github.com/nexu-io/open-design/pull/212
[#219]: https://github.com/nexu-io/open-design/pull/219
[#222]: https://github.com/nexu-io/open-design/pull/222
[#223]: https://github.com/nexu-io/open-design/pull/223
[#225]: https://github.com/nexu-io/open-design/pull/225
[#226]: https://github.com/nexu-io/open-design/pull/226
[#227]: https://github.com/nexu-io/open-design/pull/227
[#228]: https://github.com/nexu-io/open-design/pull/228
[#231]: https://github.com/nexu-io/open-design/pull/231
[#232]: https://github.com/nexu-io/open-design/pull/232
[#233]: https://github.com/nexu-io/open-design/pull/233
[#240]: https://github.com/nexu-io/open-design/pull/240
[#241]: https://github.com/nexu-io/open-design/pull/241
[#247]: https://github.com/nexu-io/open-design/pull/247
[#248]: https://github.com/nexu-io/open-design/pull/248
[#249]: https://github.com/nexu-io/open-design/pull/249
[#253]: https://github.com/nexu-io/open-design/pull/253
[#258]: https://github.com/nexu-io/open-design/pull/258
[#259]: https://github.com/nexu-io/open-design/pull/259
[#260]: https://github.com/nexu-io/open-design/pull/260
[#261]: https://github.com/nexu-io/open-design/pull/261
[#262]: https://github.com/nexu-io/open-design/pull/262
[#263]: https://github.com/nexu-io/open-design/pull/263
[#268]: https://github.com/nexu-io/open-design/pull/268
[#269]: https://github.com/nexu-io/open-design/pull/269
[#271]: https://github.com/nexu-io/open-design/pull/271
[#273]: https://github.com/nexu-io/open-design/pull/273
[#276]: https://github.com/nexu-io/open-design/pull/276
[#281]: https://github.com/nexu-io/open-design/pull/281
[#284]: https://github.com/nexu-io/open-design/pull/284
[#287]: https://github.com/nexu-io/open-design/pull/287
[#288]: https://github.com/nexu-io/open-design/pull/288
[#250]: https://github.com/nexu-io/open-design/pull/250
[#251]: https://github.com/nexu-io/open-design/pull/251
[#255]: https://github.com/nexu-io/open-design/pull/255
[#301]: https://github.com/nexu-io/open-design/pull/301
[#307]: https://github.com/nexu-io/open-design/pull/307
[#308]: https://github.com/nexu-io/open-design/pull/308
[#314]: https://github.com/nexu-io/open-design/pull/314
[#316]: https://github.com/nexu-io/open-design/pull/316
[#319]: https://github.com/nexu-io/open-design/pull/319
[#320]: https://github.com/nexu-io/open-design/pull/320
[#323]: https://github.com/nexu-io/open-design/pull/323
[#328]: https://github.com/nexu-io/open-design/pull/328
[#329]: https://github.com/nexu-io/open-design/pull/329
[#330]: https://github.com/nexu-io/open-design/pull/330
[#335]: https://github.com/nexu-io/open-design/pull/335
[#339]: https://github.com/nexu-io/open-design/pull/339
[#340]: https://github.com/nexu-io/open-design/pull/340
[#341]: https://github.com/nexu-io/open-design/pull/341
[#342]: https://github.com/nexu-io/open-design/pull/342
[#343]: https://github.com/nexu-io/open-design/pull/343
[#345]: https://github.com/nexu-io/open-design/pull/345
[#346]: https://github.com/nexu-io/open-design/pull/346
[#351]: https://github.com/nexu-io/open-design/pull/351
[#354]: https://github.com/nexu-io/open-design/pull/354
[#357]: https://github.com/nexu-io/open-design/pull/357
[#358]: https://github.com/nexu-io/open-design/pull/358
[#359]: https://github.com/nexu-io/open-design/pull/359
[#360]: https://github.com/nexu-io/open-design/pull/360
[#363]: https://github.com/nexu-io/open-design/pull/363
[#364]: https://github.com/nexu-io/open-design/pull/364
[#373]: https://github.com/nexu-io/open-design/pull/373
[#376]: https://github.com/nexu-io/open-design/pull/376
[#282]: https://github.com/nexu-io/open-design/pull/282
[#289]: https://github.com/nexu-io/open-design/pull/289
[#296]: https://github.com/nexu-io/open-design/pull/296
[#300]: https://github.com/nexu-io/open-design/pull/300
[#309]: https://github.com/nexu-io/open-design/pull/309
[#270]: https://github.com/nexu-io/open-design/pull/270
[#326]: https://github.com/nexu-io/open-design/pull/326
[#352]: https://github.com/nexu-io/open-design/pull/352
[#365]: https://github.com/nexu-io/open-design/pull/365
[#366]: https://github.com/nexu-io/open-design/pull/366
[#369]: https://github.com/nexu-io/open-design/pull/369
[#381]: https://github.com/nexu-io/open-design/pull/381
[#382]: https://github.com/nexu-io/open-design/pull/382
[#384]: https://github.com/nexu-io/open-design/pull/384
[#385]: https://github.com/nexu-io/open-design/pull/385
[#387]: https://github.com/nexu-io/open-design/pull/387
[#391]: https://github.com/nexu-io/open-design/pull/391
[#392]: https://github.com/nexu-io/open-design/pull/392
[#393]: https://github.com/nexu-io/open-design/pull/393
[#395]: https://github.com/nexu-io/open-design/pull/395
[#396]: https://github.com/nexu-io/open-design/pull/396
[#397]: https://github.com/nexu-io/open-design/pull/397
[#399]: https://github.com/nexu-io/open-design/pull/399
[#400]: https://github.com/nexu-io/open-design/pull/400
[#401]: https://github.com/nexu-io/open-design/pull/401
[#403]: https://github.com/nexu-io/open-design/pull/403
[#404]: https://github.com/nexu-io/open-design/pull/404
[#405]: https://github.com/nexu-io/open-design/pull/405
[#406]: https://github.com/nexu-io/open-design/pull/406
[#407]: https://github.com/nexu-io/open-design/pull/407
[#409]: https://github.com/nexu-io/open-design/pull/409
[#410]: https://github.com/nexu-io/open-design/pull/410
[#411]: https://github.com/nexu-io/open-design/pull/411
[#412]: https://github.com/nexu-io/open-design/pull/412
[#417]: https://github.com/nexu-io/open-design/pull/417
[#418]: https://github.com/nexu-io/open-design/pull/418
[#421]: https://github.com/nexu-io/open-design/pull/421
[#424]: https://github.com/nexu-io/open-design/pull/424
[#428]: https://github.com/nexu-io/open-design/pull/428
[#429]: https://github.com/nexu-io/open-design/pull/429
[#434]: https://github.com/nexu-io/open-design/pull/434
[#435]: https://github.com/nexu-io/open-design/pull/435
[#439]: https://github.com/nexu-io/open-design/pull/439
[#440]: https://github.com/nexu-io/open-design/pull/440
[#447]: https://github.com/nexu-io/open-design/pull/447
[#448]: https://github.com/nexu-io/open-design/pull/448
[#453]: https://github.com/nexu-io/open-design/pull/453
[#455]: https://github.com/nexu-io/open-design/pull/455
[#457]: https://github.com/nexu-io/open-design/pull/457
[#458]: https://github.com/nexu-io/open-design/pull/458
[#460]: https://github.com/nexu-io/open-design/pull/460
[#465]: https://github.com/nexu-io/open-design/pull/465
[#466]: https://github.com/nexu-io/open-design/pull/466
[#468]: https://github.com/nexu-io/open-design/pull/468
[#471]: https://github.com/nexu-io/open-design/pull/471
[#476]: https://github.com/nexu-io/open-design/pull/476
[#477]: https://github.com/nexu-io/open-design/pull/477
[#480]: https://github.com/nexu-io/open-design/pull/480
[#481]: https://github.com/nexu-io/open-design/pull/481
[#488]: https://github.com/nexu-io/open-design/pull/488
[#489]: https://github.com/nexu-io/open-design/pull/489
[#490]: https://github.com/nexu-io/open-design/pull/490
[#492]: https://github.com/nexu-io/open-design/pull/492
[#494]: https://github.com/nexu-io/open-design/pull/494
[#496]: https://github.com/nexu-io/open-design/pull/496
[#502]: https://github.com/nexu-io/open-design/pull/502
[#504]: https://github.com/nexu-io/open-design/pull/504
[#513]: https://github.com/nexu-io/open-design/pull/513
[#514]: https://github.com/nexu-io/open-design/pull/514
[#515]: https://github.com/nexu-io/open-design/pull/515
[#522]: https://github.com/nexu-io/open-design/pull/522
[#523]: https://github.com/nexu-io/open-design/pull/523
[#537]: https://github.com/nexu-io/open-design/pull/537
[#535]: https://github.com/nexu-io/open-design/pull/535
[#548]: https://github.com/nexu-io/open-design/pull/548
[#549]: https://github.com/nexu-io/open-design/pull/549
[#556]: https://github.com/nexu-io/open-design/pull/556
[#563]: https://github.com/nexu-io/open-design/pull/563
[#570]: https://github.com/nexu-io/open-design/pull/570
[#577]: https://github.com/nexu-io/open-design/pull/577
[#578]: https://github.com/nexu-io/open-design/pull/578
[#586]: https://github.com/nexu-io/open-design/pull/586
[#587]: https://github.com/nexu-io/open-design/pull/587
[#592]: https://github.com/nexu-io/open-design/pull/592
[#595]: https://github.com/nexu-io/open-design/pull/595
[#604]: https://github.com/nexu-io/open-design/pull/604
[#605]: https://github.com/nexu-io/open-design/pull/605
[#608]: https://github.com/nexu-io/open-design/pull/608
[#612]: https://github.com/nexu-io/open-design/pull/612
[#618]: https://github.com/nexu-io/open-design/pull/618
[#619]: https://github.com/nexu-io/open-design/pull/619
[#620]: https://github.com/nexu-io/open-design/pull/620
[#623]: https://github.com/nexu-io/open-design/pull/623
[#627]: https://github.com/nexu-io/open-design/pull/627
[#637]: https://github.com/nexu-io/open-design/pull/637
[#275]: https://github.com/nexu-io/open-design/pull/275
[#277]: https://github.com/nexu-io/open-design/pull/277
[#283]: https://github.com/nexu-io/open-design/pull/283
[#293]: https://github.com/nexu-io/open-design/pull/293
[#306]: https://github.com/nexu-io/open-design/pull/306
[#362]: https://github.com/nexu-io/open-design/pull/362
[#390]: https://github.com/nexu-io/open-design/pull/390
[#414]: https://github.com/nexu-io/open-design/pull/414
[#493]: https://github.com/nexu-io/open-design/pull/493
[#507]: https://github.com/nexu-io/open-design/pull/507
[#524]: https://github.com/nexu-io/open-design/pull/524
[#530]: https://github.com/nexu-io/open-design/pull/530
[#531]: https://github.com/nexu-io/open-design/pull/531
[#555]: https://github.com/nexu-io/open-design/pull/555
[#591]: https://github.com/nexu-io/open-design/pull/591
[#611]: https://github.com/nexu-io/open-design/pull/611
[#614]: https://github.com/nexu-io/open-design/pull/614
[#621]: https://github.com/nexu-io/open-design/pull/621
[#622]: https://github.com/nexu-io/open-design/pull/622
[#625]: https://github.com/nexu-io/open-design/pull/625
[#626]: https://github.com/nexu-io/open-design/pull/626
[#631]: https://github.com/nexu-io/open-design/pull/631
[#655]: https://github.com/nexu-io/open-design/pull/655
[#664]: https://github.com/nexu-io/open-design/pull/664
[#667]: https://github.com/nexu-io/open-design/pull/667
[#670]: https://github.com/nexu-io/open-design/pull/670
[#671]: https://github.com/nexu-io/open-design/pull/671
[#674]: https://github.com/nexu-io/open-design/pull/674
[#675]: https://github.com/nexu-io/open-design/pull/675
[#678]: https://github.com/nexu-io/open-design/pull/678
[#680]: https://github.com/nexu-io/open-design/pull/680
[#683]: https://github.com/nexu-io/open-design/pull/683
[#685]: https://github.com/nexu-io/open-design/pull/685
[#686]: https://github.com/nexu-io/open-design/pull/686
[#696]: https://github.com/nexu-io/open-design/pull/696
[#697]: https://github.com/nexu-io/open-design/pull/697
[#698]: https://github.com/nexu-io/open-design/pull/698
[#700]: https://github.com/nexu-io/open-design/pull/700
[#708]: https://github.com/nexu-io/open-design/pull/708
[#712]: https://github.com/nexu-io/open-design/pull/712
[#718]: https://github.com/nexu-io/open-design/pull/718
[#720]: https://github.com/nexu-io/open-design/pull/720
[#722]: https://github.com/nexu-io/open-design/pull/722
[#727]: https://github.com/nexu-io/open-design/pull/727
[#735]: https://github.com/nexu-io/open-design/pull/735
[#738]: https://github.com/nexu-io/open-design/pull/738
[#740]: https://github.com/nexu-io/open-design/pull/740
[#747]: https://github.com/nexu-io/open-design/pull/747
[#755]: https://github.com/nexu-io/open-design/pull/755
[#768]: https://github.com/nexu-io/open-design/pull/768
[#778]: https://github.com/nexu-io/open-design/pull/778
[#781]: https://github.com/nexu-io/open-design/pull/781
[#788]: https://github.com/nexu-io/open-design/pull/788
[#795]: https://github.com/nexu-io/open-design/pull/795
[#799]: https://github.com/nexu-io/open-design/pull/799
[#801]: https://github.com/nexu-io/open-design/pull/801
[#805]: https://github.com/nexu-io/open-design/pull/805
[#65]: https://github.com/nexu-io/open-design/pull/65
[#422]: https://github.com/nexu-io/open-design/pull/422
[#532]: https://github.com/nexu-io/open-design/pull/532
[#579]: https://github.com/nexu-io/open-design/pull/579
[#581]: https://github.com/nexu-io/open-design/pull/581
[#615]: https://github.com/nexu-io/open-design/pull/615
[#624]: https://github.com/nexu-io/open-design/pull/624
[#666]: https://github.com/nexu-io/open-design/pull/666
[#681]: https://github.com/nexu-io/open-design/pull/681
[#704]: https://github.com/nexu-io/open-design/pull/704
[#714]: https://github.com/nexu-io/open-design/pull/714
[#716]: https://github.com/nexu-io/open-design/pull/716
[#729]: https://github.com/nexu-io/open-design/pull/729
[#751]: https://github.com/nexu-io/open-design/pull/751
[#752]: https://github.com/nexu-io/open-design/pull/752
[#756]: https://github.com/nexu-io/open-design/pull/756
[#757]: https://github.com/nexu-io/open-design/pull/757
[#763]: https://github.com/nexu-io/open-design/pull/763
[#767]: https://github.com/nexu-io/open-design/pull/767
[#771]: https://github.com/nexu-io/open-design/pull/771
[#773]: https://github.com/nexu-io/open-design/pull/773
[#794]: https://github.com/nexu-io/open-design/pull/794
[#796]: https://github.com/nexu-io/open-design/pull/796
[#800]: https://github.com/nexu-io/open-design/pull/800
[#804]: https://github.com/nexu-io/open-design/pull/804
[#806]: https://github.com/nexu-io/open-design/pull/806
[#809]: https://github.com/nexu-io/open-design/pull/809
[#810]: https://github.com/nexu-io/open-design/pull/810
[#811]: https://github.com/nexu-io/open-design/pull/811
[#812]: https://github.com/nexu-io/open-design/pull/812
[#813]: https://github.com/nexu-io/open-design/pull/813
[#819]: https://github.com/nexu-io/open-design/pull/819
[#820]: https://github.com/nexu-io/open-design/pull/820
[#822]: https://github.com/nexu-io/open-design/pull/822
[#823]: https://github.com/nexu-io/open-design/pull/823
[#824]: https://github.com/nexu-io/open-design/pull/824
[#827]: https://github.com/nexu-io/open-design/pull/827
[#829]: https://github.com/nexu-io/open-design/pull/829
[#830]: https://github.com/nexu-io/open-design/pull/830
[#832]: https://github.com/nexu-io/open-design/pull/832
[#833]: https://github.com/nexu-io/open-design/pull/833
[#834]: https://github.com/nexu-io/open-design/pull/834
[#838]: https://github.com/nexu-io/open-design/pull/838
[#839]: https://github.com/nexu-io/open-design/pull/839
[#840]: https://github.com/nexu-io/open-design/pull/840
[#841]: https://github.com/nexu-io/open-design/pull/841
[#842]: https://github.com/nexu-io/open-design/pull/842
[#843]: https://github.com/nexu-io/open-design/pull/843
[#844]: https://github.com/nexu-io/open-design/pull/844
[#845]: https://github.com/nexu-io/open-design/pull/845
[#846]: https://github.com/nexu-io/open-design/pull/846
[#847]: https://github.com/nexu-io/open-design/pull/847
[#851]: https://github.com/nexu-io/open-design/pull/851
[#852]: https://github.com/nexu-io/open-design/pull/852
[#853]: https://github.com/nexu-io/open-design/pull/853
[#856]: https://github.com/nexu-io/open-design/pull/856
[#857]: https://github.com/nexu-io/open-design/pull/857
[#858]: https://github.com/nexu-io/open-design/pull/858
[#859]: https://github.com/nexu-io/open-design/pull/859
[#863]: https://github.com/nexu-io/open-design/pull/863
[#864]: https://github.com/nexu-io/open-design/pull/864
[#867]: https://github.com/nexu-io/open-design/pull/867
[#875]: https://github.com/nexu-io/open-design/pull/875
[#877]: https://github.com/nexu-io/open-design/pull/877
[#879]: https://github.com/nexu-io/open-design/pull/879
[#884]: https://github.com/nexu-io/open-design/pull/884
[#886]: https://github.com/nexu-io/open-design/pull/886
[#888]: https://github.com/nexu-io/open-design/pull/888
[#896]: https://github.com/nexu-io/open-design/pull/896
[#898]: https://github.com/nexu-io/open-design/pull/898
[#899]: https://github.com/nexu-io/open-design/pull/899
[#900]: https://github.com/nexu-io/open-design/pull/900
[#906]: https://github.com/nexu-io/open-design/pull/906
[#907]: https://github.com/nexu-io/open-design/pull/907
[#908]: https://github.com/nexu-io/open-design/pull/908
[#915]: https://github.com/nexu-io/open-design/pull/915
[#923]: https://github.com/nexu-io/open-design/pull/923
[#924]: https://github.com/nexu-io/open-design/pull/924
[#927]: https://github.com/nexu-io/open-design/pull/927
[#933]: https://github.com/nexu-io/open-design/pull/933
[#935]: https://github.com/nexu-io/open-design/pull/935
[#936]: https://github.com/nexu-io/open-design/pull/936
[#937]: https://github.com/nexu-io/open-design/pull/937
[#938]: https://github.com/nexu-io/open-design/pull/938
[#940]: https://github.com/nexu-io/open-design/pull/940
[#941]: https://github.com/nexu-io/open-design/pull/941
[#943]: https://github.com/nexu-io/open-design/pull/943
[#944]: https://github.com/nexu-io/open-design/pull/944
[#946]: https://github.com/nexu-io/open-design/pull/946
[#947]: https://github.com/nexu-io/open-design/pull/947
[#948]: https://github.com/nexu-io/open-design/pull/948
[#949]: https://github.com/nexu-io/open-design/pull/949
[#950]: https://github.com/nexu-io/open-design/pull/950
[#952]: https://github.com/nexu-io/open-design/pull/952
[#958]: https://github.com/nexu-io/open-design/pull/958
[#961]: https://github.com/nexu-io/open-design/pull/961
[#962]: https://github.com/nexu-io/open-design/pull/962
[#964]: https://github.com/nexu-io/open-design/pull/964
[#967]: https://github.com/nexu-io/open-design/pull/967
[#969]: https://github.com/nexu-io/open-design/pull/969
[#971]: https://github.com/nexu-io/open-design/pull/971
[#972]: https://github.com/nexu-io/open-design/pull/972
[#975]: https://github.com/nexu-io/open-design/pull/975
[#976]: https://github.com/nexu-io/open-design/pull/976
[#979]: https://github.com/nexu-io/open-design/pull/979
[#986]: https://github.com/nexu-io/open-design/pull/986
[#987]: https://github.com/nexu-io/open-design/pull/987
[#988]: https://github.com/nexu-io/open-design/pull/988
[#989]: https://github.com/nexu-io/open-design/pull/989
[#990]: https://github.com/nexu-io/open-design/pull/990
[#991]: https://github.com/nexu-io/open-design/pull/991
[#992]: https://github.com/nexu-io/open-design/pull/992
[#993]: https://github.com/nexu-io/open-design/pull/993
[#994]: https://github.com/nexu-io/open-design/pull/994
[#995]: https://github.com/nexu-io/open-design/pull/995
[#998]: https://github.com/nexu-io/open-design/pull/998
[#1004]: https://github.com/nexu-io/open-design/pull/1004
[#1005]: https://github.com/nexu-io/open-design/pull/1005
[#1016]: https://github.com/nexu-io/open-design/pull/1016
[#1018]: https://github.com/nexu-io/open-design/pull/1018
[#1031]: https://github.com/nexu-io/open-design/pull/1031
[#1032]: https://github.com/nexu-io/open-design/pull/1032
[#1035]: https://github.com/nexu-io/open-design/pull/1035
[#1036]: https://github.com/nexu-io/open-design/pull/1036
[#1039]: https://github.com/nexu-io/open-design/pull/1039
[#1045]: https://github.com/nexu-io/open-design/pull/1045
[#1046]: https://github.com/nexu-io/open-design/pull/1046
[#1048]: https://github.com/nexu-io/open-design/pull/1048
[#1053]: https://github.com/nexu-io/open-design/pull/1053
[#1054]: https://github.com/nexu-io/open-design/pull/1054
[#1056]: https://github.com/nexu-io/open-design/pull/1056
[#1065]: https://github.com/nexu-io/open-design/pull/1065
[#1067]: https://github.com/nexu-io/open-design/pull/1067
[#1068]: https://github.com/nexu-io/open-design/pull/1068
[#1071]: https://github.com/nexu-io/open-design/pull/1071
[#1079]: https://github.com/nexu-io/open-design/pull/1079
