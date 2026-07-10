---
name: web-clone
en_name: Website Clone
zh_name: 网站复刻
description: >
  网站复刻 / 克隆方法论。USE WHEN 用户说 复刻网站、克隆网站、clone website、抄个站、仿站、
  照着这个站做一个、reproduce site、还原某个网页效果、把这个站搬下来改成我的、
  复刻某个交互/WebGL/Canvas/Three.js 效果。提供「先拿真源码 → 判路径 → 逆向拆解 →
  搭工程 → 替换内容」的可移植决策树，覆盖静态站 / React-Vue-Next 内容站 /
  WebGL-Canvas 重前端站三大分支，并强制核对任何 AI 二手分析里的可执行代码。
triggers:
  - "网站复刻"
  - "复刻网站"
  - "clone website"
  - "reproduce site"
  - "仿站"
metadata:
  author: jane (xiaoer)
  version: "1.6.0"
  use_case: 个人本地复刻/学习网站，沉淀自 website-clones 克隆中枢
od:
  mode: prototype
  scenario: web-clone
  surface: web
  design_system:
    requires: false
---

# Web Clone · 网站复刻方法论

把"复刻一个网站"做成可重复的流程。在 Open Design 中，默认在当前项目目录工作：`NOTES.md`、`RECON/`、`CLONE_REPORT.md`、`CLONE_AUDIT.md` 和最终可预览的 `index.html` 都应写在当前项目内，除非用户明确指定外部工作目录。

**Open Design 环境准备（跑任何 `scripts/` 前先看）**：
- 本 skill 的脚本会被 stage 到项目内 `.od-skills/<插件目录>/scripts/`（skill 前言里有确切路径）。文中命令写的 `node scripts/xxx.mjs` 按该路径解析，例如 `node .od-skills/<插件目录>/scripts/recon-site.mjs ...`；`RECON/`、`assets/` 等产物仍写到项目根。
- 脚本依赖 Playwright。首次在项目里跑之前执行一次 `npm install -D playwright`（在项目根）；本机装有 Chrome 时脚本会自动走 `channel:"chrome"`，无需再下浏览器，否则补一句 `npx playwright install chromium`。**不许因为"环境没配好"就跳过脚本改为目测**——装依赖只要一分钟。

## 头号铁律：真源码至上，绝不信 AI 推测的代码

> 任何 AI 生成的"复刻分析/施工图"，**正文的概念骨架可以参考，但里面的可执行代码块默认全是臆造的**，必须逐行用真源码核对，否则照抄必崩。

**实证（marbles 案例）**：一份 AI 分析文档把原站"解析法求光线-球体交点 + 把光学结果编码成位移图、交给 SVG `feDisplacementMap` 去扭曲真实 DOM"的真架构，臆造成了"ray-marching + SDF + 把 DOM 当纹理采样"——两套完全不同的实现，照抄做不出原效果且慢 N 倍。详见 `references/marbles-case.md`。

所以第一动作永远是：**拿到真源码**。

## 决策树（按顺序走，不许跳）

### Step 0 · 先建标准工程骨架

```bash
node scripts/init-clone.mjs <站名> --url <原站URL> --in-place
```

该脚本会在当前项目内创建 `NOTES.md`、`RECON/screenshots/`，避免每次手工漏掉产物。

### Step 1 · 先去 GitHub 搜源码，别急着抓站

```bash
unset SSL_CERT_FILE   # macOS 怪癖，bash 前先解
# 按站名/产品名搜
SSL_CERT_FILE=/etc/ssl/cert.pem gh api "search/repositories?q=<关键词>" \
  | jq -r '.items[] | "\(.full_name) ⭐\(.stargazers_count) \(.description)"' | head -10
# vercel.app/netlify.app/github.io 的 URL slug 常常就是 仓库名 / 部署者用户名
```
- 单文件站（github.io / 纯 HTML）→ 直接抓 raw：`curl -sL https://raw.githubusercontent.com/<user>/<repo>/main/index.html`
- **找到源码且许可允许 → 跳 Step 4 直接 clone。** 教训：先搜 GitHub 能省 30 分钟弯路。

### Step 2 · 没找到源码 → 浏览器侦察（探针）

使用可用的浏览器自动化能力或 Playwright，跑探针抽信号（框架 / `window.THREE` / canvas 数 / 平滑滚动库 / 字体 / scrollHeight）。截图 1440/768/390 三档 + 侦察 JSON 存 `RECON/`。

优先用内置脚本跑标准侦察：

```bash
node scripts/recon-site.mjs \
  --url <原站URL> \
  --out RECON \
  --label original

# 真浏览器全程滚动，把页面真实用到的图片/字体/媒体（含第三方 CDN、防盗链资产）
# 全部拔到本地，并生成 assets/fonts/fonts.css（自托管 @font-face）+ URL→本地路径映射。
node scripts/asset-harvest.mjs \
  --url <原站URL> \
  --recon RECON/original-recon.json \
  --out assets \
  --manifest RECON/asset-manifest.json

node scripts/network-capture.mjs \
  --url <原站URL> \
  --out RECON/network \
  --label original

node scripts/route-crawl.mjs \
  --url <原站URL> \
  --out RECON/routes \
  --label original \
  --max-pages 25 \
  --max-depth 2

node scripts/interaction-probe.mjs \
  --url <原站URL> \
  --out RECON/interactions \
  --label original

node scripts/sourcemap-hunt.mjs \
  --recon RECON/original-recon.json \
  --out RECON/sourcemaps
```

> 登录态私域站需要使用当前环境里已登录的浏览器上下文；localhost / 无登录公开站优先用 Playwright 探针。

### Step 2.5 · 先给复杂度定级，别盲目承诺

根据侦察结果先写一版"复刻前预判"：复杂度 L1-L6、推荐模式（忠实复刻 / 视觉复刻 / 内容爆改）、预计可还原范围、明确不克隆的部分。分级和评分规则见 `references/assessment.md`。

**模式选择纪律（用户没回答确认项时的默认）**：用户说的是"复刻/克隆这个网站"，默认就是**忠实复刻**——还原度是这个场景的第一目标。不许因为"原站是商业站/有版权内容"就自作主张降级成视觉复刻、换占位品牌、用排版块替代摄影图：那会被用户直接感知为"图片没抓下来、字体不对、颜色不还原"。正确姿势是**先忠实复刻到位**（真图真字体真色值全部落地），把版权/商标风险写进 NOTES.md 的"部署前须替换清单"，替换动作留给 Step 6 由用户决定。只有用户明确要"做我自己的站/换成我的品牌"时才走视觉复刻/内容爆改。同理，**不许因为"目标站是风控敏感的 SPA"就跳过脚本侦察**——`recon-site.mjs`/`asset-harvest.mjs` 用的就是真浏览器，先跑再说，跑不通再降级并如实记录。

**若模式是「视觉复刻」或「内容爆改」** → 顺手产出结构化设计身份 `design-dna.json`，把"那个站的感觉"变成可版本化、可对照的 token 规范，让 Step 6 替换时"DNA 留着、内容换掉"有据可依：

```bash
node scripts/dna-scaffold.mjs \
  --recon RECON/original-recon.json \
  --out   RECON/design-dna.json \
  --name  "<站名>"
```

脚本会把侦察到的字体/色候选/框架特效信号 best-effort 预填，其余字段人工 Analyze 补全。三维结构（design_system / design_style / visual_effects）、完整 schema、适用边界见 `references/design-dna.md`。
> ⚠️ **「忠实复刻」分支不要用 DNA**：真源码就是真相，别让"近似风格"的 DNA 稀释逐字节铁律。

### Step 3 · 按侦察结果选路径

| 侦察结果 | 走哪条路 |
|---|---|
| 静态 HTML/CSS，无框架 | `wget --mirror` 抓镜像 → 删追踪脚本 → 改文案 |
| React / Vue / Next（内容为主） | 重建模板（如 `ai-website-cloner-template`，Node 24+），灌内容 |
| SPA / SaaS / 数据驱动页面 | 先跑 `network-capture.mjs` 保存 API fixtures → 本地 JSON/mock server 替身 |
| 多页面官网 / 产品站 | 先跑 `route-crawl.mjs` 做路由地图 → 每类页面抽模板 → 统一替换内容 |
| 复杂交互站 | 先跑 `interaction-probe.mjs` 记录 hover/click/scroll/canvas drag 状态 → 按状态补交互，不许只截首屏 |
| **WebGL / Canvas / Three.js 重前端** | **深度逆向真源码（见下）→ 忠实复刻 或 找同类开源 3D 模板换内容**。单文件原生站常常逐字节保留=最忠实复刻。**找不到真源码时走运行时帧捕获 + baseline 闸门**，纪律见 `references/effect-extraction.md`（可委托 web-shader-extractor） |
| **静态构建站（Astro/Vite SSG/Hugo），含重 WebGL** | **`mirror-site.mjs` 全量镜像部署资产 → 自托管字体 + 删追踪 → 本地 web 根服务 = 真源码 1:1 忠实复刻**。对静态站，"拿到真源码"="镜像部署资产整套"。配方见 `references/static-mirror.md`。范例：oryzo.ai（Lusion，L6，高斯泼溅，hero 像素 diff 5/5） |
| 用现成开源主题的站（Astro/Hugo 主题） | 去对应主题市场找源主题（**仅限套用现成主题的站**；定制站走上一行的全量镜像，别来这行） |

L4-L6 复杂站按 `references/complex-playbooks.md` 走，不要只用普通官网流程。

### Step 4 · 在当前项目里搭工程

```bash
# 当前 Open Design 项目目录就是复刻工作区。
pwd
# git 源码：clone 到 source/ 或直接放入当前目录；单文件：放进来。原始源码留一份只读基准 index-original.html
# 检查 Node 版本（package.json engines），nvm use 对应版本，钉 .nvmrc
```

### Step 5 · 删追踪 + 写元信息 + 验证

- **删追踪**：Google Analytics（`gtag` / `googletagmanager`）、像素、热图——逐行精确切除（GA 块常在 `<head>` 顶部）。
- **Open Design 预览适配**：交付前必须把项目根资源引用改成相对路径，避免 `/reference-assets/...` 在文件预览里打到 Open Design 应用根导致裸 HTML：

```bash
node scripts/od-preview-rewrite.mjs --project .
```

- **写 NOTES.md**（必须）：包含复杂度、复刻模式、原站 vs 克隆站对比、保真度评分、已知缺口。模板见 `references/deliverables.md`。
- **复杂站写 TEARDOWN.md**（技术拆解）。所有结论标真源码行号。
- **复刻后评分**：按 `references/assessment.md` 给结构 / 视觉 / 交互 / 响应式 / 内容替换 / 功能完整度打分。分数要能被截图、源码、运行结果支撑。
- **浏览器真验证**（硬要求，不许只看代码就说"应该能跑"）：起本地服务器 → 浏览器打开 → 抓 console（不能有 JS/WebGL 编译错误）→ 截图对照原站。诚实记录验证不了的部分（如合成 PointerEvent `isTrusted=false` 触发不了拖拽，要如实写，别伪造"拖动成功"）。

复刻完成后再跑一次克隆站侦察，并生成自动对比报告：

```bash
node scripts/recon-site.mjs \
  --url http://127.0.0.1:<端口>/ \
  --out RECON \
  --label clone

node scripts/route-crawl.mjs \
  --url http://127.0.0.1:<端口>/ \
  --out RECON/routes-clone \
  --label clone \
  --max-pages 25 \
  --max-depth 2

node scripts/interaction-probe.mjs \
  --url http://127.0.0.1:<端口>/ \
  --out RECON/interactions-clone \
  --label clone

node scripts/compare-recon.mjs \
  --original RECON/original-recon.json \
  --clone RECON/clone-recon.json \
  --visual-diff RECON/visual-diff-1440.json \
  --original-routes RECON/routes/original-route-map.json \
  --clone-routes RECON/routes-clone/clone-route-map.json \
  --original-interactions RECON/interactions/original-interactions.json \
  --clone-interactions RECON/interactions-clone/clone-interactions.json \
  --out CLONE_REPORT.md

node scripts/visual-diff.mjs \
  --original RECON/screenshots/original-1440.png \
  --clone RECON/screenshots/clone-1440.png \
  --out RECON/visual-diff-1440.json \
  --diff RECON/screenshots/visual-diff-1440.png

# --recon + --strict: 字体/图片/颜色保真硬门槛，有硬伤 exit 2 —— 修完重跑，
# 不通过不许交付。
node scripts/audit-clone.mjs \
  --project . \
  --brand "<原站品牌名>" \
  --recon RECON/original-recon.json \
  --strict \
  --out CLONE_AUDIT.md
```

## 资产与颜色保真（硬性门槛，违反=复刻失败）

复刻最常见的翻车方式不是结构错，而是**字体不对、图片没下、颜色目测**。以下三条是铁律，`audit-clone.mjs --recon --strict` 会机器校验：

1. **字体必须自托管真字体，禁止系统字体近似。**
   原站的字体文件几乎都在第三方 CDN（Typekit / Google Fonts / 品牌自有 CDN），带防盗链——所以必须用 `asset-harvest.mjs --url`（真浏览器网络栈）抓，不能裸 curl。产物 `assets/fonts/fonts.css` 已把 @font-face 改写成本地路径，页面直接 `<link rel="stylesheet" href="assets/fonts/fonts.css">`，然后 `font-family` 逐字照抄 recon JSON 里 `palette.*.fontFamily` / `fontFaces[].family` 的值。写 `-apple-system` / `"Helvetica Neue"` 兜底链顶替原站自定义字体 = 直接不合格。
2. **图片必须落地本地真图，禁止渐变/SVG 占位顶替。**
   `asset-harvest.mjs --url` 会滚动全页把懒加载图、srcset 变体、CSS 背景图全部按 `asset-manifest.json`（originalUrl → localPath）落到 `assets/images/`。构建页面时照 manifest 机械替换引用；某张图下载失败就换 `--recon` 兜底源或从 `RECON/network` 捕获里捞，实在拿不到才允许占位并在 NOTES.md 写明。
3. **颜色必须照抄 recon 的计算值，禁止目测。**
   `RECON/original-recon.json` 的 `palette`（body/header/nav/main/footer/buttons 的 computed backgroundColor/color/borderColor）和 `rootVariables` 就是标准答案；`original-summary.md` 里也有摘要。写 CSS 变量时直接复制这些值——footer 是 `rgb(17,17,17)` 就写 `#111111`，不许写"看起来差不多"的 `#0a0a0a`。
4. **滚动体感必须一致，禁止默认原生滚动了事。**
   recon 的 `frameworks`（lenis / gsap 检测）+ `motion`（`htmlScrollBehavior` / `scroll-snap` 规则数 / sticky·fixed 元素数）就是原站的滚动配方：原站用惯性平滑滚动库就上同款（Lenis 等）或等效实现；有 `scroll-snap` 就还原 snap；sticky 导航、视差、滚动触发动画逐个对齐。验收时用 `interaction-probe.mjs` 的滚动序列截图对照原站，滚动中途的状态（吸顶阴影、进场动画触发点）也要像。

### Step 6 · 替换成 用户自己的内容

目标永远是"做用户自己的站"，不是搬一个一模一样的。替换三件套：文字（`index.html`/`data/*.json`/`content/*.md`）、媒体（`public`/`assets`）、品牌色（CSS 变量 / Tailwind theme）。结构非平凡就写 REPLACE_GUIDE.md。

**做过 `design-dna.json`（视觉/爆改模式）的**：这一步就是它的兑现——**DNA 留着、内容换掉**。把 `design_system` 落成 CSS 自定义属性、按 `design_style` 做主观取舍、按 `visual_effects.effect_intensity` 选实现层级（lightweight CSS / medium Canvas+GSAP / heavy Three.js）；素材优先用 `asset-harvest.mjs` 取原站真图，别 AI 重绘近似。生成流程见 `references/design-dna.md`。

## 逆向拆解 WebGL/Canvas 重前端（核心手艺）

把交互站拆成**技术支柱**，逐柱定位真实实现 + 标行号：渲染（WebGL/着色器算法）、合成（SVG filter / 多 canvas / 后期）、物理、交互、音频。然后才去核对任何二手分析。

**逆向特效时三件套纪律**（治"边抠边美化、最后既不像也说不清"）：
1. **证据分级**：每条结论标 `SOURCE`（真源码/source-map/运行时 dump/帧捕获）、`PARTIAL`（名字/切片，待证）、`GUESS`（视觉拟合/魔数）。**未标=GUESS，照抄前必须升级到 SOURCE。**
2. **no-compensation**：严禁靠调亮度/速度/位置/噪声去掩盖时序/坐标/状态错误；拟合值仍标 GUESS，写明要拿到什么证据才能升级。
3. **baseline-first 闸门**：先用真实 draw call/shader/uniform 做"最小原样可复现 RAW REPLAY"→ 逐帧比对通过 → **才允许**重构工程化。
详见 `references/effect-extraction.md`（含运行时捕获兜底 + 何时委托 web-shader-extractor）。

**可迁移的高级范式**（值得攒着）：
- **位移图折射 DOM**：离屏 WebGL 算出 RG=位移/B=菲涅尔的"位移图"，再用 SVG `<filter><feDisplacementMap scale=N>` 拿它去扭曲真实的、活的、可交互的 HTML——折射的是真 DOM，WebGL 全程不碰 DOM 像素。这是 marbles 的灵魂，也是 Three.js `MeshPhysicalMaterial(transmission)` 做不到的事（它只能做"玻璃球外观"，做不出"折射整个网页"）。

详细方法 + marbles 真架构逐项拆解 → `references/reverse-engineering.md`、`references/marbles-case.md`。

## 许可与署名（clone 前必查）

```bash
SSL_CERT_FILE=/etc/ssl/cert.pem gh api repos/<u>/<r> | jq '.license'  # + 找 LICENSE 文件 + 看 README
```

| 许可 | 能做什么 |
|---|---|
| MIT / Apache / BSD / Unlicense | 可改、可上线，保留致谢即可 |
| **NONE（无 LICENSE 文件 / 未声明）** | **默认保留所有权利**。仅本地学习/复刻，须署名原作者，**未经许可不得公开重新部署**。别因为代码公开就当成可自由用 |
| 专有 / 明确禁止 | 只读学习，不复制不部署 |

⚠️ 别把"GitHub 上是公开的"或"gh api 一时查不到"等同于 MIT——核实到底。

## 产物规范
- 每个子项目根目录：`NOTES.md`（源信息/技术栈/license/替换地图/跑起来命令）
- 复杂交互站追加：`TEARDOWN.md`（技术拆解，标行号）
- 需要对外汇报或评估 skill 效果时追加：`CLONE_REPORT.md`（原站 vs 克隆站完整对比）
- 上线前追加：`CLONE_AUDIT.md`（追踪脚本、原站品牌/语言残留、TODO、外链风险）
- `RECON/screenshots/`：原站 vs 克隆对照图
- 如用户有外部复刻索引，再按需更新该索引；Open Design 项目内不强制维护全局中枢 README。

## 内置脚本
- `scripts/init-clone.mjs`：初始化克隆项目骨架和 `NOTES.md`。
- `scripts/recon-site.mjs`：用 Playwright 打开页面并全程滚动，采集框架/资源/DOM 结构/console 错误、关键区块计算色（`palette`）、@font-face 规则与真实加载的字体/图片资源清单，并保存三档截图。
- `scripts/asset-harvest.mjs`：真浏览器网络栈全程滚动捕获并下载页面真实用到的图片/字体/媒体（含第三方 CDN、防盗链资产），生成 `assets/fonts/fonts.css` 自托管 @font-face 与 originalUrl→localPath 素材清单。
- `scripts/network-capture.mjs`：捕获 XHR/fetch 请求并保存 JSON/text 响应，给 SPA/SaaS 做本地 fixtures。
- `scripts/mirror-site.mjs`：真浏览器全程滚动捕获每一个真实请求 → 按路径镜像同源资产（含 JS 运行时 fetch 的 `.sog/.buf/.wasm/.riv`/字体），给静态构建站（Astro/Vite SSG/Hugo）做 1:1 忠实复刻。详见 `references/static-mirror.md`。
- `scripts/route-crawl.mjs`：爬同站内部链接，按路由保存截图、标题、H1、结构信号，解决多页面站只复刻首页的问题。
- `scripts/interaction-probe.mjs`：自动执行 scroll、hover、安全 click、canvas drag，保存交互前后状态、截图、网络和 console 证据。
- `scripts/sourcemap-hunt.mjs`：从 JS chunk 里找 source map，能拿到就保存源码映射。
- `scripts/compare-recon.mjs`：读取原站与克隆站的侦察 JSON、路由图、交互证据，生成 `CLONE_REPORT.md`。
- `scripts/visual-diff.mjs`：用浏览器 canvas 做截图像素差异，输出 visual score 和差异图。
- `scripts/audit-clone.mjs`：扫描追踪脚本、原站品牌残留、日文残留、TODO、外部 URL 风险；带 `--recon --strict` 时额外校验字体自托管/图片落地/关键区块颜色逐字一致，有硬伤 exit 2。
- `scripts/od-preview-rewrite.mjs`：把 HTML/CSS/SVG 里的项目根资源引用（如 `/reference-assets/main.css`）改成相对路径，保证 Open Design 文件预览和导出 zip 在嵌套路由下仍能加载资源。
- `scripts/dna-scaffold.mjs`：从侦察 JSON 生成 `design-dna.json` 设计身份骨架（字体/色候选/框架特效信号 best-effort 预填），给「视觉复刻 / 内容爆改」模式用。详见 `references/design-dna.md`。

## 能力边界（默认口径）
- **能高保真做**：静态营销页、企业官网、内容型 React/Vue/Next 前端、可直接拿到源码的动画站。
- **能视觉还原但会简化**：CMS 后台数据、复杂滚动叙事、多端断点、WebGL/Canvas 特效、第三方嵌入。
- **默认不承诺完整克隆**：登录、支付、下单、搜索推荐、权限系统、服务端业务逻辑、专有 API、受版权限制的素材。需要时只做可演示前端替身。
- **内容爆改时**：优先保留原站的信息架构、节奏、动效和视觉语法，把文案、图片、品牌色、业务主张换成 用户自己的内容。

## 旗舰案例
`./marbles-clone/` — 原生 WebGL + SVG Filter + 自研物理的玻璃弹珠站，逐字节忠实复刻 + 完整 TEARDOWN，是"WebGL 重前端分支"的范例。
