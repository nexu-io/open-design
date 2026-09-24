---
name: android-material-3-design-system
description: 使用官方 Material 3 语义角色、排版、形状、自适应布局、组件状态和动效规则生成 Android 或响应式 Web 产品界面。
user-invocable: true
---

# Android Material 3 Design System

## Contents

**What is inside：**

- `README.md`：产品语境、包结构、完整 Preview Manifest 与复用流程。
- `DESIGN.md`：设计规则的唯一来源。
- `colors_and_type.css`：light/dark color roles、15 级 typography、spacing、shape、state、elevation 与 motion tokens。
- `preview/`：聚焦的颜色、排版、间距、形状、阴影、组件、导航和真实资产审核卡。
- `assets/`：从官方 Material 3 站点原样保存的来源识别资产。
- `PROVENANCE.md` 与 `context/`：来源说明、AndroidX token 快照、哈希和证据边界。
- `ui_kits/app/`：可运行的响应式 list-detail 邮件工作台与模块化组件。

当前没有 `build/`、`fonts/`、`source_examples/`，因为 setup 没有提供相应来源证据。若未来目录出现，生成前必须同时阅读；不得跳过真实 runtime 资产、字体或源组件实现。

## Source context

先读 `context/source-context.md`、`context/evidence-inventory.md` 和 `context/official/material-3-evidence.md`。本包的颜色值来自保存在 `context/official/androidx/` 的 AndroidX baseline token 文件；排版、shape、adaptive layout、states 和 motion 依据官方 Material 3 / Android Developers 文档。

不要把 Material 文档站点的紫色 chrome、Google Sans 或 favicon 当成任意产品的品牌。产品品牌必须来自当前任务的真实来源色、字体和资产。

## When to use

**When to use this skill:**

适用于 Material 3 prototypes、interfaces、artifacts 与 production design 的构建。

- Android Jetpack Compose Material 3 应用或功能面。
- 需要把 Material 3 语义角色映射到响应式 Web 原型时。
- 需要 compact / medium / expanded / large / extra-large 自适应结构时。
- 需要 navigation bar / rail / drawer、list-detail、supporting pane、表单、dialog 或 FAB 的系统化基线时。
- 需要 light/dark、动态色回退、可访问状态和 reduced motion 时。

不要用本 skill 复刻 Google 产品。它提供系统语法，不提供产品信息架构、品牌或内容。

## How to use

1. 阅读 `README.md` 与 `DESIGN.md`，再浏览与任务相关的 `preview/*.html`。
2. 引入 `colors_and_type.css`，组件只消费语义 token。
3. 检查 `assets/`；若存在 `build/`、`fonts/`、`source_examples/`，也必须逐项读取并保持来源边界。
4. 从 `ui_kits/app/` 复用结构与交互，不复制其中示例业务文案到不相关产品。
5. 根据窗口选择 canonical layout：compact 单列、medium rail、expanded list-detail 或 supporting pane。
6. 若有品牌来源色，生成完整 tonal palette 并同时提供 light/dark；不要只替换一个主色。
7. 为所有动作实现 enabled、hover、focus、pressed、disabled，必要时加 selected、dragged、loading 和 error。
8. 最后验证对比度、48dp 目标、键盘焦点、reduced motion、错误说明和至少 compact / medium / expanded 三档布局。

## Design system highlights

核心维度：colors、typography、spacing、radius、shadows、layout 与 interaction。

- 颜色角色成对使用；`on-*` 永远匹配对应容器。
- tonal elevation 优先于无意义阴影。
- 15 级 Roboto baseline type scale，可按产品收敛但不能随意混搭。
- 4dp spacing grid，4/8/12/16/24/full shape scale。
- compact `<600`、medium `600–839`、expanded `840–1199`、large `1200–1599`、extra-large `>=1600`。
- feed、list-detail、supporting pane 是首选 adaptive scaffold。
- standard motion 用于重复操作；expressive motion 只用于显著交互。
- 产品 UI 不展示设计器控制、断点选择器、token 面板或生成元数据。
