import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import {
  STANDALONE_LAUNCH_WARNING,
  createDiagnosticsExportHandler,
} from '../src/diagnostics-export.js';

interface MockResponse {
  status(code: number): MockResponse;
  setHeader(name: string, value: string): MockResponse;
  end(payload: Buffer): void;
  json(payload: unknown): void;
  capturedStatus?: number;
  capturedPayload?: Buffer;
  capturedJson?: unknown;
}

function mockResponse(): MockResponse {
  const res: MockResponse = {
    status(code) { res.capturedStatus = code; return res; },
    setHeader() { return res; },
    end(payload) { res.capturedPayload = payload; },
    json(payload) { res.capturedJson = payload; },
  };
  return res;
}

describe('diagnostics export handler — non-sidecar launch', () => {
  // Reviewer-requested regression spec: `runDaemonCliStartup()` calls
  // `startDaemonRuntime()` without a runtime context, so plain `od` users
  // hit the diagnostics handler with `options.runtime == null`. The bundle
  // must still produce a valid zip AND surface a manifest warning that
  // file-based logs were not captured, so the operator can tell the
  // diff between "no logs because plain launch" and "no logs because
  // something genuinely broke."
  it('emits a standalone-launch warning when runtime is null', async () => {
    const handler = createDiagnosticsExportHandler({ runtime: null, projectRoot: '/tmp/test-project' });
    const res = mockResponse();
    // Express RequestHandler signature wants three args; the handler only
    // reads `res`, so casting through `unknown` keeps the test focused.
    await handler({} as never, res as never, () => undefined);

    expect(res.capturedStatus).toBe(200);
    expect(res.capturedPayload).toBeInstanceOf(Buffer);
    const zip = await JSZip.loadAsync(res.capturedPayload!);
    const manifestRaw = await zip.file('summary/manifest.json')!.async('string');
    const manifest = JSON.parse(manifestRaw) as { warnings: string[]; files: unknown[] };
    expect(manifest.warnings).toContain(STANDALONE_LAUNCH_WARNING);
    expect(manifest.files).toEqual([]);
  });
});
