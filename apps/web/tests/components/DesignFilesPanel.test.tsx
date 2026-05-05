import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectFile } from '../../src/types';
import {
  buildFolderRows,
  DesignFilesPanel,
  getVisibleRowsForSection,
} from '../../src/components/DesignFilesPanel';

function file(name: string, kind: ProjectFile['kind'] = 'html', mtime = 1): ProjectFile {
  return {
    name,
    path: name,
    type: 'file',
    size: 100,
    mtime,
    kind,
    mime: 'text/html',
  };
}

describe('DesignFilesPanel folder rows', () => {
  const baseProps = {
    projectId: 'project-1',
    onRefreshFiles: vi.fn(),
    onOpenFile: vi.fn(),
    onOpenLiveArtifact: vi.fn(),
    onDeleteFile: vi.fn(),
    onUpload: vi.fn(),
    onUploadFiles: vi.fn(),
    onPaste: vi.fn(),
    onNewSketch: vi.fn(),
  };

  it('groups nested project paths under a single collapsed folder section', () => {
    const markup = renderToStaticMarkup(
      <DesignFilesPanel
        {...baseProps}
        files={[
          file('00-START-HERE.html', 'html', 4),
          file('created-by-codex/README.md', 'text', 3),
          file('created-by-codex/audit.html', 'html', 2),
        ]}
        liveArtifacts={[]}
      />,
    );

    expect(markup).toContain('Folders');
    expect(markup).toContain('data-testid="design-file-row-00-START-HERE.html"');
    expect(markup).toContain('data-testid="design-folder-row-created-by-codex"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('data-testid="design-file-row-created-by-codex/README.md"');
    expect(markup).not.toContain('data-testid="design-folder-row-pages:created-by-codex"');
  });

  it('keeps top-level folder pagination stable when expanded folders have many children', () => {
    const files: ProjectFile[] = [
      ...Array.from({ length: 40 }, (_, index) =>
        file(`folder-00/child-${String(index).padStart(2, '0')}.html`, 'html', 10_000 - index),
      ),
      ...Array.from({ length: 31 }, (_, index) =>
        file(
          `folder-${String(index + 1).padStart(2, '0')}/index.html`,
          'html',
          9_000 - index,
        ),
      ),
    ];

    const folderRows = buildFolderRows(files, new Set(['folder-00']), null);
    const visibleRows = getVisibleRowsForSection(folderRows, 30);
    const visibleFolders = visibleRows
      .filter((row) => row.type === 'folder')
      .map((row) => row.key);
    const visibleChildren = visibleRows.filter((row) => row.type === 'file');

    expect(visibleFolders).toContain('folder-00');
    expect(visibleFolders).toContain('folder-29');
    expect(visibleFolders).not.toContain('folder-30');
    expect(visibleChildren).toHaveLength(40);
    expect(visibleChildren[0]?.key).toBe('folder-00/folder-00/child-00.html');
  });
});
