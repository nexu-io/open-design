import type { ChatMessage } from '../types';
import type { Dict } from '../i18n/types';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

export function messageTime(message: ChatMessage): number | undefined {
  if (message.role === 'assistant') {
    return message.startedAt ?? message.createdAt ?? message.endedAt;
  }
  return message.createdAt ?? message.startedAt ?? message.endedAt;
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function dayLabel(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function exactDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function relativeTimeLong(ts: number, t: TranslateFn): string {
  const diff = Math.max(0, Date.now() - ts);
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return t('common.justNow');
  if (diff < hr) return t('common.minutesAgo', { n: Math.floor(diff / min) });
  if (diff < day) return t('common.hoursAgo', { n: Math.floor(diff / hr) });
  if (diff < 7 * day) return t('common.daysAgo', { n: Math.floor(diff / day) });
  return new Date(ts).toLocaleDateString();
}
