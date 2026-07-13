/**
 * 从评审事件中提取结构化反馈
 */

import type { PanelEvent, CritiqueRunStatus, CritiqueRoundSummary } from '@open-design/contracts/critique';

export interface CritiqueFeedback {
  mustFixItems: string[];
  dimNotes: Array<{ role: string; round: number; dimName: string; dimScore: number; dimNote: string }>;
  bestComposite: number;
  bestRound: number;
  finalStatus: CritiqueRunStatus;
  rounds: CritiqueRoundSummary[];
}

export function extractFeedbackFromEvents(
  events: PanelEvent[],
  rounds: CritiqueRoundSummary[],
  finalStatus: CritiqueRunStatus,
): CritiqueFeedback {
  const mustFixItems: string[] = [];
  const dimNotes: CritiqueFeedback['dimNotes'] = [];

  for (const event of events) {
    if (event.type === 'panelist_must_fix') {
      mustFixItems.push(`[${event.role}] ${event.text}`);
    }
    if (event.type === 'panelist_dim') {
      dimNotes.push({
        role: event.role, round: event.round,
        dimName: event.dimName, dimScore: event.dimScore, dimNote: event.dimNote,
      });
    }
  }

  const best = rounds.length > 0
    ? rounds.reduce((a, b) => (b.composite > a.composite ? b : a), rounds[0])
    : { n: 0, composite: 0 };

  return { mustFixItems, dimNotes, bestComposite: best.composite, bestRound: best.n, finalStatus, rounds };
}

/** 将反馈格式化为 Agent 可用的修复 prompt */
export function formatFeedbackAsPrompt(feedback: CritiqueFeedback): string {
  const lines: string[] = [
    '## 设计评审团反馈',
    '',
    `综合得分: ${feedback.bestComposite.toFixed(2)}`,
    `评审轮次: ${feedback.bestRound}`,
    `最终状态: ${feedback.finalStatus}`,
    '',
  ];

  if (feedback.mustFixItems.length > 0) {
    lines.push('### 必须修复项 (Must Fix)', '');
    for (const item of feedback.mustFixItems) lines.push(`- ${item}`);
    lines.push('');
  }

  if (feedback.dimNotes.length > 0) {
    lines.push('### 各维度评审意见', '');
    const grouped = new Map<string, typeof feedback.dimNotes>();
    for (const note of feedback.dimNotes) {
      const key = `第${note.round}轮 - ${note.role}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(note);
    }
    for (const [key, notes] of grouped) {
      lines.push(`#### ${key}`);
      for (const note of notes) {
        lines.push(`- **${note.dimName}** (${note.dimScore}分): ${note.dimNote}`);
      }
      lines.push('');
    }
  }

  lines.push('---', '请根据以上反馈修复设计，确保满足所有评审团标准后重新提交。');
  return lines.join('\n');
}
