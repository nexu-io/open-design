import { formatRetryDelayMs } from '../runtime/retry-delay';
import { renderLinkedStatusDetail } from './status-detail-links';

export interface ChatErrorPayload {
  message: string;
  details?: string | null;
  category?: string | null;
  retryDelayMs?: number | null;
}

export type ChatErrorNoticeValue = string | ChatErrorPayload;

export function ChatErrorNotice({
  error,
  className,
}: {
  error: ChatErrorNoticeValue;
  className?: string;
}) {
  const payload = normalizeChatError(error);
  const classes = ['chat-error-notice', className].filter(Boolean).join(' ');
  return (
    <div className={classes} role="alert">
      <div className="chat-error-notice__message">{renderLinkedStatusDetail(payload.message)}</div>
      {payload.retryDelayMs ? (
        <div className="chat-error-notice__hint">
          Retry after about {formatRetryDelayMs(payload.retryDelayMs)}.
        </div>
      ) : null}
      {payload.details ? (
        <details className="chat-error-notice__details">
          <summary>Show details</summary>
          <pre>{payload.details}</pre>
        </details>
      ) : null}
    </div>
  );
}

export function normalizeChatError(error: ChatErrorNoticeValue): ChatErrorPayload {
  if (typeof error === 'string') return { message: error };
  return {
    message: error.message,
    details: error.details ?? null,
    category: error.category ?? null,
    retryDelayMs: error.retryDelayMs ?? null,
  };
}
