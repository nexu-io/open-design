// @vitest-environment jsdom

/**
 * The post-update what's-new surface: a cover-art dialog shown once per
 * highlight on the home surface after the app comes back on a new version.
 *
 * Two things this suite pins, both regressions of the placeholder card that
 * shipped in #6156:
 *  - every visible field comes from real data — the hosted highlights document
 *    (`/api/whats-new`) for cover/headline/bullets/link, and the RUNNING app
 *    version (`useAppVersion`, i.e. `/api/version`) for the title. No literal
 *    version and no hardcoded English notes.
 *  - the footer is close + open-release, so no surface pretends to perform an
 *    update. Applying an update belongs to the real updater (UpdaterPopup).
 *
 * It also keeps the original once-per-activation fetch/show guard: an effect
 * whose teardown re-armed the fetch guard raced React's StrictMode
 * double-invoke (and any mid-flight Home toggle), swallowing the card until
 * the view toggled again.
 */

import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WhatsNewPopup } from '../../src/components/WhatsNewPopup';
import { fetchWhatsNew, openExternalUrl } from '../../src/providers/registry';
import { WHATS_NEW_LAST_SEEN_STORAGE_KEY } from '../../src/lib/whats-new';
import { I18nProvider } from '../../src/i18n';
import type { WhatsNewResponse } from '../../src/types';

vi.mock('../../src/providers/registry', () => ({
  fetchWhatsNew: vi.fn(),
  openExternalUrl: vi.fn(),
}));

// `useAppVersion()` is asynchronous in production: it boots on a placeholder and
// only becomes the running version once /api/version resolves. Tests drive that
// through this mutable holder so both sides of the race are reachable.
const appVersion = vi.hoisted(() => ({ current: '0.16.1' }));
const track = vi.hoisted(() => vi.fn());

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({ track }),
  // The running version the daemon reports. Deliberately different from the
  // highlight payload's `version` field so the suite can tell which one the
  // dialog renders.
  useAppVersion: () => appVersion.current,
}));

const RUNNING_APP_VERSION = '0.16.1';

const mockedFetchWhatsNew = fetchWhatsNew as unknown as ReturnType<typeof vi.fn>;
const mockedOpenExternalUrl = openExternalUrl as unknown as ReturnType<typeof vi.fn>;

const RELEASES_INDEX_URL = 'https://github.com/nexu-io/open-design/releases';

const SHOW_PAYLOAD: WhatsNewResponse = {
  // Stale/irrelevant here: the dialog titles itself with the running version.
  version: '0.12.1',
  id: 'highlight-0-16-1',
  content: {
    title: 'Design system sync',
    body: 'Import, edit and sync design systems\nFaster canvas pan and zoom\nProject import and dark-mode contrast fixes',
    imageUrl: 'https://cdn.example.test/whats-new/0-16-1.jpg',
    linkUrl: 'https://open-design.ai/blog/0-16-1/',
  },
};

// jsdom does not fetch/decode images. Drive those independent phases explicitly.
let autoLoadCover = true;
const coverImages: CoverImage[] = [];
class CoverImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 1200;
  naturalHeight = 600;
  decode = vi.fn(() => Promise.resolve());
  private url = '';
  constructor() { coverImages.push(this); }
  set src(value: string) {
    this.url = value;
    if (autoLoadCover) void Promise.resolve().then(() => this.onload?.());
  }
  get src() { return this.url; }
}

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
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
});

beforeEach(() => {
  // A highlight id the user has not seen yet → decision resolves to "show".
  window.localStorage.setItem(WHATS_NEW_LAST_SEEN_STORAGE_KEY, 'highlight-0-15-0');
  appVersion.current = RUNNING_APP_VERSION;
  autoLoadCover = true;
  coverImages.length = 0;
  vi.stubGlobal('Image', CoverImage);
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

  it('stays hidden when the highlights document carries no content', async () => {
    mockedFetchWhatsNew.mockResolvedValue({ version: RUNNING_APP_VERSION, id: null, content: null });

    renderCard(true);
    await act(async () => {});

    expect(screen.queryByTestId('whats-new-popup')).toBeNull();
  });

  it('stays hidden once the highlight id has already been seen', async () => {
    window.localStorage.setItem(WHATS_NEW_LAST_SEEN_STORAGE_KEY, 'highlight-0-16-1');
    mockedFetchWhatsNew.mockResolvedValue(SHOW_PAYLOAD);

    renderCard(true);
    await act(async () => {});

    expect(screen.queryByTestId('whats-new-popup')).toBeNull();
  });
});

// /api/version and /api/whats-new are independent round-trips, and
// `useAppVersion()` deliberately boots on the '0.0.0' placeholder until the
// former lands (see analytics/app-version.ts). A highlights fetch that wins
// that race must never make this dialog state the placeholder — that is the
// exact invented version the surface exists to stop telling.
describe('WhatsNewPopup version resolution', () => {
  const PLACEHOLDER_VERSION = '0.0.0';

  beforeEach(() => {
    appVersion.current = PLACEHOLDER_VERSION;
    mockedFetchWhatsNew.mockResolvedValue(SHOW_PAYLOAD);
  });

  it('never paints the placeholder while /api/version is still in flight', async () => {
    renderCard(true);

    await waitFor(() => {
      expect(screen.getByTestId('whats-new-popup')).toBeTruthy();
    });
    expect(screen.getByTestId('whats-new-popup').textContent).not.toContain(PLACEHOLDER_VERSION);
    // The daemon stamps the highlights document with the running version for
    // exactly this display purpose, so it is a real source to name meanwhile.
    expect(screen.getByText(`OpenDesign ${SHOW_PAYLOAD.version} is here`)).toBeTruthy();
  });

  it('keeps the placeholder out of the surface-view analytics too', async () => {
    renderCard(true);

    await waitFor(() => {
      expect(track).toHaveBeenCalled();
    });
    const versions = track.mock.calls
      .map(([, props]) => (props as { app_version?: string } | undefined)?.app_version)
      .filter((value): value is string => typeof value === 'string');
    expect(versions.length).toBeGreaterThan(0);
    expect(versions).not.toContain(PLACEHOLDER_VERSION);
  });

  it('switches to the running version once /api/version resolves', async () => {
    const view = renderCard(true);

    await waitFor(() => {
      expect(screen.getByText(`OpenDesign ${SHOW_PAYLOAD.version} is here`)).toBeTruthy();
    });

    appVersion.current = RUNNING_APP_VERSION;
    view.rerender(
      <I18nProvider>
        <WhatsNewPopup active />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(`OpenDesign ${RUNNING_APP_VERSION} is here`)).toBeTruthy();
    });
    expect(screen.queryByText(`OpenDesign ${SHOW_PAYLOAD.version} is here`)).toBeNull();
  });

  it('waits instead of inventing one when neither source can name a version', async () => {
    mockedFetchWhatsNew.mockResolvedValue({ ...SHOW_PAYLOAD, version: '  ' });

    const view = renderCard(true);
    await act(async () => {});
    expect(screen.queryByTestId('whats-new-popup')).toBeNull();

    // …and appears as soon as the running version lands, rather than being
    // permanently swallowed.
    appVersion.current = RUNNING_APP_VERSION;
    view.rerender(
      <I18nProvider>
        <WhatsNewPopup active />
      </I18nProvider>,
    );
    await waitFor(() => {
      expect(screen.getByText(`OpenDesign ${RUNNING_APP_VERSION} is here`)).toBeTruthy();
    });
  });
});

describe('WhatsNewPopup content', () => {
  beforeEach(() => {
    mockedFetchWhatsNew.mockResolvedValue(SHOW_PAYLOAD);
  });

  it('titles the dialog with the running app version, never a literal', async () => {
    renderCard(true);

    await waitFor(() => {
      expect(screen.getByTestId('whats-new-popup')).toBeTruthy();
    });
    expect(screen.getByText(`OpenDesign ${RUNNING_APP_VERSION} is here`)).toBeTruthy();
    // The highlights payload's own `version` is display-irrelevant here; the
    // running version is the truth source (see contracts/api/whats-new.ts).
    expect(screen.queryByText(/0\.12\.1/)).toBeNull();
    // The placeholder release the fake surface shipped with.
    expect(screen.queryByText(/1\.4\.6/)).toBeNull();
  });

  it('renders the cover art and the bullet list from the highlights document', async () => {
    renderCard(true);

    const cover = await screen.findByTestId('whats-new-cover');
    expect(cover.getAttribute('src')).toBe('https://cdn.example.test/whats-new/0-16-1.jpg');
    // The release headline from the document labels the bullet list.
    expect(screen.getByText('Design system sync')).toBeTruthy();
    const notes = screen.getAllByTestId('whats-new-note').map((node) => node.textContent);
    expect(notes).toEqual([
      'Import, edit and sync design systems',
      'Faster canvas pan and zoom',
      'Project import and dark-mode contrast fixes',
    ]);
  });

  it('omits the cover when the document has no image', async () => {
    mockedFetchWhatsNew.mockResolvedValue({
      ...SHOW_PAYLOAD,
      content: { ...SHOW_PAYLOAD.content!, imageUrl: undefined },
    });

    renderCard(true);

    await waitFor(() => {
      expect(screen.getByTestId('whats-new-popup')).toBeTruthy();
    });
    expect(screen.queryByTestId('whats-new-cover')).toBeNull();
  });
});

describe('WhatsNewPopup actions', () => {
  beforeEach(() => {
    mockedFetchWhatsNew.mockResolvedValue(SHOW_PAYLOAD);
  });

  it('offers exactly close and open-release — never an update action', async () => {
    renderCard(true);

    await screen.findByTestId('whats-new-popup');
    expect(screen.getByTestId('whats-new-dismiss').textContent).toBe('Close');
    expect(screen.getByTestId('whats-new-cta').textContent).toBe('View the release notes');
    // The fake surface's "Update now" CTA is gone: applying an update is the
    // real updater's job (UpdaterPopup), not this post-update card's.
    expect(screen.queryByRole('button', { name: 'Update now' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });

  it.each([
    ['en', 'View Arena', 'https://open-design.ai/llm-arena-for-design/'],
    ['zh-CN', '查看评测站', 'https://open-design.ai/zh/llm-arena-for-design/'],
  ])('uses the configured %s CTA and matching Arena destination', async (locale, label, url) => {
    window.localStorage.setItem('open-design:locale', locale!);
    window.localStorage.setItem('open-design:locale-source', 'manual');
    mockedFetchWhatsNew.mockResolvedValue({
      ...SHOW_PAYLOAD,
      content: {
        ...SHOW_PAYLOAD.content!,
        ctaLabel: 'View Arena',
        linkUrl: 'https://open-design.ai/llm-arena-for-design/',
        locales: {
          'zh-CN': { ctaLabel: '查看评测站', linkUrl: 'https://open-design.ai/zh/llm-arena-for-design/' },
        },
      },
    });
    renderCard(true);
    const cta = await screen.findByRole('button', { name: label });
    fireEvent.click(cta);
    expect(mockedOpenExternalUrl).toHaveBeenCalledWith(url);
    expect(window.localStorage.getItem(WHATS_NEW_LAST_SEEN_STORAGE_KEY)).toBe(SHOW_PAYLOAD.id);
    expect(screen.queryByTestId('whats-new-popup')).toBeNull();
  });

  it('close marks the highlight seen and opens no link', async () => {
    renderCard(true);

    fireEvent.click(await screen.findByTestId('whats-new-dismiss'));

    expect(window.localStorage.getItem(WHATS_NEW_LAST_SEEN_STORAGE_KEY)).toBe('highlight-0-16-1');
    expect(mockedOpenExternalUrl).not.toHaveBeenCalled();
    expect(screen.queryByTestId('whats-new-popup')).toBeNull();
  });

  it('open-release bridges the highlight link and marks the highlight seen', async () => {
    renderCard(true);

    fireEvent.click(await screen.findByTestId('whats-new-cta'));

    expect(mockedOpenExternalUrl).toHaveBeenCalledWith('https://open-design.ai/blog/0-16-1/');
    expect(window.localStorage.getItem(WHATS_NEW_LAST_SEEN_STORAGE_KEY)).toBe('highlight-0-16-1');
    expect(screen.queryByTestId('whats-new-popup')).toBeNull();
  });

  it('falls back to the releases index when the document omits a link', async () => {
    mockedFetchWhatsNew.mockResolvedValue({
      ...SHOW_PAYLOAD,
      content: { ...SHOW_PAYLOAD.content!, linkUrl: undefined },
    });

    renderCard(true);

    fireEvent.click(await screen.findByTestId('whats-new-cta'));

    expect(mockedOpenExternalUrl).toHaveBeenCalledWith(RELEASES_INDEX_URL);
  });
});


describe('WhatsNewPopup cover readiness (OPEND-2966)', () => {
  beforeEach(() => {
    autoLoadCover = false;
    vi.useFakeTimers();
    mockedFetchWhatsNew.mockResolvedValue(SHOW_PAYLOAD);
  });

  async function start() {
    const view = renderCard(true);
    await act(async () => {});
    return view;
  }

  it('withholds text and analytics on slow networks until load AND decode complete', async () => {
    await start();
    expect(screen.queryByTestId('whats-new-popup')).toBeNull();
    expect(screen.queryByText('Design system sync')).toBeNull();
    expect(track).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(screen.queryByTestId('whats-new-popup')).toBeNull();
    let decoded!: () => void;
    coverImages[0]!.decode.mockImplementation(() => new Promise<void>(resolve => { decoded = resolve; }));
    await act(async () => { coverImages[0]!.onload?.(); });
    expect(screen.queryByTestId('whats-new-popup')).toBeNull();
    await act(async () => { decoded(); });
    expect(screen.getByText('Design system sync')).toBeTruthy();
    const cover = screen.getByTestId('whats-new-cover');
    expect(cover.getAttribute('width')).toBe('1200');
    expect(cover.getAttribute('height')).toBe('600');
    expect(track).toHaveBeenCalledTimes(1);
  });

  it.each(['404', 'corrupt decode'])('settles to text only for %s', async failure => {
    await start();
    await act(async () => {
      if (failure === '404') coverImages[0]!.onerror?.();
      else {
        coverImages[0]!.decode.mockRejectedValue(new Error('corrupt image'));
        coverImages[0]!.onload?.();
      }
    });
    expect(screen.getByText('Design system sync')).toBeTruthy();
    expect(screen.queryByTestId('whats-new-cover')).toBeNull();
    // Flush jsdom's 0ms selectionchange timer triggered by Dialog.focus(), then
    // verify the 2500ms cover deadline timer was cleared on settlement.
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['load', 'decode'])('bounds waiting for %s and never inserts a late cover', async phase => {
    await start();
    let decoded!: () => void;
    const lateLoad = coverImages[0]!.onload;
    if (phase === 'decode') {
      coverImages[0]!.decode.mockImplementation(() => new Promise<void>(resolve => { decoded = resolve; }));
      await act(async () => { lateLoad?.(); });
    }
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(screen.getByText('Design system sync')).toBeTruthy();
    expect(screen.queryByTestId('whats-new-cover')).toBeNull();
    await act(async () => { if (phase === 'load') lateLoad?.(); else decoded(); });
    expect(screen.queryByTestId('whats-new-cover')).toBeNull();
    fireEvent.click(screen.getByTestId('whats-new-dismiss'));
    await act(async () => { lateLoad?.(); });
    expect(screen.queryByTestId('whats-new-popup')).toBeNull();
  });

  it('cancels old decode on navigation and uses fresh content on return', async () => {
    const view = await start();
    let decoded!: () => void;
    coverImages[0]!.decode.mockImplementation(() => new Promise<void>(resolve => { decoded = resolve; }));
    await act(async () => { coverImages[0]!.onload?.(); });
    view.rerender(<I18nProvider><WhatsNewPopup active={false} /></I18nProvider>);
    expect(vi.getTimerCount()).toBe(0);
    mockedFetchWhatsNew.mockResolvedValue({
      ...SHOW_PAYLOAD, id: 'new-highlight',
      content: { ...SHOW_PAYLOAD.content!, title: 'New content', imageUrl: 'https://cdn.example.test/new.jpg' },
    });
    view.rerender(<I18nProvider><WhatsNewPopup active /></I18nProvider>);
    await act(async () => { decoded(); });
    expect(screen.queryByTestId('whats-new-popup')).toBeNull();
    expect(coverImages[1]!.src).toBe('https://cdn.example.test/new.jpg');
    await act(async () => { coverImages[1]!.onload?.(); });
    expect(screen.getByText('New content')).toBeTruthy();
    expect(screen.queryByText('Design system sync')).toBeNull();
  });

  it('detaches handlers and ignores queued callbacks after unmount', async () => {
    const view = await start();
    const lateLoad = coverImages[0]!.onload;
    view.unmount();
    expect(coverImages[0]!.onload).toBeNull();
    expect(coverImages[0]!.onerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { lateLoad?.(); });
    expect(track).not.toHaveBeenCalled();
    expect(screen.queryByTestId('whats-new-popup')).toBeNull();
  });

  it('mounts the exact preloaded HTMLImageElement to avoid a second network fetch', async () => {
    const preloaded = document.createElement('img');
    Object.defineProperty(preloaded, 'naturalWidth', { value: 1152 });
    Object.defineProperty(preloaded, 'naturalHeight', { value: 494 });
    preloaded.decode = vi.fn(() => Promise.resolve());
    vi.stubGlobal('Image', function ImageCtor() { return preloaded; });

    renderCard(true);
    await act(async () => {});
    expect(screen.queryByTestId('whats-new-popup')).toBeNull();

    await act(async () => { preloaded.onload?.(new Event('load')); });
    const rendered = screen.getByTestId('whats-new-cover');
    expect(rendered).toBe(preloaded);
    expect(rendered.getAttribute('width')).toBe('1152');
    expect(rendered.getAttribute('height')).toBe('494');
  });
});
