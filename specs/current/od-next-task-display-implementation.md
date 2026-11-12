# plan 与 production 展示合并实现

范围以 [产品需求](od-next-task-display-prd.md) 和 2026-10-19 用户确认的收敛要求为准。

- daemon 保留物理 Run、事件和执行状态，仅投影同一 strategy task 的自动 Run 顺序、整体状态与累计执行时间。展示 ID 直接使用 taskExecutionId，不继承跨用户操作的展示身份。
- Web 保留 foldStrategyTaskTurns 的原始 Run 边界和最终 Run 完成范围。task-presentation 汇总自动阶段的过程内容；仅有一个 Run 时走原有渲染路径。
- TaskExecutionRecord 使用现有 ExecutionShell 作为唯一状态与折叠入口。内部每个 Run 的过程内容继续使用各自的事件状态，避免过去的工具重新转为运行中。
- 不新增 CSS、文案、跨刷新折叠存储或跨用户消息的展示关联参数。原有问答、继续与重试路径保持原样。
- 复用现有 HTTP 状态响应与消息回读，Web 和 CLI 读取同一展示事实；无需为视觉合并新增 CLI 控件。

必要验证覆盖自动交接、最终结论到达时折叠、失败、取消、手动折叠、单 Run 回退、问答独立与历史计时回读。视觉验证在隔离的 tools-dev / Electron 中进行；模拟事件证明展示行为，不代替真实模型生成验证。

2026-10-28 同步 main：复用其「用时 / 已停止」及多语言时长格式，产物交付状态不改写 Run 结局；断线待确认消息先投影再聚合，重启中断按最后活动时间停止累计计时。
