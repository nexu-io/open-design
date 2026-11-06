import { I18nProvider, useI18n } from "../i18n/I18n";
import { useEffect, useState, type ReactNode } from 'react';
import { useStudioShellContext } from '../contexts/StudioContext';
import { Dock } from '../components/dock/Dock';
import { useDockLayoutStore } from '../components/dock/dockLayoutStore';
import { TimelineHistoryButtons } from '../components/TimelineHistoryButtons';
import { isStudioEditSaving } from '../utils/studioPendingEdits';
import { MotionIcon } from './icons';
import { StudioHostContext, type StudioHost } from './StudioHost';
import { WorkspaceFrame, useWorkspaceChrome, useOptionalWorkspaceChrome } from './WorkspaceFrame';
import { MotionLayoutMenu, MotionPreviewButton } from './MotionLayoutControls';
import { MotionHistoryPanel } from './MotionHistoryPanel';
import { MotionHistoryProvider, useMotionHistoryOperation } from './MotionHistoryState';
import { MediaGatewayProvider, useMediaGateway } from './MediaGatewayContext';
import { workspacePresentation } from '../../../shared/workspace-url';

export function MotionEditorFrame({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { projectId, waitForPendingDomEditSaves, writeBlockedReason, renderQueue } = useStudioShellContext();
  const historyOperation = useMotionHistoryOperation();
  const chrome = useOptionalWorkspaceChrome();
  const register = chrome?.registerEditor;
  const [saving, setSaving] = useState(isStudioEditSaving);
  useEffect(() => {
    const timer = window.setInterval(() => setSaving(isStudioEditSaving()), 250);
    return () => clearInterval(timer);
  }, []);
  const blocked = renderQueue.isRendering || historyOperation.busy || Boolean(writeBlockedReason);
  const saveState = t(historyOperation.busy ? 'Updating version…' : renderQueue.isRendering ? 'Rendering…' : writeBlockedReason ? 'Needs attention' : saving ? 'Saving…' : 'Local autosave');
  useEffect(() => {
    register?.({ waitForSaves: waitForPendingDomEditSaves, blocked, saveState, message: writeBlockedReason || '' });
    return () => register?.(null);
  }, [register, waitForPendingDomEditSaves, blocked, saveState, writeBlockedReason]);
  const editor = <MediaGatewayProvider>{children}</MediaGatewayProvider>;
  if (chrome) return editor;
  return <WorkspaceFrame projectId={projectId} waitForSaves={waitForPendingDomEditSaves} blocked={blocked} message={writeBlockedReason || ''} saveState={saveState}>{editor}</WorkspaceFrame>;
}

function WorkspaceProject() {
  const { t } = useI18n();
  const { workspace, switchingDisabled, saveState } = useWorkspaceChrome();
  const activate = useDockLayoutStore(state => state.activatePanel);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const project = workspace.projects.find(item => item.id === workspace.status?.projectId);
  return <span className="motion-project-control">
    <span className="motion-project-dot" aria-hidden="true" />
    {editing ? <form className="motion-project-rename" onSubmit={async event => {
      event.preventDefault();
      if (project && await workspace.rename(project.id, title)) setEditing(false);
    }}>
      <input autoFocus maxLength={100} aria-label={t('Project name')} value={title} disabled={workspace.busy} onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setEditing(false); }} />
      <button className="motion-icon-button" aria-label={t('Save project name')} disabled={workspace.busy || !title.trim()}><MotionIcon name="check" /></button>
      <button type="button" className="motion-icon-button" aria-label={t('Cancel')} disabled={workspace.busy} onClick={() => setEditing(false)}><MotionIcon name="close" /></button>
    </form> : <button className="motion-project-title" disabled={switchingDisabled || !project} title={t('Rename project')} onClick={() => { setTitle(project?.title || ''); setEditing(true); }}>{project?.title || t('Connecting…')}<MotionIcon name="edit" size={12} /></button>}
    <button type="button" className="motion-save-state" title={t("View version history")} aria-label={t('{status}, view version history', { status: saveState })}
      onClick={() => activate('history')}><span role="status">{saveState}</span><MotionIcon name="chevron-down" size={12} /></button>
  </span>;
}

function WorkspaceHistoryActions() {
  const { t } = useI18n();
  const activate = useDockLayoutStore(state => state.activatePanel);
  const operation = useMotionHistoryOperation();
  return <div className="motion-history-actions">
    <TimelineHistoryButtons canUndo={operation.busy ? false : undefined} canRedo={operation.busy ? false : undefined} />
    <button type="button" className="motion-button motion-button-quiet" aria-label={t("Version history")} onClick={() => activate('history')}>
      <MotionIcon name="history" size={14} /><span>{t("History")}</span>
    </button>
  </div>;
}

function WorkspaceActions() {
  const { t } = useI18n();
  const gateway = useMediaGateway();
  const { switchingDisabled, openLibrary } = useWorkspaceChrome();
  return <div className="motion-workspace-actions">
    {workspacePresentation(location.search).embedded && <button className="motion-button motion-button-quiet" aria-haspopup="dialog" onClick={gateway?.openSettings}><MotionIcon name="sliders" />{t("Model settings")}</button>}
    <button className="motion-button motion-button-quiet" aria-haspopup="dialog" disabled={switchingDisabled} onClick={openLibrary}><MotionIcon name="grid" />{t("Template library")}</button>
  </div>;
}

const host: StudioHost = {
  brand: <></>,
  projectLabel: <WorkspaceProject />,
  headerActions: <WorkspaceActions />,
  historyActions: <WorkspaceHistoryActions />,
  previewAction: <MotionPreviewButton />,
  windowMenu: <MotionLayoutMenu />,
  themeToggle: false,
  panels: <Dock.Panel id="history"><MotionHistoryPanel /></Dock.Panel>,
  AppFrame: MotionEditorFrame,
  desktopLink: false,
  feedback: false,
};

export function MotionStudioHost({ children }: { children: ReactNode }) {
  return <I18nProvider><MotionHistoryProvider><StudioHostContext.Provider value={host}>{children}</StudioHostContext.Provider></MotionHistoryProvider></I18nProvider>;
}
