// @vitest-environment jsdom

/**
 * The entry file as a project attribute, on the files panel: the recorded
 * entry is marked, any other html file offers "Set as entry" in its row menu,
 * and a round that wrote files without an entry shows the notice whose
 * button asks the agent for one. The daemon owns the record; this panel only
 * draws the two ways of changing it.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DesignFilesPanel } from '../../src/components/DesignFilesPanel';
import type { ProjectFile } from '../../src/types';

const lsStore = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => lsStore.get(key) ?? null,
  setItem: (key: string, value: string) => { lsStore.set(key, value); },
  removeItem: (key: string) => { lsStore.delete(key); },
  clear: () => { lsStore.clear(); },
});

beforeEach(() => {
  lsStore.clear();
});

afterEach(() => {
  cleanup();
});

function html(name: string): ProjectFile {
  return {
    name,
    path: name,
    type: 'file',
    size: 512,
    mtime: Date.now(),
    kind: 'html',
    mime: 'text/html',
  };
}

function renderPanel(
  files: ProjectFile[],
  overrides: Partial<ComponentProps<typeof DesignFilesPanel>> = {},
) {
  const onSetEntryFile = vi.fn();
  const onRequestEntry = vi.fn();
  const onDismissEntryMissingNotice = vi.fn();
  render(
    <DesignFilesPanel
      projectId="test-project"
      projectKind="prototype"
      files={files}
      liveArtifacts={[]}
      onRefreshFiles={vi.fn()}
      onOpenFile={vi.fn()}
      onOpenLiveArtifact={vi.fn()}
      onRenameFile={vi.fn()}
      onDeleteFile={vi.fn()}
      onDeleteFiles={vi.fn()}
      onUpload={vi.fn()}
      onUploadFiles={vi.fn()}
      onPaste={vi.fn()}
      onNewSketch={vi.fn()}
      onSetEntryFile={onSetEntryFile}
      onRequestEntry={onRequestEntry}
      onDismissEntryMissingNotice={onDismissEntryMissingNotice}
      {...overrides}
    />,
  );
  return { onSetEntryFile, onRequestEntry, onDismissEntryMissingNotice };
}

describe('DesignFilesPanel entry file', () => {
  it('marks the recorded entry and offers "Set as entry" only on the other html files', () => {
    const { onSetEntryFile } = renderPanel(
      [html('index.html'), html('about.html')],
      { entryFile: 'index.html' },
    );
    expect(screen.getByTestId('design-file-entry-index.html')).toHaveTextContent('Entry');
    expect(screen.queryByTestId('design-file-entry-about.html')).toBeNull();

    fireEvent.click(screen.getByTestId('design-file-menu-index.html'));
    expect(screen.queryByTestId('design-file-set-entry-index.html')).toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });

    fireEvent.click(screen.getByTestId('design-file-menu-about.html'));
    fireEvent.click(screen.getByTestId('design-file-set-entry-about.html'));
    expect(onSetEntryFile).toHaveBeenCalledWith('about.html');
  });

  it('shows the missing-entry notice with the written files and sends the request from its button', () => {
    const { onRequestEntry, onDismissEntryMissingNotice } = renderPanel(
      [html('screens/home.html')],
      { entryMissingNotice: { files: ['screens/home.html', 'screens/about.html'] } },
    );
    const notice = screen.getByTestId('design-files-entry-missing');
    expect(notice).toHaveTextContent('No entry to preview.');
    expect(notice).toHaveTextContent('screens/home.html, screens/about.html');

    fireEvent.click(screen.getByTestId('design-files-entry-request'));
    expect(onRequestEntry).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismissEntryMissingNotice).toHaveBeenCalledTimes(1);
  });

  it('keeps the request button disabled while a run is in flight and hides the notice for viewers', () => {
    renderPanel([html('screens/home.html')], {
      entryMissingNotice: { files: ['screens/home.html'] },
      running: true,
      runStartedAt: Date.now() - 1_000,
    });
    expect(screen.getByTestId('design-files-entry-request')).toBeDisabled();
    cleanup();

    renderPanel([html('screens/home.html')], {
      entryMissingNotice: { files: ['screens/home.html'] },
      viewerOnly: true,
    });
    expect(screen.queryByTestId('design-files-entry-missing')).toBeNull();
  });
});
