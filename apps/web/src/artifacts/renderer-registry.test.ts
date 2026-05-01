import { describe, expect, it } from 'vitest';

import {
  DeckHtmlRenderer,
  HtmlRenderer,
  MarkdownRenderer,
  RendererRegistry,
  SvgRenderer,
} from './renderer-registry';
import { renderMarkdownToSafeHtml } from './markdown';
import type { ProjectFile } from '../types';

function baseFile(overrides: Partial<ProjectFile>): ProjectFile {
  return {
    name: 'artifact.html',
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
});
