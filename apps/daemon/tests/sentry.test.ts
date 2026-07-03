import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import packageJsonSource from '../package.json?raw';
import cliSource from '../src/cli.ts?raw';
import serverSource from '../src/server.ts?raw';
import sidecarSource from '../src/sidecar/index.ts?raw';

const packageJson = JSON.parse(packageJsonSource) as {
  dependencies?: Record<string, string>;
};

async function loadSentryModule() {
  const moduleUrl = new URL('../src/sentry.ts', import.meta.url);
  expect(existsSync(fileURLToPath(moduleUrl)), 'src/sentry.ts should exist').toBe(true);
  return import('../src/sentry.js');
}

describe('Sentry onboarding', () => {
  it('installs and initializes Sentry before the daemon starts', () => {
    expect(packageJson.dependencies?.['@sentry/node']).toBeDefined();
    expect(cliSource.indexOf("import './sentry-init.js';")).toBeGreaterThanOrEqual(0);
    expect(cliSource.indexOf("import './sentry-init.js';")).toBeLessThan(
      cliSource.indexOf("import { startServer } from './server.js';"),
    );
    const sidecarSentryImportIndex = sidecarSource.indexOf('sentry-init.js');
    expect(sidecarSentryImportIndex).toBeGreaterThanOrEqual(0);
    expect(sidecarSentryImportIndex).toBeLessThan(
      sidecarSource.indexOf('import { startDaemonSidecar } from "./server.js";'),
    );
  });

  it('registers Sentry Express error handling after routes and before listen', () => {
    expect(serverSource).toContain("import { setupSentryExpressErrorHandler } from './sentry.js';");
    expect(serverSource).toContain('setupSentryExpressErrorHandler(app);');
    expect(serverSource.indexOf('setupSentryExpressErrorHandler(app);')).toBeGreaterThan(
      serverSource.indexOf('registerChatRoutes(app, {'),
    );
    expect(serverSource.indexOf('setupSentryExpressErrorHandler(app);')).toBeLessThan(
      serverSource.indexOf('server = app.listen'),
    );
  });

  it('builds safe daemon options from environment variables', async () => {
    const { buildSentryOptions } = await loadSentryModule();

    const options = buildSentryOptions({
      SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
      SENTRY_ENVIRONMENT: 'production',
      SENTRY_RELEASE: 'open-design-daemon@abc123',
      SENTRY_TRACES_SAMPLE_RATE: '0.25',
    });

    expect(options).toMatchObject({
      dsn: 'https://public@example.ingest.sentry.io/1',
      enabled: true,
      environment: 'production',
      release: 'open-design-daemon@abc123',
      sendDefaultPii: false,
      tracesSampleRate: 0.25,
    });
    expect(options.beforeSend).toBeTypeOf('function');
    expect(options.beforeSendTransaction).toBeTypeOf('function');
  });

  it('disables Sentry when no DSN is configured', async () => {
    const { buildSentryOptions } = await loadSentryModule();

    const options = buildSentryOptions({
      SENTRY_ENVIRONMENT: 'production',
      SENTRY_TRACES_SAMPLE_RATE: '0.1',
    });

    expect(options.enabled).toBe(false);
    expect(options.dsn).toBeUndefined();
  });

  it('scrubs request, extra, spans, and user PII before daemon events leave the process', async () => {
    const { scrubSentryEvent } = await loadSentryModule();

    const scrubbed = scrubSentryEvent({
      request: {
        data: { prompt: 'private design prompt' },
        query_string: 'code=oauth-code&state=oauth-state',
        url: 'http://127.0.0.1:7456/api/mcp/oauth/callback?code=oauth-code&state=oauth-state#done',
        headers: {
          authorization: 'Bearer secret',
          cookie: 'sid=secret',
          'x-api-key': 'secret',
          accept: 'application/json',
        },
      },
      extra: {
        OPENAI_API_KEY: 'secret',
        nested: { token: 'secret', keep: 'ok' },
      },
      breadcrumbs: [
        {
          message: 'handled connector callback',
          data: {
            authorization: 'Bearer secret',
            nested: { token: 'secret', keep: 'ok' },
          },
        },
      ],
      tags: {
        feature: 'mcp',
        session_token: 'secret',
      },
      contexts: {
        oauth: {
          url: 'http://127.0.0.1:7456/api/mcp/oauth/callback?code=oauth-code&state=oauth-state#done',
          headers: {
            cookie: 'sid=secret',
            accept: 'application/json',
          },
          nested: { apiKey: 'secret', keep: 'ok' },
        },
      },
      spans: [
        {
          op: 'http.client',
          description: 'GET https://generativelanguage.googleapis.com/v1beta/models?key=provider-key',
          data: {
            'http.url': 'https://generativelanguage.googleapis.com/v1beta/models?key=provider-key',
            query_string: 'key=provider-key',
            nested: { apiKey: 'secret', keep: 'ok' },
          },
        },
      ],
      user: {
        id: 'installation-1',
        email: 'user@example.com',
        username: 'person',
      },
    } as any) as any;

    expect(scrubbed.request?.url).toBe('http://127.0.0.1:7456/api/mcp/oauth/callback#done');
    expect(scrubbed.request?.query_string).toBeUndefined();
    expect(scrubbed.request?.headers).toEqual({
      authorization: '[Filtered]',
      cookie: '[Filtered]',
      'x-api-key': '[Filtered]',
      accept: 'application/json',
    });
    expect(scrubbed.request?.data).toBeUndefined();
    expect(scrubbed.extra).toEqual({
      OPENAI_API_KEY: '[Filtered]',
      nested: { token: '[Filtered]', keep: 'ok' },
    });
    expect(scrubbed.breadcrumbs).toEqual([
      {
        message: 'handled connector callback',
        data: {
          authorization: '[Filtered]',
          nested: { token: '[Filtered]', keep: 'ok' },
        },
      },
    ]);
    expect(scrubbed.tags).toEqual({
      feature: 'mcp',
      session_token: '[Filtered]',
    });
    expect(scrubbed.contexts).toEqual({
      oauth: {
        url: 'http://127.0.0.1:7456/api/mcp/oauth/callback#done',
        headers: {
          cookie: '[Filtered]',
          accept: 'application/json',
        },
        nested: { apiKey: '[Filtered]', keep: 'ok' },
      },
    });
    expect(scrubbed.spans).toEqual([
      {
        op: 'http.client',
        description: 'GET https://generativelanguage.googleapis.com/v1beta/models',
        data: {
          'http.url': 'https://generativelanguage.googleapis.com/v1beta/models',
          query_string: '[Filtered]',
          nested: { apiKey: '[Filtered]', keep: 'ok' },
        },
      },
    ]);
    expect(scrubbed.user).toEqual({ id: 'installation-1' });
  });

  it('captures and flushes handled sidecar startup failures', async () => {
    const { captureStartupException } = await loadSentryModule();
    const error = new Error('sidecar boot failed');
    const sentry = {
      captureException: vi.fn(),
      flush: vi.fn().mockResolvedValue(true),
    };

    await captureStartupException(error, sentry);

    expect(sentry.captureException).toHaveBeenCalledWith(error);
    expect(sentry.flush).toHaveBeenCalledWith(2000);
    expect(sidecarSource).toContain('captureStartupException');
    expect(sidecarSource).toContain('await captureStartupException(error);');
  });

  it('initializes the SDK at most once', async () => {
    const { initSentryFromEnv } = await loadSentryModule();
    const sentry = { init: vi.fn() };

    expect(initSentryFromEnv({
      SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
      SENTRY_ENVIRONMENT: 'production',
    }, sentry)).toBe(true);
    expect(initSentryFromEnv({
      SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
      SENTRY_ENVIRONMENT: 'production',
    }, sentry)).toBe(false);
    expect(sentry.init).toHaveBeenCalledTimes(1);
  });
});
