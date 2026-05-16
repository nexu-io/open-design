// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { saveTemplateMock } = vi.hoisted(() => ({
  saveTemplateMock: vi.fn(),
}));

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return {
    ...actual,
    saveTemplate: saveTemplateMock,
  };
});

import {
  CommentSidePanel,
  FileViewer,
  LiveArtifactViewer,
  LiveArtifactRefreshHistoryPanel,
  SvgViewer,
  applyInspectOverridesToSource,
  effectivePreviewScale,
  parseInspectOverridesFromSource,
  serializeInspectOverrides,
  updateInspectOverride,
} from '../../src/components/FileViewer';
import type { InspectOverrideMap } from '../../src/components/FileViewer';
import type { LiveArtifact, LiveArtifactWorkspaceEntry, PreviewComment, ProjectFile } from '../../src/types';
import { I18nProvider } from '../../src/i18n';
import type { Dict } from '../../src/i18n/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, 'clipboard');
});

function baseFile(overrides: Partial<ProjectFile>): ProjectFile {
  return {
    name: 'asset.png',
    path: 'asset.png',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'image',
    mime: 'image/png',
    ...overrides,
  };
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('FileViewer preview scale', () => {
  it('uses the requested zoom for desktop preview overlays', () => {
    expect(effectivePreviewScale('desktop', 1.5, { width: 320, height: 480 })).toBe(1.5);
  });

  it('clamps mobile and tablet overlay scale to the iframe auto-fit scale', () => {
    expect(effectivePreviewScale('mobile', 1, { width: 390, height: 844 })).toBeLessThan(1);
    expect(effectivePreviewScale('tablet', 1.25, { width: 820, height: 700 })).toBeLessThan(1);
  });
});

describe('FileViewer JSON artifacts', () => {
  it('pretty-prints valid JSON in the text viewer', async () => {
    const file = baseFile({
      name: 'data.json',
      path: 'data.json',
      kind: 'code',
      mime: 'application/json',
    });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/raw/data.json') {
        return new Response('{"title":"Launch Metrics","stats":{"views":42,"active":true}}');
      }
      return new Response('', { status: 404 });
    }));

    const { container } = render(<FileViewer projectId="project-1" projectKind="prototype" file={file} />);

    await waitFor(() => {
      expect(container.querySelector('.lines')?.textContent).toBe(
        '{\n  "title": "Launch Metrics",\n  "stats": {\n    "views": 42,\n    "active": true\n  }\n}',
      );
    });
  });

  it('keeps raw JSON when pretty-printing would round an unsafe integer', async () => {
    const file = baseFile({
      name: 'data.json',
      path: 'data.json',
      kind: 'code',
      mime: 'application/json',
    });
    const rawJson = '{"id":9007199254740993,"name":"large"}';
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/raw/data.json') {
        return new Response(rawJson);
      }
      return new Response('', { status: 404 });
    }));

    const { container } = render(<FileViewer projectId="project-1" projectKind="prototype" file={file} />);

    await waitFor(() => {
      const displayedText = container.querySelector('.lines')?.textContent ?? '';
      expect(displayedText).toBe(rawJson);
      expect(displayedText).toContain('9007199254740993');
      expect(displayedText).not.toContain('9007199254740992');
    });
  });

  it('keeps raw JSON when pretty-printing would round a high-precision decimal', async () => {
    const file = baseFile({
      name: 'data.json',
      path: 'data.json',
      kind: 'code',
      mime: 'application/json',
    });
    const rawJson = '{"ratio":0.1234567890123456789,"name":"precise"}';
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/raw/data.json') {
        return new Response(rawJson);
      }
      return new Response('', { status: 404 });
    }));

    const { container } = render(<FileViewer projectId="project-1" projectKind="prototype" file={file} />);

    await waitFor(() => {
      const displayedText = container.querySelector('.lines')?.textContent ?? '';
      expect(displayedText).toBe(rawJson);
      expect(displayedText).toContain('0.1234567890123456789');
      expect(displayedText).not.toContain('0.12345678901234568');
    });
  });

  it('keeps raw JSON when pretty-printing would round a high-precision exponent', async () => {
    const file = baseFile({
      name: 'data.json',
      path: 'data.json',
      kind: 'code',
      mime: 'application/json',
    });
    const rawJson = '{"ratio":1.234567890123456789e2,"name":"precise"}';
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/raw/data.json') {
        return new Response(rawJson);
      }
      return new Response('', { status: 404 });
    }));

    const { container } = render(<FileViewer projectId="project-1" projectKind="prototype" file={file} />);

    await waitFor(() => {
      const displayedText = container.querySelector('.lines')?.textContent ?? '';
      expect(displayedText).toBe(rawJson);
      expect(displayedText).toContain('1.234567890123456789e2');
      expect(displayedText).not.toContain('123.45678901234568');
    });
  });

  it('keeps raw JSON when pretty-printing would erase signed negative zero', async () => {
    const file = baseFile({
      name: 'data.json',
      path: 'data.json',
      kind: 'code',
      mime: 'application/json',
    });
    const rawJson = '{"delta":-0}';
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/raw/data.json') {
        return new Response(rawJson);
      }
      return new Response('', { status: 404 });
    }));

    const { container } = render(<FileViewer projectId="project-1" projectKind="prototype" file={file} />);

    await waitFor(() => {
      const displayedText = container.querySelector('.lines')?.textContent ?? '';
      expect(displayedText).toBe(rawJson);
      expect(displayedText).toContain('-0');
      expect(displayedText).not.toContain('{"delta":0}');
    });
  });
});

describe('FileViewer SVG artifacts', () => {
  it('routes SVG artifacts to the SVG viewer instead of the generic image viewer', () => {
    const file = baseFile({
      name: 'diagram.svg',
      path: 'diagram.svg',
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

    const markup = renderToStaticMarkup(<FileViewer projectId="project-1" projectKind="prototype" file={file} />);

    expect(markup).toContain('class="viewer svg-viewer"');
    expect(markup).not.toContain('class="viewer image-viewer"');
    expect(markup).toContain('Preview');
    expect(markup).toContain('Source');
    expect(markup).toContain('src="/api/projects/project-1/raw/diagram.svg?v=1710000000&amp;r=0"');
  });

  it('keeps normal image artifacts on the existing image viewer path', () => {
    const file = baseFile({ name: 'photo.png', path: 'photo.png' });

    const markup = renderToStaticMarkup(<FileViewer projectId="project-1" projectKind="prototype" file={file} />);

    expect(markup).toContain('class="viewer image-viewer"');
    expect(markup).not.toContain('class="viewer svg-viewer"');
    expect(markup).not.toContain('class="viewer-tabs"');
  });

  it('renders sketch json files through the static sketch preview instead of the image viewer', async () => {
    const file = baseFile({
      name: 'board.sketch.json',
      path: 'board.sketch.json',
      kind: 'sketch',
      mime: 'application/json; charset=utf-8',
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      items: [
        {
          kind: 'arrow',
          x1: 16,
          y1: 24,
          x2: 180,
          y2: 108,
          color: '#1c1b1a',
          size: 3,
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<FileViewer projectId="project-1" projectKind="prototype" file={file} />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="sketch-preview-svg"]')).toBeTruthy();
    });
    expect(container.querySelector('.viewer.image-viewer img')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1/raw/board.sketch.json', { cache: 'no-store' });
  });

  it('expands the sketch preview viewBox for off-origin sketches outside the default frame', async () => {
    const file = baseFile({
      name: 'offset-board.sketch.json',
      path: 'offset-board.sketch.json',
      kind: 'sketch',
      mime: 'application/json; charset=utf-8',
    });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      items: [
        {
          kind: 'rect',
          x: 500,
          y: 300,
          w: 20,
          h: 10,
          color: '#1c1b1a',
          size: 2,
        },
      ],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<FileViewer projectId="project-1" projectKind="prototype" file={file} />);

    await waitFor(() => {
      const svg = container.querySelector<SVGSVGElement>('[data-testid="sketch-preview-svg"] svg');
      expect(svg).toBeTruthy();
      expect(svg?.getAttribute('viewBox')).toBe('0 0 545 335');
    });
  });

  it('marks preview and source modes through the SVG viewer toggle controls', () => {
    const file = baseFile({ name: 'diagram.svg', path: 'diagram.svg', mime: 'image/svg+xml' });

    const previewMarkup = renderToStaticMarkup(
      <SvgViewer projectId="project-1" file={file} initialMode="preview" />,
    );
    const sourceMarkup = renderToStaticMarkup(
      <SvgViewer
        projectId="project-1"
        file={file}
        initialMode="source"
        initialSource="<svg><title>Diagram</title></svg>"
      />,
    );

    expect(previewMarkup).toContain('class="viewer-tab active" aria-pressed="true">Preview</button>');
    expect(previewMarkup).toContain('aria-pressed="false">Source</button>');
    expect(previewMarkup).toContain('<img');

    expect(sourceMarkup).toContain('aria-pressed="false">Preview</button>');
    expect(sourceMarkup).toContain('class="viewer-tab active" aria-pressed="true">Source</button>');
    expect(sourceMarkup).toContain('class="viewer-source"');
    expect(sourceMarkup).not.toContain('<img');
  });

  it('URL-loads a plain HTML preview iframe instead of inlining via srcDoc', () => {
    const file = baseFile({
      name: 'page.html',
      path: 'page.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Page',
        entry: 'page.html',
        renderer: 'html',
        exports: ['html'],
      },
    });

    const markup = renderToStaticMarkup(
      <FileViewer projectId="project-1" projectKind="prototype" file={file} liveHtml="<html><body>hi</body></html>" />,
    );

    expect(markup).toContain('data-testid="artifact-preview-frame"');
    expect(markup).toContain('data-od-render-mode="url-load"');
    expect(markup).toContain('src="/api/projects/project-1/raw/page.html?v=1710000000&amp;r=0"');
    expect(markup).toContain('sandbox="allow-scripts allow-downloads"');
    expect(markup).not.toContain('data-od-render-mode="srcdoc"');
  });

  it('allows downloads in the in-tab HTML presentation iframe', async () => {
    const file = baseFile({
      name: 'page.html',
      path: 'page.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Page',
        entry: 'page.html',
        renderer: 'html',
        exports: ['html'],
      },
    });

    const { container } = render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file} liveHtml="<html><body>hi</body></html>" />,
    );

    fireEvent.click(screen.getByRole('button', { name: /present/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /in this tab/i }));

    await waitFor(() => {
      const frame = container.querySelector('.present-overlay iframe');
      expect(frame?.getAttribute('sandbox')).toBe('allow-scripts allow-downloads');
      expect(frame?.getAttribute('data-od-render-mode')).toBe('url-load');
    });
  });

  it('allows downloads in React component preview iframes', async () => {
    const file = baseFile({
      name: 'Card.jsx',
      path: 'Card.jsx',
      mime: 'text/jsx',
      kind: 'code',
      artifactManifest: {
        version: 1,
        kind: 'react-component',
        title: 'Card',
        entry: 'Card.jsx',
        renderer: 'react-component',
        exports: ['jsx', 'html', 'zip'],
      },
    });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/raw/Card.jsx') {
        return new Response('export default function Card() { return <button>Download</button>; }');
      }
      return new Response('', { status: 404 });
    }));

    render(<FileViewer projectId="project-1" projectKind="prototype" file={file} />);

    const frame = await screen.findByTestId('react-component-preview-frame');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-downloads');
  });

  it('keeps decks on the srcDoc path so the deck postMessage bridge can run', () => {
    const file = baseFile({
      name: 'deck.html',
      path: 'deck.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'deck',
        title: 'Deck',
        entry: 'deck.html',
        renderer: 'deck-html',
        exports: ['html'],
      },
    });

    const markup = renderToStaticMarkup(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        isDeck
        liveHtml={'<html><body><section class="slide">one</section></body></html>'}
      />,
    );

    expect(markup).toContain('data-testid="artifact-preview-frame"');
    expect(markup).toContain('data-od-render-mode="srcdoc"');
    expect(markup).toContain('sandbox="allow-scripts allow-downloads"');
    expect(markup).not.toContain('data-od-render-mode="url-load"');
  });

  it('falls back to srcDoc when the HTML body looks deck-shaped even without an isDeck hint', () => {
    const file = baseFile({
      name: 'inferred.html',
      path: 'inferred.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Inferred',
        entry: 'inferred.html',
        renderer: 'html',
        exports: ['html'],
      },
    });

    const markup = renderToStaticMarkup(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml={'<html><body><section class="slide">one</section><section class="slide">two</section></body></html>'}
      />,
    );

    expect(markup).toContain('data-od-render-mode="srcdoc"');
    expect(markup).not.toContain('data-od-render-mode="url-load"');
  });

  it('hides preview-only toolbar controls when switching an HTML deck to source view', async () => {
    const file = baseFile({
      name: 'deck.html',
      path: 'deck.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Deck',
        entry: 'deck.html',
        renderer: 'html',
        exports: ['html'],
      },
    });

    const { container } = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={file}
        isDeck
        liveHtml={'<html><body><section class="slide">one</section><section class="slide">two</section></body></html>'}
      />,
    );

    expect(container.querySelector('.deck-nav')).toBeTruthy();
    expect(container.querySelector('.palette-tweaks-anchor')).toBeTruthy();
    expect(container.querySelector('.viewer-viewport-switcher')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^source$/i }));

    await waitFor(() => {
      expect(container.querySelector('.deck-nav')).toBeNull();
      expect(container.querySelector('.palette-tweaks-anchor')).toBeNull();
      expect(container.querySelector('.viewer-viewport-switcher')).toBeNull();
      expect(screen.getByTestId('manual-edit-mode-toggle')).toBeTruthy();
      expect(screen.queryByTestId('draw-overlay-toggle')).toBeNull();
      expect(screen.queryByTestId('palette-tweaks-toggle')).toBeNull();
      expect(screen.getByRole('button', { name: /zoom out/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /zoom in/i })).toBeTruthy();
    });
  });

  it('shows Cloudflare Pages as a deploy action without requiring a project name input', async () => {
    const file = baseFile({
      name: 'index.html',
      path: 'index.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Page',
        entry: 'index.html',
        renderer: 'html',
        exports: ['html'],
      },
    });

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    expect(screen.getByRole('menuitem', { name: /Deploy to Vercel/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: /Deploy to Cloudflare Pages/i }));

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Account ID')).toBeTruthy();
    expect(screen.getByText(/Pages Edit is required/i)).toBeTruthy();
    expect(screen.getByText(/Zone Read is required to list domains/i)).toBeTruthy();
    expect(screen.getByText(/DNS Edit is only needed when binding a custom domain/i)).toBeTruthy();
    expect(screen.queryByText(/Pages Read\/Write/i)).toBeNull();
    const subdomainInput = screen.getByLabelText('Subdomain prefix');
    const domainSelect = screen.getByLabelText('Domain');
    expect(Boolean(subdomainInput.compareDocumentPosition(domainSelect) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(screen.queryByText('Pages project name')).toBeNull();
    expect(screen.queryByText(/generates a Pages project name automatically/i)).toBeNull();
    expect(screen.queryByText(/project name is selected automatically/i)).toBeNull();
    expect(screen.queryByLabelText('Pages project name')).toBeNull();
  });

  it('keeps the explicitly selected deploy provider when another provider already has a deployment', async () => {
    const file = baseFile({
      name: 'index.html',
      path: 'index.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Page',
        entry: 'index.html',
        renderer: 'html',
        exports: ['html'],
      },
    });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/deployments') {
        return new Response(JSON.stringify({
          deployments: [
            {
              id: 'vercel-deploy',
              projectId: 'project-1',
              fileName: 'index.html',
              providerId: 'vercel-self',
              url: 'https://vercel.example',
              deploymentCount: 1,
              target: 'preview',
              status: 'ready',
              createdAt: 1,
              updatedAt: 2,
            },
          ],
        }), { status: 200 });
      }
      if (url === '/api/deploy/config?providerId=cloudflare-pages') {
        return new Response(JSON.stringify({
          providerId: 'cloudflare-pages',
          configured: true,
          tokenMask: 'saved-cloudflare-token',
          accountId: 'account-123',
        }), { status: 200 });
      }
      if (url === '/api/deploy/config?providerId=vercel-self') {
        return new Response(JSON.stringify({
          providerId: 'vercel-self',
          configured: true,
          tokenMask: 'saved-vercel-token',
        }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Deploy to Cloudflare Pages/i }));

    const providerSelect = await screen.findByRole('combobox', { name: /Provider/i });
    await waitFor(() => {
      expect((providerSelect as HTMLSelectElement).value).toBe('cloudflare-pages');
    });

    const calledUrls = fetchMock.mock.calls.map(([input]) => (
      typeof input === 'string' ? input : input instanceof Request ? input.url : String(input)
    ));
    expect(calledUrls).toContain('/api/deploy/config?providerId=cloudflare-pages');
    expect(calledUrls).not.toContain('/api/deploy/config?providerId=vercel-self');
    expect((screen.getByLabelText(/Cloudflare API token/i) as HTMLInputElement).value).toBe('saved-cloudflare-token');
  });

  it('ignores stale deploy config loads after switching providers', async () => {
    const file = baseFile({
      name: 'index.html',
      path: 'index.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Page',
        entry: 'index.html',
        renderer: 'html',
        exports: ['html'],
      },
    });
    const delayedCloudflareConfig = deferredResponse();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/deployments') {
        return new Response(JSON.stringify({ deployments: [] }), { status: 200 });
      }
      if (url === '/api/deploy/config?providerId=cloudflare-pages') {
        return delayedCloudflareConfig.promise;
      }
      if (url === '/api/deploy/config?providerId=vercel-self') {
        return new Response(JSON.stringify({
          providerId: 'vercel-self',
          configured: true,
          tokenMask: 'saved-vercel-token',
        }), { status: 200 });
      }
      if (url === '/api/deploy/cloudflare-pages/zones') {
        return new Response(JSON.stringify({
          zones: [{ id: 'zone-1', name: 'example.com', status: 'active', type: 'full' }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Deploy to Cloudflare Pages/i }));

    const providerSelect = await screen.findByRole('combobox', { name: /Provider/i });
    await waitFor(() => {
      expect((providerSelect as HTMLSelectElement).value).toBe('cloudflare-pages');
    });
    fireEvent.change(providerSelect, { target: { value: 'vercel-self' } });

    await waitFor(() => {
      expect((providerSelect as HTMLSelectElement).value).toBe('vercel-self');
    });
    expect((screen.getByLabelText(/Vercel token/i) as HTMLInputElement).value).toBe('saved-vercel-token');

    delayedCloudflareConfig.resolve(new Response(JSON.stringify({
      providerId: 'cloudflare-pages',
      configured: true,
      tokenMask: 'saved-cloudflare-token',
      accountId: 'account-123',
      cloudflarePages: {
        lastZoneId: 'zone-1',
        lastDomainPrefix: 'demo',
      },
    }), { status: 200 }));

    await waitFor(() => {
      expect((providerSelect as HTMLSelectElement).value).toBe('vercel-self');
      expect((screen.getByLabelText(/Vercel token/i) as HTMLInputElement).value).toBe('saved-vercel-token');
    });
    expect(screen.queryByLabelText(/Cloudflare API token/i)).toBeNull();
  });

  it('loads Cloudflare domains, sends the selected custom domain, and renders both links', async () => {
    const file = baseFile({
      name: 'index.html',
      path: 'index.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Page',
        entry: 'index.html',
        renderer: 'html',
        exports: ['html'],
      },
    });
    let deployBody: any = null;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      const method = init?.method || (input instanceof Request ? input.method : 'GET');
      if (url === '/api/projects/project-1/deployments') {
        return new Response(JSON.stringify({ deployments: [] }), { status: 200 });
      }
      if (url === '/api/deploy/config?providerId=cloudflare-pages') {
        return new Response(JSON.stringify({
          providerId: 'cloudflare-pages',
          configured: true,
          tokenMask: 'saved-cloudflare-token',
          teamId: '',
          teamSlug: '',
          accountId: 'account-123',
          target: 'preview',
        }), { status: 200 });
      }
      if (url === '/api/deploy/cloudflare-pages/zones') {
        return new Response(JSON.stringify({
          zones: [{ id: 'zone-1', name: 'example.com', status: 'active', type: 'full' }],
        }), { status: 200 });
      }
      if (url === '/api/deploy/config' && method === 'PUT') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify({
          providerId: 'cloudflare-pages',
          configured: true,
          tokenMask: 'saved-cloudflare-token',
          teamId: '',
          teamSlug: '',
          accountId: body.accountId,
          cloudflarePages: body.cloudflarePages,
          target: 'preview',
        }), { status: 200 });
      }
      if (url === '/api/projects/project-1/deploy' && method === 'POST') {
        deployBody = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify({
          id: 'cloudflare-deploy',
          projectId: 'project-1',
          fileName: 'index.html',
          providerId: 'cloudflare-pages',
          url: 'https://demo-pages.pages.dev',
          deploymentId: 'cf-dep-1',
          deploymentCount: 1,
          target: 'preview',
          status: 'ready',
          cloudflarePages: {
            projectName: 'demo-pages',
            pagesDev: {
              url: 'https://demo-pages.pages.dev',
              status: 'ready',
            },
            customDomain: {
              hostname: 'demo.example.com',
              url: 'https://demo.example.com',
              zoneId: 'zone-1',
              zoneName: 'example.com',
              domainPrefix: 'demo',
              status: 'ready',
              dnsStatus: 'created',
              domainStatus: 'active',
            },
          },
          createdAt: 1,
          updatedAt: 2,
        }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Deploy to Cloudflare Pages/i }));

    const zoneSelect = await screen.findByRole('combobox', { name: /Domain/i });
    await waitFor(() => {
      expect((zoneSelect as HTMLSelectElement).value).toBe('zone-1');
    });
    fireEvent.change(screen.getByLabelText(/Subdomain prefix/i), { target: { value: 'demo' } });

    const deployButtons = screen.getAllByRole('button', { name: /Deploy to Cloudflare Pages/i });
    fireEvent.click(deployButtons[deployButtons.length - 1]!);

    const pagesDevLabel = await screen.findByText('pages.dev URL');
    const customDomainLabel = await screen.findByText('Custom domain');
    expect(customDomainLabel).toBeTruthy();
    expect(pagesDevLabel.closest('.deploy-result-block')).toBe(customDomainLabel.closest('.deploy-result-block'));
    expect(screen.getByText('https://demo-pages.pages.dev')).toBeTruthy();
    expect(screen.getByText('https://demo.example.com')).toBeTruthy();
    expect(deployBody).toMatchObject({
      fileName: 'index.html',
      providerId: 'cloudflare-pages',
      cloudflarePages: {
        zoneId: 'zone-1',
        zoneName: 'example.com',
        domainPrefix: 'demo',
      },
    });
  });

  it('shows separate copy links for existing Vercel and Cloudflare deployments', async () => {
    const file = baseFile({
      name: 'index.html',
      path: 'index.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Page',
        entry: 'index.html',
        renderer: 'html',
        exports: ['html'],
      },
    });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/projects/project-1/deployments') {
        return new Response(JSON.stringify({
          deployments: [
            {
              id: 'vercel-deploy',
              projectId: 'project-1',
              fileName: 'index.html',
              providerId: 'vercel-self',
              url: 'https://vercel.example',
              deploymentCount: 1,
              target: 'preview',
              status: 'ready',
              createdAt: 1,
              updatedAt: 2,
            },
            {
              id: 'cloudflare-deploy',
              projectId: 'project-1',
              fileName: 'index.html',
              providerId: 'cloudflare-pages',
              url: 'https://cloudflare.pages.dev',
              deploymentCount: 1,
              target: 'preview',
              status: 'ready',
              createdAt: 1,
              updatedAt: 3,
            },
          ],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    expect(await screen.findByRole('menuitem', { name: /Copy link · Vercel/i })).toBeTruthy();
    const cloudflareCopy = await screen.findByRole('menuitem', { name: /Copy link · Cloudflare Pages/i });
    fireEvent.click(cloudflareCopy);

    expect(writeText).toHaveBeenCalledWith('https://cloudflare.pages.dev');
  });

  it('shows one copy link when only one deployment provider has a URL', async () => {
    const file = baseFile({
      name: 'index.html',
      path: 'index.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Page',
        entry: 'index.html',
        renderer: 'html',
        exports: ['html'],
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      deployments: [
        {
          id: 'cloudflare-deploy',
          projectId: 'project-1',
          fileName: 'index.html',
          providerId: 'cloudflare-pages',
          url: 'https://cloudflare.pages.dev',
          deploymentCount: 1,
          target: 'preview',
          status: 'ready',
          createdAt: 1,
          updatedAt: 3,
        },
      ],
    }), { status: 200 })));

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    expect(await screen.findByRole('menuitem', { name: /Copy link · Cloudflare Pages/i })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: /Copy link · Vercel/i })).toBeNull();
  });

  it('renders unsafe SVG source as escaped text instead of executable markup', () => {
    const file = baseFile({ name: 'unsafe.svg', path: 'unsafe.svg', mime: 'image/svg+xml' });
    const unsafeSource = [
      '<svg onload="alert(1)"><script>alert(2)</script><text>Logo</text></svg>',
      '<svg><![CDATA[<script>alert(3)</script>]]></svg>',
    ].join('\n');

    const markup = renderToStaticMarkup(
      <SvgViewer
        projectId="project-1"
        file={file}
        initialMode="source"
        initialSource={unsafeSource}
      />,
    );

    expect(markup).toContain('&lt;svg onload=&quot;alert(1)&quot;&gt;');
    expect(markup).toContain('&lt;script&gt;alert(2)&lt;/script&gt;');
    expect(markup).toContain('&lt;![CDATA[&lt;script&gt;alert(3)&lt;/script&gt;]]&gt;');
    expect(markup).not.toContain('<svg onload');
    expect(markup).not.toContain('<script>');
    expect(markup).not.toContain('<![CDATA[');
    expect(markup).not.toContain('dangerouslySetInnerHTML');
  });

  it('uses an in-app modal instead of window.prompt() when saving a template', async () => {
    saveTemplateMock.mockResolvedValueOnce({
      id: 'tpl_1',
      name: 'Landing Page',
      description: null,
      sourceProjectId: 'project-1',
      files: [],
      createdAt: Date.now(),
    });
    const promptSpy = vi.spyOn(window, 'prompt');
    const file = baseFile({
      name: 'landing-page.html',
      path: 'landing-page.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Landing Page',
        entry: 'landing-page.html',
        renderer: 'html',
        exports: ['html'],
      },
    });

    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /save as template/i }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    const nameInput = screen.getByLabelText(/template name/i) as HTMLInputElement;
    expect(nameInput.value).toBe('landing-page');
    fireEvent.change(nameInput, { target: { value: 'Landing Page' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(saveTemplateMock).toHaveBeenCalledWith({
        name: 'Landing Page',
        description: undefined,
        sourceProjectId: 'project-1',
      }),
    );
    expect(promptSpy).not.toHaveBeenCalled();
    promptSpy.mockRestore();
  });
});

describe('FileViewer tweaks toolbar', () => {
  const t = (key: keyof Dict) => {
    const labels: Partial<Record<keyof Dict, string>> = {
      'chat.tabComments': 'Comments',
      'chat.comments.emptySaved': 'No saved comments.',
      'common.close': 'Close',
      'preview.showSidebar': 'Show Comments',
      'preview.hideSidebar': 'Hide Comments',
    };
    return labels[key] ?? key;
  };

  function htmlPreviewFile(): ProjectFile {
    return baseFile({
      name: 'preview.html',
      path: 'preview.html',
      mime: 'text/html',
      kind: 'html',
      artifactManifest: {
        version: 1,
        kind: 'html',
        title: 'Preview',
        entry: 'preview.html',
        renderer: 'html',
        exports: ['html'],
      },
    });
  }

  it('renders the toolbar Draw entry alongside restored Comment and Inspect entries', () => {
    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    expect(screen.getByTestId('palette-tweaks-toggle')).toBeTruthy();
    expect(screen.getByTestId('board-mode-toggle')).toBeTruthy();
    expect(screen.getByTestId('inspect-mode-toggle')).toBeTruthy();
    expect(screen.getByTestId('draw-overlay-toggle')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Type anywhere to add a note')).toBeNull();
    expect(screen.queryByTestId('comment-mode-toggle')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Pods' })).toBeNull();

    fireEvent.click(screen.getByTestId('draw-overlay-toggle'));
    expect(screen.getByPlaceholderText('Type anywhere to add a note')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Click' })).toBeTruthy();

    fireEvent.click(screen.getByTestId('draw-overlay-toggle'));
    expect(screen.queryByPlaceholderText('Type anywhere to add a note')).toBeNull();
  });

  it('keeps the Draw bar open after queueing an annotation', () => {
    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    fireEvent.click(screen.getByTestId('draw-overlay-toggle'));
    const note = screen.getByPlaceholderText('Type anywhere to add a note');
    fireEvent.change(note, { target: { value: 'mark this' } });
    fireEvent.click(screen.getByRole('button', { name: 'Queue' }));

    expect(screen.getByPlaceholderText('Type anywhere to add a note')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Draw' })[1]?.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Click' }).getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByTestId('draw-overlay-toggle'));
    expect(screen.queryByPlaceholderText('Type anywhere to add a note')).toBeNull();
  });

  it('enables element picking while the Draw bar is in click mode', async () => {
    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    fireEvent.click(screen.getByTestId('draw-overlay-toggle'));
    await waitFor(() => expect(frame.srcdoc).not.toContain('data-od-selection-bridge'));

    fireEvent.click(screen.getByRole('button', { name: 'Click' }));

    await waitFor(() => expect(frame.srcdoc).toContain('data-od-selection-bridge'));
    expect(frame.srcdoc).toContain('data-od-comment-mode');
  });

  it('disables Draw direct send while a task is running but keeps queue available', () => {
    render(
      <FileViewer projectId="project-1" projectKind="prototype" file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
        streaming
      />,
    );

    fireEvent.click(screen.getByTestId('draw-overlay-toggle'));
    fireEvent.change(screen.getByPlaceholderText('Type anywhere to add a note'), {
      target: { value: 'mark this' },
    });

    const queue = screen.getByRole('button', { name: 'Queue' }) as HTMLButtonElement;
    expect(queue.disabled).toBe(false);
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(screen.queryByText('Queues while working')).toBeNull();
  });

  it('hides non-open saved comments from preview markers when the side panel is empty', () => {
    const resolvedComment: PreviewComment = {
      id: 'comment-applying',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      filePath: 'preview.html',
      elementId: 'pin-applying',
      selector: '[data-od-pin="pin-applying"]',
      label: 'pin-applying',
      text: '',
      htmlHint: '',
      position: { x: 24, y: 32, width: 18, height: 18 },
      note: 'Already sent to Claude',
      status: 'applying',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
        previewComments={[resolvedComment]}
      />,
    );

    fireEvent.click(screen.getByTestId('board-mode-toggle'));

    expect(screen.getByTestId('comment-side-panel')).toBeTruthy();
    expect(screen.queryByTestId('comment-saved-marker-pin-applying')).toBeNull();
    expect(screen.queryByText('Already sent to Claude')).toBeNull();
  });

  it('keeps the picker hint clear of the open comment side panel', () => {
    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
      />,
    );

    fireEvent.click(screen.getByTestId('board-mode-toggle'));

    expect(screen.getByTestId('comment-side-panel')).toBeTruthy();
    expect(screen.getByTestId('inspect-empty-hint-container').className).toContain(
      'comment-side-panel-open',
    );

    fireEvent.click(screen.getByRole('button', { name: /hide comments/i }));

    expect(screen.getByTestId('inspect-empty-hint-container').className).not.toContain(
      'comment-side-panel-open',
    );
  });

  it('keeps saved comment marker numbers aligned with the side panel order', () => {
    const olderComment: PreviewComment = {
      id: 'comment-older',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      filePath: 'preview.html',
      elementId: 'pin-older',
      selector: '[data-od-pin="pin-older"]',
      label: 'pin-older',
      text: '',
      htmlHint: '',
      position: { x: 24, y: 32, width: 18, height: 18 },
      note: 'Older comment',
      status: 'open',
      createdAt: 10,
      updatedAt: 10,
    };
    const newerComment: PreviewComment = {
      ...olderComment,
      id: 'comment-newer',
      elementId: 'pin-newer',
      selector: '[data-od-pin="pin-newer"]',
      label: 'pin-newer',
      position: { x: 72, y: 32, width: 18, height: 18 },
      note: 'Newer comment',
      createdAt: 20,
      updatedAt: 20,
    };

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
        previewComments={[olderComment, newerComment]}
      />,
    );

    fireEvent.click(screen.getByTestId('board-mode-toggle'));

    expect(screen.getAllByTestId('comment-side-item')[0]?.textContent).toContain('Newer comment');
    expect(screen.getByTestId('comment-saved-marker-pin-newer').textContent).toContain('1');
    expect(screen.getByTestId('comment-saved-marker-pin-older').textContent).toContain('2');
  });

  it('does not preload non-open element comments into the picker composer', async () => {
    const applyingElementComment: PreviewComment = {
      id: 'comment-element-applying',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      filePath: 'preview.html',
      elementId: 'hero',
      selector: '[data-od-id="hero"]',
      label: 'Hero',
      text: 'Hero',
      htmlHint: '<main data-od-id="hero">Hero</main>',
      position: { x: 8, y: 12, width: 120, height: 48 },
      note: 'Do not resurrect this note',
      status: 'applying',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
        previewComments={[applyingElementComment]}
      />,
    );

    const frame = screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
    fireEvent.click(screen.getByTestId('board-mode-toggle'));

    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        type: 'od:comment-target',
        elementId: 'hero',
        selector: '[data-od-id="hero"]',
        label: 'Hero',
        text: 'Hero',
        position: { x: 8, y: 12, width: 120, height: 48 },
        htmlHint: '<main data-od-id="hero">Hero</main>',
      },
    }));

    const input = await screen.findByTestId('comment-popover-input') as HTMLTextAreaElement;
    expect(input.value).toBe('');
    expect(screen.queryByText('Remove')).toBeNull();
    expect(screen.queryByText('Do not resurrect this note')).toBeNull();
  });

  it('closes an open saved-comment composer when that comment leaves the open state', async () => {
    const openComment: PreviewComment = {
      id: 'comment-status-transition',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      filePath: 'preview.html',
      elementId: 'pin-transition',
      selector: '[data-od-pin="pin-transition"]',
      label: 'pin-transition',
      text: '',
      htmlHint: '',
      position: { x: 40, y: 52, width: 18, height: 18 },
      note: 'Do not recreate this stale comment',
      status: 'open',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const { rerender } = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
        previewComments={[openComment]}
      />,
    );

    fireEvent.click(screen.getByTestId('board-mode-toggle'));
    fireEvent.click(screen.getByRole('button', { name: 'Open comment for pin-transition' }));

    expect((await screen.findByTestId('comment-popover-input') as HTMLTextAreaElement).value)
      .toBe('Do not recreate this stale comment');

    rerender(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={htmlPreviewFile()}
        liveHtml='<html><body><main data-od-id="hero">Hero</main></body></html>'
        previewComments={[{ ...openComment, status: 'applying' }]}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('comment-popover-input')).toBeNull();
    });
    expect(screen.queryByTestId('comment-saved-marker-pin-transition')).toBeNull();
    expect(screen.queryByText('Do not recreate this stale comment')).toBeNull();
  });

  it('collapses the comment side panel into a narrow reopen rail', () => {
    const onCollapseChange = vi.fn();

    function Harness() {
      const [collapsed, setCollapsed] = useState(false);
      return (
        <CommentSidePanel
          comments={[
            {
              id: 'comment-1',
              projectId: 'project-1',
              conversationId: 'conversation-1',
              filePath: 'preview.html',
              elementId: 'button.sso-btn',
              selector: '[data-od-id="button.sso-btn"]',
              label: 'button.sso-btn',
              text: 'GitHub',
              htmlHint: '<button>GitHub</button>',
              position: { x: 16, y: 24, width: 160, height: 48 },
              note: '不要github，换成微信',
              status: 'open',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ]}
          selectedIds={new Set(['comment-1'])}
          collapsed={collapsed}
          onCollapsedChange={(next) => {
            onCollapseChange(next);
            setCollapsed(next);
          }}
          onToggleSelect={() => {}}
          onClearSelection={() => {}}
          onReply={() => {}}
          onSendSelected={() => {}}
          sending={false}
          t={t}
        />
      );
    }

    render(<Harness />);

    expect(screen.getByTestId('comment-side-panel')).toBeTruthy();
    expect(screen.getByText('不要github，换成微信')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /hide comments/i }));

    expect(onCollapseChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByText('不要github，换成微信')).toBeNull();
    expect(screen.queryByTestId('comment-side-selectbar')).toBeNull();
    expect(screen.getByTestId('comment-side-collapsed-rail')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /show comments/i }));

    expect(onCollapseChange).toHaveBeenLastCalledWith(false);
  });
});

describe('applyInspectOverridesToSource', () => {
  const base = `<!doctype html><html><head><title>X</title></head><body><main data-od-id="hero">Hi</main></body></html>`;
  const css = `[data-od-id="hero"] { color: #ff0000 !important }`;

  it('inserts the overrides block before </head>', () => {
    const next = applyInspectOverridesToSource(base, css);
    expect(next).toContain('<style data-od-inspect-overrides>');
    expect(next).toContain('color: #ff0000');
    expect(next.indexOf('<style data-od-inspect-overrides>')).toBeLessThan(next.indexOf('</head>'));
  });

  it('replaces an existing overrides block instead of duplicating', () => {
    const once = applyInspectOverridesToSource(base, css);
    const twice = applyInspectOverridesToSource(once, `[data-od-id="hero"] { color: #00ff00 !important }`);
    const matches = twice.match(/<style data-od-inspect-overrides>/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(twice).toContain('color: #00ff00');
    expect(twice).not.toContain('color: #ff0000');
  });

  it('strips the overrides block when called with empty css', () => {
    const once = applyInspectOverridesToSource(base, css);
    const stripped = applyInspectOverridesToSource(once, '');
    expect(stripped).not.toContain('data-od-inspect-overrides');
  });

  it('handles fragments without an explicit <head>', () => {
    const next = applyInspectOverridesToSource('<main data-od-id="x">x</main>', css);
    expect(next).toContain('<style data-od-inspect-overrides>');
    expect(next.indexOf('<style data-od-inspect-overrides>')).toBeLessThan(next.indexOf('<main'));
  });

  // Regression for nexu-io/open-design#362: if a source file has more than
  // one inspect override block (manual edit, or an earlier buggy save), the
  // splicer must drop them all before inserting the new block. A non-global
  // regex would only strip the first, so save-then-reload could resurrect an
  // override the user just cleared.
  it('removes every existing overrides block, not just the first', () => {
    const dup = `<!doctype html><html><head>` +
      `<style data-od-inspect-overrides>[data-od-id="hero"] { color: #ff0000 !important }</style>` +
      `<style data-od-inspect-overrides>[data-od-id="hero"] { color: #00ff00 !important }</style>` +
      `<title>X</title></head><body><main data-od-id="hero">Hi</main></body></html>`;
    const replaced = applyInspectOverridesToSource(dup, `[data-od-id="hero"] { color: #0000ff !important }`);
    const matches = replaced.match(/<style data-od-inspect-overrides>/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(replaced).toContain('color: #0000ff');
    expect(replaced).not.toContain('color: #ff0000');
    expect(replaced).not.toContain('color: #00ff00');

    const cleared = applyInspectOverridesToSource(dup, '');
    expect(cleared).not.toContain('data-od-inspect-overrides');
  });

  // Regression for nexu-io/open-design#362: the splicer must be HTML-aware
  // when locating its own override block and the head insertion point.
  // Generated artifacts commonly carry inline scripts/styles that mention
  // `</head>` or `<style data-od-inspect-overrides>` as text, e.g. a
  // template literal that builds HTML at runtime or a CSS rule that
  // documents the override block. A regex-only splicer would happily
  // splice into the middle of the script body or strip the literal string,
  // corrupting user code on Save to source.
  it('ignores </head> literals inside inline <script> and <style>', () => {
    const sourceWithLiteral =
      `<!doctype html><html><head>` +
      // Script body contains a quoted "</head>" string that must NOT be
      // treated as the real head close.
      `<script>const tpl = "<head>\\n</head>";</script>` +
      `<style>/* sentinel: </head> appears in this CSS comment */</style>` +
      `<title>X</title></head><body><main data-od-id="hero">Hi</main></body></html>`;
    const next = applyInspectOverridesToSource(sourceWithLiteral, css);
    // The override block must land exactly once, before the real </head>,
    // and after the inline <script> and <style> that contain `</head>`
    // text. Without HTML-aware scanning the regex would splice before the
    // first textual `</head>`, which sits inside the script body.
    const blockIdx = next.indexOf('<style data-od-inspect-overrides>');
    const realHeadEndIdx = next.indexOf('</head>', next.indexOf('<title>'));
    const scriptOpenIdx = next.indexOf('<script>');
    const scriptCloseIdx = next.indexOf('</script>');
    expect(blockIdx).toBeGreaterThan(-1);
    expect(realHeadEndIdx).toBeGreaterThan(-1);
    expect(scriptOpenIdx).toBeGreaterThan(-1);
    expect(scriptCloseIdx).toBeGreaterThan(-1);
    // Override block sits BEFORE the real </head>, AFTER the script body.
    expect(blockIdx).toBeLessThan(realHeadEndIdx);
    expect(blockIdx).toBeGreaterThan(scriptCloseIdx);
    // The script's `</head>` literal still survives in the output —
    // the splicer must not have hijacked it as the head insertion point.
    expect(next).toContain('const tpl = "<head>\\n</head>";');
    // The CSS comment's `</head>` token also survives untouched.
    expect(next).toContain('/* sentinel: </head> appears in this CSS comment */');
    // Only one override block in total.
    const blockMatches = next.match(/<style data-od-inspect-overrides>/g) ?? [];
    expect(blockMatches).toHaveLength(1);
  });

  it('ignores `<style data-od-inspect-overrides>` literals inside <script>', () => {
    // A sentinel string literal in an inline script that mentions the
    // override block by name. A regex-only splicer would strip the
    // literal as if it were a real block, mangling the script.
    const sourceWithLiteral =
      `<!doctype html><html><head>` +
      `<script>const banner = "<style data-od-inspect-overrides>color: red</style>";</script>` +
      `<title>X</title></head><body><main data-od-id="hero">Hi</main></body></html>`;
    const next = applyInspectOverridesToSource(sourceWithLiteral, css);
    // The literal must survive verbatim inside the script body.
    expect(next).toContain('const banner = "<style data-od-inspect-overrides>color: red</style>";');
    // The output still gains exactly one real override block.
    const blockMatches = next.match(/<style data-od-inspect-overrides>\n\[data-od-id="hero"\]/g) ?? [];
    expect(blockMatches).toHaveLength(1);
    // Stripping with empty css must NOT touch the script literal.
    const stripped = applyInspectOverridesToSource(sourceWithLiteral, '');
    expect(stripped).toContain('const banner = "<style data-od-inspect-overrides>color: red</style>";');
    // The script-internal literal is the only mention of the marker after
    // stripping — the splicer must not have inserted or kept any real
    // override block.
    const allMatches = stripped.match(/data-od-inspect-overrides/g) ?? [];
    expect(allMatches).toHaveLength(1);
  });

  // Regression for nexu-io/open-design#362: the splicer must look at real
  // attribute names, not just substring-match the marker text against the
  // whole opening tag. A `\bdata-od-inspect-overrides\b` regex over the
  // full tag matches both a longer attribute name (`-note` suffix) and the
  // marker spelled inside another attribute's value, so a plain `<style>`
  // documenting the override block in a `title` tooltip or a sibling note
  // attribute would be mis-stripped on save and would have its inner CSS
  // mis-parsed as override rules on hydration.
  it('does not strip <style> blocks whose attribute name only PREFIXES the marker', () => {
    const css2 = `[data-od-id="hero"] { color: #00ffaa !important }`;
    const userBlock = `body { background: red !important }`;
    const sourceWithLongerName =
      `<!doctype html><html><head>` +
      // attribute is named data-od-inspect-overrides-note, NOT the marker.
      // The note shouldn't be treated as an Inspect-owned style block.
      `<style data-od-inspect-overrides-note="docs">${userBlock}</style>` +
      `<title>X</title></head><body><main data-od-id="hero">Hi</main></body></html>`;
    const next = applyInspectOverridesToSource(sourceWithLongerName, css2);
    // The user's style with the longer attribute name must survive in the
    // output verbatim (with both the attribute and the body intact).
    expect(next).toContain('<style data-od-inspect-overrides-note="docs">');
    expect(next).toContain(userBlock);
    // Exactly one real override block lands before </head>.
    const blockMatches = next.match(/<style data-od-inspect-overrides>/g) ?? [];
    expect(blockMatches).toHaveLength(1);
    // Stripping with empty CSS still leaves the user's longer-name block
    // alone — there was no real override block to remove.
    const stripped = applyInspectOverridesToSource(sourceWithLongerName, '');
    expect(stripped).toContain('<style data-od-inspect-overrides-note="docs">');
    expect(stripped).toContain(userBlock);
    expect(stripped).not.toContain('<style data-od-inspect-overrides>');
  });

  it('does not strip <style> blocks that only mention the marker inside an attribute value', () => {
    const css2 = `[data-od-id="hero"] { color: #00ffaa !important }`;
    const userBlock = `body { background: red !important }`;
    const sourceWithMarkerInValue =
      `<!doctype html><html><head>` +
      // The literal text data-od-inspect-overrides appears as an attribute
      // VALUE on a normal <style title="..."> — there is no real override
      // marker here, so the splicer must keep the block.
      `<style title="data-od-inspect-overrides">${userBlock}</style>` +
      `<title>X</title></head><body><main data-od-id="hero">Hi</main></body></html>`;
    const next = applyInspectOverridesToSource(sourceWithMarkerInValue, css2);
    expect(next).toContain('<style title="data-od-inspect-overrides">');
    expect(next).toContain(userBlock);
    const blockMatches = next.match(/<style data-od-inspect-overrides>/g) ?? [];
    expect(blockMatches).toHaveLength(1);
    const stripped = applyInspectOverridesToSource(sourceWithMarkerInValue, '');
    expect(stripped).toContain('<style title="data-od-inspect-overrides">');
    expect(stripped).toContain(userBlock);
    expect(stripped).not.toContain('<style data-od-inspect-overrides>');
  });

  it('still strips a real <style data-od-inspect-overrides> block with assigned value', () => {
    // The marker is allowed both as a boolean attribute and with an
    // assigned value (`<style data-od-inspect-overrides="">`). The splicer
    // must treat both as the override block, not just the boolean shape.
    const sourceWithValuedMarker =
      `<!doctype html><html><head>` +
      `<style data-od-inspect-overrides="">` +
      `[data-od-id="hero"] { color: #ff0000 !important }` +
      `</style>` +
      `<title>X</title></head><body></body></html>`;
    const stripped = applyInspectOverridesToSource(sourceWithValuedMarker, '');
    expect(stripped).not.toContain('data-od-inspect-overrides');
    expect(stripped).not.toContain('color: #ff0000');
  });

  it('ignores </head> inside <textarea> and <title> raw-text elements', () => {
    // <textarea> and <title> are escapable raw-text elements; their
    // contents are text, not markup, so a literal `</head>` inside them
    // must not be treated as a tag boundary.
    const sourceWithTextarea =
      `<!doctype html><html><head><title>Has </head> in title</title></head>` +
      `<body><textarea>literal </head> goes here</textarea>` +
      `<main data-od-id="hero">Hi</main></body></html>`;
    const next = applyInspectOverridesToSource(sourceWithTextarea, css);
    // Override block lands before the REAL </head>, which is after the
    // </title>'s close. The title-internal `</head>` must not be the
    // chosen insertion point.
    const blockIdx = next.indexOf('<style data-od-inspect-overrides>');
    const titleCloseIdx = next.indexOf('</title>');
    const realHeadCloseIdx = next.indexOf('</head>', titleCloseIdx);
    expect(blockIdx).toBeGreaterThan(titleCloseIdx);
    expect(blockIdx).toBeLessThan(realHeadCloseIdx);
    // Both literals survive untouched.
    expect(next).toContain('Has </head> in title');
    expect(next).toContain('literal </head> goes here');
  });
});

describe('serializeInspectOverrides', () => {
  it('emits validated declarations for legitimate overrides', () => {
    const out = serializeInspectOverrides({
      hero: { selector: '[data-od-id="hero"]', props: { color: '#ff0000', 'font-size': '18px' } },
    });
    expect(out).toContain('[data-od-id="hero"]');
    expect(out).toContain('color: #ff0000 !important');
    expect(out).toContain('font-size: 18px !important');
  });

  it('honours data-screen-label entries the bridge tagged that way', () => {
    const out = serializeInspectOverrides({
      hero: { selector: '[data-screen-label="hero"]', props: { color: '#0f0' } },
    });
    expect(out).toContain('[data-screen-label="hero"]');
    expect(out).not.toContain('[data-od-id="hero"]');
  });

  // Regression for nexu-io/open-design#362: standard deck slides ship as
  // `<section data-screen-label="01 Cover">`. The bridge keys overrides by
  // the raw label and posts a CSS.escape'd selector, so the host must
  // accept whitespace/leading-digit ids and detect the selector kind by
  // prefix instead of full equality. Otherwise the override is dropped
  // outright (or silently rewritten to `[data-od-id="..."]`) and reload
  // erases the user's edit.
  it('preserves data-screen-label values with whitespace and leading digits', () => {
    const out = serializeInspectOverrides({
      '01 Cover': {
        selector: '[data-screen-label="\\30 1\\20 Cover"]',
        props: { color: '#ff0000', 'font-size': '20px' },
      },
    });
    expect(out).toContain('[data-screen-label="01 Cover"]');
    expect(out).not.toContain('[data-od-id="01 Cover"]');
    expect(out).toContain('color: #ff0000 !important');
    expect(out).toContain('font-size: 20px !important');
  });

  it('rejects non-allow-listed properties', () => {
    const out = serializeInspectOverrides({
      hero: { selector: '[data-od-id="hero"]', props: { position: 'absolute', color: '#fff' } },
    });
    expect(out).not.toContain('position');
    expect(out).toContain('color: #fff !important');
  });

  it('drops values that try to break out of a `prop: value` declaration', () => {
    const out = serializeInspectOverrides({
      hero: {
        selector: '[data-od-id="hero"]',
        // semicolon, brace, angle bracket, and newline are all rejected.
        props: {
          color: 'red; background: url(x)',
          'font-size': '16px } [body] { color: red',
          'font-family': 'Arial</style><script>alert(1)</script>',
          'line-height': '1\n.evil',
        },
      },
    });
    expect(out).toBe('');
  });

  // The vulnerability we're regression-testing: artifact code rendered with
  // scripts enabled can call window.parent.postMessage({ type:
  // 'od:inspect-overrides', overrides, css: '</style><script>...</script>' })
  // — ev.source still matches iframe.contentWindow, so the host listener
  // accepts it. The fix is that the host re-derives CSS from the structured
  // `overrides` field under its own allow-list and ignores the inbound `css`
  // entirely. This test covers that the serializer never lets a forged
  // payload reach the persisted style block.
  it('refuses to surface a forged </style><script> payload', () => {
    const forged = {
      // Hostile selector string: re-derived from elementId, never trusted.
      hero: {
        selector: '} </style><script>alert(1)</script><style>{',
        props: { color: '#fff' },
      },
      // Hostile elementId: rejected outright by the safe-id check.
      '"></style><script>alert(2)</script>': {
        selector: '[data-od-id="x"]',
        props: { color: '#fff' },
      },
      // Hostile value: rejected by UNSAFE_VALUE.
      villain: {
        selector: '[data-od-id="villain"]',
        props: { color: '</style><script>alert(3)</script>' },
      },
    };
    const out = serializeInspectOverrides(forged);
    expect(out).not.toContain('</style>');
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('alert(');
    // The legitimate-looking entry still serializes — but with a re-derived
    // selector, not the attacker-supplied one.
    expect(out).toContain('[data-od-id="hero"] { color: #fff !important }');
    expect(out).not.toContain('villain');

    // And the spliced source must not contain executable markup either,
    // even when the forged body is concatenated into a <style> block.
    const spliced = applyInspectOverridesToSource(
      '<!doctype html><html><head></head><body></body></html>',
      out,
    );
    expect(spliced).not.toContain('</style><script>');
    expect(spliced).not.toContain('alert(');
  });

  it('returns empty string for non-object payloads', () => {
    expect(serializeInspectOverrides(null)).toBe('');
    expect(serializeInspectOverrides(undefined)).toBe('');
    expect(serializeInspectOverrides('</style><script>alert(1)</script>')).toBe('');
    expect(serializeInspectOverrides(42)).toBe('');
  });
});

// Regression for nexu-io/open-design#362: the host owns the inspect override
// map authoritatively. Hydration parses the artifact source on load so an
// initial Save-to-source preserves prior rules even when the user edits a
// different element, and forging the iframe's od:inspect-overrides reply
// cannot inject overrides — the host never ingests it.
describe('parseInspectOverridesFromSource', () => {
  it('returns an empty map when the source has no override block', () => {
    expect(parseInspectOverridesFromSource('')).toEqual({});
    expect(parseInspectOverridesFromSource('<!doctype html><html><body>x</body></html>')).toEqual({});
  });

  it('parses an existing override block into the host map', () => {
    const source =
      `<!doctype html><html><head>` +
      `<style data-od-inspect-overrides>` +
      `[data-od-id="hero"] { color: #ff0000 !important; font-size: 18px !important }` +
      `\n[data-screen-label="01 Cover"] { background-color: #000 !important }` +
      `</style></head><body></body></html>`;
    const map = parseInspectOverridesFromSource(source);
    expect(map.hero?.props).toEqual({ color: '#ff0000', 'font-size': '18px' });
    expect(map.hero?.selector).toBe('[data-od-id="hero"]');
    expect(map['01 Cover']?.props).toEqual({ 'background-color': '#000' });
    expect(map['01 Cover']?.selector).toBe('[data-screen-label="01 Cover"]');
  });

  it('aggregates rules across multiple persisted blocks', () => {
    const source =
      `<style data-od-inspect-overrides>[data-od-id="a"] { color: #111 !important }</style>` +
      `<style data-od-inspect-overrides>[data-od-id="b"] { color: #222 !important }</style>`;
    const map = parseInspectOverridesFromSource(source);
    expect(Object.keys(map).sort()).toEqual(['a', 'b']);
  });

  it('drops disallowed properties and rules whose only declarations are unsafe', () => {
    const source =
      `<style data-od-inspect-overrides>` +
      `[data-od-id="hero"] { position: absolute !important; color: #fff !important }` +
      `[data-od-id="bad"] { background: red } ` +
      `</style>`;
    const map = parseInspectOverridesFromSource(source);
    expect(map.hero?.props).toEqual({ color: '#fff' });
    expect(map.bad).toBeUndefined();
  });

  it('refuses elementIds whose characters could break out of the attr value', () => {
    const hostile =
      `<style data-od-inspect-overrides>` +
      `[data-od-id="\"><script>alert(1)</script>"] { color: #fff !important }` +
      `</style>`;
    expect(parseInspectOverridesFromSource(hostile)).toEqual({});
  });

  it('ignores override-shaped text inside raw-text elements and HTML comments', () => {
    // A template literal in a <script>, a CSS comment in a sibling <style>, the
    // body of a <textarea> / <title>, and an HTML comment all contain text that
    // would match the override block regex. None of them are real persisted
    // overrides, so the host map must stay empty — otherwise useEffect would
    // seed phantom rules and a later Save-to-source would write CSS the user
    // never created.
    const phantomBlock =
      `<style data-od-inspect-overrides>` +
      `[data-od-id="hero"] { color: #ff0000 !important }` +
      `</style>`;
    const source =
      `<!doctype html><html><head>` +
      `<script>const tmpl = \`${phantomBlock}\`;</script>` +
      `<style>/* docs: ${phantomBlock} */</style>` +
      `<title>${phantomBlock}</title>` +
      `<!-- ${phantomBlock} -->` +
      `</head><body><textarea>${phantomBlock}</textarea></body></html>`;
    expect(parseInspectOverridesFromSource(source)).toEqual({});
  });

  // Regression for nexu-io/open-design#362: hydration must require an
  // actual `data-od-inspect-overrides` attribute name, not a boundary-only
  // substring match against the whole opening tag. Otherwise a sibling
  // attribute name with `-note` suffix or a tooltip whose value contains
  // the marker text would seed phantom overrides into the host map and
  // a later Save-to-source would persist CSS the artifact never had.
  it('does not seed phantom overrides from a longer attribute name', () => {
    const source =
      `<!doctype html><html><head>` +
      `<style data-od-inspect-overrides-note="docs">` +
      `[data-od-id="hero"] { color: #ff0000 !important }` +
      `</style></head><body></body></html>`;
    expect(parseInspectOverridesFromSource(source)).toEqual({});
  });

  it('does not seed phantom overrides when the marker text only appears in an attribute value', () => {
    const source =
      `<!doctype html><html><head>` +
      `<style title="data-od-inspect-overrides">` +
      `[data-od-id="hero"] { color: #ff0000 !important }` +
      `</style></head><body></body></html>`;
    expect(parseInspectOverridesFromSource(source)).toEqual({});
  });

  it('still parses a real override block when raw-text literals also mention one', () => {
    const phantomBlock =
      `<style data-od-inspect-overrides>` +
      `[data-od-id="phantom"] { color: #ff0000 !important }` +
      `</style>`;
    const source =
      `<!doctype html><html><head>` +
      `<script>const tmpl = \`${phantomBlock}\`;</script>` +
      `<style data-od-inspect-overrides>` +
      `[data-od-id="hero"] { color: #00ff00 !important }` +
      `</style>` +
      `</head><body></body></html>`;
    const map = parseInspectOverridesFromSource(source);
    expect(Object.keys(map)).toEqual(['hero']);
    expect(map.hero?.props).toEqual({ color: '#00ff00' });
  });
});

describe('updateInspectOverride', () => {
  const base: InspectOverrideMap = {
    hero: { selector: '[data-od-id="hero"]', props: { color: '#ff0000' } },
  };

  it('adds a new property to an existing entry', () => {
    const next = updateInspectOverride(base, 'hero', '[data-od-id="hero"]', 'font-size', '18px');
    expect(next).not.toBe(base);
    expect(next.hero?.props).toEqual({ color: '#ff0000', 'font-size': '18px' });
  });

  it('creates a new entry for a previously untouched element', () => {
    const next = updateInspectOverride(base, 'cta', '[data-od-id="cta"]', 'color', '#00ff00');
    expect(next.cta?.props).toEqual({ color: '#00ff00' });
    expect(next.hero?.props).toEqual({ color: '#ff0000' });
  });

  it('clears a single property when given an empty value', () => {
    const seeded = updateInspectOverride(base, 'hero', '[data-od-id="hero"]', 'font-size', '18px');
    const cleared = updateInspectOverride(seeded, 'hero', '[data-od-id="hero"]', 'font-size', '');
    expect(cleared.hero?.props).toEqual({ color: '#ff0000' });
  });

  it('drops the entry once the last property is cleared', () => {
    const cleared = updateInspectOverride(base, 'hero', '[data-od-id="hero"]', 'color', '');
    expect(cleared.hero).toBeUndefined();
  });

  it('returns the same map reference when the change is a no-op', () => {
    const same = updateInspectOverride(base, 'hero', '[data-od-id="hero"]', 'color', '#ff0000');
    expect(same).toBe(base);
    const noClear = updateInspectOverride(base, 'hero', '[data-od-id="hero"]', 'font-size', '');
    expect(noClear).toBe(base);
  });

  it('rejects properties off the host allow-list', () => {
    const ignored = updateInspectOverride(base, 'hero', '[data-od-id="hero"]', 'position', 'absolute');
    expect(ignored).toBe(base);
  });

  it('rejects values that could break out of `prop: value`', () => {
    const ignored = updateInspectOverride(
      base,
      'hero',
      '[data-od-id="hero"]',
      'color',
      'red; background: url(x)',
    );
    expect(ignored).toBe(base);
  });

  it('rejects elementIds whose characters could break out of the attr value', () => {
    const ignored = updateInspectOverride(
      base,
      '"><script>alert(1)</script>',
      '[data-od-id="x"]',
      'color',
      '#fff',
    );
    expect(ignored).toBe(base);
  });
});

function baseLiveArtifact(overrides: Partial<LiveArtifact> = {}): LiveArtifact {
  const artifact: LiveArtifact = {
    schemaVersion: 1,
    id: 'la_1',
    projectId: 'proj_1',
    title: 'Launch Metrics',
    slug: 'launch-metrics',
    status: 'active',
    pinned: false,
    preview: { type: 'html', entry: 'index.html' },
    refreshStatus: 'idle',
    createdAt: '2026-04-29T12:00:00.000Z',
    updatedAt: '2026-04-29T12:00:00.000Z',
    document: {
      format: 'html_template_v1',
      templatePath: 'template.html',
      generatedPreviewPath: 'index.html',
      dataPath: 'data.json',
      dataJson: { title: 'Launch Metrics' },
    },
  };
  return { ...artifact, ...overrides, document: overrides.document ?? artifact.document };
}

function baseLiveArtifactWorkspaceEntry(
  overrides: Partial<LiveArtifactWorkspaceEntry> = {},
): LiveArtifactWorkspaceEntry {
  const entry: LiveArtifactWorkspaceEntry = {
    kind: 'live-artifact',
    tabId: 'live:la_1',
    artifactId: 'la_1',
    projectId: 'proj_1',
    title: 'Launch Metrics',
    slug: 'launch-metrics',
    status: 'active',
    refreshStatus: 'idle',
    pinned: false,
    preview: { type: 'html', entry: 'index.html' },
    hasDocument: true,
    updatedAt: '2026-04-29T12:00:00.000Z',
  };
  return { ...entry, ...overrides };
}

describe('LiveArtifactViewer', () => {
  it('keeps the presentation exit button aligned with preview chrome spacing', () => {
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
    const rule = css.match(/\.present-exit\s*\{[^}]+\}/)?.[0] ?? '';

    expect(rule).toContain('top: calc(env(safe-area-inset-top, 0px) + 20px);');
    expect(rule).toContain('right: calc(env(safe-area-inset-right, 0px) + 20px);');
    expect(rule).toContain('display: inline-flex;');
    expect(rule).toContain('align-items: center;');
  });

  it('enters and exits in-tab presentation from the present menu', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/live-artifacts/la_1?projectId=proj_1') {
        return new Response(JSON.stringify({ artifact: baseLiveArtifact() }), { status: 200 });
      }
      if (url === '/api/live-artifacts/la_1/refreshes?projectId=proj_1') {
        return new Response(JSON.stringify({ refreshes: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <LiveArtifactViewer
        projectId="proj_1"
        liveArtifact={baseLiveArtifactWorkspaceEntry()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /present/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /present/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /in this tab/i }));

    await waitFor(() => {
      expect(container.querySelector('.live-artifact-viewer.is-tab-present')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: /exit fullscreen/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /exit fullscreen/i }));
    await waitFor(() => {
      expect(container.querySelector('.live-artifact-viewer.is-tab-present')).toBeNull();
    });
  });

  it('keeps in-tab presentation off when fullscreen request fails', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/live-artifacts/la_1?projectId=proj_1') {
        return new Response(JSON.stringify({ artifact: baseLiveArtifact() }), { status: 200 });
      }
      if (url === '/api/live-artifacts/la_1/refreshes?projectId=proj_1') {
        return new Response(JSON.stringify({ refreshes: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <LiveArtifactViewer
        projectId="proj_1"
        liveArtifact={baseLiveArtifactWorkspaceEntry()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /present/i })).toBeTruthy();
    });

    const requestFullscreen = vi.fn(() => Promise.reject(new Error('denied')));
    const previewHost = container.querySelector('.viewer-body');
    expect(previewHost).toBeTruthy();
    Object.defineProperty(previewHost!, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });

    fireEvent.click(screen.getByRole('button', { name: /present/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /fullscreen/i }));

    await waitFor(() => {
      expect(requestFullscreen).toHaveBeenCalled();
    });
    expect(container.querySelector('.live-artifact-viewer.is-tab-present')).toBeNull();
    expect(screen.queryByRole('button', { name: /exit fullscreen/i })).toBeNull();
  });

  it('requests fullscreen without entering in-tab presentation when fullscreen succeeds', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/live-artifacts/la_1?projectId=proj_1') {
        return new Response(JSON.stringify({ artifact: baseLiveArtifact() }), { status: 200 });
      }
      if (url === '/api/live-artifacts/la_1/refreshes?projectId=proj_1') {
        return new Response(JSON.stringify({ refreshes: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <LiveArtifactViewer
        projectId="proj_1"
        liveArtifact={baseLiveArtifactWorkspaceEntry()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /present/i })).toBeTruthy();
    });

    const requestFullscreen = vi.fn(() => Promise.resolve());
    const previewHost = container.querySelector('.viewer-body');
    expect(previewHost).toBeTruthy();
    Object.defineProperty(previewHost!, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });

    fireEvent.click(screen.getByRole('button', { name: /present/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /fullscreen/i }));

    await waitFor(() => {
      expect(requestFullscreen).toHaveBeenCalled();
    });
    expect(container.querySelector('.live-artifact-viewer.is-tab-present')).toBeNull();
    expect(screen.queryByRole('button', { name: /exit fullscreen/i })).toBeNull();
  });

  it('opens the rendered preview in a new tab from the present menu', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/live-artifacts/la_1?projectId=proj_1') {
        return new Response(JSON.stringify({ artifact: baseLiveArtifact() }), { status: 200 });
      }
      if (url === '/api/live-artifacts/la_1/refreshes?projectId=proj_1') {
        return new Response(JSON.stringify({ refreshes: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    const openMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('open', openMock);

    render(
      <LiveArtifactViewer
        projectId="proj_1"
        liveArtifact={baseLiveArtifactWorkspaceEntry()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /present/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /present/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: /new tab/i }));

    expect(openMock).toHaveBeenCalledWith(
      '/api/live-artifacts/la_1/preview?projectId=proj_1',
      '_blank',
      'noopener,noreferrer',
    );
    expect(screen.queryByRole('button', { name: /exit fullscreen/i })).toBeNull();
  });

  it('renders the toolbar Open link as an external preview link', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/live-artifacts/la_1?projectId=proj_1') {
        return new Response(JSON.stringify({ artifact: baseLiveArtifact() }), { status: 200 });
      }
      if (url === '/api/live-artifacts/la_1/refreshes?projectId=proj_1') {
        return new Response(JSON.stringify({ refreshes: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <LiveArtifactViewer
        projectId="proj_1"
        liveArtifact={baseLiveArtifactWorkspaceEntry()}
      />,
    );

    const openLink = await screen.findByRole('link', { name: /^open$/i });
    expect(openLink.getAttribute('href')).toBe('/api/live-artifacts/la_1/preview?projectId=proj_1');
    expect(openLink.getAttribute('target')).toBe('_blank');
    expect(openLink.getAttribute('rel')).toContain('noreferrer');
    expect(openLink.getAttribute('rel')).toContain('noopener');
    expect(openLink.getAttribute('tabindex')).not.toBe('-1');
  });

  it('takes the toolbar Open link out of the tab order outside preview mode', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/live-artifacts/la_1?projectId=proj_1') {
        return new Response(JSON.stringify({ artifact: baseLiveArtifact() }), { status: 200 });
      }
      if (url === '/api/live-artifacts/la_1/refreshes?projectId=proj_1') {
        return new Response(JSON.stringify({ refreshes: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <LiveArtifactViewer
        projectId="proj_1"
        liveArtifact={baseLiveArtifactWorkspaceEntry()}
      />,
    );

    const openLink = await screen.findByRole('link', { name: /^open$/i });
    expect(openLink.getAttribute('tabindex')).not.toBe('-1');

    fireEvent.click(screen.getByRole('button', { name: /code/i }));

    await waitFor(() => {
      expect(container.querySelector('.ghost-link')?.getAttribute('tabindex')).toBe('-1');
    });
  });

  it('restores the toolbar Open link to the tab order when returning to preview mode', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/live-artifacts/la_1?projectId=proj_1') {
        return new Response(JSON.stringify({ artifact: baseLiveArtifact() }), { status: 200 });
      }
      if (url === '/api/live-artifacts/la_1/refreshes?projectId=proj_1') {
        return new Response(JSON.stringify({ refreshes: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(
      <LiveArtifactViewer
        projectId="proj_1"
        liveArtifact={baseLiveArtifactWorkspaceEntry()}
      />,
    );

    await screen.findByRole('link', { name: /^open$/i });

    fireEvent.click(screen.getByRole('button', { name: /code/i }));

    await waitFor(() => {
      expect(container.querySelector('.ghost-link')?.getAttribute('tabindex')).toBe('-1');
    });

    fireEvent.click(screen.getByRole('button', { name: /preview/i }));

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /^open$/i }).getAttribute('tabindex')).not.toBe('-1');
    });
  });

  it('closes the present menu on Escape without tearing down the viewer', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      if (url === '/api/live-artifacts/la_1?projectId=proj_1') {
        return new Response(JSON.stringify({ artifact: baseLiveArtifact() }), { status: 200 });
      }
      if (url === '/api/live-artifacts/la_1/refreshes?projectId=proj_1') {
        return new Response(JSON.stringify({ refreshes: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <LiveArtifactViewer
        projectId="proj_1"
        liveArtifact={baseLiveArtifactWorkspaceEntry()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /present/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /present/i }));
    expect(screen.getByRole('menuitem', { name: /new tab/i })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: /new tab/i })).toBeNull();
    });
    expect(screen.getByRole('button', { name: /present/i })).toBeTruthy();
  });
});

describe('LiveArtifactRefreshHistoryPanel', () => {
  it('renders a human-readable status instead of raw JSON when no history exists', () => {
    const markup = renderToStaticMarkup(
      <LiveArtifactRefreshHistoryPanel
        liveArtifact={baseLiveArtifact({ refreshStatus: 'never' })}
        fallbackRefreshStatus="never"
        isRunning={false}
        sessionEvents={[]}
      />,
    );

    // Status badge with tone, not JSON
    expect(markup).toContain('live-artifact-refresh-panel');
    expect(markup).toContain('data-testid="live-artifact-refresh-status-badge"');
    expect(markup).toContain('Not refreshable');
    expect(markup).toContain('Last refreshed');
    expect(markup).toContain('Never');
    expect(markup).toContain('No refresh activity yet in this session');
    // Raw JSON is available but tucked inside a collapsed <details>, not exposed as the primary view.
    expect(markup).toContain('<details');
    expect(markup).toContain('Advanced debug metadata');
    const detailsIndex = markup.indexOf('<details');
    const rawJsonIndex = markup.search(/<pre class="viewer-source">\s*\{/);
    expect(detailsIndex).toBeGreaterThanOrEqual(0);
    expect(rawJsonIndex).toBeGreaterThan(detailsIndex);
  });

  it('surfaces running state and a session timeline with duration + source counts', () => {
    const now = Date.now();
    const markup = renderToStaticMarkup(
      <LiveArtifactRefreshHistoryPanel
        liveArtifact={baseLiveArtifact({
          refreshStatus: 'succeeded',
          lastRefreshedAt: new Date(now - 45_000).toISOString(),
        })}
        fallbackRefreshStatus="succeeded"
        isRunning
        sessionEvents={[
          { id: 1, phase: 'started', at: now - 5_000 },
          {
            id: 2,
            phase: 'succeeded',
            at: now - 1_200,
            durationMs: 3_800,
            refreshedSourceCount: 2,
          },
        ]}
      />,
    );

    // isRunning wins over persisted `succeeded`
    expect(markup).toContain('Refreshing');
    // Both timeline rows are present
    expect(markup).toContain('Started');
    expect(markup).toContain('Succeeded');
    // Source count + duration are humanized (3.8s), not raw ms
    expect(markup).toContain('2 sources updated');
    expect(markup).toContain('3.8s');
  });

  // Lefarcen review on PR #1300: the existing renderToStaticMarkup
  // assertions above can't prove that the panel actually routes its
  // strings through i18n, because the no-provider fallback returns
  // English no matter what locale the rest of the app is set to. This
  // test wraps the panel in `I18nProvider initial="zh-CN"` and pins
  // the Chinese rendering of the strings issue #1254 was filed for:
  // the badge descriptor, the hero label + empty state, the session
  // section header + hint, the empty-timeline copy, the persisted
  // section + its empty copy, started / succeeded event labels, the
  // pluralised source-count line, the document-source labels, and the
  // advanced debug summary. If a future change drops `t()` off any
  // of those callsites, this test catches it before the user sees
  // the mixed-language regression.
  it('renders Chinese strings end-to-end when wrapped in I18nProvider initial="zh-CN"', () => {
    const now = Date.now();
    const markup = renderToStaticMarkup(
      <I18nProvider initial="zh-CN">
        <LiveArtifactRefreshHistoryPanel
          liveArtifact={baseLiveArtifact({
            refreshStatus: 'succeeded',
            // Real lastRefreshedAt + non-empty session events so the
            // relative-time path also runs under zh-CN; the lefarcen
            // P1 review specifically called out that the formerly
            // hardcoded `Xs ago` / `Xm ago` strings would still leak
            // English under a Chinese UI without this.
            lastRefreshedAt: new Date(now - 45_000).toISOString(),
            document: {
              format: 'html_template_v1',
              templatePath: 'template.html',
              generatedPreviewPath: 'index.html',
              dataPath: 'data.json',
              dataJson: { title: 'Launch Metrics' },
              sourceJson: {
                type: 'connector_tool',
                toolName: 'design-files.list',
                input: {},
                refreshPermission: 'none',
                connector: {
                  connectorId: 'figma',
                  toolName: 'design-files.list',
                  accountLabel: 'figma:acct-1',
                },
              },
            },
          })}
          fallbackRefreshStatus="succeeded"
          isRunning={false}
          sessionEvents={[
            { id: 1, phase: 'started', at: now - 5_000 },
            {
              id: 2,
              phase: 'succeeded',
              at: now - 1_200,
              durationMs: 3_800,
              refreshedSourceCount: 1,
            },
          ]}
          persistedEvents={[]}
        />
      </I18nProvider>,
    );

    // Hero
    expect(markup).toContain('上次刷新');
    // Session activity section
    expect(markup).toContain('会话活动');
    expect(markup).toContain('本标签页打开期间观察到的事件');
    // Event labels + pluralised source count for n === 1
    expect(markup).toContain('已开始');
    expect(markup).toContain('已成功');
    expect(markup).toContain('已更新 1 个数据源');
    // Persisted history section + empty copy
    expect(markup).toContain('持久化刷新记录');
    expect(markup).toContain('尚无持久化的刷新记录。');
    // Document source section
    expect(markup).toContain('文档来源');
    expect(markup).toContain('已配置的数据源');
    expect(markup).toContain('类型');
    expect(markup).toContain('工具');
    expect(markup).toContain('连接器');
    // Advanced debug metadata
    expect(markup).toContain('高级调试元数据');
    // English label that previously leaked through must NOT appear
    // (mixed-language is exactly the regression issue #1254 filed for).
    expect(markup).not.toContain('Last refreshed');
    expect(markup).not.toContain('Session activity');
    expect(markup).not.toContain('Persisted refresh history');
    expect(markup).not.toContain('Document source');
    expect(markup).not.toContain('Advanced debug metadata');
    // Relative-time output must be Chinese, not English. The lefarcen
    // P1 review pointed out that formatRelativeTime was hardcoding
    // English units (`Xs ago`), so a 45s-old hero metric would still
    // read `45s ago` even with every label translated. Assert against
    // the Chinese past-tense suffix `前` and rule out the English
    // suffixes the legacy function emitted.
    expect(markup).toContain('前');
    expect(markup).not.toContain(' ago');
    expect(markup).not.toContain('from now');
    expect(markup).not.toMatch(/\b\d+s ago\b/);
    expect(markup).not.toMatch(/\b\d+m ago\b/);
  });

  it('renders the zh-CN empty hero ("从未") when lastRefreshedAt is missing', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider initial="zh-CN">
        <LiveArtifactRefreshHistoryPanel
          liveArtifact={baseLiveArtifact({ refreshStatus: 'never', lastRefreshedAt: undefined })}
          fallbackRefreshStatus="never"
          isRunning={false}
          sessionEvents={[]}
        />
      </I18nProvider>,
    );

    expect(markup).toContain('上次刷新');
    expect(markup).toContain('从未');
    expect(markup).not.toContain('Last refreshed');
    expect(markup).not.toContain('>Never<');
  });
});
