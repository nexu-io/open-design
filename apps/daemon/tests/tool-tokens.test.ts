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

  it('uses the chat tool endpoint and operation allowlists by default', () => {
    const registry = new ToolTokenRegistry();
    const grant = registry.mint({ runId: 'run-defaults', projectId: 'project-a', nowMs: 1_000 });

    expect(grant.allowedEndpoints).toEqual([...CHAT_TOOL_ENDPOINTS]);
    expect(grant.allowedOperations).toEqual([...CHAT_TOOL_OPERATIONS]);
    registry.clear();
  });
});
