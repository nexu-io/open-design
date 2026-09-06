/**
 * 跑完之后,把壳里**连续的几段推理**收成一格可展开的「思考过程」。
 *
 * ⚠️ 这条是**用户裁决,覆盖设计稿**(2026-08-27)。
 * 设计稿组件 3 状态 3 写的是「跑完 · 收进 7·任务进度里,是几段纯文字,**不再自带折叠**」;
 * 用户要的是「thinking 完成后就变成普通工具调用的状态,可以下拉展开看思考细节」。
 * 冲突已当面对齐并留档:`specs/current/chat-panel-feedback.md` §F-11。
 *
 * 修的是哪个画面:`shell.thinking` 一旦置 false(第一段正文或第一个工具落下来),
 * 壳 body 就从 `.stream`(限高 96px 的推理窗)换成 `.stack`(高度 auto),
 * 于是刚才那十几段推理**原地全部展开** —— 用户原话「怎么一结束全部释放出来了」。
 *
 * **一直分组,思考中也分**(2026-08-27 第二次裁决)。旧版在思考期间原样返回,
 * 由 `ExecutionShell` 把 96px 流式窗套在**整个壳 body** 上 —— 壳里原有的工具行和清单
 * 被一起塞进那只窗里滚走,用户原话「这个思考中的怎么把原本的进行中卡片给顶掉了」。
 * 现在思考自己就是一格:还在写的那一格标 `live`,窗子挂在它自己身上,壳 body 不动。
 *
 * 「连续」是硬判据:中间隔了工具行就是两段推理,分别成格。合并会把两次不相干的
 * 思考拼成一段,读起来像它想了很久一件事。
 */
import type { ShellItem, ShellText, ThinkingTokens } from './contract';

/** 收拢后的一格:折叠头写「思考过程」,展开是原样的几段 */
export interface ThoughtsGroup {
  kind: 'thoughts';
  texts: string[];
  /**
   * 这一格占掉的墙上时间;拿不到就是 `null`,那一格右边什么都不显示。
   *
   * **跨段合并怎么算**:几段推理收进同一格,是因为它们之间只隔着**不落行**的事件
   * (最常见是 `TodoWrite` —— 它只改清单,不在壳里留下一行)。每一段自己记的是
   * 「它填掉的那段空白」,而相邻两段空白**共用同一个时刻端点**(那个 TodoWrite 的
   * `startedAt` 既是前一段的终点、也是后一段的起点),所以直接相加就等于
   * 「第一段开始到最后一段结束」的端到端跨度 —— 不会重复计、也不会漏掉夹在
   * 中间那一瞬。这一格在屏幕上是**一条连续的推理**,报的也就是那一条的总时长。
   *
   * 有一段算不出来(比如它前面那件事没有时刻)时整格算不出来:
   * 只把算得出的那几段加起来,得到的是一个**偏小的假数**,比不显示更糟。
   */
  elapsedMs: number | null;
  /**
   * 还在往下写的**那一段**。只有它挂 96px 限高滚动窗(D46'),
   * 别的几格都是跑完收起来的普通条目。
   *
   * ⚠️ 这个标记**只落在一格上**,不是「整张壳在思考」的同义词 ——
   * 后者会把限高窗套回壳 body,正是用户 2026-08-27 指认的那个坏画面。
   */
  live?: boolean;
  /**
   * 「它想了多少」—— **只发给 `live` 那一格**。
   *
   * 这个数是进度信号:它存在的理由是 claude 有一档只计费、不给字的推理,那一格
   * 除了它没有别的话可说。块一跑完 CLI 的计数就归零,数也不再动,那时该说话的是
   * 耗时 —— 所以跑完的几格一律不带,`ThoughtsRow` 那边也就不必去分辨新旧。
   */
  tokens?: ThinkingTokens | null;
}

export type GroupedShellItem = ShellItem | ThoughtsGroup;

/**
 * 这一条**会不会成为一格「思考」** —— 空串不成段(claude 的 thinking 全是空串)。
 *
 * 导出是**故意**的:`ExecutionShell` 要按同一条判据找出整轮头一格推理落在哪一摞里
 * (那一格不报时长,理由见它那边的 `stackOwningFirstThoughts`)。
 * 两边各写一份的话,判据一旦改动就会指到不同的那一格 —— 压错行比不压更难查。
 */
export const isThinking = (item: ShellItem): boolean =>
  item.kind === 'text' && item.thinking === true && item.text.trim().length > 0;

/**
 * @param items 壳内原始条目
 * @param live 这一摞**就是模型此刻正在写的地方**(壳里没有进行中的 todo 时是壳自己,
 *             有的话是那条 todo)。为真时结尾那一格标成 `live`;结尾不是推理就补一格
 *             空的 —— claude 的 thinking 全是空串,一段推理都落不下,但「它在想」
 *             这件事仍然要在壳里有一行(真实数据:本机 14 条 claude 共 1786 帧全空)。
 */
export function groupThinking(
  items: ShellItem[],
  live: boolean,
  /** 还在想的那一格想了多少;没有就不写(别家 agent 恒为 null) */
  tokens: ThinkingTokens | null = null,
): GroupedShellItem[] {
  const out: GroupedShellItem[] = [];
  let run: ShellText[] | null = null;
  const flush = (): void => {
    if (run && run.length) {
      out.push({
        kind: 'thoughts',
        texts: run.map((t) => t.text),
        elapsedMs: sumElapsed(run),
      });
    }
    run = null;
  };
  for (const item of items) {
    if (isThinking(item)) {
      // 空白段落不占一格,但也不该把前后两段推理**切断**,所以过滤在 isThinking 里
      (run ??= []).push(item as ShellText);
      continue;
    }
    flush();
    out.push(item);
  }
  flush();
  if (live) {
    const tail = out[out.length - 1];
    if (tail && tail.kind === 'thoughts') {
      tail.live = true;
      tail.tokens = tokens;
    } else out.push({ kind: 'thoughts', texts: [], elapsedMs: null, live: true, tokens });
  }
  return out;
}

/** 全都算得出才给数 —— 少一段就是偏小的假数(见 `ThoughtsGroup.elapsedMs`) */
function sumElapsed(parts: ShellText[]): number | null {
  let total = 0;
  for (const part of parts) {
    if (part.elapsedMs == null) return null;
    total += part.elapsedMs;
  }
  return total > 0 ? total : null;
}
