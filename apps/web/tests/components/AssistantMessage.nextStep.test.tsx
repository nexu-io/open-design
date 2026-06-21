// @vitest-environment jsdom

/**
 * Gate coverage for the "next step" affordance under the last assistant
 * message. The card anchors on a deliverable: it appears only once the turn
 * (or the project) has a previewable HTML artifact to take a next step on. A
 * pure clarifying-questions / summary turn that produced no HTML must not
 * surface the card.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import { en } from '../../src/i18n/locales/en';
import type { ChatMessage, ProjectFile } from '../../src/types';

beforeAll(() => {
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
  window.localStorage.clear();
});

function baseMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: 'Done.',
    runStatus: 'succeeded',
    startedAt: 1700000000,
    endedAt: 1700000005,
    events: [{ kind: 'text', text: 'Done.' } as NonNullable<ChatMessage['events']>[number]],
    producedFiles: [],
    ...overrides,
  } as ChatMessage;
}

function producedFile(name: string, kind: ProjectFile['kind'] = 'html'): ProjectFile {
  return {
    name,
    path: name,
    size: 100,
    mtime: 1700000005,
    kind,
    mime: kind === 'html' ? 'text/html' : 'application/octet-stream',
  } as ProjectFile;
}

const handlers = () => ({
  onArtifactShare: vi.fn(),
  onToolboxAction: vi.fn(),
});

const AUTO_MATCH_TITLE = en['chat.designToolbox.action.auto-match.title'];

describe('AssistantMessage next-step affordance', () => {
  it('routes Share through the More → Share cascade with the file name', () => {
    const h = handlers();
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('landing.html')] })}
        streaming={false}
        projectId="proj-1"
        isLast
        {...h}
      />,
    );
    expect(screen.getByTestId('next-step-actions')).toBeTruthy();
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-share'));
    fireEvent.click(screen.getByTestId('next-step-share-share'));
    expect(h.onArtifactShare).toHaveBeenCalledWith('landing.html');
  });

  it('does not render when the message is not the last assistant message', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('landing.html')] })}
        streaming={false}
        projectId="proj-1"
        isLast={false}
        {...handlers()}
      />,
    );
    expect(screen.queryByTestId('next-step-actions')).toBeNull();
  });

  it('reaches Contribute (share to Open Design) through the More → Share cascade', () => {
    const onShareToOpenDesign = vi.fn();
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('landing.html')] })}
        streaming={false}
        projectId="proj-1"
        isLast
        onFeedback={vi.fn()}
        onShareToOpenDesign={onShareToOpenDesign}
        {...handlers()}
      />,
    );
    fireEvent.mouseEnter(screen.getByTestId('next-step-toolbox-more'));
    fireEvent.mouseEnter(screen.getByTestId('next-step-more-share'));
    fireEvent.click(screen.getByTestId('next-step-share-contribute'));
    expect(onShareToOpenDesign).toHaveBeenCalledTimes(1);
  });

  it('does not render the card when the turn produced no previewable HTML artifact', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('notes.md', 'text')] })}
        streaming={false}
        projectId="proj-1"
        isLast
        {...handlers()}
      />,
    );
    expect(screen.queryByTestId('next-step-actions')).toBeNull();
  });

  it('renders once the project has a previewable HTML artifact from an earlier turn', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [] })}
        streaming={false}
        projectId="proj-1"
        isLast
        projectFiles={[producedFile('landing.html')]}
        {...handlers()}
      />,
    );
    expect(screen.getByTestId('next-step-actions')).toBeTruthy();
    expect(screen.getByText(AUTO_MATCH_TITLE)).toBeTruthy();
  });

  it('does not render when the handlers are not wired', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('landing.html')] })}
        streaming={false}
        projectId="proj-1"
        isLast
      />,
    );
    expect(screen.queryByTestId('next-step-actions')).toBeNull();
  });
});
