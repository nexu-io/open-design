---
title: Open Design 0.19.1 — Start Faster, Stay in Flow
description: 从首页提交后立即进入项目，Open Design Cloud 会话过期时自然回到登录流程，大型团队工作区也能在高负载下保持响应。
---

### 🌟 Codename: *Start Faster, Stay in Flow*

🚀 **54 个 PR · 24 位贡献者 · 3 天** — **Open Design 0.19.1 让你从首页的
一个想法更快进入可以工作的项目。** Cloud 会话过期后会直接回到登录流程；大型
团队项目的后台任务也有了明确上限，工作区变大后依然能保持响应。

## 🔥 亮点

- 🏠 **首页不再让你等在门口。** 新版首页提供更清晰的创建类型入口和更直接的
  workspace 控件。创建本地项目时，不再需要先等 Cloud workspace identity；Cloud
  项目仍会保留余额检查。提交后会立即进入新项目的 Preparing 状态；如果创建失败，
  页面会撤销这次跳转。 (#6692, #6741, #6756)

- 🔐 **Cloud 会话过期后会回到登录流程，而不是卡在死路上。** 无效凭据会被清理，
  页面会直接回到已有的登录流程；短暂的 workspace authority 故障可以重试，同时
  不会重复提交请求。在无界面环境里，也可以通过 `od amr status` 和 `od amr logout`
  从 CLI
  检查或重置 Cloud 登录状态。 (#6786)

- ⚡ **大型团队项目的后台任务不再无限扩张。** 共享资源改为批量拉取，同步
  fan-out 有了上限，workspace authority 读取会安全缓存，大型项目的扫描、归档和
  push queue 也不会无限扩张。随着 workspace 规模增长，同步会更稳定，内存压力也
  更可控。 (#6711, #6752, #6782, #6788)

- 🖼️ **生成结果会落在你预期的位置。** 新图片和视频生成完成后会自动打开预览。
  当 Agent 明确指定一个已有 artifact 时，现在会原地更新这个文件，不再悄悄生成
  带编号的副本。 (#6688, #6719)

## ✨ 新增

- Design system 目录新增 **Cloudflare Kumo UI**，可以直接作为生成界面的视觉基础。
  (#6769)
- macOS 和 Windows 上可以通过 `od mcp install claude-desktop` 为 Claude Desktop
  配置 Open Design。 (#6489)
- Launch Week 在落地页上更容易被发现；离开 Open Design 的社区链接也会提前标明
  去向。 (#6395, #6680, #6684)

## 🔁 变更

- Message Center 的消息行改为原地展开和收起，查看详情时不会再把列表整个替换掉。
  (#6851)
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
