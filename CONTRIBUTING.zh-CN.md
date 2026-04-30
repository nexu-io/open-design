# 贡献指南 · Contributing to Open Design

谢谢你愿意参与。OD 是有意做小的 —— 大部分价值在 **文件** 里（skill、design system、提示词片段），而不是框架代码。这意味着收益最高的贡献往往就是一个文件夹、一份 Markdown，或者一个 PR 大小的 adapter。

这份指南会告诉你：每种贡献该往哪里看、合并之前 PR 需要过哪些线。

<p align="center"><a href="CONTRIBUTING.md">English</a> · <b>简体中文</b></p>

---

## 一个下午就能交付的三件事

| 你想要…… | 你其实在加的是 | 它住在哪 | 体量 |
|---|---|---|---|
| 让 OD 渲染一种新的 artifact（一份发票、一个 iOS 设置页、一张 one-pager……） | 一个 **Skill** | [`skills/<your-skill>/`](skills/) | 一个文件夹，约 2 个文件 |
| 让 OD 说一种新品牌的视觉语言 | 一套 **Design System** | [`design-systems/<brand>/DESIGN.md`](design-systems/) | 一个 Markdown 文件 |
| 接入一个新的 coding-agent CLI | 一个 **Agent adapter** | [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) | 一个数组里 ~10 行 |
| 加功能、修 bug、从 [`open-codesign`][ocod] 移植一个 UX 模式 | 代码 | `apps/web/src/`、`apps/daemon/` | 普通 PR |
| 改文档、补中文翻译、修错别字 | 文档 | `README.md`、`README.zh-CN.md`、`docs/`、`QUICKSTART.md` | 一个 PR |

不确定自己想做的属于哪一桶？[先开 issue / discussion](https://github.com/nexu-io/open-design/issues/new)，我们告诉你该改哪个面。

---

## 本地起跑

完整的一页式 setup 在 [`QUICKSTART.md`](QUICKSTART.md)。给贡献者的 TL;DR：

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable           # 使用 packageManager 固定的 pnpm
pnpm install
pnpm tools-dev run web    # daemon + web 前台闭环
pnpm typecheck            # tsc -b --noEmit
pnpm build                # 生产构建
```

要求 Node `~24` 和 pnpm `10.33.x`。`nvm` / `fnm` 是可选路径；如果你习惯用它们，先执行 `nvm install 24 && nvm use 24` 或 `fnm install 24 && fnm use 24`。macOS、Linux、WSL2 是主要路径。Windows 原生应该能跑但不是主要目标 —— 跑不起来请开 issue。

**开发 OD 本身不需要在 `PATH` 上装任何 agent CLI** —— daemon 会告诉你「找不到 agent」并落到 **Anthropic API · BYOK** 路径，反而是最快的开发循环。

---

## 加一个 Skill

一个 skill 就是 [`skills/`](skills/) 下的一个文件夹，根目录放一个 `SKILL.md`，遵循 Claude Code 的 [`SKILL.md` 规范][skill]，再加上我们可选的 `od:` 扩展。**没有注册步骤。** 文件夹丢进来、重启 daemon、picker 里就出现了。

### Skill 文件夹结构

```text
skills/your-skill/
├── SKILL.md                    # 必须
├── assets/template.html        # 可选但强烈推荐 —— seed 模板
├── references/                 # 可选 —— agent 在规划阶段会读的知识文件
│   ├── layouts.md
│   ├── components.md
│   └── checklist.md
└── example.html                # 强烈推荐 —— 一份手搓的真实样例
```

### `SKILL.md` 的 frontmatter

前三个字段是 Claude Code 的基础规范 —— `name`、`description`、`triggers`。`od:` 下面所有字段都是 OD 特有的、可选的，但 **`od.mode`** 决定 skill 出现在哪一组（Prototype / Deck / Template / Design system）。

```yaml
---
name: your-skill
description: |
  一段电梯演讲。Agent 会原样读这段来判断用户的需求是否匹配。
  写具体一点：surface、受众、artifact 里有什么、没有什么。
triggers:
  - "your trigger phrase"
  - "another phrase"
  - "中文触发词"
od:
  mode: prototype           # prototype | deck | template | design-system
  platform: desktop         # desktop | mobile
  scenario: marketing       # 自由 tag，用来分组
  featured: 1               # 任何正整数都会让它出现在「Showcase examples」
  preview:
    type: html              # html | jsx | pptx | markdown
    entry: index.html
  design_system:
    requires: true          # 这个 skill 是否会读激活的 DESIGN.md
    sections: [color, typography, layout, components]
  example_prompt: "一段可复制粘贴的提示词，最能体现这个 skill 的能力。"
---

# Your Skill

正文是自由 Markdown，描述 agent 应该走的工作流……
```

完整 grammar —— 类型化输入、滑块参数、能力 gating —— 在 [`docs/skills-protocol.md`](docs/skills-protocol.md)。

### 合并新 skill 的硬线

Skill 是用户直接看到的面，所以我们对它挑剔。一个新 skill 必须：

1. **附一份真实的 `example.html`。** 手搓的、本地直接打开就能看、像设计师真的会交付的东西。不要 lorem ipsum，不要 `<svg><rect/></svg>` 占位 hero。如果你自己都不能搓出 example，这个 skill 大概率还没准备好。
2. **过 anti-AI-slop checklist**（写在 body 里）。不准紫色渐变、不准通用 emoji 图标、不准左 border 圆角卡片、不准把 Inter 当 *display* 字体、不准自编数据。完整黑名单看 README 的「Anti-AI-slop machinery」一节。
3. **诚实占位。** Agent 没真数字时写 `—` 或一个标注的灰块，绝不写「快 10 倍」。
4. **附 `references/checklist.md`**，至少要有 P0 关卡（agent emit `<artifact>` 之前必须过的硬线）。格式照搬 [`skills/guizang-ppt/references/checklist.md`](skills/guizang-ppt/) 或 [`skills/dating-web/references/checklist.md`](skills/dating-web/)。
5. **如果是 featured skill，加一张截图** 到 `docs/screenshots/skills/<skill>.png`。PNG 格式，约 1024×640 retina，从真实 `example.html` 上以缩小后的浏览器倍率截。
6. **是一个自包含文件夹。** CDN 引入不能超过其他 skill 已经引入的；不准用没授权的字体；图片不要超过约 250 KB。

如果你 fork 了一个现有 skill（比如从 `dating-web` 改成 `recruiting-web`），保留原 LICENSE 和原作者归属在 `references/` 里，并在 PR 描述里点出来。

### 已有的 skill —— 挑一个像的来抄

- 视觉 showcase、单屏原型：[`skills/dating-web/`](skills/dating-web/)、[`skills/digital-eguide/`](skills/digital-eguide/)
- 多屏移动流程：[`skills/mobile-onboarding/`](skills/mobile-onboarding/)、[`skills/gamified-app/`](skills/gamified-app/)
- 文档 / 模板（不需要 design system）：[`skills/pm-spec/`](skills/pm-spec/)、[`skills/weekly-update/`](skills/weekly-update/)
- Deck 模式：[`skills/guizang-ppt/`](skills/guizang-ppt/)（来自 [op7418/guizang-ppt-skill][guizang]，原样捆绑）和 [`skills/simple-deck/`](skills/simple-deck/)

---

## 加一套 Design System

一套 design system 就是 `design-systems/<slug>/` 下的一个 [`DESIGN.md`](design-systems/README.md) 文件。**一个文件，零代码。** 丢进来、重启 daemon、picker 按 category 分组显示出来。

### Design system 文件夹结构

```text
design-systems/your-brand/
└── DESIGN.md
```

### `DESIGN.md` 形态

```markdown
# Design System Inspired by YourBrand

> Category: Developer Tools
> 一行总结，会显示在 picker 的预览里。

## 1. Visual Theme & Atmosphere
…

## 2. Color
- Primary: `#hex` / `oklch(...)`
- …

## 3. Typography
…

## 4. Spacing & Grid
## 5. Layout & Composition
## 6. Components
## 7. Motion & Interaction
## 8. Voice & Brand
## 9. Anti-patterns
```

9 段式 schema 是固定的 —— skill body 会按这个结构 grep 内容。第一行 H1 会成为 picker 的标签（`Design System Inspired by` 前缀会被自动剥掉），`> Category: …` 那一行决定它落到哪个组。已有的 category 列表在 [`design-systems/README.md`](design-systems/README.md)；如果你的品牌真的塞不进任何一个，可以新增 category，但**优先尝试现有 category**。

### 合并新 design system 的硬线

1. **9 个 section 都要在。** Section 内容空着可以（比如真的找不到 motion token），但标题必须保留，否则提示词的 grep 会断。
2. **Hex 是真的。** 直接从品牌官网或产品里取色，不准从记忆里掏，不准让 AI 猜。README 里那套 5 步「品牌资产协议」对维护者一样适用。
3. **强调色给 OKLch 是加分项。** 让色板在亮 / 暗模式之间能可预测地 lerp。
4. **不要营销废话。** 品牌的 tagline 不是设计 token。删掉。
5. **slug 用 ASCII** —— `linear.app` 写成 `linear-app`，`x.ai` 写成 `x-ai`。已经导入的 69 套都遵循这个约定，跟着写。

我们内置的 69 套产品系统是通过 [`scripts/sync-design-systems.ts`](scripts/sync-design-systems.ts) 从 [`VoltAgent/awesome-design-md`][acd2] 导入的。如果你的品牌应该归属在上游，**请先把 PR 发到那里** —— 我们下一次同步会自动收上来。`design-systems/` 文件夹用来放那些**不适合归到上游**的系统、加上我们手写的两套 starter。

---

## 接入一个新的 coding-agent CLI

接入一个新 agent（比如某个新 shop 的 `foo-coder` CLI）就是在 [`apps/daemon/src/agents.ts`](apps/daemon/src/agents.ts) 里加一项：

```javascript
{
  id: 'foo',
  name: 'Foo Coder',
  bin: 'foo',
  versionArgs: ['--version'],
  buildArgs: (prompt) => ['exec', '-p', prompt],
  streamFormat: 'plain',           // 如果它说 claude-stream-json 就写那个
}
```

完事 —— daemon 会在 `PATH` 上检测到它、picker 显示出来、对话路径就通了。如果这个 CLI 吐 **类型化事件**（像 Claude Code 的 `--output-format stream-json`），在 [`apps/daemon/src/claude-stream.ts`](apps/daemon/src/claude-stream.ts) 里写一个 parser，并把 `streamFormat` 设成 `'claude-stream-json'`。

合并硬线：

1. **真的跑通一次端到端会话** —— 把 daemon 日志贴在 PR 描述里，证明它流出了一个 artifact。
2. **更新 [`docs/agent-adapters.md`](docs/agent-adapters.md)**，写清楚这个 CLI 的怪癖（要不要 key 文件？支不支持图片输入？非交互模式的 flag 是什么？）。
3. **README 的「Supported coding agents」表里加一行**。

---

## 代码风格

格式我们不抠（保存时跑 Prettier 就行），但有两条不能让 —— 因为它们出现在提示词栈和用户可见的 API 里：

1. **JS/TS 用单引号。** 字符串一律单引号，除非转义太丑。代码库已经是一致的，请保持一致。
2. **代码注释用英文。** 即使 PR 是把某段翻译成中文，代码注释也保留英文，这样我们能维护一份可 grep 的引用集。

除此之外：

- **不要写废话注释。** 不要 `// 引入这个模块`、不要 `// 遍历元素`。如果代码本身一眼能读，注释就是噪音。注释只用来说明非显而易见的意图、或者代码本身表达不出来的约束。
- **`apps/web/src/` 用 TypeScript。** Daemon (`apps/daemon/`) 是纯 ESM JavaScript，类型重要的地方用 JSDoc —— 保持这样。
- **不要随便加顶层依赖。** PR 描述里至少要有一段，说明引入它能换到什么、又新增了多少 bundle 字节。[`package.json`](package.json) 的依赖少是有意为之。
- **推之前跑 `pnpm typecheck`。** CI 会跑；挂了会换来一句「请修一下」。

---

## Commit 与 PR

- **一个 PR 只做一件事。** 加 skill + 重构 parser + 升依赖，是三个 PR。
- **标题用动词起头 + 范围。** `add dating-web skill`、`fix daemon SSE backpressure when CLI hangs`、`docs: clarify .od layout`。
- **正文解释 why。** 「这个 PR 改了什么」从 diff 一般能看出来；「为什么要改」很少能。
- **如果有 issue，引用它。** 没有、且改动非平凡，请先开 issue 让我们先就「值不值得做」达成一致，再投入时间。
- **Review 期间不要 squash。** 推 fixup commit；merge 时我们会 squash。
- **不要 force-push 共享分支**，除非 reviewer 主动让你这么做。

我们不强制 CLA。Apache-2.0 已经覆盖；你的贡献按同样的 license 授权。

---

## 报 bug

开 issue 时请带上：

- 你跑的命令（精确到 `pnpm tools-dev ...`）。
- 选中的 agent CLI 是哪个（或者你走的是 BYOK 路径）。
- 触发问题时的 skill + design system 组合。
- 相关的 **daemon stderr 末尾几行** —— 大多数「artifact 没渲染出来」的报告，看到 `spawn ENOENT` 或 CLI 实际报错后 30 秒就能定位。
- UI 问题贴一张截图。

提示词栈相关的 bug（「agent 吐了一个紫色渐变 hero，slop 黑名单不是禁了吗」），请贴 **完整的助手消息**，方便我们判断违规来自模型还是提示词。

---

## 提问

- 架构问题、设计问题、「这是 bug 还是误用」 → 请用 [GitHub Discussions](https://github.com/nexu-io/open-design/discussions)（首选 —— 下一个人能搜到）。
- 「我想写一个干 X 的 skill 怎么写」 → 开一个 discussion。我们会回答，且如果是缺失的模式，答案会被收进 [`docs/skills-protocol.md`](docs/skills-protocol.md)。

---

## 我们不接收的 PR

为了保持项目聚焦，请不要发以下类型的 PR：

- **Vendor 一个模型运行时。** OD 整个赌注就是「你已有的 CLI 就够了」。我们不带 `pi-ai`、不带 OpenAI key、不带模型加载器。
- **未经讨论不要把前端重写到别的栈。** Next.js 16 App Router + React 18 + TS 是当前底线。不要随手改成 Astro / Solid / Svelte 或其他框架。
- **把 daemon 换成 serverless function。** Daemon 的存在意义就是拥有真实的 `cwd` 和 spawn 真实的 CLI。SPA 部署 Vercel 没问题，daemon 仍然是 daemon。
- **加 telemetry / 分析 / phone-home。** OD 是 local-first。唯一的对外请求是用户明确配置的 provider。
- **打包二进制** 而没有附 license 文件和原作者归属。

不确定自己的想法合不合适？开个 discussion 再写代码。

---

## License

提交贡献即代表你同意你的贡献按本仓库的 [Apache-2.0 License](LICENSE) 授权。例外是 [`skills/guizang-ppt/`](skills/guizang-ppt/) 下的所有文件，保留它们原始的 MIT license 和原作者 [op7418](https://github.com/op7418) 的归属。

[skill]: https://docs.anthropic.com/en/docs/claude-code/skills
[guizang]: https://github.com/op7418/guizang-ppt-skill
[acd2]: https://github.com/VoltAgent/awesome-design-md
[ocod]: https://github.com/OpenCoworkAI/open-codesign
