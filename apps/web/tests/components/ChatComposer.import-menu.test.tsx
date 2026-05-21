// @vitest-environment jsdom

// Composer Tools -> Import menu — regression coverage.
//
// The "Link code folder" item is the only enabled action on this menu
// when a chat has no linked dirs yet. An unrelated refactor once
// dropped its wiring and left every import item disabled, so we lock
// the entry point down with a real click-through that calls the
// folder-open API and the project PATCH.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '../../src/components/ChatComposer';

const FOLDER_PATH = '/Users/dev/code/example';

function renderComposer(overrides: Partial<ComponentProps<typeof ChatComposer>> = {}) {
  return render(
    <ChatComposer
      projectId="project-1"
      projectFiles={[]}
      streaming={false}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      onOpenMcpSettings={vi.fn()}
      skills={[]}
      {...overrides}
    />,
  );
}

let fetchMock: ReturnType<typeof vi.fn>;
let patchedBodies: unknown[];

beforeEach(() => {
  patchedBodies = [];
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/mcp/servers') {
      return new Response(JSON.stringify({ servers: [], templates: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/plugins') {
      return new Response(JSON.stringify({ plugins: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/skills') {
      return new Response(JSON.stringify({ skills: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/dialog/open-folder' && init?.method === 'POST') {
      return new Response(JSON.stringify({ path: FOLDER_PATH }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/projects/project-1' && init?.method === 'PATCH') {
      patchedBodies.push(init.body ? JSON.parse(String(init.body)) : null);
      return new Response(
        JSON.stringify({
          project: {
            id: 'project-1',
            metadata: { kind: 'prototype', linkedDirs: [FOLDER_PATH] },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe('ChatComposer Tools -> Import menu', () => {
  it('exposes an enabled "Link code folder" item that opens the folder dialog and patches linkedDirs', async () => {
    const onProjectMetadataChange = vi.fn();
    renderComposer({ onProjectMetadataChange });

    fireEvent.click(screen.getByLabelText('Open CLI and model settings'));
    fireEvent.click(screen.getByRole('tab', { name: 'Import' }));

    const folderItem = await screen.findByRole('menuitem', { name: /Link code folder/i });
    expect(folderItem).toBeTruthy();
    expect((folderItem as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(folderItem);

    await waitFor(() => {
      expect(patchedBodies).toHaveLength(1);
    });
    expect(patchedBodies[0]).toEqual({
      metadata: { kind: 'prototype', linkedDirs: [FOLDER_PATH] },
    });
    await waitFor(() => {
      expect(onProjectMetadataChange).toHaveBeenCalledWith({
        kind: 'prototype',
        linkedDirs: [FOLDER_PATH],
      });
    });
  });
});
