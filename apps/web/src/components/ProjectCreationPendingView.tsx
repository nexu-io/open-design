import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { AgentIcon } from './AgentIcon';
import { ChatComposer } from './ChatComposer';
import { Icon } from './Icon';
import { useWorkspaceTabsDockRef } from './workspaceTabsDock';
import { useI18n } from '../i18n';
import { formatAttachmentSize, splitFileName } from '../runtime/chat/attachment';
import { looksLikeImageName } from '../runtime/chat/staged-attachment';
import { agentDisplayName, agentIconId } from '../utils/agentLabels';
import {
  projectSplitStyle,
  readSavedChatPanelWidth,
  resolveProjectSplitLayout,
  workspacePanelTrackForMinWidth,
  writeProjectSplitLayout,
} from './project-split-layout';
import styles from './ProjectCreationPendingView.module.css';

interface Props {
  projectName: string;
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
}

const ensureNoPendingProject = () => Promise.resolve(null);
const ignorePendingComposerAction = () => undefined;
const makePendingComposerInert = (node: HTMLDivElement | null) => {
  // React 18's DOM runtime drops the boolean `inert` attribute even though
  // current React typings expose it. Set the standards-based attribute on the
  // node so keyboard focus is blocked as well as pointer interaction.
  node?.setAttribute('inert', '');
};

/** Object URL for an image card, or null where unavailable (e.g. jsdom). */
function createPreviewUrl(file: File): string | null {
  try {
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
    return URL.createObjectURL(file);
  } catch {
    // Hardened/older contexts: fall back to the doc card's grey plate.
    return null;
  }
}

function revokePreviewUrl(url: string): void {
  try {
    URL.revokeObjectURL?.(url);
  } catch {
    // Already revoked, or unsupported — nothing to clean up.
  }
}

interface ChatProps {
  projectName: string;
  prompt: string;
  /** The files the user staged on Home. Still local `File` objects here. */
  files?: readonly File[];
  agentId?: string | null;
}

/**
 * The hand-off's chat card: the project title, the prompt the user just
 * typed (with its staged files), an assistant row that says "Preparing…", and
 * the real ChatComposer made inert. `ProjectCreationPendingView` draws it as
 * the chat column of the whole pending frame; ProjectView draws the very same
 * card on top of its chat column while the first transcript settles
 * (`creationHandoff`, OPEND-2170), so the column never switches to another
 * loading form between the create answering and the auto-sent turn painting.
 *
 * Read-free like the frame around it: everything here is already in this tab.
 */
export function ProjectCreationPendingChat({
  projectName,
  prompt,
  files,
  agentId,
}: ChatProps) {
  const { t } = useI18n();
  const agentName = agentDisplayName(agentId) ?? t('assistant.role');
  const iconId = agentIconId(agentId);

  const cards = useMemo<PendingAttachmentCard[]>(() => {
    const staged = files ?? [];
    return staged.map((file, index) => {
      const { base, ext } = splitFileName(file.name);
      return {
        key: `${index}:${file.name}`,
        base,
        ext,
        size: formatAttachmentSize(file.size),
        kind: looksLikeImageName(file.name, file.type) ? 'image' as const : 'file' as const,
      };
    });
  }, [files]);

  // Image cards preview the staged file itself; the upload has not happened
  // yet, so there is no project raw URL to point at. Creation and revocation
  // are paired inside one `files`-keyed effect (the StrictMode-safe shape from
  // DesignSystemAssetDropzone): the cleanup revokes exactly the URLs its own
  // setup created, so StrictMode's simulated unmount cannot leave a memoized
  // list of dead blob: links for the remount to hand to <img>.
  const [previewUrls, setPreviewUrls] = useState<ReadonlyArray<string | null>>([]);
  useEffect(() => {
    const next = (files ?? []).map((file) =>
      looksLikeImageName(file.name, file.type) ? createPreviewUrl(file) : null,
    );
    setPreviewUrls(next);
    return () => {
      for (const url of next) if (url) revokePreviewUrl(url);
    };
  }, [files]);

  return (
    <div
      className={`pane ${styles.chatPane}`}
      data-testid="project-creation-pending-chat"
      data-creation-handoff=""
    >
      {/* No project-name header: the name is shown once, in the switcher
          docked above this card, exactly as the real chat card it hands off
          to (OPEND-3128). */}
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
                      {cards.map((card, index) => (card.kind === 'image' && previewUrls[index] ? (
                        <span key={card.key} className="msg-att-img">
                          <span className="msg-att-ph">
                            <img className="msg-att-mini" src={previewUrls[index] ?? undefined} alt="" />
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
      <div
        className={`chat-composer-slot ${styles.pendingComposer}`}
        data-testid="pending-chat-composer-shell"
        ref={makePendingComposerInert}
        aria-disabled="true"
      >
        <ChatComposer
          projectId={null}
          projectFiles={[]}
          streaming={false}
          sendDisabled
          inputDisabled
          composerPlaceholder={t('chat.composerPlaceholder')}
          onEnsureProject={ensureNoPendingProject}
          onSend={ignorePendingComposerAction}
          onStop={ignorePendingComposerAction}
        />
      </div>
    </div>
  );
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
 *
 * The composer at the bottom is the real ChatComposer made inert: the frame
 * already looks like the project the user is about to land in, and
 * ProjectView's own composer takes over in place once the id is confirmed.
 */
export function ProjectCreationPendingView({
  projectName,
  prompt,
  files,
  agentId,
}: Props) {
  const { t } = useI18n();
  // Same registry ProjectView uses, so WorkspaceTabsBar portals the real strip
  // above the chat card here too and the chrome row stays collapsed across the
  // hand-off instead of rising for one frame.
  const tabsDockRef = useWorkspaceTabsDockRef();

  // OPEND-3207 · this frame and the ProjectView that replaces it must show
  // the chat column at the same width, or the column moves at the hand-off.
  // Both resolve it through `resolveProjectSplitLayout`: the saved width
  // first (already in the inline style below, so even the pre-measure paint
  // is right), else the equal split of the measured container.
  const splitRef = useRef<HTMLDivElement | null>(null);
  const savedChatPanelWidth = useMemo(readSavedChatPanelWidth, []);
  useLayoutEffect(() => {
    const split = splitRef.current;
    if (!split) return undefined;
    const apply = (options: { animate?: boolean } = {}) => {
      const layout = resolveProjectSplitLayout(split.clientWidth, savedChatPanelWidth);
      writeProjectSplitLayout(split, layout.chatPanelWidth, layout.workspacePanelTrack, options);
    };
    // Settle the first write without the `.split` transition; the
    // `clientWidth` read has already committed the provisional inline width.
    apply({ animate: false });
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => apply());
      observer.observe(split);
      return () => observer.disconnect();
    }
    const onWindowResize = () => apply();
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  }, [savedChatPanelWidth]);

  // The `.app` shell belongs to App.tsx, which wraps this view and ProjectView
  // in the same element so React reconciles one `div.app` across the hand-off
  // instead of mounting a second one and replaying its entrance animation.
  return (
    <>
      <div
        ref={splitRef}
        className={`split ${styles.split}`}
        style={projectSplitStyle(
          false,
          savedChatPanelWidth.width,
          workspacePanelTrackForMinWidth(
            resolveProjectSplitLayout(0, savedChatPanelWidth).workspacePanelMinWidth,
          ),
        )}
        data-testid="project-creation-pending-view"
      >
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
          <ProjectCreationPendingChat
            projectName={projectName}
            prompt={prompt}
            files={files}
            agentId={agentId}
          />
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
