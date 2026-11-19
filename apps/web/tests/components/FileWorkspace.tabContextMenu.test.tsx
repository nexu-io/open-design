// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FileWorkspace } from '../../src/components/FileWorkspace';
import { writeProjectTextFile } from '../../src/providers/registry';
import { killTerminal } from '../../src/state/projects';
import type { OpenTabsState, ProjectFile } from '../../src/types';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchProjectFileText: vi.fn().mockResolvedValue(''),
    uploadProjectFiles: vi.fn(),
    writeProjectBase64File: vi.fn(),
    writeProjectTextFile: vi.fn(),
    fetchProjectFolders: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('../../src/state/projects', async () => {
  const actual = await vi.importActual<typeof import('../../src/state/projects')>(
    '../../src/state/projects',
  );
  return { ...actual, killTerminal: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('../../src/components/workspace/TerminalViewer', () => ({
  TerminalViewer: () => <div data-testid="terminal-viewer" />,
}));

function imageFile(name: string): ProjectFile {
  return { name, path: name, type: 'file', size: 1, mtime: 1, kind: 'image', mime: 'image/png' } as ProjectFile;
}

const FILES = ['a.png', 'b.png', 'c.png'].map(imageFile);

function renderWorkspace(tabsState: OpenTabsState, files = FILES) {
  const onTabsStateChange = vi.fn();
  render(
    <FileWorkspace
      projectId="project-1"
      projectKind="prototype"
      files={files}
      liveArtifacts={[]}
      onRefreshFiles={vi.fn()}
      isDeck={false}
      tabsState={tabsState}
      onTabsStateChange={onTabsStateChange}
    />,
  );
  return onTabsStateChange;
}

function openMenu(tabName: RegExp) {
  fireEvent.contextMenu(screen.getByRole('tab', { name: tabName }));
  return screen.getByRole('menu');
}

function item(name: string) {
  return screen.getByRole('menuitem', { name }) as HTMLButtonElement;
}

describe('FileWorkspace tab context menu (#9567)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('closes the tabs to the right and focuses the clicked tab when the active one closes', () => {
    const onTabsStateChange = renderWorkspace({ tabs: ['a.png', 'b.png', 'c.png'], active: 'c.png' });
    openMenu(/b\.png/);
    fireEvent.click(item('Close tabs to the right'));
    expect(onTabsStateChange).toHaveBeenLastCalledWith({ tabs: ['a.png', 'b.png'], active: 'b.png' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /b\.png/ }));
  });

  it('closes the tabs to the left and keeps the active tab when it survives', () => {
    const onTabsStateChange = renderWorkspace({ tabs: ['a.png', 'b.png', 'c.png'], active: 'c.png' });
    openMenu(/b\.png/);
    fireEvent.click(item('Close tabs to the left'));
    expect(onTabsStateChange).toHaveBeenLastCalledWith({ tabs: ['b.png', 'c.png'], active: 'c.png' });
  });

  it('closes other tabs and all tabs, never the pinned Design Files tab', () => {
    const onTabsStateChange = renderWorkspace({ tabs: ['a.png', 'b.png', 'c.png'], active: 'a.png' });
    openMenu(/b\.png/);
    fireEvent.click(item('Close other tabs'));
    expect(onTabsStateChange).toHaveBeenLastCalledWith({ tabs: ['b.png'], active: 'b.png' });

    openMenu(/b\.png/);
    fireEvent.click(item('Close all tabs'));
    expect(onTabsStateChange).toHaveBeenLastCalledWith({ tabs: [], active: '__design_files__' });

    fireEvent.contextMenu(screen.getByTestId('design-files-tab'));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('disables actions that would close nothing', () => {
    renderWorkspace({ tabs: ['a.png'], active: 'a.png' });
    openMenu(/a\.png/);
    expect(item('Close tab').disabled).toBe(false);
    expect(item('Close other tabs').disabled).toBe(true);
    expect(item('Close tabs to the left').disabled).toBe(true);
    expect(item('Close tabs to the right').disabled).toBe(true);
    expect(item('Close all tabs').disabled).toBe(false);
  });

  it('kills every closed terminal and the browser tab in one commit', () => {
    const onTabsStateChange = renderWorkspace({
      tabs: ['terminal:t1', 'terminal:t2'],
      active: 'terminal:t1',
      browserTabs: [{ id: '__browser__:1', insertAfter: 'terminal:t2', label: 'Browser' }],
    }, []);
    openMenu(/Browser/);
    fireEvent.click(item('Close all tabs'));
    expect(vi.mocked(killTerminal).mock.calls.map((call) => call[1])).toEqual(['t1', 't2']);
    expect(onTabsStateChange).toHaveBeenCalledTimes(1);
    expect(onTabsStateChange).toHaveBeenLastCalledWith({ tabs: [], active: '__design_files__' });
  });

  it('asks once for unsaved sketches and closes nothing on cancel', () => {
    // A sketch whose autosave never lands stays unpersisted (unsaved).
    vi.mocked(writeProjectTextFile).mockReturnValue(new Promise(() => {}));
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    const onTabsStateChange = renderWorkspace({ tabs: ['terminal:t1'], active: null }, []);
    fireEvent.click(screen.getByTestId('design-files-empty-new-sketch'));
    onTabsStateChange.mockClear();

    openMenu(/sketch/);
    fireEvent.click(item('Close all tabs'));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(killTerminal).not.toHaveBeenCalled();
    expect(onTabsStateChange).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: /sketch/ })).toBeTruthy();
  });

  it('closes on Escape and returns focus to the tab', () => {
    renderWorkspace({ tabs: ['a.png', 'b.png'], active: 'a.png' });
    const menu = openMenu(/b\.png/);
    expect(document.activeElement).toBe(item('Close tab'));
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(item('Close other tabs'));
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /b\.png/ }));
  });
});
