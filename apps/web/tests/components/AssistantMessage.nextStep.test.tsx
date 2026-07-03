// @vitest-environment jsdom

/**
 * Gate coverage for the "next step" affordance under the last assistant
 * message. Artifact-backed turns expose Share/Download/toolbox actions, while
 * terminal no-artifact or interrupted turns still surface recovery prompts so
 * users are never left at a dead end.
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import {
  PROJECT_GENERATE_ARTIFACT_PROMPT,
} from '../../src/components/NextStepActions';
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
  onNextStepPromptAction: vi.fn(),
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

  it('renders the card after a simple answer with no previewable artifact', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [] })}
        streaming={false}
        projectId="proj-1"
        isLast
        {...handlers()}
      />,
    );
    expect(screen.getByTestId('next-step-actions')).toBeTruthy();
    expect(screen.getByText(en['nextStep.projectGenerateArtifactTitle'])).toBeTruthy();
  });

  it('renders the card for a simple answer even without a project id', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [] })}
        streaming={false}
        isLast
        {...handlers()}
      />,
    );
    expect(screen.getByTestId('next-step-actions')).toBeTruthy();
  });

  it('renders project recovery actions when the turn produced no previewable artifact', () => {
    const h = handlers();
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('notes.md', 'text')] })}
        streaming={false}
        projectId="proj-1"
        isLast
        {...h}
      />,
    );
    expect(screen.getByTestId('file-ops-summary')).toBeTruthy();
    expect(screen.getByTestId('file-ops-row-notes.md')).toBeTruthy();
    expect(screen.getByTestId('next-step-actions')).toBeTruthy();
    expect(screen.getByText(en['nextStep.projectGenerateArtifactTitle'])).toBeTruthy();
    fireEvent.click(screen.getByTestId('next-step-project-action-project-generate-artifact'));
    expect(h.onNextStepPromptAction).toHaveBeenCalledWith(PROJECT_GENERATE_ARTIFACT_PROMPT);
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

  it('renders incomplete brand extraction next steps after cancellation without an artifact', () => {
    const h = handlers();
    const onContinueExtraction = vi.fn();
    const onContinueAiExtraction = vi.fn();
    render(
      <AssistantMessage
        message={baseMessage({
          runStatus: 'canceled',
          content: 'Stopped.',
          producedFiles: [],
        })}
        streaming={false}
        projectId="proj-brand"
        isLast
        nextStepVariant="brand-extraction"
        onNextStepContinueExtraction={onContinueExtraction}
        onNextStepContinueAiExtraction={onContinueAiExtraction}
        {...h}
      />,
    );

    expect(screen.getByTestId('next-step-actions')).toBeTruthy();
    expect(screen.getByText(en['nextStep.brandContinueExtractionTitle'])).toBeTruthy();
    expect(screen.getByText(en['nextStep.brandContinueAiExtractionTitle'])).toBeTruthy();
    fireEvent.click(screen.getByTestId('next-step-brand-action-brand-continue-extraction'));
    expect(onContinueExtraction).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('next-step-brand-action-brand-continue-ai-extraction'));
    expect(onContinueAiExtraction).toHaveBeenCalledTimes(1);
  });

  it('refreshes the incomplete brand continuation busy state on memoized rows', () => {
    const h = handlers();
    const onContinueExtraction = vi.fn();
    const message = baseMessage({
      runStatus: 'canceled',
      content: 'Stopped.',
      producedFiles: [],
    });
    const view = render(
      <AssistantMessage
        message={message}
        streaming={false}
        projectId="proj-brand"
        isLast
        nextStepVariant="brand-extraction"
        onNextStepContinueExtraction={onContinueExtraction}
        nextStepContinueExtractionBusy={false}
        {...h}
      />,
    );

    const firstButton = screen.getByTestId('next-step-brand-action-brand-continue-extraction');
    fireEvent.click(firstButton);
    expect(onContinueExtraction).toHaveBeenCalledTimes(1);

    view.rerender(
      <AssistantMessage
        message={message}
        streaming={false}
        projectId="proj-brand"
        isLast
        nextStepVariant="brand-extraction"
        onNextStepContinueExtraction={onContinueExtraction}
        nextStepContinueExtractionBusy
        {...h}
      />,
    );

    const busyButton = screen.getByTestId('next-step-brand-action-brand-continue-extraction');
    expect((busyButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(busyButton);
    expect(onContinueExtraction).toHaveBeenCalledTimes(1);
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

  it('renders after a failed turn when a follow-up action is available', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [], runStatus: 'failed' })}
        streaming={false}
        projectId="proj-1"
        isLast
        {...handlers()}
      />,
    );
    expect(screen.getByTestId('next-step-actions')).toBeTruthy();
  });

  it('renders after a canceled turn when a follow-up action is available', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [], runStatus: 'canceled' })}
        streaming={false}
        projectId="proj-1"
        isLast
        {...handlers()}
      />,
    );
    expect(screen.getByTestId('next-step-actions')).toBeTruthy();
  });
});
