// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../../src/i18n';
import { DocumentPreviewViewerView } from '../../../src/features/file-viewer/components/DocumentPreviewViewerView';
import type { ProjectFile } from '../../../src/types';
import type { DocumentPreview } from '../../../src/features/file-viewer/types';

afterEach(cleanup);

function file(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    name: 'report.pdf',
    path: 'report.pdf',
    type: 'file',
    size: 2048,
    mtime: 1710000000,
    kind: 'pdf',
    mime: 'application/pdf',
    ...overrides,
  };
}

function renderView(props: {
  loading: boolean;
  preview: DocumentPreview | null;
  file?: ProjectFile;
}) {
  render(
    <I18nProvider initial="en">
      <DocumentPreviewViewerView
        projectId="proj-1"
        file={props.file ?? file()}
        loading={props.loading}
        preview={props.preview}
      />
    </I18nProvider>,
  );
}

describe('DocumentPreviewViewerView', () => {
  it('shows the loading state', () => {
    renderView({ loading: true, preview: null });
    expect(screen.getByText('Loading…')).toBeTruthy();
  });

  it('shows the preview-unavailable state once loading finishes with no preview', () => {
    renderView({ loading: false, preview: null });
    expect(
      screen.getByText('Preview unavailable. Download or open the file to inspect.'),
    ).toBeTruthy();
  });

  it('renders the preview title and section lines', () => {
    renderView({
      loading: false,
      preview: {
        kind: 'pdf',
        title: 'Q3 Report',
        sections: [{ title: 'Summary', lines: ['Revenue up 10%'] }],
      },
    });
    expect(screen.getByText('Q3 Report')).toBeTruthy();
    expect(screen.getByText('Summary')).toBeTruthy();
    expect(screen.getByText('Revenue up 10%')).toBeTruthy();
  });

  it('renders download/open actions', () => {
    renderView({ loading: false, preview: null });
    expect(screen.getByText('Download')).toBeTruthy();
    expect(screen.getByText('Open')).toBeTruthy();
  });
});
