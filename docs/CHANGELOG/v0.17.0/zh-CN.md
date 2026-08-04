---
title: Open Design 0.17.0
description: 在 Codex 中直接调用 Open Design 设计工作区，把想法变成可继续编辑的真实成果，并在 Studio 中完成精修。
---

### 🌟 Codename: *Open Design Plugin for Codex*

🚀 **62 个 PR · 23 位贡献者 · 11 天** — **Codex 现在有了自己的设计工作区。** 在 Codex 对话中调用 `@open-design`，把想法与 brief 变成可继续编辑的真实设计成果；之后仍可在 Open Design Studio 中持续创作和精修，不必中断 Codex 工作流。🚀

## 🔥 亮点

- 🚀 **Codex 中的 Open Design——从 `@open-design` 到真实成果。** Codex Desktop 和 CLI 现在可以把 Open Design 当作一套完整的创作引擎：确认视觉 brief，选择 Open Design Cloud 或受支持的本地执行方式，并获得真实的 Preview 或 Studio 结果。需要时，已签名的 Open Design runtime 会在后台启动，无需一直开着第二个应用，也无需手工拼接整套工具。如果外部宿主中的 Studio 无法正常加载，Codex 仍会立即交付稳定预览。 (#6055, #6273, #6362)

- ✋ **最后的精修交给双手，而不是再写一条 prompt。** 过去，一个细小的视觉调整也要重新回到对话。现在可以直接选中元素，移动或缩放、修改文字、颜色和对齐方式、复制或删除，也可以替换、裁剪、粘贴或拖入图片。撤销与重做会保住当前画布，不再闪过一次完整重载。 (#5890, #6098) 感谢 @pftom。

- ⚡ **需求已经说清楚，就直接开始。** Open Design 不再把每个首轮请求都变成一次访谈。信息足够时，Agent 会立即动手；只有缺失信息确实会改变结果时，才在真正需要的时刻提出一个有针对性的问题。 (#6223)

- 🧰 **更新卡住时，不再只能等待下一个版本。** 可以在设置中自行清理损坏的更新缓存；当已安装版本不适合继续原地升级时，可改走完整安装；如果新下载的内容启动崩溃，应用会自动回退到上一个可用版本，并在下一次健康更新时自行恢复。 (#6032, #6101) 感谢 @PerishCode。

- 🎯 **不兼容的模型会在浪费一次任务之前被发现。** 已知不兼容的 Codex 模型与 CLI 组合会在启动前停止；不支持的模型会明确引导切换；工具调用后的超时也会得到更准确的判断，不再触发没有意义的重试。 (#6036, #6103) 感谢 @Siri-Ray。

- 🧩 **用 50 种方式，为 Codex 加上真正的设计品味。** Codex Design 公共合集现在收录了 50 个精选、可安装的 Skill，覆盖界面设计、视觉系统、Figma-to-code、动效、图片生成和前端工艺，并提供来源说明、实用指引和本地化详情页。 (#5978) 感谢 @joeylee12629-star。

- 🎞️ **Codex Slides 加入 Open Design 产品家族。** 从 prompt 到完整演示文稿，新的 Codex Slides 产品体验展示了场景与风格选择、提纲塑形、编辑和导出的完整流程。 (#6050) 感谢 @joeylee12629-star。

## ✨ 新增

### 🎨 Studio、编辑与画布

- **像思考一样快速地直接编辑画布。** 轻量选中控件、行内文字工具栏、实时对齐参考线、图片直接操作和可靠历史记录，让 Manual Edit 成为完整的收尾工作流。 (#5890) 感谢 @pftom。

- **导出结果会遵循你实际看到的预览。** 图片导出会尊重当前预览视口，Framework Deck 也会按作者设定的尺寸进行捕获，不再被桌面窗口重新塑形。 (#5828, #5853) 感谢 @mturac。

### 🧠 Agent、模型与集成

- **需要速度时，可以直接选择 GPT-5.5 Fast。** 新的 service tier 已作为明确的模型选项提供。 (#4287) 感谢 @jaehanbyun。

- **Raven 加入一键 MCP 配置。** Open Design 可以直接生成正确的 Raven 配置，无需把其他客户端格式手工翻译一遍。 (#5969) 感谢 @roian6。

- **Windows 上更容易找到 Grok Build。** Open Design 现在会自动发现官方用户目录中的安装。 (#5843) 感谢 @thebtf。

### 🧩 插件与创作工作流

- **Humanize PPT 把粗糙材料变成真正有人愿意看的演示文稿。** 新工作流把结构化 brief、视觉路由、讲述意图、素材 QA 和导出验证放进同一个插件。 (#5655) 感谢 @LearnPrompt。

- **Atelier Zero 带来可直接投入制作的图片 prompt 库。** 从精选的 prompt 系统出发，不必为每次生成重新搭建艺术指导。 (#5873) 感谢 @Nissimmiracles。

## 🔁 变化

- **BYOK 保持本地，也保持可用。** 服务商配置继续保存在当前设备的 Open Design 浏览器存储中，只会传给当前正在运行的本地任务。启动时不再尝试把凭据迁移到操作系统 profile；Open Design Cloud 和 Local Codex 的行为不变。 (#6356)

- **Chat 会展示工作过程，但不再像一块终端。** 执行信息更安静，空工具行不会出现，ACP Agent 的真实工具活动也会得到更准确的呈现。 (#5667, #4621, #6057) 感谢 @mrcfps、@thatditsyboy。

- **工作区标签会把内容说清楚。** 较长标签保持可见，Design System 的命名在整个工作区中也更加一致。 (#5129) 感谢 @BigBandaid2。

## 🐛 修复

### 🎨 Studio 与界面

- **清除最后一条样式后，runtime 渲染的元素仍会保持选中。** 重置对齐或其他最后一项覆盖样式时，不再丢失选中状态或重载画布。 (#6098) 感谢 @pftom。

- **重复打开同一个项目不再生成多个工作区标签。** (#5993) 感谢 @pcherkashin。

- **以深色为起点的品牌会继续保持深色。** 派生主题会保留原本的画布意图，不再悄悄把深色视觉方向变成浅色。 (#5502) 感谢 @wiggdevin。

- **继续执行中断任务后，旧的进度卡会及时消失。** 后续任务完成后，不再把过期的 Todo 状态固定在 Chat 顶部。 (#6307) 感谢 @Siri-Ray。

### 🧠 Agent 与可靠性

- **AMR 登录可以从较晚发生的失败中恢复。** 如果直接认证在激活前退出，Open Design 会进行一次有边界的 fallback，而不是让用户一直停留在加载状态。缓慢、已完成或已取消的登录不会启动重复认证。 (#5986) 感谢 @Siri-Ray。

- **Web 界面意外退出后，打包应用可以自行恢复。** Open Design 会在有限次数内重启失败的 sidecar，并重新连接 `od://` 请求，无需完整退出并重启应用。 (#6364) 感谢 @lefarcen。

- **由插件启动的 Local Codex 任务会始终留在本地模式。** 用户明确选择 Local Codex 后，子任务不再递归进入插件，也不会跳到 Cloud 登录。 (#6273)

- **ACP Agent 会留下完整的工作轨迹。** 真实工具名称、输入、结果、耗时和用量会保留在 Chat 与诊断中，不再全部折叠成模拟的写入事件。 (#6057) 感谢 @mrcfps。

- **不同平台上的打包 runtime 启动更可靠。** Linux 会在首次使用前预热应用内容，打包 wrapper 也会稳定使用随应用发布的 runtime。 (#5836, #5786) 感谢 @arseniy-gl、@mturac。

## 🙏 感谢所有参与 0.17.0 的贡献者

@AmyShang-alt · @AriaZhao-coder · @arseniy-gl · @BigBandaid2 · @EthanGuo-coder · @jaehanbyun · @joeylee12629-star · @LearnPrompt · @lefarcen · @mrcfps · @mturac · @Nissimmiracles · @nettee · @pcherkashin · @PerishCode · @pftom · @roian6 · @shangxinyu1 · @Siri-Ray · @thatditsyboy · @thebtf · @wiggdevin · @xxiaoxiong
