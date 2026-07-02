import { describe, expect, it } from 'vitest';

import packageJsonSource from '../package.json?raw';
import source from '../src/index.ts?raw';
import wranglerSource from '../wrangler.toml?raw';
import { buildSentryOptions, scrubSentryEvent } from '../src/index';

const packageJson = JSON.parse(packageJsonSource) as {
  dependencies?: Record<string, string>;
};

describe('Sentry onboarding', () => {
  it('installs and wraps the Cloudflare worker with Sentry', () => {
    expect(packageJson.dependencies?.['@sentry/cloudflare']).toBeDefined();
    expect(source).toContain("@sentry/cloudflare");
    expect(source).toContain('Sentry.withSentry');
    expect(source).toContain('buildSentryOptions');
    expect(source).toContain('httpServerIntegration');
    expect(source).toContain("maxRequestBodySize: 'none'");
  });

  it('declares only non-secret Sentry vars in Wrangler config', () => {
    expect(wranglerSource).toContain('compatibility_flags = ["nodejs_compat"]');
    expect(wranglerSource).toContain('SENTRY_ENVIRONMENT = "production"');
    expect(wranglerSource).toContain('SENTRY_TRACES_SAMPLE_RATE = "0.1"');
    expect(wranglerSource).not.toContain('SENTRY_DSN');
  });

  it('builds safe options from Worker secrets', () => {
    const options = buildSentryOptions({
      SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
      SENTRY_ENVIRONMENT: 'production',
      SENTRY_RELEASE: 'open-design-telemetry@abc123',
      SENTRY_TRACES_SAMPLE_RATE: '0.25',
    });

    expect(options).toMatchObject({
      dsn: 'https://public@example.ingest.sentry.io/1',
      enabled: true,
      environment: 'production',
      release: 'open-design-telemetry@abc123',
      sendDefaultPii: false,
      tracesSampleRate: 0.25,
    });
    expect(options.beforeSend).toBeTypeOf('function');
  });

  it('disables the SDK when no DSN secret is configured', () => {
    const options = buildSentryOptions({
      SENTRY_ENVIRONMENT: 'production',
      SENTRY_TRACES_SAMPLE_RATE: '0.1',
    });

    expect(options.enabled).toBe(false);
    expect(options.dsn).toBeUndefined();
  });

  it('scrubs request, extra, and user PII before events leave the relay', () => {
    const scrubbed = scrubSentryEvent({
      request: {
        data: {
          batch: [{ body: { prompt: 'private prompt' } }],
        },
        headers: {
          authorization: 'Bearer secret',
          cookie: 'sid=secret',
          'x-api-key': 'secret',
          accept: 'application/json',
        },
      },
      extra: {
        LANGFUSE_SECRET_KEY: 'secret',
        nested: { token: 'secret', keep: 'ok' },
      },
      user: {
        id: 'installation-1',
        email: 'user@example.com',
        username: 'person',
      },
    });

    expect(scrubbed.request?.headers).toEqual({
      authorization: '[Filtered]',
      cookie: '[Filtered]',
      'x-api-key': '[Filtered]',
      accept: 'application/json',
    });
    expect(scrubbed.request?.data).toBeUndefined();
    expect(scrubbed.extra).toEqual({
      LANGFUSE_SECRET_KEY: '[Filtered]',
      nested: { token: '[Filtered]', keep: 'ok' },
    });
    expect(scrubbed.user).toEqual({ id: 'installation-1' });
  });
});
