// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PreviewSurface } from '../../src/components/plugins-home/cards/PreviewSurface';
import type { MediaPreviewSpec } from '../../src/components/plugins-home/preview';

const visibilityQueue: boolean[] = [];

vi.mock('../../src/components/plugins-home/useInView', () => ({
  useInView: () => ({
    ref: { current: null },
    inView: visibilityQueue.shift() ?? false,
  }),
}));

vi.mock('../../src/components/plugins-home/cards/MediaSurface', () => ({
  MediaSurface: ({ inView, visible }: { inView: boolean; visible?: boolean }) => (
    <div data-testid="media-surface" data-in-view={String(inView)} data-visible={String(visible)} />
  ),
}));

vi.mock('../../src/components/plugins-home/cards/HtmlSurface', () => ({
  HtmlSurface: ({ inView }: { inView: boolean }) => (
    <div data-testid="html-surface" data-in-view={String(inView)} />
  ),
}));

vi.mock('../../src/components/plugins-home/cards/DesignSystemSurface', () => ({
  DesignSystemSurface: ({ inView }: { inView: boolean }) => (
    <div data-testid="design-surface" data-in-view={String(inView)} />
  ),
}));

vi.mock('../../src/components/plugins-home/cards/TextSurface', () => ({
  TextSurface: () => <div data-testid="text-surface" />,
}));

const IMAGE_PREVIEW: MediaPreviewSpec = {
  kind: 'media',
  mediaType: 'image',
  poster: 'https://example.invalid/poster.jpg',
  videoUrl: null,
  audioUrl: null,
  imageOnly: true,
};

const PLAIN_VIDEO_PREVIEW: MediaPreviewSpec = {
  ...IMAGE_PREVIEW,
  mediaType: 'video',
  videoUrl: 'https://example.invalid/plain.mp4',
  imageOnly: false,
};

const BAKED_CLIP_PREVIEW: MediaPreviewSpec = {
  ...PLAIN_VIDEO_PREVIEW,
  videoUrl: 'https://example.invalid/baked.mp4',
  loopHoldMs: 2500,
};

function renderWithVisibility(preview: MediaPreviewSpec) {
  // PreviewSurface calls useInView in this order: near, media, keep, visible. Make the
  // values intentionally disagree so the gate passed to MediaSurface proves
  // which zone each media subtype uses.
  visibilityQueue.splice(0, visibilityQueue.length, false, true, false, true);
  render(
    <PreviewSurface pluginId="sample" pluginTitle="Sample" preview={preview} />,
  );
  return screen.getByTestId('media-surface');
}

afterEach(() => {
  cleanup();
  visibilityQueue.splice(0, visibilityQueue.length);
});

describe('PreviewSurface media visibility gates', () => {
  beforeEach(() => {
    visibilityQueue.splice(0, visibilityQueue.length);
  });

  it('warms image media on the medium media margin', () => {
    expect(renderWithVisibility(IMAGE_PREVIEW).dataset.inView).toBe('true');
  });

  it('warms plain video media on the medium media margin', () => {
    expect(renderWithVisibility(PLAIN_VIDEO_PREVIEW).dataset.inView).toBe('true');
  });

  it('uses the wide keepalive margin only for baked hover-pan clips', () => {
    expect(renderWithVisibility(BAKED_CLIP_PREVIEW).dataset.inView).toBe('false');
  });

  it('keeps html and design surfaces on the tight near margin', () => {
    visibilityQueue.splice(0, visibilityQueue.length, false, true, true, true);
    render(
      <PreviewSurface
        pluginId="sample"
        pluginTitle="Sample"
        preview={{ kind: 'html', src: '/preview', label: 'preview', source: 'preview' }}
      />,
    );
    expect(screen.getByTestId('html-surface').dataset.inView).toBe('false');
    cleanup();

    visibilityQueue.splice(0, visibilityQueue.length, false, true, true, true);
    render(
      <PreviewSurface
        pluginId="sample"
        pluginTitle="Sample"
        preview={{ kind: 'design', brand: 'Sample', designSystemId: null, swatches: [] }}
      />,
    );
    expect(screen.getByTestId('design-surface').dataset.inView).toBe('false');
  });
});
