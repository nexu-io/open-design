import { describe, expect, it } from 'vitest';

import { composeSystemPrompt } from '../../src/prompts/system.js';

/**
 * Daemon-side mirror of the API-mode override fix for #313.
 *
 * The web-app/BYOK path goes through `@open-design/contracts`'s
 * `composeSystemPrompt`, which got the top-anchored fix first. But the
 * daemon has its own copy at `apps/daemon/src/prompts/system.ts`
 * (invoked by `apps/daemon/src/server.ts:6186-6193` for any agent whose
 * adapter declares `streamFormat: 'plain'` — e.g. DeepSeek). Without
 * mirroring the same fix here, plain-stream daemon agents still hit the
 * old bottom-appended `## API mode rule`, which sits BELOW
 * DISCOVERY_AND_PHILOSOPHY and therefore loses the precedence war
 * against the discovery layer's "TodoWrite on turn 3" hard rule.
 */

describe('daemon composeSystemPrompt — API mode (#313)', () => {
  describe('non-plain stream (no streamFormat)', () => {
    it('keeps the discovery layer TodoWrite hard rule (control)', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).toMatch(/TodoWrite/);
    });

    it('does not inject the API-mode preamble', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).not.toMatch(/API mode — no tools available/i);
    });
  });

  describe('plain stream (streamFormat: plain)', () => {
    it('injects the API-mode override section', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      expect(prompt).toMatch(/API mode — no tools available/i);
    });

    it('pins the override above the discovery layer header', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      const overrideIdx = prompt.search(/API mode — no tools available/i);
      const discoveryIdx = prompt.indexOf('# OD core directives');
      expect(overrideIdx).toBeGreaterThanOrEqual(0);
      expect(discoveryIdx).toBeGreaterThanOrEqual(0);
      expect(overrideIdx).toBeLessThan(discoveryIdx);
    });

    it('drops the obsolete bottom "## API mode rule" section', () => {
      // The old append-at-end section is the precedence bug. With the
      // top-anchored override in place, the trailing section is dead
      // weight and must be removed so we have a single source of truth.
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      expect(prompt).not.toMatch(/## API mode rule\n\nDo not emit tool_calls/);
    });

    it('names every tool the agent must not pretend to call', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      expect(prompt).toMatch(/\bTodoWrite\b/);
      expect(prompt).toMatch(/\bRead\b/);
      expect(prompt).toMatch(/\bWrite\b/);
      expect(prompt).toMatch(/\bEdit\b/);
      expect(prompt).toMatch(/\bBash\b/);
      expect(prompt).toMatch(/\bWebFetch\b/);
    });

    it('forbids the pseudo-tool markup observed in #313', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      expect(prompt).toMatch(/<todo-list>/);
      expect(prompt).toMatch(/\[读取/);
    });

    it('still allows <artifact> output', () => {
      const prompt = composeSystemPrompt({ streamFormat: 'plain' });
      expect(prompt).toMatch(/<artifact>/);
    });
  });
});
