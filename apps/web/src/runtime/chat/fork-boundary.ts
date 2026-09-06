import type { ChatMessage } from '../../types';

/**
 * 分叉边界落在**转录**里,不是落在屏幕上那一格。
 *
 * 一个 OD Next Full Plan 回合由几个物理 run 串成(request → clarification →
 * production),daemon 每个 run 落一条消息,`foldStrategyTaskTurns` 只在**渲染时**
 * 把它们拼成一条 —— 拼出来那条沿用的是**头一条**(runIndex 0)的 `id`
 * (`packages/contracts/src/sse/chat.ts` 里写死了这条边界:客户端 "folding the
 * task's messages at render time",不该重指消息)。
 *
 * 分叉不是渲染:`forkAfterMessageId` 的契约是「copy only source messages up to and
 * including this message」,按 id 在转录里切。把折叠那条的 id 直接送过去,就等于
 * 声称这条逻辑回合到 request run 为止 —— 澄清和交付两轮连同中间那条表单回答
 * 全部落在切口之后,新会话只剩第一轮。
 *
 * 所以:用户点的那一格如果属于某条逻辑任务,边界要顺着这条任务往后推到它在转录里
 * 的**最后一条**物理消息。不属于任何任务(普通单 run 回合)时边界就是它自己 ——
 * 折叠压根没发生过,`foldStrategyTaskTurns` 对这种转录原样返回。
 *
 * @returns 边界消息在 `messages` 里的下标;`clickedMessageId` 不在这份转录里时返回
 *          -1(分叉点没落库的那条老路,调用方保留原 id 走 fallback)。
 */
export function forkBoundaryMessageIndex(
  messages: readonly ChatMessage[],
  clickedMessageId: string,
): number {
  const clickedIndex = messages.findIndex((message) => message.id === clickedMessageId);
  if (clickedIndex < 0) return -1;
  const taskExecutionId = messages[clickedIndex]?.strategyTaskExecutionId;
  if (!taskExecutionId) return clickedIndex;
  // 只往后推,不往前收:边界是这一截上下文的下边界。
  let boundaryIndex = clickedIndex;
  for (let index = clickedIndex + 1; index < messages.length; index += 1) {
    if (messages[index]?.strategyTaskExecutionId === taskExecutionId) boundaryIndex = index;
  }
  return boundaryIndex;
}
