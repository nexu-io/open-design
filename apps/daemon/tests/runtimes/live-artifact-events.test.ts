import { describe, expect, it, vi } from 'vitest';
import { createLiveArtifactEventEmitter } from '../../src/runtimes/live-artifact-events.js';

describe('live artifact event emitter', () => {
  it('fans out created events to project and chat subscribers', () => {
    const emitProjectEvent = vi.fn(() => true);
    const emitChatAgentEvent = vi.fn(() => false);
    const emitter = createLiveArtifactEventEmitter({
      emitProjectEvent,
      emitChatAgentEvent,
      chatRunHandles: new Map(),
    });

    expect(emitter.emitLiveArtifactEvent(
      { runId: 'run-1', projectId: 'project-1' },
      'created',
      { id: 'artifact-1', title: 'Brief' },
    )).toBe(true);
    expect(emitProjectEvent).toHaveBeenCalledWith('project-1', expect.objectContaining({
      type: 'live_artifact',
      action: 'created',
      artifactId: 'artifact-1',
      title: 'Brief',
    }));
    expect(emitChatAgentEvent).toHaveBeenCalledWith('run-1', expect.objectContaining({
      type: 'live_artifact',
    }));
  });

  it('notifies the chat handle only for the first artifact creation', () => {
    const noteArtifactRegistered = vi.fn();
    const emitter = createLiveArtifactEventEmitter({
      emitProjectEvent: vi.fn(() => false),
      emitChatAgentEvent: vi.fn(() => false),
      chatRunHandles: new Map([['run-1', { noteArtifactRegistered }]]),
    });

    emitter.emitLiveArtifactEvent({ runId: 'run-1' }, 'created', { id: 'artifact-1' });
    emitter.emitLiveArtifactEvent({ runId: 'run-1' }, 'updated', { id: 'artifact-1' });
    expect(noteArtifactRegistered).toHaveBeenCalledTimes(1);
  });

  it('swallows watchdog hook failures and rejects empty artifacts', () => {
    const emitter = createLiveArtifactEventEmitter({
      emitProjectEvent: vi.fn(() => false),
      emitChatAgentEvent: vi.fn(() => false),
      chatRunHandles: new Map([['run-1', {
        noteArtifactRegistered: () => { throw new Error('closed run'); },
      }]]),
    });

    expect(() => emitter.emitLiveArtifactEvent({ runId: 'run-1' }, 'created', { id: 'artifact-1' })).not.toThrow();
    expect(emitter.emitLiveArtifactEvent({ projectId: 'project-1' }, 'created', { id: '' })).toBe(false);
    expect(emitter.emitLiveArtifactRefreshEvent({ projectId: 'project-1' }, { artifactId: '' })).toBe(false);
  });
});
