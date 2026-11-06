// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage, ProjectFile } from '../../src/types';

const PROJECT_ID = 'project-1';
const ARTIFACT = 'proposal.html';
const FIRST_REVISION = 1700000001000;
const NEXT_REVISION = FIRST_REVISION + 1000;
const COVER_URL = `/api/projects/${PROJECT_ID}/chat-artifact-snapshots/snap-1/thumbnail`;

function projectFile(mtime: number): ProjectFile {
  return {
    name: ARTIFACT,
    path: ARTIFACT,
    size: 100,
    mtime,
    kind: 'html',
    mime: 'text/html',
  };
}

function completedMessage(): ChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: 'Done.',
    runStatus: 'succeeded',
    startedAt: FIRST_REVISION - 1000,
    endedAt: FIRST_REVISION,
    events: [{ kind: 'artifact_focus', show: [ARTIFACT] }],
    producedFiles: [projectFile(FIRST_REVISION)],
  };
}

beforeEach(() => {
  // Let the real cover component pass its HEAD probe and mount the iframe.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 200 })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Cover only the live fallback's refresh contract. A ready snapshot is frozen
 * to its turn; a workspace overwrite must not make that historical cover drift.
 * Keep the message and file-name Set identities stable so the revision must
 * pass through AssistantMessage's memo boundary via projectFiles.
 */
describe('OPEND-2769 artifact card cache identity', () => {
  it('updates a mounted live HTML preview when the same file is overwritten', async () => {
    const message = completedMessage();
    const projectFileNames = new Set([ARTIFACT]);
    const view = (mtime: number) => (
      <AssistantMessage
        message={message}
        streaming={false}
        projectId={PROJECT_ID}
        projectFiles={[projectFile(mtime)]}
        projectFileNames={projectFileNames}
      />
    );
    const { rerender } = render(view(FIRST_REVISION));
    const card = screen.getByTestId(`artifact-card-${ARTIFACT}`);
    const firstUrl = await waitFor(() => {
      const src = card.querySelector('iframe')?.getAttribute('src');
      expect(src).toContain(`/api/projects/${PROJECT_ID}/raw/${ARTIFACT}`);
      return src;
    });

    rerender(view(NEXT_REVISION));

    await waitFor(() => {
      const src = card.querySelector('iframe')?.getAttribute('src');
      expect(src).toContain(`/api/projects/${PROJECT_ID}/raw/${ARTIFACT}`);
      expect(src).not.toBe(firstUrl);
    });
  });

  it('keeps a ready turn snapshot when the workspace file is overwritten', () => {
    const message = completedMessage();
    message.artifactRefs = [{
      id: 'ref-1',
      label: ARTIFACT,
      kind: 'html',
      displayPolicy: 'latest_with_static_preview',
      snapshotId: 'snap-1',
      thumbnailUrl: COVER_URL,
      snapshotState: 'ready',
    }];
    const projectFileNames = new Set([ARTIFACT]);
    const view = (mtime: number) => (
      <AssistantMessage
        message={message}
        streaming={false}
        projectId={PROJECT_ID}
        projectFiles={[projectFile(mtime)]}
        projectFileNames={projectFileNames}
      />
    );
    const { rerender } = render(view(FIRST_REVISION));
    const card = screen.getByTestId(`artifact-card-${ARTIFACT}`);
    expect(card.querySelector('img')?.getAttribute('src')).toBe(COVER_URL);

    rerender(view(NEXT_REVISION));

    expect(card.querySelector('img')?.getAttribute('src')).toBe(COVER_URL);
    expect(card.querySelector('iframe')).toBeNull();
  });
});
