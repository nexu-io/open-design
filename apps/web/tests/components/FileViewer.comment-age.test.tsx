// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CommentSidePanel } from '../../src/components/FileViewer';
import type { PreviewComment } from '../../src/types';
import type { useT } from '../../src/i18n';

// Local noon keeps the hour bucket on the same calendar day in every test timezone.
const NOW = new Date(2026, 9, 14, 12, 0, 0).getTime();
const t: ReturnType<typeof useT> = (key, params) => `${key}${params?.n === undefined ? '' : `:${params.n}`}`;
const comment = (age: number): PreviewComment => ({
  id: 'share-comment', projectId: 'p1', conversationId: 'conv-local', filePath: 'index.html',
  elementId: 'hero', selector: '#hero', label: 'Hero', text: 'Hero', htmlHint: '<h1>',
  position: { x: 1, y: 2, width: 3, height: 4 }, note: 'Share feedback', status: 'open',
  authorKind: 'user', authorAppUserId: 'synthetic-account', authorDisplayName: 'Visitor',
  createdAt: NOW - age, updatedAt: NOW, pinSeq: 3,
});
const panel = (comments: PreviewComment[], collapsed = false) => <CommentSidePanel
  comments={comments} selectedIds={new Set()} activeCommentId={null} collapsed={collapsed}
  onCollapsedChange={() => {}} onToggleSelect={() => {}} onSelectAll={() => {}}
  onClearSelection={() => {}} onReply={() => {}} onSendSelected={() => {}}
  sending={false} t={t} />;
const time = () => screen.getByTestId('comment-side-item').querySelector('.comment-side-time')!;

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it.each([[57 * 60_000, 'common.minutesAgo:57'], [2 * 3_600_000, 'common.hoursAgo:2']])(
  '3888: renders original creation age (%i ms), not the latest update/receive time', (age, label) => {
    const original = comment(age);
    const view = render(panel([original]));
    expect(time()).toHaveTextContent(label);
    expect(time()).toHaveAttribute('title', new Date(original.createdAt).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
    expect(screen.getByTestId('comment-side-item')).toHaveTextContent(original.note);
    view.rerender(panel([{ ...original, updatedAt: NOW + 60_000 }]));
    expect(time()).toHaveTextContent(label);
    view.unmount();
    render(panel([original]));
    expect(time()).toHaveTextContent(label);
  },
);

it.each([0, -1, NaN, Infinity, undefined])('3888: unknown creation time %s never borrows a recent update time', createdAt => {
  const unknown = comment(2 * 3_600_000);
  Reflect.set(unknown, 'createdAt', createdAt);
  const view = render(panel([unknown]));
  expect(time()).toHaveTextContent('—');
  expect(time()).not.toHaveAttribute('title');
  expect(time()).not.toHaveTextContent('common.justNow');
  act(() => vi.advanceTimersByTime(60_000));
  expect(time()).toHaveTextContent('—');
  view.rerender(panel([{ ...unknown, createdAt: NOW - 2 * 3_600_000 }]));
  expect(time()).toHaveTextContent('common.hoursAgo:2');
  expect(time()).toHaveAttribute('title');
});

it('3888: an unchanged open panel advances just-now → minutes → hours with a controlled clock', () => {
  const original = comment(0);
  render(panel([original]));
  expect(time()).toHaveTextContent('common.justNow');
  act(() => vi.advanceTimersByTime(59_999));
  expect(time()).toHaveTextContent('common.justNow');
  act(() => vi.advanceTimersByTime(1));
  expect(time()).toHaveTextContent('common.minutesAgo:1');
  act(() => vi.advanceTimersByTime(59 * 60_000));
  expect(time()).toHaveTextContent('common.hoursAgo:1');
  expect(original.createdAt).toBe(NOW);
});

it('3888: reopening a collapsed panel refreshes the clock and unmount releases its timer', () => {
  const original = comment(0);
  const view = render(panel([original]));
  view.rerender(panel([original], true));
  act(() => vi.advanceTimersByTime(2 * 3_600_000));
  view.rerender(panel([original]));
  expect(time()).toHaveTextContent('common.hoursAgo:2');
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
