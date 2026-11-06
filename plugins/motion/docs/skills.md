# Skill 路由与 MCP 调用契约

2026-11-05：已将 template-to-video 接入默认模板路线，并将 video-to-template 作为独立模板生产入口；保留 director 的质量规范。五题真实多轮首测发现漏读、重复读和冷启动 revision 冲突；当前一轮优化及前后对比见本页末尾。

## 职责与入口

已确定采用薄路由：泛化请求由 production 判断范围并选择一条路线，明确专业任务可直达；专业入口和共享规范不返回总入口重跑。production 保留续作恢复与交付协调，具体创作、工程和修改方法分别由专业 Skill 与共享规范负责。按选定范围补齐依赖，不在选路前全量加载。此为用户确认的架构选择；既有 A/B 未证明稳定成本或质量优势，不改变该实验结论。

| 入口 | 职责 | 当前状态 |
| --- | --- | --- |
| motion-production | 确定本次范围、选择路线、复用上下文、完成约定交付 | 已实现薄路由与交付协调 |
| motion-director | 原创、大幅重编、动作脚本与创作审片 | v1.4.4；七份质量参考与 v1.4 一致 |
| template-to-video | 已有模板原样出片、源码适配与内容替换 | 已接入默认 template 路线，共用修改与 revision 规范 |
| video-to-template | 把视频制作成可复用模板文件夹 / ZIP | 独立模板生产入口，不代替普通视频复刻 |
| motion-recreate | 从视频链接或文件重建动作、节奏与结构，做成用户自己的片 | 已实现；重建、测量参考与 `scripts/measure_frame.mjs` 在本 Skill 目录内，只用一期 9 个工具 |
| reference-video | 旧引用的原生编写兼容入口 | 通用正文迁入共享 native，非复刻专业实现 |

各入口正文先说明职责与目标：production 负责范围和交付统筹，director 从产品事实、受众与传播目的判断动态表达，template-to-video 负责既有模板出片与内容适配，recreate 根据实际参考重建并核对差距；reference-video 继续承担兼容引导。director v1.4.4 将导演视角与成功标准前置，随后确定范围、读取工程规范并进入创作流程。角色定位不增加固定风格或新的专业能力，也不代表多个独立 Agent。

按用户意图选路，不以视频文件格式代替意图判断。模板目录的 builtin 与可编辑 registry 进入 template；video-only reference 进入 recreate。参考只提供气质时仍为原创。既有模板工程的普通局部修改不重新应用模板。

专业入口可由宿主 Skill 自动匹配、用户指定或准确模板指引直接选中，只读取共享 context 后继续，不返回总入口重做选路。局部修改、声音修改、仅脚本、仅审片和仅导出按当前范围执行；共享质量参考不会要求重启 director 的完整创作流程。Skills 是同一 Agent 的文档，不是相互递归执行的独立进程。

## 同源文档接口

本地文件和 MCP 返回同一份全文。注册表在 `shared/workflow.ts`，源码包含独立扩展参考，一期MCP resources仅列出4条发布路线：

MCP 工具说明和领域执行位于 `mcp-tools.ts`；`mcp.ts` 保留初始化、协议与共享后台转发。macOS 每条连接保留工程绑定，读取指导不启动后台或改变连接选择；托管工程写入仍校验目标与 revision，见 [共享编辑器](shared-editor.md)。

| workflow | section |
| --- | --- |
| production（默认） | start、context、intake、templates、native、production、verification、edit、portable |
| director | start、actions、craft、phrases、decisions、sound、review、examples |
| template（实际 template-to-video） | start |
| recreate | start、rebuild、verification |
| video-to-template | start、measure、rebuild、project、verification、sources |

```json
{"uri":"motion://workflow/director/start"}
```

一期 MCP 使用 resources/list 和 resources/read；URI 为 motion://workflow/<workflow>/<section>。旧工作流 Tool 只留内部兼容，不出现在一期 tools/list。无效 URI 或任意文件路径会拒绝。固定引擎指南为 motion://engine/SKILL.md，相关 Markdown 可按相对路径读取。

返回 `workflow`、`section`、`status`、`documentId`、`contentHash`、`content`、`path`、`sections`、`workflows`、`references`、`readNext`。`references` 包含相邻文档的准确 workflow/section/documentId；它是地址映射，不会递归读取。`ready` 表示该指导入口已实现，`placeholder` 表示专业流程占位，均不代表成片质量通过。

共享 context 维护按任务范围的依赖清单。Agent 计算本次必需正文与仍可用的已读正文之差，只补缺口；完整正文返回后记录文档标识和版本，复用会话或已有 STATE，不在活动工程内存放阅读记录。声音专项明确需要 actions，模板明确需要 templates，多段模板也需要 decisions。阶段或轮次切换本身不触发重新加载；只在正文丢失、截断或版本变化时补读并记录原因。不遍历全部 references，也不因加载新文档重复工程操作。MCP 不维护模型的阅读状态，不新增读前写硬门禁；记录与文字约束不能强制宿主执行。

`motion_get_template` 保留原 `workflow` 工具路径字符串，新增 `workflowGuide: {workflow, section, status}`。画廊短指令仍只携带指引 URL 和精确 ID；长指引进入对应专业路线，不再统一回 production/start。仅 starter 默认不导出，用户明确要求成片时包含导出。

## 共享质量与工具边界

修改已有内容时，四个入口按需接入 [共享修改流程](../skills/motion-production/references/edit.md)，MCP resource 为 `motion://workflow/production/edit`；不新增自动触发的 motion-edit。该流程确定变化、保持项及连带影响，基于当前源文件修改，并核对受影响区间、邻接转场、声画锚点和后续再现。初次创建默认草稿、仅打开预览或复用成片链接不因此重走修改流程。

首次缺少的规范和源文件须通过完成的工具调用先返回模型，再执行依赖操作；不能在同一个外层调用里补读并写入/套模板。完整正文仍可用时直接复用。长文档按实际返回预算分批，识别截断后补缺口；命令成功或 STATE 阅读记录均不能代替实际正文。此为宿主 Agent 的执行指导，MCP 未增加无法证明模型阅读状态的硬门禁。

原创制作按任务读取动作脚本、动态表现和短句参考，无需用户额外说“Motion 感”。多段/截图/状态延续、声音设计和动态审片按职责加载相应参考。模板与复刻按影响复用相同标准，不强制换成原创叙事、固定动效或固定音乐结构。

一期公开接口已收敛为 [9 个 motion_ Tool](mcp-phase1-tools.md)。旧 28 项实现只留内部兼容；读文件、任务查询及技术校验分别并入项目读取与导出流程。发布仅包含这四个专业/共享入口及其参考，reference-video 和video-to-template独立扩展保留源码，不装入一期包。核心 Skill 指引同步使用新契约；不新增制作引擎或自动复刻算法。

## 验证与限制

- 自动回归检查全部文档全文与 SHA256、跨路线链接、旧调用、错误参数、跨 cwd/符号链接，以及空工作区和已有工程不变。
- 目录/HTTP 指引检查 builtin、registry、reference 三种来源的准确 ID 和路线，保留短指令与原工具字段；MCP 源文件写入和 stale revision 拒绝继续覆盖。
- 独立 Agent 前向探针覆盖原创、模板默认内容、源码模板、风格参考、视频 URL/文件复刻、文字小改、声音锁画、仅导出、仅脚本、画廊成片和仓库开发。探针实际调用只读 MCP，停在工程/服务操作前；后续工具序列属于方案检查，不是实际制作执行证明。
- 发现并修复共享 native 的风格参考复制节奏、无条件渲染、仅导出打开编辑器的歧义，以及模板说明对 placeholder 的指代问题。明确宿主自动选中专业 Skill 也算已选路线，无需用户点名后才可直入。探针补齐真实工具 schema 后复验参数使用，避免把缺失 schema 的人工探针误用归因为产品接口失败。

上述早期探针支持文档可达与选路，不等于实际制作证明。随后以 Codex app-server 0.166.0、gpt-6.1-sol/high 跑了 01、04、05、14、17 各三轮真实会话及 MCP：路线和关键状态保持，但必读参考有 2 份从未请求，另 1 份正文截断后未恢复，冷启动 revision 冲突 2 次；未观察到重复成功制作/导出或路线循环。首测原记“额外重读 9 次”，复核模型实际收到的外层工具结果后校正为 5 次必要补读、4 次无效重读。完整命令 stdout 不等于模型收到完整正文。内置浏览器由宿主设置禁用，实际播放审听未验证；不将此实验用于成片质量或复刻保真度结论。

## v1.4.2：阅读复用与冷启动复测

Skill 只调整依赖可见性与已读正文复用，director 七份质量正文不变。工具层拆分后台服务与编辑器启动，冷启动不改写调用者的活动工程 revision；真实并发修改仍拒绝，后台服务随后可原地打开编辑器。没有增加工作流工具或复制媒体引擎。

复测沿用冻结五题、素材、模型与宿主参数，使用全新会话和隔离工程，不给候选反馈或修补产物。15 轮完成，真实 MCP 调用 111 → 107 次，必读未请求 2 → 0、正文截断未恢复 1 → 0、无效重读 4 → 0、冷启动 revision 拒绝 2 → 0。两轮均成功应用模板 2 次、导出 3 次，无重复成功执行、路线循环或关键状态丢失。候选仍有 8 份正文经截断补读恢复，不能称为解决了宿主输出截断。

补充时序审计发现候选 MT05 将 native 补读与 apply 放在同一个外层工具调用中，正文尚未返回模型时模板已经应用。轮末已读完整，不等于执行前已获得规范；本轮仍保留这一缺口，不判为全面通过，也没有在复测后修改候选掩盖它。后续应验证首次补齐关键规范的返回结果与依赖操作之间的决策边界，不要求对已读正文重复加载。

67 项后端/集成测试、类型检查及 Skill 入口校验通过；89 项工程/产物核对通过，三份实际 MP4 与技术验证哈希一致。七份质量正文保持原哈希。每题只跑一次，不把一次成功解释为稳定率。MCP-only、全局 Skills 竞争、长会话压缩、正常速度审看和试听不在已验证范围；完整记录在本地 `multiturn-routing-20261105-r2` 实验归档。

## v1.4.3：共享修改流程复测

v1.4.3 接入共享 edit，明确外层工具返回后的读后决策边界；保留上一轮后台启动与 revision 修复。同样五题、15 轮真实会话完成，105 次 Motion MCP 调用；6 个需修改既有内容的回合均在首次内容操作前获得 edit 全文。未发现范围外内容误改、关键状态丢失或重复成功套模板/导出；CTA 延续至实际 MP4，换音乐保留 SFX 文件与事件，风格参考阶段保留动作、明确改方向后才复刻。91 项工程/产物核对通过。上一轮这些功能保持项也未失败，不能据此宣称误改率下降。

MT05 原先同批补读/执行的问题未重现，但读取完整性未全面通过：MT04 长输出被截断，补读 action-script 33–51 行后仍未获得 28、30、32 行，按原全文标准记一项缺口。其声画锚点与 edit 正文已完整返回，未观察到由此造成误改；不能用 STATE 的已读声明代替到达证据。两轮无效重读和 revision 冲突均为 0。分段正文按精确原文行累计核对，旧题与原评分保持，新增 edit 检查单列。

相关接口/文档测试 7 项、仓库检查和四个入口格式校验通过，七份质量参考原哈希保持。正常速度播放和试听受宿主设置限制，未验证。实验归档为 `multiturn-routing-20261105-r3`；每题一次，不能外推总体稳定率。

复测期间当前分支另有首次体验、角色说明改动，director 更新为 v1.4.4。已保留这些改动及共享 edit 接入；冻结实验副本未变化。当前合并文本另通过 7 项接口/文档回归和仓库检查，完整真实会话结果仅对应冻结 v1.4.3，不自动认证合并后的行为。
