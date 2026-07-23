import { describe, expect, it } from 'vitest';

import { composeSystemPrompt as composePrompt, SKIP_DISCOVERY_BRIEF_OVERRIDE } from '../src/prompts/system.js';

const composeSystemPrompt = (input: Parameters<typeof composePrompt>[0]) =>
  composePrompt({ ...input, promptCoreVariant: 'classic' });

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
      expect(prompt).toContain('Do not emit a direction question-form');
      expect(prompt).not.toContain('<question-form id="direction"');
      expect(prompt).not.toContain('Pick a visual direction');
      expect(prompt).toContain('if a design system is active, use it as the visual direction without asking again');
    });

    it('uses stable brand option values for discovery-form branching', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).toContain('{ "label": "Pick a direction for me", "value": "pick_direction" }');
      expect(prompt).toContain('{ "label": "I have a brand spec — I\'ll share it", "value": "brand_spec" }');
      expect(prompt).toContain('{ "label": "Match a reference site / screenshot — I\'ll attach it", "value": "reference_match" }');
      expect(prompt).toContain('When the answer line includes `[value: ...]`, use that stable value instead of the visible label.');
      expect(prompt).toContain('If you keep the `brand` question, its `id` must stay `"brand"`.');
      expect(prompt).toContain('you may drop the `brand` question as already answered; classify the source under RULE 2');
      expect(prompt).toContain('When skipping the form, still classify any provided source under RULE 2');
      expect(prompt).toContain('### Branch A — replacement brand/visual source, or `brand` value is `"brand_spec"` / `"reference_match"`');
      expect(prompt).toContain('ask them to paste/upload the brand spec or reference and stop');
      expect(prompt).toContain('Do not guess a brand domain or invent tokens');
      expect(prompt).toContain('First classify what role any source plays');
      expect(prompt).toContain(
        'Use Branch A if the user explicitly designates it as the replacement brand or visual authority',
      );
      expect(prompt).toContain(
        'For an ordinary reference, extract only the requested aspects, keep the active design-system tokens binding elsewhere',
      );
      expect(prompt).not.toContain('run the extraction as a supplemental override');
      expect(prompt).toContain('### Branch B — no Branch A source or brand value');
      expect(prompt).toContain('Branch A source/value → run brand-spec extraction');
      expect(prompt).toContain('`brand_spec` / `reference_match` without a provided source → ask for the source and stop; do not guess brand tokens.');
    });

    it('does not inject the API-mode preamble', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).not.toMatch(/API mode — no tools available/i);
    });

    it('carries the all-turn clarification protocol for daemon mode too', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).toContain('Host clarification protocol — any turn');
      expect(prompt).toContain('It applies on turn 1 and every later turn');
    });
  });

  describe('API mode (streamFormat: plain)', () => {
    it('injects the API-mode override section', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      expect(prompt).toContain('# Plain API execution profile — no tools (binding)');
    });

    it('pins the override at the top so it overrides the discovery layer', () => {
      // The discovery layer (DISCOVERY_AND_PHILOSOPHY) starts with the
      // string `# OD core directives`. The API-mode override must appear
      // BEFORE that header — otherwise the discovery layer's own
      // "these override anything later" preamble wins precedence and
      // re-enables TodoWrite/Read/Write/Edit/Bash mentions later in the
      // prompt.
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      const overrideIdx = prompt.indexOf('# Plain API execution profile — no tools (binding)');
      const discoveryIdx = prompt.indexOf('# OD core directives');
      expect(overrideIdx).toBeGreaterThanOrEqual(0);
      expect(discoveryIdx).toBeGreaterThanOrEqual(0);
      expect(overrideIdx).toBeLessThan(discoveryIdx);
    });

    it('covers unavailable tool categories without redefining the active workflow', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      const apiDirective = prompt.slice(0, prompt.indexOf('# OD core directives'));
      expect(apiDirective).toContain('filesystem reads or writes');
      expect(apiDirective).toContain('shell commands');
      expect(apiDirective).toContain('connector/MCP calls');
      expect(apiDirective).toContain('runtime-specific planning tools');
      expect(apiDirective).toContain('does not override the active session mode');
    });

    it('forbids the pseudo-tool markup observed in #313 (`<todo-list>` and `[读取 ...]`)', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      expect(prompt).toMatch(/<todo-list>/);
      expect(prompt).toMatch(/\[读取/);
    });

    it('forbids pretending that planning or other tool calls ran', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      expect(prompt).toContain('runtime-specific planning tools will not execute');
      expect(prompt).toContain('do not pretend a tool ran');
    });

    it('keeps tool-unavailable details out of user-visible prose', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      expect(prompt).toContain('Do not mention tool unavailability to the user');
      expect(prompt).toContain('never emit pseudo-tool markup');
      expect(prompt).toContain('statements promising to call, read, write, fetch, or generate through a tool');
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

    // Regression coverage for the unified ask-user flow: API/BYOK mode must
    // route blocking clarification on every turn through the same
    // `<question-form>` Questions-tab surface as daemon mode.
    it('requires clarification forms on every turn, including turn 1', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      expect(prompt).toContain('Host clarification protocol — any turn');
      expect(prompt).toContain('It applies on turn 1 and every later turn');
      expect(prompt).toContain('Do not ask a blocking clarification as prose');
      expect(prompt).not.toContain('Clarifying questions mid-conversation');
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
      expect(prompt).toContain('do not emit a discovery form');
      expect(prompt).toContain('infer safe defaults for missing details');
      expect(prompt).toContain('For this initial Design turn only');
    });

    it('does not persist skipDiscoveryBrief into later turns or non-Design modes', () => {
      const later = composeSystemPrompt({
        streamFormat: 'plain',
        isInitialProjectTurn: false,
        metadata: { kind: 'prototype', skipDiscoveryBrief: true },
      });
      const ask = composeSystemPrompt({
        sessionMode: 'chat',
        metadata: { kind: 'prototype', skipDiscoveryBrief: true },
      });
      const plan = composeSystemPrompt({
        sessionMode: 'plan',
        metadata: { kind: 'prototype', skipDiscoveryBrief: true },
      });

      for (const prompt of [later, ask, plan]) {
        expect(prompt).not.toContain(SKIP_DISCOVERY_BRIEF_OVERRIDE);
      }
    });
  });

  // Regression coverage for #3257 — example-prompt discovery skip must be
  // honored in API/BYOK mode (which composes prompts through this contracts
  // composer), not only in daemon-backed runs. Without the examplePrompt
  // handling here, the same unmodified gallery prompt skipped discovery in
  // daemon mode but still asked discovery questions in API mode.
  describe('example prompt mode (#3257)', () => {
    it('injects the example-prompt override and skips discovery when metadata.examplePrompt is true', () => {
      const prompt = composeSystemPrompt({
        metadata: { kind: 'prototype', examplePrompt: true },
      });
      expect(prompt).toContain('Initial example Design turn — direct generation');
      expect(prompt).toContain('do not emit a discovery form');
    });

    it('interpolates the curated title and pre-filled brief', () => {
      const prompt = composeSystemPrompt({
        metadata: {
          kind: 'prototype',
          examplePrompt: true,
          examplePromptTitle: 'Neon dashboard',
          examplePromptBrief: { target_audience: 'developers', fidelity: 'high' },
        },
      });
      expect(prompt).toContain('Selected example: "Neon dashboard"');
      expect(prompt).toContain('target audience: developers');
      expect(prompt).toContain('fidelity: high');
    });

    it('pins the example-prompt override above the discovery layer in API mode', () => {
      const prompt = composeSystemPrompt({
        streamFormat: 'plain',
        metadata: { kind: 'prototype', examplePrompt: true },
      });
      const overrideIdx = prompt.indexOf('Initial example Design turn — direct generation');
      const discoveryIdx = prompt.indexOf('# OD core directives');
      expect(overrideIdx).toBeGreaterThanOrEqual(0);
      expect(overrideIdx).toBeLessThan(discoveryIdx);
    });

    it('prefers the example-prompt override over the plain skip-discovery override', () => {
      const prompt = composeSystemPrompt({
        metadata: { kind: 'prototype', examplePrompt: true, skipDiscoveryBrief: true },
      });
      expect(prompt).toContain('Initial example Design turn — direct generation');
      expect(prompt).not.toContain(SKIP_DISCOVERY_BRIEF_OVERRIDE);
    });

    it('does not persist the example override into later turns or non-Design modes', () => {
      const inputs: Array<Parameters<typeof composeSystemPrompt>[0]> = [
        {
          isInitialProjectTurn: false,
          metadata: { kind: 'prototype', examplePrompt: true },
        },
        {
          sessionMode: 'chat' as const,
          metadata: { kind: 'prototype', examplePrompt: true },
        },
        {
          sessionMode: 'plan' as const,
          metadata: { kind: 'prototype', examplePrompt: true },
        },
      ];

      for (const input of inputs) {
        expect(composeSystemPrompt(input)).not.toContain(
          'Initial example Design turn — direct generation',
        );
      }
    });
  });
});
