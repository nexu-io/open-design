import { describe, expect, it } from 'vitest';

import {
  COPYRIGHT_GUARDRAIL_BULLET,
  OFFICIAL_DESIGNER_PROMPT,
  WEB_CLONE_COPYRIGHT_GUARDRAIL_BULLET,
  renderOfficialDesignerPrompt,
} from '../src/prompts/official-system.js';

describe('official designer prompt', () => {
  it('documents unique data-od-id values for repeated inspectable HTML elements', () => {
    expect(OFFICIAL_DESIGNER_PROMPT).toContain('data-od-id');
    expect(OFFICIAL_DESIGNER_PROMPT).toContain('kebab-case');
    expect(OFFICIAL_DESIGNER_PROMPT).toMatch(/h1.*h6|h1.*h2.*h3.*h4.*h5.*h6/s);
    expect(OFFICIAL_DESIGNER_PROMPT).toMatch(/buttons?|<button>/i);
    expect(OFFICIAL_DESIGNER_PROMPT).toMatch(/links?|<a>/i);
    expect(OFFICIAL_DESIGNER_PROMPT).toMatch(/form controls?/i);
    expect(OFFICIAL_DESIGNER_PROMPT).toMatch(/cards?.*list items?/is);
    expect(OFFICIAL_DESIGNER_PROMPT).toMatch(/unique within the artifact/i);
    expect(OFFICIAL_DESIGNER_PROMPT).toMatch(/repeated cards?.*distinct ids/is);
    expect(OFFICIAL_DESIGNER_PROMPT).toContain('feature-card-security');
    expect(OFFICIAL_DESIGNER_PROMPT).toContain('feature-card-speed');
    expect(OFFICIAL_DESIGNER_PROMPT).toMatch(/feature-card-2|numeric suffix/i);
    expect(OFFICIAL_DESIGNER_PROMPT).toMatch(/decorative elements|spacers?|dividers?/is);
  });

  it('keeps the copyright guardrail bullet by default', () => {
    // The swap in renderOfficialDesignerPrompt replaces this exact string —
    // if the prompt's inline bullet drifts from the exported constant the
    // web-clone substitution silently stops working.
    expect(OFFICIAL_DESIGNER_PROMPT).toContain(COPYRIGHT_GUARDRAIL_BULLET);
    const rendered = renderOfficialDesignerPrompt('filesystem');
    expect(rendered).toContain(COPYRIGHT_GUARDRAIL_BULLET);
    expect(rendered).not.toContain(WEB_CLONE_COPYRIGHT_GUARDRAIL_BULLET);
  });

  it('swaps the guardrail for faithful reproduction on web-clone runs', () => {
    const rendered = renderOfficialDesignerPrompt('filesystem', { webCloneFidelity: true });
    expect(rendered).not.toContain(COPYRIGHT_GUARDRAIL_BULLET);
    expect(rendered).toContain(WEB_CLONE_COPYRIGHT_GUARDRAIL_BULLET);
    expect(rendered).not.toContain('Help the user build something original instead');
  });
});
