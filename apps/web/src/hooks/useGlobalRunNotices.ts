/**
 * Global system notifications for turns that end anywhere on this machine
 * (P0-24 N10, 推测项 A-06).
 *
 * Mounted once at the app root, desktop only. Every `POLL_MS` it reads the
 * daemon's notice feed after its cursor and, per rule ④
 * (`noticeNeedsNotification`), shows a system notification — whichever page,
 * project or Workspace the user is on. The per-conversation notifier in
 * `ProjectView` stands down on the desktop so a turn is announced once.
 *
 * Polling, not a push stream: one more long-lived connection competes with the
 * per-turn streams for the browser's per-host limit, and a cursor over a
 * sequence cannot miss a notice while the client runs. See the N10 design doc.
 */
import { useEffect, useRef } from 'react';
import type { RunNotice, WorkspaceCollabContext } from '@open-design/contracts';
import { fetchRunNotices } from '../providers/daemon';
import { navigate, parseRoute } from '../router';
import {
  advanceNoticeCursor,
  noticeNeedsNotification,
  type NoticeCursor,
} from '../runtime/global-run-notices';
import { workspaceProjectHeaders } from '../collab/workspace-identity';
import { playSound, showCompletionNotification } from '../utils/notifications';
import type { NotificationsConfig } from '../types';
import type { Dict } from '../i18n/types';

const POLL_MS = 3_000;
/** Notification title when the project's name is unknown. A product name, not copy. */
const FALLBACK_TITLE = 'Open Design';

export interface UseGlobalRunNoticesOptions {
  enabled: boolean;
  workspaceContext: WorkspaceCollabContext | null;
  notifications: NotificationsConfig;
  t: (key: keyof Dict) => string;
}

export function useGlobalRunNotices(options: UseGlobalRunNoticesOptions): void {
  // Read at fire time: these objects are rebuilt on unrelated renders, and the
  // poll must not restart (and re-arm its "first page shows nothing") for it.
  const latest = useRef(options);
  latest.current = options;
  const workspaceKey = options.workspaceContext
    ? `${options.workspaceContext.workspaceId}:${options.workspaceContext.workspaceMemberId}`
    : 'none';

  useEffect(() => {
    if (!options.enabled || typeof window === 'undefined') return undefined;
    let cursor: NoticeCursor = { epoch: null, after: 0 };
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      const { workspaceContext } = latest.current;
      const page = await fetchRunNotices(cursor.after, workspaceContext);
      if (stopped) return;
      if (page) {
        const next = advanceNoticeCursor(cursor, page);
        cursor = next.cursor;
        for (const notice of next.fresh) announce(notice);
      }
      timer = setTimeout(() => { void tick(); }, POLL_MS);
    };

    const announce = (notice: RunNotice) => {
      const { notifications, t, workspaceContext } = latest.current;
      if (!notifications.desktopEnabled) return;
      const route = parseRoute(window.location.pathname);
      const viewer = {
        focused: document.hasFocus(),
        projectId: route.kind === 'project' ? route.projectId : null,
        conversationId: route.kind === 'project' ? route.conversationId ?? null : null,
      };
      if (!noticeNeedsNotification(notice, viewer)) return;
      const status = notice.kind === 'failed' ? 'failed' : 'succeeded';
      // Fixed copy, never reply text: the feed carries none.
      const body = notice.kind === 'failed'
        ? t('notify.runFailedBody')
        : notice.kind === 'awaiting_input'
          ? t('notify.needsReplyBody')
          : t('notify.newReplyBody');
      void showCompletionNotification({
        status,
        title: notice.projectName ?? FALLBACK_TITLE,
        body,
        tag: `od-run-${notice.runId}`,
        onClick: () => { void openNoticeTarget(notice, workspaceContext); },
      }).then((result) => {
        if (result === 'shown' && notifications.soundEnabled) {
          playSound(status === 'succeeded' ? notifications.successSoundId : notifications.failureSoundId);
        }
      });
    };

    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
    // A new identity changes what the feed may show; restart from its head.
  }, [options.enabled, workspaceKey]);
}

/**
 * Open the conversation a notice is about (N11). The project or the
 * conversation may have been deleted since the turn ended; then the user lands
 * on Home instead of a broken project view (scenario F7). An unreachable
 * daemon also goes Home: nothing better can be known.
 */
export async function openNoticeTarget(
  notice: Pick<RunNotice, 'projectId' | 'conversationId'>,
  workspaceContext: WorkspaceCollabContext | null,
): Promise<void> {
  let exists = false;
  try {
    const resp = await fetch(`/api/projects/${encodeURIComponent(notice.projectId)}/conversations`, {
      ...(workspaceContext ? { headers: workspaceProjectHeaders(workspaceContext) } : {}),
    });
    if (resp.ok) {
      const body = (await resp.json()) as { conversations?: { id?: string }[] };
      const conversations = Array.isArray(body.conversations) ? body.conversations : [];
      exists = notice.conversationId === null
        || conversations.some((conversation) => conversation?.id === notice.conversationId);
    }
  } catch {
    exists = false;
  }
  if (!exists) {
    navigate({ kind: 'home', view: 'home' });
    return;
  }
  navigate({
    kind: 'project',
    projectId: notice.projectId,
    conversationId: notice.conversationId,
    fileName: null,
  });
}
