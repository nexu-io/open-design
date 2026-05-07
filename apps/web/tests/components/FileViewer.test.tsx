// @vitest-environment jsdom

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
  FileViewer,
  LiveArtifactRefreshHistoryPanel,
  SvgViewer,
} from '../../src/components/FileViewer';
import type { LiveArtifact, ProjectFile } from '../../src/types';

afterEach(() => cleanup());

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

    const markup = renderToStaticMarkup(<FileViewer projectId="project-1" file={file} />);

    expect(markup).toContain('class="viewer svg-viewer"');
    expect(markup).not.toContain('class="viewer image-viewer"');
    expect(markup).toContain('Preview');
    expect(markup).toContain('Source');
    expect(markup).toContain('src="/api/projects/project-1/raw/diagram.svg?v=1710000000&amp;r=0"');
  });

  it('keeps normal image artifacts on the existing image viewer path', () => {
    const file = baseFile({ name: 'photo.png', path: 'photo.png' });

    const markup = renderToStaticMarkup(<FileViewer projectId="project-1" file={file} />);

    expect(markup).toContain('class="viewer image-viewer"');
    expect(markup).not.toContain('class="viewer svg-viewer"');
    expect(markup).not.toContain('class="viewer-tabs"');
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
      <FileViewer projectId="project-1" file={file} liveHtml="<html><body>hi</body></html>" />,
    );

    expect(markup).toContain('data-testid="artifact-preview-frame"');
    expect(markup).toContain('data-od-render-mode="url-load"');
    expect(markup).toContain('src="/api/projects/project-1/raw/page.html?v=1710000000&amp;r=0"');
    expect(markup).not.toContain('data-od-render-mode="srcdoc"');
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
      <FileViewer
        projectId="project-1"
        file={file}
        isDeck
        liveHtml={'<html><body><section class="slide">one</section></body></html>'}
      />,
    );

    expect(markup).toContain('data-testid="artifact-preview-frame"');
    expect(markup).toContain('data-od-render-mode="srcdoc"');
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
      <FileViewer
        projectId="project-1"
        file={file}
        liveHtml={'<html><body><section class="slide">one</section><section class="slide">two</section></body></html>'}
      />,
    );

    expect(markup).toContain('data-od-render-mode="srcdoc"');
    expect(markup).not.toContain('data-od-render-mode="url-load"');
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
      <FileViewer
        projectId="project-1"
        file={file}
        liveHtml="<html><body><h1>Hello</h1></body></html>"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /share/i }));

    expect(screen.getByRole('menuitem', { name: /Deploy to Vercel/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: /Deploy to Cloudflare Pages/i }));

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Account ID')).toBeTruthy();
    expect(screen.queryByText('Pages project name')).toBeNull();
    expect(screen.queryByText(/generates a Pages project name automatically/i)).toBeNull();
    expect(screen.queryByText(/project name is selected automatically/i)).toBeNull();
    expect(screen.queryByLabelText('Pages project name')).toBeNull();
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
      <FileViewer
        projectId="project-1"
        file={file}
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

});
