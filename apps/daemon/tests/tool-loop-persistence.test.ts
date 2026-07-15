import { describe, expect, it } from 'vitest';
import { daemonAgentPayloadToPersistedAgentEvent } from '../src/runtimes/chat-run-messages.js';
import {
  __forTestFilesystemEmptyAnswerFallbackText,
  __forTestFilesystemWriteFileNamesFromRunEvents,
} from '../src/server.js';

// Regression for PR #3375 review: the `tool_loop` event was handled by the live
// web translator but dropped by the daemon's persisted-event path, so the
// warning was transient-only and vanished on reload/history replay. This is
// worst in OD_TOOL_LOOP_GUARD=warn, where there is no terminal
// TOOL_LOOP_DETECTED error to fall back on. The persist mapper must turn the
// event into a stored status entry, mirroring the live mapping.

type PersistedStatus = { kind: string; label: string; detail: string };

// The mapper is JS-style untyped (returns a wide union | null); narrow to the
// status shape these cases produce so the assertions read cleanly.
function persist(payload: Record<string, unknown>): PersistedStatus | null {
  return daemonAgentPayloadToPersistedAgentEvent(payload) as PersistedStatus | null;
}

describe('daemonAgentPayloadToPersistedAgentEvent — tool_loop', () => {
  it('persists a warn tool_loop as a stored warning status (survives replay)', () => {
    const persisted = persist({
      type: 'tool_loop',
      reason: 'repeated-failure',
      action: 'warn',
      toolName: 'Edit',
      signature: 'Edit /x.html',
      count: 4,
    });
    expect(persisted).not.toBeNull();
    expect(persisted!.kind).toBe('status');
    expect(persisted!.label).toBe('warning');
    expect(persisted!.detail).toContain('Edit');
    expect(persisted!.detail).toContain('4');
    expect(persisted!.detail).toContain('may be stuck');
  });

  it('persists a halt tool_loop as a stored warning status', () => {
    const persisted = persist({
      type: 'tool_loop',
      reason: 'consecutive-errors',
      action: 'halt',
      toolName: 'Bash',
      signature: 'Bash verify.sh',
      count: 10,
    });
    expect(persisted!.kind).toBe('status');
    expect(persisted!.label).toBe('warning');
    expect(persisted!.detail).toContain('Run stopped');
    expect(persisted!.detail).toContain('Bash');
    expect(persisted!.detail).toContain('10');
  });

  it('drops a malformed tool_loop without a toolName', () => {
    expect(persist({ type: 'tool_loop', action: 'warn', count: 4 })).toBeNull();
  });
});

describe('daemonAgentPayloadToPersistedAgentEvent — diagnostic', () => {
  it('persists safe structured runtime diagnostics', () => {
    const persisted = daemonAgentPayloadToPersistedAgentEvent({
      type: 'diagnostic',
      name: 'acp_artifact_text_suppression',
      source: 'acp-json-rpc',
      elapsedMs: 1234,
      reason: 'artifact_echo',
      suppressedChars: 4096,
      suppressedChunks: 3,
      openedBlocks: 1,
      closedBlocks: 1,
      fileCount: 2,
      files: ['index.html', 'style.css'],
      shape: {
        sessionUpdate: 'agent_message_chunk',
        keys: ['content', 'sessionUpdate'],
        hasText: true,
      },
    }) as Record<string, unknown> | null;

    expect(persisted).toMatchObject({
      kind: 'diagnostic',
      name: 'acp_artifact_text_suppression',
      source: 'acp-json-rpc',
      elapsedMs: 1234,
      reason: 'artifact_echo',
      suppressedChars: 4096,
      suppressedChunks: 3,
      openedBlocks: 1,
      closedBlocks: 1,
      fileCount: 2,
      files: ['index.html', 'style.css'],
      shape: {
        sessionUpdate: 'agent_message_chunk',
        keys: ['content', 'sessionUpdate'],
        hasText: true,
      },
    });
  });
});

describe('filesystem empty-answer fallback helpers', () => {
  it('extracts written file names from filesystem tool events', () => {
    const names = __forTestFilesystemWriteFileNamesFromRunEvents([
      {
        event: 'agent',
        data: {
          type: 'tool_use',
          name: 'Write',
          input: { file_path: '/tmp/project/index.html' },
        },
      },
      {
        event: 'agent',
        data: {
          type: 'tool_use',
          name: 'Edit',
          input: { filePath: 'styles/theme.css' },
        },
      },
      {
        event: 'agent',
        data: {
          type: 'tool_use',
          name: 'Bash',
          input: { command: 'echo ok' },
        },
      },
    ]);

    expect(names).toEqual(['index.html', 'theme.css']);
  });

  it('builds a neutral normal assistant answer for file-only runs', () => {
    expect(__forTestFilesystemEmptyAnswerFallbackText([])).toBe('Wrote project files.');
    expect(__forTestFilesystemEmptyAnswerFallbackText(['index.html'])).toBe('Wrote index.html.');
    expect(__forTestFilesystemEmptyAnswerFallbackText(['index.html', 'theme.css'])).toBe(
      'Wrote index.html and theme.css.'
    );
    expect(__forTestFilesystemEmptyAnswerFallbackText(['index.html', 'theme.css', 'app.js', 'data.json'])).toBe(
      'Wrote index.html, theme.css, app.js, and 4 files total.'
    );
  });
});
