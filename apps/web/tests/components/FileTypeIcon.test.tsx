import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  FileTypeIcon,
  fileTypePreviewKind,
  previewFallbackIcon,
  resolveFileTypeIcon,
} from '../../src/components/FileTypeIcon';

/**
 * One table answers "what does a staged file lead with?" for both composers.
 * The daemon only splits attachments into image/file, so a video arrives as
 * 'file' — the name has to decide, with the MIME type as a fallback only.
 */
describe('fileTypePreviewKind', () => {
  it('routes rasters, vectors and videos to a thumbnail and documents to a glyph', () => {
    expect(fileTypePreviewKind('hero.png')).toBe('image');
    expect(fileTypePreviewKind('logo.svg')).toBe('vector');
    expect(fileTypePreviewKind('walkthrough.mp4')).toBe('video');
    expect(fileTypePreviewKind('design.fig')).toBeNull();
    expect(fileTypePreviewKind('index.html')).toBeNull();
  });

  it('is case-insensitive on the extension', () => {
    expect(fileTypePreviewKind('HERO.PNG')).toBe('image');
    expect(fileTypePreviewKind('Clip.MOV')).toBe('video');
  });

  it('falls back to the MIME type only when the name has no usable extension', () => {
    expect(fileTypePreviewKind('image', 'image/png')).toBe('image');
    expect(fileTypePreviewKind('image', 'image/svg+xml')).toBe('vector');
    expect(fileTypePreviewKind('clip', 'video/webm')).toBe('video');
    // A known document extension wins even when the browser guesses otherwise.
    expect(fileTypePreviewKind('index.html', 'image/png')).toBeNull();
  });
});

describe('resolveFileTypeIcon', () => {
  it('maps the product-named types to their own mark', () => {
    expect(resolveFileTypeIcon('design.fig')).toBe('figma');
    expect(resolveFileTypeIcon('index.html')).toBe('code');
    expect(resolveFileTypeIcon('brief.pdf')).toBe('pdf');
    expect(resolveFileTypeIcon('sheet.xlsx')).toBe('excel');
    expect(resolveFileTypeIcon('scene.glb')).toBe('model3d');
    expect(resolveFileTypeIcon('notes.md')).toBe('markdown');
  });

  it('consults the MIME type when the extension is unknown', () => {
    expect(resolveFileTypeIcon('track', 'audio/mpeg')).toBe('audio');
    expect(resolveFileTypeIcon('archive', 'application/zip')).toBe('zip');
    expect(resolveFileTypeIcon('mystery.bin')).toBe('unknown');
  });
});

describe('previewFallbackIcon', () => {
  it('keeps the GIF mark for a raster GIF whose thumbnail could not be made', () => {
    expect(previewFallbackIcon('image', 'loop.gif')).toBe('gif');
    expect(previewFallbackIcon('image', 'hero.png')).toBe('unknown');
    expect(previewFallbackIcon('video', 'clip.mp4')).toBe('unknown');
    expect(previewFallbackIcon('vector', 'logo.svg')).toBe('unknown');
  });
});

describe('FileTypeIcon', () => {
  it('renders the Figma mark with its brand fills at the requested size', () => {
    const markup = renderToStaticMarkup(<FileTypeIcon name="figma" size={20} />);
    expect(markup).toMatch(/^<svg\b/);
    expect(markup).toContain('width="20"');
    expect(markup).toContain('height="20"');
    expect(markup).toContain('fill="#0ACF83"');
    expect(markup).toContain('aria-hidden="true"');
  });

  it('gives every gradient mark its own gradient id so two chips do not share one', () => {
    const markup = renderToStaticMarkup(
      <>
        <FileTypeIcon name="font" />
        <FileTypeIcon name="font" />
      </>,
    );
    const ids = [...markup.matchAll(/<linearGradient id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(markup).toContain(`fill="url(#${id})"`);
  });
});
