// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { FileOpsSummary } from '../../src/components/FileOpsSummary';
import { FileViewer } from '../../src/components/FileViewer';
import { REMIX_ICON_PATHS } from '../../src/components/remix-icon-paths';
import type { ProjectFile } from '../../src/types';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('uses the Owner share-forward glyph at both HTML Share entry points (OPEND-3535)', () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
  const file: ProjectFile = {
    name: 'index.html', path: 'index.html', type: 'file', size: 100,
    mtime: 1710000000, kind: 'html', mime: 'text/html',
    artifactManifest: {
      version: 1, kind: 'html', title: 'Page', entry: 'index.html',
      renderer: 'html', exports: ['html'],
    },
  };
  render(
    <FileOpsSummary projectId="project-1" onPublish={vi.fn()} entries={[{
      path: 'index.html', fullPath: '/repo/index.html', ops: ['write'],
      opCounts: { read: 0, write: 1, edit: 0, delete: 0 }, total: 1, status: 'done',
    }]} />
  );
  const viewer = render(<FileViewer projectId="project-1" projectKind="prototype" file={file}
    liveHtml="<html><body>Hello</body></html>" />);
  const toolbarIcon = within(viewer.container)
    .getByRole('button', { name: /^Share$/ }).querySelector('svg');
  const cardIcon = screen.getByTestId('artifact-card-publish-index.html').querySelector('svg');
  // Compare the actual rendered geometry, not a mock's component name.
  for (const icon of [toolbarIcon, cardIcon]) {
    expect(icon?.querySelector('path')).toHaveAttribute('d', REMIX_ICON_PATHS['share-forward-line']);
    expect(icon).toHaveAttribute('fill', 'currentColor');
    expect(icon).toHaveAttribute('viewBox', '0 0 24 24');
  }
  // Each surface keeps its existing icon-box scale.
  expect(toolbarIcon).toHaveAttribute('width', '15');
  expect(cardIcon).toHaveAttribute('width', '12');
});
