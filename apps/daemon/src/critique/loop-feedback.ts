/**
 * Loop Feedback —— 从评审团事件中提取可操作的反馈
 *
 * 将 Design Jury 的审核结果转化为 FixFunction 可消费的结构化反馈。
 */

import type { CritiqueRoundSummary } from '@open-design/contracts/critique';
import { type CritiqueFeedback } from './loop-types.js';

// Re-export for downstream use
export type { CritiqueFeedback } from './loop-types.js';

/**
 * 从评审轮次摘要中提取可操作的反馈项。
 *
 * @param _events  (保留以备未来从原始事件中提取额外上下文)
 * @param rounds   评委轮次摘要
 * @param _status  运行最终状态
 */
export function extractFeedbackFromEvents(
  _events: unknown[],
  rounds: CritiqueRoundSummary[],
  _status: string,
): CritiqueFeedback {
  const mustFixItems: string[] = [];
  const dimNotes: string[] = [];

  for (const round of rounds) {
    // 收集所有可操作的必须修复项
    for (const item of round.mustFixDetail ?? []) {
      if (typeof item === 'string' && item.trim().length > 0) {
        mustFixItems.push(item.trim());
      }
    }
    // 收集质量改进建议（非阻塞）
    for (const note of round.dimNotes ?? []) {
      if (typeof note === 'string' && note.trim().length > 0) {
        dimNotes.push(note.trim());
      }
    }
  }

  return {
    mustFixItems,
    dimNotes,
    overallStatus: _status === 'shipped' ? 'shipped' : 'below_threshold',
  };
}

/**
 * 将反馈格式化为 Agent 可直接理解的修复 prompt。
 *
 * 此 prompt 作为下一轮 spawn 的 stdout 输入，被 Agent 解析为修复指令。
 */
export function formatFeedbackForFixPrompt(feedback: CritiqueFeedback): string {
  const lines: string[] = [];

  lines.push('<!-- CRITIQUE_FIX_CONTEXT -->');
  lines.push(`## 设计评审团反馈 — 修复循环`);

  if (feedback.mustFixItems.length > 0) {
    lines.push('');
    lines.push('### 🔴 必须修复的问题');
    for (let i = 0; i < feedback.mustFixItems.length; i++) {
      lines.push(`${i + 1}. ${feedback.mustFixItems[i]}`);
    }
  }

  if (feedback.dimNotes.length > 0) {
    lines.push('');
    lines.push('### 🟡 质量改进建议');
    for (let i = 0; i < feedback.dimNotes.length; i++) {
      lines.push(`${i + 1}. ${feedback.dimNotes[i]}`);
    }
  }

  lines.push('');
  lines.push('请根据以上反馈修复设计并重新提交。');
  lines.push('<!-- /CRITIQUE_FIX_CONTEXT -->');

  return lines.join('\n');
}
