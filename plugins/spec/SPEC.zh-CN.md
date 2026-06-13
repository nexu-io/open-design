# Open Design 插件规范

语言：[English](SPEC.md) | 简体中文

这是可移植 Open Design 插件的精简契约。完整产品规范仍以 `docs/plugins-spec.zh-CN.md` 为准；本文档面向贡献者和外部编码 agent。

## 1. 最小插件

每个可发布插件都应该是一个包含 `SKILL.md` 的目录：

```text
my-plugin/
  SKILL.md
```

`SKILL.md` 是可移植 agent contract。它必须包含 YAML frontmatter：

```yaml
---
name: my-plugin
description: Use this plugin when the user wants...
---
```

文件夹名、`name` 和 manifest `name` 应保持一致。使用小写字母、数字和连字符。

## 2. 增强版 Open Design 插件

当插件需要出现在 Open Design marketplace 卡片或 starter 中时，添加 `open-design.json`：

```text
my-plugin/
  SKILL.md
  open-design.json
  README.md
  preview/
  examples/
  assets/
  references/
  evals/
```

`open-design.json` 指向 skill，并声明产品表面：

```json
{
  "$schema": "https://open-design.ai/schemas/plugin.v1.json",
  "specVersion": "1.0.0",
  "name": "my-plugin",
  "title": "My Plugin",
  "version": "0.1.0",
  "description": "One sentence marketplace description.",
  "license": "MIT",
  "tags": ["create", "prototype"],
  "compat": {
    "agentSkills": [{ "path": "./SKILL.md" }]
  },
  "od": {
    "kind": "skill",
    "taskKind": "new-generation",
    "mode": "prototype",
    "scenario": "product",
    "useCase": {
      "query": "Create a prototype for {{audience}} about {{topic}}."
    },
    "pipeline": {
      "stages": [
        { "id": "discovery", "atoms": ["discovery-question-form"] },
        { "id": "plan", "atoms": ["direction-picker", "todo-write"] },
        { "id": "generate", "atoms": ["file-write", "live-artifact"] },
        {
          "id": "critique",
          "atoms": ["critique-theater"],
          "repeat": true,
          "until": "critique.score>=4 || iterations>=3"
        }
      ]
    },
    "inputs": [
      { "name": "audience", "type": "string", "required": true },
      { "name": "topic", "type": "string", "required": true }
    ],
    "capabilities": ["prompt:inject", "fs:write"]
  }
}
```

## 3. 工作流分类

每个插件使用一个主类。把主类放进 `tags`、`od.scenario` 或 `od.mode`，便于搜索和 facet 分类。

| 主类 | 适用场景 | 常见 `taskKind` | 常用 atoms |
| --- | --- | --- | --- |
| `import` | 把外部来源带入 OD | `figma-migration` 或 `code-migration` | `figma-extract`, `code-import`, `design-extract`, `token-map`, `rewrite-plan` |
| `create` | 生成新 artifact | `new-generation` | `discovery-question-form`, `direction-picker`, `todo-write`, `file-write`, `live-artifact`, `media-image`, `media-video`, `media-audio`, `critique-theater` |
| `export` | 把已接受 artifact 转换为下游格式 | `tune-collab` 或 `code-migration` | `file-read`, `file-write`, `handoff`, `diff-review` |
| `share` | 发布或发送 artifact 给协作者 | `tune-collab` | `file-read`, `handoff`, `connector` |
| `deploy` | 把 artifact 部署到托管基础设施 | `code-migration` 或 `tune-collab` | `file-read`, `build-test`, `handoff`, `connector` |
| `refine` | 改进已有 artifact | `tune-collab` | `file-read`, `patch-edit`, `critique-theater`, `diff-review` |
| `extend` | 帮助作者创建更多插件 | `new-generation` | `file-read`, `file-write`, `todo-write`, `critique-theater` |

## 4. Create 模式

使用 `od.mode` 表示主要输出表面：

| Mode | 输出 |
| --- | --- |
| `prototype` | 交互式单页 Web artifact |
| `deck` | 幻灯片 deck artifact |
| `live-artifact` | Dashboard、report、calculator、simulator 或其他 live UI |
| `image` | 生成图像、storyboard frame、poster、ad 或视觉资产 |
| `video` | 视频 prompt、storyboard、渲染 clip 或 motion package |
| `hyperframes` | HyperFrames-ready HTML motion composition |
| `audio` | 语音、音乐、声音品牌或 sound-design asset |
| `design-system` | 可复用品牌或界面系统 |

HyperFrames 插件可以使用 `od.mode: "video"` 加 `hyperframes` tag，让它出现在视频工具旁；也可以使用 `od.mode: "hyperframes"`，当区分 HyperFrames 比归入广义 video 更重要时使用。

## 5. `SKILL.md` 作者规则

- 用触发语写 description：“Use this plugin when...”
- 尽量让 `SKILL.md` 少于 500 行。
- 长 API 说明、视觉规则、exporter 细节放在 `references/`。
- 支持文件使用相对插件根目录的路径。
- 写出带 checkpoint 和期望输出的明确 workflow。
- 只有真正缺输入时，才描述需要问用户什么。
- 避免把 OD marketplace 专属数据放进 `SKILL.md`；保持它可移植。

## 6. Manifest 规则

- `name` 是稳定插件 id。
- `specVersion` 是此 manifest 遵循的 Open Design 插件规范版本。除非 schema 升级，否则使用当前规范包的值（`1.0.0`）。
- `version` 必填。尽量使用 semver。
- `version` 是插件包自身版本，独立于 `specVersion`。
- `compat.agentSkills[0].path` 应指向 `./SKILL.md`。
- `od.taskKind` 必须是 `new-generation`、`figma-migration`、`code-migration` 或 `tune-collab`。
- `od.pipeline.stages[].atoms[]` 应使用已知一方 atoms，除非插件明确面向未来 OD 版本。
- `repeat` stage 必须包含 `until`。
- `od.capabilities` 应从小集合开始。restricted install 默认只有 `prompt:inject`。

已知 v1 capabilities：

- `prompt:inject`
- `fs:read`
- `fs:write`
- `mcp`
- `subprocess`
- `bash`
- `network`
- `connector`
- `connector:<id>`

## 7. Inputs 与 GenUI

简单 apply-time 值使用 `od.inputs`。当 agent 在 run 中需要受控的人类输入时，使用 `od.genui.surfaces[]`。

内置 GenUI surface 类型：

- `form`
- `choice`
- `confirmation`
- `oauth-prompt`

持久化选项：

- `run` - 只对本次 run 生效。
- `conversation` - 同一 conversation 后续 turn 可复用。
- `project` - 同一 project 后续 run 可复用。

## 8. 示例与预览

视觉类插件应包含以下至少一种：

- `preview/index.html`
- `preview/poster.png`
- `preview/demo.mp4`
- `examples/<case>/index.html`
- `examples/<case>/README.md`

preview 应展示真实输出形态，而不是装饰性的 splash screen。

## 9. Evals

添加 `evals/evals.json` 进行可重复质量检查：

```json
{
  "skill_name": "my-plugin",
  "evals": [
    {
      "id": "happy-path",
      "prompt": "Create a prototype for a B2B SaaS onboarding flow.",
      "expected_output": "A usable HTML artifact with states, polished layout, and no text overflow.",
      "assertions": [
        "The output includes a runnable artifact file",
        "The visual hierarchy is clear",
        "The workflow has meaningful empty/loading/success states"
      ]
    }
  ]
}
```

当 description 容易过度触发时，也添加 `evals/trigger-queries.json` 做触发测试。

## 10. 发布与 PR

打开 PR 前：

1. 校验 JSON 语法。
2. 确认 `open-design.json` 包含 `specVersion`，并在行为变化时 bump 插件 `version`。
3. 运行 `pnpm guard`。
4. 运行 `pnpm --filter @open-design/plugin-runtime typecheck`。
5. 如果可用，运行 `od plugin validate ./path/to/plugin`。
6. 视觉类插件包含一张截图、渲染 preview 或示例输出。
7. 在 PR body 里说明 trust 和 capabilities。

外部 registry 分发策略见 [`PUBLISHING-REGISTRIES.zh-CN.md`](PUBLISHING-REGISTRIES.zh-CN.md)。简言之：把 GitHub 或 Open Design PR 作为 source of truth，让文件夹能作为通用 `SKILL.md` skill 安装；本地验证通过后，再发布或登记到 skills.sh、ClawHub 或其他 registry。
