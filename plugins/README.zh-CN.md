# Open Design 插件

语言：[English](README.md) | 简体中文

这个目录有两类职责：

- `_official/` - Open Design 随包发布的一方插件。daemon 启动时会扫描这个目录，并把这些插件注册为 official。
- `community/` - 社区插件源码目录。这里的插件可安装，但不会预装；只有 registry entry 指向它们并由用户安装后才会进入 Installed。
- `registry/` - 默认 registry source manifests（`open-design-marketplace.json`），包含 official 和 community catalog，用来驱动 Plugins 的 Available / Sources UI。
- `spec/` - 可移植插件规范、模板、示例和 agent handoff 包，用于构建、测试、发布插件，或向 Open Design 提交 PR。

所有插件共享同一个基础契约：插件是一个可移植的 agent skill 文件夹，包含 `SKILL.md`，并可选添加带版本的 `open-design.json` sidecar。`open-design.json` 负责 Open Design marketplace 元数据、输入项、预览、pipeline、信任与能力声明。

从这里开始：

- 插件规范包：[`spec/README.zh-CN.md`](spec/README.zh-CN.md)
- 插件作者规范：[`spec/SPEC.zh-CN.md`](spec/SPEC.zh-CN.md)
- Agent handoff 指南：[`spec/AGENT-DEVELOPMENT.zh-CN.md`](spec/AGENT-DEVELOPMENT.zh-CN.md)
- Registry 发布策略：[`spec/PUBLISHING-REGISTRIES.zh-CN.md`](spec/PUBLISHING-REGISTRIES.zh-CN.md)
- 完整产品 spec：[`../docs/plugins-spec.zh-CN.md`](../docs/plugins-spec.zh-CN.md)
- Manifest schema：[`../docs/schemas/open-design.plugin.v1.json`](../docs/schemas/open-design.plugin.v1.json)
- Marketplace schema：[`../docs/schemas/open-design.marketplace.v1.json`](../docs/schemas/open-design.marketplace.v1.json)
