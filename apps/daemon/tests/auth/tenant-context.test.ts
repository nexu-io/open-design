import { describe, test, expect } from 'vitest';
import {
  getTenantContext,
  getTenantContextOptional,
  runWithTenantContext,
  type RequestTenantContext,
} from '../../src/auth/tenant-context.js';

function makeCtx(overrides: Partial<RequestTenantContext> = {}): RequestTenantContext {
  return {
    tenant_id: 'ericedmeades',
    request_id: '01900000-0000-7000-8000-000000000000',
    clerk_user_id: 'user_test',
    clerk_session_id: 'sess_test',
    clerk_org_slug: 'ericedmeades',
    design_system: 'ericedmeades',
    wedge_endpoint: 'https://ericedmeades.holalumina.com/api/open-design/lead-handoff',
    vercel_team: 'ceremonia-89dd9b81',
    data_dir: '/data/ericedmeades',
    ...overrides,
  };
}

describe('tenant-context (async-local-storage)', () => {
  test('(a) getTenantContext() outside runWithTenantContext throws "no tenant context active"', () => {
    expect(() => getTenantContext()).toThrow(/no tenant context active/i);
  });

  test('(b) runWithTenantContext makes ctx accessible inside callback', async () => {
    const ctx = makeCtx();
    const seen = await runWithTenantContext(ctx, () => {
      const inside = getTenantContext();
      return inside;
    });
    expect(seen).toEqual(ctx);
  });

  test('(c) concurrent requests in different ALS scopes get different ctx', async () => {
    const ctxA = makeCtx({ tenant_id: 'tenant-a', clerk_user_id: 'user_a', request_id: 'req-a' });
    const ctxB = makeCtx({ tenant_id: 'tenant-b', clerk_user_id: 'user_b', request_id: 'req-b' });
    const ctxC = makeCtx({ tenant_id: 'tenant-c', clerk_user_id: 'user_c', request_id: 'req-c' });

    const randDelay = () => new Promise<void>((r) => setTimeout(r, Math.floor(Math.random() * 25)));

    const work = (ctx: RequestTenantContext) =>
      runWithTenantContext(ctx, async () => {
        await randDelay();
        const seenStart = getTenantContext();
        await randDelay();
        const seenEnd = getTenantContext();
        return { seenStart, seenEnd };
      });

    const [a, b, c] = await Promise.all([work(ctxA), work(ctxB), work(ctxC)]);

    expect(a.seenStart.tenant_id).toBe('tenant-a');
    expect(a.seenEnd.tenant_id).toBe('tenant-a');
    expect(a.seenStart.clerk_user_id).toBe('user_a');

    expect(b.seenStart.tenant_id).toBe('tenant-b');
    expect(b.seenEnd.tenant_id).toBe('tenant-b');
    expect(b.seenStart.clerk_user_id).toBe('user_b');

    expect(c.seenStart.tenant_id).toBe('tenant-c');
    expect(c.seenEnd.tenant_id).toBe('tenant-c');
    expect(c.seenStart.clerk_user_id).toBe('user_c');
  });

  test('(d) nested runWithTenantContext returns inner ctx (innermost wins)', async () => {
    const outer = makeCtx({ tenant_id: 'outer', request_id: 'req-outer' });
    const inner = makeCtx({ tenant_id: 'inner', request_id: 'req-inner' });

    const result = await runWithTenantContext(outer, async () => {
      const seenOuter = getTenantContext();
      const seenInner = await runWithTenantContext(inner, () => getTenantContext());
      const seenAfter = getTenantContext();
      return { seenOuter, seenInner, seenAfter };
    });

    expect(result.seenOuter.tenant_id).toBe('outer');
    expect(result.seenInner.tenant_id).toBe('inner');
    expect(result.seenAfter.tenant_id).toBe('outer');
  });

  test('(e) getTenantContextOptional returns undefined outside scope and ctx inside', async () => {
    expect(getTenantContextOptional()).toBeUndefined();

    const ctx = makeCtx();
    const inside = await runWithTenantContext(ctx, () => getTenantContextOptional());
    expect(inside).toEqual(ctx);

    expect(getTenantContextOptional()).toBeUndefined();
  });
});
