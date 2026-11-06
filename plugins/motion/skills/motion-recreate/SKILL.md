---
name: motion-recreate
description: 按参考视频复刻或重建动作、节奏和结构，支持视频链接与本地文件。当前专业流程为职责占位，使用现有视频检查与原生制作能力；仅取风格灵感的原创走 motion-director，可编辑模板适配走 template-to-video，明确要求可复用模板交付走 video-to-template，普通局部修改不走本入口。
metadata:
  status: placeholder
---

# Motion Recreate — 职责占位

## 职责与目标

负责从实际可观察的参考中分析并重建用户指定的动作、节奏与结构。目标是在现有能力内把这些特征转成可编辑内容，按相应时间区间对照参考，说明已保留的特征和未达到的部分。

仓库暂未提供成熟的视频分析与复刻专用流程。本入口声明职责和现有能力接法，不承诺自动分镜分析或高保真复刻。

## 执行与交付

1. 首次进入读取 [共享上下文](../motion-production/references/context.md)，按其清单只补齐当前范围未读的依赖；已有正文与已读记录继续复用，不在后续步骤再次加载。沿用已有范围；直接进入本入口时不返回总入口重做路由。
2. 实际读取参考视频，确认保留/替换的内容、动作、节奏与声音。链接和本地文件共用这条路线；只有封面或无法访问时不得声称看过。只有风格启发而非复刻要求时纠正到 [motion-director](../motion-director/SKILL.md) 一次，不来回转交。
3. 按 [运行规范](../motion-production/references/production.md) 与 [Native authoring](../motion-production/references/native.md) 执行现有可用能力。修改已有草稿或在原工程转向复刻时应用 [共享修改流程](../motion-production/references/edit.md)，更新本轮范围并保留仍有效的决定。补读结果先返回模型，后续调用再执行依赖操作。把参考中的可观察规律转为可编辑内容并进行比较；不能把整段原视频放进时间线就宣称已复刻，也不能替换成无关内置模板。原片声音不自动成为交付音轨。
4. 按影响读取 [制作决策](../motion-director/references/production-decisions.md) 与 [审片标准](../motion-director/references/motion-review.md)，检查时间结构、关键动作、接点与状态；声音需求按共享上下文读取对应参考。交付成片时执行 [验证](../motion-production/references/verification.md)。不要重启原创方向选择，也不能以静帧相似替代动态比较。
5. 停在约定阶段；参考、分析或实现能力不足时报告具体缺口与影响，不虚构已完成或高保真结果。可完成的工作继续。

MCP-only 使用 resources/read `motion://workflow/recreate/start` 读取本页，按链接读取共享及质量参考，复用仍完整可用的正文。
