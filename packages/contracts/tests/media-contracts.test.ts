import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MEDIA_EXECUTION_POLICY,
  MEDIA_EXECUTION_MODES,
  type MediaExecutionPolicy,
} from '../src/api/media';
import type { ChatRunStatusResponse } from '../src/api/chat';

describe('media execution contracts', () => {
  it('keeps enabled as the default run policy', () => {
    expect(DEFAULT_MEDIA_EXECUTION_POLICY).toEqual({ mode: 'enabled' });
    expect(MEDIA_EXECUTION_MODES).toEqual(['enabled', 'disabled']);
  });

  it('allows run status responses to carry the effective media policy', () => {
    const mediaExecution: MediaExecutionPolicy = {
      mode: 'enabled',
      allowedSurfaces: ['image', 'video'],
    };
    const status: ChatRunStatusResponse = {
      id: 'run_1',
      projectId: 'project_1',
      conversationId: 'conversation_1',
      assistantMessageId: 'assistant_1',
      agentId: 'codex',
      status: 'queued',
      createdAt: 1,
      updatedAt: 1,
      mediaExecution,
    };

    expect(status.mediaExecution).toEqual(mediaExecution);
  });
});
