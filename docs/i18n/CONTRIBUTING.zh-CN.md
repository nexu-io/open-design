# 贡献指南 · Contributing to Open Design

谢谢你愿意参与。OD 是有意做小的 —— 大部分价值在 **文件** 里（skill、design system、提示词片段），而不是框架代码。这意味着收益最高的贡献往往就是一个文件夹、一份 Markdown，或者一个 PR 大小的 adapter。

这份指南会告诉你：每种贡献该往哪里看、合并之前 PR 需要过哪些线。

<p align="center"><a href="../../CONTRIBUTING.md">English</a> · <a href="CONTRIBUTING.pt-BR.md">Português (Brasil)</a> · <a href="CONTRIBUTING.de.md">Deutsch</a> · <a href="CONTRIBUTING.fr.md">Français</a> · <b>简体中文</b> · <a href="CONTRIBUTING.ja-JP.md">日本語</a> · <a href="CONTRIBUTING.ko.md">한국어</a> · <a href="CONTRIBUTING.th.md">ภาษาไทย</a></p>

---

## 一个下午就能交付的三件事

| 你想要…… | 你其实在加的是 | 它住在哪 | 体量 |
|---|---|---|---|
| 让 OD 渲染一种新的 artifact（一份发票、一个 iOS 设置页、一张 one-pager……） | 一个**设计模板** | [`design-templates/<your-template>/`](../../design-templates/) | 一个包含 `SKILL.md` 与渲染资源的文件夹 |
| 添加一项 agent 在任务中调用的功能能力 | 一个 **Skill** | [`skills/<your-skill>/`](../../skills/) | 一个包含 `SKILL.md` 与可选资源的文件夹 |
| 让 OD 说一种新品牌的视觉语言 | 一套 **Design System** | [`design-systems/<brand>/`](../../design-systems/) | 一个包：`manifest.json`、`DESIGN.md` 和 `tokens.css` |
| 接入一个新的 coding-agent CLI | 一个 **Agent adapter** | [`apps/daemon/src/runtimes/defs/`](../../apps/daemon/src/runtimes/defs/) | 一个定义和一条注册项 |
| 加功能、修 bug、从 [`open-codesign`][ocod] 移植一个 UX 模式 | 代码 | `apps/web/src/`、`apps/daemon/` | 普通 PR |
| 改文档、补法语 / 德语 / 中文翻译、修错别字 | 文档 | `README.md`、`README.fr.md`、`README.de.md`、`README.zh-CN.md`、`docs/`、`QUICKSTART.zh-CN.md` | 一个 PR |

不确定自己想做的属于哪一桶？[先开 issue / discussion](https://github.com/nexu-io/open-design/issues/new)，我们告诉你该改哪个面。

---

## 本地起跑

完整的一页式 setup 在 [`QUICKSTART.zh-CN.md`](QUICKSTART.zh-CN.md)。给贡献者的 TL;DR：

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
corepack enable           # 使用 packageManager 固定的 pnpm
pnpm install
pnpm tools-dev run web    # daemon + web 前台闭环
pnpm typecheck            # tsc -b --noEmit
pnpm --filter @open-design/web build  # 需要时构建 web package
```

要求 Node `~24` 和 pnpm `10.33.x`。`nvm` / `fnm` 是可选路径；如果你习惯用它们，先执行 `nvm install 24 && nvm use 24` 或 `fnm install 24 && fnm use 24`。macOS、Linux、WSL2 是主要路径。Windows 原生已支持；常见的安装与配置坑请参见 [`docs/windows-troubleshooting.md`](../../docs/windows-troubleshooting.md)。

**开发 OD 本身不需要在 `PATH` 上装任何 agent CLI** —— daemon 会告诉你「找不到 agent」并落到 **Anthropic API · BYOK** 路径，反而是最快的开发循环。

---

## 加一个设计模板

一个设计模板就是 [`design-templates/`](../../design-templates/) 下的一个文件夹，根目录放一个 `SKILL.md`，遵循 Claude Code 的 [`SKILL.md` 规范][skill]，再加上我们可选的 `od:` 扩展。它把 Templates 图库中一种 artifact 的形态与渲染资源打包在一起。

### → 完整指南见 [`docs/skills-contributing.md`](../../docs/skills-contributing.md)

### 设计模板文件夹结构

```text
design-templates/your-template/
├── SKILL.md                    # 必须
├── assets/template.html        # 可选但强烈推荐 —— seed 模板
├── references/                 # 可选 —— agent 在规划阶段会读的知识文件
│   ├── layouts.md
│   ├── components.md
│   └── checklist.md
└── example.html                # 强烈推荐 —— 一份手搓的真实样例
```

### `SKILL.md` 的 frontmatter

前三个字段是 Claude Code 的基础规范 —— `name`、`description`、`triggers`。`od:` 下面所有字段都是 OD 特有的、可选的，但 **`od.mode`** 决定模板出现在哪一组（Prototype / Deck / Template / Design system）。

```yaml
---
name: your-template
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
  design_system:
    requires: true          # 这个模板是否会读激活的 DESIGN.md
  craft:
    requires: [typography, color, anti-ai-slop]
  example_prompt: "一段可复制粘贴的提示词，最能体现这个模板的能力。"
---

# Your Template

正文是自由 Markdown，描述 agent 应该走的工作流……
```

完整的活跃 grammar（`od.mode`、`od.surface`、`od.craft.requires`、`od.critique.policy`、gallery hints 等）在 [`docs/skills-protocol.md`](../../docs/skills-protocol.md)。旧的便携字段如 `od.inputs`、`od.parameters` 和 `od.capabilities_required` 可能仍会出现在外部 bundle 里，但 skill/template registry 不会消费它们。

### 合并新设计模板的硬线

设计模板是用户直接看到的面，所以我们对它挑剔。一个新模板必须：

1. **附一份真实的 `example.html`。** 手搓的、本地直接打开就能看、像设计师真的会交付的东西。不要 lorem ipsum，不要 `<svg><rect/></svg>` 占位 hero。如果你自己都不能搓出 example，这个模板大概率还没准备好。
2. **过 anti-AI-slop checklist**（写在 body 里）。不准紫色渐变、不准通用 emoji 图标、不准左 border 圆角卡片、不准把 Inter 当 *display* 字体、不准自编数据。完整黑名单看 README 的「Anti-AI-slop machinery」一节。
3. **诚实占位。** Agent 没真数字时写 `—` 或一个标注的灰块，绝不写「快 10 倍」。
4. **附 `references/checklist.md`**，至少要有 P0 关卡（agent emit `<artifact>` 之前必须过的硬线）。格式照搬 [`design-templates/guizang-ppt/references/checklist.md`](../../design-templates/guizang-ppt/) 或 [`design-templates/dating-web/references/checklist.md`](../../design-templates/dating-web/)。
5. **如果是 featured 模板，加一张截图** 到 `docs/screenshots/skills/<skill>.png`。PNG 格式，约 1024×640 retina，从真实 `example.html` 上以缩小后的浏览器倍率截。
6. **是一个自包含文件夹。** CDN 引入不能超过其他模板已经引入的；不准用没授权的字体；图片不要超过约 250 KB。

如果你 fork 了一个现有设计模板（比如从 `dating-web` 改成 `recruiting-web`），保留原 LICENSE 和原作者归属在 `references/` 里，并在 PR 描述里点出来。

### 已有的设计模板 —— 挑一个像的来抄

- 视觉 showcase、单屏原型：[`design-templates/dating-web/`](../../design-templates/dating-web/)、[`design-templates/digital-eguide/`](../../design-templates/digital-eguide/)
- 多屏移动流程：[`design-templates/mobile-onboarding/`](../../design-templates/mobile-onboarding/)、[`design-templates/gamified-app/`](../../design-templates/gamified-app/)
- 文档 / 模板（不需要 design system）：[`design-templates/pm-spec/`](../../design-templates/pm-spec/)、[`design-templates/weekly-update/`](../../design-templates/weekly-update/)
- Deck 模式：[`design-templates/guizang-ppt/`](../../design-templates/guizang-ppt/)（来自 [op7418/guizang-ppt-skill][guizang]，原样捆绑）和 [`design-templates/simple-deck/`](../../design-templates/simple-deck/)

---

## 加一个功能 Skill

功能 Skill 是 agent 在任务中调用、用来处理用户输入的能力。先读 [`skills/README.md`](../../skills/README.md) 了解功能 Skill 与设计模板的职责边界，再读 [`skills/AGENTS.md`](../../skills/AGENTS.md) 了解文件夹契约；共用的 `SKILL.md` grammar 在 [`docs/skills-protocol.md`](../../docs/skills-protocol.md)。Daemon 的 lazy scanner 会在下一次 `/api/skills` 请求时重新扫描 Skill roots，所以本地新增 Skill 不需要重新构建，也不需要重启 daemon。

---

## 加一套 Design System

仓库里的新 design system 是 [`design-systems/<slug>/`](../../design-systems/) 下的一个 package，不再是单独的 Markdown 文件。当前内置的 151 套系统已经全部迁移到下面的 package contract。为了兼容旧内容或用户安装内容，daemon 仍能发现只有 `DESIGN.md` 的 legacy 文件夹，但新内置系统不应再采用这种形态。Catalog 会在每次 `/api/design-systems` 请求时重新扫描；编辑后刷新 Design System 界面即可，不需要重启 daemon。

### 最小 package 结构

```text
design-systems/your-brand/
├── manifest.json
├── DESIGN.md
└── tokens.css
```

`manifest.json` 保存稳定 id、展示名称、category、description、provenance 与已声明的 package 路径。`DESIGN.md` 向 agent 说明设计意图；`tokens.css` 是规范的已编译语义 token 样式表。完整契约见 [`docs/design-systems.md`](../../docs/design-systems.md) 与 [`design-systems/_schema/AGENTS.md`](../../design-systems/_schema/AGENTS.md)。

### `DESIGN.md` 形态

```markdown
# YourBrand Design System

## Visual Theme
…

## Color Roles
…

## Typography
…

## Layout and Spacing
## Components and States
## Motion and Interaction
## Accessibility
## Anti-patterns
```

这里没有固定的 9 段式 schema。Package quality guard 要求至少 7 个有实质内容的 H2，但不限定名称、顺序或编号；请使用真正适合这套系统的标题。

### 合并新 design system 的硬线

1. **三个必需文件都要提交。** 文件夹 slug 必须与 `manifest.id` 一致，并使用规范化 ASCII（`linear.app` → `linear-app`、`x.ai` → `x-ai`）。
2. **至少写 7 个有实质内容的 H2。** 不要只为凑数量添加空标题。
3. **让正文与 token 保持一致。** `DESIGN.md` 中的颜色、字体、间距和动效决定必须与 `tokens.css` 一致，并通过共享 token guard。
4. **使用真实证据和清晰 provenance。** 从源产品或官网直接取样，并在 manifest/package evidence 中记录来源。
5. **写有用的 catalog 文案。** `manifest.name`、`category`、`description` 是 picker 的主要 metadata；不要塞营销废话。

上游派生的产品系统通过 [`scripts/sync-design-systems.ts`](../../scripts/sync-design-systems.ts) 从 [`VoltAgent/awesome-design-md`][acd2] 导入。如果你的品牌应该归属在上游，**请先把 PR 发到那里** —— 我们下一次同步会自动收上来。`design-systems/` 还包含不适合归到上游、由本项目维护的补充系统。

---

## 接入一个新的 coding-agent CLI

接入一个新 agent（比如某个新 shop 的 `foo-coder` CLI）需要在 [`apps/daemon/src/runtimes/defs/`](../../apps/daemon/src/runtimes/defs/) 中添加定义，并在 `runtimes/registry.ts` 注册：

```ts
import type { RuntimeAgentDef } from '../types.js';

export const fooAgentDef = {
  id: 'foo',
  name: 'Foo Coder',
  bin: 'foo',
  versionArgs: ['--version'],
  fallbackModels: [{ id: 'default', label: 'Default', default: true }],
  buildArgs: (prompt) => ['exec', '-p', prompt],
  streamFormat: 'plain',           // 如果它说 claude-stream-json 就写那个
} satisfies RuntimeAgentDef;
```

把定义 import 到 [`runtimes/registry.ts`](../../apps/daemon/src/runtimes/registry.ts) 并加入 `BASE_AGENT_DEFS` 后，共用引擎会在 `PATH` 上检测它、在 picker 中展示，并构造调用参数。Wire shape 相同时复用已有的 `streamFormat`。真正新增一种 wire format 时，还要在 [`apps/daemon/src/runtimes/`](../../apps/daemon/src/runtimes/) 或 [`apps/daemon/src/agent-protocol/`](../../apps/daemon/src/agent-protocol/) 下添加 parser、parser tests，并在 [`server.ts`](../../apps/daemon/src/server.ts) 的 stream dispatch 中增加对应分支。

合并硬线：

1. **真的跑通一次端到端会话** —— 把 daemon 日志贴在 PR 描述里，证明它流出了一个 artifact。
2. **更新 [`docs/agent-adapters.md`](../../docs/agent-adapters.md)**，写清楚这个 CLI 的怪癖（要不要 key 文件？支不支持图片输入？非交互模式的 flag 是什么？）。
3. **README 的「Supported coding agents」表里加一行**。

---

## 更新模型 `max_tokens` 元数据

API 模式下每次请求都会带 `max_tokens` 给上游。Web 端通过 [`apps/web/src/state/maxTokens.ts`](../../apps/web/src/state/maxTokens.ts) 的三层 lookup 决定这个数字：

1. 用户在 Settings 里手填的覆盖值（如果有）。
2. 否则用 [`apps/web/src/state/litellm-models.json`](../../apps/web/src/state/litellm-models.json) 里的 per-model 默认 —— 这是从 [BerriAI/litellm][litellm] 的 `model_prices_and_context_window.json`（MIT）摘的一份切片，覆盖约 2000 个 chat 模型，包括 Anthropic、OpenAI、DeepSeek、Groq、Together、Mistral、Gemini、Bedrock、Vertex、OpenRouter 等。
3. 都 miss 就走 `FALLBACK_MAX_TOKENS = 8192`。

新模型上线想吃到默认值，重新生成 vendored JSON：

```bash
node --experimental-strip-types scripts/sync-litellm-models.ts
```

脚本会拉 LiteLLM 的最新 catalog、过滤 `mode: 'chat'`、把每条投影到 `max_output_tokens`（缺失时 fallback 到 `max_tokens`），写成排好序的快照。把重新生成的 `litellm-models.json` 跟着触发它的 PR 一起提。

`maxTokens.ts` 里的 OVERRIDES 表只用于 LiteLLM 没收 / 收错的 model id —— 比如 `mimo-v2.5-pro`（LiteLLM 只收了 `openrouter/xiaomi/...` 和 `novita/xiaomimimo/...` 两个 alias，model id 跟小米直接 API 用的不一样）。表要保持小：凡是 LiteLLM 已经对的，**不要**抄进来。

[litellm]: https://github.com/BerriAI/litellm

---

## 代码风格

格式我们不抠（保存时跑 Prettier 就行），但有两条不能让 —— 因为它们出现在提示词栈和用户可见的 API 里：

1. **JS/TS 用单引号。** 字符串一律单引号，除非转义太丑。代码库已经是一致的，请保持一致。
2. **代码注释用英文。** 即使 PR 是把某段翻译成中文，代码注释也保留英文，这样我们能维护一份可 grep 的引用集。

除此之外：

- **不要写废话注释。** 不要 `// 引入这个模块`、不要 `// 遍历元素`。如果代码本身一眼能读，注释就是噪音。注释只用来说明非显而易见的意图、或者代码本身表达不出来的约束。
- **`apps/web/src/` 用 TypeScript。** Daemon (`apps/daemon/`) 是纯 ESM JavaScript，类型重要的地方用 JSDoc —— 保持这样。
- **不要随便加顶层依赖。** PR 描述里至少要有一段，说明引入它能换到什么、又新增了多少 bundle 字节。[`package.json`](../../package.json) 的依赖少是有意为之。
- **推之前跑 `pnpm typecheck`。** CI 会跑；挂了会换来一句「请修一下」。

---

## Commit 与 PR

- **一个 PR 只做一件事。** 加 skill + 重构 parser + 升依赖，是三个 PR。
- **标题用动词起头 + 范围。** `add dating-web skill`、`fix daemon SSE backpressure when CLI hangs`、`docs: clarify storage contract`。
- **使用 PR 模板。** 把 [`.github/pull_request_template.md`](../../.github/pull_request_template.md) 的每一节都填上 —— Why、What users will see、Surface area、Screenshots（如果有 UI 改动）、Bug fix verification（如果是修 bug）、Validation。留空的节会被 reviewer 回 "please fill in"。
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
- 「我想写一个干 X 的 skill 怎么写」 → 开一个 discussion。我们会回答，且如果是缺失的模式，答案会被收进 [`docs/skills-protocol.md`](../../docs/skills-protocol.md)。

---

## 我们不接收的 PR

为了保持项目聚焦，请不要发以下类型的 PR：

- **Vendor 一个模型运行时。** OD 整个赌注就是「你已有的 CLI 就够了」。我们不带 `pi-ai`、不带 OpenAI key、不带模型加载器。
- **未经讨论不要把前端重写到别的栈。** Next.js 16 App Router + React 18 + TS 是当前底线。不要随手改成 Astro / Solid / Svelte 或其他框架。
- **把 daemon 换成 serverless function。** Daemon 的存在意义就是拥有真实的 `cwd` 和 spawn 真实的 CLI。SPA 部署 Vercel 没问题，daemon 仍然是 daemon。
- **在隐私契约之外增加 telemetry 或对外数据收集。** 产品分析与经过遮罩的 session replay 需要用户同意；在已配置的构建中，经过脱敏的安全性/可靠性 telemetry 始终启用。任何新事件、字段或目标都必须遵守 [`PRIVACY.md`](../../PRIVACY.md) 规定的同意、最小化与脱敏边界。
- **打包二进制** 而没有附 license 文件和原作者归属。

不确定自己的想法合不合适？开个 discussion 再写代码。

---

## 想成为 Maintainer

如果你已经在持续贡献并想了解成为 Maintainer 的路径——完整规则在 **[`MAINTAINERS.md`](../../MAINTAINERS.md)**。简版如下：

- Maintainer 可以 review、approve、关闭 issue。Merge 按钮保留在 Core Team——**你的 approve 仍算作 merge 所需的那一个 approve**。
- 门槛：**≥ 20 个 merged PR** + 公开的账号质量检查（防 bot / 防小号）+ Core Team 对贡献质量的判断。**没有申请表**——Core Team 在内部识别候选人后会主动联系。
- **没有 quota，没有 SLA，没有固定任期。** 退出很容易也可逆（Emeritus → 生活忙完后回归）。
- 全部门槛阈值、提名流程、退出规则、早期项目例外条款都在 [`MAINTAINERS.md`](../../MAINTAINERS.md)——上面任何一条勾起兴趣的话，去读那份文档。

tl;dr：好好提 PR、认真 review、在 [Discussions][discussions] / [Discord][discord] 多冒泡，剩下的自然会发生。

[discussions]: https://github.com/nexu-io/open-design/discussions
[discord]: https://discord.gg/mHAjSMV6gz

---

## License

提交贡献即代表你同意你的贡献按本仓库的 [Apache-2.0 License](../../LICENSE) 授权。例外是 [`design-templates/guizang-ppt/`](../../design-templates/guizang-ppt/) 下的所有文件，保留它们原始的 MIT license 和原作者 [op7418](https://github.com/op7418) 的归属。

[skill]: https://docs.anthropic.com/en/docs/claude-code/skills
[guizang]: https://github.com/op7418/guizang-ppt-skill
[acd2]: https://github.com/VoltAgent/awesome-design-md
[ocod]: https://github.com/OpenCoworkAI/open-codesign
