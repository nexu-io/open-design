---
title: Open Design 0.24.0 — 每一次运行都完整留存
description: 重新加载和补充问题后对话不断线，你选中的预览会一直保持，丰富回复以内容呈现而不是泄漏标记，Windows 全新安装第一次启动就能进入 App，Novita AI 也进入了 BYOK 选择器。
---

### 🌟 Codename: *Every Run, Kept Intact*

🧭 **`26 个 PR` · `13 位贡献者` · 1 天** — **一次运行应当经得起真实使用，而不只是在理想路径上成功。** 重新加载、补充问题、切换预览和首次启动曾是工作最容易失去位置的时刻；现在，项目会把它稳稳留住。🚀

## 🔥 亮点

- 🧵 **对话会跟着工作继续向前，而不会断线。** 规划回复、实时任务续接、被阻塞任务的结论和恢复后的输出都会留在产生它们的任务中——即使重新加载或补充问题也一样。分支对话从干净状态开始，不再继承另一段对话的工作。仅作规划的回复现在会以你收到的答案结束，不会再被误标成红色失败运行。 (#8322, #8195, #8008, #8007, #8172, #8029, #8158) 感谢 @itscheems、@lefarcen。
- 🖼️ **你正在看的预览，会一直是你选中的那个。** 真实页面不再变成空白快照；查看内容时，过期的文件读取也不会抢走聊天预览。 (#7125, #8067) 感谢 @huynextlevel。
- 🃏 **丰富回复以内容呈现，而不是以标记泄漏。** Open Design 会在思考流中解码卡片；卡片格式损坏时也会安全忽略，而不会把原始数据铺进对话。 (#8258, #8264) 感谢 @lefarcen。
- 🪟 **Windows 全新安装，第一次启动就能进到 App。** 打包 App 不再把初始 payload 状态误判为交接失败，因此首次启动时 Web 界面可以连上本地引擎。 (#7520) 感谢 @lorenzozanee。
- 🔑 **Novita AI 已进入 BYOK 选择器。** 选择 Novita AI、填入自己的 key，即可从当前的 DeepSeek、MiniMax、Qwen、GLM、Kimi 与 GPT-OSS 模型中选择，无需手动搭建提供商配置。 (#6327) 感谢 @jax-novita。

> 📥 **下载：**[Open Design 0.24.0](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.24.0)。

## ✨ 新增

### 🔑 BYOK、模型与媒体

- Novita AI 加入 BYOK 提供商预设，带来模型目录与 API key 管理入口。 (#6327) 感谢 @jax-novita。

## 🔁 变更

### 🧠 Agent、runtime 与 sandbox

- 切换 profile 时，工作区订阅会干净地重置；眼前的项目和账号状态始终与实际选中的工作区一致。 (#8020) 感谢 @AmyShang-alt。
- 同时安装两者时，本地 Agent 检测会优先选择独立 Copilot CLI，而不是 VS Code 的 bootstrap 副本。 (#7974) 感谢 @tony-box。
- `od automation create` 与 `od automation update` 再次支持逗号分隔的 skill 上下文，不会在命令真正执行前失败。 (#7612) 感谢 @johnkattenhorn。
- `od media generate --help` 现在只会显示帮助，不会意外开始生成。 (#8066)

### 🎨 Studio、编辑与画布

- 带 manifest 的 Markdown artifact 现在会计为真实运行输出；迟到的封面渲染也会达到清晰的最终状态，不再留下误导性的结果。 (#7586, #8061) 感谢 @arccat-114。

## 🐛 修复

### 🧠 Agent、runtime 与对话

- 恢复后的对话会在重新加载和任务续接后保留正确的任务结论、输出和仅规划意图。 (#8195, #8008, #8007, #8172)
- 分支对话不再把源对话的运行 artifacts 带进新聊天。 (#8029) 感谢 @lefarcen。
- 对话继续后，未回答的问题会折叠，但不会假装已经得到回答。 (#8158)
- 规划阶段被拒绝、但已经给出有效回复的任务会保持正常的 Done 状态，不再显示失败卡；真正的生产阶段失败仍会如实显示。 (#8322) 感谢 @itscheems。

### 🎨 Studio、预览与导出

- 预览快照会保留真实页面内容，延迟的文件读取也不会替换掉正在使用的预览。 (#7125, #8067) 感谢 @huynextlevel。
- 合法的思考流卡片会正常渲染；不合法的卡片会安全地留在对话之外。 (#8258, #8264) 感谢 @lefarcen。

### 🌍 本地化

- Design System 流程、Library 和 Memory 的法语文案已完整补齐。 (#7906, #7756) 感谢 @davezfr。

### 🖥️ 桌面端

- Windows 全新安装可以完成本地桌面交接，并正常加载 App。 (#7520) 感谢 @lorenzozanee。

## 🙏 感谢所有参与 0.24.0 的贡献者

@AmyShang-alt · @arccat-114 · @davezfr · @huynextlevel · @itscheems · @jax-novita · @johnkattenhorn · @lefarcen · @lorenzozanee · @maoxin1234 · @nettee · @Siri-Ray · @tony-box
