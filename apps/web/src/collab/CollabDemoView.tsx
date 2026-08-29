import { useEffect, useMemo, useRef, useState } from 'react';
import type { CollabMemberRole } from '@open-design/contracts';
import { navigate } from '../router';
import { useCollab } from './useCollab';
import { useWorkspaceContext } from './useWorkspaceContext';
import { workspaceProjectHeaders } from './workspace-identity';
import { PresenceBar } from './PresenceBar';
import { CommentDriftDemo } from './CommentDriftDemo';
import styles from './CollabDemoView.module.css';

const ROLES: CollabMemberRole[] = ['owner', 'admin', 'member'];

// A stable per-tab member id so two browser tabs joining the same project show
// up as distinct members in the presence overlay. NOT a real B identity — the
// demo fabricates it (see the banner). crypto.randomUUID is available in every
// runtime that ships this app; fall back defensively.
function makeDemoMemberId(): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${performance.now().toString(36)}`;
  return `demo-${uuid.slice(0, 8)}`;
}

// Reuse one id per tab (sessionStorage survives reload but not a tab close), so
// reloading the demo doesn't pile up a fresh "Demo member" each time while two
// distinct tabs still get distinct identities.
const DEMO_MEMBER_ID_KEY = 'od-collab-demo-member-id';
function demoMemberId(): string {
  try {
    const existing = sessionStorage.getItem(DEMO_MEMBER_ID_KEY);
    if (existing) return existing;
    const id = makeDemoMemberId();
    sessionStorage.setItem(DEMO_MEMBER_ID_KEY, id);
    return id;
  } catch {
    return makeDemoMemberId();
  }
}

/**
 * Team collaboration demo surface. Drives the live presence + sync loop
 * against the real daemon routes so the flow can be seen end-to-end: open this
 * page in two tabs on the same project id and each tab appears in the other's
 * presence overlay; an author publish advances the version both tabs poll.
 *
 * The ONLY stubs are the member identity and the "shared" entry — real B
 * identity (token → memberId) and D visibility are not wired. Everything the
 * daemon does here (presence set, coalesced publish, version head) is real.
 */
export function CollabDemoView({ projectId }: { projectId: string | null }) {
  const [projectInput, setProjectInput] = useState(projectId ?? '');
  const [name, setName] = useState('Demo member');
  const [role, setRole] = useState<CollabMemberRole>('member');
  const memberIdRef = useRef<string>('');
  if (!memberIdRef.current) memberIdRef.current = demoMemberId();

  const activeProjectId = projectId?.trim() || null;
  const { context: workspaceContext } = useWorkspaceContext();
  const member = useMemo(
    () => ({ memberId: memberIdRef.current, name: name.trim() || 'Demo member', role }),
    [name, role],
  );

  const { present, publishedVersion, syncState, reportChange, requestPublish } = useCollab({
    projectId: activeProjectId,
    member,
    workspaceContext,
    enabled: Boolean(activeProjectId),
  });

  const shareToTeam = async () => {
    if (!activeProjectId || !workspaceContext) return;
    const requestContext = workspaceContext;
    await fetch(`/api/projects/${encodeURIComponent(activeProjectId)}/collab/sync-intent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...workspaceProjectHeaders(requestContext),
      },
      body: JSON.stringify({ event: 'project_team_share_requested', projectId: activeProjectId }),
    });
  };

  // Track the version this tab has "pulled" so we can surface an out-of-date
  // prompt when the author publishes a newer head — the member's pull cue.
  const [pulledVersion, setPulledVersion] = useState<number | null>(null);
  useEffect(() => {
    // First observed version is treated as already-pulled (nothing to catch up on).
    if (publishedVersion !== null && pulledVersion === null) setPulledVersion(publishedVersion);
  }, [publishedVersion, pulledVersion]);
  const behind = publishedVersion !== null && pulledVersion !== null && publishedVersion > pulledVersion;
  const presentCount = activeProjectId
    ? new Set([member.memberId, ...present.map((presentMember) => presentMember.memberId)]).size
    : 0;

  return (
    <div className={styles.view}>
      <div className={styles.banner} role="note">
        <strong>Collaboration demo</strong> — presence &amp; sync run live against the daemon.
        The member identity and “shared session” entry are <em>stubbed</em>; real B identity and D
        visibility are not wired yet.
      </div>

      {!activeProjectId ? (
        <form
          className={styles.picker}
          onSubmit={(event) => {
            event.preventDefault();
            const id = projectInput.trim();
            if (id) navigate({ kind: 'collab-demo', projectId: id });
          }}
        >
          <label className={styles.field}>
            <span>Project id</span>
            <input
              value={projectInput}
              onChange={(event) => setProjectInput(event.target.value)}
              placeholder="paste a project id to join"
              autoFocus
            />
          </label>
          <button type="submit" disabled={!projectInput.trim()}>
            Join
          </button>
        </form>
      ) : (
        <div className={styles.session}>
          <div className={styles.row}>
            <span className={styles.label}>Project</span>
            <code className={styles.mono}>{activeProjectId}</code>
            <button type="button" className={styles.leave} onClick={() => navigate({ kind: 'collab-demo', projectId: null })}>
              Leave
            </button>
          </div>

          <div className={styles.row}>
            <span className={styles.label}>You (demo)</span>
            <input
              className={styles.nameInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Demo member name"
            />
            <select value={role} onChange={(event) => setRole(event.target.value as CollabMemberRole)} aria-label="Demo member role">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.row}>
            <span className={styles.label}>Present</span>
            <PresenceBar members={present} selfMember={member} selfMemberId={member.memberId} />
            <span className={styles.count}>{presentCount} online</span>
          </div>

          <div className={styles.row}>
            <span className={styles.label}>Published head</span>
            <code className={styles.mono}>{publishedVersion ?? '—'}</code>
            {behind && (
              <button type="button" className={styles.pull} onClick={() => setPulledVersion(publishedVersion)}>
                Pull v{publishedVersion}
              </button>
            )}
          </div>

          <div className={styles.row}>
            <span className={styles.label}>Sync state</span>
            <span className={styles.badge} data-anchor-state={syncState === 'sync_failed' ? 'lost' : syncState === 'synced' ? 'anchored' : 'stale'}>
              {syncState ?? '—'}
            </span>
          </div>

          <div className={styles.actions}>
            <span className={styles.label}>Author</span>
            <button type="button" onClick={() => reportChange()}>
              Report change
            </button>
            <button type="button" onClick={() => requestPublish()}>
              Publish
            </button>
            <button type="button" onClick={() => void shareToTeam()}>
              Share to team 
            </button>
          </div>
        </div>
      )}

      <CommentDriftDemo />
    </div>
  );
}
