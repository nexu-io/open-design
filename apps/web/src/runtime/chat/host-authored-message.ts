import type { ChatMessage } from '../../types';

/**
 * **这条助手消息有没有过一次属于它自己的运行。**
 *
 * 流水里绝大多数助手消息背后都有一次 run。少数几条没有 —— 它们是**宿主自己写进
 * 会话的卡片**,用来把一件发生在 run 之外的事讲给用户听:
 *
 *  · 记忆卡(`ProjectView` 的 `useMemoryWrittenCard` 批次)—— 提取跑在轮次结束
 *    之后(守护进程在子进程关闭时才排队),已经没有 run 事件可挂;
 *  · 品牌浏览器协助卡(`ProjectView` 的 `brandBrowserAssist`)—— 提取被反爬墙挡住时
 *    请用户去清一下。
 *
 * 它们是**上一轮的附属组件**,不是新的一轮。凡是「这一轮跑得怎么样」的呈现
 * ——「进行中」、执行记录壳、「已完成」终态 —— 对它们都是无中生有的陈述。
 *
 * ## 判据为什么是这四样一起看
 *
 * 直觉上「没有 runId / runStatus 就不是运行」,但**那样收会误伤真运行**:
 * API / BYOK 模式下的乐观占位消息正是这个形状 ——
 * `ProjectView.tsx` 建占位时写的是 `runStatus: config.mode === 'daemon' ? 'running' : undefined`,
 * 于是那一档的真运行既没有 runId 也没有 runStatus,全靠面板级的流式信号来显示状态。
 *
 * 真正把两者分开的是**时刻**:每一条真占位都写了 `startedAt`
 * (`ProjectView.tsx`、`DesignSystemFlow.tsx`、`workspace/useConversationChat.ts` 三处),
 * 历史消息则至少带着 `endedAt`;宿主补发的卡四样一个都没有 —— 它从来没有开始过,
 * 也就无所谓结束。
 *
 * ⚠️ 这是一条**呈现层判据**。它不改变消息的落库形状,也不参与任何编排决定
 * (OPEND-2745 的裁决:打补丁,不做重构)。
 */
export function assistantMessageNeverHadARun(message: ChatMessage): boolean {
  if (message.role !== 'assistant') return false;
  return (
    message.runId === undefined
    && message.runStatus === undefined
    && message.startedAt === undefined
    && message.endedAt === undefined
  );
}

/**
 * **这条会话此刻停在哪一轮上** —— 倒着找最后一条**真的跑过一轮**的助手消息。
 *
 * 面板上一大票「只发给当前这一轮」的东西都挂在这个 id 上:下一步引导、继续未完成
 * 的任务、投稿到 Open Design、产物卡的登记、以及乐观占位那条流式兜底。它们问的
 * 都是同一个问题 ——「**哪一轮是这条会话的当前落点**」。
 *
 * ⚠️ 那个问题的答案**不等于**「流水里最后一条 assistant 消息」。宿主补发的卡
 * (记忆卡、品牌协助卡)也是 assistant 消息,但它是**上一轮的附属组件,不是新的
 * 一轮**(OPEND-2745 的裁决原话)。而记忆提取偏偏跑在轮次结束**之后**,所以它
 * 几乎总是落在刚交付的那一轮后面 —— 于是「最后一条」被它顶掉,那一轮的入口整块
 * 消失:
 *
 *  · OPEND-2764 —— PPT 交付成功、`next_steps` 三条建议也已下发,ChatPanel 一条
 *    引导都不出。用户没有任何入口接着精修刚做好的 Deck。
 *
 * 同一处缺口此前已经在别的表面上修过两次,都是把「最后一条」换成真正想问的那个
 * 问题:OPEND-2644 的问卷可否作答(换成「用户有没有从这里走过去」),OPEND-2745
 * 的要不要报运行态(换成「这条消息有没有过一次运行」)。这里是第三次,也是把判据
 * 收回到它本来的意思上。
 *
 * ⚠️ 这**不会**让入口变粘:收走它的仍然是**下一轮助手消息**,一条真的跑过的
 * 消息照旧顶掉前一条。宿主卡只是不再冒充那个「下一轮」。
 *
 * 整条会话一条真运行都没有(只有宿主卡)时返回 `undefined` —— 没有哪一轮是当前
 * 落点,本来就不该有人认领这些入口。
 */
export function lastAssistantTurnId(messages: readonly ChatMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || message.role !== 'assistant') continue;
    if (assistantMessageNeverHadARun(message)) continue;
    return message.id;
  }
  return undefined;
}

/**
 * **转录的队尾,但宿主补发的卡对它是透明的。**
 *
 * 「最后一条消息是什么」是另一个问题,和上面那个不一样:它连**用户消息**一起看。
 * 失败轮的恢复入口(〔重试〕/〔续跑〕/报错卡)问的正是这个 —— 一轮失败之后,
 * 只要用户还没往下走,那一轮就仍然是等着被推进的那一件事。
 *
 * ⚠️ 透明的只有**宿主补发的助手卡**这一类。用户自己发出的下一句照旧拦得住 ——
 * 他已经走过去了,恢复入口跟着收走;那是 OPEND-2644 判过的同一条线。
 *
 * 整条转录里除了宿主卡什么都没有时返回 `null`。
 */
export function trailingMessageIgnoringHostCards(
  messages: readonly ChatMessage[],
): ChatMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message) continue;
    if (assistantMessageNeverHadARun(message)) continue;
    return message;
  }
  return null;
}
