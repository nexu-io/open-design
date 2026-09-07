import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// `MEDIA_USER_REPLY_CONTRACT` exists twice: the daemon owns the copy that
// composeSystemPrompt actually renders, and packages/contracts carries an
// identical one. Nothing imports the contracts copy today, which is precisely
// what makes the duplication dangerous — editing it looks like changing
// behaviour and changes nothing.
//
// That already happened: the three-outcome refusal wording was added to the
// contracts copy alone, so the primary agent flow kept describing a
// content-safety refusal as a temporary outage. This test is the cheap guard
// against a repeat. Delete it only by deleting one of the two copies.

function templateBody(path: string, exportName = 'MEDIA_USER_REPLY_CONTRACT'): string {
  const source = readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
  const marker = `export const ${exportName} = \``;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`${exportName} not found in ${path}`);
  let index = start + marker.length;
  // Scan for the terminating backtick, skipping escaped ones -- the body
  // itself contains \` around inline code, so a naive search truncates it.
  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }
    if (source[index] === '`') return source.slice(start + marker.length, index);
    index += 1;
  }
  throw new Error(`unterminated template literal in ${path}`);
}

describe('MEDIA_USER_REPLY_CONTRACT mirrors', () => {
  const daemonBody = templateBody('../../src/prompts/media-contract.ts');
  const contractsBody = templateBody(
    '../../../../packages/contracts/src/prompts/media-contract.ts',
  );
  const generationBody = templateBody(
    '../../src/prompts/media-contract.ts',
    'MEDIA_GENERATION_CONTRACT',
  );

  it('keeps the daemon copy and the contracts copy identical', () => {
    expect(daemonBody).toBe(contractsBody);
  });

  it('carries safe English and Simplified Chinese failure categories', () => {
    const normalized = daemonBody.replace(/\s+/g, ' ');
    expect(daemonBody).toContain('图片已生成');
    // Every failure sentence pairs a cause with a next step, and none of them
    // carries an internal code (OPEND-2577).
    expect(daemonBody).toContain('提示词没通过内容审核 —— 换个说法、去掉敏感内容再试。');
    expect(daemonBody).toContain('参考图没通过内容审核 —— 换一张参考图再试。');
    expect(daemonBody).toContain('这个图片模型用不了 —— 换一个图片模型再试。');
    expect(daemonBody).toContain('图片模型的 API key 还没填 —— 在设置里填好就能用。');
    expect(daemonBody).toContain('图片模型的额度用完了 —— 重试不会恢复,去充值或换一个图片模型。');
    expect(daemonBody).toContain('图片生成这会儿不稳定 —— 不是你的问题,过一会儿再试通常就好。');
    expect(daemonBody).toContain('需要更新 Open Design 才能生成图片。');
    expect(daemonBody).toContain('这次任务里不能生成图片 —— 需要图片的话,新建一个图片项目再试。');
    expect(normalized).toContain('Reword it, drop the sensitive details, and try again.');
    expect(normalized).toContain('Pick a different image model and try again.');
    expect(normalized).toContain('Fill it in under Settings and it will work.');
    expect(normalized).toContain('top up, or switch to another image model.');
    expect(normalized).toContain('trying again shortly usually works.');
    expect(daemonBody).toContain('error.subject');
    expect(daemonBody).toContain('error.nextStep');
    expect(daemonBody).not.toContain('错误代码');
    expect(daemonBody).not.toContain('MEDIA_DISPATCH_FAILED');
    expect(daemonBody).not.toContain('MEDIA_EXECUTION_DISABLED');
    expect(daemonBody).not.toContain('STUB_PROVIDER_DISABLED');
    expect(daemonBody).not.toContain('图片生成服务暂时不可用');
  });

  it('routes an unspecified image model through the managed Cloud default', () => {
    expect(generationBody).toContain('otherwise use \\`vela/gpt-image-2\\`');
    expect(generationBody).not.toContain('otherwise use \\`gpt-image-2\\`');
  });
});
