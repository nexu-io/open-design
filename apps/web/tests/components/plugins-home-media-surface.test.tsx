// @vitest-environment jsdom

// Plugins-home media preview surface — broken-poster fallback.
//
// Before #2955 the MediaSurface card rendered `preview.poster`
// straight into an `<img>` with no error handler. When an official
// project's poster URL pointed at an asset the browser could not
// fetch (404, decode error, CSP/CORS reject, or just a dead host),
// the card was left with the browser's default broken-image glyph
// instead of the typographic fallback that no-poster cards already
// use. On the Home page that turned the discovery surface into a
// row of "looks-broken" tiles for official content (issue #2955).
//
// This file pins the new behavior: a failed poster load swaps in
// the same `plugins-home__media-fallback` element that runs for
// poster-less entries, so the discovery surface degrades cleanly
// instead of leaving a broken-image state.

import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { MediaSurface } from '../../src/components/plugins-home/cards/MediaSurface';
import type { MediaPreviewSpec } from '../../src/components/plugins-home/preview';

const POSTER: MediaPreviewSpec = {
  kind: 'media',
  mediaType: 'image',
  poster: 'https://example.invalid/poster.png',
  videoUrl: null,
  audioUrl: null,
  imageOnly: true,
};

const VIDEO_POSTER: MediaPreviewSpec = {
  ...POSTER,
  mediaType: 'video',
  videoUrl: 'https://example.invalid/preview.mp4',
  imageOnly: false,
};

afterEach(() => {
  cleanup();
});

describe('MediaSurface broken-poster fallback (#2955)', () => {
  it('renders the poster <img> by default when a poster URL is provided and the card is in view', () => {
    const { container } = render(
      <MediaSurface preview={POSTER} pluginTitle="Example" inView={true} />,
    );
    const img = container.querySelector('img.plugins-home__media-img');
    expect(img).not.toBeNull();
    expect((img as HTMLImageElement).src).toContain('poster.png');
    expect(container.querySelector('.plugins-home__media-fallback')).toBeNull();
  });

  it('swaps in the typographic fallback when the poster fails to load (the headline #2955 scenario)', () => {
    // Browsers emit an `error` event on the <img> when the URL 404s,
    // the decode fails, or the host is unreachable. Without an
    // onError handler the element stayed in the DOM and the browser
    // painted its default broken-image glyph — the broken tile users
    // were seeing on official Home cards.
    const { container } = render(
      <MediaSurface preview={POSTER} pluginTitle="Example" inView={true} />,
    );
    const img = container.querySelector('img.plugins-home__media-img');
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);
    // After the error, the broken <img> is gone and the typographic
    // fallback element is mounted in its place.
    expect(container.querySelector('img.plugins-home__media-img')).toBeNull();
    expect(container.querySelector('.plugins-home__media-fallback')).not.toBeNull();
  });

  it('resets the failed-state when the poster URL changes so a recovered/different poster gets a fresh attempt', () => {
    // Two real-world scenarios that hit this path:
    //   1. The Home page rotates through filters and the same
    //      `MediaSurface` instance gets a different plugin's poster
    //      assigned. The previous failure must not poison the new
    //      URL.
    //   2. An offline-then-online flip where the daemon repopulates
    //      poster URLs. The card has to recover instead of staying
    //      stuck on the fallback for the session.
    const { container, rerender } = render(
      <MediaSurface preview={POSTER} pluginTitle="Example" inView={true} />,
    );
    const img = container.querySelector('img.plugins-home__media-img');
    fireEvent.error(img as HTMLImageElement);
    expect(container.querySelector('.plugins-home__media-fallback')).not.toBeNull();

    const recovered: MediaPreviewSpec = {
      ...POSTER,
      poster: 'https://example.invalid/different-poster.png',
    };
    rerender(<MediaSurface preview={recovered} pluginTitle="Example" inView={true} />);
    expect(container.querySelector('img.plugins-home__media-img')).not.toBeNull();
    expect(container.querySelector('.plugins-home__media-fallback')).toBeNull();
  });

  it('still renders the typographic fallback directly when the spec has no poster URL (no regression for poster-less entries)', () => {
    // Regression guard for the original `!hasPoster` branch — the new
    // error-handling logic must not break entries that never had a
    // poster URL to begin with.
    const noPoster: MediaPreviewSpec = { ...POSTER, poster: null };
    const { container } = render(
      <MediaSurface preview={noPoster} pluginTitle="Example" inView={true} />,
    );
    expect(container.querySelector('img.plugins-home__media-img')).toBeNull();
    expect(container.querySelector('.plugins-home__media-fallback')).not.toBeNull();
  });

  it('does not render a passive play badge for video cards that already auto-play on hover', () => {
    const { container } = render(
      <MediaSurface preview={VIDEO_POSTER} pluginTitle="Video example" inView={true} />,
    );
    expect(container.querySelector('.plugins-home__media-badge')).toBeNull();
  });
});
