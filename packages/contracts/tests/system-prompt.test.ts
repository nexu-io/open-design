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
});
