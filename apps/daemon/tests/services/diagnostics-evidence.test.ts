import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDiagnosticsEvidence, createEvidenceCheckpointWriter, diagnosticsEvidencePaths } from '../../src/services/diagnostics-evidence.js';
import { collectSystemEnvironment, diagnosticFailureCode, summarizeProxyEnvironment, type SystemEnvironmentSnapshot } from '../../src/services/diagnostics-environment.js';

function environment(): SystemEnvironmentSnapshot {
  return { sampledAt: new Date().toISOString(), status: 'collected', systemProxy: summarizeProxyEnvironment({}),
    daemonProxy: summarizeProxyEnvironment({}), pacConfigured: false, interfaces: { ipv4: 1, ipv6: 0 } };
}

afterEach(() => vi.useRealTimers());

describe('bounded diagnostics under repeated failures', () => {
  it('does no collection or disk work for successful workspace observations alone', async () => {
    vi.useFakeTimers();
    const collect = vi.fn(async () => environment());
    const write = vi.fn(async () => undefined);
    const evidence = createDiagnosticsEvidence({ collect, write });
    try {
      for (let i = 0; i < 1000; i++) {
        evidence.observeDirectory([{ workspaceId: 'team-1', workspaceMemberId: 'member-1', workspaceType: 'team' }]);
        evidence.observeContext({ workspaceId: 'team-1', memberId: 'member-1', workspaceType: 'team' });
      }
      await vi.advanceTimersByTimeAsync(180_000);
      expect(collect).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    } finally { evidence.close(); }
  });

  it('coalesces 100,000 failures into one record with one asynchronous sample and one checkpoint per minute', async () => {
    vi.useFakeTimers();
    const collect = vi.fn(async () => environment());
    const write = vi.fn(async (_content: string) => undefined);
    const evidence = createDiagnosticsEvidence({ collect, write });
    try {
      for (let i = 0; i < 100_000; i++) evidence.record({ source: 'team-projects', timedOut: true, workspaceId: 'team-1' });
      expect(collect).not.toHaveBeenCalled();
      expect(write).not.toHaveBeenCalled();
      await evidence.refresh();
      expect(collect).toHaveBeenCalledTimes(1);
      expect(evidence.snapshot().failures).toMatchObject([{ count: 100_000, code: 'timeout', firstEnvironmentAt: null }]);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(59_999);
      expect(write).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(write).toHaveBeenCalledTimes(1);
      expect(Buffer.byteLength(write.mock.calls[0]![0])).toBeLessThan(262144);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(write).toHaveBeenCalledTimes(1);
      expect(collect).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally { evidence.close(); }
  });

  it('caps distinct groups and directory identities, and does not serialize secrets or messages', async () => {
    const evidence = createDiagnosticsEvidence({ collect: async () => environment() });
    try {
      evidence.observeDirectory(Array.from({ length: 1000 }, (_, i) => ({
        workspaceId: `workspace-${i}`, workspaceMemberId: `member-${i}`, workspaceType: 'team', workspaceName: 'private-name',
      })));
      evidence.observeContext({ workspaceId: 'selected-team', memberId: 'member-1', workspaceType: 'team' });
      for (let i = 0; i < 10_000; i++) evidence.record({
        source: 'local-api', status: 503, operation: '/api/projects/:id', requestId: `request-${i}`, workspaceId: `team-${i}`,
        error: new Error('Authorization: Bearer secret-message'), env: { HTTPS_PROXY: 'http://username:password@private-host:7890/private-path?token=secret-query', OPENAI_API_KEY: 'secret-key' },
      });
      await evidence.refresh();
      const snapshot = evidence.snapshot();
      expect(snapshot.failures).toHaveLength(100);
      expect(snapshot.failures[0]!.workspaceId).toBe('team-9900');
      expect(snapshot.coverage.droppedGroups).toBe(9900);
      expect(snapshot.directory?.items).toHaveLength(50);
      expect(snapshot.directory?.truncated).toBe(true);
      expect(snapshot.directory?.items[0]?.memberId).toBe('member-0');
      const serialized = JSON.stringify(snapshot);
      expect(Buffer.byteLength(serialized)).toBeLessThanOrEqual(262144);
      for (const secret of ['private-name', 'username', 'password', 'private-host', 'private-path', 'secret-query', 'secret-key', 'secret-message']) expect(serialized).not.toContain(secret);
      expect(snapshot.failures[0]?.proxyConfiguration?.https).toMatchObject({ port: '7890', credentialsPresent: true });
    } finally { evidence.close(); }
  });

  it('shares an in-flight collection across failures and exports without a growing promise or write queue', async () => {
    vi.useFakeTimers();
    let finish!: (value: SystemEnvironmentSnapshot) => void;
    const collect = vi.fn(() => new Promise<SystemEnvironmentSnapshot>((resolve) => { finish = resolve; }));
    let finishWrite!: () => void;
    const write = vi.fn(() => new Promise<void>((resolve) => { finishWrite = resolve; }));
    const evidence = createDiagnosticsEvidence({ collect, write });
    try {
      const refresh = evidence.refresh();
      expect(evidence.refresh()).toBe(refresh);
      await Promise.resolve();
      for (let i = 0; i < 1000; i++) evidence.record({ source: 'workspace-directory', status: 503 });
      expect(collect).toHaveBeenCalledTimes(1);
      finish(environment());
      await refresh;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(write).toHaveBeenCalledTimes(1);
      for (let i = 0; i < 1000; i++) evidence.record({ source: 'workspace-directory', status: 503 });
      await vi.advanceTimersByTimeAsync(300_000);
      expect(write).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
      finishWrite();
      await evidence.flush();
      expect(vi.getTimerCount()).toBe(1);
    } finally { evidence.close(); }
  });

  it('bounds retries after collection and disk failures without emitting recursive diagnostics', async () => {
    vi.useFakeTimers();
    const collect = vi.fn(async () => { throw new Error('private collector error'); });
    const write = vi.fn(async () => { throw new Error('disk full'); });
    const evidence = createDiagnosticsEvidence({ collect, write });
    try {
      evidence.record({ source: 'workspace-context', status: 503 });
      await evidence.refresh();
      expect(evidence.snapshot().failures).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(180_000);
      expect(write).toHaveBeenCalledTimes(3);
      expect(collect).toHaveBeenCalledTimes(1);
      expect(evidence.snapshot().coverage.persistence).toBe('unavailable');
      expect(JSON.stringify(evidence.snapshot())).not.toContain('private collector error');
    } finally { evidence.close(); }
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refreshes proxy evidence at most once a minute even during continuous errors', async () => {
    vi.useFakeTimers();
    const evidence = createDiagnosticsEvidence({ collect: async () => environment() });
    try {
      evidence.record({ source: 'team-projects', env: { HTTPS_PROXY: 'http://localhost:7890' } });
      for (let i = 0; i < 60; i++) {
        await vi.advanceTimersByTimeAsync(1000);
        evidence.record({ source: 'team-projects', env: { HTTPS_PROXY: 'http://localhost:7891' } });
      }
      expect(evidence.snapshot().failures[0]?.proxyConfiguration?.https).toMatchObject({ port: '7891' });
      expect(evidence.snapshot().environments.length).toBeLessThanOrEqual(4);
    } finally { evidence.close(); }
  });

  it('checkpoints atomically and preserves the preceding process across restart', async () => {
    const root = await mkdtemp(join(tmpdir(), 'od-diagnostic-evidence-'));
    try {
      const first = createEvidenceCheckpointWriter(root);
      await first('{"session":1,"count":1}');
      await first('{"session":1,"count":2}');
      const second = createEvidenceCheckpointWriter(root);
      await second('{"session":2}');
      const paths = diagnosticsEvidencePaths(root);
      expect(JSON.parse(await readFile(paths.previous, 'utf8'))).toEqual({ session: 1, count: 2 });
      expect(JSON.parse(await readFile(paths.current, 'utf8'))).toEqual({ session: 2 });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

describe('sanitized OS environment sampling', () => {
  it('classifies bounded CLI stderr without retaining its contents', () => {
    expect(diagnosticFailureCode({ stderr: 'Get https://user:secret@api.test: proxyconnect tcp: refused' })).toBe('proxy');
    expect(diagnosticFailureCode({ stderr: 'context deadline exceeded (Client.Timeout exceeded while awaiting headers)' })).toBe('timeout');
    expect(diagnosticFailureCode({ cause: { code: 'ENOTFOUND' } })).toBe('dns');
    expect(diagnosticFailureCode({ stderr: 'x509: certificate signed by unknown authority' })).toBe('tls');
  });

  it('reads Windows configuration asynchronously once, and removes credentials, PAC URL and interface identifiers', async () => {
    const query = vi.fn(async () => `
      ProxyEnable REG_DWORD 0x1
      ProxyServer REG_SZ http://user:secret@127.0.0.1:7890
      ProxyOverride REG_SZ *.private-domain;localhost
      AutoConfigURL REG_SZ https://pac.private-domain/config?token=secret
    `);
    const snapshot = await collectSystemEnvironment({ platform: 'win32', query, env: { HTTPS_PROXY: 'http://user:secret@proxy.private-domain:8080', SECRET_TOKEN: 'never-export' }, interfaces: () => ({}) });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]).toEqual(['reg.exe', ['query', String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings`]]);
    expect(snapshot).toMatchObject({ status: 'collected', pacConfigured: true, systemProxy: { https: { configured: true, loopback: true, port: '7890' } } });
    const serialized = JSON.stringify(snapshot);
    for (const secret of ['private-domain', 'never-export', 'secret', 'AutoConfigURL']) expect(serialized).not.toContain(secret);
  });

  it('labels failed/unsupported collection and never claims a VPN or an actual network route', async () => {
    const failed = await collectSystemEnvironment({ platform: 'win32', query: async () => { throw new Error('timeout'); }, interfaces: () => ({}) });
    expect(failed.status).toBe('unavailable');
    expect(failed.systemProxy).toBeNull();
    const query = vi.fn();
    expect((await collectSystemEnvironment({ platform: 'linux', query, interfaces: () => ({}) })).status).toBe('unsupported');
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects oversized or invalid proxy values instead of retaining arbitrary environment text', () => {
    expect(summarizeProxyEnvironment({ HTTP_PROXY: 'x'.repeat(1_000_000), HTTPS_PROXY: 'file:///secret' })).toMatchObject({
      http: { configured: true, valid: false }, https: { configured: true, valid: false },
    });
  });
});
