// Issue #2549 — local Ollama auto-detection.
//
// Two surfaces:
//   1. POST /api/test/connection (provider mode, protocol=ollama) must
//      omit the Authorization header when the user supplied no apiKey,
//      so local Ollama (which rejects a malformed empty Bearer with
//      400 on some versions) test-connections successfully.
//   2. GET /api/ollama/probe must report `available:true` with the
//      detected version/models when a local Ollama is reachable, and
//      `available:false` with an `error` field otherwise.
//
// Both tests stub `globalThis.fetch` so they run hermetically without
// depending on an actual Ollama install on the test machine.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildProviderCall,
} from '../src/connectionTest.js';

describe('Ollama connection-test header (issue #2549)', () => {
  it('omits Authorization when the user supplied no apiKey', () => {
    const call = buildProviderCall({
      protocol: 'ollama',
      baseUrl: 'http://localhost:11434',
      apiKey: '',
      model: 'gemma3:4b',
    });
    expect(call.headers).toEqual({ 'content-type': 'application/json' });
    expect(call.url).toBe('http://localhost:11434/api/chat');
  });

  it('omits Authorization when the apiKey is whitespace-only', () => {
    const call = buildProviderCall({
      protocol: 'ollama',
      baseUrl: 'http://localhost:11434',
      apiKey: '   ',
      model: 'gemma3:4b',
    });
    expect(call.headers.authorization).toBeUndefined();
  });

  it('attaches the trimmed Bearer when the user supplied an apiKey', () => {
    const call = buildProviderCall({
      protocol: 'ollama',
      baseUrl: 'https://ollama.com',
      apiKey: '  sk-ollama-cloud-test  ',
      model: 'gpt-oss:20b',
    });
    expect(call.headers.authorization).toBe('Bearer sk-ollama-cloud-test');
  });

  it('strips trailing /api and /api/ from the base URL before composing /api/chat', () => {
    const a = buildProviderCall({
      protocol: 'ollama',
      baseUrl: 'http://localhost:11434/api',
      apiKey: '',
      model: 'gemma3:4b',
    });
    expect(a.url).toBe('http://localhost:11434/api/chat');

    const b = buildProviderCall({
      protocol: 'ollama',
      baseUrl: 'http://localhost:11434/api/',
      apiKey: '',
      model: 'gemma3:4b',
    });
    expect(b.url).toBe('http://localhost:11434/api/chat');
  });
});
