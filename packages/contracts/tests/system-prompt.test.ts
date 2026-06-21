import { describe, expect, it } from 'vitest';

import { composeSystemPrompt } from '../src/prompts/system.js';
import { DISCOVERY_AND_PHILOSOPHY } from '../src/prompts/discovery.js';

// Guard: the contracts copy of DISCOVERY_AND_PHILOSOPHY must have the same
// cap removal as apps/daemon/src/prompts/discovery.ts. The web app imports
// composeSystemPrompt from @open-design/contracts, so only testing the daemon
// copy leaves the web-originated chat path unguarded.
describe('DISCOVERY_AND_PHILOSOPHY (contracts copy) — TodoWrite plan item count', () => {
  it('does not cap the plan at 10 items via "5–10" wording', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).not.toMatch(/5[–\-]10\s+short\s+imperative/);
  });

  it('does not cap the plan at 10 items via "5 to 10" wording', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).not.toMatch(/5 to 10\s+(?:short\s+)?items/i);
  });

  it('does not re-introduce a numeric cap via "at most / maximum / no more than" phrasing', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).not.toMatch(
      /(?:at most|maximum|no more than)\s+1[0-9]\s+(?:todo|plan|step|item)/i,
    );
  });

  it('still instructs the agent to write a TodoWrite plan', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('TodoWrite');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('RULE 3');
  });

  it('also absent from the composed system prompt', () => {
    const prompt = composeSystemPrompt({});
    expect(prompt).not.toMatch(/5[–\-]10\s+short\s+imperative/);
  });

  it('uses a top-level Chat mode override for conversational sessions', () => {
    const prompt = composeSystemPrompt({ sessionMode: 'chat' });

    expect(prompt).toContain('# Chat mode — standard conversation');
    expect(prompt).toContain('https://github.com/nexu-io/open-design');
    expect(prompt).toContain('https://open-design.ai/');
    expect(prompt).toContain('https://discord.gg/9ptkbbqRu');
    expect(prompt).toContain('do not emit a default discovery `<question-form>`');
    expect(prompt.indexOf('# Chat mode — standard conversation')).toBeLessThan(
      prompt.indexOf(DISCOVERY_AND_PHILOSOPHY),
    );
  });
});

describe('DISCOVERY_AND_PHILOSOPHY (contracts copy) — prompt routing parity', () => {
  it('uses the single-shot task-type form shape from the daemon prompt', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('<question-form id="task-type"');
    for (const id of ['taskType', 'audience', 'brand', 'scale', 'constraints']) {
      expect(DISCOVERY_AND_PHILOSOPHY).toContain(`"id": "${id}"`);
    }
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'This form is intentionally a **single-shot brief**',
    );
    expect(DISCOVERY_AND_PHILOSOPHY).toMatch(
      /do NOT emit a second `<question-form id="discovery">` \/ "Quick brief — 30 seconds" form/,
    );
  });

  it('routes task-type form answers through the same RULE 2 / RULE 3 path as discovery answers', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toMatch(
      /\[form answers — discovery\][^.]*\[form answers — task-type\]/,
    );
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'Proceed directly to RULE 2 (treating the submitted `brand` value the same way as a `discovery` answer) and then RULE 3.',
    );
  });

  it('keeps artifact emission conditional on writing a new canonical HTML file', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('## Artifact emission is conditional');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'only when this turn wrote a new canonical HTML file',
    );
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'If this turn only edited an existing HTML file',
    );
  });
});

describe('composeSystemPrompt', () => {
  it('injects Chinese quick brief guidance when the UI locale is zh-CN', () => {
    const prompt = composeSystemPrompt({ locale: 'zh-CN' });

    expect(prompt).toContain('# UI locale override');
    expect(prompt).toContain('`zh-CN` (Simplified Chinese)');
    expect(prompt).toContain('快速简报 — 30 秒');
    expect(prompt).toContain('目标用户');
    expect(prompt).toContain('视觉调性');
    expect(prompt).toContain('Keep machine-readable ids and object option `value` fields exact and unlocalized');
  });

  it('preserves canonical default task-type options under locale overrides', () => {
    const prompt = composeSystemPrompt({ locale: 'zh-CN' });

    expect(prompt).toContain(
      'keep the `taskType` option labels as the canonical routing choices',
    );
    for (const option of [
      'Prototype',
      'Live artifact',
      'Slide deck',
      'Image',
      'Video',
      'HyperFrames',
      'Audio',
      'Other',
    ]) {
      expect(prompt).toContain(`"${option}"`);
    }
    expect(prompt).not.toContain('option labels as `原型`');
    expect(prompt).not.toContain('`实时作品`');
  });

  it('preserves canonical default task-type options for zh-TW locale overrides', () => {
    const prompt = composeSystemPrompt({ locale: 'zh-TW' });

    expect(prompt).toContain('# UI locale override');
    expect(prompt).toContain('`zh-TW` (Traditional Chinese)');
    expect(prompt).toContain(
      'keep the `taskType` option labels as the canonical routing choices',
    );
    for (const option of [
      'Prototype',
      'Live artifact',
      'Slide deck',
      'Image',
      'Video',
      'HyperFrames',
      'Audio',
      'Other',
    ]) {
      expect(prompt).toContain(`"${option}"`);
    }
    expect(prompt).not.toContain('快速简报 — 30 秒');
    expect(prompt).not.toContain('option labels as `原型`');
    expect(prompt).not.toContain('`实时作品`');
  });

  it('treats an active design system as the visual direction', () => {
    const prompt = composeSystemPrompt({
      designSystemTitle: 'ComfyUI',
      designSystemBody: '# ComfyUI\n\n--accent: #ffd500',
      metadata: { kind: 'prototype' } as any,
      activeStageBlocks: [
        '\n\n## Active stage: plan\n\n### direction-picker\n\nAsk for 3-5 directions.',
      ],
    });

    expect(prompt).toContain('## Active design system — ComfyUI');
    expect(prompt).toContain('Active design system exception');
    expect(prompt).toContain(
      'the active design system is the visual direction for this project',
    );
    expect(prompt).toContain('Do not ask the user to pick a separate theme color');
    expect(prompt).toContain('Do not emit a direction question-form');
    expect(prompt).not.toContain('<question-form id="direction"');
    expect(prompt.indexOf('## Active design system visual direction')).toBeGreaterThan(
      prompt.indexOf('### direction-picker'),
    );
  });

  it('does not include the HTML discovery layer for media surfaces', () => {
    const prompt = composeSystemPrompt({
      metadata: {
        kind: 'image',
        imageModel: 'fal/imagen4',
        imageAspect: '16:9',
      } as any,
    });

    expect(prompt).not.toContain('# OD core directives');
    expect(prompt).not.toContain('<question-form id="discovery"');
    expect(prompt).toContain('## Media generation contract');
  });
});
