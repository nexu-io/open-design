import { useEffect, useMemo } from 'react';

import { AgentIcon } from './AgentIcon';
import { Icon } from './Icon';
import { useWorkspaceTabsDockRef } from './workspaceTabsDock';
import { useI18n } from '../i18n';
import { formatAttachmentSize, splitFileName } from '../runtime/chat/attachment';
import { looksLikeImageName } from '../runtime/chat/staged-attachment';
import { agentDisplayName, agentIconId } from '../utils/agentLabels';
import type { Project } from '../types';
import styles from './ProjectCreationPendingView.module.css';

interface Props {
  project: Project;
  prompt: string;
  /** The files the user staged on Home. Still local `File` objects here. */
  files?: readonly File[];
  agentId?: string | null;
}

/** One staged file, resolved to everything the card needs without a request. */
interface PendingAttachmentCard {
  key: string;
  base: string;
  ext: string;
  size: string | null;
  kind: 'image' | 'file';
  previewUrl: string | null;
}

/**
 * Immediate, read-free handoff shown while POST /api/projects is still
 * settling. It deliberately mirrors the first ProjectView frame without
 * mounting ProjectView itself: an optimistic project has not been authorized
 * or persisted yet, so no project-owned API, SSE, file, or presence reads may
 * start from this surface.
 *
 * "Read-free" is about the network, not about the screen. Everything this
 * frame draws is already in this tab: the project name and prompt the user
 * just typed, the workspace tab strip App already renders, and the staged
 * files — which are `File` objects the picker handed us, so their thumbnails
 * come from `URL.createObjectURL`, not from `/api/projects/:id/raw`.
 *
 * The layout is copied from the frame that replaces it (ProjectView's split,
 * ChatPane's header and user message, DesignFilesPanel's empty state) so the
 * hand-off does not re-flow the page. Where a control cannot work yet it is
 * rendered disabled rather than omitted — an omitted control moves everything
 * next to it, which is exactly the jump this frame is here to avoid.
 */
export function ProjectCreationPendingView({
  project,
  prompt,
  files,
  agentId,
}: Props) {
  const { t } = useI18n();
  const agentName = agentDisplayName(agentId) ?? t('assistant.role');
  const iconId = agentIconId(agentId);
  // Same registry ProjectView uses, so WorkspaceTabsBar portals the real strip
  // above the chat card here too and the chrome row stays collapsed across the
  // hand-off instead of rising for one frame.
  const tabsDockRef = useWorkspaceTabsDockRef();

  const cards = useMemo<PendingAttachmentCard[]>(() => {
    const staged = files ?? [];
    return staged.map((file, index) => {
      const { base, ext } = splitFileName(file.name);
      const kind = looksLikeImageName(file.name, file.type) ? 'image' as const : 'file' as const;
      let previewUrl: string | null = null;
      if (
        kind === 'image'
        && typeof URL !== 'undefined'
        && typeof URL.createObjectURL === 'function'
      ) {
        try {
          previewUrl = URL.createObjectURL(file);
        } catch {
          // Hardened/older contexts: fall back to the doc card's grey plate.
          previewUrl = null;
        }
      }
      return {
        key: `${index}:${file.name}`,
        base,
        ext,
        size: formatAttachmentSize(file.size),
        kind,
        previewUrl,
      };
    });
  }, [files]);

  useEffect(() => () => {
    for (const card of cards) {
      if (!card.previewUrl) continue;
      if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') continue;
      try {
        URL.revokeObjectURL(card.previewUrl);
      } catch {
        // Already revoked, or unsupported — nothing to clean up.
      }
    }
  }, [cards]);

  // The `.app` shell belongs to App.tsx, which wraps this view and ProjectView
  // in the same element so React reconciles one `div.app` across the hand-off
  // instead of mounting a second one and replaying its entrance animation.
  return (
    <>
      <div className={`split ${styles.split}`} data-testid="project-creation-pending-view">
        <div className="split-chat-slot">
          {/* Workspace tab-strip dock, identical to ProjectView's. */}
          <div
            className="split-chat-tabs-dock"
            data-testid="workspace-tabs-dock"
            ref={tabsDockRef}
          >
            <button
              type="button"
              className="split-chat-collapse"
              disabled
              tabIndex={-1}
              aria-hidden="true"
            >
              <Icon name="panel-left" size={16} />
            </button>
          </div>
          <div className={`pane ${styles.chatPane}`}>
            <div className="chat-project-header">
              <span className="chat-project-header-title">
                <span className="chat-project-title-line">
                  <span className="title" data-testid="pending-project-title">
                    {project.name}
                  </span>
                </span>
              </span>
              <div className="chat-history-wrap chat-session-switcher">
                <button
                  type="button"
                  className="chat-session-trigger icon-only"
                  disabled
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <Icon name="comment" size={16} />
                </button>
              </div>
            </div>
            <div className="chat-log-wrap">
              <div className="chat-log" aria-busy="true">
                {prompt || cards.length > 0 ? (
                  <div className="msg user">
                    {/* Attachments above, bubble below, right edges aligned —
                        the same `.msg-stack` the transcript uses. */}
                    <div className="msg-stack">
                      {cards.length > 0 ? (
                        <div className="msg-att-wrap">
                          <div
                            className="user-attachments msg-att"
                            data-testid="pending-attachment-row"
                          >
                            {cards.map((card) => (card.kind === 'image' && card.previewUrl ? (
                              <span key={card.key} className="msg-att-img">
                                <span className="msg-att-ph">
                                  <img className="msg-att-mini" src={card.previewUrl} alt="" />
                                </span>
                              </span>
                            ) : (
                              <span key={card.key} className="msg-att-doc">
                                <Icon name="file" size={15} className="msg-att-fi" />
                                <span className="msg-att-tx">
                                  <span className="msg-att-nm">
                                    <span className="msg-att-base">{card.base}</span>
                                    {card.ext ? (
                                      <span className="msg-att-ext">{card.ext}</span>
                                    ) : null}
                                  </span>
                                  <span className="msg-att-meta">{card.size ?? ''}</span>
                                </span>
                              </span>
                            )))}
                          </div>
                        </div>
                      ) : null}
                      {prompt ? (
                        <div className="user-text-wrap">
                          <div className="user-text user-bubble">{prompt}</div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div className="msg assistant">
                  <div className="role">
                    <AgentIcon id={iconId} size={20} className="role-agent-icon" />
                    <span className="role-name">{agentName}</span>
                  </div>
                  <div className="assistant-flow">
                    <div
                      className="assistant-footer"
                      data-streaming="true"
                      data-last="true"
                    >
                      <span className="dot" data-active="true" />
                      <span className="assistant-label shimmer-text shimmer-prepare">
                        {t('assistant.statusPreparing')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="split-resize-handle" aria-hidden="true" />
        <section className={`workspace ${styles.workspace}`} aria-label={t('designFiles.title')}>
          <div className="ws-tabs-shell">
            <div className="ws-tabs-bar" role="tablist" aria-label={t('designFiles.title')}>
              <div
                className="ws-tab design-files-tab active"
                role="tab"
                aria-selected="true"
              >
                <span className="tab-icon" aria-hidden="true">
                  <Icon name="grid" size={14} />
                </span>
                <span className="ws-tab-label">{t('designFiles.title')}</span>
              </div>
            </div>
            <span className={styles.addIcon} aria-hidden="true">
              <Icon name="plus" size={16} />
            </span>
          </div>
          {/* DesignFilesPanel's own shell and empty pill, so the sentence sits
              in the same place before and after the hand-off. */}
          <div className="df-panel">
            <div className="df-main">
              <div className="df-topbar">
                <div className="df-topbar-left">
                  <nav className="df-breadcrumbs" aria-label={t('designFiles.crumbs')}>
                    <span className="df-breadcrumb-current">{t('designFiles.crumbs')}</span>
                  </nav>
                </div>
                <div className="df-topbar-right" />
              </div>
              <div className="df-body">
                <div className="df-empty" data-testid="pending-design-files-empty">
                  <div className="df-empty-pill">
                    <span className="df-empty-title">{t('designFiles.empty')}</span>
                    <div className="df-empty-actions">
                      <button type="button" className="df-empty-cta df-empty-cta-primary" disabled>
                        <Icon name="pencil" size={13} />
                        <span>{t('designFiles.newSketch')}</span>
                      </button>
                      <button type="button" className="df-empty-cta df-empty-cta-doc" disabled>
                        <Icon name="file" size={13} />
                        <span>{t('designFiles.newDocument')}</span>
                      </button>
                      <button type="button" className="df-empty-cta df-empty-cta-upload" disabled>
                        <Icon name="upload" size={13} />
                        <span>{t('designFiles.upload.label')}</span>
                      </button>
                      <button type="button" className="df-empty-cta df-empty-cta-secondary" disabled>
                        <Icon name="globe" size={13} />
                        <span>{t('workspace.newBrowser')}</span>
                      </button>
                      <button type="button" className="df-empty-cta df-empty-cta-tertiary" disabled>
                        <Icon name="blocks" size={14} />
                        <span>{t('dsManager.createTitle')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
