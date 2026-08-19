import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CHAT_TOOL_TOKEN_TTL_BUFFER_MS,
  CHAT_TOOL_ENDPOINTS,
  CHAT_TOOL_OPERATIONS,
  DEFAULT_TOOL_TOKEN_TTL_MS,
  MEDIA_TASK_WAIT_TOOL_ENDPOINT,
  resolveChatToolTokenTtlMs,
  ToolTokenRegistry,
} from '../src/tool-tokens.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('run-scoped tool tokens', () => {
  it('keeps chat tokens alive beyond the runtime inactivity window', () => {
    const thirtyMinutes = 30 * 60 * 1000;

    expect(resolveChatToolTokenTtlMs(0)).toBe(DEFAULT_TOOL_TOKEN_TTL_MS);
    expect(resolveChatToolTokenTtlMs(thirtyMinutes)).toBe(
      thirtyMinutes + CHAT_TOOL_TOKEN_TTL_BUFFER_MS,
    );
    expect(() => resolveChatToolTokenTtlMs(Number.NaN)).toThrow(/inactivityTimeoutMs/);
  });

  it('refreshes an active run token until the run terminates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const registry = new ToolTokenRegistry();
    const ttlMs = resolveChatToolTokenTtlMs(30 * 60 * 1000);
    const grant = registry.mint({
      runId: 'run-active',
      projectId: 'project-a',
      ttlMs,
    });

    for (let elapsedMs = 10 * 60 * 1000; elapsedMs <= 60 * 60 * 1000; elapsedMs += 10 * 60 * 1000) {
      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(registry.refreshToken(grant.token, { ttlMs })).not.toBeNull();
      expect(registry.validate(grant.token)).toMatchObject({ ok: true });
    }

    expect(Date.now()).toBeGreaterThan(ttlMs);
    registry.revokeRun(grant.runId, 'child_exit');
    expect(registry.validate(grant.token)).toMatchObject({
      ok: false,
      code: 'TOOL_TOKEN_INVALID',
    });
  });

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

  it('uses the chat tool endpoint and operation allowlists by default', () => {
    const registry = new ToolTokenRegistry();
    const grant = registry.mint({ runId: 'run-defaults', projectId: 'project-a', nowMs: 1_000 });

    expect(grant.allowedEndpoints).toEqual([...CHAT_TOOL_ENDPOINTS]);
    expect(MEDIA_TASK_WAIT_TOOL_ENDPOINT).toBe('/api/media/tasks/:id/wait');
    expect(grant.allowedEndpoints).toContain(MEDIA_TASK_WAIT_TOOL_ENDPOINT);
    expect(grant.allowedOperations).toEqual([...CHAT_TOOL_OPERATIONS]);
    registry.clear();
  });
});
