import type { Dict } from '../../i18n/types';
import type { Conversation } from '../../types';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

/** History rows consistently show recency, regardless of the latest run's status. */
export function conversationMetaLabel(
  conversation: Pick<Conversation, 'updatedAt'>,
  t: TranslateFn,
  now = Date.now(),
): string {
  if (!Number.isFinite(conversation.updatedAt) || !Number.isFinite(now)) return '';

  const minutes = Math.floor(Math.max(0, now - conversation.updatedAt) / 60_000);
  if (minutes < 1) return t('common.now');
  if (minutes < 60) return t('common.minutesShort', { n: minutes });
  if (minutes >= 24 * 60) {
    return t('common.daysShort', { n: Math.floor(minutes / (24 * 60)) });
  }
  return [
    t('common.hoursShort', { n: Math.floor(minutes / 60) }),
    t('common.minutesShort', { n: minutes % 60 }),
  ].join(' ');
}
