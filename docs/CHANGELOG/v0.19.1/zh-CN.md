---
title: Open Design 0.19.1 — Design with DeepSeek Harness
description: 把你安装的官方 DeepSeek Harness 接入 Open Design，使用模型发现、结构化运行与会话续接；付费套餐还可在两周内不限量使用 DeepSeek V4 Pro 和 Flash。
---

### 🌟 Codename: *Design with DeepSeek Harness*

🧰 **59 个 PR · 24 位贡献者 · 4 天** — **DeepSeek Harness 现在可以作为 Agent
直接在 Open Design 里运行。** Open Design 会找到你安装的官方 `dsh`，引导完成连接
profile 设置，列出 Harness 提供的模型与 reasoning 选项，并在后续轮次续接同一个
Harness session。0.19.1 还为付费套餐带来两周不限量的 DeepSeek V4 Pro 和 Flash，
同时继续改善首页与团队项目在高负载下的响应速度。

## 🔥 亮点

- 🧰 **把你安装的官方 DeepSeek Harness 接入 Open Design。** Open Design 会发现
  `dsh`，读取它提供的模型与 reasoning 选项；缺少凭据、profile 未配置或 Harness
  版本尚未验证时，界面会给出具体处理办法。Settings 与
  `od agent setup deepseek-harness` 只安装或修复 Open Design 的连接 profile，
  不会替换或升级 Harness。运行过程会以结构化事件传回 thinking、正文、工具调用、
  结果与用量，并在下一轮续接同一个 Harness session。Windows `.cmd` 安装也有对应
  的取消和进程清理处理。 (#6874)

- 🎁 **付费套餐可在两周内不限量使用 DeepSeek V4 Pro 和 Flash。** 活动时间为
  8 月 13 日 20:00 至 8 月 27 日 20:00（Asia/Shanghai）。工作台中的两款模型
  都会显示 Unlimited 标记，活动按钮会直接选择 V4 Pro。即使用户已经关闭过上一轮
  Flash 活动，这次仍会展示一次。碰到模型滚动用量窗口上限后，Open Design 会显示
  可重试时间，并明确说明本次请求没有扣费。 (#6861)

- 🏠 **从首页更快进入项目。** 新版首页提供更清晰的创建类型入口和更直接的
  workspace 控件。创建本地项目时，不再需要先等 Cloud workspace identity；Cloud
  项目仍会保留余额检查。提交后会立即进入新项目的 Preparing 状态；如果创建失败，
  页面会撤销这次跳转。 (#6692, #6741, #6756)

- 🔐 **Cloud 会话过期后会直接回到登录流程。** 无效凭据会被清理，
  页面会直接回到已有的登录流程；短暂的 workspace authority 故障可以重试，同时
  不会重复提交请求。在无界面环境里，也可以从 CLI 运行 `od amr status` 或
  `od amr logout`，检查或重置 Cloud 登录状态。 (#6786)

- ⚡ **团队 workspace 的后台任务有了明确上限。** 共享资源改为批量拉取，同步
  fan-out 有了上限，workspace authority 读取会安全缓存，大型项目的扫描、归档和
  push queue 也不会无限扩张。事件集中到达时，workspace 与 billing 刷新会合并处理；
  上游故障时则会退避，不再放大请求量。 (#6711, #6752, #6782, #6788, #6871)

## ✨ 新增

- Design system 目录新增 **Cloudflare Kumo UI**，可以直接作为生成界面的视觉基础。
  (#6769)
- macOS 和 Windows 上可以通过 `od mcp install claude-desktop` 为 Claude Desktop
  配置 Open Design。 (#6489)
- 公开 Pricing 页现在会写明托管图像生成，而不再只描述文本模型。 (#6395)
- Launch Week 在落地页上更容易被发现；离开 Open Design 的社区链接也会提前标明
  去向。 (#6680, #6684)

## 🔁 变更

- 新图片和视频生成完成后会打开预览。Agent 指定已有 artifact 时，会原地更新这个
  文件，不再生成带编号的副本。 (#6688, #6719)
- Message Center 的消息行改为原地展开和收起。保存批注后，评论面板也会保持你选择
  的开关状态，不会被强制打开。 (#6851, #6862)
- 首页搜索会包含个人项目；从 Community template 创建项目时，也会保留模板原本的
  项目类型。 (#6838, #6847)
- MCP slash command 会说明各自用途；新建 custom skill 后，它的文件也会立即加载，
  不再需要手动刷新。 (#6597, #6735)
- Campaign 与 upgrade 提示只会出现在真正适用的 AMR 路径中，不再干扰无关的本地
  工作流。 (#6760, #6841)

## 🐛 修复

### 🏠 Workspace 与项目

- 邀请已经在 workspace 里的成员时，会明确告诉你失败原因；恢复入口也会跳到真正
  包含对应控件的 Settings 区域。 (#6830, #6831)
- `od project list` 与 MCP resource 读取会使用当前登录的 workspace，不再退回个人
  scope 或返回空列表。 (#6736, #6773)
- Personal design system 重新 finalize 后仍会绑定到项目，并且可以继续访问。 (#6776)
- 项目删除成功后会从 workspace 的项目下拉菜单中消失，刷新页面后也不会回来。
  (#6886)

### 🧠 Run 与 Agent

- 连续按 Enter 或重复点击不会再排入两条相同的聊天请求；后续 run 已成功时，旧的
  daemon restart 恢复卡片也会自动消失。 (#6748, #6749)
- 已经成功的 run 不会因为恢复过的 tool error 又变成失败。Resume 时不会重复写入
  表单答案，过期的消息写入也不能覆盖 daemon 维护的标准 run event。 (#6305,
  #6418, #6764)
- Vela 未安装时会正确显示为 unavailable；Azure alias 登录会重试兼容的 token
  参数；CodeBuddy 也能从当前 CLI help 中发现模型。 (#6617, #6718, #6738)
- Shared pipeline atom body 在每个 active stage 中只会插入一次，不再重复堆进 prompt。
  (#6245)

### 🖥️ 桌面端与交付

- 打包应用里的社交分享图标可以正常显示；Windows portable 安装会把 NSIS 日志写到
  runtime path；较慢的 macOS 冷启动也有足够时间等待 sidecar 进入 healthy 状态。
  (#6559, #6750, #6762)
- Docker browser peer 可以正常完成认证；打包 runtime 中的相关依赖也已升级到修复
  已知容器漏洞的版本线。 (#6715, #6733)
- 韩语 browser assist 界面与法语 fallback 文案恢复完整。 (#6212, #6612)

## 🙏 感谢每一位参与 0.19.1 的贡献者

@alchemistklk · @AmyShang-alt · @BusanGukbap · @Coiggahou2002 ·
@dapsychyoo · @davezfr · @Diyoncrz18 · @elifive555555 · @ivy-ting ·
@lefarcen · @lhenriquesouza · @lorenzozanee · @mvanhorn · @PerishCode ·
@roian6 · @ScarletttMoon · @Siri-Ray · @VaiYav · @wangchenglong0001 ·
@xne998808-ai · @xxiaoxiong · @YOMXXX · @YUHAO-corn · @zzjjzz-zz
