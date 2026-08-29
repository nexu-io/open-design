---
title: Open Design 0.21.0 — Reliable, Start to Finish
description: 从 Agent 连接、实时 HTML 预览到 App 重新启动，Open Design 0.21.0 让整个创作体验更加可靠；遇到问题时，也更容易恢复。
---

### 🌟 Codename: *Reliable, Start to Finish*

🛡️ **42 个 PR · 13 位贡献者 · 4 天** — **从 Agent 连接、实时 HTML 预览到 App
重新启动，Open Design 0.21.0 让整个创作体验更加可靠；遇到问题时，也更容易恢复。** 🚀

## 🔥 亮点

- 🖼️ **HTML 预览保持可见、可交互，资源也能正确连接。** 多文件 artifact 中的
  script、样式、图片、module 和相对请求可以继续工作；切换项目、文件或
  Code/Preview 时，也不会再触发 Electron 导航竞态，把已经完整加载的页面画成白屏。
  演示模式新增可靠的退出入口，点击预览本身也能像点击其他区域一样关闭 viewport
  菜单。 (#7336, #7358) 感谢 @lefarcen。

- 🧰 **可用的 Agent 不会再被损坏的 shim 挡住。** PATH 前面出现失效的可执行文件
  时，OpenDesign 会继续寻找真正可用的版本；确实无法启动时，Settings 会保留
  Agent、说明原因并给出修复入口。DeepSeek Harness 也支持用户实际安装到的新版
  release line，一键安装不再卡在依赖解析里。 (#7153, #7339) 感谢 @lefarcen。

- 🌙 **Kimi 0.37 及以上版本可以重新正常运行。** 新版 Kimi 不再接受 OpenDesign
  过去附带的 stdio MCP transport，导致任务在握手时直接失败。OpenDesign 现在只
  发送当前 Kimi build 能接受的 transport，消息会重新得到正常的流式回复，而不是
  在工作开始前报错。 (#7313) 感谢 @lefarcen。

- 🚪 **遗留的本地引擎不再让 App 重启失败。** 崩溃后残留的 web sidecar 可能继续
  占用 socket，让之后每次启动都在启动页退出。OpenDesign 现在会安全接管失效的
  owner；桌面 App 退出时，daemon 与 web 子进程也会一同结束，不再影响下一次启动。
  (#7279) 感谢 @mrcfps。

- 🤖 **Coding Plan 模型权益以当前登录账号为准。** 模型选择器与 Unlimited 标记会
  读取经过认证的实时权益列表，不再依赖写死的套餐快照。DeepSeek V4 Flash Vision
  Exp 也加入所有付费 Personal 套餐的不限量模型列表；旧客户端暂未刷新权益时，
  页面会说明如何完成激活。 (#7289, #7250) 感谢 @Siri-Ray。

- 🧠 **AI Optimize 即使连点两次，也只会运行一次。** 过去两个入口可能在几百毫秒
  内启动相同的隐藏设计系统优化，重复计费并同时改写同一批文件。现在客户端会在
  请求发出前拦住重复操作，daemon 也会为其他 tab 和外部客户端守住同一条边界。
  (#7271) 感谢 @lefarcen。

- 💳 **Pricing 在进入 checkout 前就如实说明可执行的操作。** 当前计费周期、待生效
  变更、取消状态、不可用的变更和 Team 计费都会直接显示在决策位置。Go 已明确标记
  售罄，旧的 App 内活动入口也已下线；仍在进行的 DeepSeek 活动为付费和未付费用户
  提供一致的升级路径。 (#7228, #7239, #7240, #7352, #7361) 感谢 @Siri-Ray。

- 🌐 **离开 Website Clone 后，它的引导词也会留在原处。** 未修改的“复刻这个网站”
  scaffold 不再跟着你进入 Slide Deck、Image、Document、HyperFrames、Video 或
  Audio。填入自己的 URL 后，草稿仍会完整保留；没有修改引导词时，下一个创建模式
  会从空白开始。 (#7344) 感谢 @lefarcen。

- 🔌 **长时间运行的 MCP session 可以按实际工作节奏保持在线。** 默认仍会在空闲
  30 分钟后退出；需要更长 session 的客户端可以通过
  `OD_MCP_STDIO_IDLE_EXIT_MS` 设置最长 24 小时的边界，或禁用 idle exit。
  (#7288) 感谢 @huytdps13400。

## ✨ 新增

### 🧠 Agent、runtime 与自动化

- `OD_MCP_STDIO_IDLE_EXIT_MS` 可以配置 stdio MCP 的空闲生命周期；设为 `0` 时，
  进程会一直保持到客户端断开。 (#7288) 感谢 @huytdps13400。

### 🔑 模型、套餐与媒体

- Coding Plan 的可用模型与 Unlimited 标记会跟随当前账号的实时权益列表。
  (#7289) 感谢 @Siri-Ray。
- DeepSeek V4 Flash Vision Exp 在 Go、Plus、Pro 和 Max 中不限量使用；Pricing
  页面也会说明如何在旧客户端中刷新延迟出现的权益。 (#7250)

## 🔁 变更

- 公开 Pricing 页面会跟随登录订阅的计费周期与状态，禁用 checkout 会拒绝的操作，
  在需要订阅上下文的位置恢复账号入口，并让套餐与模型详情更容易展开和比较。
  (#7228, #7239, #7240) 感谢 @Siri-Ray。
- Go 对已有订阅者仍然可见，但新购买入口已标记售罄；客户端不再展示旧的 Go 活动
  badge 与 welcome modal。 (#7352, #7361) 感谢 @Siri-Ray。
- 所有社区入口统一指向 Discord；中文客户端、网站和文档不再把社区分散在飞书与
  Discord 两处。 (#7295) 感谢 @joeylee12629-star。
- 首次点击账号头像会固定展开菜单；再次点击、按 Escape、点击外部或导航后才会
  明确关闭。 (#7330) 感谢 @Siri-Ray。
- 没有任何 Skill 的来源不会再显示为空筛选项；加入对应 Skill 后，它会自动重新
  出现。 (#7298) 感谢 @nettee。

## 🐛 修复

### 🎨 Studio、预览与导出

- 多文件 Electron 预览可以解析相对 script、样式、图片、module、import 与请求；
  切换项目、文件和 Code/Preview 时，已激活的预览会保持 warm，不再跳转成白屏。
  (#7336) 感谢 @lefarcen。
- 点击预览本身可以关闭 viewport 菜单；演示模式在焦点进入 slide 后仍有可用的退出
  按钮；版本历史也会明确说明预览将在新窗口打开。 (#7358) 感谢 @lefarcen。
- headless 与 container 部署不再提供 daemon 无法渲染的 PPTX 导出入口；桌面端保留
  原有导出，连接失败也不会再被误报为当前 runtime 不支持。 (#7224) 感谢
  @jiulongche。
- Website Clone 的起始引导词在未修改时会把 composer 还原为空；加入 URL 后则会
  完整保留，并在所有支持的创建入口中使用本地化文案。 (#7344) 感谢 @lefarcen。

### 🧠 Agent、runtime 与对话

- DeepSeek Harness 检测会跳过 PATH 中损坏的 shim，让不可用的 Agent 保持可见并
  给出诊断与修复操作，同时支持当前 `0.1.1-rc.x` release line。
  (#7153, #7339) 感谢 @lefarcen。
- Kimi 0.37+ session 不再携带这些版本会拒绝的 stdio MCP transport，ACP 可以正常
  启动并返回流式回复。 (#7313) 感谢 @lefarcen。
- Antigravity 现在会收到真实的用户 prompt，而不是字面量 `-`。 (#7205) 感谢
  @mturac。
- native resume 与 transcript replay 使用同一套跨 Agent 安全决策：只有存储的
  session 与当前可见对话一致时才 resume，否则清理失效 handle，并只用完整
  transcript 重新开始一次。 (#5269) 感谢 @alucero270。
- ACP usage、session info 和 command metadata 不再以原始状态文本混入可见对话。
  (#7309) 感谢 @helsome。
- ACP stage timeout 会保留真实静默时长，并明确记录终止任务的 watchdog；昂贵的卡死
  不再看起来像用户主动中断。 (#7310) 感谢 @lefarcen。
- 同一个 conversation 只允许一个 Design System AI Optimize refinement；双击、另一个
  tab 或外部客户端都不会再创建作用于同一批文件的重复计费 run。 (#7271) 感谢
  @lefarcen。

### 🖥️ 桌面端、导航与界面细节

- 打包客户端会在启动时接管失去响应的 web sidecar，并在桌面 owner 退出时清理
  daemon 与 web 子进程。 (#7279) 感谢 @mrcfps。
- App 位于前台、结果已经显示时，失败任务不再额外弹出系统通知；后台通知与已启用
  的完成提示音保持原有行为。 (#7329) 感谢 @Siri-Ray。
- 点击头像后账号菜单会保持打开；Onboarding 中的 Local CLI 选项保持对齐；空的
  Skills 来源筛选也不会占据界面。 (#7330, #7338, #7298) 感谢 @Siri-Ray、
  @lefarcen、@nettee。
- DeepSeek 活动使用官方 provider logo；图片无法加载时，会回退到可访问、可辨认的
  文本缩写。 (#7326) 感谢 @Siri-Ray。

### 💳 套餐与活动

- Pricing 操作会在进入 checkout 前遵循真实订阅状态和计费周期；待生效、取消中、
  不可用和降级状态都有明确说明。 (#7239) 感谢 @Siri-Ray。
- Pricing 与首页之间的模型顺序、套餐文案、推荐颜色和活动颜色保持一致。
  (#7228) 感谢 @Siri-Ray。
- Go 库存关闭后不再提供 checkout；本地客户端也不会把已经结束的 Go 活动与当前
  DeepSeek 活动同时展示。 (#7352, #7361) 感谢 @Siri-Ray。

## 🙏 感谢所有参与 0.21.0 的贡献者

@alucero270 · @helsome · @huytdps13400 · @jiulongche ·
@joeylee12629-star · @lefarcen · @mrcfps · @mturac · @nettee · @OctoBored ·
@PerishCode · @Siri-Ray · @UnknownObject777
