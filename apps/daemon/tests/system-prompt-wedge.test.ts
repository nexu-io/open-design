// @ts-nocheck
// Spec 100 T015 + Spec 101 T021 — LUMINA wedge injection in composeSystemPrompt().
//
// Two paths under test:
//   - Legacy single-tenant: process.env.LUMINA_WEDGE_ENDPOINT + LUMINA_WEDGE_TENANT_ID
//     (used when ctx is undefined, e.g. TENANT_REGISTRY_PATH unset boot mode).
//   - Multi-tenant (spec 101): ctx.wedge_endpoint + ctx.tenant_id passed per-request.
//
// Both paths must emit the same form-action directive so generated pages POST
// lead data into the customer's Lumina iMessage agent handoff endpoint.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('composeSystemPrompt — LUMINA_WEDGE_ENDPOINT injection (env-fallback path)', () => {
  beforeEach(() => {
    delete process.env.LUMINA_WEDGE_ENDPOINT;
    delete process.env.LUMINA_WEDGE_TENANT_ID;
  });

  it('includes wedge form-action block when both env vars are set', async () => {
    const endpoint = 'https://ericedmeades.holalumina.com/api/open-design/lead-handoff';
    process.env.LUMINA_WEDGE_ENDPOINT = endpoint;
    process.env.LUMINA_WEDGE_TENANT_ID = 'ericedmeades';

    const { composeSystemPrompt } = await import('../src/prompts/system.js');
    const result = composeSystemPrompt({});

    expect(result).toContain(endpoint);
    expect(result).toMatch(/method\s*[=:]\s*["']?POST["']?/i);
    expect(result).toContain('tenant_id');
    expect(result).toContain('ericedmeades');
    expect(result).toContain('source_url');
    expect(result).toContain('Lumina lead handoff');
  });

  it('does NOT include wedge block when env vars are unset', async () => {
    const { composeSystemPrompt } = await import('../src/prompts/system.js');
    const result = composeSystemPrompt({});

    expect(result).not.toContain('Lumina lead handoff');
    expect(result).not.toContain('tenant_id');
  });

  it('uses the exact LUMINA_WEDGE_ENDPOINT value as the form action URL', async () => {
    const customEndpoint = 'https://custom-tenant.holalumina.com/api/open-design/lead-handoff';
    process.env.LUMINA_WEDGE_ENDPOINT = customEndpoint;
    process.env.LUMINA_WEDGE_TENANT_ID = 'custom-tenant';

    const { composeSystemPrompt } = await import('../src/prompts/system.js');
    const result = composeSystemPrompt({});

    expect(result).toContain(customEndpoint);
    expect(result).not.toContain('YOUR_WEDGE_ENDPOINT_URL_HERE');
  });

  it('throws when LUMINA_WEDGE_ENDPOINT is set without LUMINA_WEDGE_TENANT_ID', async () => {
    process.env.LUMINA_WEDGE_ENDPOINT = 'https://x.holalumina.com/api/open-design/lead-handoff';

    const { composeSystemPrompt } = await import('../src/prompts/system.js');
    expect(() => composeSystemPrompt({})).toThrow(/LUMINA_WEDGE_TENANT_ID/);
  });
});

describe('composeSystemPrompt — ctx-based wedge injection (multi-tenant path)', () => {
  beforeEach(() => {
    // Env vars must NOT leak into ctx-based runs — ctx wins unconditionally.
    delete process.env.LUMINA_WEDGE_ENDPOINT;
    delete process.env.LUMINA_WEDGE_TENANT_ID;
  });

  it('uses ctx.wedge_endpoint + ctx.tenant_id when ctx supplied', async () => {
    const endpoint = 'https://ericedmeades.holalumina.com/api/open-design/lead-handoff';
    const { composeSystemPrompt } = await import('../src/prompts/system.js');
    const result = composeSystemPrompt({
      ctx: { wedge_endpoint: endpoint, tenant_id: 'ericedmeades' },
    });

    expect(result).toContain(endpoint);
    expect(result).toContain('Lumina lead handoff');
    expect(result).toContain('ericedmeades');
    expect(result).toMatch(/method\s*[=:]\s*["']?POST["']?/i);
    expect(result).toContain('source_url');
  });

  it('ctx wins over process.env', async () => {
    process.env.LUMINA_WEDGE_ENDPOINT = 'https://env.holalumina.com/api/open-design/lead-handoff';
    process.env.LUMINA_WEDGE_TENANT_ID = 'env-tenant';
    const ctxEndpoint = 'https://ctx.holalumina.com/api/open-design/lead-handoff';

    const { composeSystemPrompt } = await import('../src/prompts/system.js');
    const result = composeSystemPrompt({
      ctx: { wedge_endpoint: ctxEndpoint, tenant_id: 'ctx-tenant' },
    });

    expect(result).toContain(ctxEndpoint);
    expect(result).not.toContain('https://env.holalumina.com/api/open-design/lead-handoff');
  });
});
