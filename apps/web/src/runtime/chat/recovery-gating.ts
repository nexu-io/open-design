/**
 * 报错卡上那一排恢复动作(重试 / 续跑 / 切到 Cloud)**这一刻能不能动**,
 * 以及动不了的时候该说哪句话。
 *
 * ## 为什么要有这个函数
 *
 * 宿主(`ProjectView`)本来就有一个 `currentConversationActionDisabled` 布尔:
 * 六个条件或起来,为真就让 `handleRetry` / `handleResumeRun` /
 * `handleSwitchToAmrAndRetry` **静默 `return`**。而按钮那一侧从来没接过这个
 * 布尔 —— 于是屏幕上是一颗永远可点的〔重试〕,点下去什么都不发生,埋点却已经
 * 上报了一次「用户点了重试」(OPEND-2821)。
 *
 * 修法不是放宽那六个条件 —— 它们各有理由(只读项目、算不出付费主体、会话正忙)。
 * 修法是**把这个布尔换成一个能说出原因的值**,让按钮的可用态和卡面上的说明
 * 都从同一个判据出来。
 *
 * ## 不变量
 *
 * `resolveRecoveryActionBlockReason(...) !== null` 与原来那个布尔
 * **逐条等价**:原式是
 *
 *   busy(loading || streaming || hasActiveRun)
 *   || readOnly || !billable || loading || messagesUnavailable || awaitingAttach
 *
 * 而 `awaitingAttach ⊂ hasActiveRun`、`loading ⊂ busy`,所以并集就是这里的
 * 四档。这个函数只负责**给同一个集合分档**,不增删任何一种被挡住的情形。
 */

/**
 * 挡住恢复动作的那一档。四档是原来六个条件的一个划分,不是新的门。
 *
 * 优先级从具体到笼统:身份 → 转录 → 计费主体 → 忙。同一时刻可能有多档成立,
 * 取第一档,好让说明稳定(不会因为一次无关的状态抖动换一句话)。
 */
export type RecoveryActionBlockReason =
  /** 只读访客(共享项目 / 首次物化未完成):这个项目里发不出任何一轮。 */
  | 'read-only'
  /** 这条会话的消息没加载成功:没有可信的转录,重发等于对着空气重放。 */
  | 'messages-unavailable'
  /** 还没算出这个项目由哪个工作区付费:起 run 会打到错的钱包上。 */
  | 'billing-unresolved'
  /** 会话正忙:还在加载 / 正在流式 / 还挂着没落终态的运行。 */
  | 'conversation-busy';

export interface RecoveryActionGateInput {
  /** `projectMutationReadOnly` */
  readOnly: boolean;
  /** `failedMessagesConversationId === activeConversationId` */
  messagesUnavailable: boolean;
  /** `projectRunHasBillableAmrPrincipal` */
  billingPrincipalResolved: boolean;
  /** `currentConversationBusy || currentConversationAwaitingActiveRunAttach` */
  conversationBusy: boolean;
}

export function resolveRecoveryActionBlockReason(
  input: RecoveryActionGateInput,
): RecoveryActionBlockReason | null {
  if (input.readOnly) return 'read-only';
  if (input.messagesUnavailable) return 'messages-unavailable';
  if (!input.billingPrincipalResolved) return 'billing-unresolved';
  if (input.conversationBusy) return 'conversation-busy';
  return null;
}

/**
 * 每一档对应的 i18n key。挡住的时候卡面上要出现的就是这一句 ——
 * 单里写死了「不能重试时说明阻断原因,不应静默无响应」。
 */
export function recoveryActionBlockMessageKey(
  reason: RecoveryActionBlockReason,
):
  | 'chat.runError.actionBlocked.readOnly'
  | 'chat.runError.actionBlocked.messagesUnavailable'
  | 'chat.runError.actionBlocked.billing'
  | 'chat.runError.actionBlocked.busy' {
  switch (reason) {
    case 'read-only':
      return 'chat.runError.actionBlocked.readOnly';
    case 'messages-unavailable':
      return 'chat.runError.actionBlocked.messagesUnavailable';
    case 'billing-unresolved':
      return 'chat.runError.actionBlocked.billing';
    case 'conversation-busy':
      return 'chat.runError.actionBlocked.busy';
  }
}
