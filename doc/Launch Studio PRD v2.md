# Launch Studio PRD：Website Studio 扩展模块

## 一、产品能力扩展

Launch Studio 后续将从“产品发布内容生成工具”扩展为完整的产品品牌与增长内容工作台。

新增能力包括：

- AI 网站生成
- Landing Page 生成
- 产品官网生成
- 现有网站导入
- 网站文案分析与优化
- SEO 检查与优化
- 网站结构优化
- 页面转化率优化
- 网站品牌一致性检查
- 网站内容持续更新
- 网站发布与部署

更新后的产品核心能力包括：

```text
Launch Studio
├── Brand OS
├── Store Studio
├── Social Studio
├── Video Studio
├── Content Studio
├── Website Studio
└── Automation
```

产品长期定位更新为：

> 面向创业者和独立开发者的 AI 品牌、发布与增长内容工作台。

产品核心流程：

```text
导入产品
→ 建立品牌体系
→ 生成应用商店内容
→ 生成社交媒体内容
→ 生成产品视频
→ 生成或优化产品网站
→ SEO 与转化检查
→ 自动化更新和发布
```

---

# 二、Website Studio 功能定位

Website Studio 用于帮助用户创建、分析、优化和持续维护产品网站。

用户可以从以下方式开始：

- 根据产品资料生成新网站
- 根据一句话描述生成 Landing Page
- 导入现有网站进行优化
- 根据已有品牌体系生成网站
- 根据产品截图生成官网
- 导入 Figma 设计生成网站
- 从已有模板创建网站

Website Studio 不只是一个 AI 网站生成器，还应与产品的品牌、商店素材、社交媒体内容和营销活动保持一致。

例如：

```text
Brand Profile
├── 品牌颜色
├── 品牌字体
├── 品牌语气
├── 产品定位
└── 视觉风格
        ↓
Website Studio
├── 页面视觉
├── 网站文案
├── CTA
├── SEO 内容
└── 图片与视频
```

---

# 三、网站生成

## 3.1 网站类型

系统支持生成：

- SaaS 产品官网
- App 官网
- 桌面软件官网
- Figma 插件官网
- 浏览器插件官网
- AI 工具官网
- 开源项目官网
- Product Launch Landing Page
- Waitlist 页面
- 活动页面
- 功能发布页面
- Pricing 页面
- 帮助中心首页
- 个人产品作品集

## 3.2 创建方式

### 从产品项目生成

系统读取已有产品项目中的：

- 产品名称
- Logo
- 产品介绍
- 核心功能
- 产品截图
- 品牌颜色
- 品牌字体
- 用户群体
- 竞争优势
- 宣传视频
- 用户评价
- 定价信息

自动生成网站结构和内容。

### 从提示词生成

用户可以输入：

```text
帮我创建一个面向独立开发者的 SaaS 产品官网，
产品用于自动生成 App Store 截图和社交媒体宣传图。
```

系统自动生成：

- 网站结构
- 页面文案
- 视觉方向
- 页面组件
- 图片建议
- CTA
- SEO 信息

### 从现有内容生成

用户可以上传：

- 产品介绍文档
- PRD
- Pitch Deck
- App Store 文案
- 产品截图
- Figma 文件
- 参考网站截图

系统将内容转换成完整的网站页面。

---

# 四、网站页面结构

## 4.1 默认页面

系统可以生成以下页面：

```text
Website
├── Home
├── Features
├── Use Cases
├── Pricing
├── About
├── Changelog
├── Download
├── Blog
├── Contact
├── Privacy Policy
└── Terms of Service
```

## 4.2 首页默认结构

```text
Home Page
├── Header
├── Hero
├── Product Preview
├── Core Benefits
├── Feature Sections
├── How It Works
├── Use Cases
├── Social Proof
├── Pricing
├── FAQ
├── Final CTA
└── Footer
```

## 4.3 AI 页面规划

系统根据产品类型自动判断需要哪些页面。

例如：

### App 产品

```text
Home
Features
Download
App Store
Privacy
Support
```

### SaaS 产品

```text
Home
Features
Use Cases
Pricing
Blog
Login
Sign Up
```

### 开源项目

```text
Home
Documentation
GitHub
Examples
Changelog
Community
```

用户可以确认、删除、添加或重新排序页面。

---

# 五、网站编辑器

## 5.1 编辑模式

Website Studio 提供三种编辑方式：

### AI 对话编辑

用户可以直接输入：

- 将 Hero 标题改得更简洁
- 增加一个用户案例模块
- 将背景改成深色
- 强调产品可以节省时间
- 将按钮改成免费下载
- 为这个页面增加 SEO 内容

### 可视化编辑

用户可以：

- 拖动模块排序
- 修改文字
- 替换图片
- 修改颜色
- 修改字体
- 调整间距
- 修改圆角
- 设置背景
- 显示或隐藏模块

### 代码编辑

高级用户可以：

- 查看生成代码
- 修改 React 组件
- 修改 CSS
- 添加自定义组件
- 添加自定义脚本
- 设置环境变量

---

# 六、网站模板系统

## 6.1 模板分类

模板按照以下方式分类：

### 产品类型

- SaaS
- App
- Desktop App
- AI Product
- Developer Tool
- Design Tool
- Plugin
- Open Source
- Agency
- Personal Product

### 页面目标

- Product Launch
- Waitlist
- Download
- Conversion
- Feature Announcement
- Product Update
- Pricing
- App Promotion

### 视觉风格

- Minimal
- Professional
- Dark
- Editorial
- Gradient
- Glass
- Brutalist
- Notion Style
- Apple Style
- Developer Style

## 6.2 品牌适配

应用模板后，系统自动替换：

- Logo
- 品牌颜色
- 字体
- 产品截图
- 文案语气
- 按钮样式
- 圆角
- 图片风格
- 动效风格

模板不能直接覆盖用户已锁定的品牌规则。

---

# 七、现有网站导入

## 7.1 导入方式

用户输入网站 URL 后，系统抓取：

- 页面结构
- 页面标题
- 文案
- 图片
- Logo
- 字体
- 颜色
- 链接
- SEO Metadata
- Open Graph 信息
- 页面截图
- 基础性能信息

## 7.2 导入目标

用户可以选择：

- 分析网站
- 优化文案
- 优化 SEO
- 重新设计网站
- 保留结构只修改视觉
- 保留视觉只修改文案
- 复制为本地项目
- 转换为可编辑网站

## 7.3 网站导入限制

对于无法完整获取的网站，需要明确提示：

- 登录后内容无法读取
- 动态页面可能无法完整还原
- 第三方脚本可能无法复制
- 受版权保护内容不能直接用于新网站
- 导入不代表拥有原网站的版权

---

# 八、网站文案优化

## 8.1 功能说明

系统分析现有网站内容，发现表达不清、信息重复、转化弱或不符合品牌语气的问题。

## 8.2 检查内容

### 清晰度

检查：

- 用户能否快速理解产品是什么
- 是否清楚说明目标用户
- 是否说明产品解决的问题
- 是否说明使用产品后的收益
- 是否存在过多抽象表达
- 是否大量使用行业术语

### 页面结构

检查：

- Hero 是否有明确价值主张
- CTA 是否清晰
- 功能和价值是否混淆
- 页面顺序是否合理
- 是否缺少社会证明
- 是否缺少 FAQ
- 是否缺少定价信息
- 是否存在内容重复

### 品牌一致性

检查：

- 是否符合 Brand Voice
- 是否使用禁用词
- 不同页面语气是否统一
- CTA 写法是否统一
- 产品名称是否一致
- 功能名称是否一致

### 转化能力

检查：

- CTA 是否具有明确动作
- CTA 附近是否说明用户收益
- 是否存在过多不同 CTA
- 注册或下载入口是否明显
- 是否及时处理用户疑虑
- 是否缺少信任信息

## 8.3 优化方式

用户可以选择：

- 仅显示问题
- 提供修改建议
- 逐段确认修改
- 自动生成优化版本
- 对比原文和优化版本
- 一键应用全部修改

## 8.4 文案评分

系统可以按照以下维度评分：

| 维度       | 说明                       |
| ---------- | -------------------------- |
| 清晰度     | 用户是否能快速理解产品     |
| 相关性     | 内容是否符合目标用户       |
| 差异化     | 是否明确区别于竞品         |
| 品牌一致性 | 是否符合品牌语气           |
| 可读性     | 是否易于阅读和扫描         |
| 转化能力   | 是否有明确行动引导         |
| SEO 基础   | 是否覆盖页面主题和搜索意图 |

评分只用于辅助判断，不应将评分包装成绝对结果。

---

# 九、SEO 优化

## 9.1 功能定位

SEO 模块帮助创业者检查和优化产品网站的基础搜索表现。

产品不应承诺排名结果，而是帮助用户：

- 发现 SEO 问题
- 优化页面结构
- 优化搜索展示内容
- 建立关键词与页面之间的关系
- 持续生成有价值的内容

## 9.2 页面级 SEO 检查

系统检查：

- 页面 Title
- Meta Description
- H1
- H2 和 H3 层级
- 页面 URL
- Canonical
- Open Graph
- Twitter Card
- 图片 Alt
- 内部链接
- 外部链接
- 关键词使用
- 内容重复
- 页面字数
- 结构化数据
- Sitemap
- Robots.txt
- 404 页面
- 重定向
- 多语言标签

## 9.3 SEO 文案生成

支持生成：

- SEO Title
- Meta Description
- 页面 H1
- 页面目录
- 功能页文案
- Use Case 页面
- 对比页面
- FAQ
- 图片 Alt
- Open Graph 标题
- Open Graph 描述
- Blog 标题
- Blog 大纲
- Blog 正文
- 内部链接锚文本

## 9.4 关键词管理

用户可以创建关键词库：

```text
Keyword
├── 关键词
├── 搜索意图
├── 目标页面
├── 优先级
├── 内容状态
├── 使用语言
└── 备注
```

搜索意图可以分为：

- 信息型
- 导航型
- 商业调查型
- 交易型

## 9.5 关键词与页面映射

系统帮助用户避免多个页面竞争同一个关键词。

示例：

```text
app store screenshot generator
→ Home

app store screenshot templates
→ Templates

how to create app store screenshots
→ Blog Article

appscreens alternative
→ Comparison Page
```

## 9.6 SEO 内容计划

系统根据产品、用户和关键词生成内容计划：

- 产品功能文章
- 使用教程
- 用户场景
- 竞品对比
- 问题解决文章
- 产品更新
- 行业趋势
- 案例研究

内容计划包括：

- 文章标题
- 目标关键词
- 搜索意图
- 文章大纲
- 推荐发布时间
- 对应产品页面
- 推荐 CTA

## 9.7 技术 SEO 检查

后续支持：

- 页面加载性能
- Core Web Vitals
- 移动端适配
- JavaScript 渲染问题
- Sitemap 完整性
- 结构化数据验证
- 重复页面
- 失效链接
- 图片体积
- 页面索引状态

---

# 十、网站品牌一致性检查

系统将现有网站与 Brand Profile 对比。

## 检查项目

### 视觉

- Logo 使用是否正确
- 颜色是否来自品牌颜色
- 字体是否符合规范
- 圆角是否统一
- 按钮样式是否统一
- 图片风格是否一致
- 图标风格是否一致

### 文案

- 品牌语气是否一致
- CTA 是否统一
- 产品名称是否统一
- 功能名称是否统一
- 是否使用禁用词
- 是否存在不符合品牌定位的表达

### 产品信息

- 官网和应用商店描述是否一致
- 官网和社交媒体卖点是否一致
- 定价信息是否一致
- 功能信息是否一致
- 产品版本信息是否一致

系统可以生成品牌一致性报告，并允许用户逐项修复。

---

# 十一、网站预览与响应式设计

## 11.1 设备预览

支持：

- Desktop
- Laptop
- Tablet
- Mobile
- 自定义宽度

## 11.2 响应式检查

系统检查：

- 文字溢出
- 按钮宽度
- 图片裁切
- 导航折叠
- 卡片换行
- 模块顺序
- 横向滚动
- 点击区域
- 移动端字体
- 移动端间距

## 11.3 多语言响应式检查

在翻译页面后，系统自动检查：

- 标题是否过长
- 导航是否放不下
- CTA 是否超出按钮
- 文本是否与图片重叠
- 不同语言页面高度差异

---

# 十二、网站发布与部署

## 12.1 导出方式

支持导出：

- 静态 HTML
- React 项目
- Next.js 项目
- ZIP 文件
- 图片预览
- 网站文案 Markdown
- SEO Metadata JSON

## 12.2 部署平台

后续可以接入：

- Vercel
- Cloudflare Pages
- Netlify
- GitHub Pages
- 自定义服务器

## 12.3 自定义域名

支持：

- 绑定域名
- DNS 配置引导
- SSL 状态检查
- 域名连接状态
- 默认预览域名

## 12.4 发布前检查

发布前检查：

- 页面链接
- 页面标题
- SEO Metadata
- 图片缺失
- Alt 缺失
- 响应式问题
- 表单配置
- 隐私政策
- Cookie 提示
- Analytics 配置
- Favicon
- Open Graph 图片

---

# 十三、Website Automation

## 13.1 产品更新自动化

```text
读取产品新版本
→ 更新 Changelog
→ 更新功能页面
→ 生成 What’s New
→ 生成社交媒体内容
→ 更新 SEO Metadata
→ 人工审核
→ 发布
```

## 13.2 新功能页面自动化

```text
输入新功能
→ 生成产品文案
→ 生成页面结构
→ 生成宣传图片
→ 创建 Feature Page
→ 创建社交媒体 Campaign
→ 人工审核
```

## 13.3 SEO 内容自动化

```text
读取关键词计划
→ 选择待创建关键词
→ 生成文章大纲
→ 生成文章草稿
→ 添加内部链接
→ 品牌语气检查
→ 人工审核
→ 发布
```

## 13.4 网站定期检查

```text
定期扫描网站
→ 检查失效链接
→ 检查缺失 Metadata
→ 检查文案变化
→ 检查品牌一致性
→ 生成优化报告
```

## 13.5 Campaign Landing Page

```text
创建 Campaign
→ 生成宣传图片
→ 生成媒体文案
→ 生成 Landing Page
→ 生成视频
→ 设置 CTA
→ 导出或发布
```

---

# 十四、更新后的产品信息架构

```text
Product Project
├── Overview
├── Product
├── Brand
│
├── Store
│   ├── Screenshots
│   ├── Store Copy
│   ├── Preview Video
│   └── Localization
│
├── Campaigns
│   ├── Visuals
│   ├── Social Copy
│   ├── Video
│   ├── Email
│   └── Landing Page
│
├── Website
│   ├── Pages
│   ├── Website Copy
│   ├── Components
│   ├── SEO
│   ├── Analytics
│   └── Publish
│
├── Content
│   ├── Store Copy
│   ├── Social Copy
│   ├── Website Copy
│   ├── Email Copy
│   └── Content Library
│
├── Video
├── Automation
├── Assets
└── Export
```

---

# 十五、功能优先级调整

## P0：核心发布工作台

第一阶段仍然聚焦：

- 产品资料导入
- 品牌体系
- 应用商店截图
- 应用商店文案
- 社交媒体图片
- 社交媒体文案
- 产品视频
- 宣传文案
- Launch Package 导出

Website Studio 在 P0 只包含：

- 官网 Hero 文案生成
- SEO Title 生成
- Meta Description 生成
- Open Graph 图片和文案生成

## P1：网站分析与文案优化

增加：

- 输入 URL 分析网站
- 网站文案提取
- 页面结构分析
- 文案清晰度检查
- CTA 检查
- 品牌一致性检查
- SEO 基础检查
- 逐段文案优化
- 原文与优化版本对比
- 网站优化报告

## P2：网站生成

增加：

- Landing Page 生成
- 多页面网站生成
- 可视化模块编辑
- 响应式页面
- 网站模板
- 品牌体系自动应用
- HTML 和 React 导出
- Vercel、Cloudflare Pages 等部署

## P3：持续增长与运营

增加：

- SEO 内容计划
- Blog 生成
- 关键词管理
- 页面和关键词映射
- 技术 SEO 检查
- 内容日历
- 网站自动更新
- Analytics 数据分析
- 根据转化数据优化页面
- 多人审核和发布流程

---

# 十六、Website Studio 验收标准

## 网站分析

1. 用户可以输入公开网站 URL。
2. 系统可以提取主要页面内容。
3. 系统能够识别 Hero、功能、定价和 CTA。
4. 系统可以显示现有 Title 和 Meta Description。
5. 分析失败时显示明确原因。

## 文案优化

1. 用户可以查看原始文案和优化文案。
2. 每段内容可以独立修改和重新生成。
3. 用户可以保留原文。
4. 优化结果读取当前品牌语气。
5. 系统不得自动添加未经用户确认的产品功能。

## SEO

1. 系统可以检查页面基础 Metadata。
2. 系统可以发现缺失的 H1、Alt 和 Description。
3. 系统可以生成 SEO Title 和 Description。
4. 系统可以将关键词关联到具体页面。
5. 系统不能向用户承诺具体搜索排名。

## 网站生成

1. 用户可以通过产品资料生成 Landing Page。
2. 页面自动使用当前 Brand Profile。
3. 用户可以编辑文字、图片和模块顺序。
4. 页面支持桌面和移动端预览。
5. 用户可以导出可运行的网站代码。
6. 页面内容能够通过发布前检查。

---

# 十七、产品长期定位

随着 Website Studio 上线，Launch Studio 将从发布素材生成器逐步发展为：

> 一个帮助创业者创建品牌、发布产品、建设网站并持续优化营销内容的 AI 工作台。

产品长期能力闭环：

```text
Create
├── Brand
├── Store
├── Social
├── Video
└── Website

Optimize
├── Copy
├── SEO
├── Conversion
└── Brand Consistency

Automate
├── Product Updates
├── Campaigns
├── Website Updates
├── SEO Content
└── Publishing
```

更新后的一句话产品介绍：

> Launch Studio 是一款面向创业者和独立开发者的 AI 品牌与产品增长工作台，可以生成应用商店内容、社交媒体素材、产品视频和网站，并帮助用户持续优化网站文案、SEO 与品牌一致性。

中文宣传语候选：

- 从产品创意到品牌发布，再到网站增长。
- 创建品牌、发布产品、持续增长。
- 一个工作台，完成产品的全部对外内容。
- 从应用商店到官网，统一生成整套产品内容。

英文宣传语候选：

- Build your brand. Launch everywhere. Grow continuously.
- From product to brand, launch, and growth.
- One workspace for every customer-facing asset.
- Create, launch, optimize, and grow.
