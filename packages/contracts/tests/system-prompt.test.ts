import { describe, expect, it } from 'vitest';

import { composeSystemPrompt } from '../src/prompts/system.js';

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
