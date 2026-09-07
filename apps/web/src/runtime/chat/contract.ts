/**
 * chat 重构 · L0 领域层契约(纯函数,无 JSX / 无 DOM)
 *
 * 这个文件是并行开发的分界线:业务组件只依赖这里的类型,不依赖彼此。
 * 改动它 = 打断并行,必须先同步全体(规格 §6)。
 *
 * 权威规格:`specs/current/chat-panel-next.md`(决策 D1–D43)
 * 架构视角:`specs/current/chat-panel-dev-design.md`
 * 参考实现:`docs/design/chat-sim/sim.js`(评审载体,15 个场景在跑)
 */
import type { MediaSurface, PersistedAgentEvent, ProjectMediaTask } from '@open-design/contracts';

export type { ToolKind } from './tool-kind';
export type { ArtifactKind, DiffStat } from './format';

import type { ToolKind } from './tool-kind';
import type { DiffStat } from './format';

/* ── 壳内的一行 ─────────────────────────────────────────────── */

/**
 * 工具调用行。
 *
 * ⚠️ 这里原来写着「没有『执行中』这一档(D3):调用跑完才落行,生图行是唯一例外」——
 * **那条已经不成立了**。D3 作废于产品 2026-09-02(OPEND-2419),现在调用发出去就落行,
 * 生图行也不再是唯一例外。判据见下面的 `pending` 字段。
 */
export interface ToolRow {
  kind: 'tool';
  id: string;
  tool: ToolKind;
  /** 原始工具名;`tool === 'other'` 时界面直接显示它(T4 的默认做法) */
  name: string;
  /** 有 description 用人话,没有回落成命令本身(S8) */
  title: string;
  /** title 是原始命令 → 界面用等宽显示 */
  rawTitle: boolean;
  file: { path: string; label: string } | null;
  /** 搜索行的「搜了什么」与「N 处」(D23) */
  pattern: string | null;
  hits: number | null;
  /** 新建 / 改写 / 删除文件的改动量;数不出来就是 null,那一行改显示耗时 */
  delta: DiffStat | null;
  /** 拿不到就是 null —— 不显示,不估算(§2.2b) */
  elapsedMs: number | null;
  /**
   * 调用发出去了、结果还没回来(OPEND-2419)。
   *
   * 词汇和 `ImageRow.pending` 是**同一个** —— 生图那条进行中路径早就在用它,
   * 两处说的是同一件事(「还有调用没回来」),不该有第二套叫法。
   *
   * ⚠️ `pending` 只说「没回来」,不说「还在跑」。轮次被取消 / 失败之后,没回来的
   * 那几行仍然是 `pending: true`(数据如实记录),但**不能再画成转圈的球** ——
   * 那是「永远停在 running」这个新 bug。画成什么由渲染层按轮次状态定,
   * 见 `ToolRow` 的 `running` 入参。
   */
  pending: boolean;
  failed: boolean;
  /** 失败原因;有原因走「· 原因」写法,没有只给「失败」按钮(S1 待设计确认) */
  failReason: string | null;
  /** 跑命令专用 */
  command: string | null;
  /** 终端输出。AMR 上被安全打码 → null(D19) */
  terminal: string | null;
}

/** thinking 落下的文字,以及 done 之前的过程叙述(D43)—— 两者同一种渲染 */
/**
 * 壳内的一段文字。
 *
 * `thinking` 标出「这段是模型在想,不是在答」—— 两者在屏幕上长得一样,但**归属不同**:
 * 整轮没发 done 时要把最后一段**回答**提到卡外(否则用户看不到答案),
 * 而 thinking 提出来就是把「想什么」当成「答什么」。踩过一次:整轮只有一句 thinking 时
 * 它被提到壳外、壳空掉后整张壳被丢,「思考中」那一格直接没了。
 */
export interface ShellText {
  kind: 'text';
  text: string;
  thinking?: boolean;
  /**
   * **推理专用**:这一段推理占掉的墙上时间。回答段永远没有这个字段。
   *
   * 为什么只能是「填空」而不是「量它自己」:thinking 事件**一个时刻都不带**
   * (`PersistedAgentEvent` 的 `{ kind: 'thinking'; text }` 里没有时刻字段,
   * daemon 那边 `thinking_delta` 的载荷就是 `{ type, delta }` 两个字段)。
   * 唯一能观测到的是它**填掉了哪一段空白** —— 上一件带时刻的事结束到下一件
   * 带时刻的事开始之间的那段。所以这里存的是那段空白的长度。
   *
   * 拿不到就是 `undefined`,界面上什么都不显示 —— 与工具行同一条纪律(§2.2b)。
   */
  elapsedMs?: number;
}

/** 「执行计划 · N 步」 */
export interface ShellPlan { kind: 'plan'; steps: string[] }

/** 清单里的一条,在壳内按出现顺序占一行 */
export interface ShellTodo { kind: 'todo'; segment: TodoSegment }

/**
 * 生图行(组件 12)。调用还没回来也要落行 —— 这条**从前是 D3 的唯一例外**,
 * D3 于 2026-09-02 作废之后已经是所有工具行的通例(见 `ToolRow.pending`);
 * 生图行特殊的只剩「格子数提前知道」:
 * 要出几张是从命令里数出来的(`media generate` 出现几次就是几张),
 * 所以在结果回来之前就知道该摆几个格子,「出一张落一张」才成立。
 *
 * 三种样子由这几个数决定(D34):
 *   还没出完(pending 或 done+failed < total)  球 + 「N/M」+ 一排大格
 *   全出完了、没失败                            收成一行 + 小缩略图条 + 耗时
 *   出完了但有失败                              仍是大格,失败的那格给「重试」,不收行
 *
 * 合并粒度是 **S19 未决项**:现在按「连续调用合并成一行」算(与模拟器一致),
 * 隔着别的工具调用就另起一行。
 */
export interface ImageRow {
  kind: 'image';
  id: string;
  /**
   * 这一批生成的到底是**哪一类**媒体(OPEND-2625)。
   *
   * 名字仍叫 `ImageRow` 是历史,行本身早就不只装图片了:同一条 `od media generate`
   * 出音频、出视频、出图,走的是同一条落行路径。缺了这一格,渲染层只剩「图片」
   * 一种可讲 —— 真机上一次 `--surface audio` 被写成
   * `Generating illustrations · 1 images`,那一格还摆了个 `<img src=….mp3>`
   * 的破图,读起来像生成失败了。
   *
   * 事实一直都在,只是没被带过来:daemon 的 `media_tasks` 记了 `surface`
   * (`routes/media.ts:1278` 逐字回传),命令行自己也带着 `--surface`
   * (`cli.ts:1838`,必填)。这里存的就是那两个证人里能拿到的那个。
   *
   * ⚠️ 不许在渲染层从文件后缀反推:进行中的格子**还没有文件**,而进行中恰恰是
   * 用户最需要知道「在生成什么」的那一档。
   */
  surface: MediaSurface;
  /** 文案由组件层按 `surface` 翻译 —— 这一层不放人话 */
  total: number;
  done: number;
  failed: number;
  /** 出好的图,按完成顺序 */
  thumbs: string[];
  /** Stable task order, so partial failures stay in their actual cells. */
  cells?: Array<{
    taskId?: string;
    status: 'pending' | 'done' | 'failed';
    path?: string;
  }>;
  /** 还有调用没回来 */
  pending: boolean;
  elapsedMs: number | null;
}

export type ShellItem = ToolRow | ShellText | ShellPlan | ShellTodo | ImageRow;

/* ── 任务分段 ───────────────────────────────────────────────── */

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'stopped';

export interface TodoSegment {
  /** content 即身份:跨轮召回、清单更新都靠它做交集判定(D17) */
  content: string;
  status: TodoStatus;
  /**
   * 来自更早的轮次、且那一轮**已经开工或已经关掉** —— 只控制划线,不参与 expandable(D25)。
   * 上一轮只是声明、一次都没开始过的(`pending`)**不算**:那是本轮头一回真要干的活。
   */
  recalled: boolean;
  /** 被重新规划作废:沿用完成态 + 划线(D14 / D16) */
  abandoned: boolean;
  /**
   * 清单里一条 in_progress 都没有时,第一条未完成的被当作进行中(D36)。
   * codex 原生清单只有做完 / 没做完两档,没有这条规则它整轮的工具落不进任何 todo。
   */
  implicit: boolean;
  items: ShellItem[];
  elapsedMs: number | null;
}

/** 本轮有没有这条 todo 的内容 —— 展开与否的唯一判据(D25 / D35) */
export function isExpandable(segment: TodoSegment): boolean {
  return segment.items.length > 0;
}

/**
 * 划线 = 「**这一条不再有效了**」。
 *
 * 产品 2026-09-03 裁决(原话):「划线应该只有那种放弃了的,或者下次召回后
 * 上一轮已完成的」。触发它的是真机现场(agent = opencode):一份**正在跑**的
 * 11 步计划整份画着删除线,连当前那颗绿球所在的行也划掉了 ——
 * 又说「正在做」又说「这是废的」,自相矛盾;而本轮真干出来的进度被线全盖住。
 * 语料与复现在 `tests/runtime/chat/w98-strike-only-what-is-dead.test.ts`。
 *
 * 于是判据从「不是本轮新开的活」收紧成「**本轮真动过的绝不划线**」:
 *   ① 被重新规划作废(`abandoned`)→ 划。这一条最硬,先判。
 *   ② 正在跑的(`in_progress`)→ **永远不划**。
 *   ③ 本轮名下有内容(`items` 非空)→ 不划。做过就是有效的,不管做完没做完。
 *   ④ 剩下的「本轮一件没干」的:召回来的旧账、或本轮开出来一次没跑就关掉的
 *      (D35),照旧划 —— 它们确实不再是活的。
 *
 * ⚠️ **这推翻了规格 `chat-panel-next.md:274-283` 那张表的两格**:
 * 「召回 · 本轮继续做的」和「召回 · 本轮继续做并做完的」原来写的是划线 ✓,
 * 现在是 ✗。也就是说「划线 + 可展开」不再是合法形态。规格待同步。
 * 别的四格(召回 · 上一轮就完成的 / 一次关掉从没进行过的 / 本轮全新的 /
 * 还没跑的 / 中断时正在跑的)结论一个都没变。
 *
 * 能不能展开仍然只看本轮有没有内容(D25),见 `isExpandable` —— 那一头没动。
 */
export function isStruck(segment: TodoSegment): boolean {
  if (segment.abandoned) return true;
  if (segment.status === 'in_progress') return false;
  if (segment.items.length > 0) return false;
  return segment.recalled || segment.status !== 'pending';
}

/* ── 执行记录(壳)───────────────────────────────────────────── */

/**
 * 只有三态。手动停止**不是第四态**,是壳上的旗标:状态词仍是「进行中」、秒数停住,
 * 「已手动停止」是下方回合状态行的词(设计稿 2626/2643 行,W4)。
 */
export type ShellStatus = 'running' | 'done' | 'failed';

/**
 * 「它想了多少」—— 还在跑的那一格推理的累计 token 估算值,以及这个数**还新不新**。
 *
 * 为什么需要它:claude 的 extended thinking 有一档只计费、不给字(真机 CLI 2.1.260:
 * 3060 个计费 token、0 个字符),那一格于是永远是一只空窗。空窗是诚实的,而 CLI
 * 一路在报想了多少 —— 这个数**恰恰在正文永远不会来的时候存在**。
 *
 * 只有 claude 的流带这种帧,别家一律 `null`,界面上什么都不写(不给零、不给占位)。
 */
export interface ThinkingTokens {
  /** 这一格推理到此刻的累计估算值。CLI 每块从头累计,换块自己归零 */
  count: number;
  /**
   * 这个数已经 `THINKING_TOKENS_STALL_MS` 没动了。
   *
   * 在纯函数层算,不在组件里 —— 判据是 `nowMs` 减去最后一次变化的到达时刻,
   * 而 `nowMs` 是全轮共用的那一个(`AssistantMessage` 的 `useTickingNow`)。
   * 放这里也是为了这一条能脱离 React 测。
   */
  stale: boolean;
}

export interface ExecutionShell {
  kind: 'shell';
  id: string;
  status: ShellStatus;
  stopped: boolean;
  /**
   * 收到过 thinking 且还没开口 / 动手 —— 壳头从「进行中」换成「思考中」(W11)。
   * 必须由事件驱动:claude 的 thinking_delta 全是空串,靠文字判断永远等不到(S21)。
   */
  thinking: boolean;
  /**
   * 还在跑的那一格推理想了多少(见 `ThinkingTokens`)。
   *
   * **只描述正在跑的那一块。**一开口 / 一动手就跟着 `thinking` 一起清空:那时 CLI
   * 的计数也已经归零,留着上一块的数会挂在下一格上。跑完的推理不带这个数 ——
   * 它是进度信号,落定之后该说话的是耗时。
   *
   * 可选,和 `ShellText.elapsedMs` / `ThoughtsGroup.live` 同一条写法:**缺席 = null
   * = 这条 agent 根本不报这件事**,三者在界面上是同一个结果(什么都不写)。
   * 只有 claude 的流带这种帧;`makeShell` 在真实路径上一律显式给 `null`,
   * 所以「缺席」实际只出现在手搭夹具里。
   */
  thinkingTokens?: ThinkingTokens | null;
  elapsedMs: number | null;
  /**
   * 壳里**最后一件事**之后过去了多久(还在跑时才有值,结束了就是 `null`)。
   *
   * S12「等太久没动静」是 P1(18,891 次/月、6,372 台),而稿子里等待期间**一句回音都没有**
   * (`chat-panel-edge-audit.md:555` 把它记成最大的一块缺口)。这里给的是时长,
   * 拿它做什么由消费方决定。
   *
   * 放在纯函数层而不是组件里起计时器:秒数从 `nowMs` 推,后台标签页 rAF 被节流也不会
   * 把它带偏,而且这一条能脱离 React 测。
   *
   * **2026-08-27 起暂时没有人读它。** 原来的消费方是壳头那句「上游响应慢，已等 N 秒」,
   * 产品把那句文案撤了(裁决原文在 `components/chat/ExecutionShell.tsx` 的 `head` 里),
   * 但**明确要求探测留着**:「后续可能会用到,只不过用别的展现形式」。
   * 所以这个字段照旧算、照旧挂在每张运行中的壳上,等下一种展现形式来接。
   * 别因为「没人用」就删 —— 钉子在 `tests/components/chat/s12-copy-revert.test.tsx`。
   */
  quietMs: number | null;
  items: ShellItem[];
  /** 这张壳知道的全部 todo(用于「执行计划 · N 步」与进度) */
  segments: TodoSegment[];
}

/** 壳【外】的普通文本 = 这一轮的结论(D43) */
export interface ProseBlock { kind: 'prose'; text: string }

export type TurnBlock = ExecutionShell | ProseBlock;

/* ── 入口 ───────────────────────────────────────────────────── */

export interface BuildTurnInput {
  events: PersistedAgentEvent[];
  /** Media tasks already scoped to this message's run, oldest first. */
  mediaTasks?: ProjectMediaTask[];
  /** run 终止态;终止即收起,不依赖 agent 发 done(D18) */
  runStatus?: 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled';
  /** 上一轮的清单,用于召回判定(D17) */
  previousTodos?: Pick<TodoSegment, 'content' | 'status'>[];
  /** 壳头「进行中 · 31s」的当前时刻;不传则运行中不显示秒数 */
  nowMs?: number;
  /**
   * 这一轮是什么时候开始的。**事件推不出时刻时的那个起点** ——
   * 卡在首个 token 的那种(每月 5,547 次)事件流里一个带时刻的事都没有,
   * 没有它就算不出「等了多久」,而那恰恰是最需要说一句话的时刻(S12)。
   *
   * 同一个起点也是壳头耗时的**兜底**(见 `build-turn-blocks` 的 `turnElapsed`):
   * 事件全都不带时刻时,这一轮自己的起止就是唯一还说得出口的跨度。
   */
  startedAtMs?: number;
  /**
   * **最后一条事件是什么时候到的** —— 客户端自己观察到的到达时刻。
   *
   * S12(「等太久没动静」)要回答的是「最近有没有东西落下来」,而事件自带的时刻
   * 大部分 agent 根本不填:真机 run `ab4779f8` 里 119 条事件只有 12 条带时刻,
   * 其余 107 条是 claude 的 thinking / tool_input 增量,一条时刻都没有。
   * 于是模型一直在吐字,界面却报「上游响应慢,已等 86 秒」——
   * 而那个 86 正好等于整轮耗时,因为静默起点只能退回轮次开头。
   *
   * 到达时刻是**传输事实**,客户端一定知道,不依赖任何 agent 填字段。
   * 带时刻的事件仍然优先(更准),这一个只在它更晚时接手。
   */
  lastEventAtMs?: number;
  /**
   * 这一轮是什么时候结束的(消息落库的 `endedAt`)。
   *
   * 只给壳头耗时的兜底用:**事件算不出跨度**时,拿轮次自己的起止当终点。
   * 运行中不看它 —— 那时终点是 `nowMs`,秒表要一直走。
   */
  endedAtMs?: number;
}
