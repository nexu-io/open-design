import { describe, expect, it } from 'vitest';
import {
  buildGenerationPreviewState,
  derivePrototypeGenerationSteps,
  workspaceHasPreviewSurface,
} from '../../src/runtime/generation-preview';
import type { AgentEvent, ChatMessage } from '../../src/types';

describe('generation preview helpers', () => {
  it('detects when the workspace already has a preview surface', () => {
    expect(
      workspaceHasPreviewSurface({
        activeTab: 'index.html',
        projectFiles: [{ name: 'index.html', size: 1, mtime: 1, kind: 'html', mime: 'text/html' }],
        liveArtifacts: [],
      }),
    ).toBe(true);
    expect(
      workspaceHasPreviewSurface({
        activeTab: null,
        projectFiles: [],
        liveArtifacts: [],
        streamingArtifactHtml: '<html><body>hi</body></html>',
      }),
    ).toBe(true);
  });

  it('advances the three prototype steps from streamed events', () => {
    const events: AgentEvent[] = [
      { kind: 'status', label: 'thinking' },
      { kind: 'text', text: 'Planning the page.' },
      { kind: 'tool_use', id: '1', name: 'Write', input: { file_path: 'index.html' } },
    ];
    expect(
      derivePrototypeGenerationSteps({
        events,
        hasArtifactHtml: false,
        hasPreviewSurface: false,
        failed: false,
      }),
    ).toEqual([
      { id: 'understand', status: 'succeeded' },
      { id: 'generate', status: 'succeeded' },
      { id: 'prepare', status: 'running' },
    ]);
  });

  it('keeps the understand step in progress while the request is still pending', () => {
    // `requesting` only means the request left the client; nothing should
    // advance past the first step until real model activity arrives, so the
    // UI can reveal steps one at a time.
    expect(
      derivePrototypeGenerationSteps({
        events: [{ kind: 'status', label: 'requesting', detail: 'claude-opus-4-7' }],
        hasArtifactHtml: false,
        hasPreviewSurface: false,
        failed: false,
      }),
    ).toEqual([
      { id: 'understand', status: 'running' },
      { id: 'generate', status: 'pending' },
      { id: 'prepare', status: 'pending' },
    ]);
  });

  it('builds preview state for an active assistant run without an open preview tab', () => {
    const assistant: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      runStatus: 'running',
      startedAt: Date.now() - 5_000,
      events: [{ kind: 'status', label: 'thinking' }],
    };
    const state = buildGenerationPreviewState({
      designSystemProject: false,
      messages: [{ id: 'u1', role: 'user', content: 'Build a landing page' }, assistant],
      streaming: true,
      activeTab: null,
      projectFiles: [],
      liveArtifacts: [],
    });
    expect(state).not.toBeNull();
    expect(state?.phase).toBe('generating');
    // A `thinking` status is enough evidence that the model started, so the
    // first step has already advanced past "running".
    expect(state?.steps[0]?.status).toBe('succeeded');
    expect(state?.retryTarget).toBeNull();
  });

  it('surfaces the latest activity snippet while generating', () => {
    const assistant: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      runStatus: 'running',
      startedAt: Date.now(),
      events: [
        { kind: 'status', label: 'thinking' },
        { kind: 'thinking', text: 'Sketching the hero section layout' },
      ],
    };
    const state = buildGenerationPreviewState({
      designSystemProject: false,
      messages: [assistant],
      streaming: true,
      activeTab: null,
      projectFiles: [],
      liveArtifacts: [],
    });
    expect(state?.activityLabel).toBe('Sketching the hero section layout');
  });

  it('derives a concrete sub-status and task count while generating', () => {
    const assistant: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      runStatus: 'running',
      startedAt: Date.now(),
      events: [
        {
          kind: 'tool_use',
          id: 't1',
          name: 'TodoWrite',
          input: {
            todos: [
              { content: 'Plan layout', status: 'completed' },
              { content: 'Write index.html', activeForm: 'Writing index.html', status: 'in_progress' },
              { content: 'Self-check', status: 'pending' },
            ],
          },
        },
      ],
    };
    const state = buildGenerationPreviewState({
      designSystemProject: false,
      messages: [assistant],
      streaming: true,
      activeTab: null,
      projectFiles: [],
      liveArtifacts: [],
    });
    expect(state?.detailLabel).toBe('Writing index.html');
    // The in-progress task counts toward `done`, matching the chat todo card.
    expect(state?.todoProgress).toEqual({ done: 2, total: 3 });
  });

  it('falls back to the latest write target when no plan is present', () => {
    const assistant: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      runStatus: 'running',
      startedAt: Date.now(),
      events: [
        { kind: 'text', text: 'Writing the page now.' },
        { kind: 'tool_use', id: 't1', name: 'Write', input: { file_path: 'src/index.html' } },
      ],
    };
    const state = buildGenerationPreviewState({
      designSystemProject: false,
      messages: [assistant],
      streaming: true,
      activeTab: null,
      projectFiles: [],
      liveArtifacts: [],
    });
    expect(state?.detailLabel).toBe('index.html');
    expect(state?.todoProgress).toBeNull();
  });

  it('omits sub-status data once the run is no longer generating', () => {
    const assistant: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: 'Partial work',
      runStatus: 'canceled',
      startedAt: Date.now(),
      events: [
        {
          kind: 'tool_use',
          id: 't1',
          name: 'TodoWrite',
          input: { todos: [{ content: 'Write index.html', status: 'in_progress' }] },
        },
      ],
    };
    const state = buildGenerationPreviewState({
      designSystemProject: false,
      messages: [assistant],
      streaming: false,
      activeTab: null,
      projectFiles: [],
      liveArtifacts: [],
    });
    expect(state?.phase).toBe('stopped');
    expect(state?.detailLabel).toBeNull();
    expect(state?.todoProgress).toBeNull();
  });

  it('keeps a paused surface when the run was stopped without a preview', () => {
    const assistant: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: 'Partial work',
      runStatus: 'canceled',
      startedAt: Date.now() - 10_000,
      events: [{ kind: 'tool_use', id: '1', name: 'Write', input: {} }],
    };
    const state = buildGenerationPreviewState({
      designSystemProject: false,
      messages: [assistant],
      streaming: false,
      activeTab: null,
      projectFiles: [],
      liveArtifacts: [],
    });
    expect(state?.phase).toBe('stopped');
    expect(state?.failed).toBe(false);
    expect(state?.retryTarget).toBeNull();
  });

  it('keeps a waiting surface when the agent is asking the user a question', () => {
    const assistant: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: 'A few quick questions:\n<question-form id="discovery" title="Brief">{"questions":[]}</question-form>',
      runStatus: 'succeeded',
      startedAt: Date.now() - 4_000,
      events: [{ kind: 'text', text: '<question-form id="discovery">{"questions":[]}</question-form>' }],
    };
    const state = buildGenerationPreviewState({
      designSystemProject: false,
      messages: [assistant],
      streaming: false,
      activeTab: null,
      projectFiles: [],
      liveArtifacts: [],
    });
    expect(state?.phase).toBe('awaiting-input');
    expect(state?.retryTarget).toBeNull();
  });

  it('returns null for a finished run that produced no question or preview', () => {
    const assistant: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: 'All done!',
      runStatus: 'succeeded',
      startedAt: Date.now() - 4_000,
      events: [{ kind: 'text', text: 'All done!' }],
    };
    expect(
      buildGenerationPreviewState({
        designSystemProject: false,
        messages: [assistant],
        streaming: false,
        activeTab: null,
        projectFiles: [],
        liveArtifacts: [],
      }),
    ).toBeNull();
  });

  it('builds a failed state with a retry target', () => {
    const assistant: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      runStatus: 'failed',
      startedAt: Date.now() - 8_000,
      events: [{ kind: 'text', text: 'Model request failed' }],
    };
    const state = buildGenerationPreviewState({
      designSystemProject: false,
      messages: [assistant],
      streaming: false,
      activeTab: null,
      projectFiles: [],
      liveArtifacts: [],
      conversationError: 'Network error',
    });
    expect(state?.phase).toBe('failed');
    expect(state?.failed).toBe(true);
    expect(state?.errorMessage).toBe('Network error');
    expect(state?.retryTarget).toBe(assistant);
    // No structured code on this run, so it stays a generic retry with no
    // AMR promotion.
    expect(state?.errorCode).toBeNull();
    expect(state?.failureUi?.primaryAction).toBe('retry');
    expect(state?.promoteAmrSwitch).toBe(false);
  });

  it('classifies a rate-limited failure from the error event code', () => {
    const assistant: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      runStatus: 'failed',
      startedAt: Date.now() - 8_000,
      events: [
        { kind: 'status', label: 'error', detail: 'Rate limited', code: 'RATE_LIMITED' },
      ],
    };
    const state = buildGenerationPreviewState({
      designSystemProject: false,
      messages: [assistant],
      streaming: false,
      activeTab: null,
      projectFiles: [],
      liveArtifacts: [],
    });
    expect(state?.phase).toBe('failed');
    expect(state?.errorCode).toBe('RATE_LIMITED');
    // Non-AMR agent + a model/quota code keeps a plain retry but promotes AMR.
    expect(state?.failureUi?.primaryAction).toBe('retry');
    expect(state?.failureUi?.showSwitchCard).toBe(true);
    expect(state?.promoteAmrSwitch).toBe(true);
  });

  it('does not promote AMR for an upstream outage (switching would not help)', () => {
    const assistant: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      runStatus: 'failed',
      startedAt: Date.now() - 8_000,
      events: [
        { kind: 'status', label: 'error', detail: 'Upstream down', code: 'UPSTREAM_UNAVAILABLE' },
      ],
    };
    const state = buildGenerationPreviewState({
      designSystemProject: false,
      messages: [assistant],
      streaming: false,
      activeTab: null,
      projectFiles: [],
      liveArtifacts: [],
    });
    expect(state?.errorCode).toBe('UPSTREAM_UNAVAILABLE');
    // resolveRunFailureUi still flags showSwitchCard, but the preview gate
    // deliberately suppresses the promotion card for outages.
    expect(state?.failureUi?.showSwitchCard).toBe(true);
    expect(state?.promoteAmrSwitch).toBe(false);
  });

  it('mirrors the AMR authorize action for an auth-required failure', () => {
    const assistant: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      agentId: 'amr',
      runStatus: 'failed',
      startedAt: Date.now() - 8_000,
      events: [
        { kind: 'status', label: 'error', detail: 'Authorize first', code: 'AMR_AUTH_REQUIRED' },
      ],
    };
    const state = buildGenerationPreviewState({
      designSystemProject: false,
      messages: [assistant],
      streaming: false,
      activeTab: null,
      projectFiles: [],
      liveArtifacts: [],
    });
    expect(state?.errorCode).toBe('AMR_AUTH_REQUIRED');
    expect(state?.failureUi?.primaryAction).toBe('authorize');
    expect(state?.failureUi?.messageKey).toBe('chat.amrError.authMessage');
    // The AMR agent itself has the inline authorize action, so there is no
    // "switch to AMR" promotion card.
    expect(state?.promoteAmrSwitch).toBe(false);
  });

  it('leaves errorCode and failureUi null while a run is still generating', () => {
    const assistant: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      runStatus: 'running',
      startedAt: Date.now(),
      events: [{ kind: 'status', label: 'thinking' }],
    };
    const state = buildGenerationPreviewState({
      designSystemProject: false,
      messages: [assistant],
      streaming: true,
      activeTab: null,
      projectFiles: [],
      liveArtifacts: [],
    });
    expect(state?.phase).toBe('generating');
    expect(state?.errorCode).toBeNull();
    expect(state?.failureUi).toBeNull();
  });

  it('hides preview state once a preview tab is active', () => {
    const assistant: ChatMessage = {
      id: 'a1',
      role: 'assistant',
      content: '',
      runStatus: 'running',
      startedAt: Date.now(),
      events: [{ kind: 'tool_use', id: '1', name: 'Write', input: {} }],
    };
    expect(
      buildGenerationPreviewState({
        designSystemProject: false,
        messages: [assistant],
        streaming: true,
        activeTab: 'index.html',
        projectFiles: [{ name: 'index.html', size: 1, mtime: 1, kind: 'html', mime: 'text/html' }],
        liveArtifacts: [],
      }),
    ).toBeNull();
  });

});
