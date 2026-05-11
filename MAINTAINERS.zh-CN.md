# Maintainers

<p align="center"><a href="MAINTAINERS.md">English</a> · <a href="MAINTAINERS.pt-BR.md">Português (Brasil)</a> · <a href="MAINTAINERS.de.md">Deutsch</a> · <a href="MAINTAINERS.fr.md">Français</a> · <b>简体中文</b> · <a href="MAINTAINERS.ja-JP.md">日本語</a></p>

本文档定义了 `nexu-io/open-design` 项目中**成为、担任、退出 Maintainer** 的规则。Core Team 个人名册由内部维护，本文档不公开列出——对外公开的是大家共同遵守的规则。

> **状态**：v1，2026-05-11 起草。配套文档 [`CONTRIBUTING.md`](CONTRIBUTING.md#becoming-a-maintainer) 会把贡献者引到这里读完整规则。

---

## 角色定义

| 角色 | 权限 |
|---|---|
| **Contributor**（贡献者） | 任何提过至少 1 个 merged PR 的人，无特殊权限。 |
| **External Maintainer**（外部 Maintainer） | 按本文档规则晋升的社区贡献者。可 review、approve、关闭/重开 issue、自分配 issue。**不能点 Merge 按钮**——这一权限保留在 Core Team。 |
| **Core Team**（核心团队） | Open Design 内部团队。拥有完整仓库写权限，是治理决策的最终权威。名册由内部维护。 |

下文除非特别说明，**讨论的都是 External Maintainer**。

---

## Maintainer 比普通 Contributor 多什么权限

| 操作 | Contributor | Maintainer |
|---|:---:|:---:|
| Approve PR | ⚠️ 算评论，**不**算 merge 所需的 approve | ✓ 算 merge 所需的 approve |
| 关闭 / 重开 issue | 仅自己开的 issue | ✓ 任意 issue |
| 自分配未指派的 issue（优先 P0） | ✗ | ✓ |

### Merge 三条件

任何 PR——不论作者是谁——都需要**同时满足**：

1. 无代码冲突
2. CI 全绿
3. 至少 1 个 Maintainer 或 Core Team 成员 approve

Maintainer 的 approve 是绝大多数 PR 走的 merge 路径——这是 Maintainer 在项目日常中最直接的信任体现。

---

## 如何成为 Maintainer

入选有 **3 项标准**，**全部**满足才进入候选。

### 1. 贡献量

- **≥ 20 个 merged PR** 到 `nexu-io/open-design`

这是软门槛而非自动通行证——达到 20 PR 让你**进入考量**，不保证晋升。

### 2. 账号质量（防 bot / 防小号）

我们对候选人 GitHub 资料做 7 个维度检查。**7 项中至少 5 项达准入线，且零项触发一票否决。**

| # | 维度 | 准入线 | 一票否决线 |
|---|---|---|---|
| 1 | GitHub 账号注册时长 | ≥ 1 年 | < 90 天 |
| 2 | Public repos | ≥ 3 | 0 |
| 3 | Followers | ≥ 10 | < 3 |
| 4 | Followers / Following 比 | > 0.30 | < 0.05（典型刷号特征） |
| 5 | 资料完整度 | 自定义头像 **且** bio / company / blog / twitter 至少 1 项 | 默认头像 **且** bio/company/blog 全空 |
| 6 | 跨项目活跃 | 在 **本仓库以外** 至少 1 个公开仓库有 merged PR 或长期 issue/star 活动 | 仅在本仓库有贡献 |
| 7 | 账号状态 | 无 GitHub 平台限制（spam/banned/restored） | 任一限制 |

#### 早期项目例外条款（仓库满 6 个月后自动失效）

`nexu-io/open-design` 自首个 commit 起 6 个月内，**跨项目活跃**一票否决条款（#6）可由 Core Team 共识豁免，前提是：

- 维度 1 / 2 / 3 / 5 都明显高于准入线；**且**
- Core Team 经过实际 review 判断该候选人在本仓库的 PR 质量足够高

豁免决定需在 Core Team 内部记录中注明候选人姓名与日期。仓库满 6 个月后，本豁免条款不再可用。

### 3. 贡献质量（Core Team 综合评估）

定性评估，无固定公式。Core Team 关注：

- **代码质量**——merged PR 的正确性、scope 控制、对仓库 boundary 的尊重
- **Review 质量**——历史 review comment 是否有实质内容
- **社区参与**——Discussions / issue 分流 / Discord 互动
- **协作信号**——对 review feedback 的响应速度、修改意愿

通过前两项进入候选池，跨过第三项才被正式提名。

### 提名流程

1. 由某位 Core Team 成员在内部提出候选人
2. Core Team 内部达成共识
3. 一位 Core Team 成员私下联系候选人，确认意向
4. 进入 Onboarding
5. 公开 announce

**没有提名 PR、没有公开投票、没有固定任期**。这是有意做的选择——和 K8s/Apache 的 approver 投票模型相反——因为项目早期 Core Team 共识更快、决策质量相同。**当 External Maintainer 数量超过 5 人时，本节将被重新审视**。

---

## 责任与期望

**没有硬性指标。** 不设每周 PR review 数量、不设 issue 分流速率、不设响应 SLA。Maintainer 身份是对信任的认可，不是无薪工作。

我们在精神层面期望：

- 在你有上下文的 PR 上 approve；不熟悉的 abstain
- 尊重 Merge 三条件——你的 approve 是真信号，不是 rubber stamp
- 长期离线时在 `#maintainers` 提前打招呼
- `#maintainers` 中分享的未公开 roadmap 视为机密，不外传

如果 Core Team 观察到 bad-case 行为（草率 approve、恶意 close issue、泄漏未公开 roadmap 等），权限会按下节"强制退出"路径回收。

---

## Maintainer 专属权益

除上文所列仓库权限外，Maintainer 还会获得社区其他人没有的几样东西：

- **Discord `#maintainers` 频道**——与 Core Team 共享的私密工作空间。用于设计预览、RFC 草稿、未公开 roadmap 的内部协调
- **未公开 roadmap 的提前可见性**——你能在公开 announce 之前看到尚未发布的工作。Maintainer 同意在 Core Team 公开 announce 之前不外传内容
- **直通 Core Team 的沟通**——你在 `#maintainers` 的消息会得到比公开 Discussions 更快、更实质的回应，Core Team 在架构和 roadmap 决策上会主动征求 Maintainer 的意见
- **Maintainer 勋章**——你的 GitHub profile 与 MAINTAINERS 相关仓库表面上的公开信任标记（等 GitHub 自定义 badge 能力就绪后推出）
- **晋升时的公开认可**——Twitter / GitHub Discussions / Discord 三渠道同步 announce

---

## 退出（Step-down）

Maintainer 不是终身职位。三种退出路径：

### 主动退出（Graceful）

- Maintainer 私聊 Core Team 或在 `#maintainers` 公开说明
- 24 小时内回收权限
- 转入 **Emeritus** 状态
- 退出原因不要求公开

### 不活跃自动转（Inactive）

**触发条件**（任一即触发评估）：

- 连续 **90 天** 无任何活跃信号（merged PR / review comment / issue 处理 / Discussion 或 Discord 实质参与），**或**
- 连续 **60 天** 未响应任何 @mention（PR review request / issue assignment）

**流程**：

1. Core Team 在 `#maintainers` 私下 @ 提醒，给 **14 天回应窗口**
2. 14 天内仍无实质响应 → 转入 Emeritus，回收权限
3. 在 GitHub Discussions 公开发简短善意说明："感谢 @xxx 过去的贡献，已转入 Emeritus，欢迎随时回归"
4. 回归路径很简单——见下节 "Emeritus"

### 强制退出（For cause）

**触发场景**：

- 反复 bad-case 行为（草率 approve 不达标 PR、恶意关闭 issue、滥用权限等）
- 违反项目 [Code of Conduct][coc]
- 安全级别事故（账号被盗未及时报告 / 故意泄漏未公开 roadmap 等）

**流程**：

1. 任一 Core Team 成员可发起讨论
2. **至少 3 名 Core Team 成员**同意才执行（不需要全体共识）
3. 决定后 24 小时内：回收权限、移出 `#maintainers`、从任何 Maintainer 名册移除（**不**进入 Emeritus）
4. 当事人会被告知决定与理由，可申诉一次

原则是 **"倾向于保留 Maintainer"**——单次小过失不至于走强制路径，强制退出仅针对反复模式或严重单次事故。

[coc]: https://www.contributor-covenant.org/

---

## Emeritus（荣誉退役）

主动退出或不活跃转出的 Maintainer 进入 **Emeritus** 状态：

- 失去 write / approve / close 权限
- 在（内部）名册的 Emeritus 区块保留致敬
- 保留 Discord `#maintainers` 访问（read-only 或保留发言由 Maintainer 自选）
- 不再背任何责任

### 从 Emeritus 回归

最简回归路径：**最近 30 天有 ≥ 3 个 merged PR**，Core Team 即恢复权限，无需重新提名。

Emeritus 的意义是承认"生活会发生事"——休假、换工作、生孩子——双方都不需要任何 drama 或社交压力。

---

## 本文档的修订

本文档规则可由 Core Team 共识修订。**实质性变更**（准入门槛、退出阈值）会在 GitHub Discussions 提前 announce 后再对任何在审候选人生效；**编辑性澄清**可直接 land。
