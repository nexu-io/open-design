// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProjectFile } from '@open-design/contracts';

import { DesignSystemInlinePreviewView } from '../../../src/features/file-workspace/components/DesignSystemInlinePreviewView';

afterEach(cleanup);

function makeFile(over: Partial<ProjectFile> = {}): ProjectFile {
  return { name: 'index.html', size: 10, mtime: 1000, kind: 'html', mime: 'text/html', ...over };
}

describe('DesignSystemInlinePreviewView', () => {
  it('renders a sandboxed iframe pointed at the direct URL before srcDoc is ready', () => {
    render(
      <DesignSystemInlinePreviewView
        file={makeFile()}
        url="/api/projects/p1/file/index.html"
        srcDoc={null}
        srcDocReady={false}
      />,
    );
    const iframe = screen.getByTitle('index.html') as HTMLIFrameElement;
    expect(iframe.getAttribute('src')).toBe('/api/projects/p1/file/index.html');
    expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-downloads allow-popups allow-popups-to-escape-sandbox');
  });

  it('renders the iframe with srcDoc once ready and drops the src', () => {
    render(
      <DesignSystemInlinePreviewView
        file={makeFile()}
        url="/api/projects/p1/file/index.html"
        srcDoc="<html><body>hi</body></html>"
        srcDocReady
      />,
    );
    const iframe = screen.getByTitle('index.html') as HTMLIFrameElement;
    expect(iframe.hasAttribute('src')).toBe(false);
    expect(iframe.getAttribute('srcdoc')).toBe('<html><body>hi</body></html>');
  });

  it('renders an <img> for a non-html file kind, cache-busted by mtime', () => {
    render(
      <DesignSystemInlinePreviewView
        file={makeFile({ kind: 'image', name: 'logo.png', mtime: 2500 })}
        url="/api/projects/p1/file/logo.png"
        srcDoc={null}
        srcDocReady={false}
      />,
    );
    const img = screen.getByAltText('logo.png') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/api/projects/p1/file/logo.png?v=2500');
  });
});
