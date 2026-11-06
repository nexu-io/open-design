// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { FigmaImportModal } from '../../src/components/FigmaImportModal';
import { importProjectFigma } from '../../src/providers/registry';
import { workspaceContextFixture } from '../helpers/workspace-context';

vi.mock('../../src/providers/registry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/providers/registry')>()),
  importProjectFigma: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('imports into the project with its exact persisted Workspace context', async () => {
  const contextA = workspaceContextFixture({
    workspaceId: 'workspace-a',
    workspaceMemberId: 'member-a',
  });
  const result = {
    snapshotDir: 'figma',
    files: ['figma/DESIGN-context.md'],
    inventory: {
      decoded: true,
      source: 'fig-file' as const,
      nodeCount: 3,
      pageCount: 1,
      frameCount: 1,
      componentCount: 0,
      colors: [],
      fonts: [],
      assetCount: 0,
      hasThumbnail: false,
      warnings: [],
    },
    contextPath: 'figma/DESIGN-context.md',
    suggestedPrompt: 'Build it.',
    label: 'product.fig',
  };
  vi.mocked(importProjectFigma).mockResolvedValue({ ok: true, result });

  render(
    <FigmaImportModal
      onClose={vi.fn()}
      resolveProjectId={async () => 'project-a'}
      workspaceContext={contextA}
      onImported={vi.fn()}
    />,
  );

  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('expected .fig input');
  const file = new File(['fig'], 'product.fig', { type: 'application/octet-stream' });
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Import & build' }));

  await waitFor(() => {
    expect(importProjectFigma).toHaveBeenCalledWith(
      'project-a',
      file,
      undefined,
      contextA,
    );
  });
});
