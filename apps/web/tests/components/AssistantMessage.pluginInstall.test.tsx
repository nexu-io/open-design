// @vitest-environment jsdom

/**
 * Issue #2876 coverage: when a generated plugin folder is offered as
 * "Add to My plugins" in the assistant message panel and the install
 * succeeds, the originating surface must leave behind a clear success
 * affordance. Two failure modes are covered:
 *
 *   1. The panel's internal notice state is lost across an unmount/remount
 *      cycle (ProjectView toggles `hiddenPluginActionPaths` during the
 *      action). The notice has to live above the panel so it survives.
 *   2. The install endpoint may legitimately resolve without a `message`
 *      string; the UI still has to confirm success instead of silently
 *      reverting the button.
 */

import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

/**
 * Wrapper that mimics ProjectView's hide-during-install toggle: when the
 * `install` action fires, the parent adds the folder to
 * `hiddenPluginActionPaths`, which unmounts the panel for that folder
 * during the await. The wrapper deletes the entry from the hidden set
 * after the action resolves, so the panel remounts. This is the exact
 * shape of the production code path the bug lives on.
 */
function ToggleHostWrapper({
  folderPath,
  outcome,
  resolveSignal,
}: {
  folderPath: string;
  outcome: { message?: string; url?: string } | void;
  resolveSignal: { resolve: () => void; promise: Promise<void> };
}) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  return (
    <AssistantMessage
      message={pluginMessage(folderPath)}
      streaming={false}
      isLast
      projectId="proj-1"
      projectFiles={pluginFolderFiles(folderPath)}
      hiddenPluginActionPaths={hidden}
      onRequestPluginFolderAgentAction={async (path, action) => {
        if (action !== 'install') return outcome;
        setHidden((prev) => new Set(prev).add(path));
        await resolveSignal.promise;
        setHidden((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
        return outcome;
      }}
    />
  );
}

describe('AssistantMessage plugin install success feedback (#2876)', () => {
  it('leaves a visible success affordance after install resolves, even though the panel unmounts mid-install', async () => {
    const folderPath = 'my-skill';
    let resolveAction!: () => void;
    const signal = {
      promise: new Promise<void>((res) => {
        resolveAction = res;
      }),
      resolve: () => resolveAction(),
    };

    render(
      <ToggleHostWrapper
        folderPath={folderPath}
        outcome={{ message: 'Installed My Skill.' }}
        resolveSignal={signal}
      />,
    );

    const addButton = screen.getByTestId(`assistant-plugin-install-${folderPath}`);
    fireEvent.click(addButton);

    await act(async () => {
      signal.resolve();
      await signal.promise;
    });

    // The success message must persist even though the panel unmounted and
    // remounted while the install was in flight. The notice has to outlive
    // the panel's internal state for the user to see confirmation.
    await waitFor(() => {
      expect(screen.getByText('Installed My Skill.')).toBeTruthy();
    });
  });

  it('shows a default success affordance when the install resolves without a message', async () => {
    const folderPath = 'sparse-skill';
    let resolveAction!: () => void;
    const signal = {
      promise: new Promise<void>((res) => {
        resolveAction = res;
      }),
      resolve: () => resolveAction(),
    };

    render(
      <ToggleHostWrapper
        folderPath={folderPath}
        outcome={undefined}
        resolveSignal={signal}
      />,
    );

    fireEvent.click(screen.getByTestId(`assistant-plugin-install-${folderPath}`));

    await act(async () => {
      signal.resolve();
      await signal.promise;
    });

    // The contract for the install outcome leaves `message` optional. When
    // it is absent, the UI still needs to affirm success — the bug report
    // explicitly describes this case ("the plugin was in fact added
    // successfully, but the original screen did not communicate that
    // outcome"). A default success label fills that gap.
    await waitFor(() => {
      expect(screen.getByText(/added to my plugins/i)).toBeTruthy();
    });
  });
});
