import { useState } from 'react';
import { useI18n } from '../i18n/I18n';
import { HomeTemplates } from './HomeTemplates';
import { MotionIcon } from './icons';
import { useWorkspaceChrome, WorkspaceMenuButton } from './WorkspaceFrame';
import { HomeComposer } from './ProjectConversation';
import type { GalleryTemplate } from '../../../shared/catalog';

export function MotionHome() {
  const { t, formatDate } = useI18n();
  const { workspace, switchingDisabled } = useWorkspaceChrome();
  const [showAll, setShowAll] = useState(false);
  const [template, setTemplate] = useState<GalleryTemplate>();
  const sessions = workspace.sessions;
  return <div className="motion-home">
    <div className="motion-home-navigation"><WorkspaceMenuButton /></div>
    <main className="motion-home-scroll"><div className="motion-home-inner">
      <button className="motion-create-project" disabled={switchingDisabled} onClick={() => void workspace.startSession()}>
        <span className="motion-create-plus"><MotionIcon name="plus" size={28} /></span>
        <strong>{t(workspace.busy ? 'Preparing project…' : 'New creation')}</strong>
      </button>
      <section className="motion-recent" aria-labelledby="recent-projects-title">
        <div className="motion-section-heading"><h2 id="recent-projects-title">{t('Recent conversations')}<span>{sessions.length}</span></h2>
          {sessions.length > 3 && <button className="motion-button motion-button-quiet" aria-expanded={showAll} onClick={() => setShowAll(all => !all)}>{t(showAll ? 'Show less' : 'View all')}<MotionIcon name="arrow-right" size={14} /></button>}
        </div>
        <div className="motion-recent-grid">
          {(showAll ? sessions : sessions.slice(0, 3)).map(project => <button className="motion-recent-project" key={project.id} disabled={switchingDisabled} onClick={() => void workspace.openSession(project.id)}>
            <span className="motion-project-monogram"><MotionIcon name="film" size={24} /></span><span><strong>{project.title}</strong><small>{project.openedAt || project.createdAt ? formatDate((project.openedAt || project.createdAt)!, { month: 'short', day: 'numeric' }) : t('Local project')}</small></span><MotionIcon name="arrow-up-right" />
          </button>)}
        </div>
        {!sessions.length && <p className="motion-home-empty">{t(workspace.status ? 'Your conversations will appear here.' : 'Loading conversations…')}</p>}
      </section>
      <HomeTemplates onSelect={selected => { setTemplate(selected); document.getElementById('home-creative-request')?.focus(); }} />
    </div></main>
    <HomeComposer template={template} onClear={() => setTemplate(undefined)} />
  </div>;
}
