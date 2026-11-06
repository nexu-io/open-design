import { describe, expect, it } from 'vitest';

import { renderOfficialDesignerPrompt } from '../../src/prompts/official-system.js';
import { renderSlimCoreCharter } from '../../src/prompts/core-slim.js';

/**
 * W81 — 「桌面渲染服务暂不可用，本轮未能生成截图预览」
 *
 * Same shape of defect as OPEND-2577 (see `media-failure-user-copy.test.ts`):
 * the sentence the user read is not a UI bug and not a host injection — it is
 * what our own prompt told the model to write.
 *
 * Two real captures, worded differently, which is itself the proof that the
 * model composed them rather than a template emitting them:
 *
 *   apps/web/tests/fixtures/chat/codex-todo.turn0.json
 *     「静态检查通过；桌面渲染服务当前不可用，因此未能生成最终预览图。」
 *   apps/daemon/tests/next-step-marker.test.ts (原文照抄 of a real run)
 *     「桌面渲染服务暂不可用，未生成截图，其余静态检查均已完成。」
 *
 * The render check is host infrastructure the user never asked for. Its
 * outcome is not a deliverable, so — exactly like the media contract's
 * "Keep operational details in the tool output and daemon logs" — it must not
 * be narrated in the visible reply.
 *
 * The distinction this file has to hold, in both directions:
 *
 *   - 「本轮没生成截图」 is host state. It must NOT reach the reply.
 *   - 「静态检查已通过」 is the model reporting its OWN work. It must survive.
 *
 * So every negative below is paired with a positive. A bare negative would
 * pass just as happily against a prompt that says nothing at all, and against
 * a fix that deleted the static self-check along with the leak.
 */

const CLASSIC = renderOfficialDesignerPrompt('filesystem');
const SLIM = renderSlimCoreCharter('filesystem');
const CORES: ReadonlyArray<readonly [string, string]> = [
  ['classic (official-system.ts)', CLASSIC],
  ['slim (core-slim.ts)', SLIM],
];

describe('render-check failure stays out of the visible reply', () => {
  it('no core tells the model to announce a failed render check to the user', () => {
    // These are the two exact instructions that produced the reported
    // sentence. Both were live: `classic` is BASE_SYSTEM_PROMPT, `slim` is
    // selected via OD_PROMPT_CORE=slim.
    expect(CLASSIC).not.toContain('say so in your reply');
    expect(SLIM).not.toContain('state that clearly');
  });

  it('every core states that the render step is host infrastructure, not reply material', () => {
    // Positive half: the replacement has to actually say where the failure
    // goes, or the model is left to its own judgement and defaults back to
    // being helpfully transparent about it.
    for (const [label, prompt] of CORES) {
      expect(prompt, label).toContain('tool output and daemon logs');
      expect(prompt, label).toContain('never narrate it in the visible reply');
    }
  });

  it('keeps the model reporting its OWN static verification', () => {
    // Reverse control. 「静态检查已通过」 is legitimate self-reporting about
    // work the model actually did; the fix must not take it out with the
    // infrastructure leak.
    expect(CLASSIC).toContain('Static self-check');
    expect(SLIM).toContain('deliver based on the static verification');
  });

  it('keeps the one-render budget that stops the retry loop', () => {
    // The anti-loop rule is a token-cost guard that shares these lines.
    // Rewriting the leak must not drop it.
    expect(CLASSIC).toContain('One render check is the budget');
    expect(SLIM).toContain('Render at most once per task');
  });
});
