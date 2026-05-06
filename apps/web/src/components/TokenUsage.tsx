// Token usage indicator shown below each assistant message and at the top
// of the conversation. Helps users understand consumption and debug truncation.

import { useMemo } from 'react';
import { FALLBACK_MAX_TOKENS } from '../state/maxTokens';

export interface TokenUsageProps {
  inputTokens?: number;
  outputTokens?: number;
  maxTokens?: number;
  /** If true shows a compact single-line summary instead of details */
  compact?: boolean;
}

export function TokenUsage({
  inputTokens,
  outputTokens,
  maxTokens = FALLBACK_MAX_TOKENS,
  compact = false,
}: TokenUsageProps) {
  const total = (inputTokens ?? 0) + (outputTokens ?? 0);
  const ratio = maxTokens > 0 ? Math.min(total / maxTokens, 1) : 0;
  const isWarning = ratio > 0.8;
  const isDanger = ratio > 0.95;

  const barColor = isDanger ? 'var(--od-danger, #e5484d)' : isWarning ? 'var(--od-warning, #f5a623)' : 'var(--od-accent, #3b82f6)';

  if (compact && total === 0) return null;

  if (compact) {
    return (
      <span className={`token-usage-compact ${isWarning ? 'token-warn' : ''}`}>
        {total.toLocaleString()} / {maxTokens.toLocaleString()}
      </span>
    );
  }

  return (
    <div className={`token-usage ${isDanger ? 'token-danger' : isWarning ? 'token-warn' : ''}`}>
      <div className="token-bar-bg">
        <div
          className="token-bar-fill"
          style={{ width: `${ratio * 100}%`, backgroundColor: barColor }}
        />
      </div>
      <div className="token-numbers">
        {inputTokens != null || outputTokens != null ? (
          <>
            {inputTokens != null && <span>in: {inputTokens.toLocaleString()}</span>}
            {outputTokens != null && <span>out: {outputTokens.toLocaleString()}</span>}
            <span className="token-total">{total.toLocaleString()} / {maxTokens.toLocaleString()}</span>
          </>
        ) : (
          <span>{total.toLocaleString()} / {maxTokens.toLocaleString()}</span>
        )}
        {isWarning && <span className="token-hint">&#9888; near limit</span>}
      </div>
    </div>
  );
}

export interface CumulativeTokenUsageProps {
  messages: Array<{ usage?: { inputTokens?: number; outputTokens?: number } }>;
  maxTokens?: number;
}

export function CumulativeTokenUsage({ messages, maxTokens = FALLBACK_MAX_TOKENS }: CumulativeTokenUsageProps) {
  const totals = useMemo(() => {
    let input = 0;
    let output = 0;
    for (const m of messages) {
      if (m.usage?.inputTokens) input += m.usage.inputTokens;
      if (m.usage?.outputTokens) output += m.usage.outputTokens;
    }
    return { input, output, total: input + output };
  }, [messages]);

  return (
    <TokenUsage
      inputTokens={totals.input}
      outputTokens={totals.output}
      maxTokens={maxTokens}
      compact
    />
  );
}
