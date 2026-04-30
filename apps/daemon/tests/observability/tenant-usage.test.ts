// @ts-nocheck
/**
 * Spec 101 FR-011 — tenant usage event emitter tests.
 *
 * Verifies that lifecycle events (generation start/complete, deploy complete,
 * lead handoff received) are emitted as structured JSON-line records carrying
 * the per-request tenant_id and request_id from AsyncLocalStorage. Also
 * verifies the PII guard (no raw email addresses) and pluggable sink for
 * tests.
 */

import { test, beforeEach, afterEach } from 'vitest';
import assert from 'node:assert/strict';
import { runWithTenantContext } from '../../src/auth/tenant-context.js';
import {
  emitGenerationStarted,
  emitGenerationCompleted,
  emitDeployCompleted,
  emitLeadHandoffReceived,
  setUsageSink,
  resetUsageSink,
} from '../../src/observability/tenant-usage.js';

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: 'acme',
    request_id: 'req-123',
    clerk_user_id: 'user_abc',
    clerk_session_id: 'sess_abc',
    clerk_org_slug: 'acme',
    design_system: 'lumina',
    wedge_endpoint: 'https://wedge.example.com',
    vercel_team: 'team_acme',
    data_dir: '/data/acme',
    ...overrides,
  } as any;
}

let captured: any[] = [];

beforeEach(() => {
  captured = [];
  setUsageSink((event) => captured.push(event));
});

afterEach(() => {
  resetUsageSink();
});

test('emitGenerationStarted captures tenant_id + request_id from ctx', async () => {
  await runWithTenantContext(makeCtx(), async () => {
    emitGenerationStarted({ project_id: 'p1', prompt_hash: 'sha256:deadbeef' });
  });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].event, 'open_design.generation_started');
  assert.equal(captured[0].tenant_id, 'acme');
  assert.equal(captured[0].request_id, 'req-123');
  assert.equal(captured[0].project_id, 'p1');
  assert.equal(captured[0].prompt_hash, 'sha256:deadbeef');
  assert.ok(typeof captured[0].timestamp === 'string');
});

test('emitGenerationCompleted emits structured event with duration + tokens', async () => {
  await runWithTenantContext(makeCtx({ tenant_id: 'beta', request_id: 'req-2' }), async () => {
    emitGenerationCompleted({
      project_id: 'p2',
      duration_ms: 1234,
      tokens_used: 5678,
      success: true,
    });
  });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].event, 'open_design.generation_completed');
  assert.equal(captured[0].tenant_id, 'beta');
  assert.equal(captured[0].request_id, 'req-2');
  assert.equal(captured[0].duration_ms, 1234);
  assert.equal(captured[0].tokens_used, 5678);
  assert.equal(captured[0].success, true);
});

test('emitDeployCompleted emits status + url', async () => {
  await runWithTenantContext(makeCtx(), async () => {
    emitDeployCompleted({
      project_id: 'p3',
      vercel_deployment_id: 'dpl_abc',
      live_url: 'https://p3.vercel.app',
      status: 'success',
      duration_ms: 4242,
    });
  });
  assert.equal(captured[0].event, 'open_design.deploy_completed');
  assert.equal(captured[0].vercel_deployment_id, 'dpl_abc');
  assert.equal(captured[0].live_url, 'https://p3.vercel.app');
  assert.equal(captured[0].status, 'success');
});

test('emitLeadHandoffReceived emits hashed lead identifier', async () => {
  await runWithTenantContext(makeCtx(), async () => {
    emitLeadHandoffReceived({
      project_id: 'p4',
      lead_email_hash: 'sha256:abc123',
      conversation_id: 'conv-9',
    });
  });
  assert.equal(captured[0].event, 'open_design.lead_handoff_received');
  assert.equal(captured[0].lead_email_hash, 'sha256:abc123');
  assert.equal(captured[0].conversation_id, 'conv-9');
});

test('emitter outside runWithTenantContext throws "no tenant context active"', () => {
  assert.throws(
    () => emitGenerationStarted({ project_id: 'p1', prompt_hash: 'sha256:x' }),
    /no tenant context active/,
  );
});

test('concurrent ctx scopes get correct tenant_id per event', async () => {
  const tenants = ['t1', 't2', 't3', 't4', 't5'];
  await Promise.all(
    tenants.map((tid, i) =>
      runWithTenantContext(makeCtx({ tenant_id: tid, request_id: `r-${tid}` }), async () => {
        await new Promise((r) => setTimeout(r, Math.random() * 20));
        emitGenerationStarted({ project_id: `p-${tid}`, prompt_hash: `sha256:${i}` });
      }),
    ),
  );
  assert.equal(captured.length, 5);
  for (const evt of captured) {
    // tenant_id and project_id must match
    assert.equal(evt.project_id, `p-${evt.tenant_id}`);
    assert.equal(evt.request_id, `r-${evt.tenant_id}`);
  }
});

test('PII guard: raw email in payload triggers throw', async () => {
  await runWithTenantContext(makeCtx(), async () => {
    assert.throws(
      () =>
        emitLeadHandoffReceived({
          project_id: 'p1',
          lead_email_hash: 'foo@bar.com' as any,
        }),
      /PII detected/,
    );
  });
});

test('PII guard: pre-hashed sha256 value does not trigger guard', async () => {
  await runWithTenantContext(makeCtx(), async () => {
    emitLeadHandoffReceived({
      project_id: 'p1',
      lead_email_hash: 'sha256:abc123def456',
    });
  });
  assert.equal(captured.length, 1);
});

test('resetUsageSink restores default stdout sink', async () => {
  // Capture stdout writes
  const writes: string[] = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  (process.stdout as any).write = (chunk: any) => {
    writes.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  };
  try {
    resetUsageSink();
    await runWithTenantContext(makeCtx(), async () => {
      emitGenerationStarted({ project_id: 'p1', prompt_hash: 'sha256:xyz' });
    });
  } finally {
    (process.stdout as any).write = origWrite;
  }
  assert.ok(writes.length >= 1);
  const parsed = JSON.parse(writes[writes.length - 1].trim());
  assert.equal(parsed.event, 'open_design.generation_started');
  assert.equal(parsed.tenant_id, 'acme');
});
