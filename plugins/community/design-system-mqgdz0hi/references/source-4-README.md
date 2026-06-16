# 华昇影视 UI Kit — App

基于华昇影视品牌设计系统的可运行 React 组件预览。

## 结构 · Structure

```
ui_kits/app/
├── index.html                  # 可运行入口 (React + Babel)
├── README.md                   # 本文件
└── components/
    ├── App.jsx                 # 应用壳 (导航 + 路由)
    ├── Sidebar.jsx             # 侧边导航栏 (深色底)
    ├── HeroSection.jsx         # 英雄区 (深色封面)
    ├── ServiceCard.jsx         # 服务卡片 (浅色卡片 + 标签 + 报价)
    ├── SectionHeader.jsx       # 编辑式区块头 (2px 墨线 + 红色标记)
    └── ContactForm.jsx         # 联系表单 (Input / Select / Textarea)
```

## 使用 · Usage

直接打开 `ui_kits/app/index.html` 在浏览器中预览，或在项目中引用：

```html
<link rel="stylesheet" href="colors_and_type.css" />
```

然后复制需要的组件文件到你的项目中。

## 组件说明 · Components

### App.jsx
应用壳组件，包含侧边导航栏和三个页面视图（首页、服务详情、联系我们）。State 管理用 `useState` 模拟路由。

### Sidebar.jsx
深色侧边导航，包含品牌 Logo、导航项和底部印章。导航项高亮使用 `--accent` 底色。

### HeroSection.jsx
深色封面英雄区，使用 Display L (72px Black 900) 标题，包含品牌印章水印和双按钮 CTA。

### SectionHeader.jsx
编辑式区块头 — 品牌最核心的布局组件：
- 2px 墨线竖线 (40px 高)
- 英文眉标 (13px Medium, letter-spacing 0.22em)
- 中文大标题 (36px Bold 700)
- 56px × 3px 红色标记

### ServiceCard.jsx
服务卡片，包含图标、标题、描述、标签和可选报价。Hover 时上浮 2px 并加深阴影。

### ContactForm.jsx
带状态管理的联系表单：姓名、电话、服务类型下拉、需求描述，提交后显示成功页。

## 设计依据 · Design Basis

- 来源: `context/brand-kit/brand-kit/README.md` + `SKILL.md`
- 色彩: 公司红 `#b90005` + 灰色阶 `#f0f0f0` → `#1a1a1a`
- 字体: Noto Sans SC (思源黑体)
- 资产: `assets/logos/`, `build/`
- 布局: 编辑式区块头 (2px 墨线 + 56×3px 红色标记)

## 设计笔记 · Design Notes

- 全屏左侧固定 260px 深色侧边栏 + 右侧内容区布局
- 所有间距使用 DESIGN.md 中定义的 CSS 变量
- 动效克制: hover 过渡 200–240ms，不使用弹跳动画
- 红色印章 (`assets/logos/mark-red.png`) 放置在侧边栏底部作为品牌锚点
- 组件彼此独立，可单独提取到任意项目中使用
