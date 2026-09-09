// @vitest-environment jsdom
//
// Red spec: browsing a historical version renders it without its own assets.
//
// The version panel fetches the captured HTML as a JSON string and hands it to
// `buildSrcdoc`. A srcdoc document has no directory semantics, so every
// relative `./app.js`, stylesheet, image and font inside that old version
// resolves against nothing and never loads. The user comparing versions sees an
// old version that looks broken — missing styles, or blank — when it rendered
// correctly at the time it was captured. That is pain point 3 of the Dev Design
// on a surface the convergence had not covered.
//
// The daemon now serves a historical version as a real document, with the
// project-relative path kept last in the URL so the browser resolves siblings
// natively under the same `/version-preview/<versionId>/` prefix.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileViewer } from '../../src/components/FileViewer';
import type { ProjectFile } from '../../src/types';

function htmlFile(): ProjectFile {
  return {
    name: 'index.html',
    path: 'index.html',
    type: 'file',
    size: 42,
    mtime: 1_725_000_000_000,
    kind: 'html',
    mime: 'text/html',
  };
}

// The old version leans on a sibling stylesheet and script. Under srcdoc these
// resolve against nothing; on the real URL they resolve to
// /api/projects/project-1/version-preview/v1/<name>.
const PRIOR_CONTENT =
  '<html><head><link rel="stylesheet" href="./prior.css"></head>'
  + '<body><main>Prior version</main><script src="./prior.js"></script></body></html>';

function setupVersionFetch() {
  const file = htmlFile();
  const currentVersion = {
    id: 'v2',
    fileName: 'index.html',
    version: 2,
    label: 'Current checkpoint',
    createdAt: 1_725_000_000_000,
    source: 'manual',
    prompt: 'Current prompt',
    size: 42,
    mime: 'text/html',
    kind: 'html',
    current: true,
  };
  const priorVersion = {
    ...currentVersion,
    id: 'v1',
    version: 1,
    label: 'Prior checkpoint',
    prompt: 'Prior prompt',
    current: false,
  };
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/projects/project-1/files/index.html/versions' && method === 'GET') {
      return new Response(JSON.stringify({ file, versions: [currentVersion, priorVersion] }), { status: 200 });
    }
    if (url === '/api/projects/project-1/files/index.html/versions/v1' && method === 'GET') {
      return new Response(JSON.stringify({ version: priorVersion, content: PRIOR_CONTENT }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { file, fetchMock };
}

async function openPriorVersion(file: ProjectFile) {
  render(
    <FileViewer
      projectId="project-1"
      projectKind="prototype"
      file={file}
      liveHtml="<html><body><h1>Current</h1></body></html>"
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Versions' }));
  const dialog = await screen.findByRole('dialog', { name: 'Versions' });
  fireEvent.click(within(dialog).getByRole('option', { name: /Prior prompt/ }));
  await waitFor(() => {
    expect(within(dialog).getByRole('button', { name: 'Download Version 1' })).toBeTruthy();
  });
  return dialog;
}

function versionPreviewFrame(dialog: HTMLElement): HTMLIFrameElement | null {
  return dialog.querySelector('.artifact-version-panel__preview iframe');
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('historical version preview loads the version as a real document', () => {
  // Control. The assertions below say nothing useful if the preview frame never
  // rendered, so prove the selector resolves first.
  it('renders a preview frame for the selected version', async () => {
    const { file } = setupVersionFetch();
    const dialog = await openPriorVersion(file);
    await waitFor(() => expect(versionPreviewFrame(dialog)).not.toBeNull());
  });

  it('points that frame at the version document URL, not a rebuilt srcdoc', async () => {
    const { file } = setupVersionFetch();
    const dialog = await openPriorVersion(file);

    const frame = await waitFor(() => {
      const found = versionPreviewFrame(dialog);
      expect(found).not.toBeNull();
      return found as HTMLIFrameElement;
    });

    expect(frame.hasAttribute('srcdoc')).toBe(false);
    // The relative path stays last so `./prior.css` and `./prior.js` resolve as
    // siblings under the same version prefix.
    expect(frame.getAttribute('src')).toContain(
      '/api/projects/project-1/version-preview/v1/index.html',
    );
  });
});
