import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { FileWorkspace } from '../../src/components/FileWorkspace';

describe('FileWorkspace upload input', () => {
  it('keeps the Design Files picker aligned with drag-and-drop file support', () => {
    const markup = renderToStaticMarkup(
      <FileWorkspace
        projectId="project-1"
        files={[]}
        onRefreshFiles={vi.fn()}
        isDeck={false}
        tabsState={{ tabs: [], active: null }}
        onTabsStateChange={vi.fn()}
      />,
    );

    expect(markup).toContain('data-testid="design-files-upload-input"');
    expect(markup).not.toContain('accept=');
  });
});
