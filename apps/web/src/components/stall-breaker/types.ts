/**
 * 生成卡死熔断（stall breaker）的 chat 层 UI 契约。
 *
 * 对应 PRD《生成卡死熔断与恢复引导》的前端交互面：
 *   R2 卡顿提示（3 分钟，含操作入口）  R3 熔断终态展示
 *   R7 已完成内容保留展示              R8 恢复引导卡片（三动作）
 *   R9 二次卡死推荐降级
 *
 * 正式集成时这组 props 由 daemon 的 stall_timeout 终态事件与运行中
 * 静默计时驱动；demo 分支由 useStallBreakerDemo 驱动。
 */

import type { AgentModelOption } from '../../types';

export type StallRecoveryAction = 'switch-model' | 'new-session' | 'same-retry';

export interface StallForkNotice {
  /** 来源标识文案里展示的携带摘要，例如「2 条需求与 1 个附件」。 */
  carriedSummary: string;
  onBackToOrigin?: (() => void) | undefined;
}

export interface StallBreakerPaneProps {
  /** stalling: 静默计时中（无可见 UI）；hint: 卡顿提示；broken: 已熔断。 */
  phase: 'stalling' | 'hint' | 'broken';
  /** 距最后一次有效进展的 mm:ss 文案。 */
  silenceLabel: string;
  /** 本次生成已消耗的自动重试次数（R5，≤2）。 */
  retriesUsed: number;
  /** 同会话再次卡死（R9）：推荐项降级。 */
  secondBreak: boolean;
  /** 卡死通道的模型 id 与本会话累计卡死次数。 */
  failedModelId: string;
  failedModelStallCount: number;
  /** 换模型重试的可选模型；复用产品统一的 SearchableModelSelect 选择器，
   *  metadata（capability / cost）驱动徽标与成本行，与其他切换模型入口一致。 */
  modelOptions: AgentModelOption[];
  /** 「新开会话继续」落地后，新会话顶部的来源标识。 */
  forkNotice?: StallForkNotice | null;
  onKeepWaiting: () => void;
  onAction: (
    action: StallRecoveryAction,
    opts?: { modelId?: string; fromHint?: boolean },
  ) => void;
}
