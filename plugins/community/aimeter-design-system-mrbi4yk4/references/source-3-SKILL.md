---
name: aimeter-design-system
description: Use the optimized Aimeter design system for LLM gateway, usage, quota, cost, model health, and admin console artifacts.
---

# Aimeter Design System Skill

## 使用前读取

1. `DESIGN.md`
2. `brand.json`
3. `system/variables.css`
4. `system/kit.html` 或 `system/kit.dark.html`
5. `context/evidence-summary.md`

## 生成规则

- 默认做技术/运营工具，不做泛营销落地页，除非用户明确要求。
- 页面基底使用 Slate/Navy 中性色，主操作和可用状态使用 Aimeter 绿。
- 数字、Key、请求 ID、费用、Token 计数使用 mono + tabular numerics。
- 图表语义色固定: input 绿、output 成功绿、cache 青、cost 金、reason 紫、danger 红。
- 所有状态必须配文字标签；不要只靠颜色。
- 不要伪造 logo 或 hero 图像；若缺资产，用清晰文字锁定品牌或请求源文件。

## 组件优先级

1. App shell / sidebar / toolbar
2. Metric cards
3. Dense data tables
4. Filters and date ranges
5. Status badges and health indicators
6. Quota/cost/usage charts
7. Audit log and API key management forms

## 禁止项

- 大面积紫色 AI 渐变。
- 暖米色、桃色、橙棕色背景。
- 通用 emoji 功能图标。
- 圆卡片左彩条作为默认版式。
- 编造指标或品牌资产。
