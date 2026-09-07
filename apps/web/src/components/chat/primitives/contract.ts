/**
 * chat 重构 · L1 原子层契约(只吃 props,不碰数据层)
 *
 * 与 runtime/chat/contract.ts 一起构成并行开发的分界线。
 * 24 个业务组件只依赖这两个文件,彼此零依赖。
 *
 * 样式规约:所有原子只消费 --chat-* 语义变量,
 * 不直连全局 token、不写 [data-theme] 分支。见 components/chat/AGENTS.md
 */
import type { ReactNode } from 'react';
import type { DiffStat, ToolKind } from '../../../runtime/chat/contract';

/* ── Foldable ───────────────────────────────────────────────
 * 复用密度最高的原子:横跨 7 个业务组件。
 * 执行记录本身就是 Foldable 套 Foldable(壳 → todo 抽屉)。
 */
export interface FoldableProps {
  /** 标题行内容;整行是热区,不只是箭头 */
  summary: ReactNode;
  /** flat = 无外框(壳子层);boxed = 有框(抽屉层) */
  variant?: 'flat' | 'boxed';
  /**
   * 右侧那个等宽槽,如 `18.2s`。
   *
   * **不只是字符串**:思考行把 token 读数放在同一个槽里,而那个数要自己数上去
   * (`CountingNumber`,用户 2026-09-04「太生硬了」),所以这里收 `ReactNode`。
   * 传字符串的调用点行为一个字没变;空字符串仍然**占住槽**(见 `Foldable` 里
   * `!= null` 那一条),`undefined` 仍然是「连槽都没有」。
   */
  elapsed?: ReactNode;
  defaultOpen?: boolean;
  /**
   * 折叠态跟着**外面那件事的生命周期**走(可选接入,不传 = 行为和从前完全一样)。
   *
   * `defaultOpen` 只在挂载那一帧看一眼;这个值**每次变都跟**,直到用户自己动过为止:
   *  · 自动展开(因为在跑)→ 跑完:自动收起
   *  · 用户手动展开过      → 跑完:保持展开(不许替他收)
   *  · 用户手动收起过      → 后续生命周期变化:保持收起(不许替他开)
   *
   * 谁该接:**状态会翻面、而 key 又不变**的那种行(todo 抽屉)。
   * 「失败默认展开」那类不是生命周期,是终局判词,继续用 `defaultOpen`。
   *
   * 和 `open` 互斥:传了 `open` 就是受控,折叠态在调用方手上,这个值不参与。
   */
  lifecycleOpen?: boolean;
  /** 受控;不传则内部自管 */
  open?: boolean;
  onToggle?: (open: boolean) => void;
  /** false 时整行不可点(跨轮召回的 todo) */
  expandable?: boolean;
  /**
   * 内容区限高 + 正常滚动条(展开的「思考过程」/ 终端 / 队列)。
   *
   * 高度不写在这里 —— 交付稿把它放在 CSS 上:
   * `.fold .body.mod-scroll { max-height: 96px; overflow-y: auto }`(第 1252 行),
   * 我们对应的是 `record.module.css` 的 `.scroll`。这个旗标只回答「要不要限高」。
   *
   * ⚠️ 和 `stream` 是**两回事**:`stream` 是思考**中**那只窗(`height` 固定死、
   * 上下渐隐遮罩、自己往上走,用户不主动滚);`scroll` 是用户**专程点开来读**的东西,
   * 所以不遮罩、不自动走,短内容时完全不限高。
   *
   * (原来是 `{ maxHeight: number; stickToBottom?: boolean }`,全仓零消费方 ——
   * 高度改由 CSS 出,`stickToBottom` 没有任何实现,一并收掉。)
   */
  scroll?: boolean;
  /**
   * 历史重内容可延迟到首次展开再挂 DOM。首次打开后保持挂载，收起动画、滚动位置和
   * 子组件状态都不会因再次折叠而丢失；defaultOpen / 受控 open 首帧仍立即挂载。
   */
  deferBody?: boolean;
  children?: ReactNode;
}

/* ── StatusMark ─────────────────────────────────────────────
 * 只标「单条记录成没成」,不承载整轮状态
 */
export type MarkStatus = 'ok' | 'fail' | 'running' | 'pending' | 'stopped' | 'skip';
export interface StatusMarkProps {
  status: MarkStatus;
  /** 计划步骤用序号代替图标 */
  index?: number;
}

/* ── ToolRow ────────────────────────────────────────────────
 * 执行记录里的叶子。标题优先用 agent 给的 description(claude 有、codex 没有),
 * 没有时回落到命令本身;图标一律由 toolKind 嗅探决定。
 */
export interface ToolRowProps {
  kind: ToolKind;
  /** 人话标题,如「读取种子模板」 */
  title: string;
  file?: { path: string; label: string };
  delta?: DiffStat;
  elapsed?: string;
  failed?: boolean;
  /** 有原因写原因,无则仅「失败」 */
  failReason?: string;
  /** 跑命令:终端输出作为可折叠内容。undefined = 不可展开(如 AMR 打码) */
  terminal?: string;
  onOpenFile?: (path: string) => void;
}

/* ── SayText ────────────────────────────────────────────────
 * 壳【内】的文字:thinking 落下的段落、todo_abandon 的 reason。
 * 壳【外】的普通文本不走这个组件,由消息层渲染。
 *
 * **壳内壳外都走 markdown**(用户裁决 2026-09-03:「都要 markdown 啊」)。
 * 原来这里写的是「壳内是纯文字」,那条已作废 —— 裸的 `**` / 反引号 / `##`
 * 显示在屏幕上是 bug,不是设计。
 */
export interface SayTextProps {
  text: string;
}
/* `streaming` 已删(W2):8/20 21:02 版设计稿把光标 `.caret` 整个去掉了,
   流式期间没有任何视觉标记;逐字化开在消息层做(W9)。 */

/* ── FileButton ─────────────────────────────────────────────
 * 文件名做成可点按钮。主名省略、后缀永远可见 —— 省略要在 JS 里量,
 * CSS 的 text-overflow 关不掉收缩项里的那点差额(稿子原话)。
 *
 * **`onOpen` 是「这个名字打不打得开」的唯一开关**:不传就退回纯文本
 * (不是一颗点了没反应的按钮)。谁能打开由 `runtime/chat/record-file-open.ts`
 * 判 —— 读取一律不做链接,写 / 改要拿得到「路径属于当前项目」的正面证据。
 */
export interface FileButtonProps {
  path: string;
  label: string;
  /** 不传 = 打不开 = 不渲染成按钮 */
  onOpen?: (path: string) => void;
  /** 是否按文件名规则省略(保后缀、中间省略)。命令 / 模式串**不要**开 */
  elide?: boolean;
}

/* ── ThumbPlaceholder ───────────────────────────────────────
 * 缩略图占位:1:1,**一块纯灰,不画界面细节**(新稿 951–956 行原话)。
 * 「画版式骨架」是旧稿残留的说法,已作废(W5)。
 */
export interface ThumbPlaceholderProps {
  ratio?: '1:1' | '16:9';
  src?: string;
  alt?: string;
  /** 生图部分失败:该格留空 + 单独重试 */
  failed?: boolean;
  onRetry?: () => void;
}
