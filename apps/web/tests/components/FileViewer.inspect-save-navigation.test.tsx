// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ProjectFile } from '../../src/types';

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>(),
  useWorkspaceContext: () => ({ context: null, loading: false }),
}));
import { FileViewer } from '../../src/components/FileViewer';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(['deck', 'nested HTML'] as const)('saves a root Inspect edit in %s with one document replacement', async (fixture) => {
  const isDeck = fixture === 'deck';
  const projectId = `inspect-save-navigation-${isDeck ? 'deck' : 'html'}`;
  const file: ProjectFile = {
    name: 'root.html', path: 'root.html', type: 'file', size: 256, mtime: 1,
    kind: 'html', mime: 'text/html',
    artifactManifest: isDeck ? { version: 1, kind: 'deck', title: 'Root', entry: 'root.html', renderer: 'deck-html', exports: ['html'] } : { version: 1, kind: 'html', title: 'Root', entry: 'root.html', renderer: 'html', exports: ['html'] },
  };
  let source = '<!doctype html><html><body><section class="slide"><h1 data-od-id="hero">Root title</h1></section></body></html>';
  if (!isDeck) source = '<!doctype html><html><body><h1 data-od-id="hero">Root title</h1><iframe title="child" src="child.html"></iframe></body></html>';
  let saved = false;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (url.startsWith(`/api/projects/${projectId}/raw/`)) return new Response(source);
    if (url === `/api/projects/${projectId}/files` && init?.method === 'POST') {
      source = JSON.parse(String(init.body)).content;
      saved = true;
      return Response.json({ file });
    }
    if (url.startsWith(`/api/projects/${projectId}/preview-url?`)) return Response.json({ url: `/api/projects/${projectId}/preview/scope-1/root.html`, expiresAt: Date.now() + 3_600_000 });
    if (url === `/api/projects/${projectId}/files`) return Response.json({ files: [file, { ...file, name: 'child.html', path: 'child.html' }] });
    return new Response('', { status: 404 });
  }));
  render(<FileViewer projectId={projectId} projectKind="prototype" file={file} isDeck={isDeck} />);
  fireEvent.click(await screen.findByTestId('inspect-mode-toggle'));
  const frame = await screen.findByTestId('artifact-preview-frame') as HTMLIFrameElement;
  await waitFor(() => expect(frame.getAttribute('srcdoc')).toContain('Root title'));
  fireEvent.load(frame);
  if (!isDeck) await waitFor(() => expect(frame.getAttribute('srcdoc')).toContain(`/api/projects/${projectId}/preview/scope-1/`));
  await act(async () => {
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { type: 'od:comment-target', elementId: 'hero', selector: '[data-od-id="hero"]', label: 'h1', text: 'Root title', style: {} },
    }));
  });
  fireEvent.change(await screen.findByTestId('inspect-font-size'), { target: { value: '36' } });
  const documents: string[] = [];
  const setAttribute = Element.prototype.setAttribute;
  vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function (this: Element, name: string, value: string) {
    if (this === frame && name.toLowerCase() === 'srcdoc') documents.push(String(value));
    return setAttribute.call(this, name, value);
  });
  await act(async () => { fireEvent.click(screen.getByTestId('inspect-save')); });
  await waitFor(() => expect(saved).toBe(true));
  await waitFor(() => expect(frame.getAttribute('srcdoc')).toContain('font-size: 36px'));
  // The first committed replacement must already contain the saved styles.
  // An old-source replacement here can abort nested iframe navigations just
  // before the effect catches up and commits the actual saved document.
  expect(documents).toHaveLength(1);
  expect(documents[0]).toContain('font-size: 36px');
  if (!isDeck) {
    const parsed = new DOMParser().parseFromString(documents[0]!, 'text/html');
    expect(parsed.querySelector('iframe[title="child"]')?.getAttribute('src')).toBe('child.html');
    expect(parsed.querySelector('base')?.getAttribute('href')).toContain(`/api/projects/${projectId}/preview/scope-1/`);
  }

  // Saving identical persisted overrides must not restart child documents.
  documents.length = 0;
  saved = false;
  await act(async () => { fireEvent.click(screen.getByTestId('inspect-save')); });
  await waitFor(() => {
    expect(saved).toBe(true);
    expect((screen.getByTestId('inspect-save') as HTMLButtonElement).disabled).toBe(false);
  });
  expect(documents).toHaveLength(0);
});
