// @vitest-environment jsdom
/**
 * OPEND-2612 / OPEND-2402 —— 表单选项的**说明文案必须能换行**。
 *
 * 现象:单选项底下那行说明单行横穿出去,被卡的右边距裁掉,结尾读不到。
 * 用户截图里的三条(本文件照原样当夹具用):
 *   「以 Dify 真实定位(开源 LLM 应用开发平台)与真实功能域编…」
 *   「保留本模板的编辑文体与叙事节奏,按 Dify 气质改写;数字、…」
 *   「拼贴板为抽象超现实艺术风格、不含品牌字标、直接沿用,改…」
 *
 * ── 病根是层叠,不是哪条规则写错了 ──────────────────────────────────
 * 选项行是 `<button class="qf-chip">`(照抄稿子的 `.opt`),于是继承
 * `styles/primitives.css` 的裸 `button { white-space: nowrap }` —— 那条是给
 * 「一行字的按钮」定的,对真正的单行按钮是对的,不该为这张卡去动它。
 * 修法是在 `.qf-chip` 自己那份「按钮默认值归零」里把 `white-space` 一起归零
 * (`9b22818c70`,2026-09-02)。两条规则的**文本都对**,只有谁赢决定文案换不换行。
 *
 * `min-width` / `overflow-wrap` 是同一件事的另一半:`.qf-chip` 是一行 flex,
 * 文案列默认 `min-width: auto` 缩不到 min-content 以下,中英混排里一段断不开的
 * 长串(夹具里的「开源 LLM 应用开发平台」「Dify」)会把整列顶出容器。
 * 注意这两条**在 `white-space` 归零之前是空转的** —— 压根不许换行的时候,
 * 「能缩多窄」和「能不能在词中间断」都轮不到被咨询,所以三条要一起钉。
 *
 * ── 这一页证明什么、不证明什么 ──────────────────────────────────────
 * ⚠️ **jsdom 不做布局**,所以这里量不到「文案有没有真的被裁掉」这件视觉事实。
 * 量到的是**层叠结果**:在真实样式表链(含病根那张 `primitives.css`)下,
 * 选项行最终拿到的 `white-space` 是谁给的、值是什么。这正是缺陷的机制本身,
 * 也是回归会从哪儿回来的地方 —— 有人把 `.qf-chip` 的那条删掉/挪走,这一页当场红。
 * 视觉结果本身仍未在本轮验证。
 *
 * 量法照 `question-form-option-cascade-leak.test.tsx`:不使用
 * `getComputedStyle`(jsdom 不做特异性层叠,也不解 `var()`),而是按 `index.css`
 * 的顺序把真实样式表读进来,用 `chat-mirror-cascade` 那把尺子自己算胜出声明。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { I18nProvider } from '../../../src/i18n';
import { QuestionFormView } from '../../../src/components/QuestionForm';
import type { QuestionForm } from '../../../src/artifacts/question-form';
import chatRootStyles from '../../../src/components/chat/ChatRoot.module.css';
import { createResolver, hashed } from '../../helpers/chat-mirror-cascade';

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '../../..');
const read = (p: string): string => readFileSync(resolve(WEB, p), 'utf-8');

const TARGETS = ['white-space', 'min-width', 'overflow-wrap'] as const;

/** 产品 `index.css` 的导入顺序(只取够得着选项行的那几张)。 */
const CSS = createResolver(
  [
    read('src/styles/tokens.css'),
    read('src/styles/base.css'),
    readFileSync(resolve(WEB, '../../packages/components/src/styles.css'), 'utf-8'),
    read('src/styles/primitives.css'),
    read('src/styles/chat.css'),
    read('src/styles/viewer/core.css'),
    read('src/styles/viewer/composio.css'),
    hashed(
      read('src/components/chat/ChatRoot.module.css'),
      chatRootStyles as unknown as Record<string, string>,
    ),
  ],
  [read('src/styles/tokens.css'), read('src/styles/base.css')],
  TARGETS,
);

/* ── 夹具:用户截图里那两问,说明文案照原样 ─────────────────────────── */

const LONG_DESC =
  '以 Dify 真实定位(开源 LLM 应用开发平台)与真实功能域编写,不沿用 OpenDesign 的说法';

const FORM: QuestionForm = {
  id: 'dify-rewrite',
  title: 'OpenDesign 落地页 → Dify 改版口径',
  lang: 'zh-CN',
  questions: [
    {
      id: 'copy-voice',
      label: '文案口径采用哪种?',
      type: 'radio',
      options: [
        { label: '真实信息口径(推荐)', value: 'real', description: LONG_DESC },
        {
          label: '概念演示稿',
          value: 'concept',
          description: '保留本模板的编辑文体与叙事节奏,按 Dify 气质改写;数字、指标一律不当真',
        },
      ],
    },
  ],
};

function mountOptionRow(): HTMLElement {
  const { container } = render(
    <I18nProvider initial="zh-CN">
      <div className="app">
        <div className={chatRootStyles.root} data-chat-root="">
          <div className="chat-log">
            <div className="msg assistant">
              <div className="prose-block">
                <QuestionFormView form={FORM} interactive onSubmit={() => {}} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </I18nProvider>,
  );
  const chip = container.querySelector('.qf-options .qf-chip');
  if (!chip) throw new Error('选项行没渲染出来 —— 这一量是假的');
  return chip as HTMLElement;
}

describe('OPEND-2612:选项说明文案在卡内换行,不被右边距裁掉', () => {
  it('说明文案确实挂在选项行里 —— 先证明夹具真的立起来了', () => {
    const chip = mountOptionRow();
    const desc = chip.querySelector('.qf-chip-desc');
    expect(desc?.textContent).toBe(LONG_DESC);
  });

  it('选项行最终拿到的是 `white-space: normal`,不是全局原语的 nowrap', () => {
    const chip = mountOptionRow();

    // 用户读得到的那件事排在最前面 —— 撤掉处方时先红在这一格上,读数直接是
    // `nowrap`,也就是缺陷本身,而不是一句「某条规则不见了」。
    expect(CSS.resolved(chip)['white-space']).toBe('normal');

    // 病根和处方**同时**匹配这一行 —— 再证明这一格真的是在比层叠,
    // 而不是「只有一条规则,赢得毫无悬念」。
    const declaring = CSS.declaring(chip, 'white-space').map((rule) => rule.selector);
    expect(declaring).toContain('button');
    expect(declaring).toContain('.qf-chip');
  });

  it('文案列缩得下去、也断得开 —— 换行放开之后这两条才轮得到被咨询', () => {
    const copy = mountOptionRow().querySelector('.qf-chip-copy');
    if (!copy) throw new Error('文案列没渲染出来 —— 这一量是假的');
    const resolved = CSS.resolved(copy);
    expect(resolved['min-width']).toBe('0px');
    expect(resolved['overflow-wrap']).toBe('anywhere');
  });
});
