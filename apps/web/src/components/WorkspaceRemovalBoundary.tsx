import { useWorkspaceJourney } from '../analytics/use-workspace-journey';
import { Button } from '@open-design/components';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { WorkspaceActiveResponse } from '@open-design/contracts';
import { useT } from '../i18n';
import { navigate } from '../router';
import { notifyWorkspaceContextRefresh, readWorkspaceDirectoryForCurrentGeneration, useWorkspaceContext } from '../collab/useWorkspaceContext';
import { currentWorkspaceRemoval, useWorkspaceRemoval } from '../collab/workspace-removal';
import styles from './WorkspaceRemovalBoundary.module.css';

/** Mounted above every route: a removed Workspace's project content is unmounted
 * immediately. Only the verified terminal event can enter this state. */
export function WorkspaceRemovalBoundary({ children }: { children: ReactNode }) {
  useWorkspaceContext();
  const notice = useWorkspaceRemoval();
  const journey = useWorkspaceJourney({ page_name: 'home', area: 'workspace_membership_removed', ...(notice ? { workspace_key: notice.workspaceId } : {}) }, Boolean(notice));
  const t = useT();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setPending(false);
    setFailed(false);
    if (notice) button.current?.focus();
  }, [notice]);
  if (!notice) return children;
  async function confirm() {
    if (!notice || pending) return;
    journey.click('return_personal_workspace');
    const captured = notice;
    setPending(true);
    setFailed(false);
    try {
      const directory = await readWorkspaceDirectoryForCurrentGeneration({ fresh: true });
      if (currentWorkspaceRemoval() !== captured) return;
      const defaults = directory.items.filter(item => item.isDefault === true
        && item.memberStatus === 'active'
        && ['active', 'billing_past_due'].includes(item.lifecycleState)
        && item.workspaceId !== captured.workspaceId);
      if (defaults.length !== 1) throw new Error('Verified default workspace unavailable');
      const target = defaults[0]!;
      const response = await fetch('/api/workspace/active', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceId: target.workspaceId, workspaceMemberId: target.workspaceMemberId }),
      });
      if (!response.ok) throw new Error('Workspace recovery failed');
      const { context } = await response.json() as WorkspaceActiveResponse;
      if (currentWorkspaceRemoval() !== captured) return;
      if (!context || context.workspaceId !== target.workspaceId
        || context.workspaceMemberId !== target.workspaceMemberId
        || context.memberStatus !== 'active'
        || !['active', 'billing_past_due'].includes(context.lifecycleState)) {
        throw new Error('Workspace recovery identity mismatch');
      }
      // Route away from the old project BEFORE publishing the verified identity.
      navigate({ kind: 'home', view: 'home' }, { replace: true });
      notifyWorkspaceContextRefresh({ context });
    } catch {
      if (currentWorkspaceRemoval() === captured) setFailed(true);
    } finally {
      if (currentWorkspaceRemoval() === captured) setPending(false);
    }
  }
  return <div className={styles.surface}>
    <div className={styles.backdrop}>
      <section className={styles.dialog} role="alertdialog" aria-modal="true" aria-labelledby="workspace-removal-title" aria-describedby="workspace-removal-message" onKeyDown={event => { if (event.key === 'Tab') { event.preventDefault(); button.current?.focus(); } }}>
        <h2 id="workspace-removal-title">{t('workspaceRemoval.title', { name: notice.workspaceName })}</h2>
        <p id="workspace-removal-message">{t('workspaceRemoval.description')}</p>
        {failed ? <p className={styles.error} role="alert">{t('workspaceRemoval.retry')}</p> : null}
        <div className={styles.actions}><Button ref={button} className={styles.confirm} variant="primary" type="button" disabled={pending} onClick={() => void confirm()}>{t('workspaceRemoval.confirm')}</Button></div>
      </section>
    </div>
  </div>;
}
