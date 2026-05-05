import { describe, it, expect } from 'vitest';
import { defaultCritiqueConfig } from '@open-design/contracts/critique';
import { composeSystemPrompt } from '../src/prompts/system.js';

const BRAND = { name: 'acme-brand', design_md: '## Tokens\n--accent: oklch(55% 0.18 30)' };
const SKILL = { id: 'web-prototype' };

describe('composeSystemPrompt critique wiring', () => {
  it('when cfg.enabled=true, composed prompt contains <CRITIQUE_RUN', () => {
    const cfg = { ...defaultCritiqueConfig(), enabled: true };
    const out = composeSystemPrompt({ critique: cfg, critiqueBrand: BRAND, critiqueSkill: SKILL });
    expect(out).toContain('<CRITIQUE_RUN');
  });

  it('when cfg.enabled=false (default), composed prompt does NOT contain <CRITIQUE_RUN', () => {
    const cfg = { ...defaultCritiqueConfig(), enabled: false };
    const out = composeSystemPrompt({ critique: cfg, critiqueBrand: BRAND, critiqueSkill: SKILL });
    expect(out).not.toContain('<CRITIQUE_RUN');
  });

  it('when critique is omitted entirely, composed prompt does NOT contain <CRITIQUE_RUN', () => {
    const out = composeSystemPrompt({});
    expect(out).not.toContain('<CRITIQUE_RUN');
  });

  it('when cfg.enabled=true but critiqueBrand is omitted, no panel addendum is added', () => {
    const cfg = { ...defaultCritiqueConfig(), enabled: true };
    const out = composeSystemPrompt({ critique: cfg, critiqueSkill: SKILL });
    expect(out).not.toContain('<CRITIQUE_RUN');
  });

  it('when cfg.enabled=true but critiqueSkill is omitted, no panel addendum is added', () => {
    const cfg = { ...defaultCritiqueConfig(), enabled: true };
    const out = composeSystemPrompt({ critique: cfg, critiqueBrand: BRAND });
    expect(out).not.toContain('<CRITIQUE_RUN');
  });

  it('panel addendum uses maxRounds and scoreThreshold from the cfg', () => {
    const cfg = { ...defaultCritiqueConfig(), enabled: true, maxRounds: 4, scoreThreshold: 9.0 };
    const out = composeSystemPrompt({ critique: cfg, critiqueBrand: BRAND, critiqueSkill: SKILL });
    expect(out).toContain('maxRounds="4"');
    expect(out).toContain('threshold="9"');
  });

  // Round 1 review feedback on PR #524.
  it('skips the panel addendum on image surfaces (skillMode=image)', () => {
    const cfg = { ...defaultCritiqueConfig(), enabled: true };
    const out = composeSystemPrompt({
      critique: cfg,
      critiqueBrand: BRAND,
      critiqueSkill: SKILL,
      skillMode: 'image',
    });
    expect(out).not.toContain('<CRITIQUE_RUN');
  });

  it('skips the panel addendum on video surfaces (skillMode=video)', () => {
    const cfg = { ...defaultCritiqueConfig(), enabled: true };
    const out = composeSystemPrompt({
      critique: cfg,
      critiqueBrand: BRAND,
      critiqueSkill: SKILL,
      skillMode: 'video',
    });
    expect(out).not.toContain('<CRITIQUE_RUN');
  });

  it('skips the panel addendum on audio surfaces (skillMode=audio)', () => {
    const cfg = { ...defaultCritiqueConfig(), enabled: true };
    const out = composeSystemPrompt({
      critique: cfg,
      critiqueBrand: BRAND,
      critiqueSkill: SKILL,
      skillMode: 'audio',
    });
    expect(out).not.toContain('<CRITIQUE_RUN');
  });

  it('skips the panel addendum when project metadata.kind is a media kind', () => {
    const cfg = { ...defaultCritiqueConfig(), enabled: true };
    const out = composeSystemPrompt({
      critique: cfg,
      critiqueBrand: BRAND,
      critiqueSkill: SKILL,
      metadata: { kind: 'image', fidelity: 'production' },
    });
    expect(out).not.toContain('<CRITIQUE_RUN');
  });

  it('still attaches the panel addendum on non-media surfaces (kind=deck)', () => {
    const cfg = { ...defaultCritiqueConfig(), enabled: true };
    const out = composeSystemPrompt({
      critique: cfg,
      critiqueBrand: BRAND,
      critiqueSkill: SKILL,
      metadata: { kind: 'deck', fidelity: 'production' },
    });
    expect(out).toContain('<CRITIQUE_RUN');
  });

  // Round 3 review feedback on PR #524.
  // The composer takes its eligibility decision from the caller. The
  // server-side gate in startChatRun is responsible for suppressing the
  // critique inputs when the adapter is non-plain (see the
  // critiqueShouldRun computation that AND's adapterStreamFormat==='plain'
  // into the eligibility flag, then conditionally threads the critique
  // fields). When the caller does the right thing and passes undefined for
  // critique/critiqueBrand/critiqueSkill on a non-plain adapter, the panel
  // addendum is correctly suppressed:
  it('produces no panel addendum when caller suppresses critique inputs (non-plain adapter case)', () => {
    const out = composeSystemPrompt({
      skillBody: undefined,
      skillName: undefined,
      skillMode: undefined,
      designSystemBody: 'tokens',
      designSystemTitle: 'acme',
      // server gate sets these to undefined when adapter is non-plain
      critique: undefined,
      critiqueBrand: undefined,
      critiqueSkill: undefined,
    });
    expect(out).not.toContain('<CRITIQUE_RUN');
  });
});
