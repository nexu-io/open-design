// @vitest-environment jsdom

/**
 * Visibility-gate coverage for the feedback widget (issue #1288). The
 * lefarcen P2 review on PR #1308 pointed out that mounting the
 * widget on every `runSucceeded && !hasEmptyResponse` turn would
 * surface it after text-only acknowledgements and question-form
 * replies that don't produce a final artifact. The issue is scoped
 * to final-artifact turns specifically, so the gate now also
 * requires `produced.length > 0`.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage, ProjectFile } from '../../src/types';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

beforeEach(() => {
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
    events: [{ kind: 'text', text: 'Done.' } as ChatMessage['events'][number]],
    producedFiles: [],
    ...overrides,
  } as ChatMessage;
}

function producedFile(name: string): ProjectFile {
  return {
    name,
    path: name,
    size: 100,
    updatedAt: 1700000005,
    kind: 'html',
  } as ProjectFile;
}

describe('AssistantMessage feedback gate (issue #1288)', () => {
  it('shows the feedback widget after a successful turn that produced files', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('index.html')] })}
        streaming={false}
        projectId="proj-1"
      />,
    );
    expect(screen.getByText('Was this response helpful?')).toBeTruthy();
  });

  it('hides the feedback widget for a successful text-only turn with no producedFiles', () => {
    // Regression for lefarcen P2: the issue scopes feedback to
    // turns that delivered a final artifact, not every successful
    // turn. Text-only acknowledgements ("Got it.") must not prompt
    // for feedback.
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [] })}
        streaming={false}
        projectId="proj-1"
      />,
    );
    expect(screen.queryByText('Was this response helpful?')).toBeNull();
  });

  it('hides the feedback widget while the turn is still streaming', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          producedFiles: [producedFile('index.html')],
          runStatus: 'running',
          endedAt: undefined,
        })}
        streaming
        projectId="proj-1"
      />,
    );
    expect(screen.queryByText('Was this response helpful?')).toBeNull();
  });

  it('hides the feedback widget when the run failed', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          producedFiles: [producedFile('index.html')],
          runStatus: 'failed',
        })}
        streaming={false}
        projectId="proj-1"
      />,
    );
    expect(screen.queryByText('Was this response helpful?')).toBeNull();
  });

  it('hides the feedback widget when the run ended with an empty_response status', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          producedFiles: [producedFile('index.html')],
          events: [
            { kind: 'status', label: 'empty_response' } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
      />,
    );
    expect(screen.queryByText('Was this response helpful?')).toBeNull();
  });
});
