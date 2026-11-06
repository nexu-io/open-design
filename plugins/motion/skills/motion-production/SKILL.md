---
name: motion-production
description: OpenMotion 薄路由与交付入口：为新片、已有工程修改、模板使用、参考视频复刻、视频转可复用模板、审片或导出选择路线，复用已确认上下文并完成约定交付。已进入专业路线时沿用该路线；仓库开发与文档维护不触发影片制作。
---

# Motion production

## 职责与目标

承担薄路由与制作统筹：判断本轮范围、选择或恢复一条路线，并协调约定交付。具体创作方法由专业 Skill 承担，工程与修改方法由共享规范承担；本入口不另建一套制作流程。明确的专业任务可直接进入对应 Skill，不必先经过本页。

目标是让已确认的决定、工程状态与检查证据贯穿制作和续作，交付到用户要求的阶段。同一个 Agent 按需读取文档即可，不要求多 Agent 编排。

## 1. 复用上下文，确定范围

先从当前请求与已有上下文区分方案、制作、局部修改、审片或导出，复用已确认的简报、素材、项目与授权，再按下表选择或恢复路线。不为选路预先读取所有专业流程；本次必读依赖在选定范围后按共享上下文补齐。续作不重新加载仍可用的入口与共享页。用户只要脚本或审片时，不启动服务、改工程或渲染。

## 2. 选择一条主路线

| 当前请求 | 进入路线 |
| --- | --- |
| 用户接受安装后的首次体验邀请，回复“体验”或明确同意 | [template-to-video](../template-to-video/SKILL.md)，已确认 `product-promo` 示例内容、独立工程、右侧可编辑预览与最终 MP4；不再问素材/模板，等待并验证导出后交付 |
| 原创产品宣传、品牌片、动态图形，或大幅重编叙事 | [motion-director](../motion-director/SKILL.md) |
| 使用已选可编辑模板、原样出片或替换适配内容 | [template-to-video](../template-to-video/SKILL.md)，已有实际流程 |
| 明确要求把视频制作成可复用模板或模板 ZIP | video-to-template（源码扩展，一期不随包分发），单独的模板生产入口 |
| 复刻参考视频的结构、动作或节奏；输入为链接或文件 | [motion-recreate](../motion-recreate/SKILL.md)，目前为职责占位 |
| 参考视频只提供风格灵感，不要求复刻 | motion-director |
| 改现有工程的文字、颜色、局部时间 | 共享运行规范；按需读取 [制作决策](../motion-director/references/production-decisions.md) 与 [审片标准](../motion-director/references/motion-review.md)，不重启创作 |
| 只改声音、画面锁定 | [声音叙事](../motion-director/references/sound-narrative.md)、[动作脚本的声画锚点](../motion-director/references/action-script.md) 与审片标准；保留画面，不重启原创 |
| 仅导出、验证或技术排错 | [运行规范](references/production.md) 与 [验证](references/verification.md)；不重新选模板或编导 |
| 仅方案或审片 | director 中相应范围，停在所请求阶段 |

以用户意图与交付物为先。视频转模板只在要求可复用模板时进入；只要复刻作品时继续使用 recreate，不默认先制作模板再修改。视频 URL 不等于复刻请求，项目源自模板也不代表本次局部修改要重新应用模板。画廊选中项先从其真实来源/指引读取准确 ID：`builtin` / 可编辑 `registry` 源码走模板；只有参考成片的 `reference` 走复刻。实际素材与分类不符时检查来源，纠正一次路线，不来回转交。模板选择仅在用户要用模板但尚未选择或授权代选时展开；原创创作无需先选模板。

## 3. 执行与交付

1. 选定专业路线后读取该入口，由它应用 [共享上下文](references/context.md) 的依赖清单并继续；不再返回本页执行第二遍流程。局部修改、声音、仅导出等无须新选专业路线的任务，直接应用共享上下文及对应参考。修改已有内容时应用 [共享修改流程](references/edit.md)；新片需要补齐简报时读取 [需求与记录](references/intake.md)。已读正文复用。
2. 需要操作工程时读取运行规范；原生编写前读取 [Native authoring](references/native.md) 及工具返回的固定版本 `authoringGuide`。确认目标项目与最新 revision，再执行对应 MCP 操作。
3. 核对共享上下文中的本次必读依赖已齐备，应用已读质量参考。补读结果须先返回模型，再在后续工具调用中执行依赖操作；不能在同一外层调用中补读并修改。导演层负责动态叙事、跨段连续性和声音；运行层负责项目、素材、revision、检查与导出。仅补齐阅读记录中的缺口；做过的工程操作不因换文档再执行。
4. 新制作或修改后，观看实际产物并检查受影响区间与接点；需要交付全片时检查全片。新导出必须针对已审查 revision，并验证实际 MP4；仅复用未修改模板的既有预览按专业入口核验。技术通过不能代替 Motion 与声画质量判断。
5. 按请求交付方案、预览、工程或视频，记录实际路径、检查与剩余限制。成片可复用未修改模板的既有预览时，按 template-to-video 核验并直接交付；需要新渲染时才按导出流程执行，不把完整制作流程强加给 starter、局部修改或审片。

## 本地与 MCP 使用同一份文档

相对链接以本文件解析。MCP-only 客户端通过 resources/list 发现、resources/read 读取 `motion://workflow/production/start`，专业入口为 `motion://workflow/director/start`、template/start、recreate/start；共享参考使用 production/context、native、production、verification、edit 等路径。导演质量参考用 director/actions、craft、phrases、decisions、sound、review、examples。固定引擎指南为 `motion://engine/SKILL.md`。

resources/read 返回相同正文及 documentId/contentHash/references，用其定位相对链接并复用已读版本。只加载当前范围所需内容；正文被截断或丢失时补读。文档读取不是工程执行或验证证据。一期不再提供单独的工作流读取 Tool。
