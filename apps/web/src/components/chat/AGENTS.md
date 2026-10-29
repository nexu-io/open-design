# chat 组件维护规约

本目录是 chat 面板的组件所有者。当前约束以本文、实现与行为测试为准;
本文只讲**怎么写、怎么改、怎么验**。改本目录任何文件前先读完。

## 0. 界面上的字一律走 i18n

执行记录的动词与状态词(读取 / 新建 / 改写 / 搜索 / 执行 / 失败 / 进行中 / 思考中 /
已完成 / 运行失败 / N 处 / 执行计划 · N 步)已经建成 `chat.record.*` 这一组 key,
19 个语言 + `types.ts` 都补齐了。**新增任何用户可见的字,同样要补满 20 个文件** ——
`types.ts` 里没有的 key 过不了 typecheck,这是这条规约的强制点。

措辞以 wangchenglong 交付稿为准,不自己改写(产品的文案逐字照用)。

## 1. 分层:东西该放哪

```
packages/components/           通用 primitive(脱离 chat 语义仍通用)
apps/web/src/components/chat/
  primitives/                  chat 原子(跨 ≥3 个业务组件复用)
  <Component>.tsx              业务组件 + 共置 <Component>.module.css
apps/web/src/runtime/chat/     纯函数领域逻辑(无 JSX、无 DOM)
```

判断顺序:

1. 这东西**离开 chat 还通用吗**?→ 是,进 `packages/components`
2. 它**被 3 个以上 chat 业务组件用**吗?→ 是,进 `chat/primitives/`
3. 它**不碰 DOM、可纯函数测试**吗?→ 是,进 `runtime/chat/`
4. 否则就是业务组件,平铺在 `chat/` 下

**禁止**把产品布局或业务工作流上提到 `packages/components`。

## 1b. 执行记录这一族共用一个 CSS Module(别拆)

`primitives/record.module.css` 一个文件同时拥有 `Foldable` / `ToolRow` / `StatusMark` /
`SayText` / `FileButton` 的样式。**这是刻意的**,不是偷懒:

设计稿里这几个的尺寸是**互相咬合**的 —— 缩进量由嵌套层数决定(壳 → todo → 子项,
一层 11px、两层 33px)、工具行要抵掉壳自己的 `-7px` 外边距、竖线的起点按各自的 0 点
各算各的。拆成五个文件就得靠 `:global` 或者互相传 `className` 打洞,cascade 一动就错位;
仓库规约本来也要求「CSS 重构必须保住 cascade 语义」。

所以:**加行、改缩进,改的是这一个文件**。要新起一个 Module,先确认它跟这几个没有
父子选择器关系。

## 2. 样式:只认 `--chat-*`

组件 CSS Module 里**只能**消费 `--chat-*` 语义变量:

```css
/* ✅ */ .row { background: var(--chat-surface); color: var(--chat-text); }
/* ❌ */ .row { background: var(--bg-panel); }        /* 直连全局 token */
/* ❌ */ .row { background: #fafafa; }                 /* 硬编码色值 */
/* ❌ */ [data-theme="dark"] .row { … }                /* 组件内写主题分支 */
```

理由:`--chat-*` 是唯一的主题接缝。产品当前**强制亮色**(`FORCED_APP_THEME`),
暗色方案到位时只改 chat 根 Module 里那一段映射,23 个组件零改动。
组件里写死主题分支 = 把接缝散布到全域,等于没有接缝。

新增 `--chat-*` 变量必须在 chat 根 Module 的**亮暗两个作用域都定义**,即使暂时同值。

其他硬约束(继承自根 `AGENTS.md`):

- 不新增裸 primitive 类(`primary` / `ghost` / `subtle` / `icon-btn` / `sr-only`)
- 按钮用 `@open-design/components` 的 `Button`,隐藏文本用 `VisuallyHidden`
- 不往 `apps/web/src/index.css` 加选择器,它是 import-only 入口
- 不在 `styles/chat.css` 里给新组件加样式;新组件一律共置 Module

**设计稿里的虚线边框一律不实现**(D31):那些虚线是稿子用来划分区域的,不是真实 UI。看到 `border: 1px dashed` 先查它是不是稿子的分区框。

## 3. 降级是一等公民,不是异常分支

**8 家 agent 完全不吐工具事件**(qoder / cursor-agent / qwen / deepseek / grok-build /
aider / antigravity / atomcode),**opencode 直连不吐 thinking**,
**AMR 的终端输出被安全打码**。

因此每个消费 agent 事件的组件必须回答:数据缺席时长什么样?

| 缺什么 | 必须的形态 |
|---|---|
| 无 TodoWrite | 执行记录单段平铺(设计稿「一整块」) |
| 无工具事件 | 只渲染正文,不出执行记录 |
| 无 thinking | 不渲染该段,不占位 |
| 无耗时 | 不显示耗时,不显示 `--` 占位 |
| 终端输出被打码 | 命令行仍可折叠,内容区说明「输出不可见」 |

**禁止**用空字符串、`0s`、`—` 之类的假值填补缺席数据。

## 4. 新增/修改组件检查清单

- [ ] 分层判断走过 §1 四步
- [ ] CSS Module 共置,只用 `--chat-*`
- [ ] 新 `--chat-*` 在亮暗两个作用域都定义
- [ ] 复用了 `Foldable` / `StatusMark` / `ToolRow` 等已有原子,没有另造一个
- [ ] 每条缺席数据都有明确形态(§3)
- [ ] 文案走 i18n:先加 `i18n/types.ts`,再补齐全部 19 个 locale
- [ ] 测试断言行为 / ARIA / `data-testid`,**不断言 CSS 类名**
- [ ] `pnpm --filter @open-design/web typecheck` 与相关测试通过

## 5. 测试规约

- 位置 `apps/web/tests/`,不放 `src/`
- 需要 DOM 的文件首行 `// @vitest-environment jsdom`
- **不要断言 CSS 类名或具体声明**。历史 chat 测试大量绑定全局 selector
  (如 `.chat-queued-send-strip`),这类断言会让 CSS Module 化寸步难行。
  新测试一律断言可观察行为、role/ARIA、或稳定的 `data-testid`
- 纯函数(`runtime/chat/*`)必须有不启 jsdom 的单元测试

## 6. 产品行为变更

当前行为以实现、可观察结果和测试为准。历史设计稿不再作为自动恢复旧界面的依据。
新的产品裁决记录在对应 work item / PR；只把持续适用的实现约束更新到所属指南。
