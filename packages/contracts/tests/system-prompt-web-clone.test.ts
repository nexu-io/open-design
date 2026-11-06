import { describe, expect, it } from 'vitest';

import { composeSystemPrompt } from '../src/prompts/system.js';
import {
  COPYRIGHT_GUARDRAIL_BULLET,
  WEB_CLONE_COPYRIGHT_GUARDRAIL_BULLET,
} from '../src/prompts/official-system.js';

// The daemon prompt (apps/daemon/src/prompts/system.ts) swaps the copyright
// guardrail for a faithful-reproduction rule on `intent: 'web-clone'` runs. The
// web app builds its prompt from THIS contracts copy via composeSystemPrompt, so
// API/BYOK-backed web-clone runs must get the identical swap — otherwise the
// feature is inconsistent across execution modes (blocking review on PR #5178).
describe('composeSystemPrompt — web-clone copyright guardrail swap (BYOK parity)', () => {
  it('keeps the original "build something original" guardrail for non-web-clone runs', () => {
    const prompt = composeSystemPrompt({ sessionMode: 'plan', metadata: { kind: 'prototype' } as any });
    expect(prompt).toContain(COPYRIGHT_GUARDRAIL_BULLET);
    expect(prompt).not.toContain(WEB_CLONE_COPYRIGHT_GUARDRAIL_BULLET);
  });

  it('swaps in the faithful-reproduction rule when metadata.intent is web-clone', () => {
    const prompt = composeSystemPrompt({
      sessionMode: 'plan',
      metadata: { kind: 'prototype', intent: 'web-clone' } as any,
    });
    expect(prompt).toContain(WEB_CLONE_COPYRIGHT_GUARDRAIL_BULLET);
    expect(prompt).not.toContain(COPYRIGHT_GUARDRAIL_BULLET);
  });

  it('guards that the swapped bullet is byte-identical to the one inside the prompt', () => {
    // If OFFICIAL_DESIGNER_PROMPT's bullet drifts from COPYRIGHT_GUARDRAIL_BULLET,
    // the .replace() becomes a silent no-op and web-clone runs keep the wrong rule.
    const base = composeSystemPrompt({ sessionMode: 'plan', metadata: { kind: 'prototype' } as any });
    const cloned = composeSystemPrompt({
      sessionMode: 'plan',
      metadata: { kind: 'prototype', intent: 'web-clone' } as any,
    });
    expect(cloned).not.toEqual(base);
  });
});

// The daemon suppresses the active-design-system sections for web-clone runs so
// the cloned site's palette/typography wins; the contracts composer (used for
// API/BYOK) must do the same or a BYOK web-clone run with an active design system
// is still told the design system is authoritative (blocking review on #5178).
describe('composeSystemPrompt — web-clone suppresses active-design-system guidance (BYOK parity)', () => {
  const DS = { designSystemBody: '# Tokens\n--brand: #ff0000;', designSystemTitle: 'Acme' };
  const AUTHORITATIVE = 'Treat the following DESIGN.md as authoritative';

  it('includes the authoritative design-system block for a normal prototype run', () => {
    const prompt = composeSystemPrompt({ sessionMode: 'plan', metadata: { kind: 'prototype' } as any, ...DS });
    expect(prompt).toContain(AUTHORITATIVE);
  });

  it('drops the authoritative design-system block for a web-clone run', () => {
    const prompt = composeSystemPrompt({
      sessionMode: 'plan',
      metadata: { kind: 'prototype', intent: 'web-clone' } as any,
      ...DS,
    });
    expect(prompt).not.toContain(AUTHORITATIVE);
    // and still carries the design-system body verbatim NOWHERE — the whole block is gone
    expect(prompt).not.toContain(DS.designSystemBody);
  });
});
