import { describe, expect, it } from 'vitest';

import {
  CHAT_RUN_STATUSES,
  DEFAULT_MEDIA_EXECUTION_POLICY,
  MEDIA_EXECUTION_MODES,
  MEDIA_POLICY_DENIAL_CODES,
  PROJECT_EXPORT_MANIFEST_SCHEMA,
  buildProjectRawFileUrl,
  exampleChatRunStatusResponse,
  exampleMediaExecutionDisabledErrorResponse,
  exampleProjectExportManifestResponse,
  exampleProjectRawPreviewUrl,
  mediaExecutionPolicyDenial,
  type MediaExecutionPolicy,
} from '../src/index';
import type { ChatRunStatusResponse } from '../src/api/chat';

describe('media execution contracts', () => {
  it('keeps enabled as the default run policy', () => {
    expect(DEFAULT_MEDIA_EXECUTION_POLICY).toEqual({ mode: 'enabled' });
    expect(MEDIA_EXECUTION_MODES).toEqual(['enabled', 'disabled']);
    expect(MEDIA_POLICY_DENIAL_CODES).toEqual([
      'MEDIA_EXECUTION_DISABLED',
      'MEDIA_SURFACE_DENIED',
      'MEDIA_MODEL_DENIED',
    ]);
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

  it('pins media denial envelopes in the contract layer', () => {
    expect(mediaExecutionPolicyDenial({ mode: 'disabled' }, {
      surface: 'image',
      model: 'gpt-image-2',
    })).toEqual({
      code: 'MEDIA_EXECUTION_DISABLED',
      message: 'media generation is disabled for this run',
    });
    expect(mediaExecutionPolicyDenial({
      mode: 'enabled',
      allowedSurfaces: ['video'],
    }, {
      surface: 'image',
      model: 'gpt-image-2',
    })).toEqual({
      code: 'MEDIA_SURFACE_DENIED',
      message: 'media surface "image" is not allowed for this run',
    });
    expect(mediaExecutionPolicyDenial({
      mode: 'enabled',
      allowedModels: ['gpt-image-2'],
    }, {
      surface: 'image',
      model: 'dall-e-3',
    })).toEqual({
      code: 'MEDIA_MODEL_DENIED',
      message: 'media model "dall-e-3" is not allowed for this run',
    });
    expect(exampleMediaExecutionDisabledErrorResponse).toEqual({
      error: {
        code: 'MEDIA_EXECUTION_DISABLED',
        message: 'media generation is disabled for this run',
        retryable: false,
      },
    });
  });

  it('pins run status, manifest, and raw preview URL examples', () => {
    expect(CHAT_RUN_STATUSES).toEqual(['queued', 'running', 'succeeded', 'failed', 'canceled']);
    expect(exampleChatRunStatusResponse).toMatchObject({
      id: 'run_1',
      projectId: 'project_1',
      conversationId: 'conversation_1',
      assistantMessageId: 'assistant_1',
      agentId: 'codex',
      status: 'succeeded',
      mediaExecution: { mode: 'enabled' },
      toolBundle: { mcpServers: [] },
    });
    expect(exampleChatRunStatusResponse.eventsLogPath).toBeNull();
    expect(exampleProjectExportManifestResponse.schema).toBe(PROJECT_EXPORT_MANIFEST_SCHEMA);
    expect(exampleProjectExportManifestResponse.files).toEqual([
      expect.objectContaining({
        name: 'index.html',
        included: true,
        role: 'entry',
        reasons: ['project-entry-file'],
      }),
    ]);
    expect(exampleProjectRawPreviewUrl).toBe(
      'http://127.0.0.1:17456/api/projects/project_1/raw/screens/main%20page.html',
    );
    expect(buildProjectRawFileUrl(
      'http://127.0.0.1:17456/',
      'project 1',
      'screens/main page.html',
    )).toBe('http://127.0.0.1:17456/api/projects/project%201/raw/screens/main%20page.html');
  });
});
