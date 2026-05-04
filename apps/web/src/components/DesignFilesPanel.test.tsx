import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectFile } from '../types';
import { DesignFilesPanel } from './DesignFilesPanel';

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
      />,
    );

    expect(markup).toContain('Folders');
    expect(markup).toContain('data-testid="design-file-row-00-START-HERE.html"');
    expect(markup).toContain('data-testid="design-folder-row-created-by-codex"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('data-testid="design-file-row-created-by-codex/README.md"');
    expect(markup).not.toContain('data-testid="design-folder-row-pages:created-by-codex"');
  });
});
