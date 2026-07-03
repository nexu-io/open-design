import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import packageJsonSource from '../package.json?raw';
import nextConfigSource from '../next.config.ts?raw';

const packageJson = JSON.parse(packageJsonSource) as {
  dependencies?: Record<string, string>;
};

function readSource(relativePath: string) {
  const filePath = fileURLToPath(new URL(`../${relativePath}`, import.meta.url));
  return existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
}

async function loadSentryModule() {
  const moduleUrl = new URL('../src/sentry.ts', import.meta.url);
  expect(existsSync(fileURLToPath(moduleUrl)), 'src/sentry.ts should exist').toBe(true);
  return import('../src/sentry');
}

describe('Sentry onboarding', () => {
  it('installs Next Sentry SDK and wraps the Next config for source maps', () => {
    expect(packageJson.dependencies?.['@sentry/nextjs']).toBeDefined();
    expect(nextConfigSource).toContain('@sentry/nextjs');
    expect(nextConfigSource).toContain('withSentryConfig');
    expect(nextConfigSource).toContain('process.env.SENTRY_ORG');
    expect(nextConfigSource).toContain('process.env.SENTRY_PROJECT');
    expect(nextConfigSource).not.toContain("|| 'zhenheai'");
    expect(nextConfigSource).not.toContain("|| 'open-design-web'");
    expect(nextConfigSource).toContain('widenClientFileUpload');
    expect(nextConfigSource).toContain('deleteSourcemapsAfterUpload');
  });

  it('declares browser, server, and edge Sentry init files', () => {
    const browserSource = readSource('instrumentation-client.ts');
    const instrumentationSource = readSource('instrumentation.ts');
    const serverSource = readSource('sentry.server.config.ts');
    const edgeSource = readSource('sentry.edge.config.ts');

    expect(browserSource).toContain('buildBrowserSentryOptions');
    expect(browserSource).toContain('process.env.NEXT_PUBLIC_SENTRY_DSN');
    expect(browserSource).toContain('buildBrowserSentryOptions({');
    expect(browserSource).toContain('captureRouterTransitionStart');
    expect(instrumentationSource).toContain('export async function register()');
    expect(instrumentationSource).toContain("await import('./sentry.server.config')");
    expect(instrumentationSource).toContain("await import('./sentry.edge.config')");
    expect(serverSource).toContain('buildServerSentryOptions');
    expect(edgeSource).toContain('buildServerSentryOptions');
  });

  it('builds safe browser options from public env variables', async () => {
    const { buildBrowserSentryOptions } = await loadSentryModule();

    const options = buildBrowserSentryOptions({
      NEXT_PUBLIC_SENTRY_DSN: 'https://public@example.ingest.sentry.io/2',
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: 'production',
      NEXT_PUBLIC_SENTRY_RELEASE: 'open-design-web@abc123',
      NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: '0.2',
    });

    expect(options).toMatchObject({
      dsn: 'https://public@example.ingest.sentry.io/2',
      enabled: true,
      environment: 'production',
      release: 'open-design-web@abc123',
      sendDefaultPii: false,
      tracesSampleRate: 0.2,
    });
    expect(options.beforeSend).toBeTypeOf('function');
  });

  it('builds safe server options from secret env variables', async () => {
    const { buildServerSentryOptions } = await loadSentryModule();

    const options = buildServerSentryOptions({
      SENTRY_DSN: 'https://public@example.ingest.sentry.io/3',
      SENTRY_ENVIRONMENT: 'production',
      SENTRY_RELEASE: 'open-design-web@abc123',
      SENTRY_TRACES_SAMPLE_RATE: '0.15',
    });

    expect(options).toMatchObject({
      dsn: 'https://public@example.ingest.sentry.io/3',
      enabled: true,
      environment: 'production',
      release: 'open-design-web@abc123',
      sendDefaultPii: false,
      tracesSampleRate: 0.15,
    });
    expect(options.beforeSend).toBeTypeOf('function');
  });

  it('scrubs request, extra, and user PII before web events leave the app', async () => {
    const { scrubSentryEvent } = await loadSentryModule();

    const scrubbed = scrubSentryEvent({
      request: {
        data: { prompt: 'private design prompt' },
        query_string: 'code=oauth-code&state=oauth-state',
        url: 'https://open-design.ai/api/mcp/oauth/callback?code=oauth-code&state=oauth-state#done',
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
          url: 'https://open-design.ai/api/mcp/oauth/callback?code=oauth-code&state=oauth-state#done',
          headers: {
            cookie: 'sid=secret',
            accept: 'application/json',
          },
          nested: { apiKey: 'secret', keep: 'ok' },
        },
      },
      user: {
        id: 'installation-1',
        email: 'user@example.com',
        username: 'person',
      },
    });

    expect(scrubbed.request?.url).toBe('https://open-design.ai/api/mcp/oauth/callback#done');
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
        url: 'https://open-design.ai/api/mcp/oauth/callback#done',
        headers: {
          cookie: '[Filtered]',
          accept: 'application/json',
        },
        nested: { apiKey: '[Filtered]', keep: 'ok' },
      },
    });
    expect(scrubbed.user).toEqual({ id: 'installation-1' });
  });
});
