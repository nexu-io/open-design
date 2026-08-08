// @vitest-environment jsdom

// Acceptance regression: viewing a read-only artifact (e.g. a design-system
// `easings.json`) used to show a Save button that was hardcoded `disabled`.
// TextViewer owns no editable buffer, so that control could never become
// usable — it was a permanently dead affordance, not a transiently idle one.
// Viewers that DO own an editable buffer keep their save affordance; the
// markdown case below pins that half so this guard can't be "fixed" by
// stripping save everywhere.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileViewer } from '../../src/components/FileViewer';
import type { ProjectFile } from '../../src/types';
import { fetchProjectFileText } from '../../src/providers/registry';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchProjectFileText: vi.fn(),
    writeProjectTextFile: vi.fn(),
  };
});

const mockedFetchProjectFileText = vi.mocked(fetchProjectFileText);

function jsonTokenFile(): ProjectFile {
  return {
    name: 'easings.json',
    path: 'easings.json',
    type: 'file',
    size: 128,
    mtime: 1710000000,
    kind: 'text',
    mime: 'application/json',
  };
}

function markdownFile(): ProjectFile {
  return {
    name: 'notes.md',
    path: 'notes.md',
    type: 'file',
    size: 64,
    mtime: 1710000000,
    kind: 'text',
    mime: 'text/markdown',
    artifactManifest: {
      version: 1,
      kind: 'markdown-document',
      title: 'Notes',
      entry: 'notes.md',
      renderer: 'markdown',
      exports: ['md'],
    },
  };
}

describe('FileViewer read-only file toolbar', () => {
  beforeEach(() => {
    mockedFetchProjectFileText.mockResolvedValue('{\n  "easeOut": "cubic-bezier(0.23, 1, 0.32, 1)"\n}');
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders no Save control for a read-only JSON artifact', async () => {
    render(
      <FileViewer
        projectId="project-readonly"
        projectKind="prototype"
        file={jsonTokenFile()}
      />,
    );

    // Wait for the source to land so the toolbar is in its settled state.
    await waitFor(() => {
      expect(screen.queryByText('Loading…')).toBeNull();
    });

    // Not merely disabled — absent. A disabled Save here can never flip.
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
    // The actions that DO work are untouched.
    expect(screen.getByRole('button', { name: /reload/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /copy/i })).toBeTruthy();
  });

  it('keeps the save affordance for a viewer that owns an editable buffer', async () => {
    mockedFetchProjectFileText.mockResolvedValue('# Notes\n');
    const { container } = render(
      <FileViewer
        projectId="project-editable"
        projectKind="prototype"
        file={markdownFile()}
      />,
    );

    // MarkdownViewer autosaves: its save surface is a live status/retry control,
    // so removing "structurally unreachable" save must not have touched it.
    await waitFor(() => {
      expect(container.querySelector('.markdown-autosave')).toBeTruthy();
    });
  });
});
