import { describe, expect, it } from 'vitest';
import { daemonAgentPayloadToPersistedAgentEvent } from '../src/server.js';

// Regression coverage for the apps/web permission_request UI card: acp.ts's
// replyPermission() emits permission_request/permission_resolved as live SSE
// agent events, but until this mapper handles them the persisted history
// dropped both -- a page reload mid-request (or after the run finished) lost
// the card entirely, even though the live stream showed it. Mirrors the live
// mapping in apps/web/src/providers/daemon.ts's translateAgentEvent so
// replayed and live views match.

type PersistedPermissionRequest = {
  kind: string;
  requestId: string;
  title: string;
  description: string;
  choices: string[];
};
type PersistedPermissionResolved = { kind: string; requestId: string; choice: string };

function persist(payload: Record<string, unknown>): unknown {
  return daemonAgentPayloadToPersistedAgentEvent(payload);
}

describe('daemonAgentPayloadToPersistedAgentEvent — permission_request / permission_resolved', () => {
  it('persists a permission_request with its title, description, and choices', () => {
    const persisted = persist({
      type: 'permission_request',
      requestId: 'perm_run-1_123',
      title: 'Hostinger tool call requires approval: mcp__hostinger__VPS_deleteFirewallRuleV1(...)',
      description: 'mcp__hostinger__VPS_deleteFirewallRuleV1({"id":"42"})',
      choices: ['once', 'session', 'always', 'deny'],
    }) as PersistedPermissionRequest | null;
    expect(persisted).not.toBeNull();
    expect(persisted!.kind).toBe('permission_request');
    expect(persisted!.requestId).toBe('perm_run-1_123');
    expect(persisted!.title).toContain('Hostinger');
    expect(persisted!.choices).toEqual(['once', 'session', 'always', 'deny']);
  });

  it('drops non-string entries from choices rather than persisting a malformed list', () => {
    const persisted = persist({
      type: 'permission_request',
      requestId: 'perm_run-1_456',
      title: 'Approve edit: index.html',
      description: 'Approve edit: index.html',
      choices: ['once', null, 42, 'deny'],
    }) as PersistedPermissionRequest | null;
    expect(persisted!.choices).toEqual(['once', 'deny']);
  });

  it('persists a permission_resolved with its requestId and choice', () => {
    const persisted = persist({
      type: 'permission_resolved',
      requestId: 'perm_run-1_123',
      choice: 'deny',
    }) as PersistedPermissionResolved | null;
    expect(persisted).not.toBeNull();
    expect(persisted!.kind).toBe('permission_resolved');
    expect(persisted!.requestId).toBe('perm_run-1_123');
    expect(persisted!.choice).toBe('deny');
  });

  it('drops a malformed permission_request without a requestId', () => {
    expect(persist({ type: 'permission_request', title: 'x', description: 'x', choices: [] })).toBeNull();
  });

  it('drops a malformed permission_resolved without a requestId', () => {
    expect(persist({ type: 'permission_resolved', choice: 'deny' })).toBeNull();
  });
});
