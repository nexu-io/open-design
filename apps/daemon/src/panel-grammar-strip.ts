/**
 * 评审剧场(Critique Theater)通信语法的**兜底剥离**。
 *
 * 为什么需要它:评审剧场已经在总闸上关掉了(`critique/rollout.ts`),而且它跑起来时
 * 子进程 stdout 会被整个改道给编排器 —— 按结构说,这套语法到不了聊天正文。
 * 但用户在真实客户端里**连着撞到四次** `<CRITIQUE_RUN>` / `<PANELIST role="Critic" score="9.0">`
 * 原样打在回答里。最可能的路径是:某一轮漏出来之后,它进了对话历史,
 * 模型看见自己上一轮的输出就跟着模仿 —— 一旦开始就会自我延续。
 *
 * 所以不去赌「注入源已经堵住」:凡是这套语法,一律不进正文。
 *
 * 两条硬要求(都来自用户):
 *  1. **不能闪**:标记被 SSE 切成两半时,半截字符一个都不许出现在屏幕上;
 *  2. **不吞用户的字**:攒着的半截如果最终不是标记,`flush()` 要原样吐回去。
 */

import { CRITIQUE_GRAMMAR_TAGS, critiqueGrammarTagPattern } from '@open-design/contracts';

/*
 * 语法本身住在 `@open-design/contracts`(`critique.ts`)—— 那是**唯一出处**。
 * 这个文件只负责流式那一半:半截标记的缓冲与吐回。
 * web 侧用同一份语法剥**历史**(已经落库的旧对话,这道来不及了)。
 */
const ALL_TAGS = CRITIQUE_GRAMMAR_TAGS;

/**
 * 一条完整标记。只喂给 `String.replace` —— 全局正则走完 `replace` 会自己把
 * `lastIndex` 归零,所以模块级复用一个实例是安全的;换成 `test()` / `exec()`
 * 就必须改成每次现造。
 */
const TAG_RE = critiqueGrammarTagPattern();

/**
 * 攒着的半截最多留这么长 —— 再长就放行。
 *
 * 这是**故意的 fail-open**:宁可漏一个畸形到 256 字符还没写完的标记,
 * 也绝不允许把用户的正文永远吞在缓冲里。真实标记远够用 ——
 * 现场见过最长的是 `<ROUND_END decision="…" composite="…" openMustFix="…"/>`(61)。
 */
const MAX_HOLD = 256;

/** 名字写完之后、`>` 之前的分隔符。`>` 在上面已经先行返回,不必列进来。 */
const NAME_DELIMITER = /[\s/]/;

/**
 * 尾巴有没有可能是**还没写完**的标记 —— 要扣住多少个字符。
 *
 * 分三段,少一段就漏:
 *
 *  1. **`<` 还光着**:下一帧可能就是标签名,扣住。
 *  2. **正在写名字**(还没出现分隔符):名字仍是某个标记的**前缀**才扣。
 *     `<PANE` 扣;`<div` 立刻放行 —— 不必要的憋住也是一种闪。
 *  3. **名字写完、正在写属性**(已经出现分隔符):名字必须**正好**是一个标记才扣。
 *     `<PANELIST role=` 扣到 `>`;`<PANELISTS role=` 放行。
 *
 * ——第 3 段是 W17(2026-09-02,第五次复发)补上的。原来的实现把 `<` 之后的
 * **全部**字符(含属性)当成"名字"去比前缀,于是 `<PANELIST role` 一算
 * 「没有任何标记以 `PANELIST ROLE` 开头」就撒手,半截标签直接进正文,而
 * `TAG_RE` 又匹配不上不完整的标签 —— 两头都不管。
 *
 * 为什么之前四次都没照出来:所有测试都只把标记切在**标签名**里(`<PANE` / `<MUST`),
 * 而 codex 的出厂传输是 app-server(逐 token 推 `item/agentMessage/delta`),
 * 边界落在属性中间是常态。判据是——漏出来的**全是带属性的开标签,
 * 一个 `</PANELIST>` 都没有**:闭合标签没属性,切在名字里能被第 2 段扣住。
 */
function pendingTail(text: string): number {
  const lt = text.lastIndexOf('<');
  if (lt === -1) return 0;
  const tail = text.slice(lt);
  if (tail.length > MAX_HOLD) return 0;
  // 已经闭合了就不是半截 —— 完整标记交给 TAG_RE
  if (tail.includes('>')) return 0;
  const rest = tail.replace(/^<\/?/, '');
  // (1) 空的 `<` 也要扣住:下一帧可能就是标签名
  if (rest.length === 0) return tail.length;
  const delimiter = rest.search(NAME_DELIMITER);
  // (2) 名字还没写完:前缀匹配
  if (delimiter === -1) {
    return ALL_TAGS.some((t) => t.startsWith(rest.toUpperCase())) ? tail.length : 0;
  }
  // (3) 已经在写属性:名字必须正好是一个标记
  return ALL_TAGS.includes(rest.slice(0, delimiter).toUpperCase()) ? tail.length : 0;
}

export interface PanelGrammarStripper {
  strip(delta: string): string;
  /** 流结束时把攒着的半截原样吐回去 —— 它终究不是标记 */
  flush(): string;
}

/**
 * 剥离**吃掉了整帧**吗 —— 也就是这一帧该不该整条扔掉。
 *
 * 判据是「**上游到底送没送字符**」,不是「剥完还剩没剩」。两者不是一回事,
 * 而分不开它们正是 W102 那条回归(2026-09-03)的全部内容:
 *
 *  · **原本就空**(`rawDelta === ''`)→ `false`,**照发**。
 *    claude 的扩展思考出厂就是这个形态:真 CLI 实测 opus-5 与 sonnet-4-5 各一轮,
 *    `content_block_delta` 的 delta 全是 `{"type":"thinking_delta","thinking":""}`。
 *    这种帧一个像素都不画,但它是两件事的**唯一**来源 ——
 *    壳头「思考中」(规格 W11:`thinking_delta` 到达**哪怕 delta 为空**就进入思考中)
 *    与传输层心跳(web 每收到一条真运行帧就 `markUpstreamActivity`)。
 *    真机录制 `7ed15c2f`(1150 秒)里 414/414 条思考帧都是空串;把它们扔掉,
 *    1357 帧只剩 943 帧,最长空档从 73.6 秒变成 300.6 秒。
 *
 *  · **送了字符、剥完一个不剩**(`rawDelta` 非空而 `visible` 为空)→ `true`,**扔掉**。
 *    整片都是评审剧场协议标记(或攒在缓冲里的半截标记),发出去只会让思考区
 *    多出一格空的「Thoughts」。这正是 ba3e64ea69 要治的那件事,不能回退。
 *
 * 空 delta 不成段这件事由客户端管(`build-turn-blocks.ts` 的
 * `if (!text.trim() && !cont) continue;`),所以「照发」不会画出空段落。
 */
export function strippingConsumedTheWholeFrame(rawDelta: string, visible: string): boolean {
  return rawDelta.length > 0 && visible.length === 0;
}

export function createPanelGrammarStripper(): PanelGrammarStripper {
  let held = '';
  return {
    strip(delta: string): string {
      const buffer = held + String(delta ?? '');
      const hold = pendingTail(buffer);
      const usable = hold > 0 ? buffer.slice(0, buffer.length - hold) : buffer;
      held = hold > 0 ? buffer.slice(buffer.length - hold) : '';
      return usable.replace(TAG_RE, '');
    },
    flush(): string {
      const rest = held;
      held = '';
      return rest;
    },
  };
}
