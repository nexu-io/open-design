// @ts-nocheck
// Spec 101 Phase 3 Wave F-1 — T021: composeSystemPrompt() ctx parameter (multi-tenant).
//
// Refactors the wedge form-action injection from process.env-based (single-tenant)
// to a per-request `ctx` parameter so each tenant's system prompt is composed
// from their own RequestTenantContext snapshot. Env vars remain a fallback for
// legacy single-tenant boot mode (TENANT_REGISTRY_PATH unset).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

beforeEach(() => {
  delete process.env.LUMINA_WEDGE_ENDPOINT;
  delete process.env.LUMINA_WEDGE_TENANT_ID;
});

describe('composeSystemPrompt — ctx parameter (spec 101 T021/T022)', () => {
  it('(a) injects wedge block from ctx.wedge_endpoint + ctx.tenant_id', async () => {
    const { composeSystemPrompt } = await import('../../src/prompts/system.js');
    const endpoint = 'https://eric.holalumina.com/api/open-design/lead-handoff';
    const result = composeSystemPrompt({
      ctx: { wedge_endpoint: endpoint, tenant_id: 'ericedmeades' },
    });

    expect(result).toContain(endpoint);
    expect(result).toContain('Lumina lead handoff');
    expect(result).toContain('ericedmeades');
    expect(result).toMatch(/method\s*[=:]\s*["']?POST["']?/i);
    expect(result).toContain('source_url');
  });

  it('(b) does NOT inject wedge block when ctx is empty object', async () => {
    const { composeSystemPrompt } = await import('../../src/prompts/system.js');
    const result = composeSystemPrompt({ ctx: {} });

    expect(result).not.toContain('Lumina lead handoff');
  });

  it('(c) falls back to process.env when ctx is undefined (legacy single-tenant)', async () => {
    process.env.LUMINA_WEDGE_ENDPOINT = 'https://legacy.holalumina.com/api/open-design/lead-handoff';
    process.env.LUMINA_WEDGE_TENANT_ID = 'legacy';

    const { composeSystemPrompt } = await import('../../src/prompts/system.js');
    const result = composeSystemPrompt({});

    expect(result).toContain('Lumina lead handoff');
    expect(result).toContain('https://legacy.holalumina.com/api/open-design/lead-handoff');
    expect(result).toContain('legacy');
  });

  it('(d) ctx wins over process.env when both are set', async () => {
    process.env.LUMINA_WEDGE_ENDPOINT = 'https://env-tenant.holalumina.com/api/open-design/lead-handoff';
    process.env.LUMINA_WEDGE_TENANT_ID = 'env-tenant';

    const ctxEndpoint = 'https://ctx-tenant.holalumina.com/api/open-design/lead-handoff';
    const { composeSystemPrompt } = await import('../../src/prompts/system.js');
    const result = composeSystemPrompt({
      ctx: { wedge_endpoint: ctxEndpoint, tenant_id: 'ctx-tenant' },
    });

    expect(result).toContain(ctxEndpoint);
    expect(result).toContain('ctx-tenant');
    expect(result).not.toContain('https://env-tenant.holalumina.com/api/open-design/lead-handoff');
    expect(result).not.toMatch(/tenant_id["']?\s*:\s*["']env-tenant["']/);
  });

  it('(e) throws when ctx.wedge_endpoint is non-HTTPS', async () => {
    const { composeSystemPrompt } = await import('../../src/prompts/system.js');
    expect(() =>
      composeSystemPrompt({
        ctx: { wedge_endpoint: 'ftp://bad.example.com/handoff', tenant_id: 'x' },
      }),
    ).toThrow();
  });

  it('(e2) throws when ctx.wedge_endpoint is malformed', async () => {
    const { composeSystemPrompt } = await import('../../src/prompts/system.js');
    expect(() =>
      composeSystemPrompt({
        ctx: { wedge_endpoint: 'not-a-url', tenant_id: 'x' },
      }),
    ).toThrow();
  });

  it('(e3) throws when ctx.wedge_endpoint set without tenant_id (half-config)', async () => {
    const { composeSystemPrompt } = await import('../../src/prompts/system.js');
    expect(() =>
      composeSystemPrompt({
        ctx: { wedge_endpoint: 'https://x.holalumina.com/api/open-design/lead-handoff' },
      }),
    ).toThrow();
  });

  // (f) PLACEHOLDER for Phase 4 — design_system voice tokens injection.
  // Shape will be finalized when DesignSystemTokens lands. Skipped until then.
  it.todo('(f) injects ctx.design_system.voice_tokens / voice_avoid (Phase 4)');
});
