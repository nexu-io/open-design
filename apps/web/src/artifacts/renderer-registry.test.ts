import { describe, expect, it } from 'vitest';

import {
  DeckHtmlRenderer,
  GoogleSlidesRenderer,
  HtmlRenderer,
  MarkdownRenderer,
  ReactComponentRenderer,
  RendererRegistry,
  SvgRenderer,
  artifactRendererRegistry,
} from './renderer-registry';
import { renderMarkdownToSafeHtml } from './markdown';
import type { ProjectFile } from '../types';

function baseFile(overrides: Partial<ProjectFile> & Pick<ProjectFile, 'name'>): ProjectFile {
  return {
    path: 'artifact.html',
    type: 'file',
    size: 1,
    mtime: Date.now(),
    kind: 'html',
    mime: 'text/html; charset=utf-8',
    ...overrides,
  };
}

describe('RendererRegistry', () => {
  const registry = new RendererRegistry([
    ReactComponentRenderer,
    DeckHtmlRenderer,
    HtmlRenderer,
    MarkdownRenderer,
    SvgRenderer,
  ]);

  it('resolves markdown renderer from explicit manifest', () => {
    const file = baseFile({
      name: 'notes.md',
      kind: 'text',
      mime: 'text/markdown; charset=utf-8',
      artifactManifest: {
        version: 1,
        kind: 'markdown-document',
        title: 'Notes',
        entry: 'notes.md',
        renderer: 'markdown',
        exports: ['md', 'html'],
      },
    });
    const match = registry.resolve({ file, isDeckHint: false });
    expect(match?.renderer.id).toBe('markdown');
    expect(match?.manifest.renderer).toBe('markdown');
  });

  it('falls back to inferred markdown manifest for .md files', () => {
    const file = baseFile({
      name: 'README.md',
      kind: 'text',
      mime: 'text/markdown; charset=utf-8',
      artifactManifest: undefined,
    });
    const match = registry.resolve({ file, isDeckHint: false });
    expect(match?.renderer.id).toBe('markdown');
    expect(match?.manifest.kind).toBe('markdown-document');
  });

  it('resolves svg renderer from explicit manifest', () => {
    const file = baseFile({
      name: 'diagram.svg',
      kind: 'sketch',
      mime: 'image/svg+xml',
      artifactManifest: {
        version: 1,
        kind: 'svg',
        title: 'Diagram',
        entry: 'diagram.svg',
        renderer: 'svg',
        exports: ['svg'],
      },
    });
    const match = registry.resolve({ file, isDeckHint: false });
    expect(match?.renderer.id).toBe('svg');
    expect(match?.manifest.renderer).toBe('svg');
  });

  it('falls back to inferred svg manifest for .svg files', () => {
    const file = baseFile({
      name: 'logo.svg',
      kind: 'sketch',
      mime: 'image/svg+xml',
      artifactManifest: undefined,
    });
    const match = registry.resolve({ file, isDeckHint: false });
    expect(match?.renderer.id).toBe('svg');
    expect(match?.manifest.kind).toBe('svg');
  });

  it('keeps unknown files on old fallback path', () => {
    const file = baseFile({
      name: 'archive.bin',
      kind: 'binary',
      mime: 'application/octet-stream',
      artifactManifest: undefined,
    });
    expect(registry.resolve({ file, isDeckHint: false })).toBeNull();
  });

  it('exposes conservative streaming contract values', () => {
    expect(HtmlRenderer.supportsStreaming).toBe(false);
    expect(DeckHtmlRenderer.supportsStreaming).toBe(false);

    expect(MarkdownRenderer.supportsStreaming).toBe(true);
    expect(MarkdownRenderer.renderPartial).toBe(renderMarkdownToSafeHtml);

    expect(SvgRenderer.supportsStreaming).toBe(false);
    expect(SvgRenderer.renderPartial).toBeUndefined();
  });

  it('keeps markdown partial renderer output safe', () => {
    const out = MarkdownRenderer.renderPartial?.('[<script>alert(1)</script>](https://example.com/a_b_c)') ?? '';
    expect(out).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(out).toContain('href="https://example.com/a_b_c"');
    expect(out).not.toContain('<script>');
  });

  it('routes JSX and TSX files to the React component renderer', () => {
    expect(
      artifactRendererRegistry.resolve({
        file: baseFile({
          name: 'Hero.jsx',
          kind: 'code',
          mime: 'text/javascript; charset=utf-8',
        }),
        isDeckHint: false,
      })?.renderer.id,
    ).toBe('react-component');
    expect(
      artifactRendererRegistry.resolve({
        file: baseFile({
          name: 'Hero.tsx',
          kind: 'code',
          mime: 'text/typescript; charset=utf-8',
        }),
        isDeckHint: false,
      })?.renderer.id,
    ).toBe('react-component');
  });

  it('resolves google-slides renderer when manifest declares google-slides-deck', () => {
    const file = baseFile({
      name: 'result.json',
      kind: 'text',
      mime: 'application/json',
      artifactManifest: {
        version: 1,
        kind: 'google-slides-deck',
        title: 'Wix Japan 4月',
        entry: 'result.json',
        renderer: 'google-slides',
        exports: ['html'],
      },
    });
    const match = artifactRendererRegistry.resolve({ file, isDeckHint: false });
    expect(match?.renderer.id).toBe('google-slides');
    expect(match?.manifest.kind).toBe('google-slides-deck');
  });

  it('does NOT resolve google-slides for a bare result.json without manifest sidecar', () => {
    const file = baseFile({
      name: 'result.json',
      kind: 'text',
      mime: 'application/json',
      artifactManifest: undefined,
    });
    // Without the artifact.json sidecar, file.name=result.json should NOT
    // activate the GoogleSlidesRenderer — there's no way for canRender to
    // peek at file content from here. Skill MUST author the manifest.
    const match = artifactRendererRegistry.resolve({ file, isDeckHint: false });
    expect(match?.renderer.id).not.toBe('google-slides');
  });

  it('GoogleSlidesRenderer canRender requires explicit manifest', () => {
    const fileWithoutManifest = baseFile({
      name: 'result.json',
      kind: 'text',
      mime: 'application/json',
      artifactManifest: undefined,
    });
    expect(GoogleSlidesRenderer.canRender({ file: fileWithoutManifest, isDeckHint: false })).toBe(false);

    const fileWithManifest = baseFile({
      name: 'result.json',
      kind: 'text',
      mime: 'application/json',
      artifactManifest: {
        version: 1,
        kind: 'google-slides-deck',
        title: 'Deck',
        entry: 'result.json',
        renderer: 'google-slides',
        exports: ['html'],
      },
    });
    expect(GoogleSlidesRenderer.canRender({ file: fileWithManifest, isDeckHint: false })).toBe(true);
  });

  it('GoogleSlidesRenderer reports non-streaming', () => {
    expect(GoogleSlidesRenderer.supportsStreaming).toBe(false);
    expect(GoogleSlidesRenderer.renderPartial).toBeUndefined();
  });

  it('prefers an explicit React manifest over the coarse code kind', () => {
    expect(
      artifactRendererRegistry.resolve({
        file: baseFile({
          name: 'entry.txt',
          kind: 'text',
          artifactManifest: {
            version: 1,
            kind: 'react-component',
            title: 'Entry',
            entry: 'entry.txt',
            renderer: 'react-component',
            exports: ['jsx', 'html', 'zip'],
          },
        }),
        isDeckHint: false,
      })?.renderer.id,
    ).toBe('react-component');
  });
});
