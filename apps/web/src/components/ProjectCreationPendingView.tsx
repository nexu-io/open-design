import { AgentIcon } from './AgentIcon';
import { Icon } from './Icon';
import { useI18n } from '../i18n';
import { agentDisplayName, agentIconId } from '../utils/agentLabels';
import type { Project } from '../types';
import styles from './ProjectCreationPendingView.module.css';

interface Props {
  project: Project;
  prompt: string;
  agentId?: string | null;
  onBack: () => void;
}

/**
 * Immediate, read-free handoff shown while POST /api/projects is still
 * settling. It deliberately mirrors the first ProjectView frame without
 * mounting ProjectView itself: an optimistic project has not been authorized
 * or persisted yet, so no project-owned API, SSE, file, or presence reads may
 * start from this surface.
 */
export function ProjectCreationPendingView({
  project,
  prompt,
  agentId,
  onBack,
}: Props) {
  const { t } = useI18n();
  const agentName = agentDisplayName(agentId) ?? t('assistant.role');
  const iconId = agentIconId(agentId);

  // The `.app` shell belongs to App.tsx, which wraps this view and ProjectView
  // in the same element so React reconciles one `div.app` across the hand-off
  // instead of mounting a second one and replaying its entrance animation.
  return (
    <>
      <div className={`split ${styles.split}`} data-testid="project-creation-pending-view">
        <div className="split-chat-slot">
          <div className={`pane ${styles.chatPane}`}>
            <div className="chat-project-header">
              <button
                type="button"
                className="chat-project-back"
                onClick={onBack}
                title={t('project.backToProjects')}
                aria-label={t('project.backToProjects')}
              >
                <Icon name="arrow-left" size={16} />
              </button>
              <span className="chat-project-header-title">
                <span className="chat-project-title-line">
                  <span className="title" data-testid="pending-project-title">
                    {project.name}
                  </span>
                </span>
              </span>
            </div>
            <div className="chat-log-wrap">
              <div className="chat-log" aria-busy="true">
                {prompt ? (
                  <div className="msg user">
                    <div className="user-text-wrap">
                      <div className="user-text user-bubble">{prompt}</div>
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
          <div className={styles.workspaceBody}>
            <span className={styles.workspaceTitle}>{t('designFiles.crumbs')}</span>
            <span className={styles.workspaceEmpty}>{t('designFiles.empty')}</span>
          </div>
        </section>
      </div>
    </>
  );
}
