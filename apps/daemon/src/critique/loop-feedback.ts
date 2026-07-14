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
  /** Outer Loop Memory: 来自历史循环的经验教训（供 Agent 参考） */
  historicalLessons?: string | null;
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

  const best = rounds.reduce<CritiqueRoundSummary | { n: number; composite: number }>(
    (current, round) => (round.composite > current.composite ? round : current),
    { n: 0, composite: 0 },
  );

  return { mustFixItems, dimNotes, bestComposite: best.composite, bestRound: best.n, finalStatus, rounds };
}

/** 将反馈格式化为 Agent 可用的修复 prompt */
export function formatFeedbackAsPrompt(feedback: CritiqueFeedback): string {
  const lines: string[] = [];

  // --- Outer Loop Memory: 历史经验先置 ---
  if (feedback.historicalLessons) {
    lines.push(feedback.historicalLessons);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## 当前设计的评审反馈');
    lines.push('');
  } else {
    lines.push('## 设计评审团反馈');
    lines.push('');
  }

  lines.push(`综合得分: ${feedback.bestComposite.toFixed(2)}`);
  lines.push(`评审轮次: ${feedback.bestRound}`);
  lines.push(`最终状态: ${feedback.finalStatus}`);
  lines.push('');

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
