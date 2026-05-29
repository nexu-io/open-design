// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantMessage } from '../../src/components/AssistantMessage';
import type { ChatMessage } from '../../src/types';

const analyticsMocks = vi.hoisted(() => ({
  newRequestId: vi.fn(() => 'request-1'),
  track: vi.fn(),
}));

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({
    newRequestId: analyticsMocks.newRequestId,
    setConfigureGlobals: vi.fn(),
    setConsent: vi.fn(),
    setIdentity: vi.fn(),
    track: analyticsMocks.track,
  }),
}));

beforeAll(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

beforeEach(() => {
  analyticsMocks.newRequestId.mockReturnValue('request-1');
  analyticsMocks.track.mockReset();
});

afterEach(() => {
  cleanup();
});

function assistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'assistant-1',
    role: 'assistant',
    content: 'Done.',
    agentId: 'claude',
    agentName: 'Claude · claude-sonnet-4-6',
    runId: 'run-1',
    runStatus: 'succeeded',
    events: [{ kind: 'text', text: 'Done.' } as NonNullable<ChatMessage['events']>[number]],
    producedFiles: [],
    ...overrides,
  } as ChatMessage;
}

describe('AssistantMessage feedback analytics', () => {
  async function submitHelpfulFeedback(message: ChatMessage) {
    render(
      <AssistantMessage
        message={message}
        streaming={false}
        projectId="project-1"
        projectKind="prototype"
        conversationId="conversation-1"
        onFeedback={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Helpful' }));
    fireEvent.click(await screen.findByLabelText('Understood my request'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    const resultCall = analyticsMocks.track.mock.calls.find(
      ([event]) => event === 'feedback_submit_result',
    );
    expect(resultCall).toBeTruthy();
    return resultCall?.[1];
  }

  it('includes model and CLI provider on feedback_submit_result', async () => {
    const resultProps = await submitHelpfulFeedback(assistantMessage());
    expect(resultProps).toMatchObject({
      model_id: 'claude-sonnet-4-6',
      agent_provider_id: 'claude_code',
    });
  });

  it('maps API-mode agent ids on feedback_submit_result', async () => {
    const resultProps = await submitHelpfulFeedback(assistantMessage({
      agentId: 'anthropic-api',
      agentName: 'Anthropic API · claude-sonnet-4-6',
    }));
    expect(resultProps).toMatchObject({
      model_id: 'claude-sonnet-4-6',
      agent_provider_id: 'anthropic',
    });
  });
});
