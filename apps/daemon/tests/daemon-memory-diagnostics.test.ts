import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectLogSource } from '@open-design/diagnostics';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const startServer = vi.hoisted(() => vi.fn());
vi.mock('../src/server.js', () => ({ startServer }));
vi.mock('../src/app-version.js', () => ({
  readCurrentAppVersionInfo: async () => ({ version: '0.23.1', channel: 'stable', packaged: true, platform: 'darwin', arch: 'arm64' }),
}));
import { startDaemonRuntime } from '../src/daemon-startup.js';

function serverHandle() {
  const server = Object.assign(new EventEmitter(), { listening: false });
  startServer.mockResolvedValue({ server, url: 'http://127.0.0.1:1', shutdown: async () => {} });
  return server;
}

describe('daemon memory diagnostics lifecycle', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.spyOn(console, 'info').mockImplementation(() => {}); startServer.mockReset(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  function records() {
    return vi.mocked(console.info).mock.calls
      .filter(([prefix]) => prefix === '[daemon-memory]')
      .map(([, line]) => JSON.parse(String(line)));
  }
  it('records runtime and actual heap budget before server startup, then samples until stopped', async () => {
    serverHandle();
    startServer.mockImplementationOnce(async () => {
      expect(records()).toHaveLength(1);
      return { server: Object.assign(new EventEmitter(), { listening: false }), url: 'http://127.0.0.1:1' };
    });
    const runtime = await startDaemonRuntime();
    const first = records()[0];
    expect(first).toMatchObject({ event: 'startup', appVersion: '0.23.1', pid: process.pid, nodeVersion: process.versions.node });
    expect(first.heapLimitBytes).toBeGreaterThan(0);
    expect(first.heapUsedBytes).toBeGreaterThan(0);
    expect(first.rssBytes).toBeGreaterThan(0);
    expect(first).not.toHaveProperty('env');
    expect(first).not.toHaveProperty('argv');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(records()).toHaveLength(2);
    expect(records()[1]).toMatchObject({ event: 'sample', appVersion: '0.23.1', heapLimitBytes: first.heapLimitBytes });
    await runtime.stop();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(records()).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps identity and memory evidence in the exported log tail', async () => {
    serverHandle();
    const runtime = await startDaemonRuntime();
    const dir = await mkdtemp(join(tmpdir(), 'od-memory-diagnostic-'));
    try {
      await vi.advanceTimersByTimeAsync(60_000);
      const sample = records().at(-1);
      const file = join(dir, 'daemon.log');
      await writeFile(file, 'old line\n'.repeat(1000) + '[daemon-memory] ' + JSON.stringify(sample) + '\n');
      const collected = await collectLogSource({ name: 'daemon.log', absolutePath: file, kind: 'text', tailBytes: 2048 });
      expect(collected.content).toContain(JSON.stringify(sample));
      expect(collected.bytes).toBeLessThanOrEqual(2048);
    } finally {
      await runtime.stop();
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('removes the sampler when startup fails' , async () => {
    startServer.mockRejectedValue(new Error('startup failed'));
    await expect(startDaemonRuntime()).rejects.toThrow('startup failed');
    expect(records()).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('removes the sampler when the HTTP server closes externally', async () => {
    const server = serverHandle();
    await startDaemonRuntime();
    server.emit('close');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not turn an unavailable memory reading into a daemon failure', async () => {
    serverHandle();
    vi.spyOn(process, 'memoryUsage').mockImplementation(() => { throw new Error('unavailable'); });
    const runtime = await startDaemonRuntime();
    await vi.advanceTimersByTimeAsync(60_000);
    await runtime.stop();
    expect(records()).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
