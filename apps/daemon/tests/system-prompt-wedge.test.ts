// @ts-nocheck
// Spec 100 — T015: TDD (RED) test for LUMINA_WEDGE_ENDPOINT system prompt injection.
//
// Asserts that when LUMINA_WEDGE_ENDPOINT env var is set, composeSystemPrompt()
// appends a system instruction directing the LLM to set the generated page's form
// action to the wedge endpoint URL, use method="POST", and include hidden fields
// for tenant_id and source_url.
//
// This test is INTENTIONALLY FAILING before T016 wires the implementation.
// After T016 lands, all three tests must pass.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  // Clear module registry so the env var is re-read on next import.
  // Vitest re-imports modules per test file by default; explicit cache bust
  // here guards against shared-module caching between test cases within this
  // file.
});

describe('composeSystemPrompt — LUMINA_WEDGE_ENDPOINT injection (spec 100 T015)', () => {
  beforeEach(() => {
    delete process.env.LUMINA_WEDGE_ENDPOINT;
  });

  it('includes wedge form-action block when LUMINA_WEDGE_ENDPOINT is set', async () => {
    const endpoint = 'https://ericedmeades.holalumina.com/api/open-design/lead-handoff';
    process.env.LUMINA_WEDGE_ENDPOINT = endpoint;

    // Dynamic import so the module picks up the mutated env var.
    const { composeSystemPrompt } = await import('../src/prompts/system.js');
    const result = composeSystemPrompt({});

    // Must contain the wedge endpoint as a form action directive.
    expect(result).toContain(endpoint);

    // Must instruct the LLM to use method="POST".
    expect(result).toMatch(/method\s*[=:]\s*["']?POST["']?/i);

    // Must mention tenant_id hidden field.
    expect(result).toContain('tenant_id');

    // Must mention source_url hidden field.
    expect(result).toContain('source_url');

    // Must mention Lumina lead handoff section (the block header).
    expect(result).toContain('Lumina lead handoff');
  });

  it('does NOT include wedge block when LUMINA_WEDGE_ENDPOINT is unset', async () => {
    delete process.env.LUMINA_WEDGE_ENDPOINT;

    const { composeSystemPrompt } = await import('../src/prompts/system.js');
    const result = composeSystemPrompt({});

    // The wedge section header must be absent.
    expect(result).not.toContain('Lumina lead handoff');

    // No stray tenant_id injection (unlikely to appear in base prompt without wedge).
    expect(result).not.toContain('tenant_id');
  });

  it('uses the exact LUMINA_WEDGE_ENDPOINT value as the form action URL', async () => {
    const customEndpoint = 'https://custom-tenant.holalumina.com/api/open-design/lead-handoff';
    process.env.LUMINA_WEDGE_ENDPOINT = customEndpoint;

    const { composeSystemPrompt } = await import('../src/prompts/system.js');
    const result = composeSystemPrompt({});

    // The exact endpoint must appear in the output, not a placeholder.
    expect(result).toContain(customEndpoint);

    // Must NOT contain the literal placeholder string from the env.example.
    expect(result).not.toContain('YOUR_WEDGE_ENDPOINT_URL_HERE');
  });
});
