import type { ChatSessionMode } from '@open-design/contracts';
import { Icon } from '../../../components/Icon';
import type { Dict } from '../../../i18n/types';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

export function MessageSessionModeChip({
  mode,
  t,
}: {
  mode: ChatSessionMode;
  t: TranslateFn;
}) {
  const label = mode === 'chat'
    ? t('chat.mode.chat.label')
    : mode === 'plan'
      ? t('chat.mode.plan.label')
      : t('chat.mode.design.label');
  const icon = mode === 'chat' ? 'comment' : mode === 'plan' ? 'file' : 'sparkles';
  return (
    <div
      className={`msg-mode-chip msg-mode-chip--${mode}`}
      data-testid="msg-session-mode-chip"
      title={label}
    >
      <Icon name={icon} size={12} />
      <span>{label}</span>
    </div>
  );
}
