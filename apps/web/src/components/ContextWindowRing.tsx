import { useMemo, type ReactElement } from 'react';
import type { ChatMessage } from '@open-design/contracts';
import { useT } from '../i18n';
import {
  AUTO_COMPACTION_DEFAULT_RATIO,
  estimateHistoryTokens,
  resolveModelContextWindowTokens,
} from '../state/compaction-auto';
import styles from './ContextWindowRing.module.css';

interface Props {
  /** Active agent id (daemon agent or api-protocol agent). */
  agentId: string;
  /** Effective model id / label for the active agent. */
  model?: string | null;
  /** Visible conversation transcript used for the token estimate. */
  history: ReadonlyArray<ChatMessage>;
}

const RING_SIZE = 22;
const RING_STROKE = 2.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    return `${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    const thousands = tokens / 1_000;
    return `${thousands % 1 === 0 ? thousands.toFixed(0) : thousands.toFixed(1)}K`;
  }
  return String(tokens);
}

/**
 * 上下文窗口环形指示（对话输入区右下角，agent 选择器旁）。
 *
 * 数据完全来自本地估算：窗口容量走 LiteLLM 目录（context_window），当前
 * 转录体积按字符估算 token（与自动压缩同一套 estimator），不额外请求
 * daemon。圆环填充=可用占比，鼠标悬停展开详情卡（模型 / 窗口 / 当前估算 /
 * 占比 / 自动压缩触发线），颜色按占比渐变（正常 / 趋近 / 越线）。
 *
 * 这只是观测仪表：压缩触发仍由发送时的自动压缩决策（compaction-auto）
 * 与 `/compact` 手动命令承担，本组件不发起任何副作用。
 */
export function ContextWindowRing({ agentId, model, history }: Props): ReactElement | null {
  const t = useT();

  const { windowTokens, usedTokens, percent, tone } = useMemo(() => {
    const windowTokens = resolveModelContextWindowTokens(agentId, model);
    const usedTokens = estimateHistoryTokens(history);
    const ratio = windowTokens > 0 ? usedTokens / windowTokens : 0;
    const percent = Math.min(100, Math.max(0, Math.round(ratio * 100)));
    const tone =
      ratio >= AUTO_COMPACTION_DEFAULT_RATIO ? 'danger' : ratio >= 0.55 ? 'warn' : 'ok';
    return { windowTokens, usedTokens, percent, tone };
  }, [agentId, model, history]);

  if (history.length === 0) return null;

  const dashRatio = percent / 100;
  const dashOffset = RING_CIRCUMFERENCE * (1 - dashRatio);
  const autoPercent = Math.round(AUTO_COMPACTION_DEFAULT_RATIO * 100);

  return (
    <div
      className={styles.wrap}
      data-testid="context-window-ring"
      data-tone={tone}
    >
      <svg
        className={styles.ring}
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        role="img"
        aria-label={`${t('chat.contextWindowTitle')} ${percent}%`}
      >
        <circle
          className={styles.track}
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
        />
        <circle
          className={styles.fill}
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </svg>
      <div className={styles.card} role="tooltip">
        <div className={styles.cardHead}>
          <span className={styles.cardTitle}>{t('chat.contextWindowTitle')}</span>
          <span className={styles.cardPercent}>{percent}%</span>
        </div>
        <div className={styles.rows}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('chat.contextWindowModel')}</span>
            <span className={styles.rowValue} title={model ?? undefined}>
              {model ?? '—'}
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('chat.contextWindowCapacity')}</span>
            <span className={styles.rowValue}>{formatTokens(windowTokens)}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('chat.contextWindowUsed')}</span>
            <span className={styles.rowValue}>{formatTokens(usedTokens)}</span>
          </div>
          <div className={styles.row}>
            <span className={styles.rowLabel}>{t('chat.contextWindowAutoLine')}</span>
            <span className={styles.rowValue}>
              {formatTokens(Math.round(windowTokens * AUTO_COMPACTION_DEFAULT_RATIO))}（
              {autoPercent}%）
            </span>
          </div>
        </div>
        <div className={styles.cardNote}>{t('chat.contextWindowNote')}</div>
      </div>
    </div>
  );
}