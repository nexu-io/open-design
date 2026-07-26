# Material Design 3 Brand System

这是一个可移植的 Open Design / Agent Skill 插件包。它把 Material Design 3 的设计规范、七角色主题、组件覆盖矩阵、可运行 Material Web 目录和有明确参考意义的视觉样本放在同一个目录中。

## 入口

- Agent workflow：`SKILL.md`
- 设计规范：`DESIGN.md`
- 品牌与交付检查：`BRAND.md`
- 机器可读摘要：`brand.json`
- 组件目录：`assets/Material-Design-3/ui_kits/material-web/index.html`
- 组件覆盖证据：`assets/Material-Design-3/COMPONENTS.md`

## 组件覆盖

组件目录固定使用 `@material/web@2.4.1`，覆盖根 `all.ts` 导出的 43 个公开自定义元素 / 20 个家族。Labs 的 8 个家族单独标注，不伪装成稳定 API。

## 视觉样本

`imagery/` 只收录 Material Web 源码仓库中的组件 hero、状态和主题图片。确切上游路径、commit 与许可见 `references/material-web/SOURCE.md` 和 `LICENSE`。网页背景图、营销封面、OG 图片、头像、Google Sans 字体文件和无法确认再分发权的资产均未装入插件。

## 验证

在 Open Design 仓库根目录运行：

```bash
od plugin validate ./plugins/community/material-design-3-brand-system-ms19d6py
pnpm guard
pnpm --filter @open-design/plugin-runtime typecheck
```
