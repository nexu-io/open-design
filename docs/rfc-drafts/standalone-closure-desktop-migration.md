# RFC Draft: Standalone Closure 与 Desktop 三代迁移

**状态：** Working Draft

**实现基线：** `origin/main@66004e0cd788644562dcfc3a19727f80369a771e`

**参考实现：** `feat/codex-plugin-dev-loop@2e41b695d8f97eb21d61cb2555ff2e336927d26b`（只读参考，不作为实现基座）

> **2026-08-07 更新：** 本文保留最初的三代迁移与原子任务估算作为背景。
> 下一版本的并行交付边界由
> [ADR 0002](../adr/0002-stabilize-standalone-closure-handoff.md) 与
> [Standalone Closure parallel handoff](../handoffs/standalone-closure-parallel-handoff.md)
> 收紧：先固定 shell-carried shim/handoff，再由 Shell 与 Closure 两侧并行实现。

## 1. 结论

Open Design 已经具备可靠的 Web/daemon sidecar、namespace/data-root、Desktop launcher、payload 更新、失败回滚和跨平台产品验收。当前任务不重写这些能力，而是把已经成立的产品边界迁移到正确的代码和交付边界，并在迁移完成后删除历史组合路径。

目标边界：

- `standalone closure = web + daemon`，拥有一个版本、一个摘要和一个产品生命周期；
- Desktop 是 shell，窗口、安装器、IPC、宿主权限和 shell 更新归 Desktop；
- shell launcher identity 与 closure identity 独立；
- packaged 只保留兼容入口和装配职责，最终不再拥有产品内核生命周期；
- Codex Plugin 分发、Portal、差量传输和通用多壳并发附着进入 Later。

迁移采用 Expand → Migrate → Contract 三代交付。这里的“三代”是同一更新渠道中的连续产品世代；beta、prerelease、stable 是每一代的晋级路径，不能被当作三个兼容世代。

## 2. 当前代码凭证

以下 `origin/main` 能力构成本次迁移的基座：

- `apps/packaged/src/standalone-launcher.ts` 已组合启动 Web 与 daemon，并拥有共同就绪、退出和状态面；
- `apps/packaged/src/standalone-launcher-entry.ts` 已提供无 Electron 的壳侧入口；
- `apps/packaged/src/sidecars.ts` 已拥有跨平台子进程启动、健康等待和数据根传播；
- `packages/launcher-proto/src/index.ts` 已拥有 Desktop payload 的 active、attempt、last-successful 与 rollback 原语；
- `tools/pack/src/mac/payload.ts` 与 `tools/pack/src/win/payload.ts` 已生成 versioned Desktop payload；
- `e2e/specs/mac.spec.ts` 与 `e2e/specs/win.spec.ts` 已验证 payload 更新、冷启动、失败回滚和恢复；
- `control.launcher.version.min` 已能要求旧 outer 走 installer-reinstall。

当前缺口不是功能空白，而是所有权错位：Standalone 生命周期仍归 `apps/packaged`，现有 payload 仍同时包含 shell 与产品内核，launcher pointer 选择的是完整 Electron payload，而不是独立 Closure。

## 3. 长期不变量

1. 一个 `<channel, product namespace>` 只有一个 active Closure 身份。
2. Web 与 daemon 整体构建、校验、激活和回滚，不能跨版本组合。
3. 公开候选身份不绑定本地 namespace；绑定发生在本地激活时。
4. shell 版本与 Closure 版本独立，双方通过兼容声明裁决附着。
5. 兼容路径不能产生第二套 active pointer、数据根或产品生命周期。
6. 传输方式可以演进，激活单位始终是完整且可验证的 Closure。
7. G3 完成时，旧组合产物和兼容代码必须实际删除。

## 4. 三代 / 十个 PR

### G1 — Expand：新边界上线，行为不变（3 PR）

#### PR1：Closure 身份与候选协议

- A01：定义 namespace-neutral 的候选身份；
- A02：定义绑定 `<channel, namespace>` 后的本地身份；
- A03：定义摘要、平台、协议版本与 shell 最低版本校验；
- A04：提供纯协议测试，证明候选不能提前携带 namespace。

完成信号：Closure 身份不依赖 Desktop、packaged 或 Codex 类型。

#### PR2：提炼 `apps/standalone`

- A05：建立 shell-neutral Standalone 应用边界；
- A06：迁移 Web + daemon 共同启动；
- A07：迁移共同就绪、健康与诊断；
- A08：迁移共同退出和子进程收敛；
- A09：保持现有数据根和资源根传播不变。

完成信号：`apps/standalone` 可独立证明产品生命周期，且不拥有 Desktop IPC、窗口或更新 UI。

#### PR3：packaged 兼容适配

- A10：packaged 改为调用 Standalone 边界；
- A11：现有 Desktop/CLI 入口、路径和启动语义保持兼容；
- A12：macOS 与 Windows 当前产品 smoke 保持等价；
- A13：记录 G1 shell capability，供下一代迁移裁决。

完成信号：用户行为和现有产物不变，但所有已升级壳都理解新边界。

### G2 — Migrate：独立 Closure 默认运行，旧路径可恢复（4 PR）

#### PR4：独立 Closure 构建

- A14：构建独立、不可变的 Closure archive；
- A15：生成摘要、manifest 与 provenance；
- A16：拆分 Closure 与 shell 的构建 determinant；
- A17：验证 macOS/Windows archive 内容与入口。

#### PR5：Closure 本地状态

- A18：建立独立于 launcher 的 Closure store；
- A19：实现 active、attempt 与 last-successful；
- A20：实现原子激活和启动失败回滚；
- A21：确保状态以 channel/namespace 为坐标且不嵌入端口。

#### PR6：Desktop 附着与兼容回退

- A22：Desktop/packaged 优先附着 active Closure；
- A23：新路径不可用时回退旧组合产物；
- A24：保持 installer、shortcut、冷启动和宿主 IPC 行为；
- A25：壳更新和 Closure 更新分别报告身份与诊断。

#### PR7：双产物发布与混合世代验收

- A26：release metadata 同时声明 legacy payload 与 Closure；
- A27：release workflows 构建、校验并发布 Closure；
- A28：验证 G1 shell → G2 Closure、G2 shell → legacy fallback；
- A29：完成 macOS/Windows 更新、冷启动、故障回滚和 installer-reinstall。

完成信号：具备能力的壳默认运行独立 Closure；旧组合仍是限时恢复路径。

### G3 — Contract：提升下限并删除旧路径（3 PR）

#### PR8：独立升级与构建收口

- A30：shell 与 Closure 分别裁决更新；
- A31：Closure 变化不再触发无关 shell 构建；
- A32：shell 变化不再重新证明未变化的 Closure；
- A33：诊断面能同时证明两个身份及兼容裁决。

#### PR9：提高 shell 最低版本

- A34：把 G1/G2 已验证壳设为 Closure 最低版本；
- A35：旧 outer 统一进入 installer-reinstall；
- A36：停止发布旧组合 payload；
- A37：验证同渠道升级不会产生不可恢复的版本断层。

#### PR10：删除兼容层

- A38：删除 packaged 私有 Standalone 生命周期；
- A39：删除 legacy combined fallback 与历史状态翻译；
- A40：删除不再使用的构建节点和重复测试；
- A41：完成 macOS/Windows 最终产品 E2E、架构文档和退出证明。

完成信号：只有 Closure 是产品内核真相；packaged/Desktop 不再组合另一套 Web + daemon。

## 5. 发版门槛

每一代都必须完成 beta → prerelease → stable 晋级，并保留 macOS 与 Windows 独立证据。

G1 → G2：

- G1 shell 已覆盖目标升级人群；
- 当前组合产物的产品 E2E 无回归；
- 新边界可被诊断，但不改变发布产物选择。

G2 → G3：

- 独立 Closure 至少经历一个完整同渠道发版周期；
- macOS/Windows 均通过更新、冷启动、失败回滚和 installer-reinstall；
- 混合世代矩阵全部有确定结果；
- 没有引入未建模的不可逆数据迁移。

## 6. 范围控制

本轮不交付：

- Codex Plugin 的独立分发或 QA 接入；
- Portal 或 marketplace；
- Closure 差量传输；
- Node 供给策略调整；
- 通用多壳并发 attachment/lease；
- 主动的数据 schema 重构。

如果三代期间 `main` 引入不可逆数据迁移，必须显式增加 data-floor 工作，不得吸收到现有 PR 而不调整任务量级。

## 7. 工作量口径

当前计划为 41 个可独立验证的原子任务，组合为 10 个责任边界清晰的 PR。原子任务数量不是工时；发版执行与人工验收也不计入 PR 数量。

额外的非 PR 交付包括：

- 三代发版晋级；
- 每代 macOS + Windows 六轮平台验收；
- G0 → G1、G1 → G2、G2 → G3 的真实升级链证据；
- Desktop 可见体验的人工确认。
