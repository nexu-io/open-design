# Launch Studio PRD 文案能力补充说明

## 一、更新后的产品定位

Launch Studio 是一款面向创业者、独立开发者和小型团队的 AI 品牌内容生产与产品发布工作台。

用户导入产品网址、Logo、产品截图、录屏和基础介绍后，系统能够理解产品定位和核心卖点，建立统一品牌体系，并生成：

- App Store 和 Google Play 商店截图
- 应用商店名称、副标题、关键词和完整介绍文案
- Product Hunt、X、LinkedIn、Reddit 等媒体宣传图片
- 不同社交媒体平台的宣传文案
- 产品功能介绍视频和视频脚本
- 官网 Hero、功能介绍和 SEO 文案
- 产品更新说明和版本发布文案
- 邮件、社区和媒体推广内容
- 可重复执行的内容生产自动化

产品核心流程更新为：

```text
产品资料
→ 产品理解
→ 品牌体系
→ 营销活动
→ 图片、视频、文案
→ 人工审核
→ 多平台导出或发布
```

---

# 二、更新后的核心产品模块

Launch Studio 包含以下六个核心模块：

## 1. Brand OS

创建和管理公司的视觉品牌与内容品牌体系。

包括：

- Logo
- 品牌颜色
- 字体
- 圆角与间距
- 图片风格
- 视频风格
- 品牌定位
- 品牌语气
- 推荐词汇
- 禁用词汇
- 标题规则
- CTA 规则

## 2. Store Studio

生成应用商店需要的全部视觉和文字内容。

包括：

- App Store 截图
- Google Play 商店截图
- App 名称
- App 副标题
- Promotional Text
- Short Description
- Full Description
- Keywords
- What’s New
- App Preview 视频
- 本地化版本
- 商店元数据检查

## 3. Social Studio

生成社交媒体宣传图片和平台文案。

包括：

- Product Hunt
- X
- LinkedIn
- Reddit
- Instagram
- Facebook
- Threads
- YouTube
- 小红书
- 即刻
- 微信公众号
- 设计社区

## 4. Video Studio

生成产品介绍、功能宣传和版本更新视频。

包括：

- 视频脚本
- 场景文案
- 字幕
- 旁白稿
- 视频标题
- 视频简介
- 视频标签
- 多比例视频输出

## 5. Content Studio

统一生成、编辑和管理产品营销文案。

包括：

- 应用商店文案
- 社交媒体文案
- 产品发布文案
- 官网文案
- 产品更新文案
- 邮件营销文案
- SEO 内容
- 广告文案
- 媒体介绍材料

## 6. Automation

根据产品更新、发布时间和外部数据，自动生成新内容。

包括：

- 定时内容生成
- 新版本发布流程
- 新功能宣传流程
- 社交媒体内容计划
- GitHub Release 触发
- 人工审核
- 批量导出
- 后续平台发布

---

# 三、Content Studio 文案中心

## 3.1 功能定位

Content Studio 是 Launch Studio 的统一内容生产中心。

它负责根据产品资料、品牌语气、目标用户和营销活动，为不同平台生成结构、长度和表达方式不同的产品文案。

Content Studio 不是一个独立的通用 AI 聊天工具，而是与以下信息持续关联：

- Product Profile
- Brand Profile
- Campaign
- 产品截图
- 产品功能
- 版本更新
- 目标平台
- 目标用户
- 已生成的图片和视频

系统生成的文案需要与对应图片、视频和活动主题保持一致。

---

# 四、应用商店文案生成

## 4.1 功能说明

帮助用户生成 App Store、Google Play 和其他应用商店需要的完整文字内容。

用户不需要分别填写每一个字段，系统可以根据产品资料和平台要求生成完整商店文案套件。

## 4.2 支持的文案类型

### App Store

支持生成：

- App Name
- Subtitle
- Promotional Text
- Description
- Keywords
- What’s New
- App Preview 标题
- 截图标题
- 截图副标题
- In-App Purchase 展示文案
- 活动推广文案
- 本地化商店文案

### Google Play

支持生成：

- App Name
- Short Description
- Full Description
- Feature Graphic 文案
- 截图标题
- 版本更新说明
- 标签建议
- 本地化商店文案

### 其他应用商店

后续支持：

- Mac App Store
- Microsoft Store
- Chrome Web Store
- Figma Community
- Shopify App Store
- WordPress Plugin Directory

---

## 4.3 应用商店文案生成流程

```text
产品资料
→ 识别核心功能和目标用户
→ 提炼差异化卖点
→ 选择文案策略
→ 生成商店字段
→ 检查平台限制
→ 品牌一致性检查
→ 人工修改
→ 多语言生成
→ 导出
```

## 4.4 文案策略

用户可以选择不同方向：

- 功能导向
- 用户价值导向
- 效率提升导向
- 问题解决导向
- 专业可信导向
- 极简直接导向
- 故事叙述导向
- 转化导向

系统可以同时生成多个版本供用户比较。

## 4.5 商店文案功能需求

### STORE-COPY-001 自动生成完整字段

用户填写产品基础资料后，系统一次生成当前商店所需的全部文案字段。

### STORE-COPY-002 字符限制检查

每个字段显示：

- 当前字符数
- 平台字符上限
- 是否超出限制
- 建议删减内容

### STORE-COPY-003 关键词生成

系统根据以下内容生成关键词：

- 产品类型
- 产品功能
- 用户搜索意图
- 目标用户
- 竞品类别
- 使用场景

关键词需要支持：

- 删除重复词
- 排除品牌词
- 排除无关词
- 手动锁定关键词
- 按语言分别管理

### STORE-COPY-004 卖点映射

商店介绍文案需要与截图内容建立关联。

示例：

```text
商店描述中的功能一
→ 对应截图 2

商店描述中的功能二
→ 对应截图 3

隐私和安全描述
→ 对应截图 6
```

系统发现文案描述了截图中没有展示的能力时，需要给出提示。

### STORE-COPY-005 What’s New

用户输入版本更新内容后，系统可以生成：

- 简洁版本
- 正式版本
- 友好版本
- 面向用户价值的版本
- 面向技术用户的版本

### STORE-COPY-006 多语言本地化

支持：

- 自动翻译
- 本地化改写
- 保留产品专有名词
- 不同地区使用不同表达
- 多语言字符限制检查
- 按国家或地区调整 CTA

### STORE-COPY-007 平台规范检查

检查内容包括：

- 字符长度
- 重复关键词
- 过度堆砌关键词
- 不真实承诺
- 绝对化描述
- 与产品功能不一致
- 与截图内容不一致
- 未经证实的排名或奖项
- 格式错误
- 本地化字段缺失

## 4.6 验收标准

- 系统可以一次生成完整的应用商店文案套件。
- 每个字段都能独立编辑和重新生成。
- 重新生成某个字段不能覆盖其他已确认字段。
- 字符数和平台限制实时显示。
- 文案能够读取当前品牌语气。
- 商店截图标题与完整介绍保持一致。
- 用户可以导出不同语言版本。
- 被用户锁定的名称、关键词和专有名词不能被自动修改。

---

# 五、媒体宣传文案生成

## 5.1 功能说明

用户创建一个 Campaign 后，系统根据平台特点生成对应的媒体宣传图片和介绍文案。

系统不能将同一段文案直接复制到所有平台，而应根据平台的用户习惯、内容长度和表达方式进行改写。

## 5.2 支持的平台

MVP 支持：

- Product Hunt
- X
- LinkedIn
- Reddit
- Instagram
- 官网
- 邮件

后续支持：

- Facebook
- Threads
- YouTube
- TikTok
- 小红书
- 微信公众号
- 即刻
- Hacker News
- Indie Hackers
- 设计社区
- 新闻媒体投稿

---

## 5.3 Product Hunt 文案

支持生成：

- Product Name
- Tagline
- Short Description
- Full Description
- First Comment
- Maker Comment
- Gallery 图片标题
- Launch Day 帖子
- X 同步推广文案
- 用户评论回复建议
- FAQ

Product Hunt 文案可以选择：

- 创始人故事
- 产品功能
- 用户痛点
- 开发过程
- 产品差异化
- 社区交流

---

## 5.4 X 宣传文案

支持生成：

- 单条发布文案
- Thread
- 新功能介绍
- 产品更新
- 开发过程分享
- 数据里程碑
- 用户案例
- Product Hunt 引流
- 图片配文
- 视频配文
- 评论区补充内容

系统需要控制：

- 内容长度
- 首句吸引力
- CTA
- Hashtag 数量
- 链接位置
- 是否适合 Thread

---

## 5.5 LinkedIn 宣传文案

支持生成：

- 产品发布
- 创始人故事
- 公司动态
- 产品更新
- 用户案例
- 行业观点
- 招聘宣传
- 里程碑
- 团队介绍

LinkedIn 文案需要偏向：

- 专业表达
- 清晰背景
- 商业价值
- 过程总结
- 经验分享
- 可读性较强的分段

---

## 5.6 Reddit 宣传文案

支持生成：

- 社区分享帖
- 产品反馈帖
- Show and Tell
- 开发过程分享
- 问题解决案例
- 免费工具分享
- 功能更新
- 评论回复

Reddit 文案生成必须支持：

- 选择 Subreddit
- 设置社区规则
- 降低营销语气
- 减少过度宣传
- 强调真实经历
- 增加讨论问题
- 根据社区调整标题
- 标记是否需要披露产品作者身份

系统应提醒用户人工检查社区规则，避免生成明显的广告式内容。

---

## 5.7 Instagram 宣传文案

支持生成：

- 产品发布 Caption
- Carousel 配文
- Reels 配文
- Story CTA
- 功能介绍
- 幕后过程
- 品牌故事
- Hashtag 建议
- 图片替代文本

---

## 5.8 官网宣传文案

支持生成：

- Hero 标题
- Hero 副标题
- CTA
- 产品功能介绍
- 功能卡片
- 使用场景
- 用户痛点
- 产品优势
- 对比文案
- FAQ
- SEO Title
- SEO Description
- Open Graph 文案
- Pricing 页面文案
- About 页面文案

---

## 5.9 邮件宣传文案

支持生成：

- 产品上线邮件
- 新功能邮件
- 版本更新邮件
- 用户召回邮件
- 活动邮件
- Welcome Email
- 产品教育邮件
- 试用到期提醒
- Product Hunt 上线通知

每封邮件包含：

- Subject
- Preview Text
- 正文
- CTA
- 简短版本
- 完整版本

---

# 六、统一 Campaign 内容生成

## 6.1 Campaign 输入

用户创建营销活动时输入：

- 活动名称
- 活动类型
- 活动目标
- 核心信息
- 目标用户
- 产品功能
- CTA
- 发布日期
- 使用平台
- 需要的语言
- 是否需要图片
- 是否需要视频
- 是否需要文案

## 6.2 Campaign 输出

系统自动生成：

```text
Campaign Package
├── Visuals
│   ├── Product Hunt
│   ├── X
│   ├── LinkedIn
│   ├── Reddit
│   ├── Instagram
│   └── Website
│
├── Video
│   ├── 16:9
│   ├── 9:16
│   └── 1:1
│
└── Copy
    ├── Product Hunt
    ├── X
    ├── LinkedIn
    ├── Reddit
    ├── Instagram
    ├── Website
    └── Email
```

## 6.3 图片与文案关联

每一张图片需要绑定相应文案。

例如：

```text
X 图片 01
├── 主标题：Design once. Launch everywhere.
├── 对应帖子：X Post 01
├── 对应 CTA：Try Launch Studio
└── 对应 Campaign：Product Launch
```

当用户修改核心产品卖点时，系统提示：

- 是否同步更新图片标题
- 是否同步更新视频字幕
- 是否同步更新社交媒体文案
- 是否同步更新应用商店文案

---

# 七、文案编辑器

## 7.1 编辑器布局

```text
┌──────────────────┬───────────────────────────────┐
│ 文案类型与平台     │ 文案编辑区域                   │
│                  │                               │
│ App Store        │ 标题                          │
│ Google Play      │ 正文                          │
│ Product Hunt     │ CTA                           │
│ X                │ 字符数                        │
│ LinkedIn         │ 平台规范                       │
│ Reddit           │ AI 修改                       │
│ Instagram        │                               │
│ Website          │                               │
│ Email            │                               │
└──────────────────┴───────────────────────────────┘
```

## 7.2 AI 修改方式

用户可以选择：

- 缩短
- 扩写
- 更专业
- 更友好
- 更直接
- 更自然
- 减少营销感
- 强调用户价值
- 强调功能
- 增加 CTA
- 改写开头
- 生成更多版本
- 翻译并本地化

## 7.3 版本管理

每段文案保存：

- 初始生成版本
- 用户修改版本
- AI 改写版本
- 最终确认版本

用户可以：

- 对比不同版本
- 恢复旧版本
- 锁定最终内容
- 复制文案
- 导出文案

---

# 八、品牌语气系统

## 8.1 品牌语气配置

品牌语气包含：

- 表达性格
- 正式程度
- 句子长度
- 专业术语使用程度
- 情绪强度
- Emoji 使用规则
- 标点规则
- 大小写规则
- CTA 风格
- 禁用表达

## 8.2 品牌语气示例

```text
品牌性格：
专业、简洁、可信、有创造力

写作规则：
- 使用短句
- 避免夸张承诺
- 不使用复杂行业术语
- 不连续使用多个感叹号
- CTA 使用明确动作
- 强调节省时间和提高效率

推荐表达：
- Create
- Build
- Launch
- Automate
- Design faster

禁用表达：
- Revolutionary
- Best in the world
- Guaranteed
- Completely effortless
```

## 8.3 品牌一致性检查

系统检查文案是否：

- 符合品牌语气
- 使用被禁止的词语
- 与产品定位冲突
- 与图片风格冲突
- 对不同平台使用了错误表达
- 存在未经确认的产品功能
- 使用了绝对化承诺

---

# 九、文案自动化

## 9.1 新版本发布自动化

```text
读取 GitHub Release
→ 提取功能和修复内容
→ 生成 What’s New
→ 生成商店更新文案
→ 生成社交媒体宣传文案
→ 生成宣传图片
→ 生成更新视频
→ 人工审核
→ 导出
```

## 9.2 新功能宣传自动化

```text
上传新功能截图
→ 识别功能
→ 生成核心卖点
→ 生成图片标题
→ 生成产品介绍
→ 生成 X、LinkedIn、Reddit 文案
→ 生成视频脚本
→ 人工审核
```

## 9.3 定期内容自动化

```text
读取产品功能库
→ 选择未推广的功能
→ 创建 Campaign
→ 生成社交图片
→ 生成平台文案
→ 保存至待发布列表
```

## 9.4 多语言商店更新

```text
输入原始更新内容
→ 生成标准版本
→ 翻译目标语言
→ 本地化改写
→ 字符限制检查
→ 人工审核
→ 按语言导出
```

---

# 十、更新后的项目导航

```text
Product Project
├── Overview
├── Product
├── Brand
├── App Store
│   ├── Screenshots
│   ├── Store Copy
│   ├── Preview Video
│   └── Localization
│
├── Campaigns
│   ├── Visuals
│   ├── Social Copy
│   ├── Video
│   └── Email
│
├── Content
│   ├── Store Copy
│   ├── Social Copy
│   ├── Website Copy
│   ├── Email Copy
│   └── Copy Library
│
├── Video
├── Automation
├── Assets
└── Export
```

---

# 十一、更新后的导出目录

```text
Launch Package/
├── Brand/
│   ├── brand.json
│   ├── DESIGN.md
│   ├── voice.md
│   └── assets/
│
├── App Store/
│   ├── en-US/
│   │   ├── screenshots/
│   │   ├── app-name.txt
│   │   ├── subtitle.txt
│   │   ├── promotional-text.txt
│   │   ├── description.txt
│   │   ├── keywords.txt
│   │   └── whats-new.txt
│   │
│   └── zh-CN/
│
├── Google Play/
│   ├── screenshots/
│   ├── short-description.txt
│   ├── full-description.txt
│   └── whats-new.txt
│
├── Product Hunt/
│   ├── images/
│   ├── tagline.txt
│   ├── description.txt
│   └── first-comment.txt
│
├── Social/
│   ├── X/
│   ├── LinkedIn/
│   ├── Reddit/
│   └── Instagram/
│
├── Website/
│   ├── hero-copy.txt
│   ├── seo-title.txt
│   ├── seo-description.txt
│   └── open-graph/
│
├── Email/
├── Videos/
└── campaign-summary.md
```

---

# 十二、更新后的 MVP 功能优先级

## P0

- 产品资料导入
- 产品信息分析
- 品牌视觉体系
- 品牌语气体系
- App Store 截图生成
- App Store 介绍文案生成
- Google Play 基础文案生成
- Product Hunt 宣传图和文案
- X 宣传图和文案
- LinkedIn 宣传图和文案
- Reddit 宣传图和文案
- 产品介绍视频
- 视频脚本和字幕
- 官网 Hero 文案
- 图片、视频、文案统一 Campaign
- 多语言基础翻译
- 字符限制检查
- 文案局部重新生成
- 完整 Launch Package 导出

## P1

- 完整应用商店本地化
- SEO 关键词建议
- 邮件营销文案
- Instagram 内容
- 文案版本管理
- 品牌一致性评分
- GitHub Release 自动生成更新文案
- 定时内容生产
- 文案与图片智能关联
- 平台内容预览

## P2

- App Store Connect 上传
- Google Play Console 上传
- 社交媒体自动发布
- 内容日历
- 团队审核
- 媒体投稿文案
- PR 新闻稿
- 博客和长内容
- 内容效果数据分析
- 根据传播数据优化文案

---

# 十三、更新后的 MVP 验收标准

1. 用户能够导入产品资料并建立产品档案。
2. 系统可以生成统一的视觉和文字品牌规范。
3. 系统可以生成完整 App Store 文案字段。
4. 系统可以生成 Google Play 简短介绍和完整介绍。
5. 系统可以实时检查字段字符数量。
6. 每个文案字段都可以独立重新生成。
7. 用户可以生成至少四个平台的媒体宣传文案。
8. 不同平台的文案不能只是完全相同的内容复制。
9. 文案可以选择专业、友好、简洁等不同方向。
10. 商店截图标题与商店介绍内容保持一致。
11. 社交图片与对应社交文案能够建立关联。
12. 产品视频可以自动生成脚本、字幕和介绍文案。
13. 用户可以锁定产品名称、功能名和品牌专有词。
14. 多语言生成时不得修改产品专有名称。
15. 导出包需要同时包含图片、视频和文案文件。
16. 用户修改的最终文案不会被自动化流程覆盖。

---

# 十四、更新后的产品介绍

> Launch Studio 是一款面向创业者和独立开发者的 AI 品牌发布工作台。用户只需导入产品网址、Logo、截图和产品介绍，即可生成 App Store 与 Google Play 截图、应用商店介绍文案、社交媒体宣传图片、各平台推广文案、产品视频和完整品牌体系。

## 更新后的核心宣传语

> One product. Every launch asset.

中文版本：

> 一次理解产品，生成整套发布内容。

功能说明版本：

> 从应用商店截图、商店介绍，到社交媒体图片、宣传文案和产品视频，一个工作台全部完成。
