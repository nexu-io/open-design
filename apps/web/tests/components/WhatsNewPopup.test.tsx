// @vitest-environment jsdom

/**
 * The post-update what's-new card fetches once Home is the active entry view,
 * then shows a card when the running version has release highlights the user
 * has not seen. This suite pins the once-per-activation fetch/show decision
 * against the failure mode that shipped in review: an effect whose teardown
 * re-armed the fetch guard raced React's StrictMode double-invoke (and any
 * mid-flight Home toggle), swallowing the card until the view toggled again.
 */

import { StrictMode } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WhatsNewPopup } from '../../src/components/WhatsNewPopup';
import { fetchWhatsNew } from '../../src/providers/registry';
import { WHATS_NEW_LAST_SEEN_STORAGE_KEY } from '../../src/lib/whats-new';
import { I18nProvider } from '../../src/i18n';
import type { WhatsNewResponse } from '../../src/types';

vi.mock('../../src/providers/registry', () => ({
  fetchWhatsNew: vi.fn(),
  openExternalUrl: vi.fn(),
}));

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}));

const mockedFetchWhatsNew = fetchWhatsNew as unknown as ReturnType<typeof vi.fn>;

const SHOW_PAYLOAD: WhatsNewResponse = {
  version: '0.12.1',
  id: '0.12.1',
  content: {
    title: 'Design system sync',
    body: 'Import, edit and sync design systems.',
    linkUrl: 'https://open-design.ai/blog/0-12-1/',
  },
};

function renderCard(active: boolean, { strict }: { strict?: boolean } = {}) {
  const tree = (
    <I18nProvider>
      <WhatsNewPopup active={active} />
    </I18nProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
});

beforeEach(() => {
  // A highlight id the user has not seen yet → decision resolves to "show".
  window.localStorage.setItem(WHATS_NEW_LAST_SEEN_STORAGE_KEY, '0.11.0');
});

describe('WhatsNewPopup fetch/show lifecycle', () => {
  it('shows the card under StrictMode double-invoke (no swallow on effect re-run)', async () => {
    mockedFetchWhatsNew.mockResolvedValue(SHOW_PAYLOAD);

    renderCard(true, { strict: true });

    // Regression guard: the buggy version left the fetch guard re-armed after
    // StrictMode's cleanup cancelled the first fetch, so the card never
    // rendered even though Home stayed active.
    await waitFor(() => {
      expect(screen.getByTestId('whats-new-popup')).toBeTruthy();
    });
    // Version eyebrow + release title as the main serif copy. The long body
    // is intentionally not rendered on the card.
    expect(screen.getByText('Open Design 0.12.1')).toBeTruthy();
    expect(screen.getByText('Design system sync')).toBeTruthy();
    // A non-modal, dismissible toast is a complementary landmark, NOT a dialog —
    // so it never collides with `getByRole('dialog')` (e.g. the Settings modal).
    expect(screen.getByRole('complementary', { name: 'Design system sync' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not fetch or show while Home is inactive, then shows once it activates', async () => {
    mockedFetchWhatsNew.mockResolvedValue(SHOW_PAYLOAD);

    const { rerender } = renderCard(false);
    await act(async () => {});
    expect(mockedFetchWhatsNew).not.toHaveBeenCalled();
    expect(screen.queryByTestId('whats-new-popup')).toBeNull();

    rerender(
      <I18nProvider>
        <WhatsNewPopup active />
      </I18nProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('whats-new-popup')).toBeTruthy();
    });
  });

  it('retries on the next activation when Home is left mid-fetch', async () => {
    let resolveFirst: ((value: WhatsNewResponse) => void) | undefined;
    mockedFetchWhatsNew
      .mockImplementationOnce(
        () =>
          new Promise<WhatsNewResponse>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValue(SHOW_PAYLOAD);

    const { rerender } = renderCard(true);
    // Leave Home while the first fetch is still in flight.
    rerender(
      <I18nProvider>
        <WhatsNewPopup active={false} />
      </I18nProvider>,
    );
    await act(async () => {
      resolveFirst?.(SHOW_PAYLOAD);
    });
    // The card must not appear while Home is inactive.
    expect(screen.queryByTestId('whats-new-popup')).toBeNull();

    // Returning to Home re-runs the decision and surfaces the card.
    rerender(
      <I18nProvider>
        <WhatsNewPopup active />
      </I18nProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId('whats-new-popup')).toBeTruthy();
    });
  });
});
