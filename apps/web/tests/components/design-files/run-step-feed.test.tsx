// @vitest-environment jsdom
import { cleanup, render, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RunStepFeed } from '../../../src/components/design-files/RunStepFeed';
import { I18nProvider } from '../../../src/i18n';
import { runProgressSteps } from '../../../src/runtime/run-progress';
import { IN_FLIGHT_TOOL_INPUT_MARKER } from '../../../src/runtime/tool-events';
import type { AgentEvent, ChatMessage } from '../../../src/types';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('updates one visible progress row through native in-flight snapshots and completion without duplicate keys', () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const events: AgentEvent[] = [];
  const message: ChatMessage = { id: 'byok-progress', role: 'assistant', content: '', events };
  const view = () => (
    <I18nProvider initial="en">
      <RunStepFeed running steps={runProgressSteps([message])} />
    </I18nProvider>
  );
  const rendered = render(view());
  const call = (input: Record<string, unknown>): AgentEvent => ({
    kind: 'tool_use', id: 'read-call', name: 'read', input,
  });
  events.push(call({ [IN_FLIGHT_TOOL_INPUT_MARKER]: true }));
  rendered.rerender(view());
  events.push(call({ filePath: 'index.html', [IN_FLIGHT_TOOL_INPUT_MARKER]: true }));
  rendered.rerender(view());

  expect(errors.mock.calls.filter((args) => String(args[0]).includes('same key'))).toEqual([]);
  expect(within(rendered.getByTestId('run-step-feed')).getAllByRole('listitem')).toHaveLength(1);
  expect(rendered.getByText(/index\.html/)).toBeTruthy();

  events.push(call({ filePath: 'index.html' }));
  events.push({ kind: 'tool_result', toolUseId: 'read-call', content: 'Read complete', isError: false });
  rendered.rerender(view());

  expect(within(rendered.getByTestId('run-step-feed')).getAllByRole('listitem')).toHaveLength(1);
  expect(errors.mock.calls.filter((args) => String(args[0]).includes('same key'))).toEqual([]);
});
