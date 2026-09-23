import { describe, expect, it } from 'vitest';
import { isAzureOpenAIHostname } from '../src/integrations/openai-chat-token-params.js';

describe('isAzureOpenAIHostname', () => {
  it.each([
    'resource.openai.azure.com',
    'resource.services.ai.azure.com',
    'resource.cognitiveservices.azure.com',
    'RESOURCE.SERVICES.AI.AZURE.COM.',
  ])('recognizes Azure OpenAI-compatible host %s', (hostname) => {
    expect(isAzureOpenAIHostname(hostname)).toBe(true);
  });

  it.each([
    'api.openai.com',
    'services.ai.azure.com.evil.example',
    'notservices.ai.azure.com',
  ])('rejects non-Azure host %s', (hostname) => {
    expect(isAzureOpenAIHostname(hostname)).toBe(false);
  });
});
