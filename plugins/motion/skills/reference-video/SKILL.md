---
name: reference-video
description: OpenMotion 原生 Hyperframes 编写的兼容入口，供旧引用继续使用。新的视频任务使用 motion-production 按意图选择路线；本入口不承担专门的视频复刻分析。
---

# Native authoring — compatibility entry

本入口负责将旧引用接入共享原生编写规范，目标是让已有任务在同一工程与阶段继续执行。

直接读取 [共享上下文](../motion-production/references/context.md)、[运行规范](../motion-production/references/production.md) 和 [Native authoring](../motion-production/references/native.md)，继续当前阶段，不返回总入口重做需求或选模板。`motion_write_files` 等工程写入仍须确认目标与 revision；导出按 [验证](../motion-production/references/verification.md) 检查实际文件。

MCP-only 使用 `motion_get_workflow({"workflow":"production","section":"native"})` 获取全文。此兼容入口不是新的复刻专业能力。
