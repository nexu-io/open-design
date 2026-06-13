# Open Design 插件规范包

语言：[English](README.md) | 简体中文

这个文件夹是给 Open Design 插件作者使用的可共享规范包。它既适合人直接阅读，也适合交给 Claude Code、Codex、Cursor、OpenClaw、Hermes Agent 或其他兼容 Agent Skills 的编码 agent 使用。

Open Design 插件遵循和 Agent Skills 兼容的可移植形态：一个包含 `SKILL.md` 的文件夹，可选添加 assets、references、scripts 和 examples。Open Design 额外使用 `open-design.json` 作为 sidecar，让同一个文件夹可以出现在 OD 插件库里、填充首页输入框、声明 inputs 和 GenUI surfaces、运行 OD atom pipeline，并参与发布或 PR 流程。

## 文件夹地图

- [`SPEC.zh-CN.md`](SPEC.zh-CN.md) - 可移植插件规范与分类。
- [`AGENT-DEVELOPMENT.zh-CN.md`](AGENT-DEVELOPMENT.zh-CN.md) - 可以直接复制给外部 agent 的开发说明。
- [`CONTRIBUTING.zh-CN.md`](CONTRIBUTING.zh-CN.md) - 遵循此规范的插件 PR 标准。
- [`PUBLISHING-REGISTRIES.zh-CN.md`](PUBLISHING-REGISTRIES.zh-CN.md) - 发布到 skills.sh、ClawHub、GitHub 和 Open Design 的策略。
- [`templates/`](templates/) - 空白 starter 文件。
- [`examples/`](examples/) - 完整示例插件文件夹和示例 marketplace index。

英文原文：

- [`SPEC.md`](SPEC.md)
- [`AGENT-DEVELOPMENT.md`](AGENT-DEVELOPMENT.md)
- [`CONTRIBUTING.md`](CONTRIBUTING.md)
- [`PUBLISHING-REGISTRIES.md`](PUBLISHING-REGISTRIES.md)
- [`examples/README.md`](examples/README.md)

## 可以构建什么

工作流主类：

- Import - Figma、GitHub、代码文件夹、URL、截图、PDF、PPTX、Framer、Webflow。
- Create - 原型、幻灯片、live artifact、图像资产、视频 prompt、HyperFrames composition、音频资产。
- Export - PPTX、PDF、HTML、ZIP、Markdown、Figma handoff、Next.js、React、Vue、Svelte、Astro、Angular、Tailwind。
- Share - 公共链接、GitHub PR、Gist、Slack、Discord、Notion、Linear、Jira。
- Deploy - Vercel、Cloudflare Pages、Netlify、GitHub Pages、Fly.io、Render。
- Refine - critique、patch、tune、品牌替换、A/B variants、stakeholder review。
- Extend - 插件作者工具、marketplace 发布、内部目录自动化。

## 五分钟开始

1. 复制 `templates/` 到一个新的插件文件夹。
2. 把文件夹名和 frontmatter `name` 改成小写 id，例如 `launch-deck`。
3. 在 `SKILL.md` 里写清触发描述，格式建议是：“Use this plugin when...”
4. 填写 `open-design.json`：`specVersion`、title、插件 `version`、tags、`od.taskKind`、`od.mode`、`od.useCase.query`、`od.pipeline`、inputs 和 capabilities。
5. 如果插件有视觉输出，添加一个小的 `examples/` 或 `preview/` artifact。
6. 本地校验：

```bash
pnpm guard
pnpm --filter @open-design/plugin-runtime typecheck
```

如果 daemon CLI 已构建：

```bash
od plugin validate ./path/to/plugin
od plugin install ./path/to/plugin
od plugin apply <plugin-id> --input key=value
```

## 兼容性承诺

包含 `SKILL.md` 的文件夹可以作为普通 skill 被兼容 Agent Skills 的客户端使用。添加 `open-design.json` 不应该降低可移植性；它只增加 Open Design 产品行为。

参考：

- Agent Skills overview: https://agentskills.io/home
- Agent Skills specification: https://agentskills.io/specification
- Open Design 插件完整 spec: ../../docs/plugins-spec.zh-CN.md
