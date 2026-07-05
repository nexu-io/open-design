/**
 * Coverage for the packaged main-process startup-failure telemetry
 * (apps/packaged/src/startup-telemetry.ts).
 *
 * Background: when the daemon dies before reporting status (issue #4638:
 * `better-sqlite3` vanished from the bundle → ERR_MODULE_NOT_FOUND), the
 * daemon/web sidecars — which host the PostHog client — never run, so the
 * whole crash class emits ZERO telemetry. This module emits one event from the
 * main process on the fatal-exit path. These tests pin three guarantees:
 *   1. it extracts the real error code / missing module from the #4638 log,
 *   2. it scrubs the user's home dir out of anything it sends,
 *   3. it can NEVER block the exit (timeout wins over a hung fetch) and is a
 *      no-op without a PostHog key.
 *
 * @see apps/packaged/src/startup-telemetry.ts
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  STARTUP_FAILURE_EVENT,
  captureStartupFailure,
  classifyStartupFailure,
  parseDaemonLogTail,
  reportStartupFailure,
  resolveStartupDistinctId,
  scrubUserPaths,
} from '../src/startup-telemetry.js';

// Verbatim daemon log tail from issue #4638.
const ISSUE_4638_LOG = `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'better-sqlite3' imported from /Applications/Open Design.app/Contents/Resources/app/prebundled/daemon/chunks/server-PULTSXNL.mjs
    at Object.getPackageJSONURL (node:internal/modules/package_json_reader:301:9)
[open-design packaged] exited app=daemon pid=45305 code=1 signal=none`;

// Verbatim shape of what waitForStatus throws (sidecars.ts:206-208).
const DAEMON_EXIT_MESSAGE =
  'daemon exited before reporting status (code=1, signal=none); see /Users/liudetao/Library/Application Support/Open Design/namespaces/release-stable/logs/daemon/latest.log for details';
const WEB_EXIT_MESSAGE =
  'daemon exited before reporting status (code=1, signal=none); see /Users/liudetao/Library/Application Support/Open Design/namespaces/release-stable/logs/web/latest.log for details';

describe('parseDaemonLogTail', () => {
  it('extracts the error code and missing module from the #4638 log', () => {
    expect(parseDaemonLogTail(ISSUE_4638_LOG)).toEqual({
      errorCode: 'ERR_MODULE_NOT_FOUND',
      missingModule: 'better-sqlite3',
    });
  });

  it('returns empty when the log carries no recognizable signal', () => {
    expect(parseDaemonLogTail('daemon started ok\nlistening on 17456')).toEqual({});
  });
});

describe('classifyStartupFailure', () => {
  it('classifies a daemon-start failure and pulls code/signal/logPath', () => {
    const c = classifyStartupFailure(new Error(DAEMON_EXIT_MESSAGE), false);
    expect(c.failureKind).toBe('daemon-start');
    expect(c.exitCode).toBe(1);
    expect(c.signal).toBeNull();
    expect(c.logPath).toContain('/logs/daemon/latest.log');
  });

  it('distinguishes a web-start failure by log-path segment, not message text', () => {
    // The thrown message still literally says "daemon" even for the web
    // sidecar; the log path is the only honest discriminator.
    const c = classifyStartupFailure(new Error(WEB_EXIT_MESSAGE), false);
    expect(c.failureKind).toBe('web-start');
  });

  it('classifies a Windows (backslash) web-start log path as web-start', () => {
    // startPackagedSidecars uses path.join, so on Windows the watched log path
    // is backslash-separated. A naive "/web/" check would misreport this as
    // daemon-start — the one platform split this field exists for.
    const winWebMessage =
      'daemon exited before reporting status (code=1, signal=none); see C:\\Users\\Alice\\AppData\\Roaming\\Open Design\\namespaces\\release-stable\\logs\\web\\latest.log for details';
    expect(classifyStartupFailure(new Error(winWebMessage), false).failureKind).toBe('web-start');
  });

  it('marks path-access failures without inventing a log path', () => {
    const c = classifyStartupFailure(new Error('whatever'), true);
    expect(c.failureKind).toBe('path-access');
    expect(c.logPath).toBeNull();
  });

  it('falls back to unknown for an unrecognized error', () => {
    expect(classifyStartupFailure(new Error('boom'), false).failureKind).toBe('unknown');
  });
});

describe('scrubUserPaths', () => {
  it('redacts the user home directory but keeps the rest of the path', () => {
    const scrubbed = scrubUserPaths(
      '/Users/liudetao/Library/Application Support/Open Design/namespaces/release-stable/logs/daemon/latest.log',
    );
    expect(scrubbed).not.toContain('liudetao');
    expect(scrubbed).toContain('/Users/<redacted>/Library/Application Support');
  });

  it('redacts Windows user dirs too', () => {
    expect(scrubUserPaths('C:\\Users\\Alice\\AppData\\Roaming')).toBe(
      'C:\\Users\\<redacted>\\AppData\\Roaming',
    );
  });
});

describe('resolveStartupDistinctId', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
    delete process.env.OD_INSTALLATION_DIR;
  });

  it('reads installationId from an explicit installationRoot (not the child-only env)', () => {
    const root = mkdtempSync(join(tmpdir(), 'od-install-'));
    dirs.push(root);
    writeFileSync(join(root, 'installation.json'), JSON.stringify({ installationId: 'inst-abc' }));
    // env is intentionally unset — proving the parent process resolves via the
    // explicit arg, the bug PerishCode flagged.
    expect(resolveStartupDistinctId('release-stable', root)).toBe('inst-abc');
  });

  it('falls back to a synthetic per-namespace id when no installation file exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'od-install-'));
    dirs.push(root);
    expect(resolveStartupDistinctId('release-stable', root)).toBe('packaged-release-stable');
  });
});

describe('captureStartupFailure', () => {
  it('is a no-op (zero network) without a PostHog key', async () => {
    const fetchImpl = vi.fn();
    await captureStartupFailure(
      { posthogKey: null, posthogHost: null, distinctId: 'd', event: 'e', properties: {} },
      { fetchImpl: fetchImpl as unknown as typeof fetch },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('POSTs to /capture/ with the PostHog wire shape', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('ok'));
    await captureStartupFailure(
      {
        posthogKey: 'phc_test',
        posthogHost: 'https://us.i.posthog.com',
        distinctId: 'install-123',
        event: STARTUP_FAILURE_EVENT,
        properties: { failure_kind: 'daemon-start' },
      },
      { fetchImpl: fetchImpl as unknown as typeof fetch, now: () => '2026-06-23T00:00:00.000Z' },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://us.i.posthog.com/capture/');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.api_key).toBe('phc_test');
    expect(body.event).toBe(STARTUP_FAILURE_EVENT);
    expect(body.distinct_id).toBe('install-123');
    expect((body.properties as Record<string, unknown>).failure_kind).toBe('daemon-start');
    expect((body.properties as Record<string, unknown>).$os).toBeDefined();
  });

  it('stamps the shared safety-event envelope so dashboards bucket it', async () => {
    // Mirrors captureSafety in apps/daemon/src/analytics.ts. Without these,
    // env/schema-filtered dashboards miss or mis-bucket the event even though
    // PostHog accepts the raw payload (PerishCode review on #4696).
    const fetchImpl = vi.fn().mockResolvedValue(new Response('ok'));
    await captureStartupFailure(
      {
        posthogKey: 'phc_test',
        posthogHost: null,
        distinctId: 'install-123',
        event: STARTUP_FAILURE_EVENT,
        properties: { failure_kind: 'daemon-start', app_version: '0.11.0' },
      },
      {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        now: () => '2026-06-23T00:00:00.000Z',
        insertId: 'ins-fixed',
      },
    );
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const p = (JSON.parse(init.body as string) as { properties: Record<string, unknown> })
      .properties;
    expect(p.event_schema_version).toBe(2);
    expect(p.device_id).toBe('install-123');
    expect(p.client_type).toBe('packaged_main');
    expect(p.capture_source).toBe('packaged/startup');
    expect(p.ui_version).toBe('0.11.0');
    expect(p.event_id).toBe('ins-fixed');
    expect(p.$insert_id).toBe('ins-fixed');
    expect(typeof p.env).toBe('string');
  });

  it('never blocks past the timeout even if fetch hangs forever', async () => {
    // The critical guarantee for "no startup side-effect": a hung (offline)
    // request must not wedge the exit. Race must resolve via the timeout.
    const hung = new Promise<Response>(() => {
      /* never resolves */
    });
    const fetchImpl = vi.fn().mockReturnValue(hung);
    const start = Date.now();
    await captureStartupFailure(
      { posthogKey: 'phc_test', posthogHost: null, distinctId: 'd', event: 'e', properties: {} },
      { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 30 },
    );
    expect(Date.now() - start).toBeLessThan(2000);
  });

  it('swallows a fetch that throws (analytics failure is not a product error)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(
      captureStartupFailure(
        { posthogKey: 'phc_test', posthogHost: null, distinctId: 'd', event: 'e', properties: {} },
        { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 50 },
      ),
    ).resolves.toBeUndefined();
  });
});

describe('reportStartupFailure', () => {
  it('reads the log tail, enriches the event, scrubs paths, and sends once', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('ok'));
    await reportStartupFailure(
      {
        error: new Error(DAEMON_EXIT_MESSAGE),
        isPathAccess: false,
        posthogKey: 'phc_test',
        posthogHost: null,
        distinctId: 'install-123',
        appVersion: '0.11.0',
        namespace: 'release-stable',
        source: 'packaged',
      },
      {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        readLogTail: async () => ISSUE_4638_LOG,
        now: () => '2026-06-23T00:00:00.000Z',
      },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const props = (JSON.parse(init.body as string) as { properties: Record<string, unknown> })
      .properties;
    expect(props.failure_kind).toBe('daemon-start');
    expect(props.error_code).toBe('ERR_MODULE_NOT_FOUND');
    expect(props.missing_module).toBe('better-sqlite3');
    expect(props.app_version).toBe('0.11.0');
    expect(props.exit_code).toBe(1);
    expect(props.log_path).not.toContain('liudetao');
  });

  it('never throws even when the log read blows up', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('ok'));
    await expect(
      reportStartupFailure(
        {
          error: new Error(DAEMON_EXIT_MESSAGE),
          isPathAccess: false,
          posthogKey: 'phc_test',
          posthogHost: null,
          distinctId: 'd',
          appVersion: '0.11.0',
          namespace: 'release-stable',
          source: 'packaged',
        },
        {
          fetchImpl: fetchImpl as unknown as typeof fetch,
          readLogTail: async () => {
            throw new Error('disk gone');
          },
        },
      ),
    ).resolves.toBeUndefined();
  });

  it('is a no-op without a PostHog key (fork builds)', async () => {
    const fetchImpl = vi.fn();
    await reportStartupFailure(
      {
        error: new Error(DAEMON_EXIT_MESSAGE),
        isPathAccess: false,
        posthogKey: null,
        posthogHost: null,
        distinctId: 'd',
        appVersion: '0.11.0',
        namespace: 'release-stable',
        source: 'packaged',
      },
      { fetchImpl: fetchImpl as unknown as typeof fetch, readLogTail: async () => ISSUE_4638_LOG },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
