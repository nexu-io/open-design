import { describe, expect, it } from 'vitest';
import type { RunNotice } from '@open-design/contracts';
import { advanceNoticeCursor, noticeNeedsNotification } from '../../src/runtime/global-run-notices';

const notice = (over: Partial<RunNotice> = {}): RunNotice => ({
  seq: 1, runId: 'r1', projectId: 'pa', projectName: 'A', conversationId: 'ca', kind: 'new_reply', at: 1, ...over,
});

describe('noticeNeedsNotification · P0-24 rule ④', () => {
  it('window not in front: every kind is announced', () => {
    const away = { focused: false, projectId: 'pa', conversationId: 'ca' };
    for (const kind of ['new_reply', 'failed', 'awaiting_input'] as const) {
      expect(noticeNeedsNotification(notice({ kind }), away)).toBe(true);
    }
  });

  it('window in front: a reply or a failure is left to the sidebar mark', () => {
    const home = { focused: true, projectId: null, conversationId: null };
    expect(noticeNeedsNotification(notice({ kind: 'new_reply' }), home)).toBe(false);
    expect(noticeNeedsNotification(notice({ kind: 'failed' }), home)).toBe(false);
  });

  it('window in front: a question is announced unless that conversation is on screen', () => {
    const q = notice({ kind: 'awaiting_input' });
    expect(noticeNeedsNotification(q, { focused: true, projectId: null, conversationId: null })).toBe(true);
    expect(noticeNeedsNotification(q, { focused: true, projectId: 'pb', conversationId: 'cb' })).toBe(true);
    expect(noticeNeedsNotification(q, { focused: true, projectId: 'pa', conversationId: 'other' })).toBe(true);
    expect(noticeNeedsNotification(q, { focused: true, projectId: 'pa', conversationId: 'ca' })).toBe(false);
    // The project view still picking its default conversation shows the newest one.
    expect(noticeNeedsNotification(q, { focused: true, projectId: 'pa', conversationId: null })).toBe(false);
  });
});

describe('advanceNoticeCursor · never replay', () => {
  it('the first page only moves the cursor', () => {
    const page = { epoch: 'e1', latestSeq: 5, notices: [notice({ seq: 4 }), notice({ seq: 5 })] };
    expect(advanceNoticeCursor({ epoch: null, after: 0 }, page)).toEqual({
      cursor: { epoch: 'e1', after: 5 }, fresh: [],
    });
  });

  it('later pages return what is new', () => {
    const page = { epoch: 'e1', latestSeq: 7, notices: [notice({ seq: 6 }), notice({ seq: 7 })] };
    const next = advanceNoticeCursor({ epoch: 'e1', after: 5 }, page);
    expect(next.fresh.map((n) => n.seq)).toEqual([6, 7]);
    expect(next.cursor).toEqual({ epoch: 'e1', after: 7 });
  });

  it('a daemon restart (new epoch) shows nothing and resumes from its head', () => {
    const page = { epoch: 'e2', latestSeq: 2, notices: [notice({ seq: 1 }), notice({ seq: 2 })] };
    expect(advanceNoticeCursor({ epoch: 'e1', after: 9 }, page)).toEqual({
      cursor: { epoch: 'e2', after: 2 }, fresh: [],
    });
  });

  it('the cursor moves past notices the daemon hid for this identity', () => {
    const page = { epoch: 'e1', latestSeq: 9, notices: [] };
    expect(advanceNoticeCursor({ epoch: 'e1', after: 5 }, page).cursor.after).toBe(9);
  });
});
