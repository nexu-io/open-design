// @vitest-environment jsdom
/**
 * 意图澄清卡里「自由填写」那一路的左右内距与底下的余量。
 *
 * ── 稿子怎么说 ────────────────────────────────────────────────
 * 交付稿 `docs/design/chat-panel-next.html`(生成源 `docs/design/chat-panel/src/components.css`)
 * 里,这张卡的白底块是 `.cbody`,**它自己不带内距** —— 内距全挂在孩子身上,
 * 而每个孩子都把内容落在**同一条 11px 竖线**上:
 *
 *   `.cbody > .q            { padding: 10px 11px 8px }`
 *   `.cbody > .opts.mod-stack { padding: 0 6px 8px }` + `.opts.mod-stack .opt { padding-inline: 5px }`   → 6 + 5 = 11
 *   `.cbody > .foot         { padding: 0 11px 8px }` + `.cbody > .foot > .btn:first-child { padding-inline: 0 }`
 *
 * 稿子把这条写成了明文,两处:
 *   「改成 opts 只留 6px,选项自己出 5px,**控件正好落在 11px,和上面那句问话同一条竖线**」
 *   「文字直接落在 11px 上 —— **和上面的问句、每个选项的控件同一条竖线**」
 *
 * 底下那段余量也是稿子定死的数(写在 `.cbody > .foot` 那条的注释里):
 *   「剩下的 **8 + 8 = 16**,既是『最后一条选项到底栏上缘』,也是『到下一步按钮』
 *     —— 同一个数,量哪儿都对得上」
 * 稿子里唯一的自由填写实体 `.opt .own-ta` 在真稿上量出来正是:
 *   左右两端离卡边 12px(= 卡自己那 1px 描边 + 11px)、下划线到底栏上缘 **16px**。
 *
 * ── 我们错在哪 ────────────────────────────────────────────────
 * `.qf-input` / `.qf-textarea` 是 `.question-form-body`(= 稿子的 `.cbody`)的**直系孩子**,
 * 而 `.cbody` 按稿子不带内距 —— 于是这两个控件一格内距都没有:
 * 在无头 Chrome 上量过(380px 的卡),左右各只剩 **1px**(那 1px 是卡自己的描边),
 * 到底栏上缘 **0px**。下划线一路顶到卡的两条边,底下也不留一点余地。
 *
 * ── 为什么必须走外距 ──────────────────────────────────────────
 * 那条下划线是 `border-bottom`,画在 **border box** 上:给控件加 `padding-inline`
 * 只会把文字往里推,线还是顶着卡边。所以内距要走**外距**,并且得把 `width`
 * 从 `100%` 放回 `auto`(块级元素自己减掉外距),否则 100% + 外距会溢出。
 * `width` 这一条要求新规则**特异性严格大于**裸 `.qf-input`,不能打平靠源码顺序。
 *
 * ── 祖先不能省 ────────────────────────────────────────────────
 * 选择器必须带 `.question-form-body >` 这个祖先:
 *  · 它是**作用域** —— 折叠的「自己填」(`.qf-custom .qf-input`)和选项里那个
 *    (`.qf-own-input`)拿的是各自容器给的内距(11 / 34),不该被这条刷成 11;
 *  · 它也是**特异性** —— 少了它就和 `.qf-custom .qf-input`(0,2,0)打平,
 *    胜负改由源码顺序决定。同一族的坑本仓已经踩过两次
 *    (`next-step-cascade.test.ts`、`record-cascade.test.ts`)。
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { fireEvent, render, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { I18nProvider } from '../../../src/i18n';
import { QuestionFormView } from '../../../src/components/QuestionForm';
import type { QuestionForm } from '../../../src/artifacts/question-form';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS_PATH = resolve(HERE, '../../../src/styles/viewer/composio.css');
const CSS = readFileSync(CSS_PATH, 'utf-8');

/** 稿子那条竖线:卡的描边之内 11px。全卡上下所有内容都落在它上面。 */
const RAIL = '11px';
/** 稿子的 `.cbody > .foot` 注释写死的数:答案块底缘到底栏上缘。 */
const TO_FOOT = '16px';

const FORM: QuestionForm = {
  id: 'brief',
  title: 'Kami 羊皮纸文档简报',
  questions: [{
    id: 'topic',
    label: '主题或用途',
    type: 'text',
    required: true,
    placeholder: '例:产品发布宣言、季度业绩分析、个人作品集',
  }],
};

const AREA: QuestionForm = {
  ...FORM,
  id: 'brief-area',
  questions: [{ ...FORM.questions[0]!, id: 'topic-area', type: 'textarea' }],
};

beforeAll(() => {
  /*
   * 整张表原样注进去,不切片 —— 切片等于自己挑对手,而这一族出事的方式恰恰是
   * 「本来能赢的那条根本没进场」。jsdom 会照特异性和源码顺序真的层叠一遍。
   */
  const style = document.createElement('style');
  style.textContent = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  document.head.append(style);
});

function mount(form: QuestionForm, draft?: Record<string, string | string[]>): HTMLElement {
  const { container } = render(
    <I18nProvider initial="zh-CN">
      {/* 产品的祖先链:`.app`(ProjectView)→ ChatPane 的接缝 */}
      <div className="app"><div className="root" data-chat-root="">
        <QuestionFormView
          form={form}
          interactive
          onSubmit={() => undefined}
          {...(draft ? { draftAnswers: draft } : {})}
        />
      </div></div>
    </I18nProvider>,
  );
  return container;
}

describe('意图澄清卡 · 自由填写的左右内距与底下的余量', () => {
  it('问句和底栏本来就落在 11px 那条竖线上(基准,不是被测项)', () => {
    const root = mount(FORM);
    const label = root.querySelector<HTMLElement>('.qf-label')!;
    const foot = root.querySelector<HTMLElement>('.question-form-foot')!;
    expect(getComputedStyle(label).paddingLeft).toBe(RAIL);
    expect(getComputedStyle(label).paddingRight).toBe(RAIL);
    expect(getComputedStyle(foot).paddingLeft).toBe(RAIL);
    expect(getComputedStyle(foot).paddingRight).toBe(RAIL);
  });

  it('自由填写框跟着落在同一条竖线上,底下留稿子那 16px', () => {
    const root = mount(FORM);
    const input = root.querySelector<HTMLElement>('input.qf-input')!;
    // 它确实是 `.cbody` 的直系孩子 —— 这条前提一变,下面的选择器就不再命中
    expect(input.parentElement?.classList.contains('question-form-body')).toBe(true);
    const cs = getComputedStyle(input);
    expect(cs.marginLeft).toBe(RAIL);
    expect(cs.marginRight).toBe(RAIL);
    expect(cs.marginBottom).toBe(TO_FOOT);
    // 100% + 外距会溢出;放回 auto 才是块级元素自己减掉外距
    expect(cs.width).toBe('auto');
    // 内距不许接手这件事:下划线画在 border box 上,padding 推的只有文字
    expect(cs.paddingLeft).toBe('0px');
    expect(cs.paddingRight).toBe('0px');
  });

  it('多行的那一路(textarea)同款', () => {
    const root = mount(AREA);
    const area = root.querySelector<HTMLElement>('textarea.qf-textarea')!;
    expect(area.parentElement?.classList.contains('question-form-body')).toBe(true);
    const cs = getComputedStyle(area);
    expect(cs.marginLeft).toBe(RAIL);
    expect(cs.marginRight).toBe(RAIL);
    expect(cs.marginBottom).toBe(TO_FOOT);
    expect(cs.width).toBe('auto');
  });

  it('选项里那个「自己填」不受这条影响 —— 它的内距来自选项行', () => {
    const root = mount(
      {
        ...FORM,
        id: 'brief-own',
        questions: [{
          id: 'scope',
          label: '主题或用途',
          type: 'radio',
          allowCustom: true,
          options: [{ label: '产品发布宣言', value: 'a' }, { label: '季度业绩分析', value: 'b' }],
        }],
      },
      // 「自己填」收起时只有一颗 chip,输入框根本不在 DOM 里 —— 给一个不在选项里的
      // 草稿值把它撑开,否则下面几条断言全是空转(第一版就是这么写的,被这条守回来了)
      { scope: '我自己写的' },
    );
    const own = root.querySelector<HTMLElement>('textarea.qf-own-input');
    expect(own, '选项里那个「自己填」没渲染出来 —— 这条测试会变成空转').toBeTruthy();
    // 它躺在选项行里,不是 `.question-form-body` 的直系孩子
    expect(own!.closest('.question-form-body > *')?.classList.contains('qf-options')).toBe(true);
    const cs = getComputedStyle(own!);
    expect(cs.marginLeft).toBe('0');
    expect(cs.marginRight).toBe('0');
    expect(cs.width).toBe('100%');
  });

  it('「自己填」收起时不挂输入框,展开后输入框沿用选项行内距', () => {
    const root = mount({
      ...FORM,
      id: 'brief-custom',
      questions: [{
        id: 'scope',
        label: '主题或用途',
        type: 'select',
        allowCustom: true,
        options: [{ label: '产品发布宣言', value: 'a' }, { label: '季度业绩分析', value: 'b' }],
      }],
    });
    expect(root.querySelector('.qf-own-input')).toBeNull();
    fireEvent.click(within(root).getByRole('button', { name: '自己填' }));
    const inner = root.querySelector<HTMLElement>('.qf-own-input');
    expect(inner, '展开后的「自己填」输入没渲染出来').toBeTruthy();
    expect(getComputedStyle(inner!).marginLeft).toBe('0');
    expect(getComputedStyle(inner!).width).toBe('100%');
  });

  it('新规则带着 `.question-form-body >` 这个祖先,并且真的压得过裸 `.qf-input`', () => {
    const stripped = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    const rules: { sel: string; body: string }[] = [];
    for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const body = (m[2] ?? '').replace(/\s+/g, ' ').trim();
      for (const one of (m[1] ?? '').split(',')) {
        const sel = one.split(/\s+/).join(' ').trim();
        if (sel && !sel.startsWith('@')) rules.push({ sel, body });
      }
    }

    const inset = rules.find(
      (r) => r.sel === '.question-form-body > .qf-input' && /margin/.test(r.body),
    );
    expect(inset, '找不到 `.question-form-body > .qf-input` 那条内距规则(祖先被省掉了?)').toBeTruthy();

    /** 只数 (类 + 属性 + 伪类) 那一档 —— 这一族里没有 id,元素名不参与胜负 */
    const cls = (sel: string): number =>
      (sel.match(/\.[A-Za-z0-9_-]+|\[[^\]]+\]|:[a-z-]+(?:\([^)]*\))?/g) ?? []).length;

    const bare = rules.find((r) => r.sel === '.qf-input' && /width:\s*100%/.test(r.body));
    expect(bare, '裸 `.qf-input` 那条基底不见了 —— 这条测试的前提没了').toBeTruthy();
    // 打平会改由源码顺序判,那就不是「规则说了算」;必须严格大于
    expect(cls(inset!.sel)).toBeGreaterThan(cls(bare!.sel));

    // 下划线仍然是 border-bottom(而不是被改成描边或底色)——
    // 这正是内距只能走外距的原因,前提变了就该重新想一遍
    expect(bare!.body).toMatch(/border-bottom:\s*1px solid/);
  });
});
