import { Icon } from '../../../components/Icon';
import type { Dict } from '../../../i18n/types';
import type { Conversation } from '../../../types';
import { compactCount, conversationMetaLabel } from '../rules';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

export function ConversationRow({
  conversation,
  active,
  messageCount,
  onSelect,
  onDelete,
  t,
}: {
  conversation: Conversation;
  active: boolean;
  messageCount: number | null;
  onSelect: () => void;
  onDelete: () => void;
  t: TranslateFn;
}) {
  const displayTitle =
    conversation.title || t('chat.untitledConversation');

  return (
    <div
      className={`chat-conv-item${active ? ' active' : ''}`}
      data-testid={`conversation-item-${conversation.id}`}
    >
      <button
        type="button"
        className="chat-conv-item-name"
        data-testid={`conversation-select-${conversation.id}`}
        style={{ background: 'transparent', border: 'none', padding: 0, textAlign: 'left' }}
        onClick={onSelect}
      >
        {displayTitle}
      </button>
      <span
        className="chat-conv-item-meta"
        data-testid={`conversation-meta-${conversation.id}`}
      >
        {messageCount !== null ? `${compactCount(messageCount)} msg · ` : ''}
        {conversationMetaLabel(conversation, t)}
      </span>
      <button
        type="button"
        className="chat-conv-item-del"
        data-testid={`conversation-delete-${conversation.id}`}
        title={t('chat.deleteConversation')}
        onClick={(e) => {
          e.stopPropagation();
          if (
            confirm(t('chat.deleteConversationConfirm', { title: displayTitle }))
          ) {
            onDelete();
          }
        }}
      >
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}
