# OpenDesign repository guidelines

This module lives at `plugins/motion/` in the OpenDesign repository. Follow the repository and parent plugin guidance as well. Motion remains an independently installed npm application: run its commands from this directory, preserve `package-lock.json`, and do not import OD application-private code. Build validation is in the repository-root `.github/workflows/motion.yml`; see [the migration guide](docs/repository-migration.md).

## 持续维护产品文档

`docs/` 是仓库内持续维护的产品知识库。所有贡献者与 Agent 都应在交付需求时同步沉淀产品理解；代码、聊天记录或 PR 描述不能代替产品文档。

开始仓库需求前，先读 [文档入口与维护流程](docs/README.md)、[产品架构](docs/product/architecture.md) 和该需求涉及的专题。公开文档仅维护使用说明、技术契约和可复现验证。

每次需求交付（功能、体验优化、修复、重构、接入或文档建设）都必须：

1. 明确用户问题、服务人群、预期结果和验收方式。复用已有需求信息；缺失内容先标记假设，不编造客户、访谈、市场规模或收入数据。
2. 在同一提交或 PR 中更新受影响的产品架构、画像、商业化或工程专题文档。用户可见入口、行为、配置或限制变化时同步更新 README。
3. 在 [需求与决策记录](docs/product/changes.md) 新增或补充对应需求条目，记录问题、选择、影响、验证证据和后续待验证事项。对画像或商业化没有影响时，在该条目写明原因，无需改写无关章节。
4. 将“当前已实现”“已确认方向”“待验证假设”“候选方案”分开。商业化设想不写成已上线能力；界面截图、热度快照和技术测试不自动证明用户需求、留存或付费意愿。
5. 检查文档链接、源码路径和口径；替换过时结论时保留决策缘由与历史入口。PR 或交付说明给出更新的文档链接与实际验证结果。

每个需求 PR 或直接提交都应包含对应的文档变更。小需求可直接补充现有专题与一条需求记录；跨模块需求可使用 [需求文档模板](docs/templates/requirement.md)。按实际影响更新，不为凑文档创建空文件，也不把同一规则复制为多份互相矛盾的说明。现有授权范围内的文档维护随实现一起完成。

`AGENTS.md` 是所有 Agent 的共同准则，`CLAUDE.md` 引用同一套规则。准则变化时同步两者的入口。可分发插件也应包含两份入口和 `docs/`。

## Video production entry points

Use [motion-production](skills/motion-production/SKILL.md) to select one route when a video task has not already selected a specialist. Original creation or major creative revision uses motion-director; editable template use/adaptation uses template-to-video; reference-video reconstruction uses motion-recreate (read the user's material, ask at most once, rebuild in an editor project with the nine phase-one Tools, deliver the film, a comparison and the editable project; its rebuild rules and measurer ship inside the Skill). A requested reusable template folder/ZIP from a video uses the separate video-to-template entry.

A directly selected specialist reads shared context and continues; do not bounce back to the production start. Small edits, audio-only changes, review-only and export-only requests resume their affected scope. Keep existing decisions and locked content. Repository development and documentation do not trigger video production.

Phase one exposes exactly nine motion_ Tools, defined in [the contract](docs/mcp-phase1-tools.md). MCP-only clients read the same guidance through resources/list and resources/read, beginning at motion://workflow/production/start or the already-selected specialist. The pinned engine guide is motion://engine/SKILL.md. The workflow-reading Tool is internal compatibility only. Follow conditional references and reuse complete document bodies. Native authoring belongs to the shared production/native guide. Technical export verification, visual quality and actual playback remain separate. See [Skill routing](docs/skills.md).


## Template production and reuse

`template-to-video` implements the default template route and reuses shared context/edit and managed-project revision protection. Unchanged requests can deliver the template's existing preview; edited content or missing previews use the appropriate render/verification path. `video-to-template` separately produces a portable reusable template from a video; it does not replace ordinary video recreation, which motion-recreate handles. Visual acceptance belongs to the user. Repository work does not invoke production Skills.
