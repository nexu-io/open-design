// @vitest-environment jsdom
/**
 * `select` 的独立形态 —— 「查找型单选」(PR #7170 `body-components.html:487` 起)。
 *
 * ── 产品判据(2026-09-02 第二版,按**选项数量**)──────────────
 *   · 单选 + 选项少  → `radio`(竖排列表,全部展开)
 *   · 单选 + 选项多  → `select`(常用先展示 + 「更多选项」折叠 + 6.5 行内滚)
 *   · 多选           → 永远竖排列表,不进这个形态
 * (第一版按「需不需要比较选项」分,已作废。)
 *
 * ── 稿子给的形状(去掉语言这层皮之后的通用能力)────────────
 *   · 选项分组:第一组直接展开并带组名;其余组各自收在一个可展开的开关后面,
 *     开关的字就是那一组的组名(稿子里是「常用语言」/「更多语言」);
 *   · 行尾副标(稿子里是 `ZH-CN`)+ 选中勾;
 *   · 展开的列表固定露出 6.5 行(32px × 6.5 = 208px),再多就内部滚动。
 * 稿子那张中文语言表是**硬编码的**,我们不抄:选项永远来自 agent 的 `options`,
 * 这里做的是通用的「分组 / 行尾副标 / 高度上限」,不是一个语言选择器组件。
 *
 * ── 触发条件(这是本文件最要紧的一条)──────────────────────
 * 两条任一成立就走菜单形态:
 *   (a) 这道题带了新字段(任一选项有 `group` 或 `trailingLabel`)—— 模型按新规则写的;
 *   (b) 选项数**多于 7 个** —— 提示词让模型把一题控制在 6–7 个以内,超了就是
 *       「选不过来」的那一类,正是菜单要解决的问题(线上 ElevenLabs 选音色
 *       最多能列 100 个音色,就是这一档)。
 * 两条都不成立 → 逐元素退回今天的竖排列表。兼容要求原话:「旧会话里 options
 * 没有分组信息、没有副标 —— 新形态必须优雅**退化成今天的样子**」。
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QuestionFormView } from '../../../src/components/QuestionForm';
import { splitOnQuestionForms } from '../../../src/artifacts/question-form';
import type { QuestionForm } from '../../../src/artifacts/question-form';

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const sheet = (rel: string) => readFileSync(resolve(HERE, '../../../src', rel), 'utf-8');

beforeAll(() => {
  /*
   * 顺序照 `index.css`:`primitives.css` 在 `composio.css` 之前。
   * 少注 primitives,下面那条 `white-space` 断言会读回浏览器默认的 `normal`,
   * 不修也是绿的 —— 那种读数证明不了任何事(这一族刚在选项行上栽过一次)。
   */
  const style = document.createElement('style');
  style.textContent = [sheet('styles/primitives.css'), sheet('styles/viewer/composio.css')]
    .map((css) => css.replace(/\/\*[\s\S]*?\*\//g, ''))
    .join('\n');
  document.head.append(style);
});

/** 新形态:带分组 + 行尾副标。选项内容全部来自「agent」,host 不内置任何一张表。 */
const lookupForm: QuestionForm = {
  id: 'lang',
  title: 'One more thing',
  questions: [
    {
      id: 'locale',
      label: 'Which language should this conversation use?',
      type: 'select',
      required: true,
      options: [
        { label: '简体中文', value: 'zh-CN', group: 'Common', trailingLabel: 'ZH-CN' },
        { label: 'English', value: 'en', group: 'Common', trailingLabel: 'EN' },
        { label: '日本語', value: 'ja', group: 'Common', trailingLabel: 'JA' },
        { label: '繁體中文', value: 'zh-TW', group: 'More languages', trailingLabel: 'ZH-TW' },
        { label: 'Français', value: 'fr', group: 'More languages', trailingLabel: 'FR' },
      ],
    },
  ],
};

/**
 * 旧形态的真实样子:两个需要**对比着读**的选项,没有 group、没有 trailingLabel。
 * 这就是 ElevenLabs 选音色那道题今天的形状。
 */
const legacySelectForm: QuestionForm = {
  id: 'elevenlabs-voice',
  title: 'Choose an ElevenLabs voice',
  questions: [
    {
      id: 'voice',
      label: 'Voice',
      type: 'select',
      required: true,
      allowCustom: false,
      options: [
        { label: 'Rachel — american · female', value: '21m00Tcm4TlvDq8ikWAM' },
        { label: 'Adam — american · male', value: 'pNInz6obpgDQGcFmaJgB' },
      ],
    },
  ],
};

/** 更老的一层:旧会话里持久化的子标签写法,解析出来就是 `type: 'select'`。 */
function legacyTagForm(): QuestionForm {
  const input = [
    '<question-form id="audio-brief" title="Audio brief">',
    '  <question-select id="format" label="Which format?" required="true">',
    '    <option value="mp3">MP3</option>',
    '    <option value="wav">WAV</option>',
    '  </question-select>',
    '</question-form>',
  ].join('\n');
  const segment = splitOnQuestionForms(input).find((s) => s.kind === 'form');
  if (!segment || segment.kind !== 'form') throw new Error('legacy form did not parse');
  return segment.form;
}

function mount(form: QuestionForm, over: Record<string, unknown> = {}) {
  const onSubmit = vi.fn();
  const view = render(
    <QuestionFormView form={form} interactive onSubmit={onSubmit} {...over} />,
  );
  return { ...view, onSubmit };
}

const menu = (root: HTMLElement) => root.querySelector<HTMLElement>('.qf-select-menu');
const options = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('.qf-select-option')];
/** 首屏那一组 —— 折叠组的选项仍然挂在 DOM 里(和稿子一样用 `hidden`),不算首屏。 */
const headOptions = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('.qf-select-menu .qf-select-option')];
/**
 * 旧的竖排 chip。**排除「自己填」那一颗** —— 它是所有有限选项题共用的逃生口
 * (`shouldRenderCustomChoice` 默认就给),两种形态下都该在,不是「没换形态」的证据。
 */
const chips = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('.qf-chip')].filter(
    (node) => !node.closest('.qf-select-own') && !node.classList.contains('qf-chip-other'),
  );
const nextBtn = (root: HTMLElement) =>
  root.querySelector<HTMLButtonElement>('.qf-primary-action')!;

describe('查找型单选 · 新形态', () => {
  it('带分组的 select 走菜单形态,不再是竖排 chip', () => {
    const { container } = mount(lookupForm);
    expect(menu(container), '没有渲染出查找菜单').toBeTruthy();
    expect(chips(container), '还在用旧的 chip 列表').toHaveLength(0);
    expect(menu(container)!.getAttribute('role')).toBe('listbox');
  });

  it('第一组直接展开并带组名,其余组收在以组名为字的开关后面', () => {
    const { container } = mount(lookupForm);
    const label = container.querySelector<HTMLElement>('.qf-select-group-label');
    expect(label?.textContent).toBe('Common');
    // 首屏只有第一组那三条
    expect(headOptions(container).map((n) => n.textContent)).toEqual([
      '简体中文ZH-CN',
      'EnglishEN',
      '日本語JA',
    ]);
    // 其余的挂在 DOM 里但收着(稿子用的也是 `hidden`)
    const moreList = container.querySelector<HTMLElement>('.qf-select-more-list')!;
    expect(moreList.hidden, '折叠组一上来就是展开的').toBe(true);
    expect([...moreList.querySelectorAll('.qf-select-option')]).toHaveLength(2);
    const toggle = container.querySelector<HTMLButtonElement>('.qf-select-more-toggle');
    expect(toggle, '没有「更多」开关').toBeTruthy();
    /*
     * 开关的字是 **host 文案**「更多选项」,不是模型给的组名。
     * 产品原话:「更多语言 改成 更多选项」—— 这个折叠器是**任意选项列表**的,
     * 不是语言选择器;拿组名当开关文案会把语言那一档的措辞焊死进通用组件。
     */
    expect(toggle!.textContent).toContain('More options');
    expect(toggle!.textContent, '开关文案被模型的组名顶替了').not.toContain('More languages');
    expect(toggle!.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle!);
    expect(toggle!.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector<HTMLElement>('.qf-select-more-list')!.hidden).toBe(false);
    expect(options(container)).toHaveLength(5);
  });

  it('行尾副标渲染在自己的槽里,不混进主文案', () => {
    const { container } = mount(lookupForm);
    const first = options(container)[0]!;
    expect(first.querySelector('.qf-select-option-label')!.textContent).toBe('简体中文');
    expect(first.querySelector('.qf-select-trailing')!.textContent).toBe('ZH-CN');
  });

  it('选中一项:aria-selected 落到那一项,「下一步」亮起,提交 machine value', () => {
    const { container, onSubmit } = mount(lookupForm);
    expect(nextBtn(container).disabled).toBe(true);

    fireEvent.click(options(container)[1]!);

    const selected = options(container).filter(
      (n) => n.getAttribute('aria-selected') === 'true',
    );
    expect(selected.map((n) => n.dataset.value)).toEqual(['en']);
    expect(nextBtn(container).disabled).toBe(false);

    fireEvent.click(nextBtn(container));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.stringContaining('English'),
      { locale: 'en' },
      'submit',
    );
  });

  it('折叠组里的选项被选中时,那一组默认展开 —— 否则答案看不见', () => {
    const { container } = mount(lookupForm, { draftAnswers: { locale: 'fr' } });
    const toggle = container.querySelector<HTMLButtonElement>('.qf-select-more-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const selected = options(container).filter(
      (n) => n.getAttribute('aria-selected') === 'true',
    );
    expect(selected.map((n) => n.dataset.value)).toEqual(['fr']);
  });
});

describe('旧会话数据的兼容性', () => {
  it('① 没有新字段的 select 照旧渲染成竖排单选列表', () => {
    const { container } = mount(legacySelectForm);
    expect(menu(container), '旧数据被拖进了查找菜单').toBeNull();
    expect(chips(container).map((n) => n.textContent)).toEqual([
      'Rachel — american · female',
      'Adam — american · male',
    ]);
    expect(container.querySelector('[role="radiogroup"]')).toBeTruthy();
  });

  it('① 旧子标签写法解析出来的 select 也照旧能看、能选、能提交', () => {
    const { container, onSubmit } = mount(legacyTagForm());
    expect(menu(container)).toBeNull();
    const chip = chips(container).find((n) => n.textContent === 'WAV');
    expect(chip, '旧 <question-select> 的选项没渲染出来').toBeTruthy();

    fireEvent.click(chip!);
    fireEvent.click(nextBtn(container));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.stringContaining('- Which format?: WAV'),
      { format: 'wav' },
      'submit',
    );
  });

  it('② 已提交的 machine value 回放成正确的显示 label(两种形态都要)', () => {
    const legacy = render(
      <QuestionFormView
        form={legacySelectForm}
        interactive={false}
        submittedAnswers={{ voice: 'pNInz6obpgDQGcFmaJgB' }}
        onSubmit={() => undefined}
      />,
    );
    expect(legacy.container.querySelector('.answered')!.textContent).toContain(
      'Adam — american · male',
    );
    expect(
      legacy.container.querySelector('.answered')!.textContent,
      '把机器值原样念出来了',
    ).not.toContain('pNInz6ob');
    cleanup();

    const lookup = render(
      <QuestionFormView
        form={lookupForm}
        interactive={false}
        submittedAnswers={{ locale: 'zh-TW' }}
        onSubmit={() => undefined}
      />,
    );
    expect(lookup.container.querySelector('.answered')!.textContent).toContain('繁體中文');
    expect(lookup.container.querySelector('.answered')!.textContent).not.toContain('zh-TW');
  });

  it('③ 缺字段时逐元素退化成今天的样子 —— 和 radio 那条路走同一套 DOM', () => {
    const asSelect = mount(legacySelectForm);
    const selectHtml = asSelect.container.querySelector('.qf-options')!.innerHTML;
    cleanup();
    const asRadio = mount({
      ...legacySelectForm,
      questions: [{ ...legacySelectForm.questions[0]!, type: 'radio' }],
    });
    const radioHtml = asRadio.container.querySelector('.qf-options')!.innerHTML;
    expect(selectHtml).toBe(radioHtml);
  });

  it('③ 只有一半新字段(有副标没分组)也不炸,照样进新形态', () => {
    const { container } = mount({
      ...lookupForm,
      questions: [
        {
          ...lookupForm.questions[0]!,
          options: [
            { label: '简体中文', value: 'zh-CN', trailingLabel: 'ZH-CN' },
            { label: 'English', value: 'en', trailingLabel: 'EN' },
          ],
        },
      ],
    });
    expect(menu(container)).toBeTruthy();
    // 没有分组就没有组名,也没有「更多」开关 —— 一条平铺的列表
    expect(container.querySelector('.qf-select-group-label')).toBeNull();
    expect(container.querySelector('.qf-select-more-toggle')).toBeNull();
    expect(options(container)).toHaveLength(2);
  });

  it('④ 「自己填」在新旧两种形态下都能展开、恢复、提交', () => {
    // 旧形态
    const legacy = mount({
      ...legacySelectForm,
      questions: [{ ...legacySelectForm.questions[0]!, allowCustom: true }],
    });
    fireEvent.click(within(legacy.container).getByRole('button', { name: 'Write your own' }));
    expect(legacy.container.querySelector('.qf-own-input')).toBeTruthy();
    cleanup();

    // 新形态
    const lookup = mount({
      ...lookupForm,
      questions: [{ ...lookupForm.questions[0]!, allowCustom: true }],
    });
    fireEvent.click(within(lookup.container).getByRole('button', { name: 'Write your own' }));
    const own = lookup.container.querySelector<HTMLTextAreaElement>('.qf-own-input');
    expect(own, '新形态里「自己填」没长出输入框').toBeTruthy();
    fireEvent.change(own!, { target: { value: 'Klingon' } });
    fireEvent.click(nextBtn(lookup.container));
    expect(lookup.onSubmit).toHaveBeenCalledWith(
      expect.stringContaining('Klingon'),
      { locale: 'Klingon' },
      'submit',
    );
  });

  it('④ 历史里存着的自定义答案在新形态里也能恢复出来', () => {
    const { container } = mount(
      { ...lookupForm, questions: [{ ...lookupForm.questions[0]!, allowCustom: true }] },
      { draftAnswers: { locale: 'Klingon' } },
    );
    const own = container.querySelector<HTMLTextAreaElement>('.qf-own-input');
    expect(own, '自定义答案没把「自己填」撑开').toBeTruthy();
    expect(own!.value).toBe('Klingon');
  });

  it('⑤ 未回答的历史表单刷新后仍然可交互', () => {
    // 「刷新」= 重新挂载同一份表单,没有 submittedAnswers
    for (const form of [legacySelectForm, lookupForm]) {
      cleanup();
      const { container, onSubmit } = mount(form);
      expect(nextBtn(container).disabled, '一挂上来就不可提交是对的(必答未答)').toBe(true);
      const target = menu(container) ? options(container)[0]! : chips(container)[0]!;
      fireEvent.click(target);
      expect(nextBtn(container).disabled, '刷新后点不动了').toBe(false);
      fireEvent.click(nextBtn(container));
      expect(onSubmit).toHaveBeenCalled();
    }
  });
});

describe('查找型单选 · 菜单的量', () => {
  it('展开的列表固定露出 6.5 行就开始内部滚动', () => {
    const { container } = mount(lookupForm);
    const list = container.querySelector<HTMLElement>('.qf-select-more-list')!;
    const cs = getComputedStyle(list);
    // 稿子写死的数:32px 一行 × 6.5 = 208px。露半行是「下面还有」的提示,
    // 收在 6 行整会读成「就这些了」。
    expect(cs.maxHeight).toBe('208px');
    expect(cs.overflowY).toBe('auto');
    // 滚到底之后不许把整条会话一起带走
    expect(cs.overscrollBehavior).toBe('contain');
    expect(getComputedStyle(container.querySelector<HTMLElement>('.qf-select-option')!).minHeight)
      .toBe('32px');
  });

  it('菜单里的选项不继承全局 button 的 nowrap', () => {
    const { container } = mount(lookupForm);
    const option = container.querySelector<HTMLElement>('.qf-select-option')!;
    expect(option.tagName).toBe('BUTTON');
    expect(
      getComputedStyle(option).whiteSpace,
      '长选项名会冲出菜单 —— 和选项行栽过的是同一条 `button { white-space: nowrap }`',
    ).toBe('normal');
  });
});

describe('查找型单选 · 按选项数量触发', () => {
  /** 一道没有任何新字段的普通单选题,只是选项多。 */
  const manyOptions = (count: number): QuestionForm => ({
    id: 'voice',
    title: 'Choose a voice',
    questions: [
      {
        id: 'voice',
        label: 'Voice',
        type: 'select',
        required: true,
        options: Array.from({ length: count }, (_, i) => ({
          label: `Voice ${i + 1}`,
          value: `v${i + 1}`,
        })),
      },
    ],
  });

  it('选项多于 7 个时进菜单形态,哪怕一个新字段都没有', () => {
    // 线上 ElevenLabs 选音色最多列 100 个,就是这一档
    const { container } = mount(manyOptions(12));
    expect(menu(container), '12 个选项还在铺成竖排 chip').toBeTruthy();
    expect(chips(container)).toHaveLength(0);
    // 没有分组就没有组名、没有开关 —— 一条平铺的长列表,靠 6.5 行的上限收着
    expect(container.querySelector('.qf-select-group-label')).toBeNull();
    expect(container.querySelector('.qf-select-more-toggle')).toBeNull();
    expect(options(container)).toHaveLength(12);
  });

  it('7 个及以下仍旧是竖排列表 —— 提示词就是让模型控制在这个量以内', () => {
    const { container } = mount(manyOptions(7));
    expect(menu(container), '7 个选项被拖进了菜单').toBeNull();
    expect(chips(container)).toHaveLength(7);
  });

  it('多选永远不进菜单形态,选项再多也一样', () => {
    const { container } = mount({
      ...manyOptions(12),
      questions: [{ ...manyOptions(12).questions[0]!, type: 'checkbox' }],
    });
    expect(menu(container), '多选被拖进了菜单').toBeNull();
    expect(chips(container)).toHaveLength(12);
  });

  it('选项多的那一档照样能选、能提交 machine value', () => {
    const { container, onSubmit } = mount(manyOptions(12));
    fireEvent.click(options(container)[9]!);
    fireEvent.click(nextBtn(container));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.stringContaining('Voice 10'),
      { voice: 'v10' },
      'submit',
    );
  });
});

describe('新字段要真的从 JSON 里解析出来', () => {
  /*
   * 上面那些用例都是直接拿对象喂组件的,绕过了解析器 —— 光靠它们,
   * `parseOption` 把 `group` / `trailingLabel` 丢掉也照样全绿。
   * 模型给的是 JSON,这条走的才是真实链路。
   */
  function parseOptions(json: string) {
    const input = [
      '<question-form id="lang" title="Language">',
      `{ "questions": [ { "id": "locale", "label": "Language", "type": "select", "options": ${json} } ] }`,
      '</question-form>',
    ].join('\n');
    const segment = splitOnQuestionForms(input).find((s) => s.kind === 'form');
    if (!segment || segment.kind !== 'form') throw new Error('form did not parse');
    return segment.form.questions[0]!.options!;
  }

  it('group 和 trailingLabel 从 JSON 里活着出来', () => {
    const parsed = parseOptions(
      '[{ "label": "简体中文", "value": "zh-CN", "group": "常用", "trailingLabel": "ZH-CN" }]',
    );
    expect(parsed[0]).toMatchObject({
      label: '简体中文',
      value: 'zh-CN',
      group: '常用',
      trailingLabel: 'ZH-CN',
    });
  });

  it('空串和空白当没给 —— 不留一个渲染出来是空的组名', () => {
    const parsed = parseOptions(
      '[{ "label": "English", "value": "en", "group": "   ", "trailingLabel": "" }]',
    );
    expect(parsed[0]!.group).toBeUndefined();
    expect(parsed[0]!.trailingLabel).toBeUndefined();
  });

  it('旧 JSON(压根没这两个键)解析结果逐字段和今天一致', () => {
    expect(parseOptions('[{ "label": "English", "value": "en" }]')[0]).toEqual({
      label: 'English',
      value: 'en',
    });
  });
});
