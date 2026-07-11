// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../src/i18n';
import { SvgViewerView } from '../../../src/features/file-viewer/components/SvgViewerView';
import type { ProjectFile } from '../../../src/types';

afterEach(cleanup);

function file(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    name: 'icon.svg',
    path: 'icon.svg',
    type: 'file',
    size: 100,
    mtime: 1710000000,
    kind: 'text',
    mime: 'image/svg+xml',
    ...overrides,
  };
}

describe('SvgViewerView', () => {
  it('shows the <img> preview in preview mode', () => {
    const { container } = render(
      <I18nProvider initial="en">
        <SvgViewerView
          projectId="proj-1"
          file={file()}
          mode="preview"
          setMode={() => {}}
          source={null}
          loadingSource={false}
          sourceError={false}
          reloadKey={0}
          onReload={() => {}}
        />
      </I18nProvider>,
    );
    expect(container.querySelector('img')).toBeTruthy();
  });

  it('shows a loading state in source mode while loading', () => {
    render(
      <I18nProvider initial="en">
        <SvgViewerView
          projectId="proj-1"
          file={file()}
          mode="source"
          setMode={() => {}}
          source={null}
          loadingSource
          sourceError={false}
          reloadKey={0}
          onReload={() => {}}
        />
      </I18nProvider>,
    );
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('shows the source text once loaded', () => {
    const { container } = render(
      <I18nProvider initial="en">
        <SvgViewerView
          projectId="proj-1"
          file={file()}
          mode="source"
          setMode={() => {}}
          source={'<svg>hi</svg>'}
          loadingSource={false}
          sourceError={false}
          reloadKey={0}
          onReload={() => {}}
        />
      </I18nProvider>,
    );
    expect(container.querySelector('pre.viewer-source')?.textContent).toBe('<svg>hi</svg>');
  });

  it('calls setMode when a tab is clicked', () => {
    const setMode = vi.fn();
    render(
      <I18nProvider initial="en">
        <SvgViewerView
          projectId="proj-1"
          file={file()}
          mode="preview"
          setMode={setMode}
          source={null}
          loadingSource={false}
          sourceError={false}
          reloadKey={0}
          onReload={() => {}}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByText('Code'));
    expect(setMode).toHaveBeenCalledWith('source');
  });

  it('calls onReload when the reload button is clicked', () => {
    const onReload = vi.fn();
    render(
      <I18nProvider initial="en">
        <SvgViewerView
          projectId="proj-1"
          file={file()}
          mode="preview"
          setMode={() => {}}
          source={null}
          loadingSource={false}
          sourceError={false}
          reloadKey={0}
          onReload={onReload}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByTitle('Reload from disk'));
    expect(onReload).toHaveBeenCalled();
  });
});
