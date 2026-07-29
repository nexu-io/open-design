// @vitest-environment jsdom

/**
 * Analytics + behaviour coverage for the hosted-AMR nudge component. It fires
 * `surface_view` (element=run_failed_toast) on mount with the full business
 * prop set, and `ui_click` (element=go_amr) + `onActivate` on the link.
 * (Gating — which agents/codes get the nudge — is covered by the
 * `resolveRunFailureUi` resolver test.)
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/analytics/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/events')>();
  return {
    ...actual,
    trackRunFailedToastSurfaceView: vi.fn(),
    trackRunFailedToastGoAmrClick: vi.fn(),
  };
});

import { AmrGuidance } from '../../src/components/AmrGuidance';
import {
  trackRunFailedToastGoAmrClick,
  trackRunFailedToastSurfaceView,
} from '../../src/analytics/events';

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
  vi.clearAllMocks();
});

beforeEach(() => {
  vi.clearAllMocks();
});

function renderGuidance(onActivate = vi.fn()) {
  render(
    <AmrGuidance
      errorCode="AGENT_AUTH_REQUIRED"
      projectId="proj-1"
      projectKind="prototype"
      conversationId="conv-1"
      assistantMessageId="msg-amr"
      runId="run-9"
      sourceDetail="chat_error_switch_retry_card"
      onActivate={onActivate}
    />,
  );
  return onActivate;
}

describe('AmrGuidance', () => {
  it('fires surface_view once on mount with the full prop set', () => {
    renderGuidance();
    expect(screen.getByTestId('amr-guidance')).toBeTruthy();
    expect(trackRunFailedToastSurfaceView).toHaveBeenCalledTimes(1);
    expect(vi.mocked(trackRunFailedToastSurfaceView).mock.calls[0]![1]).toMatchObject({
      page_name: 'chat_panel',
      area: 'chat_panel',
      element: 'run_failed_toast',
      error_code: 'AGENT_AUTH_REQUIRED',
      project_id: 'proj-1',
      project_kind: 'prototype',
      conversation_id: 'conv-1',
      assistant_message_id: 'msg-amr',
      run_id: 'run-9',
    });
  });

  it('fires ui_click go_amr and calls onActivate on click', () => {
    const onActivate = renderGuidance();
    fireEvent.click(screen.getByRole('button'));
    expect(trackRunFailedToastGoAmrClick).toHaveBeenCalledTimes(1);
    expect(vi.mocked(trackRunFailedToastGoAmrClick).mock.calls[0]![1]).toMatchObject({
      page_name: 'chat_panel',
      area: 'chat_panel',
      element: 'go_amr',
    });
    expect(onActivate).toHaveBeenCalledTimes(1);
  });
});
