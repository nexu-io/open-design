// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { AppConfig, ChatMessage, ProjectFile } from '../../src/types';

const translate = (key: string, vars?: { files?: string }) => vars?.files ? `${key}: ${vars.files}` : key;
vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: translate }),
  useT: () => translate,
}));
vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, _ref) => <div data-testid="composer" />),
}));

const ARTIFACT = 'image-doubao-seedream-3-0-t2i-250415-muy6ahle.png';
const file: ProjectFile = {
  name: ARTIFACT, path: ARTIFACT, size: 336300, mtime: 1700000005000,
  kind: 'image', mime: 'image/png',
};

beforeAll(() => {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
  });
});
afterEach(cleanup);

describe('issue #8596: chat preserves a failed run\'s usable artifact', () => {
  it.each([
    { runStatus: 'succeeded', failureCategory: undefined },
    { runStatus: 'failed', failureCategory: 'empty_output' },
    { runStatus: 'failed', failureCategory: 'process_exit' },
  ] as const)(
    'shows the artifact download for $runStatus / $failureCategory',
    ({ runStatus, failureCategory }) => {
      const message: ChatMessage = {
        id: 'assistant-8596', role: 'assistant', content: '', createdAt: 1700000000000,
        runId: 'run-8596', runStatus, agentId: 'deepseek-harness',
        endedAt: 1700000005000, producedFiles: [file],
        events: runStatus === 'failed' ? [{
          kind: 'status', label: 'error', code: 'AGENT_EXECUTION_FAILED',
          failureCategory, failureDetail: failureCategory,
          detail: 'Agent returned no text output.',
        }] : [],
      } as ChatMessage;
      render(<ChatPane
        messages={[message]} streaming={false} error={null}
        projectId="project-8596" projectFiles={[file]}
        onEnsureProject={async () => 'project-8596'} onSend={vi.fn()} onStop={vi.fn()}
        onRetry={vi.fn()} onSwitchToAmrAndRetry={vi.fn()}
        conversations={[{ projectId: 'project-8596', id: 'conv-8596', title: 'Current', createdAt: 1, updatedAt: 1 }]}
        activeConversationId="conv-8596" onSelectConversation={vi.fn()} onDeleteConversation={vi.fn()}
        config={{ agentId: 'deepseek-harness', agentCliEnv: {} } as unknown as AppConfig}
      />);

      if (runStatus === 'failed') expect(screen.getByTestId('chat-run-error-card')).toBeTruthy();
      const card = screen.getByTestId(`artifact-card-${ARTIFACT}`);
      expect(card).toBeTruthy();
      expect(within(card).getByRole('link', { name: 'chat.artifact.export' }).getAttribute('download'))
        .toBe(ARTIFACT);
      if (runStatus === 'failed' && failureCategory === 'empty_output') {
        const recovery = screen.getByTestId('chat-run-error-card');
        expect(recovery.textContent).toContain('chat.runError.title.artifactsWithoutSummary');
        expect(recovery.textContent).toContain('chat.runError.artifactsWithoutSummaryMessage');
        expect(recovery.textContent).not.toContain('chat.runError.emptyOutputMessage');
        expect(recovery.textContent).toContain(ARTIFACT);
        expect(recovery.getAttribute('data-severity')).toBe('warning');
      } else if (runStatus === 'failed') {
        const recovery = screen.getByTestId('chat-run-error-card');
        expect(recovery.textContent).toContain('chat.runError.availableArtifacts');
        expect(recovery.textContent).toContain(ARTIFACT);
        expect(recovery.textContent).not.toContain('chat.runError.title.artifactsWithoutSummary');
        expect(recovery.getAttribute('data-severity')).toBe('error');
      } else {
        expect(screen.getByTestId('chat-artifact-missing-summary').textContent)
          .toContain('chat.artifact.missingSummary');
      }
    },
  );
});
