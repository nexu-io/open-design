// @vitest-environment jsdom
// Red-spec for the shared-project "main canvas never refreshes" bug.
//
// Scenario (dogfood, workspace-team): a member has a team-shared DECK open
// read-only with Comment mode active (board mode — the read-only member's
// primary interaction). The owner publishes an update; the daemon auto-pull
// lands the new bytes and the files-changed signal bumps `file.mtime` /
// `filesRefreshKey`. Observed: the slide thumbnail rail (derived from the
// UNFROZEN `deckVisualSource`) repaints with the new content while the main
// canvas iframe keeps the OLD bytes forever, because the annotation freeze
// (`annotationFrozenSource`, FileViewer.tsx) is captured once at mode entry
// and never re-captured when a SETTLED on-disk version arrives.
//
// Contract these specs pin down:
//   1. A settled content-version change (raw lane, `liveHtml === undefined`)
//      that arrives while Comment mode is open must atomically replace the
//      frozen canvas bytes — old content stays until the new version has
//      fully arrived, then one clean swap (no blank/skeleton in between).
//   2. Streaming updates (`liveHtml` defined — an agent run repainting the
//      artifact chunk by chunk) stay frozen while Comment mode is open; the
//      freeze's original anti-thrash purpose is preserved.

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFile } from '../../src/types';

// Keep the authorization scope resolved from the first render so cache keys
// do not depend on the asynchronous workspace-context probe (same shape as
// FileViewer.srcdoc-reload-races.test.tsx).
vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>();
  return {
    ...actual,
    useWorkspaceContext: () => ({ context: null, loading: false }),
  };
});

import { FileViewer } from '../../src/components/FileViewer';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const RAW_URL_PREFIX = '/api/projects/project-1/raw/';

function deckFile(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    name: 'deck.html',
    path: 'deck.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
    artifactManifest: {
      version: 1,
      kind: 'deck',
      title: 'Deck',
      entry: 'deck.html',
      renderer: 'deck-html',
      exports: ['html'],
    },
    ...overrides,
  };
}

function deckHtml(label: string): string {
  return `<html><body><section class="slide"><h1>${label}</h1></section></body></html>`;
}

function srcDocFrame(): HTMLIFrameElement {
  return screen.getByTestId('artifact-preview-frame') as HTMLIFrameElement;
}

// Serve /raw/<file> from a mutable map so the test can flip the content the
// next background fetch will see, mimicking the daemon auto-pull landing a
// new published version on disk.
function fetchServing(bytes: { current: string }) {
  return vi.fn(async (input: string | URL | Request) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : String(input);
    if (url.startsWith(RAW_URL_PREFIX)) {
      return new Response(bytes.current, { status: 200 });
    }
    return new Response('', { status: 404 });
  });
}

async function enterCommentMode(): Promise<void> {
  const toggle = await screen.findByTestId('board-mode-toggle');
  await act(async () => {
    fireEvent.click(toggle);
  });
}

describe('FileViewer Comment-mode freeze vs settled content updates', () => {
  it('atomically swaps the frozen canvas to a settled on-disk update that lands while Comment mode is open', async () => {
    const bytes = { current: deckHtml('BOARD-FREEZE-V1') };
    vi.stubGlobal('fetch', fetchServing(bytes));

    const view = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={deckFile({ mtime: 1 })}
        isDeck
        filesRefreshKey={0}
      />,
    );
    await waitFor(() => {
      expect(srcDocFrame().getAttribute('srcDoc')).toContain('BOARD-FREEZE-V1');
    });

    await enterCommentMode();
    // Freeze captured; canvas still shows v1.
    expect(srcDocFrame().getAttribute('srcDoc')).toContain('BOARD-FREEZE-V1');

    // Owner update lands: new bytes on disk, files-changed bumps mtime +
    // filesRefreshKey (the same props ProjectView threads down on the SSE
    // signal).
    bytes.current = deckHtml('BOARD-FREEZE-V2');
    view.rerender(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={deckFile({ mtime: 2 })}
        isDeck
        filesRefreshKey={1}
      />,
    );

    // The main canvas must follow — one atomic replacement, still inside
    // Comment mode (no mode exit, no manual reload).
    await waitFor(() => {
      expect(srcDocFrame().getAttribute('srcDoc')).toContain('BOARD-FREEZE-V2');
    });
    expect(srcDocFrame().getAttribute('srcDoc')).not.toContain('BOARD-FREEZE-V1');
  });

  it('keeps streaming (liveHtml) updates frozen while Comment mode is open', async () => {
    const bytes = { current: deckHtml('STREAM-FREEZE-BASE') };
    vi.stubGlobal('fetch', fetchServing(bytes));

    const view = render(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={deckFile({ mtime: 1 })}
        isDeck
        filesRefreshKey={0}
        liveHtml={deckHtml('STREAM-FREEZE-T1')}
      />,
    );
    await waitFor(() => {
      expect(srcDocFrame().getAttribute('srcDoc')).toContain('STREAM-FREEZE-T1');
    });

    await enterCommentMode();
    expect(srcDocFrame().getAttribute('srcDoc')).toContain('STREAM-FREEZE-T1');

    // A later streaming chunk repaints the artifact. The freeze must hold —
    // this is the anti-thrash behavior the snapshot exists for.
    view.rerender(
      <FileViewer
        projectId="project-1"
        projectKind="prototype"
        file={deckFile({ mtime: 1 })}
        isDeck
        filesRefreshKey={0}
        liveHtml={deckHtml('STREAM-FREEZE-T2')}
      />,
    );

    // Give any (incorrect) swap a chance to happen, then assert it did not.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(srcDocFrame().getAttribute('srcDoc')).toContain('STREAM-FREEZE-T1');
    expect(srcDocFrame().getAttribute('srcDoc')).not.toContain('STREAM-FREEZE-T2');
  });
});
