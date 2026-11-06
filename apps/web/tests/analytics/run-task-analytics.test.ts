import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@open-design/contracts';
import {
  buildInitialTaskAnalytics,
  buildRecoveryTaskAnalytics,
  recoveryActionInstanceId,
  runAgentProviderId,
} from '../../src/analytics/run-task';

describe('run task analytics lineage', () => {
  it('uses the canonical provider ids expected by the run dashboard', () => {
    expect(['amr', 'claude', 'codex'].map(runAgentProviderId)).toEqual([
      'amr',
      'claude_code',
      'codex_cli',
    ]);
  });

  it('starts a new user intent at task run index zero', () => {
    expect(buildInitialTaskAnalytics('task-1')).toEqual({
      taskExecutionId: 'task-1',
      taskRunIndex: 0,
    });
  });

  it('recovers legacy messages by using the owning user message as the task id', () => {
    const messages: ChatMessage[] = [
      { id: 'user-1', role: 'user', content: 'make a landing page' },
      { id: 'assistant-1', role: 'assistant', content: '', runId: 'run-1', runStatus: 'failed' },
    ];

    expect(buildRecoveryTaskAnalytics(
      messages,
      messages[1]!,
      'manual_retry',
    )).toEqual({
      taskExecutionId: 'user-1',
      initialRunId: 'run-1',
      sourceRunId: 'run-1',
      taskRunIndex: 1,
      recoveryActionType: 'manual_retry',
      recoveryActionInstanceId: recoveryActionInstanceId('assistant-1', 'manual_retry'),
    });
  });

  it('preserves the original task across resume and later recovery runs', () => {
    const messages: ChatMessage[] = [
      { id: 'user-2', role: 'user', content: 'continue', taskAnalytics: {
        taskExecutionId: 'task-original',
        initialRunId: 'run-1',
        sourceRunId: 'run-1',
        taskRunIndex: 1,
        recoveryActionType: 'resume_run',
        recoveryActionInstanceId: 'resume-1',
      } },
      { id: 'assistant-2', role: 'assistant', content: '', runId: 'run-2', runStatus: 'failed', taskAnalytics: {
        taskExecutionId: 'task-original',
        initialRunId: 'run-1',
        sourceRunId: 'run-1',
        taskRunIndex: 1,
        recoveryActionType: 'resume_run',
        recoveryActionInstanceId: 'resume-1',
      } },
    ];

    expect(buildRecoveryTaskAnalytics(
      messages,
      messages[1]!,
      'switch_runtime_retry',
    )).toMatchObject({
      taskExecutionId: 'task-original',
      initialRunId: 'run-1',
      sourceRunId: 'run-2',
      taskRunIndex: 2,
      recoveryActionType: 'switch_runtime_retry',
    });
  });
});
