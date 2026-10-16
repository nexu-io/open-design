import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type { DesignSystemSummary } from '@open-design/contracts';

import { selectedAssistantIdentity } from './agentModelSelection';
import { AvatarMenu } from './AvatarMenu';
import { ChatPane } from './ChatPane';
import { DesignSystemPicker } from './DesignSystemPicker';
import { Icon } from './Icon';
import historyDockStyles from './chat/ConversationHistoryDock.module.css';
import { useWorkspaceTabsDockRef } from './workspaceTabsDock';
import { useI18n } from '../i18n';
import type { AgentInfo, AppConfig } from '../types';
import {
  projectSplitStyle,
  readSavedChatPanelWidth,
  resolveProjectSplitLayout,
  workspacePanelTrackForMinWidth,
  writeProjectSplitLayout,
} from './project-split-layout';
import { useCreationHandoffMessages } from './useCreationHandoffMessages';
import styles from './ProjectCreationPendingView.module.css';

/**
 * What the frame needs to draw the SAME chrome ProjectView will draw
 * (OPEND-3334): the agent's display name for the role row, and the inputs of
 * the two composer accessories — the agent/model menu and the design-system
 * picker — so the inert composer has the real one's geometry. Everything is
 * optional so a caller that lacks it still gets a frame; it then differs from
 * the real view exactly where the input was missing.
 */
export interface PendingChromeInputs {
  agentName?: string | null;
  config?: AppConfig | null;
  agents?: readonly AgentInfo[];
  daemonLive?: boolean;
  designSystems?: readonly DesignSystemSummary[];
  designSystemId?: string | null;
}

interface Props extends PendingChromeInputs {
  projectName: string;
  prompt: string;
  /** The files the user staged on Home. Still local `File` objects here. */
  files?: readonly File[];
  agentId?: string | null;
}

const noop = () => undefined;
const ensureNoPendingProject = () => Promise.resolve(null);
const NO_CONVERSATIONS: never[] = [];
const NO_FILES: never[] = [];
const makePendingSurfaceInert = (node: HTMLElement | null) => {
  // React 18's DOM runtime drops the boolean `inert` attribute even though
  // current React typings expose it. Set the standards-based attribute on the
  // node so keyboard focus is blocked as well as pointer interaction.
  node?.setAttribute('inert', '');
};

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
 * The chat column is the real `ChatPane`, detached: no project id, no
 * conversations, no-op handlers, and the optimistic first turn as its
 * messages (`useCreationHandoffMessages`). ProjectView hands the same turn to
 * its own ChatPane until the auto-sent turn paints, so both sides of the
 * hand-off are drawn by the same component from the same data (OPEND-3334).
 * The workspace column is still a copy (ProjectView's split, DesignFilesPanel's
 * empty state); where a control cannot work yet it is kept and made inert
 * rather than omitted, because an omitted control moves everything next to it.
 */
export function ProjectCreationPendingView({
  projectName,
  prompt,
  files,
  agentId,
  ...chrome
}: Props) {
  const { t } = useI18n();
  const { config, agents, daemonLive = false, designSystems, designSystemId } = chrome;
  const identity = useMemo(
    () => (config
      ? selectedAssistantIdentity(config, agents ?? [])
      : { agentId: agentId ?? undefined, agentName: chrome.agentName ?? undefined }),
    [agentId, agents, chrome.agentName, config],
  );
  const handoff = useMemo(() => ({ prompt, files }), [files, prompt]);
  const messages = useCreationHandoffMessages(handoff, identity);
  // ChatPane portals its conversation-history control into the tabs dock,
  // exactly as it does under ProjectView.
  const [historyPortalTarget, setHistoryPortalTarget] = useState<HTMLDivElement | null>(null);
  const historyDockRef = useCallback((node: HTMLDivElement | null) => {
    makePendingSurfaceInert(node);
    setHistoryPortalTarget(node);
  }, []);
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
        data-creation-handoff=""
      >
        <div className="split-chat-slot">
          {/* Workspace tab-strip dock, identical to ProjectView's. */}
          <div
            className="split-chat-tabs-dock"
            data-testid="workspace-tabs-dock"
            ref={tabsDockRef}
          >
            <div
              className={historyDockStyles.dock}
              data-testid="pending-chat-history-dock"
              ref={historyDockRef}
            />
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
          <ChatPane
            detached
            historyPortalTarget={historyPortalTarget}
            messages={messages}
            streaming
            error={null}
            projectId={null}
            projectFiles={NO_FILES}
            onEnsureProject={ensureNoPendingProject}
            onSend={noop}
            onStop={noop}
            conversations={NO_CONVERSATIONS}
            activeConversationId={null}
            onSelectConversation={noop}
            onDeleteConversation={noop}
            config={config ?? undefined}
            currentDesignSystemId={designSystemId ?? null}
            collapseControlLifted
            composerFooterAccessory={config && agents ? (
              <AvatarMenu
                config={config}
                agents={agents as AgentInfo[]}
                daemonLive={daemonLive}
                onModeChange={noop}
                onAgentChange={noop}
                onAgentModelChange={noop}
                onOpenSettings={noop}
                onRefreshAgents={() => agents as AgentInfo[]}
              />
            ) : undefined}
            designSystemPicker={designSystems ? (
              <DesignSystemPicker
                variant="home"
                designSystems={designSystems as DesignSystemSummary[]}
                selectedId={designSystemId ?? null}
                onChange={noop}
              />
            ) : undefined}
          />
        </div>
        <div className="split-resize-handle" aria-hidden="true" />
        {/* Inert, not disabled: DesignFilesPanel draws these pills live, and a
            disabled look would flip to live at the hand-off (OPEND-3334). */}
        <section
          className={`workspace ${styles.workspace}`}
          aria-label={t('designFiles.title')}
          ref={makePendingSurfaceInert}
        >
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
            {/* FileWorkspace's own add-tab control, so the "+" sits where it
                will; the whole section is inert. */}
            <div className="ws-add-tab">
              <button type="button" className="icon-only ws-tab-add" tabIndex={-1} aria-hidden="true">
                <Icon name="plus" size={15} />
              </button>
            </div>
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
                {/* The project menu trigger sets the top bar's height; without
                    it the bar is shorter and everything below moves at the
                    hand-off. */}
                <div className="df-topbar-right">
                  <div className="df-actions">
                    <div className="df-project-menu-anchor">
                      <button
                        type="button"
                        className="df-project-menu-trigger"
                        tabIndex={-1}
                        aria-hidden="true"
                      >
                        <Icon name="more-horizontal" size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="df-body">
                <div className="df-empty" data-testid="pending-design-files-empty">
                  <div className="df-empty-pill">
                    <span className="df-empty-title">{t('designFiles.empty')}</span>
                    <div className="df-empty-actions">
                      <button type="button" className="df-empty-cta df-empty-cta-primary" tabIndex={-1}>
                        <Icon name="pencil" size={13} />
                        <span>{t('designFiles.newSketch')}</span>
                      </button>
                      <button type="button" className="df-empty-cta df-empty-cta-doc" tabIndex={-1}>
                        <Icon name="file" size={13} />
                        <span>{t('designFiles.newDocument')}</span>
                      </button>
                      <button type="button" className="df-empty-cta df-empty-cta-upload" tabIndex={-1}>
                        <Icon name="upload" size={13} />
                        <span>{t('designFiles.upload.label')}</span>
                      </button>
                      <button type="button" className="df-empty-cta df-empty-cta-secondary" tabIndex={-1}>
                        <Icon name="globe" size={13} />
                        <span>{t('workspace.newBrowser')}</span>
                      </button>
                      <button type="button" className="df-empty-cta df-empty-cta-tertiary" tabIndex={-1}>
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
