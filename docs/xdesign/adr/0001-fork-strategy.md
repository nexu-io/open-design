---
status: accepted
---

# Fork 策略：长期 merge-tracking fork + overlay 定制

`zgar-limited/open-design` 是 `nexu-io/open-design`（Open Design）的企业内部 fork，目标是定制为 xDesign（换品牌 + 企业开箱即用 + 飞书登录准入），同时长期跟踪上游 fix/feature。我们选择**长期 fork + 周期性 merge 上游 tag + overlay 定制（不改 core 产品逻辑）**的轻 fork 路线。

## 决策

- **同步机制**：`git remote add upstream`，周期性 `git merge upstream/<tag>`（sync window，每 1–2 个上游 release 一次），不追 `main`，不用 rebase。
- **贡献策略**：全私有 patch、单向同步——所有定制（含 app identity 收敛这类通用改造）都只落在 zgar-limited 仓库、不回流上游；上游是纯输入源，不做跨仓贡献。
- **文档隔离**：fork 策略文档放 `docs/xdesign/`（`CONTEXT.md` + `adr/`），不动上游根目录、不建根 `CONTEXT-MAP.md`。
- **定制深度**：light fork——只替换品牌、企业配置、模型接入、更新源、加飞书准入闸门，不改 core 产品逻辑。重度 core 改动留待未来单独评估。
- **overlay · 构建时**：品牌身份（PRODUCT_NAME / appId / channel / 图标 / 运行时字面量）走 build-time 注入——私有目录承载 brand config + 注入脚本，打包时覆盖上游散落的 4 梯队身份点（见 identity 调查：`packages/release`、`tools/pack` mac/win/linux constants、`win/builder.ts`、运行时字面量、`tools/pack/resources/` 图标）。
- **overlay · 运行时**：飞书 OAuth 硬墙准入 gate（app 级——启动校验 + 运行期 token 重校验，daemon 维持上游 localhost 信任不动）+ 企业配置（模型网关等）。
- **砍件**：移除 `apps/landing-page`（企业内部不需要营销站）。

## Considered Options（被否决的备选）

- **rebase 同步**：长期定制分支每次重放所有定制 commit，越来越痛。
- **cherry-pick only**：要长期跟上游 fix/feature，不适合只挑拣。
- **跟 `main`**：等于帮上游做 QA；企业稳定性优先选已发布 tag。
- **完整飞书 SSO（daemon per-request 用户身份 + 多用户隔离）**：中-重改造；本地单机准入场景用 app 级 gate 即可，不需要。
- **runtime config 改造 core 身份（core 改成读 config）**：碰 core 产品逻辑，超出 light fork 约定；用 build-time 注入（不改 core）替代。

## Consequences

- sync window 是有计划的运维动作，不是随手 merge；每次需核对「刻意不要的上游件」清单（当前：`apps/landing-page`）。
- 私有 patch 面需维护：每次 sync window 解冲突（主要集中在飞书 gate、品牌注入点、被砍的 landing-page）。
- 飞书 gate 在 **app 级**——防「未授权员工用不了 app」，**不防**「本机进程绕过 app 直调 daemon raw API」（上游既有 localhost 信任设计）。若有更强数据隔离需求，需升级到 daemon 级 auth，届时重新评估 fork 深度。
- app identity 收敛（若未来做）作为私有 patch 维护、不回流上游；每次 sync window 在身份注入点解冲突。
- build-time 注入脚本需维护一份「覆盖清单」（identity 4 梯队文件）；上游新增身份散落点时要更新清单。
