/**
 * 组件 · 手动上下文压缩边界行（Open Design #5991，API/BYOK 会话）。
 *
 * 一条安静的灰色边界：边界左侧的对话内容已被 daemon 压缩成 checkpoint
 * （摘要 + 工作区台账），后续回合的 transcript 只携带「checkpoint 块 + 本行
 * 之后的消息」；边界右侧继续展示压缩后发生的真实消息。
 *
 * 表现形态与 PauseLine 同族：无按钮、无卡、无第二句，句首一枚与正文同色的
 * 层叠图标，右侧一条细分隔线示意「截断」。染色刻意克制 —— 这是一条陈述
 * 「以上内容已归档为摘要」的说明，不是一条要人处理的告警。
 */
import type { ReactElement } from 'react';
import { useT } from '../../i18n';
import styles from './CompactionBoundary.module.css';

export function CompactionBoundary(): ReactElement {
  const t = useT();

  return (
    <div className={styles.line} data-testid="chat-compaction-boundary">
      <BoundaryIcon />
      {t('chat.compactBoundary')}
      <span className={styles.rule} aria-hidden />
    </div>
  );
}

/**
 * 句首那枚「层叠」符号：下层代表被归档进 checkpoint 的旧转录，上层代表继续
 * 发送的新消息。走 `currentColor`，继承这一行的 `--chat-text-muted`。
 */
function BoundaryIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2.5L21 7.2v9.6L12 21.5 3 16.8V7.2L12 2.5ZM4.8 8.55l7.2 3.7 7.2-3.7-7.2-3.7-7.2 3.7ZM5.6 10.9l5.55 2.85v5.6l-5.55-2.85v-5.6ZM12.85 13.75l5.55-2.85v5.6l-5.55 2.85v-5.6Z" />
    </svg>
  );
}
