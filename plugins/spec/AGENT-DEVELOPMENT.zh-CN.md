# Agent 开发 Handoff

语言：[English](AGENT-DEVELOPMENT.md) | 简体中文

当你希望一个编码 agent 创建或改进 OpenDesign 插件时，可以把这个文件直接交给它。

## 任务目标

创建一个可移植的 OpenDesign 插件，使它可以：

1. 通过 `SKILL.md` 作为普通 Agent Skill 运行。
2. 通过 `open-design.json` 安装到 OpenDesign。
3. 在本地完成校验。
4. 发布为独立开源仓库，或作为 PR 提交给 OpenDesign。

## 必读文件

编辑前先阅读：

- `plugins/spec/SPEC.zh-CN.md`
- `docs/schemas/open-design.plugin.v1.json`
- 需要更深入产品语义时阅读 `docs/plugins-spec.zh-CN.md`
- 当用户要求发布到 OpenDesign 以外的 registry 时，阅读 `plugins/spec/PUBLISHING-REGISTRIES.zh-CN.md`
- `plugins/spec/examples/` 下最接近的示例

## 构建流程

1. 选择一个小写插件 id，例如 `import-screenshot-to-prototype`。
2. 创建至少包含以下文件的文件夹：

```text
<plugin-id>/
  SKILL.md
  open-design.json
  README.md
```

3. 保持 `SKILL.md` 可移植。它可以提到 OpenDesign 行为，但核心 workflow 必须在任何 Agent Skills 兼容 agent 中都能理解。
4. 把 OD 专属 display、`specVersion`、插件 `version`、inputs、preview、pipeline、atoms、connectors 和 capabilities 放进 `open-design.json`。
5. 只有在能明显提升 agent 输出质量时，才添加 `examples/`、`preview/`、`assets/` 或 `references/`。
6. 当插件行为足够复杂、容易回归时，添加 `evals/evals.json`。
7. 如果要对外发布，准备适配 skills.sh、ClawHub 和 canonical GitHub source 的 registry-safe README 段落。
8. 对于以 HTML 为真实产物的视觉插件，必须提交真实的 `example.html`，并将
   `od.preview.type` 声明为 `"html"`、`entry` 指向 `"./example.html"`。
   `od.useCase.exampleOutputs` 和 `od.context.assets` 也必须包含该文件。海报图
   可以作为辅助资源保留，但不能代替 HTML 预览；如果 `template.json` 包含
   `referenceHtml`，应从它（或同一个确定性生成器）生成样例，并保持同步。

## 完成标准

插件未完成，直到：

- `SKILL.md` 有清晰的 “Use this plugin when...” 触发描述。
- workflow 写明期望输出文件或 handoff 结果。
- `open-design.json` 符合 v1 形态，并显式携带 `specVersion` 与插件 `version`。
- 声明的 atoms 是已知一方 atoms，或明确标注为未来工作。
- capabilities 是最小必要集合。
- 视觉类插件包含 preview 或具体示例输出。
- HTML 预览入口能以 `200 text/html` 正常加载；对该插件而言，preview baker
  中的 `skip (status 404)` 必须视为失败，即使整个烘焙任务仍显示绿色。
- share、deploy、connector、network 类插件在对外可见操作前要求用户确认。

## 验证命令

在当前环境里运行可用命令：

```bash
pnpm guard
pnpm --filter @open-design/plugin-runtime typecheck
```

如果 daemon CLI 已构建：

```bash
od plugin validate ./<plugin-id>
od plugin install ./<plugin-id>
od plugin apply <plugin-id> --input key=value
```

## PR 输出

准备 PR 时包含：

- 插件 id、spec version、插件 version 和主类。
- 哪类用户请求应该触发它。
- 修改的文件。
- 验证命令与结果。
- 请求的 capabilities。
- 视觉类插件的截图、preview URL 或示例 artifact。
- 发布到 skills.sh、ClawHub 或其他 skill registry 时，附上 registry 链接和 dry-run 输出。
