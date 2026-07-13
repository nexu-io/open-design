import { memo, useEffect, useRef, useState } from 'react';
import type { AppliedPluginSnapshot } from '@open-design/contracts';
import { commentTargetDisplayName } from '../../../comments';
import { Icon } from '../../../components/Icon';
import {
  DESIGN_SYSTEM_WORKSPACE_DISPLAY_DESCRIPTION,
  DESIGN_SYSTEM_WORKSPACE_DISPLAY_TITLE,
  isDesignSystemWorkspacePrompt,
} from '../../../design-system-auto-prompt';
import type { Dict } from '../../../i18n/types';
import { copyToClipboard } from '../../../lib/copy-to-clipboard';
import type { ChatMessage, DesignSystemSummary } from '../../../types';
import { sortChatAttachmentsForDisplay } from '../rules';
import { ActiveDesignSystemChip } from './ActiveDesignSystemChip';
import { ActivePluginChip } from './ActivePluginChip';
import { ActiveWorkspaceContextChip } from './ActiveWorkspaceContextChip';
import { MessageSessionModeChip } from './MessageSessionModeChip';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

function UserMessageImpl({
  message,
  projectId,
  projectFileNames,
  onRequestOpenFile,
  onRequestPluginDetails,
  onRequestDesignSystemDetails,
  t,
  activePluginSnapshot,
  activeDesignSystem,
  projectRawUrl,
}: {
  message: ChatMessage;
  projectId: string | null;
  projectFileNames?: Set<string>;
  onRequestOpenFile?: (name: string) => void;
  onRequestPluginDetails?: (pluginId: string) => void;
  onRequestDesignSystemDetails?: (system: DesignSystemSummary) => void;
  t: TranslateFn;
  activePluginSnapshot?: AppliedPluginSnapshot | null;
  activeDesignSystem?: DesignSystemSummary | null;
  // Threaded in rather than imported directly — `providers/registry` may
  // only be imported from `dependencies.ts` inside a `features/**` file
  // (see `scripts/check-web-slice-boundaries.ts`), and this is a dumb
  // presentational component, not a port-consuming hook.
  projectRawUrl: (projectId: string, filePath: string) => string;
}) {
  const attachments = sortChatAttachmentsForDisplay(message.attachments ?? []);
  const commentAttachments = message.commentAttachments ?? [];
  const workspaceItems = message.runContext?.workspaceItems ?? [];
  const messagePluginSnapshot = message.appliedPluginSnapshot ?? activePluginSnapshot ?? null;
  const hasRunContext = Boolean(
    message.sessionMode ||
      workspaceItems.length > 0 ||
      messagePluginSnapshot ||
      activeDesignSystem,
  );
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  async function handleCopy() {
    if (!message.content) return;
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    const ok = await copyToClipboard(message.content);
    if (!ok) return;
    setCopied(true);
    copyTimerRef.current = setTimeout(() => {
      setCopied(false);
      copyTimerRef.current = undefined;
    }, 2000);
  }

  const isDesignSystemWorkspaceRequest = isDesignSystemWorkspacePrompt(message.content);

  return (
    <div className="msg user">
      <span className="sr-only">{t('chat.you')}</span>
      {hasRunContext ? (
        <div className="msg-run-context-row" data-testid="msg-run-context-row">
          {message.sessionMode ? (
            <MessageSessionModeChip mode={message.sessionMode} t={t} />
          ) : null}
          {workspaceItems.map((item) => (
            <ActiveWorkspaceContextChip
              key={`${item.kind}:${item.id}`}
              item={item}
              onOpen={onRequestOpenFile}
            />
          ))}
          {messagePluginSnapshot ? (
            <ActivePluginChip
              snapshot={messagePluginSnapshot}
              t={t}
              onOpenDetails={onRequestPluginDetails}
            />
          ) : null}
          {activeDesignSystem ? (
            <ActiveDesignSystemChip
              system={activeDesignSystem}
              onOpenDetails={onRequestDesignSystemDetails}
            />
          ) : null}
        </div>
      ) : null}
      {attachments.length > 0 ? (
        <div className="user-attachments">
          {attachments.map((a, index) => {
            const baseName = a.path.split('/').pop() || a.path;
            const openable =
              !!onRequestOpenFile &&
              (projectFileNames ? projectFileNames.has(baseName) : true);
            const handleOpen = openable
              ? () => onRequestOpenFile?.(baseName)
              : undefined;
            return (
              <button
                type="button"
                key={a.path}
                className={`user-attachment staged-${a.kind}${openable ? ' openable' : ''}`}
                onClick={handleOpen}
                disabled={!openable}
                title={openable ? t('chat.openFile', { name: baseName }) : a.path}
              >
                <span className="staged-order" aria-label={`Attachment ${index + 1}`}>
                  {index + 1}
                </span>
                {a.kind === 'image' && projectId ? (
                  <img src={projectRawUrl(projectId, a.path)} alt={a.name} />
                ) : (
                  <Icon name="file" size={14} />
                )}
                <span className="staged-name">{a.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {commentAttachments.some((attachment) => attachment.selectionKind !== 'visual') ? (
        <div className="user-attachments comment-history-attachments">
          {commentAttachments.filter((attachment) => attachment.selectionKind !== 'visual').map((a) => (
            <span key={a.id} className="user-attachment staged-comment">
              <span className="staged-name" title={a.comment ? `${commentTargetDisplayName(a)}: ${a.comment}` : commentTargetDisplayName(a)}>
                <strong>{commentTargetDisplayName(a)}</strong>
                {a.comment ? <span>{a.comment}</span> : null}
              </span>
            </span>
          ))}
        </div>
      ) : null}
      {message.content && isDesignSystemWorkspaceRequest ? (
        <div className="user-text-wrap user-status-wrap">
          <div className="user-status-card design-system-generation-status">
            <span className="user-status-card__icon">
              <Icon name="blocks" size={15} />
            </span>
            <span className="user-status-card__copy">
              <strong>{DESIGN_SYSTEM_WORKSPACE_DISPLAY_TITLE}</strong>
              <span>{DESIGN_SYSTEM_WORKSPACE_DISPLAY_DESCRIPTION}</span>
            </span>
          </div>
        </div>
      ) : message.content ? (
        <div className="user-text-wrap">
          <div className="user-text user-bubble">{message.content}</div>
          <div className="user-actions">
            <button
              type="button"
              className="ghost user-copy-btn"
              onClick={handleCopy}
              aria-label={copied ? t('chat.copyDone') : t('chat.copyPrompt')}
              title={copied ? t('chat.copyDone') : t('chat.copyPrompt')}
            >
              <Icon name={copied ? 'check' : 'copy'} size={13} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Memoized: a static user message has stable props, so it skips re-render
// while a later turn streams.
export const UserMessage = memo(UserMessageImpl);
