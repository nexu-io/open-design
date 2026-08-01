import { afterEach, describe, expect, it, vi } from 'vitest';

import { CHAT_TOOL_ENDPOINTS, CHAT_TOOL_OPERATIONS, ToolTokenRegistry } from '../src/tool-tokens.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('run-scoped tool tokens', () => {
  it('mints isolated tokens for concurrent runs under the same project', () => {
    const registry = new ToolTokenRegistry();
    const first = registry.mint({ runId: 'run-1', projectId: 'project-a', nowMs: 1_000 });
    const second = registry.mint({ runId: 'run-2', projectId: 'project-a', nowMs: 1_000 });

    expect(first.token).not.toBe(second.token);
    expect(first.runId).toBe('run-1');
    expect(second.runId).toBe('run-2');
    expect(first.projectId).toBe('project-a');
    expect(second.projectId).toBe('project-a');
    expect(registry.activeRunTokenCount('run-1')).toBe(1);
    expect(registry.activeRunTokenCount('run-2')).toBe(1);

    registry.revokeRun('run-1', 'child_exit');

    expect(registry.validate(first.token, { nowMs: 1_001 }).ok).toBe(false);
    expect(registry.validate(second.token, { nowMs: 1_001 }).ok).toBe(true);
    expect(registry.activeRunTokenCount('run-1')).toBe(0);
    expect(registry.activeRunTokenCount('run-2')).toBe(1);
    registry.clear();
  });

  it('binds tokens to endpoint and operation allowlists', () => {
    const registry = new ToolTokenRegistry();
    const grant = registry.mint({
      runId: 'run-allowlist',
      projectId: 'project-a',
      allowedEndpoints: ['/api/tools/live-artifacts/create'],
      allowedOperations: ['live-artifacts:create'],
      nowMs: 1_000,
    });

    expect(registry.validate(grant.token, {
      endpoint: '/api/tools/live-artifacts/create',
      operation: 'live-artifacts:create',
      nowMs: 1_001,
    })).toMatchObject({ ok: true });
    expect(registry.validate(grant.token, {
      endpoint: '/api/tools/live-artifacts/list',
      operation: 'live-artifacts:create',
      nowMs: 1_001,
    })).toMatchObject({ ok: false, code: 'TOOL_ENDPOINT_DENIED' });
    expect(registry.validate(grant.token, {
      endpoint: '/api/tools/live-artifacts/create',
      operation: 'live-artifacts:update',
      nowMs: 1_001,
    })).toMatchObject({ ok: false, code: 'TOOL_OPERATION_DENIED' });
    registry.clear();
  });

  it('expires and revokes tokens by TTL', () => {
    vi.useFakeTimers();
    const registry = new ToolTokenRegistry();
    const grant = registry.mint({ runId: 'run-ttl', projectId: 'project-a', ttlMs: 10, nowMs: 1_000 });

    expect(registry.activeTokenCount()).toBe(1);
    vi.advanceTimersByTime(10);

    expect(registry.activeTokenCount()).toBe(0);
    expect(registry.validate(grant.token)).toMatchObject({ ok: false, code: 'TOOL_TOKEN_INVALID' });
    registry.clear();
  });

  it('reports expiry when validation observes an expired active token', () => {
    const registry = new ToolTokenRegistry();
    const grant = registry.mint({ runId: 'run-expired', projectId: 'project-a', ttlMs: 10, nowMs: 1_000 });

    expect(registry.validate(grant.token, { nowMs: 1_010 })).toMatchObject({ ok: false, code: 'TOOL_TOKEN_EXPIRED' });
    expect(registry.activeTokenCount()).toBe(0);
  });

  it('refreshes an active run token as an inactivity lease without changing its scope', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const registry = new ToolTokenRegistry();
    const grant = registry.mint({
      runId: 'run-refresh',
      projectId: 'project-a',
      allowedEndpoints: ['/api/tools/media/generate'],
      allowedOperations: ['media:generate'],
      ttlMs: 10,
    });

    vi.advanceTimersByTime(9);
    expect(registry.refreshRun('run-refresh')).toBe(1);
    vi.advanceTimersByTime(1);

    expect(registry.validate(grant.token)).toMatchObject({
      ok: true,
      grant: {
        token: grant.token,
        runId: 'run-refresh',
        projectId: 'project-a',
        allowedEndpoints: ['/api/tools/media/generate'],
        allowedOperations: ['media:generate'],
        issuedAt: grant.issuedAt,
        expiresAt: new Date(1_019).toISOString(),
      },
    });

    vi.advanceTimersByTime(9);
    expect(registry.validate(grant.token)).toMatchObject({
      ok: false,
      code: 'TOOL_TOKEN_INVALID',
    });
  });

  it('does not recreate unknown, expired, or manually revoked tokens during a run refresh', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const registry = new ToolTokenRegistry();

    expect(registry.refreshRun('run-unknown')).toBe(0);

    const expired = registry.mint({
      runId: 'run-expired-refresh',
      projectId: 'project-a',
      ttlMs: 10,
    });
    vi.advanceTimersByTime(10);
    expect(registry.refreshRun('run-expired-refresh')).toBe(0);
    expect(registry.validate(expired.token)).toMatchObject({
      ok: false,
      code: 'TOOL_TOKEN_INVALID',
    });

    const revoked = registry.mint({
      runId: 'run-revoked-refresh',
      projectId: 'project-a',
      ttlMs: 10,
    });
    expect(registry.revokeToken(revoked.token)).toBe(true);
    expect(registry.refreshRun('run-revoked-refresh')).toBe(0);
    expect(registry.validate(revoked.token)).toMatchObject({
      ok: false,
      code: 'TOOL_TOKEN_INVALID',
    });
    expect(registry.activeTokenCount()).toBe(0);
  });

  it('refreshes only the active run among concurrent runs for the same project', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const registry = new ToolTokenRegistry();
    const refreshed = registry.mint({
      runId: 'run-refreshed',
      projectId: 'project-a',
      ttlMs: 10,
    });
    const alsoRefreshed = registry.mint({
      runId: 'run-refreshed',
      projectId: 'project-a',
      ttlMs: 10,
    });
    const untouched = registry.mint({
      runId: 'run-untouched',
      projectId: 'project-a',
      ttlMs: 10,
    });

    vi.advanceTimersByTime(9);
    expect(registry.refreshRun('run-refreshed')).toBe(2);
    vi.advanceTimersByTime(1);

    expect(registry.validate(refreshed.token).ok).toBe(true);
    expect(registry.validate(alsoRefreshed.token).ok).toBe(true);
    expect(registry.validate(untouched.token)).toMatchObject({
      ok: false,
      code: 'TOOL_TOKEN_INVALID',
    });
    expect(registry.activeRunTokenCount('run-refreshed')).toBe(2);
    expect(registry.activeRunTokenCount('run-untouched')).toBe(0);
    registry.clear();
  });

  it('uses the chat tool endpoint and operation allowlists by default', () => {
    const registry = new ToolTokenRegistry();
    const grant = registry.mint({ runId: 'run-defaults', projectId: 'project-a', nowMs: 1_000 });

    expect(grant.allowedEndpoints).toEqual([...CHAT_TOOL_ENDPOINTS]);
    expect(grant.allowedOperations).toEqual([...CHAT_TOOL_OPERATIONS]);
    registry.clear();
  });
});
