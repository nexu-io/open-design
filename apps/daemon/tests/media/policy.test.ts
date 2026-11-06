import { describe, expect, it } from 'vitest';

import {
  defaultMediaExecutionPolicy,
  mediaPolicyDenial,
  normalizeMediaExecutionPolicyForRun,
  parseMediaExecutionPolicyInput,
} from '../../src/media/policy.js';

describe('media execution policy parsing', () => {
  it('defaults omitted policy to enabled', () => {
    expect(parseMediaExecutionPolicyInput(undefined)).toEqual({
      ok: true,
      policy: { mode: 'enabled' },
    });
    expect(defaultMediaExecutionPolicy()).toEqual({ mode: 'enabled' });
  });

  it('normalizes allowed surfaces and models', () => {
    expect(parseMediaExecutionPolicyInput({
      mode: 'enabled',
      allowedSurfaces: ['image', 'video', 'image'],
      allowedModels: [' gpt-image-2 ', 'gpt-image-2', 'video-model'],
    })).toEqual({
      ok: true,
      policy: {
        mode: 'enabled',
        allowedSurfaces: ['image', 'video'],
        allowedModels: ['gpt-image-2', 'video-model'],
      },
    });
  });

  it('rejects invalid modes and surfaces', () => {
    expect(parseMediaExecutionPolicyInput({ mode: 'provider-router' })).toMatchObject({
      ok: false,
      message: expect.stringContaining('mediaExecution.mode'),
    });
    expect(parseMediaExecutionPolicyInput({
      mode: 'enabled',
      allowedSurfaces: ['image', 'text'],
    })).toMatchObject({
      ok: false,
      message: expect.stringContaining('allowedSurfaces'),
    });
  });

  it('falls back to enabled when normalizing invalid direct run-service input', () => {
    expect(normalizeMediaExecutionPolicyForRun({ mode: 'bad' })).toEqual({
      mode: 'enabled',
    });
  });

  it('denies disabled runs and allowlist mismatches', () => {
    expect(mediaPolicyDenial({ mode: 'disabled' }, {
      surface: 'image',
      model: 'gpt-image-2',
    })).toMatchObject({ code: 'MEDIA_EXECUTION_DISABLED' });
    expect(mediaPolicyDenial({
      mode: 'enabled',
      allowedSurfaces: ['video'],
    }, {
      surface: 'image',
      model: 'gpt-image-2',
    })).toMatchObject({ code: 'MEDIA_SURFACE_DENIED' });
    expect(mediaPolicyDenial({
      mode: 'enabled',
      allowedModels: ['gpt-image-2'],
    }, {
      surface: 'image',
      model: 'dall-e-3',
    })).toMatchObject({ code: 'MEDIA_MODEL_DENIED' });
  });
});
