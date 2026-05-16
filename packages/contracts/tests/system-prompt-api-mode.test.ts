import { describe, expect, it } from 'vitest';

import { composeSystemPrompt, SKIP_DISCOVERY_BRIEF_OVERRIDE } from '../src/prompts/system.js';

/**
 * Regression coverage for #313 — Anthropic API mode renders TodoWrite /
 * Read progress as raw text instead of tool UI cards.
 *
 * Root cause: `DISCOVERY_AND_PHILOSOPHY` (pinned at the TOP of the composed
 * prompt with an explicit "these override anything later" header) tells the
 * agent to call `TodoWrite`, `Bash`, `Read`, etc. on turn 3+. In API/BYOK
 * mode none of those tools are wired through to the model, so the agent
 * either narrates `<todo-list>` pseudo-markup or emits `[读取 X]`
 * fake-protocol prose. The old `streamFormat: 'plain'` rule was appended at
 * the BOTTOM of the prompt — lower precedence than the discovery layer —
 * which is why it was load-bearing-by-position-only and didn't actually
 * suppress the pseudo-tool output.
 *
 * Fix: the API-mode override must sit ABOVE the discovery layer and
 * explicitly invalidate any later "call TodoWrite / Read / Bash" rule.
 */

describe('composeSystemPrompt — API mode (#313)', () => {
  describe('daemon mode (no streamFormat)', () => {
    it('keeps the TodoWrite hard rule from the discovery layer (control)', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).toMatch(/TodoWrite/);
    });

    it('does not instruct agents to ask for a second visual-direction picker', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).not.toContain('<question-form id="direction"');
      expect(prompt).not.toContain('Pick a visual direction');
      expect(prompt).toContain('if a design system is active and no new brand/reference source was provided, use it as the visual direction without asking again');
    });

    it('uses stable brand option values for discovery-form branching', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).toContain('{ "label": "Pick a direction for me", "value": "pick_direction" }');
      expect(prompt).toContain('{ "label": "I have a brand spec — I\'ll share it", "value": "brand_spec" }');
      expect(prompt).toContain('{ "label": "Match a reference site / screenshot — I\'ll attach it", "value": "reference_match" }');
      expect(prompt).toContain('When the answer line includes `[value: ...]`, use that stable value instead of the visible label.');
      expect(prompt).toContain('If you keep the `brand` question, its `id` must stay `"brand"`.');
      expect(prompt).toContain('you may drop the `brand` question as already answered, but you must still treat that provided source as Branch A below');
      expect(prompt).toContain('When skipping the form, do not skip brand-source handling');
      expect(prompt).toContain('If the current message, attachments, prior brief, or URL already contains an actual brand spec / brand guide / reference site / screenshot source, use Branch A.');
      expect(prompt).toContain('### Branch A — user provided a brand/reference source, or `brand` value is `"brand_spec"` / `"reference_match"`');
      expect(prompt).toContain('ask them to paste/upload the brand spec or reference and stop');
      expect(prompt).toContain('Do not guess a brand domain or invent tokens');
      expect(prompt).toContain('An active design system does not suppress Branch A when the user provides a brand/reference source');
      expect(prompt).toContain('### Branch B — no user-provided brand/reference source and no Branch A brand value');
      expect(prompt).toContain('active-design-system cases where the user did not provide a new brand/reference source');
      expect(prompt).toContain('Provided brand/reference source → run brand-spec extraction');
      expect(prompt).toContain('`brand_spec` / `reference_match` without a provided source → ask for the source and stop; do not guess brand tokens.');
    });

    it('does not inject the API-mode preamble', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).not.toMatch(/API mode — no tools available/i);
    });
  });

  describe('API mode (streamFormat: plain)', () => {
    it('injects the API-mode override section', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      expect(prompt).toMatch(/API mode — no tools available/i);
    });

    it('pins the override at the top so it overrides the discovery layer', () => {
      // The discovery layer (DISCOVERY_AND_PHILOSOPHY) starts with the
      // string `# OD core directives`. The API-mode override must appear
      // BEFORE that header — otherwise the discovery layer's own
      // "these override anything later" preamble wins precedence and
      // re-enables TodoWrite/Read/Write/Edit/Bash mentions later in the
      // prompt.
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      const overrideIdx = prompt.search(/API mode — no tools available/i);
      const discoveryIdx = prompt.indexOf('# OD core directives');
      expect(overrideIdx).toBeGreaterThanOrEqual(0);
      expect(discoveryIdx).toBeGreaterThanOrEqual(0);
      expect(overrideIdx).toBeLessThan(discoveryIdx);
    });

    it('names every tool the agent must not pretend to call', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      // Each tool the discovery layer / base prompt assumes is available
      // must be explicitly listed as unavailable so the model knows the
      // later instructions are describing daemon-mode behavior.
      expect(prompt).toMatch(/\bTodoWrite\b/);
      expect(prompt).toMatch(/\bRead\b/);
      expect(prompt).toMatch(/\bWrite\b/);
      expect(prompt).toMatch(/\bEdit\b/);
      expect(prompt).toMatch(/\bBash\b/);
      expect(prompt).toMatch(/\bWebFetch\b/);
    });

    it('forbids the pseudo-tool markup observed in #313 (`<todo-list>` and `[读取 ...]`)', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      expect(prompt).toMatch(/<todo-list>/);
      expect(prompt).toMatch(/\[读取/);
    });

    it('tells the agent to state its plan in prose instead of pretending to call TodoWrite', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      expect(prompt).toMatch(/state.*plan.*prose|describe.*plan.*prose|plan.*as prose/i);
    });

    it('explicitly invalidates later "call TodoWrite" / tool-use instructions', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      // The override must say "ignore later instructions that tell you to
      // call <tool>" — otherwise the discovery layer's RULE 3 "your first
      // tool call is TodoWrite" still applies.
      expect(prompt).toMatch(/override|ignore|do not follow/i);
      expect(prompt).toMatch(/later instructions|rules below|rest of this prompt|elsewhere/i);
    });

    it('still allows <artifact> HTML output', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      expect(prompt).toMatch(/<artifact>/);
    });

    it('honors metadata.skipDiscoveryBrief before the discovery rules', () => {
      const prompt = composeSystemPrompt({
        streamFormat: 'plain',
        metadata: { kind: 'prototype', skipDiscoveryBrief: true },
      });
      const skipIdx = prompt.indexOf(SKIP_DISCOVERY_BRIEF_OVERRIDE);
      const discoveryIdx = prompt.indexOf('# OD core directives');
      expect(skipIdx).toBeGreaterThanOrEqual(0);
      expect(skipIdx).toBeLessThan(discoveryIdx);
      expect(prompt).toMatch(/do NOT emit `?<question-form id="discovery">`?/i);
    });
  });
});
