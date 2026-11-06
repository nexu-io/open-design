/**
 * 「尚未登录」这句话有**两个**主语,所以不能是一个键。
 *
 * S02(本地 agent 没登录)说的是「{智能体} 尚未登录」——「哪一个 agent」是这句话
 * 的全部信息量;S04(Open Design 智能体没授权)说的是「Open Design 尚未登录」,
 * 主语固定,而且它的出路是卡内一键授权,不是去终端。两句话不同、两颗按钮不同,
 * 却共用 `chat.runError.title.signInRequired` 一个键 —— 一个键装不下两句话。
 *
 * 这个文件钉的是**拆完之后每个调用点落在哪一边**。渲染层的判据在
 * `tests/components/chat/s01-s02-s04-error-card-titles.test.tsx`;这里更便宜,
 * 而且能把「今天一共有几个调用点」这件事写死 —— 漏掉一个(尤其是隔了一百多行、
 * code 又和 S02 一模一样的 Antigravity 那个)不会有人察觉。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveRunFailureUi } from '../../src/runtime/amr-guidance';

const CLOUD = 'chat.runError.title.signInRequired.amr';
const LOCAL_AGENT = 'chat.runError.title.signInRequired.other';

describe('title.signInRequired 拆成 S02 / S04 两边', () => {
  // S04 · Open Design 智能体没登录 / 授权过期。三个 code 都归它 ——
  // daemon 的分类器早就把这三个当成同一类(category `auth`)。
  it.each(['AMR_AUTH_REQUIRED', 'AGENT_AUTH_REQUIRED', 'UNAUTHORIZED'])(
    'AMR 的 %s 落在 Cloud 那一边',
    (code) => {
      expect(resolveRunFailureUi(code, null, 'amr').titleKey).toBe(CLOUD);
    },
  );

  // S02 · 本地 agent 没登录 / 登录过期。
  it.each([
    ['claude', 'AGENT_AUTH_REQUIRED'],
    ['claude', 'UNAUTHORIZED'],
    ['codex', 'AGENT_AUTH_REQUIRED'],
    // Antigravity 有自己的分支(登录只能在终端里做),但它**是**本地 agent 没登录。
    ['antigravity', 'AGENT_AUTH_REQUIRED'],
  ])('%s 的 %s 落在本地 agent 那一边', (agentId, code) => {
    expect(resolveRunFailureUi(code, null, agentId).titleKey).toBe(LOCAL_AGENT);
  });

  it('Antigravity 那条终端登录仍然是它自己那颗按钮 —— 拆键不许把分流拆没了', () => {
    const ui = resolveRunFailureUi('AGENT_AUTH_REQUIRED', null, 'antigravity');
    expect(ui.primaryAction).toBe('launch-terminal-auth');
    expect(ui.secondaryRetry).toBe(true);
  });

  it('两边不是同一个键', () => {
    expect(CLOUD).not.toBe(LOCAL_AGENT);
  });

  /*
   * 拆完之后旧键必须**在映射表里彻底消失**。留着它就是留一个「随便哪一边」的
   * 落点:下一个人补分流时看到 `signInRequired` 还在,顺手就用了。
   */
  it('映射表里再没有那个合并键', () => {
    const src = readFileSync(
      resolve(__dirname, '../../src/runtime/amr-guidance.ts'),
      'utf8',
    );
    expect(src).not.toMatch(/'chat\.runError\.title\.signInRequired'/);
  });
});
