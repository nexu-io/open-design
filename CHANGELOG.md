# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-05-05

A multi-platform, multi-protocol leap: Open Design now ships as an MCP server, lands on Linux desktops, ships Critique Theater (Design Jury) Phase 4, gains live-reload + Tweaks mode + live artifacts in the preview pane, and adds five new agent / runtime adapters. 71 merged PRs from 40+ contributors over two days.

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
- **Linux x64 AppImage** in `tools-pack` and the release workflows. ([#369])
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

[Unreleased]: https://github.com/nexu-io/open-design/compare/open-design-v0.4.0...HEAD
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
