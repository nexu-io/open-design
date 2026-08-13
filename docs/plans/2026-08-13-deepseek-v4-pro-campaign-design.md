# DeepSeek V4 Pro + V4 Flash 两周无限用活动设计

## 背景

DeepSeek V4 Pro 上线后，本次活动以新的独立版本承接原有营销触点和付费归因能力。活动窗口内同时开放 DeepSeek V4 Pro 与 DeepSeek V4 Flash 无限使用，但仍避免与上一版 Flash 活动代码、配置、事件和 PR 生命周期耦合。

## 已确认产品规则

- 活动从 2026 年 8 月 13 日 20:00 开始，持续两周，于 2026 年 8 月 27 日 20:00 结束。
- 产品界面仅展示“8 月 13 日—8 月 27 日”，不展示具体几点；活动中可以展示剩余时间倒计时。
- 活动期间同时展示 DeepSeek V4 Pro 与 DeepSeek V4 Flash 两项无限使用权益，套餐卡片中分两行表达，Pro 始终在前。
- Flash 原分支、活动参数和 PR 保留，不在 Pro PR 中修改。
- 主宣传语为“这次，顶级智能放开用。”；权益名称依次为“DeepSeek V4 Pro 无限使用”和“DeepSeek V4 Flash 无限使用”。
- 评审阶段使用 `campaign=deepseek-v4-pro` 强制预览，不改变真实活动时间判断。

## 隔离策略

### Open Design

- 基线：`feat/workspace-team`
- Pro 分支：`feat/workspace-team-deepseek-v4-pro`
- 目标：创建新的 Open Design PR，保持开放评审，不执行合并。
- 不依赖、修改或追加提交到 Flash PR #6450。

### Vela

- 基线及目标分支：`feat/go-plan`
- Pro 分支：`feat/go-plan-deepseek-v4-pro`
- 目标：创建新的 Vela PR，评审后合入 `feat/go-plan`。
- 不依赖、修改或追加提交到已关闭的 Flash PR #1379。

### 代码边界

- Pro 使用独立的 campaign 参数、活动配置、时间窗、分析 ID、测试 ID 和埋点属性。
- 可以复用通用 UI 组件和归因工具，但不能引用 Flash 常量、Flash 活动状态或 Flash 事件 ID。
- 一个页面在同一时刻最多渲染一个模型活动；Pro 预览只解析 Pro。

## 产品触点

### Open Design

1. 官网首页活动 Banner，点击进入 Pricing，并携带入口归因参数。
2. Pricing 活动 Banner、倒计时、日期说明、免责声明及个人/团队套餐的双模型权益。
3. 工作台付费与未付费用户弹窗，CTA 按用户状态区分。
4. 工作台顶部绿色活动角标，点击进入官网 Pricing。
5. 模型选择器中的 DeepSeek V4 Pro 与 DeepSeek V4 Flash“无限使用”权益标识。

### Vela / Cloud

1. 真实个人套餐升级入口中的 Pro 活动权益。
2. 真实团队套餐升级入口中的 Pro 活动权益。
3. 从 Open Design 进入结账时保留活动、入口和转化参数。
4. 支付成功和失败事件携带活动归因、金额、币种、套餐、用户与 Workspace 信息。

## 多语言策略

- 所有新增用户可见文案进入各端现有 i18n 体系，不在组件内硬编码中文或英文。
- Landing Page 覆盖其现有全部 locale 路由。
- Open Design Web 覆盖现有 19 种 UI 语言。
- Vela / Cloud 覆盖其当前支持的全部语言。
- 日期按 locale 本地化，模型名 `DeepSeek V4 Pro`、`DeepSeek V4 Flash`、campaign 参数和埋点 ID 不翻译。
- 英文主文案采用自然营销表达：`Put top-tier intelligence to work—without limits.`
- RTL 语言需要验证布局、倒计时和 CTA 顺序。
- 非中文页面不得回退显示中文活动文案。

## 归因与埋点

- Campaign 参数：`deepseek-v4-pro`
- Campaign ID：使用独立、稳定的 Pro ID，不复用 `deepseek_v4_flash`。
- 每个入口生成或透传 `od_entry_id`，并携带 `od_entry_source`、`od_entry_at`、`od_campaign_id` 和 `od_conversion_source`。
- 曝光、点击、进入 Pricing、开始结账、支付结果均需可按入口与 campaign 聚合。
- 支付结果必须包含付费人数计算所需用户标识，以及金额、币种、套餐、计费周期、Workspace 标识和入口来源。

## 时间与下线

- 正常访问仅在配置时间窗内展示活动内容。
- 结束时刻之后自动下线，不依赖人工发布。
- `campaign=deepseek-v4-pro` 仅用于本地或评审预览；生产埋点必须能识别预览流量，避免污染真实活动指标。

## 验收标准

- 新活动页面同时展示 Flash 与 Pro 权益，但不引用上一版 Flash 活动参数、测试 ID 或事件 ID。
- Flash 分支和旧 PR 无新增提交。
- 所有触点在活动前、活动中、活动后及强制预览四种状态下行为正确。
- 所有支持语言均有 Pro 活动文案，且测试能阻止缺失翻译。
- 入口归因可贯通到结账与支付结果。
- Open Design PR 通过 ODC 创建后保持开放；Vela PR 的 base 必须是 `feat/go-plan`。
