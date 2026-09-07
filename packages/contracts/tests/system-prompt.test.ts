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

  it('uses a bare, self-contained Ask mode override that drops the discovery layer and charter', () => {
    const prompt = composeSystemPrompt({ sessionMode: 'chat' });

    expect(prompt).toContain('# Ask mode — bare conversation');
    expect(prompt).toContain('https://github.com/nexu-io/open-design');
    expect(prompt).toContain('https://open-design.ai/');
    expect(prompt).toContain('https://discord.gg/mHAjSMV6gz');
    expect(prompt).toContain('Do not emit a default discovery `<question-form>`');
    // Ask mode is deliberately light: neither the ~3k-token discovery layer nor
    // the full designer charter is composed in. That omission IS the feature —
    // it is what makes Ask cheaper than Design/Plan.
    expect(prompt).not.toContain(DISCOVERY_AND_PHILOSOPHY);
    expect(prompt).not.toContain('# Identity and workflow charter (background)');
    // T69(2026-09-07):设计风格选择题整题下线,Ask 模式也不再提它
    expect(prompt).not.toContain('direction-cards');
  });

  it('uses a top-level Plan mode override that suppresses artifact discovery forms', () => {
    const prompt = composeSystemPrompt({ sessionMode: 'plan', metadata: { kind: 'prototype' } as any });

    expect(prompt).toContain('# Plan mode — editable document first');
    expect(prompt).toContain('do NOT emit `<question-form id="discovery">`');
    expect(prompt).toContain('`<question-form id="task-type">`');
    expect(prompt).toContain('Quick brief — 30 seconds');
    expect(prompt).toContain('<question-form id="plan-brief">');
    expect(prompt).toContain('substantial plan-document work still starts with a real TodoWrite/task-list tool call');
    expect(prompt).toContain('show progress through the Todo card');
    expect(prompt.indexOf('# Plan mode — editable document first')).toBeLessThan(
      prompt.indexOf(DISCOVERY_AND_PHILOSOPHY),
    );
  });
});

describe('DISCOVERY_AND_PHILOSOPHY (contracts copy) — prompt routing parity', () => {
  it('keeps image result copy user-friendly without discarding tool diagnostics', () => {
    const prompt = composeSystemPrompt({
      locale: 'zh-CN',
      metadata: { kind: 'image' } as any,
    });

    expect(prompt).toContain('reply exactly `图片已生成`');
    expect(prompt).toContain('提示词没通过内容审核 —— 换个说法、去掉敏感内容再试。');
    expect(prompt).toContain(
      '图片没生成出来,不是你的操作有误 —— 这次是 Open Design 自己的问题,我们已经记下了。重试一般能恢复;反复出现的话联系我们。',
    );
    // OPEND-2577: an internal code is a support ticket, not a next step.
    expect(prompt).not.toContain('错误代码');
    expect(prompt).not.toContain('图片生成服务暂时不可用');
    expect(prompt).toContain('tool output and daemon logs');
    expect(prompt).not.toContain('surface the actual stderr / exit status');
  });

  it('keeps clarification on demand and leaves task-type routing to od-default', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'A first turn, a new project, a discovery stage, or an unfilled metadata field does not by itself require a form.',
    );
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'It owns the conditional `task-type` form',
    );
    expect(DISCOVERY_AND_PHILOSOPHY).not.toContain('<question-form id="task-type"');
  });

  /**
   * T69(2026-09-07):设计风格选择题从提示词整题下线,产品逐字「**不问了**」。
   * 原用例守的是「API/BYOK 这条路也要教 host 目录契约」,现在守它不再教。
   *
   * ⚠️ **答案解读那一半故意留着**(`od tools directions` 那条):缓存的旧提示词、
   * 旧客户端、模型记住的旧格式都还可能把一份 Host 目录答案交上来,那时 agent
   * 必须仍然知道 `value` / `foundation` / `guidance` 怎么用 —— 这和渲染器继续
   * 认得 `direction-cards` 是同一件事的两面(见 e2e `DORMANT_TYPES`)。
   * 撤的是**发问的能力**,不是**读答案的能力**。
   */
  it('API/BYOK 提示词不再教怎么出设计风格题,但仍会读旧答案', () => {
    const prompt = composeSystemPrompt({ metadata: { kind: 'other' } as any });
    expect(prompt).not.toContain('direction-cards');
    expect(prompt).not.toContain("host-owned visual-style catalog");
    expect(prompt).toContain(
      'the Host value is catalogue identity and must not be passed to `od tools directions`',
    );
    expect(prompt).not.toContain('draft 3–5 distinct directions');
  });

  it('keeps historical task-type answers compatible with the discovery path', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toMatch(
      /\[form answers — discovery\][^.]*\[form answers — task-type\]/,
    );
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'Historical `[form answers — task-type]` replies remain valid input to RULE 2.',
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

  it('defaults generated deliverables to semantic filenames after active skills', () => {
    const prompt = composeSystemPrompt({
      skillName: 'simple-deck',
      skillBody: 'Copy assets/template.html to index.html, then fill the deck.',
    });

    expect(prompt).toContain('## Semantic output file names');
    expect(prompt).toContain('Do not call every new artifact `index.html`');
    expect(prompt).toContain('adapt the destination to a semantic filename');
    expect(prompt.indexOf('## Semantic output file names')).toBeGreaterThan(
      prompt.indexOf('## Active skill — simple-deck'),
    );
  });

  it('does not make index.html the fixed deck-framework destination', () => {
    const prompt = composeSystemPrompt({ skillMode: 'deck' });

    expect(prompt).not.toContain('Copy the canonical skeleton below as index.html');
    expect(prompt).toContain('semantically named deck HTML file');
  });

  it('pins the data chart discipline inside the deck framework (#907)', () => {
    const prompt = composeSystemPrompt({ skillMode: 'deck' });

    expect(prompt).toContain('## Data chart discipline');
    expect(prompt).toContain('calc(var(--v) / var(--max)');
    expect(prompt).toContain('visible category label AND value label');
    expect(prompt).toContain('Mentally spot-check two bars');
  });

  it('pins the mermaid theme discipline inside the deck framework (dark decks)', () => {
    const prompt = composeSystemPrompt({ skillMode: 'deck' });

    expect(prompt).toContain('## Mermaid diagram theme discipline');
    expect(prompt).toContain("theme: 'dark'");
    expect(prompt).toContain('themeVariables');
    expect(prompt).toContain('no dark-on-dark labels');
  });

  it('ships API/BYOK decks with the same OD Deck Protocol v1', () => {
    const prompt = composeSystemPrompt({ skillMode: 'deck', streamFormat: 'plain' });

    expect(prompt).toContain('data-od-deck-protocol="1"');
    expect(prompt).toContain("type: 'od:deck-ready'");
    expect(prompt).toContain("data.type !== 'od:slide'");
    expect(prompt).toContain('go(target);');
    expect(prompt).toContain("type: 'od:slide-state'");
    expect(prompt).toContain('## Final handoff — text artifact');
    expect(prompt).toContain('MUST contain exactly one `<artifact type="text/html">...</artifact>` block');
    expect(prompt).toContain('the artifact block itself is the canonical deliverable');
    expect(prompt).not.toContain('## Final handoff — filesystem');
    expect(prompt).not.toContain('summarize the written or changed deck file');
  });

  it('ships API/BYOK prototype follow-up deck requests with Deck Protocol v1', () => {
    const prompt = composeSystemPrompt({
      metadata: { kind: 'prototype' },
      skillMode: 'prototype',
      skillBody: '# Prototype seed\n\nCopy `assets/template.html` before building.',
      freeformDeckSignal: true,
      streamFormat: 'plain',
    });

    expect(prompt).toContain('data-od-deck-protocol="1"');
    expect(prompt).toContain("type: 'od:deck-ready'");
    expect(prompt).toContain("type: 'od:slide-state'");
    expect(prompt).toContain('## Final handoff — text artifact');
  });

  it('injects nested-diagram discipline through every contracts deck path only', () => {
    const heading = '## Nested / concentric diagram discipline';

    expect(composeSystemPrompt({ skillMode: 'deck' })).toContain(heading);
    expect(composeSystemPrompt({ metadata: { kind: 'deck' } as any })).toContain(heading);
    expect(composeSystemPrompt({})).toContain(heading);
    expect(composeSystemPrompt({ metadata: { kind: 'prototype' } as any })).not.toContain(heading);
  });
});

describe('composeSystemPrompt', () => {
  it('injects Chinese quick brief guidance when the UI locale is zh-CN', () => {
    const prompt = composeSystemPrompt({ locale: 'zh-CN' });

    expect(prompt).toContain('# UI locale override');
    expect(prompt).toContain('`zh-CN` (Simplified Chinese)');
    expect(prompt).toContain('快速简报 — 30 秒');
    expect(prompt).toContain('目标用户');
    /* 这里原本钉的是 `视觉调性` —— 调性题的中文文案。OPEND-2760 把设计风格
       选择整题下线后,那一行连同它那串风格选项(`编辑 / 杂志感`、`现代极简`…)
       一起从样例里撤走,否则 zh-CN 用户的提示词里等于还摆着一份风格菜单。
       改钉 `品牌背景` —— 品牌题按裁决保留,同样能证明样例块确实注入了。 */
    expect(prompt).toContain('品牌背景');
    expect(prompt).not.toContain('视觉调性');
    expect(prompt).toContain('Keep machine-readable ids and object option `value` fields exact and unlocalized');
  });

  it('does not inject a task-type form through the zh-CN locale override', () => {
    const prompt = composeSystemPrompt({ locale: 'zh-CN' });

    expect(prompt).not.toContain('<question-form id="task-type"');
    expect(prompt).not.toContain('keep the `taskType` option labels');
  });

  it('does not inject a task-type form through the zh-TW locale override', () => {
    const prompt = composeSystemPrompt({ locale: 'zh-TW' });

    expect(prompt).toContain('# UI locale override');
    expect(prompt).toContain('`zh-TW` (Traditional Chinese)');
    expect(prompt).not.toContain('<question-form id="task-type"');
    expect(prompt).not.toContain('keep the `taskType` option labels');
    expect(prompt).not.toContain('快速简报 — 30 秒');
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
