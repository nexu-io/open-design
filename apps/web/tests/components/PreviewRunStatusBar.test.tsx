// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { analyticsTrack } = vi.hoisted(() => ({ analyticsTrack: vi.fn() }));

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({ track: analyticsTrack }),
}));

import { PreviewRunStatusBar } from '../../src/components/PreviewRunStatusBar';
import { I18nProvider } from '../../src/i18n';
import type { ChatMessage } from '../../src/types';

const STARTED_AT = 1_700_000_000_000;

function deliveredMessage(): ChatMessage {
  return {
    id: 'delivered-message',
    role: 'assistant',
    content: '',
    sessionMode: 'design',
    runStatus: 'succeeded',
    resultDeliveryState: 'delivered',
    createdAt: STARTED_AT,
    startedAt: STARTED_AT,
    endedAt: STARTED_AT,
  };
}

function runningMessage(): ChatMessage {
  return {
    id: 'running-message',
    role: 'assistant',
    content: '',
    sessionMode: 'design',
    runStatus: 'running',
    createdAt: STARTED_AT,
    startedAt: STARTED_AT,
    events: [{ kind: 'tool_use', id: 'tool-1', name: 'write_file', input: {} }],
  };
}

function renderStatus(messages: ChatMessage[]) {
  return render(
    <I18nProvider initial="en">
      <PreviewRunStatusBar
        projectId="project-1"
        conversationId="conversation-1"
        messages={messages}
      />
    </I18nProvider>,
  );
}

describe('PreviewRunStatusBar', () => {
  afterEach(() => {
    cleanup();
    analyticsTrack.mockReset();
    vi.useRealTimers();
  });

  it('renders only the stage label while a Design run is active', () => {
    vi.useFakeTimers();
    vi.setSystemTime(STARTED_AT + 8 * 60_000 + 18_000);

    renderStatus([runningMessage()]);

    const status = screen.getByTestId('preview-run-status');
    expect(status).toHaveTextContent('Building design solution');
    expect(status).not.toHaveTextContent('Elapsed');
    expect(status.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('does not flash or track an already-expired delivered turn after an idle rerender', () => {
    vi.useFakeTimers();
    vi.setSystemTime(STARTED_AT);
    const { rerender } = renderStatus([]);

    vi.advanceTimersByTime(6_000);
    rerender(
      <I18nProvider initial="en">
        <PreviewRunStatusBar
          projectId="project-1"
          conversationId="conversation-2"
          messages={[deliveredMessage()]}
        />
      </I18nProvider>,
    );

    expect(screen.queryByTestId('preview-run-status')).toBeNull();
    expect(analyticsTrack).not.toHaveBeenCalled();
  });
});
