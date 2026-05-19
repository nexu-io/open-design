# 贡献插件

语言：[English](CONTRIBUTING.md) | 简体中文

遵循本规范的插件可以作为示例放在这个仓库，也可以放在独立公开仓库中，再通过 PR 把它加入 marketplace index。

## 接受的贡献类型

- 新示例插件：`plugins/spec/examples/<plugin-id>/`。
- 模板、作者文档、evals 或 PR checklist 的改进。
- 提升插件在 Agent Skills 兼容客户端之间可移植性的修复。
- 指向公开插件仓库的 marketplace index 更新。
- skills.sh、ClawHub 或其他专用 skill registry 的发布说明。

## Review Checklist

Reviewer 应检查：

- 插件包含可移植的 `SKILL.md`。
- `open-design.json` 声明 `specVersion` 和插件 `version`。
- `open-design.json` 没有复制 skill 正文。
- 插件主类清晰：import、create、export、share、deploy、refine 或 extend。
- create 插件的输出模式清晰：prototype、deck、live-artifact、image、video、hyperframes、audio 或 design-system。
- capabilities 是最小必要集合。
- 对外可见的操作有用户确认。
- 视觉类示例包含 preview 或具体输出。
- registry 发布声明链接到 canonical source，且不暗示 registry 背书。
- JSON 合法，PR 中列出了验证命令。

## PR 模板

```markdown
## Plugin

- ID:
- Spec version:
- Plugin version:
- Lane:
- Mode:
- Source:

## What it does

## Trigger examples

## Capabilities

## Validation

## Screenshots or example outputs

## Registry publishing

- Canonical source:
- Marketplace catalog version:
- skills.sh:
- ClawHub:
- Other registries:
```
