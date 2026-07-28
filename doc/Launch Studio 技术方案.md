# Launch Studio 技术方案

> 面向创业者和独立开发者的 AI 品牌、发布与增长内容工作台

---

## 1. 文档信息

| 项目     | 内容                                               |
| -------- | -------------------------------------------------- |
| 产品名称 | Launch Studio（暂定）                              |
| 文档类型 | 技术架构与研发实施方案                             |
| 文档版本 | V1.0                                               |
| 产品形态 | macOS / Windows 桌面应用                           |
| 技术基础 | 基于 Open Design Fork 开发                         |
| 核心方向 | 本地优先、结构化生成、确定性渲染、可扩展自动化     |
| 目标用户 | 独立开发者、创业者、小型产品团队、设计师、运营人员 |

---

# 2. 技术目标

Launch Studio 需要建立一套统一的产品内容生产架构，支持：

- 品牌设计体系生成与管理
- App Store 和 Google Play 截图生成
- 应用商店介绍文案生成
- 社交媒体宣传图生成
- 社交媒体文案生成
- 产品介绍视频生成
- 网站文案与 SEO 优化
- Landing Page 和产品网站生成
- 产品内容自动化
- 多平台批量导出
- 后期云端同步、团队协作与自动发布

技术架构需要满足以下要求：

1. AI 模型可以替换，不能绑定单一供应商。
2. 图片、视频和网站内容必须可编辑。
3. 最终输出不能完全依赖不可控的 AI 图片生成。
4. 用户数据和未发布产品截图默认保存在本地。
5. 长时间运行的视频、网站分析和批量导出任务不能阻塞界面。
6. 不同业务模块共享统一的产品资料和品牌体系。
7. 自动化系统可以扩展新的触发器、节点和发布目标。
8. 后期可以从单机应用逐步升级到云端团队产品。

---

# 3. 核心技术原则

## 3.1 本地优先

用户的产品截图、录屏、品牌文件、网站源码和生成结果默认保存在本地。

云端仅在以下情况下使用：

- 调用在线 AI 模型
- 使用云端图片或视频生成服务
- 用户主动启用云同步
- 用户主动启用云端渲染
- 团队协作
- 第三方平台发布

本地优先不等于完全离线。产品需要同时支持：

- 本地项目
- 用户自备 API Key
- 本地 CLI Agent
- 本地模型
- 官方托管 AI 服务
- 云端渲染服务

## 3.2 AI 生成结构，不直接控制最终结果

AI 主要负责：

- 理解产品
- 提炼卖点
- 规划内容结构
- 生成文案
- 选择模板
- 推荐视觉方向
- 生成视频脚本
- 生成网站页面结构
- 生成结构化修改指令

确定性引擎负责：

- 文字排版
- 图片定位
- 图层管理
- 尺寸适配
- 多语言布局
- 图片导出
- 视频逐帧渲染
- 网站代码生成
- SEO 规则检查
- 文件打包

核心流程：

```text
用户输入
→ AI 分析
→ 结构化数据
→ Schema 校验
→ 规则检查
→ 确定性渲染
→ 人工审核
→ 导出或发布
```

## 3.3 业务文档是唯一数据源

图片、视频、网站和文案不能只保存为最终文件。

必须同时保存其可编辑的源文档：

```text
图片：
DesignDocument JSON → PNG / JPEG / WebP

视频：
VideoProject JSON → HTML Composition → MP4

网站：
WebsiteDocument JSON → React / HTML → Website

文案：
CopyDocument JSON → TXT / Markdown / CSV
```

最终文件可以重新渲染，但业务文档必须长期保留。

## 3.4 模块化单体优先

第一阶段不建议拆分大量微服务。

建议采用：

> Electron 桌面端 + 本地 Node Daemon + 独立渲染进程 + SQLite

这样可以：

- 降低部署复杂度
- 复用 Open Design
- 支持离线和本地文件
- 简化桌面打包
- 快速建立完整业务闭环

后期再将以下重任务迁移到云端：

- 高清视频渲染
- 大批量图片生成
- 网站部署
- 团队同步
- 自动发布
- 定期 SEO 扫描

---

# 4. Open Design 复用策略

## 4.1 当前技术基础

Open Design 当前采用：

- Next.js App Router、React 和 TypeScript 作为前端
- Node.js、Express、SSE 和 `better-sqlite3` 作为本地 Daemon
- Electron 作为桌面外壳
- 独立的 Web、Daemon、Desktop、Packaged 应用
- 文件系统与 SQLite 混合存储
- 沙盒 iframe 预览
- HTML、PDF、PPTX、ZIP、Markdown 和 MP4 导出
- 本地 CLI Agent 和多模型运行时。

其仓库已经将主要职责划分为：

```text
apps/web
apps/daemon
apps/desktop
apps/packaged
packages/contracts
packages/sidecar
packages/sidecar-proto
packages/platform
skills
design-templates
design-systems
```

其中 Daemon 负责 API、Agent、Skills、Design Systems、Artifacts 和静态文件，Electron 负责桌面外壳和 Sidecar 生命周期。

## 4.2 可以直接复用的能力

### 桌面应用基础

保留：

- Electron 主进程
- 桌面窗口管理
- Sidecar 启停
- 本地 Web 服务发现
- 安装包构建
- 自动更新框架
- macOS 和 Windows 打包流程

### Web 和 Daemon 分离架构

保留：

```text
Electron
    ↓
Web UI
    ↓ HTTP / SSE
Local Daemon
    ↓
Agent / Files / Render / Export
```

### Agent 运行时

保留：

- Claude Code
- Codex
- Gemini CLI
- OpenCode
- 用户自备模型
- OpenAI Compatible API
- Agent Adapter
- Skills
- Design Systems

### 设计系统机制

保留并扩展：

- `DESIGN.md`
- Design System Registry
- 功能 Skill
- 渲染模板
- 品牌上下文注入
- 项目级设计规则

### 预览与导出

保留：

- 沙盒 iframe
- HTML 预览
- 文件产物
- ZIP 导出
- MP4 导出
- 静态资源服务

## 4.3 需要重构的部分

Open Design 更偏向通用 AI 设计工作台，而 Launch Studio 需要建立垂直业务模型。

需要重构：

- 首页和项目创建流程
- 通用 Chat 项目模型
- Artifact 数据结构
- 左侧项目导航
- 品牌体系管理
- Campaign 管理
- 应用商店内容
- 社交媒体内容
- 产品视频
- 网站分析和网站生成
- SEO 系统
- 自动化业务节点
- 导出中心

## 4.4 不建议直接沿用的部分

不建议将以下内容作为 Launch Studio 的核心业务数据：

- 对话消息
- 临时生成的 HTML
- Agent 工作目录
- 单个 Artifact 文本
- 通用 Prompt 历史

它们可以作为执行记录保留，但不能替代正式的：

- Product Profile
- Brand Profile
- Design Document
- Copy Document
- Video Project
- Website Document
- Workflow Definition

---

# 5. 总体系统架构

```text
┌──────────────────────────────────────────────────────────┐
│                   Launch Studio Desktop                  │
│                                                          │
│  ┌──────────────── Electron Main Process ─────────────┐  │
│  │ Window / Update / Protocol / Permission / Sidecar  │  │
│  └─────────────────────────┬──────────────────────────┘  │
│                            │                              │
│  ┌──────────────── Web Renderer ──────────────────────┐  │
│  │ React / Next.js                                   │  │
│  │                                                   │  │
│  │ Project UI       Brand OS       Store Studio      │  │
│  │ Social Studio    Content        Video Studio      │  │
│  │ Website Studio   Automation     Export Center     │  │
│  └─────────────────────────┬──────────────────────────┘  │
└────────────────────────────┼─────────────────────────────┘
                             │ HTTP / SSE
                             ▼
┌──────────────────────────────────────────────────────────┐
│                       Local Daemon                       │
│                                                          │
│ Project Service        Brand Service      Asset Service │
│ AI Orchestrator        Template Service   Copy Service  │
│ Design Service         Video Service      Website       │
│ SEO Engine             Workflow Engine    Export        │
│ Job Queue              Provider Gateway   Audit Log     │
└───────────────┬────────────────┬─────────────────────────┘
                │                │
                ▼                ▼
┌──────────────────────┐  ┌───────────────────────────────┐
│ SQLite + File System │  │        Worker Processes       │
│                      │  │                               │
│ Metadata             │  │ Image Renderer                │
│ Documents            │  │ Video Renderer                │
│ Assets               │  │ Website Crawler               │
│ Cache                │  │ Website Builder               │
│ History              │  │ SEO Auditor                   │
└──────────────────────┘  │ Export Packager               │
                          └───────────────────────────────┘
                                         │
                                         ▼
                          ┌───────────────────────────────┐
                          │ Optional Cloud Services       │
                          │ AI / Sync / Render / Publish  │
                          └───────────────────────────────┘
```

---

# 6. 进程架构

## 6.1 Electron 主进程

职责：

- 启动和关闭本地 Daemon
- 创建桌面窗口
- 注册自定义协议
- 文件选择
- 文件保存
- 系统通知
- 自动更新
- 崩溃恢复
- 系统权限
- 打开外部链接
- OS Keychain 访问
- 安装包和版本管理

Electron 主进程不负责：

- 业务状态管理
- AI Prompt 拼装
- 图片排版
- 视频渲染
- 网站抓取
- 数据库业务操作

## 6.2 Web Renderer

职责：

- 页面展示
- 用户交互
- 编辑器
- 状态预览
- 任务进度
- SSE 事件消费
- 局部 UI 状态
- 快捷键和拖拽

Web Renderer 不能直接：

- 访问本地数据库
- 执行任意命令
- 读取任意文件
- 调用 FFmpeg
- 启动浏览器进程
- 调用系统 Shell

## 6.3 Local Daemon

Daemon 是本地业务服务核心。

职责包括：

- API
- 数据库
- 文件管理
- AI 编排
- 模板解析
- 内容生成
- 自动化运行
- 任务队列
- Worker 管理
- 导出任务
- 项目备份
- 模型供应商管理

## 6.4 Worker 进程

以下操作必须运行在独立 Worker 或子进程：

- 高清图片导出
- 视频逐帧渲染
- FFmpeg 编码
- 网站抓取
- Lighthouse 扫描
- 网站项目构建
- 大型 ZIP 打包
- 多语言批量生成

Worker 崩溃不能导致主应用退出。

---

# 7. 推荐仓库结构

基于 Open Design 现有 Monorepo 继续扩展：

```text
launch-studio/
├── apps/
│   ├── web/
│   ├── daemon/
│   ├── desktop/
│   ├── packaged/
│   └── landing-page/
│
├── packages/
│   ├── contracts/
│   ├── domain/
│   ├── database/
│   ├── ai-core/
│   ├── provider-sdk/
│   ├── brand-engine/
│   ├── template-sdk/
│   ├── design-engine/
│   ├── copy-engine/
│   ├── video-engine/
│   ├── website-engine/
│   ├── seo-engine/
│   ├── automation-engine/
│   ├── render-core/
│   ├── export-core/
│   ├── security/
│   ├── platform/
│   └── sidecar-proto/
│
├── workers/
│   ├── image-renderer/
│   ├── video-renderer/
│   ├── website-crawler/
│   ├── website-builder/
│   ├── seo-auditor/
│   └── export-packager/
│
├── design-systems/
├── design-templates/
│   ├── store/
│   ├── social/
│   ├── website/
│   └── video/
│
├── skills/
│   ├── product-analysis/
│   ├── brand-generation/
│   ├── store-copy/
│   ├── social-copy/
│   ├── website-copy/
│   ├── seo-optimization/
│   └── video-script/
│
├── migrations/
├── e2e/
└── tools/
```

---

# 8. 核心业务模块

## 8.1 Project Service

负责：

- 项目创建
- 项目复制
- 项目归档
- 项目导入导出
- 最近项目
- 项目版本
- 项目设置

一个 Project 对应一个主要产品或品牌。

## 8.2 Product Service

维护结构化产品档案：

```text
Product Profile
├── 基础信息
├── 产品定位
├── 目标用户
├── 用户痛点
├── 核心功能
├── 产品卖点
├── 产品平台
├── 定价
├── 竞争优势
├── 产品版本
└── 专有术语
```

所有后续内容生成必须优先读取 Product Profile。

## 8.3 Brand Service

负责：

- Brand Profile
- 颜色系统
- 字体系统
- Logo
- 图标和插画风格
- 图片风格
- 视频风格
- Brand Voice
- 设计 Token
- 字段锁定
- 版本管理

## 8.4 Store Service

负责：

- App Store 截图项目
- Google Play 截图项目
- 商店元数据
- 多语言
- 平台规则
- 字符限制
- 尺寸适配
- 商店导出包

## 8.5 Campaign Service

Campaign 统一管理：

- 活动目标
- 核心卖点
- 目标用户
- CTA
- 平台
- 图片
- 文案
- 视频
- Landing Page
- 发布时间

## 8.6 Content Service

负责所有文字内容：

- Store Copy
- Social Copy
- Website Copy
- SEO Copy
- Email Copy
- Video Script
- Caption
- Alt Text

## 8.7 Video Service

负责：

- 视频项目
- 场景
- 旁白
- 字幕
- 音乐
- 动画
- 预览
- 渲染
- 多比例导出

## 8.8 Website Service

负责：

- 网站导入
- 页面结构
- 页面内容
- 组件
- 响应式预览
- 网站生成
- 网站代码导出
- 网站发布

## 8.9 SEO Service

负责：

- 页面抓取
- Metadata 检查
- Heading 检查
- 链接检查
- 图片 Alt
- Sitemap
- Robots
- 结构化数据
- Lighthouse
- 关键词管理
- 页面关键词映射
- 优化建议

## 8.10 Automation Service

负责：

- Workflow Definition
- Trigger
- Node
- Edge
- Run
- Step
- Retry
- Human Review
- Schedule
- Execution Log

---

# 9. 数据存储方案

## 9.1 存储方式

使用：

- SQLite：结构化数据
- 文件系统：图片、视频、字体和生成文件
- JSON：设计、视频、网站和工作流源文档
- 缓存目录：缩略图、中间帧和构建结果

SQLite 建议启用 WAL 模式，以提升桌面端多个读取任务和后台写入任务并行时的表现。SQLite 官方文档将 WAL 描述为能提供更多并发并通常优于默认回滚日志的模式。

## 9.2 本地目录结构

```text
.launch-studio/
├── app.sqlite
├── settings.json
├── secrets/
├── cache/
├── logs/
├── templates/
└── projects/
    └── {projectId}/
        ├── project.json
        ├── brand/
        │   ├── brand.json
        │   ├── DESIGN.md
        │   └── assets/
        ├── product/
        ├── assets/
        │   ├── original/
        │   ├── processed/
        │   └── thumbnails/
        ├── store/
        ├── campaigns/
        ├── copy/
        ├── videos/
        ├── website/
        ├── automation/
        ├── exports/
        └── history/
```

## 9.3 核心数据库表

```text
projects
product_profiles
brand_profiles
brand_versions
assets
asset_references

campaigns
campaign_channels

design_documents
design_pages
design_versions

copy_documents
copy_fields
copy_versions
localizations

video_projects
video_scenes
video_renders

website_projects
website_pages
website_blocks
website_builds

seo_audits
seo_issues
keywords
keyword_page_mappings

workflows
workflow_versions
workflow_runs
workflow_steps

jobs
job_events
exports
audit_logs
settings
provider_configs
prompt_versions
```

## 9.4 版本与历史

以下数据必须支持版本管理：

- Brand Profile
- Design Document
- Copy Document
- Video Project
- Website Document
- Workflow

版本管理采用：

```text
当前版本
+ 不可变版本快照
+ ChangeSet
+ 操作来源
```

操作来源包括：

- 用户修改
- AI 生成
- 模板应用
- 自动化
- 导入
- 系统迁移

---

# 10. 核心文档格式

## 10.1 Brand Profile

```json
{
  "id": "brand_001",
  "version": 3,
  "identity": {
    "name": "Launch Studio",
    "tagline": "One product. Every launch asset."
  },
  "colors": {
    "primary": "#6D5DFB",
    "background": "#0D0D12",
    "text": "#FFFFFF"
  },
  "typography": {
    "heading": {
      "family": "Inter",
      "weight": 700
    },
    "body": {
      "family": "Inter",
      "weight": 400
    }
  },
  "voice": {
    "traits": ["professional", "clear", "creative"],
    "forbiddenWords": ["revolutionary", "guaranteed"]
  },
  "locks": ["identity.name", "colors.primary"]
}
```

## 10.2 Design Document

```json
{
  "schemaVersion": 1,
  "id": "design_001",
  "type": "store-screenshot",
  "width": 1290,
  "height": 2796,
  "brandId": "brand_001",
  "templateId": "store-minimal-01",
  "nodes": [
    {
      "id": "headline",
      "type": "text",
      "text": "Create launch assets faster",
      "x": 100,
      "y": 120,
      "width": 1090,
      "style": {
        "fontSize": 84,
        "fontWeight": 700
      }
    }
  ]
}
```

## 10.3 Copy Document

```json
{
  "id": "copy_001",
  "type": "app-store",
  "platform": "ios",
  "locale": "en-US",
  "fields": {
    "name": {
      "value": "Launch Studio",
      "locked": true
    },
    "subtitle": {
      "value": "Create every launch asset",
      "locked": false
    },
    "description": {
      "value": "...",
      "locked": false
    }
  }
}
```

## 10.4 Video Project

```json
{
  "id": "video_001",
  "ratio": "16:9",
  "fps": 30,
  "duration": 18,
  "scenes": [
    {
      "id": "scene_01",
      "type": "title",
      "duration": 2.5,
      "headline": "Launch everywhere",
      "animation": "fade-scale"
    }
  ]
}
```

## 10.5 Website Document

```json
{
  "id": "website_001",
  "framework": "nextjs",
  "theme": "brand_001",
  "pages": [
    {
      "path": "/",
      "title": "Home",
      "blocks": [
        {
          "id": "hero_001",
          "type": "hero.product",
          "props": {
            "headline": "From product to launch",
            "cta": "Start creating"
          }
        }
      ]
    }
  ]
}
```

---

# 11. AI 系统架构

## 11.1 Provider Adapter

建立统一模型接口：

```ts
interface AIProvider {
  generateText(request: TextRequest): Promise<TextResult>;
  generateStructured<T>(
    request: StructuredRequest<T>,
  ): Promise<StructuredResult<T>>;
  generateImage?(request: ImageRequest): Promise<ImageResult>;
  embed?(request: EmbeddingRequest): Promise<EmbeddingResult>;
}
```

支持：

- OpenAI
- Anthropic
- Google
- OpenAI Compatible API
- Ollama
- 本地 CLI Agent
- 后续官方托管模型

## 11.2 AI Orchestrator

AI Orchestrator 包含：

```text
Task Router
Context Builder
Prompt Registry
Provider Selector
Schema Validator
Policy Guard
Tool Executor
ChangeSet Builder
Result Evaluator
Retry Controller
```

## 11.3 Context Builder

每次生成不应把整个项目全部发送给模型。

根据任务选择上下文：

```text
生成 App Store 文案：
Product Profile
+ Brand Voice
+ Store Platform Rules
+ Selected Screenshots
+ Existing Copy
+ Locked Terms

生成社交图片：
Product Profile
+ Brand Visual
+ Campaign Brief
+ Platform Size
+ Selected Assets

优化网站 SEO：
Website Page
+ Product Profile
+ Target Keyword
+ Current Metadata
+ SEO Rules
```

## 11.4 结构化输出

所有影响项目数据的 AI 请求都必须使用 Schema 校验。

推荐使用：

- TypeScript
- Zod
- JSON Schema
- Discriminated Union

不允许直接将未经校验的模型 JSON 写入数据库。

## 11.5 ChangeSet 机制

AI 不直接覆盖项目，而是返回修改集合：

```json
{
  "operations": [
    {
      "op": "replace",
      "path": "/fields/subtitle/value",
      "value": "Create every launch asset"
    }
  ],
  "reason": "Shortened to fit the platform limit"
}
```

流程：

```text
AI 生成 ChangeSet
→ Schema 校验
→ 锁定字段检查
→ 业务规则检查
→ 生成预览
→ 用户确认
→ 应用修改
```

## 11.6 Prompt 版本管理

每个 Prompt 保存：

- Prompt ID
- 版本
- 适用任务
- 输入 Schema
- 输出 Schema
- 模型配置
- 创建时间
- 测试结果

这样后期可以追踪生成质量变化。

---

# 12. 图片与商店截图技术方案

## 12.1 编辑器选型

推荐 Fabric.js 作为第一阶段画布引擎。

Fabric.js 提供：

- Canvas 对象模型
- 文字和图形对象
- 选择、拖拽、缩放和旋转
- 图层顺序
- 序列化与反序列化
- JSON、SVG 和图片导出
- 自定义控制点。

## 12.2 架构分层

```text
Template Schema
      ↓
Design Document
      ↓
Fabric Adapter
      ↓
Interactive Canvas
      ↓
Render Document
      ↓
PNG / JPEG / WebP
```

业务数据不能直接使用 Fabric 原始 JSON。

应增加适配层：

```text
Launch Design Schema
↔ Fabric Object Schema
```

这样后期可以替换编辑器或增加服务端渲染器。

## 12.3 文本排版引擎

需要实现：

- 文本自动换行
- 最小字号
- 最大行数
- 文字溢出检测
- 文本区域自适应
- CJK 排版
- RTL 排版
- 不同语言自动布局
- 字体缺失回退
- 字体加载状态
- 字体授权信息

## 12.4 多尺寸适配

模板定义响应式约束：

```json
{
  "headline": {
    "anchor": "top-center",
    "maxWidthRatio": 0.84,
    "fontScale": {
      "min": 0.72,
      "max": 1
    }
  },
  "device": {
    "anchor": "bottom-center",
    "heightRatio": 0.62
  }
}
```

适配流程：

```text
读取目标尺寸
→ 计算布局变量
→ 应用约束
→ 检查文字溢出
→ 检查元素边界
→ 生成预览
→ 导出
```

## 12.5 商店规则配置

商店规范不写死在 UI 中，而是保存为版本化配置：

```text
platform-specs/
├── apple-app-store.json
├── google-play.json
├── mac-app-store.json
└── microsoft-store.json
```

每项规则包含：

- 字段名称
- 字符限制
- 图片尺寸
- 文件格式
- 截图数量
- 视频长度
- 支持语言
- 更新时间
- 规则来源

---

# 13. 文案生成技术方案

## 13.1 文案字段化

不同平台使用不同 Schema：

```text
App Store Copy
├── Name
├── Subtitle
├── Promotional Text
├── Description
├── Keywords
└── What’s New

Product Hunt Copy
├── Name
├── Tagline
├── Description
├── First Comment
└── FAQ

X Copy
├── Post
├── Thread
├── CTA
└── Alt Text
```

## 13.2 字符限制

字符限制使用确定性程序计算，不让模型自己判断。

生成流程：

```text
生成初稿
→ 字符计算
→ 超限检测
→ 自动压缩
→ 再次校验
→ 人工审核
```

## 13.3 术语锁定

维护 Term Dictionary：

```text
产品名称
功能名称
公司名称
专有缩写
不可翻译词
推荐翻译
禁用词
```

多语言生成时必须先应用术语表。

## 13.4 文案与视觉关联

图片节点可以引用 Copy Field：

```json
{
  "type": "text",
  "binding": {
    "documentId": "copy_001",
    "field": "screenshot.headline.1"
  }
}
```

修改文案时，可以检测哪些图片、视频或网站正在使用该内容。

---

# 14. 视频生成技术方案

## 14.1 视频引擎

推荐复用 Open Design 已经支持的 HyperFrames。

HyperFrames 使用 HTML、CSS、媒体和可寻址动画生成确定性 MP4，并可通过 CLI 或作为托管渲染流程的核心使用。

## 14.2 视频生成链路

```text
Video Project
→ Scene Compiler
→ HTML / CSS / GSAP Composition
→ Chromium Preview
→ Frame Renderer
→ FFmpeg
→ MP4
```

## 14.3 场景组件

建立场景组件库：

```text
scene.title
scene.product-screen
scene.device-mockup
scene.feature-list
scene.comparison
scene.testimonial
scene.metric
scene.logo
scene.cta
```

每个组件定义：

- Props Schema
- 默认时长
- 支持比例
- 动画参数
- 字体规则
- 品牌映射
- 预览方式

## 14.4 渲染任务

视频任务状态：

```text
queued
→ preparing
→ rendering_frames
→ encoding
→ packaging
→ completed
```

失败状态：

```text
failed
cancelled
interrupted
```

中间结果需要缓存：

- 场景 HTML
- 静态资源
- 音频
- 已渲染帧
- 最终 MP4

## 14.5 FFmpeg 合规

桌面应用分发 FFmpeg 时，需要固定构建参数并维护第三方许可证清单。FFmpeg 官方指出，启用 GPL 或 non-free 组件会改变适用的许可条件，并提供了 LGPL 合规建议。

建议：

- 不启用 `--enable-nonfree`
- 审核是否需要 GPL 编码器
- 记录完整构建参数
- 提供 Third-Party Notices
- 提供对应源码或源码链接
- 不下载来源不明的 FFmpeg 二进制文件

---

# 15. Website Studio 技术方案

## 15.1 核心策略

第一阶段不让 AI 任意生成整个代码仓库。

优先使用：

```text
AI 页面规划
→ Website Document
→ Component Registry
→ Code Generator
→ Preview
→ Build
```

AI 输出的是：

- 页面
- 区块类型
- 区块顺序
- 组件 Props
- 文案
- 素材引用
- SEO Metadata

不是完全自由的 React 源码。

## 15.2 组件注册系统

```ts
interface WebsiteBlockDefinition {
  type: string;
  version: number;
  propsSchema: JSONSchema;
  defaultProps: Record<string, unknown>;
  render: React.ComponentType;
  codeGenerator: CodeGenerator;
  seoHints?: SEOHint[];
}
```

组件类型示例：

```text
header.standard
hero.product
hero.waitlist
feature.grid
feature.alternating
product.demo
social-proof.logo-wall
testimonial.cards
pricing.tiers
faq.accordion
cta.centered
footer.standard
```

## 15.3 网站预览

预览使用：

- 沙盒 iframe
- 独立 Origin
- 禁用 Node.js
- CSP
- 网络请求限制
- 控制台日志采集
- 响应式宽度切换

## 15.4 网站代码生成

支持两种输出：

### 静态 HTML

适合：

- 单页 Landing Page
- 活动页面
- 下载页面
- Waitlist

### Next.js 项目

适合：

- 多页面产品官网
- Blog
- Changelog
- SEO 页面
- 后续扩展

Next.js 支持通过 `output: "export"` 生成 HTML、CSS 和 JavaScript 静态文件，可部署到任何能够提供静态文件的服务器。动态服务器能力则需要单独部署运行时。

## 15.5 代码模式

P2 阶段增加高级代码模式：

- Monaco Editor
- 文件树
- TypeScript 检查
- ESLint
- 格式化
- 构建日志
- 依赖白名单
- Git 导出

用户代码必须在隔离的构建进程中运行。

---

# 16. 现有网站分析技术方案

## 16.1 网站抓取

使用 Playwright 运行独立浏览器上下文。

Playwright 支持 Chromium、Firefox 和 WebKit，并能获取页面、网络、控制台、截图及追踪信息，适合网站分析和自动化检查。

抓取内容：

- HTML
- DOM 结构
- 页面标题
- Meta
- Heading
- 链接
- 图片
- Alt
- CSS 字体
- CSS 颜色
- Logo
- Open Graph
- Twitter Card
- JSON-LD
- 页面截图
- 网络请求
- 状态码

## 16.2 抓取限制

默认限制：

- 最大页面数量
- 最大抓取深度
- 最大资源体积
- 单页超时
- 同域名限制
- 禁止访问内网地址
- 禁止下载可执行文件
- 禁止自动提交表单
- 禁止执行下载操作

## 16.3 页面区块识别

采用两层识别：

### 确定性分析

根据：

- 标签
- ARIA
- CSS
- 文本位置
- Heading
- 按钮
- 链接
- 页面区域

识别：

- Header
- Hero
- Feature
- Pricing
- FAQ
- CTA
- Footer

### AI 语义分析

AI 判断：

- 页面目的
- 核心价值主张
- 目标用户
- 转化路径
- 信息缺口
- 内容重复
- 表达问题

---

# 17. SEO 技术方案

## 17.1 SEO Engine 分层

```text
Crawler
→ DOM Parser
→ Deterministic Rules
→ Lighthouse
→ AI Semantic Review
→ SEO Report
```

## 17.2 确定性规则

检查：

- Title 是否存在
- Description 是否存在
- H1 数量
- Heading 层级
- Canonical
- Robots
- Sitemap
- Alt
- 失效链接
- HTTP 状态
- 重定向
- Open Graph
- Twitter Card
- JSON-LD
- hreflang
- 重复标题
- 重复描述

## 17.3 Lighthouse

Lighthouse 是 Chrome 官方提供的开源网页质量审计工具，能够检查性能、可访问性、SEO 等项目，并支持通过命令行或 Node 模块集成。

使用方式：

- Local Worker 启动 Chrome
- 对目标页面运行 Lighthouse
- 保存原始 JSON
- 解析关键指标
- 生成用户可理解的报告

Lighthouse 分数只作为辅助信号，不作为绝对结论。

## 17.4 AI 语义 SEO

AI 负责判断：

- 页面是否回答搜索意图
- 标题是否清晰
- 内容是否覆盖主题
- 页面是否具有差异化
- CTA 是否匹配搜索意图
- 内容是否存在空泛表达
- 页面之间是否互相竞争

AI 不能虚构：

- 搜索量
- 排名
- 流量
- 竞争度
- 转化数据

没有外部数据源时必须明确标记为建议。

---

# 18. 自动化技术方案

## 18.1 自动化编辑器

推荐使用 React Flow 构建节点编辑器。

React Flow 提供节点、连接端口、边、选择、缩放和自定义节点等能力，适合实现可视化工作流。

React Flow 只负责 UI，不负责执行逻辑。

## 18.2 Workflow Engine

执行引擎独立于编辑器：

```text
Workflow Definition
→ Validator
→ DAG Compiler
→ Execution Plan
→ Node Runner
→ State Store
→ Run Result
```

## 18.3 节点接口

```ts
interface WorkflowNodeHandler<TInput, TConfig, TOutput> {
  type: string;
  validateConfig(config: TConfig): ValidationResult;
  execute(context: NodeContext<TInput, TConfig>): Promise<TOutput>;
}
```

## 18.4 MVP 节点

触发器：

- Manual Trigger
- Schedule Trigger
- GitHub Release
- File Changed

数据节点：

- Product Data
- Brand Data
- Website Data
- Asset Data

生成节点：

- Generate Copy
- Generate Store Screenshots
- Generate Social Visuals
- Generate Video
- Generate Landing Page

控制节点：

- Condition
- Delay
- Human Review
- Merge

输出节点：

- Save to Project
- Export Package
- Publish Website
- Webhook

## 18.5 人工审核

所有公开发布动作默认要求 Human Review。

状态：

```text
waiting_review
approved
rejected
revision_requested
```

---

# 19. 任务队列

## 19.1 Job 模型

```text
Job
├── id
├── type
├── payload
├── priority
├── status
├── progress
├── attempt
├── maxAttempts
├── createdAt
├── startedAt
├── completedAt
└── error
```

## 19.2 任务状态

```text
pending
queued
running
paused
completed
failed
cancelled
interrupted
```

## 19.3 任务类型

- AI_GENERATION
- IMAGE_RENDER
- VIDEO_RENDER
- WEBSITE_CRAWL
- SEO_AUDIT
- WEBSITE_BUILD
- LOCALIZATION
- EXPORT_PACKAGE
- THUMBNAIL_GENERATION

## 19.4 并发控制

建议默认：

- AI 请求：2–4 个并发
- 图片渲染：2 个并发
- 视频渲染：1 个并发
- 网站抓取：2 个并发
- Website Build：1 个并发

用户可以在设置中调整。

---

# 20. API 设计

## 20.1 Project API

```text
POST   /api/projects
GET    /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id
DELETE /api/projects/:id
POST   /api/projects/:id/duplicate
POST   /api/projects/:id/export
POST   /api/projects/import
```

## 20.2 Brand API

```text
GET    /api/projects/:id/brand
PUT    /api/projects/:id/brand
POST   /api/projects/:id/brand/generate
POST   /api/projects/:id/brand/extract
POST   /api/projects/:id/brand/export
GET    /api/projects/:id/brand/versions
```

## 20.3 Content API

```text
POST   /api/copy/generate
POST   /api/copy/rewrite
POST   /api/copy/localize
POST   /api/copy/validate
PATCH  /api/copy/:id/fields/:field
GET    /api/copy/:id/versions
```

## 20.4 Design API

```text
POST   /api/designs
GET    /api/designs/:id
PATCH  /api/designs/:id
POST   /api/designs/:id/render
POST   /api/designs/:id/resize
POST   /api/designs/:id/apply-template
POST   /api/designs/:id/localize
```

## 20.5 Video API

```text
POST   /api/videos
POST   /api/videos/:id/generate-script
POST   /api/videos/:id/preview
POST   /api/videos/:id/render
GET    /api/videos/:id/renders
```

## 20.6 Website API

```text
POST   /api/websites
POST   /api/websites/import
POST   /api/websites/:id/generate
POST   /api/websites/:id/build
POST   /api/websites/:id/export
POST   /api/websites/:id/publish
```

## 20.7 SEO API

```text
POST   /api/seo/audits
GET    /api/seo/audits/:id
POST   /api/seo/audits/:id/optimize
POST   /api/seo/keywords
POST   /api/seo/mappings
```

## 20.8 SSE 事件

```text
job.started
job.progress
job.log
job.completed
job.failed

agent.token
agent.tool.started
agent.tool.completed

render.frame
render.progress
render.completed

workflow.step.started
workflow.step.completed
workflow.review.required
```

---

# 21. 安全方案

## 21.1 Electron 安全

必须启用：

- `contextIsolation: true`
- `nodeIntegration: false`
- Renderer Sandbox
- 严格 CSP
- IPC 参数校验
- IPC Sender 校验
- 导航白名单
- 外部链接校验
- 自定义安全协议

Electron 官方建议对远程内容禁用 Node.js Integration、启用 Context Isolation 和进程沙盒，并限制导航、窗口创建与 IPC 能力。

## 21.2 网站内容隔离

导入的网站和生成网站必须在隔离环境运行：

- 无 Node.js
- 无 Electron API
- 无本地文件访问
- 独立 Session
- 独立 Storage
- 严格 CSP
- 禁止自动下载
- 禁止打开任意协议
- 禁止访问本地网络

## 21.3 SSRF 防护

网站抓取必须阻止：

- `localhost`
- `127.0.0.1`
- 私有 IP
- Link-local IP
- 云服务 Metadata 地址
- `file://`
- `ftp://`
- 自定义危险协议

DNS 解析后需要再次检查 IP。

## 21.4 文件安全

上传文件需要检查：

- MIME
- 扩展名
- 文件头
- 文件大小
- 图片解码
- ZIP 路径穿越
- SVG 脚本
- HTML 脚本
- 可执行文件

## 21.5 密钥存储

API Key 不写入普通 JSON。

使用：

- macOS Keychain
- Windows Credential Manager
- Electron Safe Storage

数据库只保存密钥引用 ID。

---

# 22. 性能方案

## 22.1 资源处理

原始素材与编辑预览分离：

```text
Original Asset
→ Processed Asset
→ Preview Asset
→ Thumbnail
```

编辑器默认加载缩略图或中等分辨率素材。

导出时使用原始素材。

## 22.2 缓存

缓存内容包括：

- 字体
- 图片解码结果
- 缩略图
- 模板编译结果
- 视频场景帧
- 网站构建结果
- Lighthouse 浏览器
- AI 结构化结果

## 22.3 增量渲染

当用户只修改某个页面时：

- 不重新生成全部图片
- 不重新渲染全部视频场景
- 不重新构建没有变化的网站页面
- 不重新运行完整 SEO 扫描

每个文档计算内容 Hash。

## 22.4 大项目处理

- 列表虚拟化
- 页面按需加载
- 缩略图延迟加载
- Worker 数量限制
- 资源引用去重
- 自动清理过期缓存

---

# 23. 测试方案

## 23.1 单元测试

覆盖：

- Schema
- 字符限制
- 模板适配
- 文本布局
- ChangeSet
- Workflow DAG
- SEO Rules
- 文件命名
- 多语言术语

## 23.2 Contract Test

确保：

- Web 与 Daemon API 一致
- Worker 消息格式一致
- 数据迁移兼容
- 插件接口兼容
- AI Provider 接口兼容

## 23.3 集成测试

覆盖：

- 创建项目
- 生成品牌
- 生成商店文案
- 生成图片
- 视频渲染
- 网站抓取
- SEO 扫描
- Launch Package 导出

## 23.4 视觉回归

使用 Playwright 截图测试：

- 商店截图模板
- 社交媒体模板
- 网站组件
- 响应式页面
- 多语言排版

Playwright 支持生成和对比页面截图，但不同浏览器、平台和字体环境可能产生差异，因此基准截图需要按平台分别管理。

## 23.5 E2E

核心 E2E：

```text
创建项目
→ 导入产品
→ 生成品牌
→ 生成截图
→ 生成文案
→ 生成视频
→ 导出 Launch Package
```

---

# 24. 打包与发布

## 24.1 桌面打包

复用 Open Design 的：

- Packaged Sidecar
- Electron 打包
- Release Channel
- 更新机制
- macOS 安装包
- Windows 安装包

## 24.2 macOS

需要：

- Developer ID 签名
- Hardened Runtime
- Notarization
- Entitlements
- 自动更新签名

## 24.3 Windows

需要：

- Code Signing
- 安装程序
- 自动更新
- 防病毒误报测试
- 文件关联
- 卸载清理

## 24.4 第三方许可证

构建时自动生成：

```text
THIRD_PARTY_NOTICES.md
licenses.json
licenses/
```

需要特别审核：

- Open Design
- HyperFrames
- Fabric.js
- React Flow
- FFmpeg
- 字体
- 音乐
- 设备模型
- 模板素材
- 品牌 Logo

---

# 25. 分阶段实施

## 阶段 0：Open Design 基线稳定

目标：

- 完成 Fork
- 替换品牌
- 跑通源码和打包
- 清理无关模块
- 建立上游同步策略
- 建立许可证清单

## 阶段 1：项目、品牌与素材

交付：

- Product Profile
- Brand Profile
- Asset Library
- 项目版本
- 本地存储
- 品牌导入和生成

## 阶段 2：商店和社交内容

交付：

- Fabric 编辑器
- App Store 截图
- Google Play 截图
- Store Copy
- Social Visuals
- Social Copy
- 多尺寸适配
- Launch Package

## 阶段 3：视频

交付：

- Video Project
- Scene Editor
- HyperFrames
- FFmpeg
- 16:9、9:16、1:1
- 视频脚本和字幕

## 阶段 4：自动化

交付：

- React Flow 编辑器
- Workflow Engine
- Manual Trigger
- Schedule
- GitHub Release
- Human Review
- Run History

## 阶段 5：网站分析

交付：

- URL 导入
- Playwright 抓取
- 网站文案提取
- SEO 基础检查
- Lighthouse
- 文案优化报告

## 阶段 6：网站生成

交付：

- Website Document
- Component Registry
- Landing Page
- 响应式预览
- Next.js / HTML 导出
- 静态部署

## 阶段 7：云端和团队

交付：

- 登录和账号
- 项目同步
- 团队空间
- 云端渲染
- 审核流程
- 自动发布
- 模板市场

---

# 26. 技术风险

## 26.1 Open Design 更新冲突

应对：

- 保留 Upstream Remote
- 尽量不修改底层通用包
- Launch Studio 业务放到新 Package
- 使用 Adapter 扩展现有能力
- 定期合并上游安全和打包更新

## 26.2 产品范围过大

应对：

- MVP 只完成一条发布闭环
- Website Studio 后置
- 自动化第一版只提供预设流程
- 视频第一版使用场景编辑，不做专业时间轴

## 26.3 AI 输出不稳定

应对：

- Schema
- ChangeSet
- 规则校验
- 锁定字段
- 人工审核
- Prompt 版本
- 输出回归测试

## 26.4 字体渲染差异

应对：

- 导出前加载全部字体
- 保存字体版本
- 检查字体授权
- 字体缺失提示
- 渲染环境固定
- 视觉回归按平台管理

## 26.5 视频渲染成本高

应对：

- 预览和高清渲染分开
- 场景缓存
- 单独 Worker
- 并发限制
- 后期云端渲染

## 26.6 网站生成代码不可维护

应对：

- 第一阶段使用 Component Registry
- AI 不直接写任意代码
- 代码生成器负责输出
- 组件和 Schema 版本化
- 高级代码模式后置

---

# 27. 最终技术选型

| 模块         | 推荐方案                              |
| ------------ | ------------------------------------- |
| 桌面端       | Electron                              |
| 前端         | Next.js + React + TypeScript          |
| 本地服务     | Node.js + Express                     |
| 流式通信     | SSE                                   |
| 数据库       | SQLite + better-sqlite3               |
| 状态管理     | Zustand                               |
| Schema       | Zod + JSON Schema                     |
| 图片编辑     | Fabric.js                             |
| 图片导出     | Canvas / Headless Chromium            |
| 视频生成     | HyperFrames                           |
| 视频编码     | FFmpeg                                |
| 网站抓取     | Playwright                            |
| SEO 检查     | 自研规则 + Lighthouse                 |
| 网站生成     | Website Document + Component Registry |
| 网站输出     | HTML / Next.js                        |
| 自动化编辑器 | React Flow                            |
| 自动化引擎   | 自研 DAG Runner                       |
| 代码编辑     | Monaco Editor                         |
| 测试         | Vitest + Playwright                   |
| 本地密钥     | OS Keychain / Safe Storage            |
| 桌面基础     | Open Design Fork                      |

---

# 28. 技术结论

Launch Studio 最合理的技术路线不是从零开发完整设计工具，而是：

> 以 Open Design 作为桌面、Agent、文件、Sidecar 和导出基础，在其上建立独立的产品、品牌、Campaign、图片、文案、视频、网站和自动化业务层。

第一阶段的核心架构为：

```text
Open Design Base
+ Launch Studio Domain Model
+ Structured AI Orchestrator
+ Fabric Design Engine
+ HyperFrames Video Engine
+ Content Engine
+ Local Job Queue
+ Launch Package Export
```

后续逐步增加：

```text
+ Website Crawler
+ SEO Engine
+ Website Component Registry
+ Workflow Engine
+ Cloud Render
+ Team Collaboration
```

整个系统最重要的技术决策是：

1. AI 只生成结构化内容和修改指令。
2. 业务文档是唯一数据源。
3. 图片、视频和网站由确定性引擎渲染。
4. 所有公开发布操作默认需要人工审核。
5. 第一阶段保持本地优先和模块化单体。
6. 网站生成和云端协作在核心发布闭环稳定后再加入。
