/**
 * 「思考中」右边那个槽:此刻该写 token 数,还是写秒数。
 *
 * 这一层只回答**形态**这一个问题,不碰数字本身。两件事必须分开:
 * 数字跟着流平滑地涨(那才是「实时」),而「现在写哪一个」这个决定必须**钝**。
 *
 * ── 为什么单门槛不行(用户 2026-09-04 划的红线)────────────────────────
 *
 * 原来的判据是一句 `now - at > 8s`。它在 claude 那种密流上确实几乎不翻面
 * (帧距 p50 1.4s、最大观测 4.88s),但换到 codex 就整轮抖:codex 的进度读数
 * 走 `thread/tokenUsage/updated`,一条真实录制(run 7136ca59,codex-cli
 * 0.153.0)里 24 条读数的到达间隔是
 *
 *   16.1, 12.2, 6.6, 6.6, 9.4, 13.8, 14.1, 119.0, 12.0, 252.1, 14.3, 12.8,
 *   12.4, 46.2, 14.3, 7.0, 6.1, 55.7, 25.0, 17.5, 10.7, 15.3, 16.4  (秒)
 *
 * —— 中位数就 ~14s,**每一个**都越过 8s。单门槛下这一轮要翻 38 次面:每条读数
 * 到了写 8 秒 token,然后翻成秒数,下一条到了再翻回来。用户的原话是
 * 「不能高频的来回闪动,切记,这样会让人感觉到软件疯了」。
 *
 * ── 迟滞(两个门槛,不是一个)────────────────────────────────────────
 *
 * 进和出用不同的判据,这是「只有在关键阈值的时候才会来回做切换」的做法:
 *
 *   · 进(token → 秒数):这个数**站着不动**超过 `THINKING_TOKENS_STALL_ENTER_MS`。
 *   · 出(秒数 → token):不是「又来了一条」就翻回去 —— 长停之后孤零零来一条、
 *     然后又停很久,翻回去再翻回来就是两次白闪。要求流**确实活过来了**:
 *     这一条之后 `THINKING_TOKENS_STREAM_ALIVE_MS` 之内还有下一条。
 *
 * **产品 2026-09-04 拍板:两个门槛统一取 20s。** 原话「统一吧?都 20s?」
 * 「20s 即使来回翻,也还行了,不算太频繁了」。量出来的起点曾是 ENTER=45s /
 * ALIVE=20s(同一段语料下翻 8 次,而不是单门限 8s 的 38 次),产品看过这组数
 * 之后仍选择统一 —— 理由是 20s 这一档的翻面频率已经在可接受范围内,而两个
 * runtime 各带一套阈值不值得。判据钉在 `tests/runtime/chat/thinking-slot.test.ts`。
 *
 * 两个常量**故意保留成两个**,而不是合成一个:形状留着,以后要按 runtime 拆开
 * 或重新拉开迟滞带,改两个数即可,不用重做这个函数。现在它们相等,等价于单门限。
 *
 * ── 这个函数为什么是纯函数、吃一整串到达时刻 ─────────────────────────
 *
 * 迟滞天生是有状态的,但 `build-turn-blocks` 是每帧从事件流重算的纯函数,
 * 没有地方挂上一帧的形态。把整串到达时刻交给它、在这里把状态**折**出来,
 * 结果就只依赖输入,同一串事件永远给同一个答案 —— 既拿到了迟滞,又没有
 * 在渲染层引入一个会随重挂载丢失的隐藏状态。
 *
 * claude 与 codex 共用这一条:两边都只是「一串读数到达时刻」,
 * 差别只在密度,而密度正是这个函数要吸收的东西。
 */

/**
 * 数字站着不动多久,才把槽让给秒数。
 *
 * 产品 2026-09-04 定为 20s(见文件头)。它在真实 codex 语料的到达间隔中位数
 * (~14s)之上,所以正常节奏翻不动;但低于最大正常间隔(~25s),所以偏慢的那
 * 几拍会翻 —— 产品明确接受了这个代价。也远在壳那两个 60s 报警门槛
 * (`SLOW_UPSTREAM_AFTER_MS` / `WAITING_FIRST_OUTPUT_AFTER_MS`)之前 ——
 * 那两个说的是「等太久了」,这一个只是把槽还给计时,两件事不共用一个数。
 *
 * claude 也走这个数(`THINKING_TOKENS_STALL_MS` 是它的别名)。claude 的帧
 * 密得多(p50 1.4s、单轮最大 4.88s),20s 对它是**从不触发**的门槛,所以
 * 统一之后 claude 侧的翻面次数仍然是 0。
 */
export const THINKING_TOKENS_STALL_ENTER_MS = 20_000;

/**
 * 停过之后,要多密的两条读数才算「流活过来了」,可以把槽还给 token。
 *
 * 产品 2026-09-04 定为 20s(见文件头),与 ENTER 相等,迟滞带宽为零。
 *
 * 相等**不会**让它回不去:ENTER 判的是「距上一条读数已经多久」,ALIVE 判的是
 * 「接下来两条读数之间有多密」,两者是互补条件 —— 一个 ≤20s 的间隔既结束停顿
 * 又满足复活判据。真实语料里中位数 ~14s、大多数 ≤17s,复活是常态。
 */
export const THINKING_TOKENS_STREAM_ALIVE_MS = 20_000;

export type ThinkingSlotMode = 'tokens' | 'elapsed';

/**
 * 把一串读数到达时刻折成此刻的形态。
 *
 * `arrivalsMs` 必须升序,且只放**数字真的变了**的那些时刻 —— 重复同一个数
 * 不算进度,不该重置「站了多久」这只表(daemon 侧的 codex 归一化已经把重复值
 * 压掉了,见 `emitThinkingTokens`)。
 *
 * 一条读数都没有,或者拿不到 `nowMs`,一律回 `'tokens'`:
 * 「不知道多久没变」和「很久没变」是两回事,把前者当后者会在一条完全健康的流上
 * 把 token 换成秒数。产品「第一段 thinking 永远显示 token」也落在这一条上。
 */
export function thinkingSlotMode(
  arrivalsMs: readonly number[],
  nowMs: number | null,
  options?: { enterMs?: number; aliveMs?: number },
): ThinkingSlotMode {
  const enterMs = options?.enterMs ?? THINKING_TOKENS_STALL_ENTER_MS;
  const aliveMs = options?.aliveMs ?? THINKING_TOKENS_STREAM_ALIVE_MS;
  if (arrivalsMs.length === 0 || nowMs == null) return 'tokens';

  let mode: ThinkingSlotMode = 'tokens';
  for (let i = 1; i < arrivalsMs.length; i += 1) {
    const previous = arrivalsMs[i - 1] as number;
    const current = arrivalsMs[i] as number;
    // 进:这一条读数**之前**站了多久。
    if (mode === 'tokens' && current - previous > enterMs) mode = 'elapsed';
    // 出:这一条读数**之后**流还跟不跟得上。孤零零一条不算数 —— 长停、来一条、
    // 又长停,翻过去再翻回来就是两次白闪。
    //
    // 判据要往后看一条,而这一条在 `arrivalsMs` 里出现,本身就意味着它已经到了
    // (调用方只传此刻可见的到达时刻),所以这里没有偷看未来:翻回 token 这件事
    // 天然发生在第二条读数落地的那一刻,不是第一条。
    if (mode === 'elapsed') {
      const next = arrivalsMs[i + 1];
      if (next != null && next - current <= aliveMs) mode = 'tokens';
    }
  }

  // 最后一条读数到此刻之间,同一条进的判据;出的那条要等下一条读数,这里没有。
  const last = arrivalsMs[arrivalsMs.length - 1] as number;
  if (mode === 'tokens' && nowMs - last > enterMs) mode = 'elapsed';
  return mode;
}

/** `ExecutionShell.thinkingTokens.stale` 的取值 —— 槽让给秒数时为真。 */
export function thinkingTokenReadingIsStale(
  arrivalsMs: readonly number[],
  nowMs: number | null,
  options?: { enterMs?: number; aliveMs?: number },
): boolean {
  return thinkingSlotMode(arrivalsMs, nowMs, options) === 'elapsed';
}

/**
 * 一整轮里形态翻了几次面。
 *
 * 只在测试里用:闪动是**过程**属性,只断言终态的用例看不见它
 * (终态永远是对的 —— 错的是中间翻了 38 次)。
 */
export function countThinkingSlotFlips(
  arrivalsMs: readonly number[],
  clockMs: readonly number[],
  options?: { enterMs?: number; aliveMs?: number },
): number {
  let flips = 0;
  let previous: ThinkingSlotMode | null = null;
  for (const now of clockMs) {
    const visible = arrivalsMs.filter((at) => at <= now);
    const mode = thinkingSlotMode(visible, now, options);
    if (previous != null && mode !== previous) flips += 1;
    previous = mode;
  }
  return flips;
}
