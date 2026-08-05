import { describe, expect, it } from 'vitest';
import {
  createPublicBaseUrlResolver,
  resolvePublicBaseUrl,
} from '../../src/runtimes/public-base-url.js';

function request(protocol = 'http', host?: string) {
  return { protocol, get: () => host };
}

describe('public base URL boundary', () => {
  it('prefers a valid configured origin and removes trailing slashes', () => {
    expect(resolvePublicBaseUrl(request(), {
      configuredBaseUrl: 'https://studio.example.test///',
      fallbackPort: '9999',
    })).toBe('https://studio.example.test');
  });

  it('derives the origin from the request when configuration is absent or invalid', () => {
    expect(resolvePublicBaseUrl(request('https', 'studio.example.test'), {
      configuredBaseUrl: 'not-an-origin',
    })).toBe('https://studio.example.test');
    expect(resolvePublicBaseUrl(request('https', 'studio.example.test'), {
      configuredBaseUrl: 'ftp://studio.example.test',
    })).toBe('https://studio.example.test');
  });

  it('uses the configured port only when the request has no host', () => {
    expect(resolvePublicBaseUrl(request(), { fallbackPort: '8123' }))
      .toBe('http://localhost:8123');
    expect(resolvePublicBaseUrl(request(), { fallbackPort: 8123 }))
      .toBe('http://localhost:7456');
  });

  it('creates a reusable resolver with fixed deployment configuration', () => {
    const resolve = createPublicBaseUrlResolver({
      configuredBaseUrl: 'https://configured.example.test/',
      fallbackPort: '8123',
    });
    expect(resolve(request('http', 'request.example.test')))
      .toBe('https://configured.example.test');
  });
});
