import type { ChatCommentAttachment } from '../../../types';
import { commentTargetDisplayName } from '../../../comments';
import { Icon } from '../../../components/Icon';
import type { TranslateFn } from '../types';

export function StagedCommentAttachments({
  attachments,
  onRemove,
  t,
}: {
  attachments: ChatCommentAttachment[];
  onRemove: (id: string) => void;
  t: TranslateFn;
}) {
  const visibleAttachments = attachments.filter((attachment) => attachment.selectionKind !== 'visual');
  if (visibleAttachments.length === 0) return null;
  return (
    <div className="staged-row comment-staged-row" data-testid="staged-comment-attachments">
      {visibleAttachments.map((a) => (
        <div key={a.id} className="staged-chip staged-comment">
          <span
            className="staged-name"
            title={`${a.screenshotPath ? `${a.screenshotPath}: ` : ''}${commentTargetDisplayName(a)}${a.comment ? `: ${a.comment}` : ''}`}
          >
            <strong>{commentTargetDisplayName(a)}</strong>
            {a.comment ? <span>{a.comment}</span> : null}
          </span>
          <button
            type="button"
            className="staged-remove od-tooltip"
            onClick={() => onRemove(a.id)}
            title={t('chat.comments.removeAttachment')}
            data-tooltip={t('chat.comments.removeAttachment')}
            aria-label={t('chat.comments.removeAttachmentAria', { name: a.elementId })}
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}
