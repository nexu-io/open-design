# Claude / Anthropic 风格设计系统

非官方 Claude / Anthropic 风格整理版。它把官网公开 CSS 中可确认的 Ivory / Slate / Cloud / Clay 使用方式整理成可复用设计系统。

This package is not affiliated with or endorsed by Anthropic. See `NOTICE.md` for the mark, asset, and evidence boundary.

## Product Overview

Anthropic 的公开网页是一个 product-facing design platform：它支持官网营销、研究发布、新闻内容、公司页面和 Claude-like AI workspace 表达。视觉重点是安静、可信、适合阅读的 AI tool，而不是高饱和科技感。这个 package provides reusable colors, typography, layout, navigation, buttons, dropdown, state, and motion rules for Open Design artifacts.

Source product:

- Anthropic public website and Claude-style AI workbench surfaces.
- Primary evidence is public CSS token usage, preserved source files, and downloaded official site assets. Memory-only color guesses are not accepted as source evidence.
- Package version: `2026.06.30-stable-claude-system-polished`; registered design-system id: `user:anthropic`.

Primary surfaces:

- 官网式 landing / editorial page
- AI workbench / console shell
- Research / newsroom content pages
- Form and settings surfaces
- Slide and email artifacts

Core capabilities:

- Warm paper surface hierarchy
- Restrained Slate primary action system
- Claude.com button tiers: Slate primary, Get help / 查看文档 large secondary with reverse hover, weak tertiary, bordered tiny Read more, rare Clay highest-signal.
- Product dropdowns open on hover/focus only; normal previews do not ship `.is-open`.
- Sparse Clay accent budget
- Success semantics use `#6ea100`; Olive `#788c5d` stays as chart/support color
- Status badges use soft semantic backgrounds with semantic text/dot and switch-like pill radius; larger state cards/alerts keep low-saturation soft backgrounds and ordinary action buttons
- Official Latin faces with Chinese fallback stacks
- Mono numerics with tabular numbers for prices, counts, dates, percentages, and dense tables
- Source-backed header, dropdown, button, link, focus, and status rules
- Light app sidebar and dark overlay sidebar patterns

## Product Context: Source Product, Primary Surfaces, Core Capabilities

This Claude Design-style package is for Anthropic-like public pages and product workbench UI. It covers the source product context, the primary surfaces listed above, and the core capabilities needed to reuse the style outside this extraction project.

## Product Context

- Source: `designmd://anthropic`
- Evidence: `DESIGN.md`、`context/anthropic-official-usage-evidence.md`、`anthropic-official-colors.md`、Anthropic 官网公开 CSS 抽查结果。
- Goal: 为 Open Design 项目提供温暖、克制、编辑感的 AI 工作台视觉语言。

## Core Rules

- 页面底：`#faf9f5`
- 顶栏 / section / 默认组件：`#f0eee6`
- hover / selected：`#e8e6dc`
- dropdown / expanded surface：继承所属按钮、导航或页面的 `background-primary / control-bg`，不写死某个固定色
- 主 CTA：`#141413` 背景，`#faf9f5` 文字
- Clay：`#d97757`，只做少量强调，不做默认 primary
- Focus：`#2c84db`，只做键盘焦点
- Success：`#6ea100`，只做成功/完成/正向结果
- Typography：Anthropic Serif/Sans/Mono for Latin, with Songti/PingFang/Noto/Source Han Chinese fallbacks

## Package Contents

| Path | Purpose |
| --- | --- |
| `DESIGN.md` | Canonical design rules |
| `colors_and_type.css` | Reusable CSS tokens |
| `BRAND.md` | Short brand/package summary |
| `PROVENANCE.json` | Source, asset, and inference audit |
| `SYSTEM-MANIFEST.json` | Stable package structure, read order, and invariants |
| `brand.json` | Machine-readable system definition |
| `fonts/` | Preserved official Anthropic webfont files |
| `logos/` | Preserved favicon / webclip / mask icon candidates |
| `imagery/` | Preserved official imagery samples |
| `source_examples/official-source-manifest.json` | Source fetch and asset manifest |
| `preview/*.html` | Focused review cards |
| `examples/index.html` | Unified route hub for detail fixtures, page examples, and material directions |
| `examples/details-color-library.html` | Full color library and forbidden defaults |
| `examples/details-official-svg-imagery.html` | Official organic SVG imagery fixture and usage boundary |
| `system/kit.html` | Component kit preview |
| `system/artifacts/landing.html` | Primary Open Design preview/showcase page using shared CSS |
| `system/artifacts/*.html` | Polished material-direction examples using shared CSS |
| `ui_kits/app/index.html` | Applied app shell |
| `CONTRIBUTING.md` | Contribution checklist and package boundaries |
| `SECURITY.md` | Privacy, asset, and local registry safety notes |
| `NOTICE.md` | Non-affiliation, asset, and evidence boundary |

Preserved source-backed assets and evidence:

- `DESIGN.md` is the canonical stable source; the original pasted draft has been fully absorbed and removed to avoid stale rules.
- `anthropic-official-colors.md` preserves the raw official color audit; the current visible color library is `examples/details-color-library.html`.
- `context/source-context.md` preserves setup context.
- `PROVENANCE.json` records sampled pages, CSS files, measured values, inferred values, and local asset paths.
- `source_examples/official-source-manifest.json` records the source page/CSS fetch and preserved assets.
- `fonts/` contains preserved Anthropic Sans / Serif / Mono webfont files from sampled official CSS.
- `logos/` contains official favicon/webclip/mask-icon candidates, including `safari-pinned-tab.svg`. No full official wordmark SVG was exposed in sampled sources; do not redraw one.
- `imagery/` contains sampled official OG, research, careers, and company imagery for reference. `imagery/official-svg/` contains official 1000×1000 organic/editorial SVG illustrations; use them as imagery/reference assets, not logos or UI icon glyphs.

Measured vs inferred:

- Measured: core color literals, font-face family names and files, page titles/H1s, header/dropdown/button CSS snippets.
- Inferred: Chinese fallback stacks and the assignment of `#6ea100` to success semantics. `#6ea100` is measured in source CSS, but the success role is an implementation choice confirmed by this project, not an official named Anthropic token.

## Preview Manifest

- `preview/colors-primary.html`
- `preview/colors-usage.html`
- `preview/typography-specimens.html`
- `preview/spacing-tokens.html`
- `preview/components-buttons.html`
- `preview/navigation-menus.html`
- `preview/claude-interactions.html`
- `preview/assets-provenance.html`

## Example Manifest

Open `examples/index.html` first. It is the unified route hub for three layers:

- Detail fixtures: surface layers, color library, hover motion, smooth scroll + route motion, buttons and links, Claude official interactions, sidebar system, forms and focus, status/data, Chinese/English typography.
- Page examples: landing, research, newsroom, company, console, login, settings/form.
- Material directions: landing/showcase, deck, poster, email, newsletter, and form. These demonstrate deliverable formats and must not override detail fixtures.

## Reuse Workflow

1. Open `examples/index.html` and choose the route layer: details for controls, pages for composition, materials for deliverable formats.
2. Load `colors_and_type.css`.
3. Use `DESIGN.md` for visual decisions.
4. Check `SYSTEM-MANIFEST.json` for stable read order and invariants.
5. Build primary actions with Slate, not Clay.
6. Use Clay for one high-signal accent per view.
7. Use `examples/examples.css` for fixture components; do not fork nav/dropdown/button logic per page.
8. Check preview cards before shipping a new artifact.
9. Check `examples/page-*.html` when building a page-level surface.

Route contract: topbar links are global destinations, route tabs are in-page grouping, and cards/rows are the concrete targets. Do not add duplicate CTA buttons for the same target, and never ship an arrow-only button unless it is a real link or opens a real menu.

## As an Agent Skill

This Open Design project is the canonical editable source. To expose it through the local Obsidian `agent-skills` registry, keep the registry entry as a small stub that points back here:

```text
agent-skills/custom/claude-anthropic-design-system/
  SKILL.md
  agents/openai.yaml
  design-system -> <this Open Design project>
```

Run:

```bash
AGENT_SKILLS_ROOT="/path/to/agent-skills" scripts/install-as-agent-skill.sh
```

The stub is what the registry scans; the `design-system` symlink is what keeps Open Design and agent usage on one source of truth. Do not copy the whole package into `custom/` as a second editable source. `AGENT_SKILLS_ROOT` is explicit by design so public copies do not ship a maintainer-specific registry path.

`registry-stub/` is only a template for that installed stub. It is not a second design-system source and should not be copied into artifacts.

## Stable Implementation Classes

Agents should copy these classes instead of re-authoring variants:

| Need | Copy from |
| --- | --- |
| Smooth page scrolling | `colors_and_type.css` / `examples/examples.css` global `html { scroll-behavior: smooth; }` plus reduced-motion override; visible fixture: `examples/details-scroll-route-motion.html` |
| Header and product dropdown | `.topbar`, `.nav-item`, `.nav-demo`, `.nav-demo-panel`, `.mega`, `.caret` in `examples/examples.css` |
| Button hierarchy | `.btn.primary`, `.btn.secondary`, `.btn.tertiary`, `.btn.tiny`, `.btn.brand` |
| Hover taxonomy | `examples/details-hover-motion.html` + `SYSTEM-MANIFEST.json.hoverTaxonomy` |
| Official SVG imagery | `examples/details-official-svg-imagery.html`; use `imagery/official-svg/` as editorial/content imagery, not logo marks or UI icons |
| Pricing route switch | `.route-tabs`, `.route-panels`, `.route-panel.active` and the small JS in `examples/details-scroll-route-motion.html`; the single route indicator follows hover/focus and returns to the selected tab on mouseleave/focusout |
| Use-cases cards | `.official-use-grid` and `.official-use-card` |
| Code / terminal blocks | `examples/details-code-terminal.html`; use `.terminal-window`, `.terminal-toolbar`, `.terminal-controls`, `.terminal-tabs`, `.terminal-workspace`, `.terminal-sidebar`, `.terminal-screen`, `.terminal-stream`, `.terminal-block`, `.terminal-row`, `.terminal-output-block`, and `.terminal-cursor` for CLI sessions; use `.code-block` only for API/code snippets |
| Sidebar system | `examples/details-sidebar-system.html` |
| Tabular data | `.numeric` |

Do not fork nav, dropdown, button, route, sidebar, or color-library logic per page. If a new artifact needs the same behavior, copy the shared class and change only content/layout around it.

All package HTML files use the same outer design-system topbar content. Page identity, current route, app-specific toolbar controls, and local navigation belong inside the page body or product UI, not in the outer topbar.

## Design Notes

- `brand.json.colors`、`brand.json.palette`、`brand.json.previewTheme` 是 Open Design 设计系统预览/展示最可能读取的机器色板；这些字段不能为空，否则宿主可能回退到默认蓝色主题。
- `manifest.json.previewEntry`、`displayEntry`、`showcaseEntry` 和 `brand.json.preview.entry` 都指向 `system/artifacts/landing.html`。如果 Open Design 的“预览-展示”仍显示默认蓝，先检查这些机器入口和 `brand.json.previewTheme`，不要只改 HTML。
- 悬浮效果按组件分类选择：教程 / resources 卡使用 `.tutorial-card`，成组联动用 `.tutorial-card-group`；Cookbook 与 docs 卡共享本地纸面 hover；button 按层级区分 hover：secondary/Get help 反色，tertiary/tiny 双 ring；dropdown 有下划线型和浅色高亮型两种。不要把一种 hover 套给所有组件。
- 官方 SVG 插图已进入 `examples/details-official-svg-imagery.html`。这些图可用于 editorial hero、research/resources 配图和空状态辅助图形；不要当作 logo、wordmark、按钮 icon 或每张卡片的机械装饰。
- 代码 / 终端块是 developer docs 组件，不是装饰性全黑页面。CLI 使用 `examples/details-code-terminal.html` 中的 `.terminal-window` 会话结构：左上红/黄/绿 traffic-light 窗口控制点、路径栏、tab strip、会话侧栏、prompt、输入流、输出分组、状态行和光标；终端控制点是系统窗口 chrome，不使用 Clay/Oat/Cactus 品牌色。终端窗口本身不放复制胶囊，复制动作只用于 API/SDK `.code-block`。API/SDK 片段才使用 `.code-block`。
- 示范库首页使用 Cookbook / Docs 风格的 `.cookbook-grid .tile`：本地纸面加深，不是独立 transparent-tile 模式；不要把 resources/tutorials 的组内联动套到普通 docs/cookbook 卡。
- Use the preview cards as review fixtures, not as production layouts.
- Use `examples/*` as concrete usage demonstrations for page composition and interaction details.
- `brand.html`, `system/index.html`, `system/kit.html`, `system/kit.dark.html`, `examples/*`, `preview/*`, and `ui_kits/app/` all load the same shared CSS. If these disagree, fix `colors_and_type.css` or `examples/examples.css`; do not patch one page in isolation.
- `system/artifacts/landing.html` is the primary design-system preview/showcase page; it must look like a finished Claude-style page, not a rule summary card.
- `system/artifacts/*` are material-direction examples (deck, poster, email, newsletter, form) reached from `examples/index.html#materials`. Use `examples/details-*` for exact control behavior, and do not reintroduce per-page control overrides.
- The applied app shell in `ui_kits/app/` demonstrates product UI usage with the same shared component layer.

## Cleanup Boundary

Kept as evidence or reference:

- `system/artifacts/*` and `.artifact.json` metadata as stable reference deliverables.
- `context/`, `source_examples/`, `fonts/`, `logos/`, `imagery/`, `.od-skills/`, and `plugin-source/`.

Canonical implementation source:

- Tokens: `colors_and_type.css`
- Components and interaction fixtures: `examples/examples.css`
- Machine-readable rules and manifests: `brand.json`, `SYSTEM-MANIFEST.json`

## 文件结构边界

规范源只有 `DESIGN.md`、`brand.json`、`colors_and_type.css`、`examples/examples.css`、`SYSTEM-MANIFEST.json` 和 `PROVENANCE.json`。视觉入口是 `brand.html`、`system/artifacts/landing.html`、`examples/index.html`、`preview/claude-interactions.html`、`ui_kits/app/index.html`。`plugin-source/`、`.od-skills/`、`*.artifact.json` 是宿主/来源 sidecar，不作为组件实现复制。

去重记录：`plugin-source/design-system-source-context-mr0bb3f4/` 与 `mr0bb87z/` 内容重复，已删除前者，保留 `mr0bb87z/` 作为来源 sidecar。

## Contribution and Security

Before contributing this package to Open Design or moving it to another registry, read `CONTRIBUTING.md` and `SECURITY.md`.

Do not publish local crawl caches, private screenshots, authorization tokens, cookies, API keys, user-specific absolute paths, or host app state. Public package metadata should contain only reproducible source URLs, relative asset paths, and measured / inferred boundaries.
