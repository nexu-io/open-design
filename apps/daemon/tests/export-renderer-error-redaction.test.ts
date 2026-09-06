import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { describeDesktopRendererFailure } from '../src/import-export-routes.js';

/**
 * W84 ② — the daemon's own error was leaking an absolute socket path into the
 * model's context.
 *
 * The reported string was:
 *
 *   desktop renderer unavailable: connect ENOENT /tmp/open-design/ipc/chatnext/desktop.sock
 *
 * That is not an internal-only string. The prompt tells the model to render via
 * `"$OD_BIN" export … --format image`; `runExport` POSTs to
 * `/api/projects/:id/export/image`, and on a non-ok response the CLI writes the
 * daemon's `message` VERBATIM to stderr as JSON. So the agent reads the socket
 * path, and the only thing standing between it and the user's reply is the
 * prompt sentence W81 just rewrote. A prompt is a soft constraint; this is the
 * defence in depth behind it.
 *
 * Three things have to hold at once, and the third is the one that makes this
 * hard — redaction must not cost us anything we actually use:
 *
 *   1. no filesystem path / port / pid survives into the response message;
 *   2. the raw error still reaches the daemon log — and it is the ONLY copy.
 *      `sendApiError` does not log, `recordApiFailure` stores just
 *      {method, route, status, code} and drops the message entirely, and the
 *      sidecar's own `traceJsonIpc` is gated behind OD_JSON_IPC_TRACE. Redact
 *      without adding a log and the diagnostic is gone for good;
 *   3. the words web analytics buckets on stay intact.
 *      `apps/web/src/analytics/export-error-code.ts` classifies export failures
 *      by matching this very message: `unknown \w+ sidecar message` →
 *      DESKTOP_SIDECAR_UNKNOWN_MESSAGE (the daemon↔desktop version-skew
 *      signal), `renderer (is )?unavailable` → DESKTOP_RENDERER_UNAVAILABLE,
 *      `timed out` → TIMEOUT. Flattening the message to a fixed string would
 *      silently destroy the skew bucket.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROUTES = path.join(HERE, '../src/import-export-routes.ts');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('desktop renderer failure — what leaves the daemon', () => {
  it('drops the unix socket path from the message the agent reads', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const message = describeDesktopRendererFailure(
      new Error('connect ENOENT /tmp/open-design/ipc/chatnext/desktop.sock'),
    );
    expect(message).not.toContain('/tmp/open-design/ipc/chatnext/desktop.sock');
    expect(message).not.toContain('/tmp/');
    expect(message).not.toContain('.sock');
    // Positive half: the sentence still says what happened.
    expect(message).toContain('desktop renderer unavailable');
    expect(message).toContain('ENOENT');
  });

  it('keeps the raw path in the daemon log — the only copy of it', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    describeDesktopRendererFailure(
      new Error('connect ENOENT /tmp/open-design/ipc/chatnext/desktop.sock'),
    );
    const logged = spy.mock.calls.map((args) => args.join(' ')).join('\n');
    expect(logged).toContain('/tmp/open-design/ipc/chatnext/desktop.sock');
  });

  it('preserves the version-skew signature web analytics buckets on', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // New daemon, old desktop. This is the one failure mode on this path that
    // is worth telling apart from every other, and it carries no path.
    const message = describeDesktopRendererFailure(
      new Error('unknown desktop sidecar message: render-slides'),
    );
    expect(message).toMatch(/unknown \w+ sidecar message/i);
    expect(message).toContain('render-slides');
  });

  it('redacts the 600s IPC timeout, which leaks the same path by another route', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // packages/sidecar hand-builds `IPC request timed out: ${socketPath}`, so
    // fixing only the ENOENT wording would still leak on timeout.
    const message = describeDesktopRendererFailure(
      new Error('IPC request timed out: /tmp/open-design/ipc/chatnext/desktop.sock'),
    );
    expect(message).not.toContain('/tmp/');
    // TIMEOUT is a real analytics bucket; the words must survive.
    expect(message).toMatch(/timed\s*out/i);
  });

  it('redacts windows paths, loopback ports and pids too', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      describeDesktopRendererFailure(new Error(String.raw`connect ENOENT C:\Users\od\AppData\ipc\desktop.sock`)),
    ).not.toContain('C:\\Users');
    expect(
      describeDesktopRendererFailure(new Error('fetch failed to http://127.0.0.1:17456/render')),
    ).not.toContain('17456');
    expect(
      describeDesktopRendererFailure(new Error('renderer died, pid 48213')),
    ).not.toContain('48213');
  });

  it('is wired at both throw sites, with no raw splice left behind', () => {
    // Structural half. The helper is worthless if a call site still formats
    // its own message; both branches of handleScreenshotExport must route
    // through it.
    const source = readFileSync(ROUTES, 'utf8');
    expect(source).not.toContain('`desktop renderer unavailable: ${err?.message || String(err)}`');
    const wired = source.split('describeDesktopRendererFailure(err)').length - 1;
    expect(wired, 'both the artifact-exporter and slide-renderer branches').toBe(2);
  });

  it('does not touch the error code, which has consumers', () => {
    const source = readFileSync(ROUTES, 'utf8');
    // amr-guidance, ChatPane's agent-switch suppression, run-failure
    // classification and conversations.ts all branch on this code.
    expect(source).toContain("'UPSTREAM_UNAVAILABLE'");
  });
});
