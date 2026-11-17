/**
 * P0-24 rule ④ for global notifications (N10, 推测项 A-06).
 *
 * The daemon decides WHICH turns are news (`RunNotice.kind`); this module
 * decides WHETHER the user needs a system notification for one right now:
 *
 *  · a question waiting for a reply → unless the user is looking at that very
 *    conversation with the window in front;
 *  · a new reply or a failure → only while the window is not in front (the
 *    sidebar mark already tells a user who is looking at the app).
 *
 * "In front" is window focus, not page visibility: the desktop window turns
 * background throttling off, which also changes how visibility is reported.
 */
import type { RunNotice } from '@open-design/contracts';

export interface NoticeViewerState {
  /** The window has focus. */
  focused: boolean;
  /** Project / conversation the window is showing, from the route. */
  projectId: string | null;
  /**
   * `null` while the project view is still picking its default conversation;
   * that view shows the project's newest conversation, so the notice's own
   * conversation counts as watched.
   */
  conversationId: string | null;
}

export function noticeNeedsNotification(notice: RunNotice, viewer: NoticeViewerState): boolean {
  if (!viewer.focused) return true;
  if (notice.kind !== 'awaiting_input') return false;
  if (viewer.projectId !== notice.projectId) return true;
  if (viewer.conversationId === null || notice.conversationId === null) return false;
  return viewer.conversationId !== notice.conversationId;
}

export interface NoticeCursor {
  epoch: string | null;
  after: number;
}

/**
 * Advance the cursor over one feed page and return what is new.
 *
 * The first page of a session and every page from a new daemon epoch only
 * move the cursor: anything already in the log ended before this client was
 * listening, and notices are never replayed (N10).
 */
export function advanceNoticeCursor(
  cursor: NoticeCursor,
  page: { epoch: string; latestSeq: number; notices: RunNotice[] },
): { cursor: NoticeCursor; fresh: RunNotice[] } {
  if (cursor.epoch !== page.epoch) {
    return { cursor: { epoch: page.epoch, after: page.latestSeq }, fresh: [] };
  }
  const fresh = page.notices.filter((notice) => notice.seq > cursor.after);
  return {
    cursor: { epoch: page.epoch, after: Math.max(cursor.after, page.latestSeq) },
    fresh,
  };
}
