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
 * ⚠️ 这是一条**呈现层判据**,只回答「要不要画运行态」。它不改变消息的落库形状,
 * 也不参与任何编排决定(OPEND-2745 的裁决:打补丁,不做重构)。
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
