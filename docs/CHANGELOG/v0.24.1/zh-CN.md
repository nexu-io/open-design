---
title: "Open Design 0.24.1 — 更稳的交接"
description: "一个聚焦可靠性的补丁：保留诊断证据，让桌面端更新重启更稳，正确呈现已成功结束的受阻运行，在所有主题下恢复全屏退出控件，并改进 OD Next 与 MCP 的故障处理。"
---

0.24.1 是面向 0.24 版本线的稳定性与可靠性补丁。没有新增界面；只是在应用重启、运行结束或需要排查问题时，少一些走不通的路。

## 🐛 修复

### 🧠 Agent、runtime 与诊断

- **正常结束的运行会如实保持完成状态。** 任务级阻塞不再把 agent 的正常退出变成误导性的失败运行卡；真正的崩溃和失败退出仍会明确显示为失败。 (#8350) 感谢 @itscheems。
- **支持包会保留真正关键的线索。** 无论从 App 还是通过 `od diagnostics export` 导出，诊断包现在都会携带 daemon 的内存压力、SQLite 增长和非正常退出健康证据。 (#8354) 感谢 @PerishCode。
- **OD Next 的 sandbox 运行能自行完成清理。** 运行输入的访问根目录会保持可写，以便 sandbox 清理完成，不再让运行卡在收尾阶段。 (#8024) 感谢 @arqueon。
- **致命 MCP 故障会说明发生了什么。** MCP stdio 进程现在会在退出前写出致命错误，客户端不再只看到一次无声消失。 (#7340) 感谢 @lorenzozanee。

### 🖥️ 桌面端与演示

- **桌面端更新不再与自身关闭过程竞争。** 打包 runtime 退出前会先停止渲染器流量，让重启交接更可靠。 (#8348) 感谢 @PerishCode。
- **全屏退出按钮终于属于你选择的主题。** 它的颜色、悬停和键盘焦点状态会在浅色与深色演示中保持清晰。 (#7272) 感谢 @dennytosp。

> 📥 **下载：** [Open Design 0.24.1](https://github.com/nexu-io/open-design/releases/tag/open-design-v0.24.1)。

## 🙏 感谢所有参与 0.24.1 的贡献者

@PerishCode · @itscheems · @lefarcen · @simpleqt · @arqueon · @dennytosp · @lorenzozanee
