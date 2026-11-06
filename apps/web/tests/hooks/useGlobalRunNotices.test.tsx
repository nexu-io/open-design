// @vitest-environment jsdom
// P0-24 N10: the app-root poller turns new feed entries into one system
// notification each, never replays, and a click opens the conversation or Home.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { RunNotice } from '@open-design/contracts';

const show = vi.fn(async () => 'shown' as const);
const sound = vi.fn();
vi.mock('../../src/utils/notifications', () => ({
  showCompletionNotification: (...args: unknown[]) => show(...(args as [])),
  playSound: (...args: unknown[]) => sound(...(args as [])),
}));
const navigate = vi.fn();
vi.mock('../../src/router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/router')>()),
  navigate: (...args: unknown[]) => navigate(...args),
}));

import { openNoticeTarget, useGlobalRunNotices } from '../../src/hooks/useGlobalRunNotices';

const notice = (seq: number, over: Partial<RunNotice> = {}): RunNotice => ({
  seq, runId: `run-${seq}`, projectId: 'pa', projectName: 'Book club', conversationId: 'ca', kind: 'new_reply', at: seq, ...over,
});

let pages: { epoch: string; latestSeq: number; notices: RunNotice[] }[] = [];
const fetchMock = vi.fn(async (url: string) => {
  if (url.startsWith('/api/run-notices')) {
    const after = Number(new URL(url, 'http://x').searchParams.get('after'));
    const page = pages.shift() ?? { epoch: 'e1', latestSeq: after, notices: [] };
    return new Response(JSON.stringify(page), { status: 200 });
  }
  return new Response('{}', { status: 404 });
});

const notifications = {
  desktopEnabled: true, soundEnabled: true, successSoundId: 'ding', failureSoundId: 'buzz',
} as never;
const t = (key: string) => `t:${key}`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  pages = [];
  show.mockClear(); sound.mockClear(); navigate.mockClear(); fetchMock.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const flush = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

describe('useGlobalRunNotices', () => {
  it('shows nothing for what was already in the log, then one notification per new turn', async () => {
    pages = [
      { epoch: 'e1', latestSeq: 2, notices: [notice(1), notice(2)] },
      { epoch: 'e1', latestSeq: 4, notices: [notice(3, { kind: 'failed' }), notice(4, { kind: 'awaiting_input', projectId: 'pb' })] },
    ];
    renderHook(() => useGlobalRunNotices({ enabled: true, workspaceContext: null, notifications, t }));
    await flush();
    expect(show).not.toHaveBeenCalled();
    await flush(3_000);
    expect(show).toHaveBeenCalledTimes(2);
    expect(show.mock.calls.map((call: any[]) => [call[0].title, call[0].body, call[0].tag, call[0].status])).toEqual([
      ['Book club', 't:notify.runFailedBody', 'od-run-run-3', 'failed'],
      ['Book club', 't:notify.needsReplyBody', 'od-run-run-4', 'succeeded'],
    ]);
    expect(String(fetchMock.mock.calls[1]![0])).toContain('after=2');
    expect(sound).toHaveBeenCalledWith('buzz');
  });

  it('desktop notifications off: nothing shows and nothing sounds', async () => {
    pages = [
      { epoch: 'e1', latestSeq: 0, notices: [] },
      { epoch: 'e1', latestSeq: 1, notices: [notice(1)] },
    ];
    const off = { ...(notifications as object), desktopEnabled: false } as never;
    renderHook(() => useGlobalRunNotices({ enabled: true, workspaceContext: null, notifications: off, t }));
    await flush();
    await flush(3_000);
    expect(show).not.toHaveBeenCalled();
    expect(sound).not.toHaveBeenCalled();
  });

  it('disabled (the web): never polls', async () => {
    renderHook(() => useGlobalRunNotices({ enabled: false, workspaceContext: null, notifications, t }));
    await flush(10_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('openNoticeTarget · N11 / F7', () => {
  beforeEach(() => { vi.useRealTimers(); });

  it('opens the conversation when it still exists', async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ conversations: [{ id: 'ca' }] }), { status: 200 }));
    await openNoticeTarget({ projectId: 'pa', conversationId: 'ca' }, null);
    expect(navigate).toHaveBeenCalledWith({ kind: 'project', projectId: 'pa', conversationId: 'ca', fileName: null });
  });

  it('goes Home when the project or the conversation was deleted', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('{}', { status: 404 }));
    await openNoticeTarget({ projectId: 'gone', conversationId: 'ca' }, null);
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ conversations: [{ id: 'other' }] }), { status: 200 }));
    await openNoticeTarget({ projectId: 'pa', conversationId: 'ca' }, null);
    expect(navigate.mock.calls).toEqual([[{ kind: 'home', view: 'home' }], [{ kind: 'home', view: 'home' }]]);
  });
});
