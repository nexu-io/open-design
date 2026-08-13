# DeepSeek V4 Pro 一周无限用实施计划

> 设计依据：`docs/plans/2026-08-13-deepseek-v4-pro-campaign-design.md`

## 1. Open Design 活动领域模型

- 新增独立的 Pro 活动配置和时间判断。
- 为活动前、活动中、活动后、评审预览编写单元测试。
- 确保 Pro 配置不导入 Flash 活动模块。

## 2. 官网首页与 Pricing

- 新增首页 Banner、Pricing Banner、倒计时和活动权益。
- 为全部 Landing locale 增加活动词条与缺失翻译契约测试。
- 保持入口参数并验证跳转到 Pricing 的 campaign 和 attribution。

## 3. Open Design 工作台

- 新增付费/未付费弹窗、顶部活动角标和模型选择器权益。
- 将所有活动文案加入 Web 的 19 种语言字典。
- 增加曝光、点击、CTA、模型选择和 Pricing 跳转测试。

## 4. Vela 真实升级入口

- 从 `feat/go-plan` 创建 `feat/go-plan-deepseek-v4-pro`。
- 在真实个人与团队套餐组件中加入独立 Pro 权益。
- 覆盖 Vela 当前支持的语言，不修改 Go Plan 本身的套餐规则。

## 5. 结账和支付闭环

- 透传 Pro campaign、entry 和 conversion 参数。
- 在个人与团队支付结果事件中携带金额、币种、套餐、用户/Workspace 及入口来源。
- 增加结账、支付成功、支付失败和缺少归因参数时的回归测试。

## 6. 验证与 Demo

- 执行 Open Design 的 focused tests、i18n contract、typecheck、guard 和相关构建。
- 执行 Vela 的 Web/API focused tests、typecheck、lint 和相关构建。
- 启动本地 Demo，检查中文、英文、葡萄牙语及一个 RTL locale。
- 检查浏览器控制台、跳转参数和活动结束后的自动下线。

## 7. ODC PR

- Open Design：通过 ODC 创建以 `feat/workspace-team` 为 base 的新 PR，不合并。
- Vela：通过 ODC 创建以 `feat/go-plan` 为 base 的新 PR，评审后合并。
- PR 描述列出产品触点、多语言范围、埋点闭环、验证结果和与 Flash 的隔离边界。

