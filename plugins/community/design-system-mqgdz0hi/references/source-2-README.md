# 华昇影视 Huasheng Studios Design System

> 温州华昇影视文化传播有限公司 · 直播间搭建解决方案品牌设计系统
> Version 1.0.0 · Category: Custom · Surface: web

---

## 产品概览 · Product Overview

华昇影视 (Huasheng Studios) 是一家专业直播间搭建机构，为企业客户提供直播间设计搭建、灯光调试、设备调试、画面质检、设备零售批发以及培训咨询的全流程服务。

### 核心能力 · Core Capabilities

- **直播间搭建** — 空间规划、设备清单、施工图纸、现场搭建、系统联调
- **灯光调试** — 面光、轮廓光、背景光、特效光全链路调试与场景预设
- **设备调试** — 摄像机、采集卡、声卡、推流设备联调，音画同步保证
- **画面质检** — 画质、色彩、构图、曝光全链路质检与标准制定
- **设备零售与批发** — 主流直播设备采购渠道与定制方案
- **培训与咨询** — 设备操作、灯光基础、画面调优等技术培训

### 主要界面 · Primary UI Surfaces

- **品牌官网 / 营销着陆页** — 深色英雄 + 浅灰页面 + 服务卡片网格 + 咨询表单
- **抖音视频封面** — 大标题 + 品牌印章 + 服务标签的固定版式
- **服务案例展示** — 图文卡片 + 标签 + 报价的列表/网格布局

### 品牌定位 · Brand Position

墨黑为底，一抹公司红。专业、直接、落地，用比例和留白建立信任，不堆砌装饰。标语: **抱素怀光，昭及四方。**

---

## 来源 · Source

| 来源类型 | 路径 | 说明 |
|----------|------|------|
| Brand Zip | `assets_华昇-Huasheng-Studios-Design-System.zip` | 原始品牌素材压缩包 |
| Brand Book | `build/Huasheng-Brand-Book.pdf` | 15 页品牌 VI 规范手册 |
| Brand Brief | `source_examples/brand-kit-README.md` | 品牌一页纸概述 |
| Skill Brief | `source_examples/brand-kit-SKILL.md` | 机器可读品牌指令 |
| Design System | `DESIGN.md` | 完整设计规范 (本系统) |

---

## 包内容 · Package Contents

```
ds-design-system/
├── README.md                         # 本文件
├── DESIGN.md                         # 完整设计规范 (色彩、字体、间距、布局、组件、动效、语音、反模式)
├── SKILL.md                          # 代理可用技能入口 (YAML frontmatter)
├── colors_and_type.css               # 可复用 CSS 令牌文件 (含 @font-face)
│
├── assets/                           # 品牌素材
│   ├── logos/                        # 5 个 Logo/印章文件
│   │   ├── logo-primary.png          # 主 Logo (书法 华昇 + HUASHENG STUDIOS)
│   │   ├── logo-white.png            # 反白 Logo
│   │   ├── mark-red.png              # 红色印章
│   │   ├── mark-white.png            # 白色印章
│   │   └── mark-black.png            # 黑色印章
│   ├── guideline-pages/              # 10 个品牌规范页截图
│   │   ├── colors.png                # 色彩规范
│   │   ├── cover.png                 # 封面
│   │   ├── douyin-covers.png         # 抖音封面规范
│   │   ├── logo.png                  # Logo 规范
│   │   ├── logo-clearspace.png       # Logo 留白规范
│   │   ├── logo-misuse.png           # Logo 误用示例
│   │   ├── logo-reversed.png         # 反白 Logo 规范
│   │   ├── service-covers.png        # 服务封面规范
│   │   ├── typography-1.png          # 字体规范 1
│   │   └── typography-2.png          # 字体规范 2
│   └── examples/                     # 3 个应用示例
│       ├── douyin-covers.jpg         # 抖音视频封面
│       ├── service-covers.jpg        # 服务案例封面
│       └── texture-hero.jpg          # 英雄区底纹
│
├── build/                            # 运行时资产
│   ├── Huasheng-Brand-Book.pdf       # 品牌 VI 规范手册
│   ├── logo.png                      # 主 Logo (logo-primary 副本)
│   ├── logo-white.png                # 反白 Logo
│   ├── icon.png                      # 应用图标 (mark-red 副本)
│   └── tray_icon.png                 # 托盘图标 (mark-white 副本)
│
├── fonts/                            # 品牌字体 (Noto Sans SC via Google Fonts CDN)
│
├── preview/                          # 设计系统预览卡片
│   ├── brand-assets.html             # 品牌资产展示 (Logo、印章、Guideline 页、示例图)
│   ├── colors-primary.html           # 品牌主色 + 灰色阶 + 语义色
│   ├── colors-theme-light.html       # 浅色主题应用
│   ├── colors-theme-dark.html        # 深色主题应用
│   ├── typography-specimens.html     # 字体排版样本 (Display / Heading / Body / Caption / Eyebrow)
│   ├── spacing-tokens.html           # 间距尺度 (4px base, xs → 5xl)
│   ├── spacing-radius.html           # 圆角 + 阴影
│   ├── components-buttons.html       # 按钮组件 (Primary / Secondary / Ghost / Dark)
│   └── components-inputs.html        # 输入组件 (Input / Select / Textarea / Tags)
│
├── source_examples/                  # 保存的来源证据
│   ├── brand-kit-README.md           # 品牌一页纸 (原始 README)
│   └── brand-kit-SKILL.md            # 机器可读品牌指令 (原始 SKILL)
│
├── ui_kits/app/                      # 可运行的 React UI Kit
│   ├── index.html                    # 入口 (React + Babel 标准加载)
│   ├── README.md                     # UI Kit 结构说明
│   └── components/
│       ├── App.jsx                   # 应用壳 (Sidebar + 页面路由)
│       ├── Sidebar.jsx               # 深色侧边导航
│       ├── HeroSection.jsx           # 深色英雄区
│       ├── ServiceCard.jsx           # 服务卡片
│       ├── SectionHeader.jsx         # 编辑式区块头
│       └── ContactForm.jsx           # 联系表单 (带状态管理)
│
└── context/                          # 提取的原始证据
    └── brand-kit/                    # 品牌素材 ZIP 解压内容
        └── brand-kit/                # (同上 assets/ 内容结构)
```

---

## 预览清单 · Preview Manifest

| 预览卡片 | 路径 | 检查要点 |
|----------|------|----------|
| **品牌资产** | `preview/brand-assets.html` | 验证 Logo 文件、印章标志、Guideline 页加载正确；确认路径映射表与实际文件一致；确认 build/ 资产引用了真实图片 |
| **主色 + 灰阶** | `preview/colors-primary.html` | 验证公司红 `#b90005` 和灰色阶 `#f0f0f0` → `#1a1a1a` 全部显示；确认语义 token (accent, success, warning, error) |
| **浅色主题** | `preview/colors-theme-light.html` | 验证 `--bg`, `--surface`, `--fg`, `--muted`, `--border` 在浅色底上的对比度 |
| **深色主题** | `preview/colors-theme-dark.html` | 验证 `--bg-dark`, `--surface-dark`, `--fg-inverse`, `--muted-dark` 在深色底上的对比度 |
| **字体排版** | `preview/typography-specimens.html` | 验证 Display XL (120px) → Caption (12px) 完整字体层级；确认 Noto Sans SC 字体加载并正确渲染；检查 Eyebrow 的 0.22em letter-spacing |
| **间距令牌** | `preview/spacing-tokens.html` | 验证 `--space-xs` (4px) → `--space-5xl` (128px) 的视觉比例正确 |
| **圆角与阴影** | `preview/spacing-radius.html` | 验证按钮 (4px) vs 卡片 (8px) vs 药丸标签 (9999px) 的圆角差异；确认 3 级阴影深度递增 |
| **按钮组件** | `preview/components-buttons.html` | 验证 Primary / Secondary / Ghost / Dark 四种变体；确认 hover 态和禁用态 |
| **输入组件** | `preview/components-inputs.html` | 验证 Input / Select / Textarea 的默认、focus、error、disabled 状态；确认 2px focus 红色边框 |

---

## 复用工作流 · Reuse Workflow

### 在新项目中使用本设计系统

1. **复制色彩与字体文件**
   ```bash
   cp colors_and_type.css /path/to/your-project/
   ```
   或在 HTML 中直接引用:
   ```html
   <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700;900&display=swap">
   <link rel="stylesheet" href="colors_and_type.css">
   ```

2. **参考 DESIGN.md 了解设计规则**
   - 色彩: 第 2 节 (品牌主色、灰色阶、语义分配)
   - 字体: 第 3 节 (字体层级、行距、字距)
   - 间距: 第 4 节 (4px base 间距尺度、圆角、阴影)
   - 布局: 第 5 节 (页面结构、编辑式区块头)
   - 组件: 第 6 节 (Button, Card, Input, Select, Tag, SectionHeader)
   - 动效: 第 7 节 (过渡时长、缓动函数、reduced motion)
   - 语音: 第 8 节 (文案风格、术语规范、禁用 emoji)
   - 反模式: 第 9 节 (禁止项清单)

3. **复制品牌素材**
   - Logo: `assets/logos/` → 根据背景色选择主版或反白版
   - 印章: `assets/logos/mark-red.png` — 不可改色

4. **参考 UI Kit 组件**
   - 打开 `ui_kits/app/index.html` 预览所有组件
   - 复制需要的组件文件到项目中
   - 组件使用标准 React (18.3.1 + Babel standalone)

5. **预览设计系统**
   - 打开 `preview/` 下的 HTML 文件查看色彩、字体、间距、组件的完整展示
   - 使用浏览器的 DevTools 检查 CSS 变量值

### 色彩快速参考

| Token | Hex | 用途 |
|-------|-----|------|
| `--accent` | `#b90005` | 唯一强调色 (公司红) |
| `--bg` | `#f0f0f0` | 页面背景 |
| `--surface` | `#ffffff` | 卡片/面板 |
| `--fg` | `#000000` | 正文 |
| `--muted` | `#969696` | 辅助文字 |
| `--border` | `#dcdcdc` | 边框 |
| `--bg-dark` | `#0a0a0a` | 深色封面 |
