import { createServer } from 'node:http';
import { createServer as createTcpServer, type Socket } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { fetchVelaWorkspaceDirectory } from '../../src/collab/vela-workspace-context.js';
import { configureDiagnosticsEvidence, getDiagnosticsEvidence } from '../../src/services/diagnostics-evidence.js';
import { beginWorkspaceRequestEvidence } from '../../src/services/workspace-request-evidence.js';

const cleanups: Array<() => Promise<unknown>> = [];
async function collectRequests() {
  const directory = await mkdtemp(join(tmpdir(), 'od-request-evidence-'));
  cleanups.push(() => rm(directory, { force: true, recursive: true }));
  configureDiagnosticsEvidence(directory);
  return getDiagnosticsEvidence()!;
}
function session(apiUrl: string) {
  return { profile: 'prod', apiUrl, controlKey: 'private-control-key', user: null, configMtimeMs: null };
}
afterEach(async () => {
  getDiagnosticsEvidence()?.close();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

it('exports the actual request timings and transport phase without exporting its credential', async () => {
  await collectRequests();
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'x-request-id': 'request-123', 'cf-ray': '1234567890abcdef-ABC' });
    res.end(JSON.stringify({ items: [] }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close(error => error ? reject(error) : resolve());
  }));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing server address');
  await expect(fetchVelaWorkspaceDirectory({
    readSession: () => session(`http://localhost:${address.port}`),
  })).resolves.toEqual({ ok: true, items: [] });
  const snapshot = getDiagnosticsEvidence()!.snapshot();
  expect(snapshot).toHaveProperty('directoryRequests', [expect.objectContaining({
    outcome: 'success', phase: 'complete', status: 200, requestId: 'request-123', cfRay: '1234567890abcdef-ABC',
    elapsedMs: expect.any(Number), dnsMs: expect.any(Number), tcpMs: expect.any(Number),
    headersSentMs: expect.any(Number), responseHeadersMs: expect.any(Number),
  })]);
  expect(JSON.stringify(snapshot)).not.toContain('private-control-key');
});

// These short deadlines exercise actual sockets and native Undici callbacks;
// fake timers would merge the network phases this evidence must distinguish.
it.each(['response_headers', 'response_body', 'json'] as const)('distinguishes %s failure on a real HTTP request', async phase => {
  const evidence = await collectRequests();
  const server = createServer((_req, res) => {
    if (phase === 'response_headers') return;
    res.writeHead(200, { 'content-type': 'application/json' });
    if (phase === 'json') res.end('private-response-is-not-json');
    else { res.flushHeaders(); res.write('{'); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close(error => error ? reject(error) : resolve());
  }));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing server address');
  expect(await fetchVelaWorkspaceDirectory({ readSession: () => session(`http://127.0.0.1:${address.port}`), timeoutMs: 80 }))
    .toMatchObject({ ok: false });
  const requests = evidence.snapshot().directoryRequests;
  expect(requests).toHaveLength(phase === 'json' ? 1 : 2);
  expect(requests.every(row => row.phase === phase)).toBe(true);
  expect(requests[0]?.headersSentMs).not.toBeNull();
  if (phase === 'response_headers') expect(requests[0]?.responseHeadersMs).toBeNull();
  else expect(requests[0]?.responseHeadersMs).not.toBeNull();
  expect(requests[0]?.outcome).toBe(phase === 'json' ? 'invalid_json' : 'timeout');
  expect(JSON.stringify(requests)).not.toContain('private-response');
});

it('identifies a TLS handshake stall after TCP connects', async () => {
  const evidence = await collectRequests();
  const sockets = new Set<Socket>();
  // Accept TCP but deliberately never reply to the TLS ClientHello.
  const server = createTcpServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise<void>((resolve, reject) => {
    for (const socket of sockets) socket.destroy();
    server.close(error => error ? reject(error) : resolve());
  }));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing server address');
  await fetchVelaWorkspaceDirectory({ readSession: () => session(`https://127.0.0.1:${address.port}`), timeoutMs: 80 });
  expect(evidence.snapshot().directoryRequests).toEqual([
    expect.objectContaining({ outcome: 'timeout', phase: 'tls', tcpMs: expect.any(Number), tlsMs: null, headersSentMs: null }),
    expect.objectContaining({ outcome: 'timeout', phase: 'tls', tcpMs: expect.any(Number), tlsMs: null, headersSentMs: null }),
  ]);
});

it('records a delayed deadline separately from the configured timeout', () => {
  let now = 0;
  const record = vi.fn();
  const trace = beginWorkspaceRequestEvidence({ apiUrl: 'https://authority.example', timeoutMs: 8_000, now: () => now, record });
  now = 20_000;
  trace.deadline();
  trace.failed(new Error('private-error'), true);
  trace.finish();
  expect(record).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 8_000, elapsedMs: 20_000, deadlineOverrunMs: 12_000, outcome: 'timeout' }));
  expect(JSON.stringify(record.mock.calls)).not.toContain('private-error');
});

it('keeps native observers active until the last concurrent trace finishes', async () => {
  const evidence = await collectRequests();
  const server = createServer((_req, res) => res.end('{"items":[]}'));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(() => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close(error => error ? reject(error) : resolve());
  }));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing server address');
  const apiUrl = `http://127.0.0.1:${address.port}`;
  const record = vi.fn();
  const overlapping = beginWorkspaceRequestEvidence({ apiUrl, timeoutMs: 8_000, record });
  try {
    await fetchVelaWorkspaceDirectory({ readSession: () => session(apiUrl) });
    expect(evidence.snapshot().directoryRequests[0]?.headersSentMs).not.toBeNull();
    const response = await overlapping.run(() => fetch(`${apiUrl}/api/v1/workspaces`));
    overlapping.headers(response);
    await response.json();
    overlapping.parsed();
    overlapping.outcome('success');
  } finally { overlapping.finish(); }
  expect(record).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'success', headersSentMs: expect.any(Number), reusedSocket: expect.any(Boolean) }));
});

it('exports only bounded known network codes, never error messages or arbitrary properties', () => {
  const record = vi.fn();
  const trace = beginWorkspaceRequestEvidence({ apiUrl: 'https://private-host.example', timeoutMs: 8_000, record });
  trace.failed(new TypeError('private-message', { cause: new AggregateError([
    Object.assign(new Error('private-connect-message'), { code: 'ECONNRESET', address: 'private-address' }),
    { code: 'ENETUNREACH' }, { code: 'private-code' },
  ]) }), false);
  trace.finish();
  expect(record.mock.calls[0]?.[0].errorCodes).toEqual(['ECONNRESET', 'ENETUNREACH']);
  expect(JSON.stringify(record.mock.calls)).not.toContain('private-');
});

it('does not change the business result if recording fails, and caps the request ring', async () => {
  const evidence = await collectRequests();
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => Response.json({ items: [] }));
  for (let i = 0; i < 55; i++) await fetchVelaWorkspaceDirectory({ readSession: () => session('https://private-api.example'), fetch });
  expect(evidence.snapshot().directoryRequests).toHaveLength(50);
  const broken = vi.spyOn(evidence, 'recordDirectoryRequest').mockImplementation(() => { throw new Error('disk or observer failed'); });
  try {
    await expect(fetchVelaWorkspaceDirectory({ readSession: () => session('https://private-api.example'), fetch })).resolves.toEqual({ ok: true, items: [] });
  } finally { broken.mockRestore(); }
  const json = JSON.stringify(evidence.snapshot());
  for (const value of ['private-api', 'private-control-key']) expect(json).not.toContain(value);
  expect(Buffer.byteLength(json)).toBeLessThan(262144);
});
