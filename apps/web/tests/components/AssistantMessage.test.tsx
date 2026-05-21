// @vitest-environment jsdom

/**
 * Visibility-gate coverage for the assistant feedback widget. It should
 * appear after any successfully completed turn, and stay hidden for
 * streaming turns, failed runs, and empty responses.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage, ProjectFile } from '../../src/types';

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
    mtime: 1700000005,
    kind: 'html',
    mime: 'text/html',
  } as ProjectFile;
}

describe('AssistantMessage feedback gate', () => {
  it('shows the feedback widget after a successful turn that produced files', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [producedFile('index.html')] })}
        streaming={false}
        projectId="proj-1"
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.getByRole('group', { name: 'Feedback' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Helpful' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Not helpful' })).toBeTruthy();
  });

  it('shows the feedback widget for a successful text-only turn with no producedFiles', () => {
    render(
      <AssistantMessage
        message={baseMessage({ producedFiles: [] })}
        streaming={false}
        projectId="proj-1"
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.getByRole('group', { name: 'Feedback' })).toBeTruthy();
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
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Feedback' })).toBeNull();
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
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Feedback' })).toBeNull();
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
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.queryByRole('group', { name: 'Feedback' })).toBeNull();
  });
});

describe('AssistantMessage status badge updates (Bug A)', () => {
  // Regression coverage for the model-badge stale-detail bug. ACP agents
  // emit two `status: 'model'` events per turn:
  //   1. After session/new returns — the agent's initial default model
  //      (e.g. `swe-1-6-fast` for Devin for Terminal)
  //   2. After session/set_config_option (or legacy session/set_model)
  //      succeeds — the user-selected model (e.g. `claude-opus-4-7-max`)
  //
  // The previous `buildBlocks` dedupe SKIPPED the second event and the
  // badge stayed stuck on the initial default, even though the running
  // model and the conversation header were already correct. The fix
  // updates the existing block's detail to the latest value so the badge
  // tracks the most recent model the daemon reported.
  it('renders the most recent detail when multiple status events share a label', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          events: [
            { kind: 'status', label: 'model', detail: 'swe-1-6-fast' } as ChatMessage['events'][number],
            { kind: 'status', label: 'model', detail: 'claude-opus-4-7-max' } as ChatMessage['events'][number],
            { kind: 'text', text: 'Done.' } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
        onFeedback={vi.fn()}
      />,
    );

    // Latest detail should be rendered in the badge.
    expect(screen.getByText('claude-opus-4-7-max')).toBeTruthy();

    // The initial default must not be present — if it is, the stale-detail
    // bug is back.
    expect(screen.queryByText('swe-1-6-fast')).toBeNull();
  });

  it('still collapses repeated status events with the same label and detail into a single badge', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          events: [
            { kind: 'status', label: 'model', detail: 'claude-opus-4-7-max' } as ChatMessage['events'][number],
            { kind: 'status', label: 'model', detail: 'claude-opus-4-7-max' } as ChatMessage['events'][number],
            { kind: 'text', text: 'Done.' } as ChatMessage['events'][number],
          ],
        })}
        streaming={false}
        projectId="proj-1"
        onFeedback={vi.fn()}
      />,
    );

    const matches = screen.queryAllByText('claude-opus-4-7-max');
    expect(matches.length).toBe(1);
  });
});

describe('AssistantMessage recovered produced files', () => {
  it('shows files modified during a sparse completed assistant turn', () => {
    render(
      <AssistantMessage
        message={baseMessage({
          content: '',
          events: [
            { kind: 'status', label: 'starting', detail: 'Claude' } as ChatMessage['events'][number],
            { kind: 'status', label: 'initializing', detail: 'claude-opus' } as ChatMessage['events'][number],
          ],
          producedFiles: [],
        })}
        streaming={false}
        projectId="proj-1"
        projectFiles={[
          {
            name: 'iphone-device-reveal.mp4',
            path: 'iphone-device-reveal.mp4',
            size: 2328155,
            mtime: 1700000004,
            kind: 'video',
            mime: 'video/mp4',
          } as ProjectFile,
        ]}
      />,
    );

    expect(screen.getByText('iphone-device-reveal.mp4')).toBeTruthy();
  });
});
