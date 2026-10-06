// @vitest-environment jsdom
//
// Archiving is the Message Center's third per-message state (unread → read →
// archived). It has no server field behind it — the vela message model carries
// only `readAt` — so the whole contract lives in this component plus the local
// id set: an archived message leaves the inbox, stops badging the bell, and is
// reachable (and reversible) through the header's shelf toggle.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MessageCenterMessage } from '../../src/message-center-client';

const state = vi.hoisted(() => ({ archived: new Set<string>() }));

const message = (id: string, readAt: string | null = null): MessageCenterMessage => ({
  id,
  audienceType: 'global',
  typeName: 'Announcement',
  title: `Message ${id}`,
  body: `Body ${id}`,
  ctaLabel: null,
  ctaUrl: null,
  publishedAt: '2026-08-01T00:00:00.000Z',
  readAt,
});

vi.mock('../../src/message-center-client', () => ({
  isAmrLoggedIn: vi.fn(async () => false),
  pullMessageCenter: vi.fn(async () => [message('a'), message('b')]),
  markAccountMessageRead: vi.fn(async () => {}),
  readAnonymousMessages: () => [],
  readAnonymousReadIds: () => new Set<string>(),
  writeAnonymousState: () => {},
  clearAnonymousState: () => {},
  readArchivedIds: () => new Set(state.archived),
  writeArchivedIds: (_storage: Storage, ids: Set<string>) => {
    state.archived = new Set(ids);
  },
}));

import { MessageCenter } from '../../src/components/MessageCenter';

beforeEach(() => {
  state.archived = new Set();
});

afterEach(cleanup);

async function renderPanel(onUnreadCountChange = vi.fn()) {
  render(<MessageCenter open hideTrigger onUnreadCountChange={onUnreadCountChange} />);
  await waitFor(() => expect(screen.getAllByRole('article').length).toBe(2));
  return onUnreadCountChange;
}

function articles() {
  return screen.queryAllByRole('article');
}

/** `getAllByTestId(...)[0]` is `HTMLElement | undefined` under the repo's
 *  `noUncheckedIndexedAccess`, and a missing button is a real failure worth
 *  naming rather than a type cast. */
function firstArchiveButton(): HTMLElement {
  const [button] = screen.getAllByTestId('message-center-archive');
  if (!button) throw new Error('expected an archive button to be rendered');
  return button;
}

describe('MessageCenter archiving', () => {
  it('moves a message onto the archived shelf and back', async () => {
    await renderPanel();

    fireEvent.click(firstArchiveButton());
    await waitFor(() => expect(articles()).toHaveLength(1));

    // The shelf toggle only appears once something is archived — it is the way
    // back, so an archive that hides a message without it would read as delete.
    fireEvent.click(screen.getByTestId('message-center-shelf-toggle'));
    await waitFor(() => expect(articles()).toHaveLength(1));
    expect(screen.getByText('Message a')).toBeTruthy();

    fireEvent.click(firstArchiveButton());
    await waitFor(() => expect(articles()).toHaveLength(0));

    fireEvent.click(screen.getByTestId('message-center-shelf-toggle'));
    await waitFor(() => expect(articles()).toHaveLength(2));
  });

  it('drops archived messages from the unread count', async () => {
    const onUnreadCountChange = await renderPanel();
    await waitFor(() => expect(onUnreadCountChange).toHaveBeenLastCalledWith(2));

    fireEvent.click(firstArchiveButton());

    await waitFor(() => expect(onUnreadCountChange).toHaveBeenLastCalledWith(1));
  });

  it('persists the archive through the local id set', async () => {
    await renderPanel();
    fireEvent.click(firstArchiveButton());
    await waitFor(() => expect([...state.archived]).toEqual(['a']));

    cleanup();
    // Not `renderPanel` here: that helper waits for a full inbox, and the point
    // of this remount is that one message is already put away.
    render(<MessageCenter open hideTrigger />);

    // Remounting reads the set back, so the message stays put away.
    await waitFor(() => expect(articles()).toHaveLength(1));
    expect(screen.getByText('Message b')).toBeTruthy();
  });
});
