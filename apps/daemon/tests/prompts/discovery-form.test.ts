import { describe, expect, it } from 'vitest';

import { renderDiscoveryAndPhilosophy } from '../../src/prompts/discovery.js';

const DISCOVERY_AND_PHILOSOPHY = renderDiscoveryAndPhilosophy('filesystem');

describe('discovery.ts — on-demand clarification policy', () => {
  it('skips the form when the brief and known context are sufficient', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'If they provide enough information to make a sound design and delivery decision, skip the form',
    );
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'Skip the form whenever the brief and known context are sufficient',
    );
  });

  it('asks only for unresolved information that materially changes the result', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'only when an unresolved answer would materially change the design direction, content structure, or delivery format',
    );
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'A missing field is an unresolved fact, not an instruction to ask',
    );
  });

  it('does not use turn number, project creation, stage presence, or empty metadata as triggers', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'A first turn, a new project, a discovery stage, or an unfilled metadata field does not by itself require a form',
    );
    for (const forbidden of [
      'turn 1 must emit',
      'very first output',
      'The form **applies** even when',
      'ask anyway',
      '**Only** skip the form',
    ]) {
      expect(DISCOVERY_AND_PHILOSOPHY).not.toContain(forbidden);
    }
  });

  it('keeps the generic question-form protocol and stable brand branches', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('<question-form id="discovery"');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"value": "pick_direction"');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"value": "brand_spec"');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"value": "reference_match"');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('**Hard cap: 5 questions per form — never more.**');
  });

  /**
   * T69(2026-09-07):设计风格选择题从提示词整题下线,产品逐字「**不问了**」。
   *
   * 原用例守的是「`direction-cards` 是 host 目录触发器」这套用法说明。现在反过来:
   * 开场简报里**两个入口**都要没了 —— 明面上的 `direction-cards`,和那道长得像
   * 普通单选、却被 `QuestionForm.tsx` 的 `asksVisualDirection` 认走换成整份目录的
   * `tone`。只撤前者会留下后者这条更隐蔽的路。
   */
  it('开场简报不再提供任何一条问设计风格的路', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).not.toContain('direction-cards');
    expect(DISCOVERY_AND_PHILOSOPHY).not.toContain('visual-style catalog');
    expect(DISCOVERY_AND_PHILOSOPHY).not.toMatch(/"id":\s*"tone"/);
    // 防真空:示例简报本身还在,别的题一道没少
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"id": "output"');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"id": "brand"');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain('"id": "scale"');
  });

  it('leaves the task-type form to od-default while accepting historical answers', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).not.toContain('<question-form id="task-type"');
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'It owns the conditional `task-type` form; do not reproduce or extend that form here',
    );
    expect(DISCOVERY_AND_PHILOSOPHY).toMatch(
      /\[form answers — discovery\][^.]*\[form answers — task-type\]/,
    );
  });

  it('emits a complete form before tools only after clarification is needed', () => {
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'When a form is needed, emit the complete block before TodoWrite, file writes, Bash, or other native tools',
    );
    expect(DISCOVERY_AND_PHILOSOPHY).toContain(
      'After `</question-form>`, **stop your turn**',
    );
  });
});
