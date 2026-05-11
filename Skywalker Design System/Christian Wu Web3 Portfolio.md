以下是依照**目前已接收到的資訊**整理出的完整報告。
兩個 Notion page 目前沒有被成功完整讀取，因此以下內容以：你前面提供的 Web3 Portfolio 方向、Claude Design 已建立的 design system、已上傳 `.fig` 參考邏輯、logo / skywalk 結構、以及先前對話紀錄整合為主。相關來源包含先前整理的 Web3 Portfolio 設計流程與 Claude Design 欄位內容 ，以及 logo component / skywalk 命名與變體結構 。

---

# Web3 Portfolio 內容規劃與 Claude Design 開發提示詞報告

## 0. 專案定位

### 專案名稱建議

```txt
Christian Wu Web3 Portfolio
```

或若延續 Figma 裡的命名：

```txt
skywalk — Web3 Portfolio System
```

### 核心定位

這不是單純個人作品集，而是：

> 一個結合 Web3 dashboard、NFT marketplace、AI assistant、case study archive 與個人品牌展示的互動式 portfolio system。

主要要展示的不是「我做過什麼作品」而已，而是：

* 具備 AI workflow 設計能力
* 具備 UI/UX design system 建構能力
* 具備 Web3 / NFT / marketplace 產品理解
* 具備把模糊需求轉為可開發架構的能力
* 具備從 Figma → Claude Design → Open Design → React / Tailwind prototype 的能力
* 具備跨工具協作、MCP、AI-assisted development 的能力

---

# 1. Portfolio 必須展示的內容架構

## 1.1 首頁 Hero

### 目的

建立第一印象，讓訪客在 5 秒內知道：

* 你是誰
* 你擅長什麼
* 這個 portfolio 為什麼不是一般作品集
* 你的能力橫跨 UI/UX、AI workflow、Web3、prototype、design system

### 建議文案

```txt
Christian Wu
AI × UI/UX × Web3 Product Designer

I design AI-assisted workflows, Web3 interfaces, and scalable design systems that transform complex ideas into usable digital products.
```

### 中文版本

```txt
Christian Wu
AI × UI/UX × Web3 產品設計師

我將複雜的 AI 工作流、Web3 產品架構與設計系統，轉化為可理解、可互動、可開發的數位產品體驗。
```

### Hero CTA

```txt
Explore Portfolio
View Case Studies
Ask AI Assistant
Connect Wallet
```

中文：

```txt
探索作品集
查看案例研究
詢問 AI Assistant
連接 Wallet
```

---

## 1.2 Portfolio Dashboard

### 目的

用 dashboard 方式呈現你的能力全貌。

### 必要模組

| 模組                 | 內容                                               |
| ------------------ | ------------------------------------------------ |
| Profile Summary    | 姓名、角色、定位、所在地、專長                                  |
| Capability Cards   | AI Workflow、UI/UX、Web3、Design System、Automation  |
| Project Stats      | 專案數、設計系統數、prototype 數、AI workflow 數              |
| Featured Projects  | 精選 3–6 個作品                                       |
| Recent Experiments | 最近 AI / Web3 / UI prototype 嘗試                   |
| Tool Stack         | ChatGPT、Claude、Figma、Notion、Codex、Framer、n8n、MCP |
| AI Assistant Panel | 讓訪客用自然語言查詢作品與能力                                  |

### Dashboard KPI 建議

```txt
12+ Product Concepts
8+ AI Workflow Systems
6+ Design Systems
20+ Prototype Screens
5+ Web3 Interface Studies
```

中文：

```txt
12+ 產品概念
8+ AI 工作流系統
6+ 設計系統
20+ Prototype Screens
5+ Web3 介面研究
```

---

## 1.3 Project / NFT Collection Grid

### 目的

把作品集包裝成 Web3 marketplace / NFT collection 的形式。

每個 project card 像一個 NFT asset，但內容是你的專案能力。

### Card 欄位

| 欄位                  | 說明                                                     |
| ------------------- | ------------------------------------------------------ |
| Project Thumbnail   | 作品縮圖                                                   |
| Project Name        | 專案名稱                                                   |
| Category            | AI Workflow / UIUX / Web3 / Automation / Design System |
| Chain-like Metadata | 類 Web3 標籤，例如 ETH / DAO / NFT / MCP / AI Agent          |
| Skill Tags          | Figma、Claude、React、Notion、MCP                          |
| Status              | Concept / Prototype / Case Study / Production          |
| Rarity-style Label  | Core Skill / Experimental / Featured                   |
| CTA                 | View Case Study                                        |

### 示例專案卡

```txt
AI Workflow Operating System
Category: AI Automation
Tags: Claude, Notion, MCP, n8n
Status: Prototype
Type: Featured System
```

```txt
Web3 Portfolio Interface
Category: Web3 UI
Tags: NFT, Dashboard, Wallet, AI Assistant
Status: Active Prototype
Type: Core Project
```

```txt
Design System Generator
Category: Design System
Tags: Figma, Claude Design, Token System, Auto Layout
Status: In Development
Type: Infrastructure
```

---

## 1.4 Case Study Detail Page

### 目的

每個作品不要只放圖片，要用「產品設計決策」方式呈現。

### 每個 Case Study 必備結構

```txt
1. Project Overview
2. Problem Statement
3. Target Users
4. Product Goal
5. Design Strategy
6. Information Architecture
7. Key Screens
8. Component System
9. AI Workflow / Automation Logic
10. Technical Handoff
11. Outcome / Learning
12. Next Iteration
```

### 中文結構

```txt
1. 專案概述
2. 問題定義
3. 目標使用者
4. 產品目標
5. 設計策略
6. 資訊架構
7. 關鍵畫面
8. 元件系統
9. AI 工作流 / 自動化邏輯
10. 技術交付方式
11. 成果與學習
12. 下一步迭代
```

---

## 1.5 AI Assistant Panel

### 目的

這是 portfolio 的差異化核心。

訪客不只是看作品，而是可以問：

* 你會什麼？
* 哪個作品最能展示 AI workflow？
* 你怎麼把 Figma 變成 prototype？
* 你適合做哪類產品？
* 你如何設計 Web3 dashboard？
* 你用哪些 AI 工具？

### 建議 Assistant 預設 Prompt Chips

```txt
What is Christian best at?
Show me his Web3 interface work
Explain his AI workflow process
Which project shows design system thinking?
How does he use Claude Design and Figma?
What can he build for a startup?
```

中文：

```txt
Christian 最擅長什麼？
展示他的 Web3 介面作品
說明他的 AI 工作流方法
哪個作品最能展現設計系統能力？
他如何使用 Claude Design 和 Figma？
他能替 startup 建構什麼？
```

### AI Panel 回答內容分類

| 類型                     | 顯示方式              |
| ---------------------- | ----------------- |
| Skill Summary          | 短段落 + tags        |
| Project Recommendation | project cards     |
| Workflow Explanation   | step timeline     |
| Tool Stack             | integration cards |
| Case Study Link        | CTA button        |

---

## 1.6 MCP Apps / Integrations Page

### 目的

展示你的 AI-native 工作方式，而不是單純展示 UI。

### 必要整合卡

```txt
Figma
Claude Design
ChatGPT
Codex
Notion
GitHub
Framer
n8n
Dropbox
Google Drive
MCP Server
Open Design
```

### 每張 Integration Card 欄位

| 欄位              | 內容                                   |
| --------------- | ------------------------------------ |
| Tool Name       | 工具名稱                                 |
| Role            | 在 workflow 中的角色                      |
| Connected State | Connected / Available / Experimental |
| Input           | 輸入來源                                 |
| Output          | 輸出成果                                 |
| Used For        | 用途                                   |
| CTA             | View Workflow                        |

### 示例

```txt
Claude Design
Role: Design system generation and UI composition
Input: .fig reference files, brand assets, project brief
Output: reusable components, screens, prototype structure
Used for: converting design intent into structured UI systems
```

---

## 1.7 Web3 Profile / Wallet Page

### 目的

這頁不是一定要真的接鏈，可以先做 prototype mock。

### 建議內容

| 模組               | 內容                                 |
| ---------------- | ---------------------------------- |
| Wallet Status    | Connected / Not connected          |
| Identity         | ENS-like display name              |
| Portfolio Assets | Project NFTs / design assets       |
| Chain Preference | Ethereum / Polygon / Base / Solana |
| Activity         | 最近查看、收藏、互動                         |
| Credentials      | AI / UIUX / Web3 badges            |
| Social Proof     | GitHub、Figma、Notion、LinkedIn       |

### Mock 資料

```txt
Wallet: 0xCWU...2026
Network: Ethereum / Base
Portfolio Assets: 12
Verified Skills: 8
Design Systems: 6
AI Workflows: 8
```

---

## 1.8 About / Capability Page

### 目的

補足你的個人定位與能力結構。

### 建議能力分類

```txt
AI Workflow Design
UI/UX Design
Design System Architecture
Web3 Product Interface
AR/VR Interaction Design
Data Visualization
Project Management
No-code / Low-code Automation
Frontend Prototype Thinking
```

### 能力矩陣

| 能力                 | 展示方式                             |
| ------------------ | -------------------------------- |
| AI Workflow        | 流程圖、automation map               |
| UI/UX              | screens、components、user flow     |
| Design System      | tokens、components、variants       |
| Web3               | wallet、NFT、marketplace、dashboard |
| Data Visualization | chart cards、analytics dashboard  |
| PM                 | roadmap、kanban、delivery system   |

---

# 2. 建議作品集內容清單

## Priority A：首頁一定要出現

```txt
1. Hero positioning
2. Featured project cards
3. AI assistant entry
4. Capability overview
5. Tool stack
6. CTA to case studies
```

## Priority B：Dashboard 一定要出現

```txt
1. Profile summary
2. Capability KPI
3. Featured projects
4. Recent workflow experiments
5. Web3-style project collection
6. AI assistant side panel
```

## Priority C：Case Study 一定要出現

```txt
1. Problem
2. Strategy
3. Screens
4. Components
5. AI workflow
6. Technical handoff
7. Outcome
```

## Priority D：可延後

```txt
1. 真實 wallet integration
2. 真實 on-chain data
3. 動態 NFT minting
4. CMS 後台
5. 完整 chatbot RAG
6. 多語系系統
7. 登入系統
```

---

# 3. 開發優先順序：省 token 版本

## Phase 1 — Static Portfolio MVP

優先目標：先做出可展示版本。

### 必做

```txt
- Landing page
- Portfolio dashboard
- Project grid
- Project detail page
- Static AI assistant panel mock
- Tool stack / integration cards
```

### 暫不做

```txt
- 真實登入
- 真實 wallet connect
- 真實資料庫
- 真實 AI API
- 真實 NFT metadata fetch
- 動態 marketplace trading
```

### 原因

這階段最省 token，因為 Claude Design / open-design 只需要生成靜態 UI 與 component structure，不需要處理後端邏輯。

---

## Phase 2 — Componentized Frontend

優先目標：把 UI 拆成可維護元件。

### 核心元件

```txt
LayoutShell
SidebarNav
TopNav
HeroSection
CapabilityCard
ProjectCard
ProjectGrid
ProjectDetailHeader
CaseStudySection
AIChatPanel
PromptChip
ToolIntegrationCard
WalletStatusCard
MetricCard
TagBadge
ActionButton
```

### 資料層

先用本地資料：

```txt
/data/projects.ts
/data/skills.ts
/data/tools.ts
/data/case-studies.ts
/data/navigation.ts
```

不要一開始接 CMS，先用 structured JSON / TypeScript objects。

---

## Phase 3 — Interaction Prototype

優先目標：加入互動感，但不做重後端。

### 可做

```txt
- project filter
- category tabs
- search mock
- AI prompt chips mock response
- modal / drawer
- project detail transitions
- dark / light mode
```

### 還不做

```txt
- streaming AI response
- real wallet connection
- backend auth
- database write
```

---

## Phase 4 — Real Integrations

優先目標：等 UI 穩定後才接真實資料。

```txt
- Wallet connect
- Notion CMS
- GitHub project sync
- AI assistant API
- RAG portfolio knowledge base
- Figma / design asset sync
```

---

# 4. 建議資訊架構 IA

```txt
/
├── Home
├── Dashboard
├── Projects
│   ├── All Projects
│   ├── AI Workflow
│   ├── UI/UX
│   ├── Web3
│   ├── Design System
│   └── Automation
├── Case Studies
│   └── [project-slug]
├── AI Assistant
├── Integrations
├── Wallet / Profile
└── About
```

若要更像 Web3 marketplace：

```txt
/
├── Explore
├── Collection
├── Asset Detail
├── Portfolio
├── Activity
├── Assistant
├── Integrations
└── Profile
```

建議採用混合式命名：

```txt
Home
Dashboard
Collections
Case Studies
Assistant
Integrations
Profile
```

---

# 5. Claude Design 完整提示詞

以下可直接貼給 Claude Design。

```txt
Create a complete Web3 portfolio product interface based on the existing design system that has already been generated.

Project name:
Christian Wu Web3 Portfolio / skywalk

Core concept:
This is not a normal personal portfolio website. It is an AI-assisted Web3 portfolio system where design projects are presented like digital assets, NFT collections, marketplace listings, and interactive case studies.

The interface should help visitors understand Christian Wu’s capabilities in:
- AI workflow design
- UI/UX design
- Web3 product interface design
- design system architecture
- automation and MCP-based workflows
- Figma to Claude Design to prototype workflows
- product strategy and technical handoff

Use the existing design system as the source of truth. Do not rebuild the visual style from scratch. Extend the current components only when necessary.

Reference logic:
- Use the existing generated design system as the primary UI foundation.
- Use Web3 / NFT marketplace patterns for information architecture, collection browsing, asset cards, wallet-like profile, activity, and project detail pages.
- Use AI product / developer tool patterns for assistant panels, prompt composer, tool cards, integration states, and workflow explanation.
- Keep the interface premium, structured, technical, minimal, and scalable.
- Avoid generic crypto neon, cliché cyberpunk visuals, excessive gradients, and overdecorated AI imagery.

Required output:
Create the key screens and reusable components for a polished Web3 portfolio MVP.

Required screens:
1. Landing / Hero page
2. Portfolio Dashboard
3. Project Collection Grid
4. Project / NFT-style Detail Page
5. Full Case Study Page
6. AI Assistant Panel / Assistant Page
7. MCP Apps / Integrations Page
8. Wallet-like Profile Page
9. About / Capability Matrix Page

Content direction:

Landing / Hero:
- Title: Christian Wu
- Subtitle: AI × UI/UX × Web3 Product Designer
- Description: I design AI-assisted workflows, Web3 interfaces, and scalable design systems that transform complex ideas into usable digital products.
- Primary CTA: Explore Portfolio
- Secondary CTA: Ask AI Assistant
- Supporting CTA: View Case Studies

Portfolio Dashboard:
Include:
- Profile summary
- Capability KPI cards
- Featured project cards
- Recent experiments
- Tool stack overview
- AI assistant side panel
- Web3-style project collection preview

Suggested KPI content:
- 12+ Product Concepts
- 8+ AI Workflow Systems
- 6+ Design Systems
- 20+ Prototype Screens
- 5+ Web3 Interface Studies

Project Collection Grid:
Create project cards that feel like NFT / marketplace assets, but represent real portfolio projects.

Each project card should include:
- Project thumbnail placeholder
- Project name
- Category
- Skill tags
- Status
- Rarity-style label
- CTA button

Suggested project examples:
1. Web3 Portfolio Interface
   Category: Web3 UI
   Tags: NFT, Dashboard, Wallet, AI Assistant
   Status: Active Prototype
   Type: Core Project

2. AI Workflow Operating System
   Category: AI Automation
   Tags: Claude, Notion, MCP, n8n
   Status: Prototype
   Type: Featured System

3. Design System Generator
   Category: Design System
   Tags: Figma, Claude Design, Token System, Auto Layout
   Status: In Development
   Type: Infrastructure

4. Smart Factory AI Workflow
   Category: AI Transformation
   Tags: AR, MES, ERP, Digital Coach
   Status: Concept Prototype
   Type: Enterprise Workflow

5. AI Interior Design App
   Category: Product UI
   Tags: VisionOS, AR, AI Chat, Commerce
   Status: Prototype
   Type: Product Concept

6. Brand Guideline Generator
   Category: Brand System
   Tags: Logo, Design Token, Guideline, SVG
   Status: Prototype
   Type: Design Automation

Project Detail Page:
Create a detailed page that combines NFT asset detail layout with product case study structure.

Include:
- Project hero preview
- Project metadata
- Category, tools, status, year
- Role
- Challenge
- Design strategy
- Key screens
- Component system
- AI workflow logic
- Technical handoff
- Outcome
- Next iteration

Full Case Study Page:
Use the following structure:
1. Project Overview
2. Problem Statement
3. Target Users
4. Product Goal
5. Design Strategy
6. Information Architecture
7. Key Screens
8. Component System
9. AI Workflow / Automation Logic
10. Technical Handoff
11. Outcome / Learning
12. Next Iteration

AI Assistant Panel:
Create a polished assistant experience that lets visitors ask about Christian’s work.

Include:
- Assistant header
- Suggested prompt chips
- Message thread
- Project recommendation cards
- Tool / workflow explanation cards
- Prompt composer

Suggested prompt chips:
- What is Christian best at?
- Show me his Web3 interface work
- Explain his AI workflow process
- Which project shows design system thinking?
- How does he use Claude Design and Figma?
- What can he build for a startup?

MCP Apps / Integrations Page:
Create a tool integration page showing Christian’s AI-native workflow.

Required integration cards:
- Figma
- Claude Design
- ChatGPT
- Codex
- Notion
- GitHub
- Framer
- n8n
- Dropbox
- Google Drive
- MCP Server
- Open Design

Each integration card should include:
- Tool name
- Role in workflow
- Connection state
- Input
- Output
- Used for
- CTA

Wallet-like Profile Page:
Create a Web3-inspired profile page. It can be a visual prototype and does not need real wallet integration.

Include:
- Wallet status
- ENS-like display name
- Portfolio assets
- Verified skill badges
- Activity feed
- Social proof links
- Preferred networks

Mock data:
- Wallet: 0xCWU...2026
- Network: Ethereum / Base
- Portfolio Assets: 12
- Verified Skills: 8
- Design Systems: 6
- AI Workflows: 8

About / Capability Matrix:
Create a capability page showing Christian’s cross-disciplinary skill map.

Capability categories:
- AI Workflow Design
- UI/UX Design
- Design System Architecture
- Web3 Product Interface
- AR/VR Interaction Design
- Data Visualization
- Project Management
- No-code / Low-code Automation
- Frontend Prototype Thinking

Design requirements:
- Use the existing design system.
- Use reusable components.
- Use consistent naming.
- Use clean auto layout.
- Do not over-create unnecessary variations.
- Keep component structure development-friendly.
- Prioritize MVP screens first.
- Avoid making every screen unique; reuse layout patterns.
- Make the design easy to convert into React + Tailwind components.

Development priority:
Generate in this order:
1. Core layout system: LayoutShell, SidebarNav, TopNav, ContentContainer
2. Basic components: Button, Badge, Card, Input, Tabs, SectionHeader
3. Portfolio components: ProjectCard, ProjectGrid, MetricCard, CapabilityCard
4. AI components: AIChatPanel, PromptChip, MessageBubble, AssistantRecommendationCard
5. Web3 components: WalletStatusCard, AssetMetadataPanel, ActivityFeed, CollectionCard
6. Integration components: ToolIntegrationCard, WorkflowStepCard
7. Pages: Landing, Dashboard, Project Grid, Project Detail, Assistant, Integrations, Profile, About

Token-saving constraints:
- Build static screens first.
- Use mock data only.
- Do not implement real wallet connection.
- Do not implement real AI API.
- Do not implement authentication.
- Do not implement database logic.
- Do not generate excessive hidden states.
- Only include essential hover / active / selected states.
- Use repeated components and data-driven layouts.
- Avoid generating complex animations at this stage.

Final deliverable:
A clean, premium, developer-tool-inspired Web3 portfolio prototype that clearly communicates Christian Wu’s AI, UI/UX, Web3, design system, and workflow automation capabilities.
```

---

# 6. Open Design / 本地端分段執行策略

如果 Claude Design token 不夠，建議不要一次叫它做完整 portfolio。
改用以下分段提示。

---

## Prompt 1 — 只建立內容架構與頁面 skeleton

```txt
Using the existing design system, create only the page skeleton and information architecture for Christian Wu Web3 Portfolio.

Do not create detailed visual variations yet.

Pages:
- Landing
- Dashboard
- Project Collection Grid
- Project Detail
- Case Study
- AI Assistant
- Integrations
- Wallet-like Profile
- About / Capability Matrix

For each page, create:
- page title
- section structure
- placeholder content blocks
- reusable layout regions
- component slots

Focus on structure, naming, auto layout, and development handoff.
```

---

## Prompt 2 — 建立核心 components

```txt
Create the core reusable components for Christian Wu Web3 Portfolio using the existing design system.

Components:
- LayoutShell
- SidebarNav
- TopNav
- SectionHeader
- Button
- Badge
- Card
- MetricCard
- CapabilityCard
- ProjectCard
- ProjectGrid
- TagGroup
- StatusBadge
- CTAGroup

Do not create full pages yet. Focus only on reusable components, clean naming, auto layout, and scalable variants.
```

---

## Prompt 3 — 建立 Project / Web3 components

```txt
Create the Web3 portfolio-specific components.

Components:
- NFT-style ProjectCard
- CollectionCard
- AssetMetadataPanel
- WalletStatusCard
- ActivityFeed
- ChainBadge
- SkillBadge
- ProjectStatsPanel
- CaseStudyPreviewCard
- ProjectDetailHeader

Use portfolio project content, not generic NFT marketplace content.
The design should feel like a Web3-inspired portfolio, not a trading platform.
```

---

## Prompt 4 — 建立 AI Assistant components

```txt
Create the AI assistant interface components for the portfolio.

Components:
- AIChatPanel
- AssistantHeader
- MessageBubble
- PromptChip
- PromptComposer
- AssistantRecommendationCard
- WorkflowExplanationCard
- ToolReferenceCard

Use the assistant to help visitors explore Christian Wu’s work, skills, design process, and AI workflow systems.
Do not implement real AI logic. This is a static prototype.
```

---

## Prompt 5 — 建立 Integrations Page

```txt
Create the MCP Apps / Integrations page for Christian Wu’s AI-native workflow.

Tools to include:
- Figma
- Claude Design
- ChatGPT
- Codex
- Notion
- GitHub
- Framer
- n8n
- Dropbox
- Google Drive
- MCP Server
- Open Design

Each card should show:
- Tool name
- Role in workflow
- Input
- Output
- Used for
- Connection state
- CTA

The page should communicate that Christian works through AI-assisted, tool-connected, design-to-code workflows.
```

---

## Prompt 6 — 組合 Landing + Dashboard

```txt
Using the existing components, assemble the Landing page and Portfolio Dashboard.

Landing page sections:
- Hero
- Featured capabilities
- Featured projects
- AI assistant preview
- Tool stack
- CTA

Dashboard sections:
- Profile summary
- KPI metrics
- Featured project collection
- Recent experiments
- Capability matrix preview
- AI assistant side panel

Use realistic content for Christian Wu’s AI, UI/UX, Web3, and design system portfolio.
```

---

## Prompt 7 — 組合 Project Grid + Detail + Case Study

```txt
Using the existing components, assemble:
1. Project Collection Grid
2. Project Detail Page
3. Full Case Study Page

Use these project examples:
- Web3 Portfolio Interface
- AI Workflow Operating System
- Design System Generator
- Smart Factory AI Workflow
- AI Interior Design App
- Brand Guideline Generator

Each project should include:
- category
- tools
- status
- role
- problem
- strategy
- outcome
- next iteration

Keep the design system consistent and avoid creating new one-off components.
```

---

# 7. 實作開發架構建議

## 7.1 React / Next.js Component Tree

```txt
src/
├── app/
│   ├── page.tsx
│   ├── dashboard/page.tsx
│   ├── projects/page.tsx
│   ├── projects/[slug]/page.tsx
│   ├── assistant/page.tsx
│   ├── integrations/page.tsx
│   ├── profile/page.tsx
│   └── about/page.tsx
├── components/
│   ├── layout/
│   │   ├── layout-shell.tsx
│   │   ├── sidebar-nav.tsx
│   │   ├── top-nav.tsx
│   │   └── content-container.tsx
│   ├── ui/
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── badge.tsx
│   │   ├── input.tsx
│   │   ├── tabs.tsx
│   │   └── section-header.tsx
│   ├── portfolio/
│   │   ├── project-card.tsx
│   │   ├── project-grid.tsx
│   │   ├── capability-card.tsx
│   │   ├── metric-card.tsx
│   │   └── case-study-section.tsx
│   ├── assistant/
│   │   ├── ai-chat-panel.tsx
│   │   ├── prompt-chip.tsx
│   │   ├── message-bubble.tsx
│   │   └── assistant-recommendation-card.tsx
│   ├── web3/
│   │   ├── wallet-status-card.tsx
│   │   ├── asset-metadata-panel.tsx
│   │   ├── activity-feed.tsx
│   │   └── chain-badge.tsx
│   └── integrations/
│       ├── tool-integration-card.tsx
│       └── workflow-step-card.tsx
├── data/
│   ├── projects.ts
│   ├── skills.ts
│   ├── tools.ts
│   ├── case-studies.ts
│   └── navigation.ts
└── styles/
    └── globals.css
```

---

## 7.2 最優先開發檔案

```txt
1. data/projects.ts
2. data/tools.ts
3. components/ui/card.tsx
4. components/ui/badge.tsx
5. components/layout/layout-shell.tsx
6. components/portfolio/project-card.tsx
7. components/portfolio/project-grid.tsx
8. components/assistant/ai-chat-panel.tsx
9. app/page.tsx
10. app/dashboard/page.tsx
```

---

# 8. Token 消耗控制原則

## 要避免

```txt
- 一次生成所有頁面與所有 state
- 一次要求完整 RWD + animation + CMS + wallet + AI
- 一次讓 Claude 重構全部 component
- 重複生成相似 card
- 每個頁面都做獨立 layout
- 過度要求 visual polish
```

## 建議做法

```txt
- 先 static
- 再 componentize
- 再加 interaction
- 最後接 API
- 所有資料先放 /data
- 所有卡片共用 Card / Badge / Button
- 所有頁面共用 LayoutShell
- 所有 project 由 ProjectCard map data 產生
```

---

# 9. MVP 版本最小可交付範圍

若只能先做一版，建議只做這 5 頁：

```txt
1. Landing
2. Dashboard
3. Project Grid
4. Project Detail
5. AI Assistant
```

暫時延後：

```txt
- Integrations page
- Wallet page
- Full About page
- 真實 AI
- 真實 wallet
- 真實 CMS
```

---

# 10. 最短可直接貼給 Claude Design 的版本

```txt
Use the existing generated design system to create a Web3-inspired AI portfolio for Christian Wu.

This is not a generic portfolio website. It should feel like a premium developer-tool-style Web3 dashboard where projects are displayed like digital assets, NFT collections, and interactive case studies.

Main positioning:
Christian Wu is an AI × UI/UX × Web3 Product Designer who designs AI-assisted workflows, Web3 interfaces, scalable design systems, and prototype-ready digital products.

Required MVP screens:
1. Landing page
2. Portfolio Dashboard
3. Project Collection Grid
4. Project Detail / NFT-style Case Study
5. AI Assistant Panel
6. Integrations Page
7. Wallet-like Profile Page
8. About / Capability Matrix

Prioritize these components:
1. LayoutShell, SidebarNav, TopNav
2. Button, Badge, Card, Input, Tabs
3. MetricCard, CapabilityCard, ProjectCard, ProjectGrid
4. AIChatPanel, PromptChip, MessageBubble, PromptComposer
5. WalletStatusCard, AssetMetadataPanel, ActivityFeed
6. ToolIntegrationCard, WorkflowStepCard

Use mock data only.
Do not implement real wallet connection.
Do not implement real AI API.
Do not implement authentication.
Do not implement database logic.
Do not over-create unique layouts.
Reuse components as much as possible.

Portfolio content should highlight:
- AI Workflow Design
- UI/UX Design
- Design System Architecture
- Web3 Product Interface
- AR/VR Interaction Design
- Data Visualization
- Project Management
- No-code / Low-code Automation
- Frontend Prototype Thinking

Suggested project examples:
- Web3 Portfolio Interface
- AI Workflow Operating System
- Design System Generator
- Smart Factory AI Workflow
- AI Interior Design App
- Brand Guideline Generator

Design direction:
Premium, structured, technical, minimal, developer-tool inspired, Web3-aware, AI-native.
Avoid generic crypto neon, cliché cyberpunk visuals, excessive gradients, and unrelated NFT marketplace content.

Final goal:
Create a clean MVP prototype that can later be converted into React + Tailwind components and locally developed through open-design.
```

---

# 11. 開發進度與狀態更新 (2026-05)

## 目前階段：Phase 1 & Phase 2 & Phase 3 (部份) 已完成

專案已成功從原型開發環境升級為可獨立部署的靜態 HTML/JS 架構，並且具備完整的展示能力。

### 1. 核心基礎設施 (Infrastructure)
- **CSS 架構**：已建立純粹且無依賴的 CSS 系統，包含 `reset.css`, `layout.css`, `components.css`, `screens.css` 與 `tokens.css`。
- **純 JS 模組化**：捨棄重型框架，實作了原生 Vanilla JS 的 SPA 架構 (`app.js`) 與純函數式渲染 (`components.js`, `screens.js`)。
- **資料與 UI 解耦**：所有的專案資料、Mock Log 與 AI 助理資訊皆抽離至 `data.js` 中。

### 2. 已完成的 MVP 畫面 (8+1 Screens)
所有畫面皆可在 `portfolio/index.html` 中透過 Hash Routing 完美切換：
1. ✅ **Landing Hero** (`#/`)：全螢幕視覺與核心數據。
2. ✅ **Dashboard** (`#/dashboard`)：開發數據大盤與近期活動日誌。
3. ✅ **Collection Grid** (`#/collection`)：專案列表與 Filter 切換。
4. ✅ **Project Detail** (`#/detail/:id`)：NFT 卡片式作品展示與規格。
5. ✅ **AI Assistant** (`#/assistant`)：具備 Chat Bubble 與 Command Composer 的對話面板。
6. ✅ **MCP Apps** (`#/mcp`)：MCP 工具伺服器狀態與 Console Log。
7. ✅ **Wallet Profile** (`#/wallet`)：皮夾身分與跨鏈資產設定。
8. ✅ **Case Study** (`#/casestudy/:id`)：深度專案文章與架構解析。
9. ✅ **Presentations (新增)** (`#/prototype`)：類似 Figma 的無限畫布，支援滑鼠平移，並封裝了 `sw-iphone-mockup` 用來展示實際的 App UI User Workflow (目前實作了 Agent OS 的初始化、Dashboard 與對話流程)。

### 3. 設計決策
- **Web3 Developer Tool 美學**：嚴格遵循 Skywalker 既有的暗黑工業風 (`#050507`) 與跳色點綴 (`#56D6FF`, `#0500FF`)。
- **元件高度共用**：卡片、標籤、發光按鈕、彈性排版等皆高度元件化，未來可零成本移轉至 React/Tailwind。
- **原型展示優化**：針對「互動式 App 原型」，設計了專屬的 iPhone 容器與 Figma-like Canvas 視圖，解決了過往靜態切片無法展示 Workflow 的問題。

### 接下來的建議步驟 (Next Actions)
1. **補足真實資料**：更新 `data.js`，將虛擬的專案與 Case Study 替換為實際的作品集內容與圖文連結。
2. **視覺細節與微動畫**：可進一步在元件上堆疊 hover effect 與過場淡入動畫，提升頁面質感。
3. **部署上線**：目前的靜態資料夾 (`/portfolio`) 已具備 Production Ready 狀態，可直接綁定 Vercel、Netlify 或 GitHub Pages 進行發布。
