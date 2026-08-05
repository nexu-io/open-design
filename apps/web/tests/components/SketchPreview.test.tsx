// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildWorkspacePermissions,
  buildWorkspaceSeatSummary,
  type WorkspaceCollabContext,
} from '@open-design/contracts';

import { SketchPreview } from '../../src/components/SketchPreview';
import { fetchProjectFileText } from '../../src/providers/registry';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchProjectFileText: vi.fn(),
  };
});

vi.mock('@excalidraw/excalidraw', () => ({
  restore: vi.fn((data: { elements?: unknown[]; appState?: unknown; files?: unknown }) => ({
    elements: data.elements ?? [],
    appState: data.appState ?? {},
    files: data.files ?? {},
  })),
  exportToSvg: vi.fn(async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('data-preview', 'excalidraw');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', '10');
    rect.setAttribute('height', '10');
    svg.appendChild(rect);
    return svg;
  }),
}));

const mockedFetchProjectFileText = vi.mocked(fetchProjectFileText);

function teamContext(
  workspaceId: string,
  workspaceMemberId: string,
): WorkspaceCollabContext {
  return {
    workspaceId,
    workspaceType: 'team',
    workspaceMemberId,
    role: 'member',
    memberStatus: 'active',
    lifecycleState: 'active',
    billingState: 'active',
    planId: 'team_plus',
    providerMode: 'platform_credits',
    teamId: `team-${workspaceId}`,
    seatSummary: buildWorkspaceSeatSummary({ seatLimit: 3, usedSeats: 2 }),
    permissions: buildWorkspacePermissions({ role: 'member', lifecycleState: 'active' }),
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SketchPreview', () => {
  it('renders Excalidraw sketch JSON through an exported SVG preview', async () => {
    mockedFetchProjectFileText.mockResolvedValue(JSON.stringify({
      type: 'excalidraw',
      version: 2,
      elements: [
        { id: 'box', type: 'rectangle', isDeleted: false, x: 0, y: 0, width: 10, height: 10 },
      ],
      appState: { viewBackgroundColor: '#ffffff' },
      files: {},
    }));

    const { container } = render(
      <SketchPreview
        projectId="project-1"
        file={{
          name: 'board.sketch.json',
          kind: 'sketch',
          mtime: 1700000000,
        }}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-preview="excalidraw"]')).toBeTruthy();
    });
    expect(fetchProjectFileText).toHaveBeenCalledWith('project-1', 'board.sketch.json', { cache: 'no-store' });
  });

  it('does not refetch when parent rerenders with the same sketch metadata', async () => {
    mockedFetchProjectFileText.mockResolvedValue(JSON.stringify({
      type: 'excalidraw',
      version: 2,
      elements: [
        { id: 'box', type: 'rectangle', isDeleted: false, x: 0, y: 0, width: 10, height: 10 },
      ],
      appState: { viewBackgroundColor: '#ffffff' },
      files: {},
    }));

    const { container, rerender } = render(
      <SketchPreview
        projectId="project-cache"
        file={{
          name: 'cached.sketch.json',
          kind: 'sketch',
          mtime: 1700000000,
        }}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-preview="excalidraw"]')).toBeTruthy();
    });

    rerender(
      <SketchPreview
        projectId="project-cache"
        file={{
          name: 'cached.sketch.json',
          kind: 'sketch',
          mtime: 1700000000,
        }}
      />,
    );

    expect(fetchProjectFileText).toHaveBeenCalledTimes(1);
  });

  it('partitions previews by the complete Workspace identity', async () => {
    const workspaceA = teamContext('workspace-a', 'member-a');
    const workspaceB = teamContext('workspace-b', 'member-b');
    mockedFetchProjectFileText.mockResolvedValue(JSON.stringify({
      type: 'excalidraw',
      version: 2,
      elements: [
        { id: 'box', type: 'rectangle', isDeleted: false, x: 0, y: 0, width: 10, height: 10 },
      ],
      appState: { viewBackgroundColor: '#ffffff' },
      files: {},
    }));

    const file = {
      name: 'identity.sketch.json',
      kind: 'sketch' as const,
      mtime: 1700000000,
    };
    const { container, rerender } = render(
      <SketchPreview projectId="same-project" file={file} workspaceContext={workspaceA} />,
    );
    await waitFor(() => {
      expect(container.querySelector('[data-preview="excalidraw"]')).toBeTruthy();
    });

    rerender(
      <SketchPreview projectId="same-project" file={file} workspaceContext={workspaceB} />,
    );
    await waitFor(() => expect(mockedFetchProjectFileText).toHaveBeenCalledTimes(2));

    expect(mockedFetchProjectFileText).toHaveBeenNthCalledWith(
      1,
      'same-project',
      file.name,
      { cache: 'no-store', workspaceContext: workspaceA },
    );
    expect(mockedFetchProjectFileText).toHaveBeenNthCalledWith(
      2,
      'same-project',
      file.name,
      { cache: 'no-store', workspaceContext: workspaceB },
    );
  });
});
