import { describe, expect, it } from 'vitest';

import { composeSystemPrompt } from '../../src/prompts/system.js';
import { MEDIA_USER_REPLY_CONTRACT } from '../../src/prompts/media-contract.js';

/**
 * OPEND-2577 — 「原因未分类(错误代码:MEDIA_DISPATCH_FAILED)」
 *
 * The sentence the user read was not a UI bug. It is what this prompt told the
 * model to write, verbatim. Two things have to hold of the replacement:
 *
 *  1. no internal error code reaches the visible reply — a code is a support
 *     ticket, not a next step, and
 *  2. every failure the user can be shown ends in something they can DO.
 *
 * The assertions below are exact sentences, not "does not contain a code"
 * negatives: a negative passes just as happily against a reply that says
 * nothing at all, which is the other half of the bug.
 */
function imagePrompt(): string {
  return composeSystemPrompt({
    agentId: 'amr',
    locale: 'zh-CN',
    metadata: { kind: 'image', imageModel: 'vela/gpt-image-2' } as any,
  });
}

/** The exact Simplified Chinese sentence for each classified next step. */
const USER_SENTENCES: Record<string, string> = {
  'revise-request · prompt': '提示词没通过内容审核 —— 换个说法、去掉敏感内容再试。',
  'revise-request · input_image': '参考图没通过内容审核 —— 换一张参考图再试。',
  'revise-request · unproven': '这次请求没通过内容审核 —— 换个说法,或者换一张参考图再试。',
  'switch-model': '这个图片模型用不了 —— 换一个图片模型再试。',
  'open-settings': '图片模型的 API key 还没填 —— 在设置里填好就能用。',
  'sign-in': '登录已过期,图片没生成 —— 重新登录后再试一次。',
  'add-credit': '图片模型的额度用完了 —— 重试不会恢复,去充值或换一个图片模型。',
  'retry-later': '图片生成这会儿不稳定 —— 不是你的问题,过一会儿再试通常就好。',
  'update-app': '需要更新 Open Design 才能生成图片。',
  'unsupported': '这次任务里不能生成图片 —— 需要图片的话,新建一个图片项目再试。',
  'contact-support':
    '图片没生成出来,不是你的操作有误 —— 这次是 Open Design 自己的问题,我们已经记下了。重试一般能恢复;反复出现的话联系我们。',
};

/**
 * Codes that used to be printed at the user. They may still appear as JSON
 * field values the model READS (`error.code`), but never inside a sentence the
 * contract tells it to say.
 */
const INTERNAL_CODES = [
  'MEDIA_DISPATCH_FAILED',
  'MEDIA_DISPATCH_NOT_INVOKED',
  'MEDIA_DISPATCHER_UNREACHABLE',
  'MEDIA_CLI_INCOMPATIBLE',
  'MEDIA_EXECUTION_DISABLED',
  'MEDIA_SURFACE_DENIED',
  'MEDIA_MODEL_DENIED',
  'STUB_PROVIDER_DISABLED',
];

describe('media failure copy the user actually reads', () => {
  it('gives every classified failure a sentence with a next step in it', () => {
    const prompt = imagePrompt();
    for (const [label, sentence] of Object.entries(USER_SENTENCES)) {
      expect(prompt, label).toContain(sentence);
    }
  });

  it('never asks the model to print an internal error code to the user', () => {
    // 「错误代码：`…`」 was the literal template that produced the report.
    expect(MEDIA_USER_REPLY_CONTRACT).not.toContain('错误代码');
    expect(MEDIA_USER_REPLY_CONTRACT).not.toContain('error code:');
    for (const code of INTERNAL_CODES) {
      expect(MEDIA_USER_REPLY_CONTRACT, code).not.toContain(code);
    }
  });

  it('routes the model off `error.nextStep`, not off wording or HTTP status', () => {
    const prompt = imagePrompt();
    expect(prompt).toContain('`error.nextStep`');
    expect(prompt).toContain(
      'never re-derive a verdict from wording, HTTP status, a placeholder/stub',
    );
    // The old contract let the model paste a provider `message` through. An
    // upstream sentence is not vetted copy and is not localized.
    expect(MEDIA_USER_REPLY_CONTRACT).not.toContain('{message}');
  });

  it('tells the agent when it may re-dispatch and when it must not', () => {
    const prompt = imagePrompt();
    expect(prompt).toContain('`switch-model`: pick another allowed model');
    expect(prompt).toContain('`retry-later`: dispatch the identical request once more');
    expect(prompt).toContain('every other value: report immediately');
  });

  it('still refuses to claim an outage it cannot prove', () => {
    const prompt = imagePrompt();
    expect(prompt).not.toContain('图片生成服务暂时不可用');
    expect(prompt).toContain('tool output and daemon logs');
  });

  it('keeps the success sentence and the redaction rules', () => {
    const prompt = imagePrompt();
    expect(prompt).toContain('reply exactly `图片已生成`');
    expect(prompt).toContain('stderr, exit codes');
  });
});
