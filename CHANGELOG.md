# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/nexu-io/open-design/compare/open-design-v0.1.0...HEAD
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
