import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import {
  CHAT_SCROLL_FORENSICS_SUMMARY_FILE,
  NO_RENDERER_CAPTURE_NOTE,
  buildChatScrollForensicsSummary,
  chatScrollForensicsHandler,
  clearStoredChatScrollForensics,
  readStoredChatScrollForensics,
  storeChatScrollForensics,
} from '../src/diagnostics-client-evidence.js';
import { createDiagnosticsExportHandler } from '../src/diagnostics-export.js';

/**
 * Why this file exists
 * --------------------
 * The chat scroll freeze lives entirely in the renderer — DOM, computed styles,
 * running animations, the freeze probe's own state — and none of it is on disk,
 * so the daemon cannot collect it the way it collects logs. Both export paths
 * (browser download and the packaged app's native save dialog) reach the daemon
 * as a bodyless GET, so the only shape that carries renderer evidence into the
 * zip for BOTH is a rendezvous: the web app posts the scene first, this daemon
 * holds it, and the export drains it.
 *
 * These specs pin the two halves of that rendezvous, plus the thing that makes
 * a bundle readable months later: when nothing was posted, the zip must SAY so
 * in words rather than quietly omit a file.
 */

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

interface ForensicsSummaryFile {
  captured: boolean;
  receivedAtIso: string | null;
  note: string;
  evidence: unknown;
  app: {
    version: string | null;
    channel: string | null;
    packaged: boolean | null;
    platform: string | null;
    arch: string | null;
  };
}

async function exportSummary(): Promise<ForensicsSummaryFile> {
  const handler = createDiagnosticsExportHandler({
    runtime: null,
    projectRoot: '/tmp/chat-scroll-forensics-project',
  });
  const res = mockResponse();
  await handler({} as never, res as never, () => undefined);
  expect(res.capturedStatus).toBe(200);
  const zip = await JSZip.loadAsync(res.capturedPayload!);
  const entry = zip.file(`summary/${CHAT_SCROLL_FORENSICS_SUMMARY_FILE}`);
  expect(entry).not.toBeNull();
  return JSON.parse(await entry!.async('string')) as ForensicsSummaryFile;
}

beforeEach(() => {
  clearStoredChatScrollForensics();
});

afterEach(() => {
  clearStoredChatScrollForensics();
});

describe('the renderer hand-off endpoint', () => {
  it('stores the posted capture and acknowledges when it landed', () => {
    const res = mockResponse();

    chatScrollForensicsHandler(
      { body: { version: 1, live: { available: true } } } as never,
      res as never,
      () => undefined,
    );

    expect(res.capturedJson).toMatchObject({ ok: true, receivedAtIso: expect.any(String) });
    expect(readStoredChatScrollForensics()?.payload).toMatchObject({
      version: 1,
      live: { available: true },
    });
  });

  it('rejects a body that is not a JSON object', () => {
    const res = mockResponse();

    chatScrollForensicsHandler({ body: 'not-json' } as never, res as never, () => undefined);

    expect(res.capturedStatus).toBe(400);
    expect(res.capturedJson).toMatchObject({ error: 'INVALID_CHAT_SCROLL_FORENSICS' });
    expect(readStoredChatScrollForensics()).toBeNull();
  });

  it('keeps the latest capture, because the newest incident is the one being exported', () => {
    storeChatScrollForensics({ generation: 'first' });
    storeChatScrollForensics({ generation: 'second' });

    expect(readStoredChatScrollForensics()?.payload).toMatchObject({ generation: 'second' });
  });
});

describe('the summary written into the zip', () => {
  it('carries the posted capture verbatim', async () => {
    storeChatScrollForensics({
      version: 1,
      live: {
        available: true,
        forensics: {
          dom: { captured: true, outerHTML: '<div data-testid="chat-log">hi</div>' },
          assignment: { performed: true, verdict: 'assignment_reached_layout_max' },
        },
      },
    });

    const summary = await exportSummary();

    expect(summary.captured).toBe(true);
    expect(summary.receivedAtIso).toEqual(expect.any(String));
    expect(summary.evidence).toMatchObject({
      live: {
        forensics: {
          dom: { outerHTML: '<div data-testid="chat-log">hi</div>' },
          assignment: { verdict: 'assignment_reached_layout_max' },
        },
      },
    });
  });

  it('stamps the daemon-authoritative app identity next to the renderer scene', async () => {
    storeChatScrollForensics({ version: 1 });

    const summary = await exportSummary();

    // The renderer has no build identity of its own; this block is what makes
    // the file self-contained instead of forcing a hop to manifest.json.
    expect(summary.app).toMatchObject({
      version: expect.any(String),
      channel: expect.any(String),
      packaged: expect.any(Boolean),
      platform: expect.any(String),
      arch: expect.any(String),
    });
  });

  it('is present and self-explaining when no renderer ever posted one', async () => {
    const summary = await exportSummary();

    expect(summary.captured).toBe(false);
    expect(summary.evidence).toBeNull();
    expect(summary.note).toBe(NO_RENDERER_CAPTURE_NOTE);
    // The note has to name the remedy, or the reader of an empty bundle has
    // nothing to act on.
    expect(summary.note).toMatch(/Export logs/);
  });

  it('answers the same way through buildChatScrollForensicsSummary directly', () => {
    expect(buildChatScrollForensicsSummary()).toMatchObject({
      captured: false,
      receivedAtIso: null,
      evidence: null,
    });

    storeChatScrollForensics({ marker: true });

    expect(buildChatScrollForensicsSummary()).toMatchObject({
      captured: true,
      evidence: { marker: true },
    });
  });
});
