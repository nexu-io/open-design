// @vitest-environment jsdom

/**
 * Gate coverage for the "next step" affordance under the last assistant
 * message. Iteration chips should appear for the last successful turn even
 * without a previewable artifact; the Share action still needs HTML.
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
  onArtifactChip: vi.fn(),
});

describe('AssistantMessage next-step affordance', () => {
  it('renders for the last successful turn with an HTML artifact and routes Share with the file name', () => {
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
    fireEvent.click(screen.getByText(en['nextStep.share']));
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

  it('keeps the busy Share to Open Design row mounted on the source turn after it is no longer last', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('landing.html')] })}
        streaming={false}
        projectId="proj-1"
        isLast={false}
        onFeedback={vi.fn()}
        onShareToOpenDesign={vi.fn()}
        shareToOpenDesignBusy
        {...handlers()}
      />,
    );

    const button = screen.getByTestId<HTMLButtonElement>('assistant-share-to-od');
    expect(screen.getByTestId('next-step-actions')).toBeTruthy();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe(en['assistant.shareToOpenDesignBusy']);
    expect(screen.queryByTestId('next-step-options-row')).toBeNull();
    expect(screen.queryByText(en['nextStep.chipPolishVisual'])).toBeNull();
  });

  it('renders iteration chips without the Share action when the turn produced no previewable HTML artifact', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('notes.md', 'text')] })}
        streaming={false}
        projectId="proj-1"
        isLast
        {...handlers()}
      />,
    );
    expect(screen.getByTestId('next-step-actions')).toBeTruthy();
    expect(screen.queryByText(en['nextStep.share'])).toBeNull();
    expect(screen.getByText(en['nextStep.chipPolishVisual'])).toBeTruthy();
  });

  it('keeps Share to Open Design separated after the regular next-step actions', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('notes.md', 'text')] })}
        streaming={false}
        projectId="proj-1"
        isLast
        onFeedback={vi.fn()}
        onShareToOpenDesign={vi.fn()}
        {...handlers()}
      />,
    );

    const nextSteps = screen.getByTestId('next-step-actions');
    const optionsRow = screen.getByTestId('next-step-options-row');
    const divider = screen.getByTestId('next-step-open-design-divider');
    const shareToOd = screen.getByTestId('assistant-share-to-od-panel');

    expect(nextSteps).toBeTruthy();
    expect(screen.getByText(en['nextStep.chipBrand'])).toBeTruthy();
    expect(shareToOd).toBeTruthy();
    expect(nextSteps.contains(shareToOd)).toBe(true);
    expect(optionsRow.contains(shareToOd)).toBe(false);
    expect(optionsRow.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(divider.compareDocumentPosition(shareToOd) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
