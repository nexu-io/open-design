// @vitest-environment jsdom

// The in-chat plugin action panel was retired by explicit product decision.
// Generated plugin files remain accessible while host install state changes;
// installation itself continues through the existing non-chat surfaces.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { AgentEvent, ChatMessage, ProjectFile } from '../../src/types';

beforeAll(() => {
  if (window.localStorage) return;
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
});

afterEach(() => {
  cleanup();
});

function pluginFolderFiles(folderPath: string): ProjectFile[] {
  return [
    {
      name: `${folderPath}/open-design.json`,
      path: `${folderPath}/open-design.json`,
      size: 100,
      mtime: 1700000005,
      kind: 'code',
      mime: 'application/json',
    } as ProjectFile,
    {
      name: `${folderPath}/SKILL.md`,
      path: `${folderPath}/SKILL.md`,
      size: 100,
      mtime: 1700000005,
      kind: 'text',
      mime: 'text/markdown',
    } as ProjectFile,
  ];
}

function pluginMessage(folderPath: string): ChatMessage {
  return {
    id: 'msg-plugin-1',
    role: 'assistant',
    content: 'Plugin is ready to add to My plugins.',
    runStatus: 'succeeded',
    startedAt: 1700000000,
    endedAt: 1700000005,
    events: [{ kind: 'text', text: 'Plugin is ready to add to My plugins.' } as AgentEvent],
    producedFiles: pluginFolderFiles(folderPath),
  } as ChatMessage;
}

describe('AssistantMessage generated plugin files without in-chat install controls', () => {
  it.each([false, true])('preserves files with a host active-install state of %s and never presents retired actions', (active) => {
    const folderPath = 'my-skill';
    const onAction = vi.fn();
    const onOpen = vi.fn();
    const props = {
      message: pluginMessage(folderPath), streaming: false, isLast: true,
      projectId: 'proj-1', projectFiles: pluginFolderFiles(folderPath),
      onRequestOpenFile: onOpen, onRequestPluginFolderAgentAction: onAction,
    };
    const { rerender } = render(<AssistantMessage {...props}
      hiddenPluginActionPaths={active ? new Set([folderPath]) : new Set()}
      activePluginActionPaths={active ? new Set([folderPath]) : new Set()}
    />);
    for (const file of pluginFolderFiles(folderPath)) {
      expect(screen.getByTestId(`artifact-card-${file.name}`)).toBeTruthy();
    }
    expect(screen.queryByTestId(`assistant-plugin-install-${folderPath}`)).toBeNull();
    expect(screen.queryByTestId(`plugin-folder-notice-${folderPath}`)).toBeNull();
    expect(onAction).not.toHaveBeenCalled();

    // Changing the host's install bookkeeping cannot recreate the retired UI.
    rerender(<AssistantMessage {...props} hiddenPluginActionPaths={new Set()} activePluginActionPaths={new Set()} />);
    expect(screen.queryByTestId(`assistant-plugin-actions-${folderPath}`)).toBeNull();
    fireEvent.click(screen.getByTestId(`artifact-card-open-${folderPath}/open-design.json`));
    expect(onOpen).toHaveBeenCalledWith(`${folderPath}/open-design.json`);
    expect(onAction).not.toHaveBeenCalled();
  });
});
