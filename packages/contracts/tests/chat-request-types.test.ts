import { describe, expect, it } from 'vitest';

import type { ChatRequest } from '../src/api/chat.js';

describe('ChatRequest BYOK credential boundary', () => {
  it('keeps deployment selection out of the run-scoped provider object', () => {
    const userProvider: NonNullable<ChatRequest['byokProvider']> = {
      protocol: 'openai',
      apiKey: 'run-scoped-secret',
    };

    const nestedDeployment: NonNullable<ChatRequest['byokProvider']> = {
      protocol: 'openai',
      // @ts-expect-error Deployment selection belongs in byokCredentialSource.
      credentialSource: 'deployment',
    };

    expect(userProvider.credentialSource).toBeUndefined();
    expect(nestedDeployment.credentialSource).toBe('deployment');
  });
});
