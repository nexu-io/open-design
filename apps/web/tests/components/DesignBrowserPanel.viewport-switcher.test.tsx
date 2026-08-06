// @vitest-environment jsdom

// Acceptance regression: the in-app browser's chrome carried a
// desktop/tablet/mobile viewport dropdown. Resizing the frame is a
// responsiveness check for OUR generated artifact, not for someone else's live
// website, so the control was removed from the browser only. The artifact
// preview keeps its own switcher (`PreviewViewportControls` in FileViewer) —
// the second case pins that so this guard cannot be satisfied by deleting both.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMockOpenDesignHost } from '@open-design/host/testing';

import { DesignBrowserPanel } from '../../src/components/DesignBrowserPanel';
import { FileViewer } from '../../src/components/FileViewer';
import type { ProjectFile } from '../../src/types';
import { writeProjectTextFile } from '../../src/providers/registry';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    openExternalUrl: vi.fn(async () => true),
    fetchProjectFileText: vi.fn(async () => '<html><body>artifact</body></html>'),
    writeProjectTextFile: vi.fn(async () => null),
    writeProjectBase64File: vi.fn(async () => null),
  };
});

let restoreHost: (() => void) | null = null;

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(writeProjectTextFile).mockResolvedValue(null);
  restoreHost = installMockOpenDesignHost();
});

afterEach(() => {
  cleanup();
  restoreHost?.();
  restoreHost = null;
  window.localStorage.clear();
});

function htmlArtifact(): ProjectFile {
  return {
    name: 'workspace.html',
    path: 'workspace.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'Workspace',
      entry: 'workspace.html',
      renderer: 'html',
      exports: ['html'],
    },
  };
}

describe('in-app browser viewport switcher', () => {
  it('renders no viewport switcher in the browser toolbar', () => {
    const { container } = render(
      <DesignBrowserPanel
        projectId="proj-viewport-switcher"
        initialTitle="Dribbble"
        initialUrl="https://dribbble.com"
        onOpenFile={() => {}}
        onRefreshFiles={() => {}}
      />,
    );

    expect(container.querySelector('.db-viewport-switcher')).toBeNull();
    expect(container.querySelector('.db-viewport-menu')).toBeNull();
    expect(screen.queryByRole('listbox', { name: 'Browser viewport' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Desktop/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Tablet/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Mobile/i })).toBeNull();

    // The navigation controls that share the chrome row are untouched.
    expect(screen.getByRole('button', { name: 'Go Back' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go Forward' })).toBeTruthy();
    // The frame itself still renders — only the sizing control went away.
    expect(container.querySelector('.db-viewport-frame')).toBeTruthy();
  });

  it('keeps the viewport switcher on the artifact preview', async () => {
    const { container } = render(
      <FileViewer
        projectId="proj-artifact-viewport"
        projectKind="prototype"
        file={htmlArtifact()}
        liveHtml="<html><body>artifact</body></html>"
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('.viewer-viewport-switcher')).toBeTruthy();
    });
  });
});
