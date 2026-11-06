---
title: OpenDesign 0.18.0
description: OpenDesign 0.18.0 带来 Team Workspace——设计团队共同的家：共享项目、查看更新、在上下文中评论，并复用同一套设计体系、插件与技能；协作工作区现已直接延伸进 Codex。
---

### 🌟 Codename: *Design Team Workspace. Now in Codex.*

🤝 **`115 个 PR` · `22 位贡献者` · `2 天`** — OpenDesign 0.18.0 带来 Team Workspace——设计团队共同的家：在这里共享项目、查看更新、在上下文中直接评论，并复用同一套设计体系、插件与技能。借助全新的 OpenDesign plugin for Codex，这个协作工作区现在直接延伸进 Codex。🚀

## 🔥 亮点

- 🤝 **团队工作区——团队有了自己的家。** *过去协作意味着离开 OpenDesign：导出文件、贴截图、追最新版。* 现在，**团队工作区**就在个人工作区旁边。创建、切换、按角色邀请同事，席位感知的邀请流程让每个人落到同一个地方——用同一个 OpenDesign Cloud 账号登录。 (#6142, #6459)

- 🚀 **Codex 中的 OpenDesign——错过了 0.17.0？再看一次。** *上个版本只存在了整整两天，所以它的头条值得再讲一遍：* Codex Desktop 和 CLI 可以把 OpenDesign 当作一套完整的创作引擎：确认视觉 brief，选择 OpenDesign Cloud 或受支持的本地执行方式，并获得真实的 Preview 或 Studio 结果。需要时，已签名的 OpenDesign runtime 会在后台启动，无需一直开着第二个应用，也无需手工拼接整套工具。从 0.16.x 升级上来？这对你也是新功能。 (#6055, #6273, #6362 — 随 [0.17.0](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.17.0) 发布)

- 🔌 **而且 Codex 不会再弄丢 OpenDesign。** 外部 MCP 宿主（Codex 等）过去在 OpenDesign 本地服务重启换端口后会彻底失联。现在连接会自己找到回家的路，`@open-design` 跨重启持续可用，无需重新配置。 (#6391)

- 📁 **共享项目自己保持最新。** 把项目移入团队空间，每位成员都会得到一份实时只读镜像：所有者工作时内容自动拉取，在线头像显示谁正在看，传输进度清晰可见，评论双向流动——只读访客也能评论。没有人需要重发任何东西，"这是最新版吗？"从此不再是问题。 (#5281, #5283, #5395, #6294)

- 🧰 **共享的不只是文件，还有整套工具。** 设计体系、插件和技能现在都可以共享给团队，让品牌风格和独门技巧一起随行——同事拿到同样的品牌套件和同样的工作流，不需要再打一通设置电话。 (#5242, #5250, #5551) 感谢 @PerishCode。

- 💳 **计费跟着工作区走。** 余额、充值和运行消耗记在当前工作区名下，而不是你的个人账户——团队的工作由团队买单，个人的工作留在个人，套餐铭牌始终告诉你花的是哪个口袋的钱。 (#6067, #6182, #6219)

- 🎨 **一个值得回来的首页。** 工作区重设计覆盖首页 hero、侧栏、标签页和模板/插件详情页——还带来了消息中心、基于真实发布数据的 What's-new 面板，以及更安静、重新设计的更新提醒。 (#6156, #6162, #6281) 感谢 @wangchenglong0001。

- 🏁 **Agent 有始有终。** 工具调用后卡住的会话现在会自己恢复，Kiro 运行会干净地完成回合而不是停在终点线前；当 AMR 运行真的卡住时，应用终于能告诉你原因，而不是耸耸肩。 (#6237, #6268, #6040) 感谢 @Siri-Ray。

- 🙋 **必答题不再是一扇锁死的门。** 当 Agent 问了你无法回答或不想回答的问题，跳过它继续前进——Agent 会基于已有信息工作，而不是扣住你的运行。 (#6177)

- 🕵️ **Clone Audit——上线克隆站之前，先确认它安不安全。** 新的社区插件会像评审者一样检查克隆站点：视觉还原度、残留的追踪脚本、源品牌与语言残留、占位符、有风险的外部依赖——然后交给你一份带文件行号实证的报告和明确的部署结论。 (#5687) 感谢 @bestthanapon。

> 📥 **下载：** Tag `open-design-v0.18.0`。
>
> | 平台 | 架构 | 安装包 |
> |---|---|---|
> | macOS | Apple Silicon (arm64) | [open-design-0.18.0-mac-arm64.dmg](https://github.com/nexu-io/open-design/releases/download/open-design-v0.18.0/open-design-0.18.0-mac-arm64.dmg) |
> | macOS | Intel (x64) | [open-design-0.18.0-mac-x64.dmg](https://github.com/nexu-io/open-design/releases/download/open-design-v0.18.0/open-design-0.18.0-mac-x64.dmg) |
> | Windows | x64 | [open-design-0.18.0-win-x64-setup.exe](https://github.com/nexu-io/open-design/releases/download/open-design-v0.18.0/open-design-0.18.0-win-x64-setup.exe) |

## ✨ 新增

### 🏠 首页、项目与官网

- **插件目录有了自己的门面。** 专门的落地页向新用户介绍 OpenDesign 插件，无需先安装应用。 (#6241) 感谢 @joeylee12629-star。

- **Codex agent 页面现在回答人们真正在问的问题。** 为搜索 Codex UI 的用户带来更清晰的定位与内容。 (#6200) 感谢 @joeylee12629-star。

## 🔁 变更

- **OpenDesign 以明亮主题交付。** 新工作区界面为明亮外观调校，主题设置暂时下线，所有安装恢复为明亮主题。 (#6168)

## 🐛 修复

### 🎨 Studio 与界面

- **内置浏览器预览会记住你的视口。** 设备尺寸选一次就一直生效，不再在会话之间被重置。 (#4899) 感谢 @HD-L。

- **删除的项目不再纠缠你的标签页。** 移除项目会同时清掉它保存的标签页布局，陈旧的工作区状态不再复现。 (#5761) 感谢 @EthanGuo-coder。

- **Azure 部署名称可以再次编辑。** Azure 上的 BYOK 用户可以直接改正部署名称，不用再和表单搏斗。 (#6034) 感谢 @mturac。

### ☁️ Cloud 与可靠性

- **计费检查学会了退避。** Cloud 计费端点不可达时，应用按退避曲线礼貌重试，而不是持续冲击一个失败中的连接。 (#6446)

## 🙏 感谢所有为 0.18.0 出力的人

@AmyShang-alt · Bassi · @bestthanapon · @bone3deep1962-collab · @crumgary · @elifive555555 · @EthanGuo-coder · @hanyuanxi · @HD-L · @itscheems · @joeylee12629-star · @lefarcen · @mrcfps · @mturac · @nettee · @PerishCode · @shangxinyu1 · @Siri-Ray · @wangchenglong0001 · @xiaoche-hub · @xne998808-ai · @xxiaoxiong
