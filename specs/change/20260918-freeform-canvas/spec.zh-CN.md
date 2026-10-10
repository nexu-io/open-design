---
id: 20260918-freeform-canvas
name: 自由画布 v1
status: proposed
created: '2026-09-18'
lang: zh-CN
canonical: spec.md
issues:
  - https://github.com/nexu-io/open-design/issues/8230
---

# 自由画布 v1

## 概述

现在 OpenDesign 的项目是围绕单个主 artifact 组织的：工作区一次打开一个文件，
在沙箱预览里渲染。Issue #8230 要的是一块空画布（「像 paper.design」），让一个
项目能同时放多个 artifact，用户自由摆放、并置对比。

本 spec 定义这块画布的 v1：一个空间型、多对象的面，一个项目持有 N 个 artifact，
每个由用户定位、每个仍走现有沙箱预览。它是一个新的项目界面，不是把现有单
artifact 预览器重新装修一遍。

## 现状

- 项目是单 artifact 模型。`ProjectTabsState` 是 `tabs: string[]` + `active`，
  是文件页签列表，不是空间布局（没有 x/y/w/h/z）。见
  `packages/contracts/src/api/projects.ts`。
- artifact 走沙箱、opaque-origin iframe 渲染：`srcDoc` + powered-preview
  loopback 主机，`sandbox="allow-scripts ..."`。见
  `apps/web/src/components/FileViewer.tsx`（sandbox 在 `:2504`/`:3995`，
  opaque-origin 注释在 `:1034`，powered-preview 在 `:384`）。
- `ProjectFileKind` / `ProjectFile` 定义在
  `packages/contracts/src/api/files.ts`；`ProjectKind` 与 scenario/intent 路由
  在 `packages/contracts/src/api/projects.ts` 和
  `packages/contracts/src/plugins/scenario-defaults.ts`。
- 前端栈：React 18.3.1、`@excalidraw/excalidraw@0.18.1`（Sketch 已在用）、
  `three@0.185.1`、`motion@12.40.0`。当前没有 react-flow / tldraw / konva /
  fabric / pixi 依赖。

## 目标

- 一个项目能在无限画布上放多个 artifact，每个持久化一份 `{ x, y, w, h, z }`。
- agent 完成一轮生成后，把该轮主要产物自动追加到已有画布；如果用户从空画布
  发起生成，则创建第一批节点。没有使用过画布的项目继续保持现有单预览流程。
- 核心空间交互：平移、缩放、拖拽、框选多选、缩放尺寸。
- 每个 artifact 在现有沙箱 iframe 里渲染，外面包一层 token 化外壳，白板的观感
  由外壳给出。
- 两层编辑语义要显式：画布级操作动外壳（移动、缩放、选择、层级）；元素级
  edit-mode 动 iframe 内部。两层不抢同一个手势。
- 布局要能重载后保留，靠一套新的持久化模型。

## 非目标（v1）

- 不做 edges、连线、节点 handle。
- 不做旋转、手绘、形状、箭头、便签。
- 不做画布上就地 AI 生成。把已产出的 artifact 拖上画布是 v1 的主闭环；就地生成
  是 fast-follow。

## 设计决策

### 画布引擎：React Flow（`@xyflow/react`，MIT）

白板搭在 React Flow 上。它的渲染模型——一个被 transform 的容器装着一堆绝对
定位的 DOM 节点，配 viewport culling——正好是「沙箱 iframe 当一等节点」需要的，
所以一个 artifact 帧作为一种节点类型放进去，不跟引擎打架。

React Flow 直接覆盖空间基础能力：无限画布、平移/缩放、节点拖拽、框选多选、
`NodeResizer`、`NodeToolbar`、z-index、culling。对齐辅助线、复制/粘贴/duplicate、
zoom-to-selection、右键菜单是在其上有界的补充。

白板观感用现有 CSS token 皮出来，读起来像 tldraw 风格的面。v1 关掉 edges 和
handle。

### 撤销/重做

React Flow 不带历史，v1 加一条命令栈（zustand + zundo，或手写栈），范围限定在
画布级操作。

### 布局持久化

新增一套布局模型，把每个上板的 artifact 映射到 `{ x, y, w, h, z }`，让项目在
平级持有 N 个 artifact，替掉现在「单一 active 文件页签」的形状。这是
OpenDesign 专属改造里最大的一块，且和选哪个画布库无关。

### Artifact 进入画布

用户可以把项目已有 artifact 拖到画布上。agent 一轮生成结束后，也会把主要
产物追加到已有画布，或追加到本轮生成发起时所在的空画布。新生成的 artifact
仍在现有单 artifact 预览中保持聚焦，自动同步不会打断当前交付流程。

## 待定问题

- 活 iframe vs 快照：建议默认「快照优先」——每个 artifact 显示静态快照，只有
  聚焦的那个升级成活的沙箱 iframe。同时跑 N 个活沙箱又重又难管。

## 约束

- 沙箱保留。artifact 的 HTML 带全局 CSS、不可信 JS、自己的 viewport 语义；要保
  导出保真，要保 powered-preview 的跨源隔离。画布把每个 artifact 包进外壳，但
  绝不把内容内联进宿主文档——外壳是宿主渲染的 React 白板 chrome，内容仍是沙箱
  opaque-origin iframe。
