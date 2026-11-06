// @vitest-environment jsdom
/**
 * W88 ·「设计系统工作区 · 自动创建」状态卡逐值对稿。
 *
 * 基线 `729fa43ce7`。只读设计**源文件**(`docs/design/chat-panel/src/`),
 * `chat-panel-next.html` 是构建产物,一律不看。
 *
 * ── 这张卡有过两次相反的决定 ─────────────────────────────────────────
 * 它先被主动删掉过一次(那一版把这条系统写的摘要改走「类型化语言字典 + 标准用户
 * 气泡」,并在 `tests/components/ChatPane.streaming.test.tsx` 留了一条
 * 「`.user-status-card` 必须不存在」的断言)。**2026-09-02 用户裁决**要求
 * 「设计系统状态卡 也和设计稿 1:1 对齐」,所以卡加回来,那条断言翻转。
 * 两次决定的来龙去脉写在那条断言的原地,别只看这里。
 *
 * ── 稿子的三处出处(逐条核过)─────────────────────────────────────────
 *   DOM   `729fa43ce7:docs/design/chat-panel/src/body-components.html:45-53`
 *   CSS   `729fa43ce7:docs/design/chat-panel/src/components.css:344-688`
 *   验收  `729fa43ce7:docs/design/chat-panel/design-qa.md`
 *           「状态卡最终边界为 280 × 67.98px,标题完整显示为一行,
 *             说明文字完整显示为两行」
 *           「卡片宽度使用 min(280px, 100%)」
 *
 * ⚠️ **280 不是 320。** 组件自身在稿子里写的是 `max-width: min(320px, 100%)`,
 * 280 那一条挂在 `.st-b .design-system-generation-status` 上 —— `.st-b` 是**陈列页
 * 的格子容器**,产品里没有这东西。照抄组件那一条会让产品漂到 320:说明文字变一行,
 * 高度掉到 ~51px,和设计肉眼验收过的 280 × 67.98 不是一个东西。所以 280 钉在
 * 组件自己身上,判据见「② 宽度」。
 *
 * ── 量法与它的边界(先读这段)─────────────────────────────────────────
 * jsdom 不做层叠、不解 `var()`,`getComputedStyle` 在这里恒为空串,所以四轴全部走
 * 共享量尺 `tests/helpers/chat-mirror-cascade`(只读,一个字没改)。
 *
 * 量尺的 `deref()` 只认 **tokenSheets 的 `:root` 块**,而 `--chat-*` 接缝住在
 * `ChatRoot.module.css` 的 `.vars, .root` 里(产品运行时它挂在 `.pane` 这个祖先上)。
 * 所以这里把接缝的**亮色作用域**原样搬成一个合成的 `:root` 表喂给量尺 —— 模拟的正是
 * 「祖先上有接缝」这件事,不改任何值。搬运本身由「① 防真空」的第一条钉住:
 * 接缝解不开时 `--chat-status-card-surface` 会原样读回,一眼可辨。
 *
 * ⚠️ `expand()` 是属性白名单,名单外的属性**静默读回 `<unset>`** —— 和「真的没人写」
 * 分不开。`gap` / `display` / `align-items` / `overflow-wrap` 都在名单外,所以这几轴
 * 改读 CSS Module 的文本(标在各自断言里),不拿 `<unset>` 冒充相等。
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { UserMessageImpl } from '../../../src/components/ChatPane';
import { DESIGN_SYSTEM_WORKSPACE_PROMPT_PREFIX } from '../../../src/design-system-auto-prompt';
import chatRootStyles from '../../../src/components/chat/ChatRoot.module.css';
import statusCardStyles from '../../../src/components/chat/UserStatusCard.module.css';
import { createResolver, hashed, UNSET } from '../../helpers/chat-mirror-cascade';

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '../../..');
const read = (p: string): string => readFileSync(resolve(WEB, p), 'utf-8');
const decomment = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/* ══ 稿子的字面值 ══════════════════════════════════════════════════════
 * 全部解自 `729fa43ce7:docs/design/chat-panel/src/`。写死字面量而不是写
 * `var(--…)`:验收判据是「算出来的和稿子逐字节相同」,不是「用了某支变量」。 */
/** `.user-status-card { background: #121212 }`            components.css:348 */
const D_SURFACE = '#121212';
/** `.user-status-card { color: #fff }`                    components.css:349 */
const D_INK = '#fff';
/** `.user-status-card__icon { background: #353535 }`      components.css:355 */
const D_ICON_PLATE = '#353535';
/** `.user-status-card__copy span { color: #bdbdbd }`      components.css:363 */
const D_DETAIL_INK = '#bdbdbd';
/** `--t-body = --font-size-13`                            components.css:108 */
const D_TITLE_SIZE = '13px';
/** `--t-mini = --font-size-12`                            components.css:107 */
const D_DETAIL_SIZE = '12px';
/** `.user-status-card__copy strong { font-weight: 600 }`  components.css:361 */
const D_TITLE_WEIGHT = '600';
/* 说明**不写**字重,吃面板排版基线的 500(`ChatRoot.module.css` 的 `.vars` / `.root`)。
   这一轴没有字面常量:字重是继承来的,量尺只算「盖在元素身上的规则」,
   直接读会是 `<unset>`。判据拆成「没人给它写」+「接缝基线是 500」两半,
   写在「说明」那条用例里。 */
/** `.user-status-card__copy strong { line-height: 1.2 }`  components.css:361 */
const D_TITLE_LH = '1.2';
/** `.user-status-card__copy span { line-height: 1.35 }`   components.css:363 */
const D_DETAIL_LH = '1.35';
/** `.user-status-card { padding: 9px 11px }`              components.css:346 */
const D_PAD_BLOCK = 9;
const D_PAD_INLINE = '11px';
/** `.user-status-card__icon { width/height: 28px }`       components.css:354 */
const D_PLATE = '28px';
/** `.user-status-card__icon > svg { width/height: 16px }` components.css:356 */
const D_GLYPH = '16px';
/** `.copy { gap: 2px }`                                   components.css:357 */
const D_COPY_GAP = 2;
/** design-qa.md:「卡片宽度使用 min(280px, 100%)」 */
const D_WIDTH = 'min(280px, 100%)';
/** design-qa.md:「状态卡最终边界为 280 × 67.98px」 */
const D_QA_HEIGHT = 67.98;

/** 稿子的文案,逐字。body-components.html:50-51 */
const D_TITLE = 'Creating design system workspace';
const D_DETAIL = 'Open Design is using the setup sources to generate this project.';

/* ══ 量尺 ══════════════════════════════════════════════════════════════ */

const TARGETS = [
  'font-size',
  'font-weight',
  'line-height',
  'color',
  'background-color',
  'width',
  'height',
  'padding-top',
  'padding-bottom',
  'padding-left',
  'padding-right',
  'border-radius',
] as const;

const SEAM_CSS = read('src/components/chat/ChatRoot.module.css');
const STATUS_CSS = read('src/components/chat/UserStatusCard.module.css');

/** 顶层规则 `选择器 { 声明 }`。接缝层与本组件的 Module 都没有嵌套,这一刀够用。 */
function blocks(css: string): Array<{ selector: string; body: string }> {
  return Array.from(decomment(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)).map((m) => ({
    selector: (m[1] ?? '').trim().replace(/\s+/g, ' '),
    body: m[2] ?? '',
  }));
}

/** 接缝层的亮 / 暗作用域声明块。找不到就炸,不给默认值。 */
function seamScope(which: 'light' | 'dark'): string {
  const hit = blocks(SEAM_CSS).find((b) =>
    which === 'dark'
      ? b.selector.includes("data-theme='dark'")
      : b.selector.startsWith('.vars,') && !b.selector.includes('data-theme'),
  );
  if (!hit) throw new Error(`接缝层里找不到${which === 'dark' ? '暗' : '亮'}色作用域那条规则`);
  return hit.body;
}

/**
 * 把接缝的亮色作用域搬成一张合成的 `:root` 表 —— 模拟产品运行时「祖先(`.pane`)
 * 身上有接缝」这件事。值一个没动;搬没搬成由「① 防真空」第一条看得见。
 */
const SEAM_AS_ROOT = `:root {${seamScope('light')}}`;

const SHEETS = [
  read('src/styles/tokens.css'),
  read('src/styles/base.css'),
  readFileSync(resolve(WEB, '../../packages/components/src/styles.css'), 'utf-8'),
  read('src/styles/primitives.css'),
  read('src/styles/chat.css'),
  hashed(SEAM_CSS, chatRootStyles as unknown as Record<string, string>),
  hashed(STATUS_CSS, statusCardStyles as unknown as Record<string, string>),
];

const CSS = createResolver(
  SHEETS,
  [read('src/styles/tokens.css'), read('src/styles/base.css'), SEAM_AS_ROOT],
  TARGETS,
);

beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = SHEETS.map(decomment).join('\n');
  document.head.append(style);
});

/* ══ 夹具 ══════════════════════════════════════════════════════════════
 * ⚠️ 内容照抄真实那条记录的形态:菜单动作写进对话的是**一整段长 prompt**,
 * 前缀是 `DESIGN_SYSTEM_WORKSPACE_PROMPT_PREFIX`,后面跟着给 agent 的实现要求。
 * 只塞一句短句会让「长 prompt 被换成卡片」这件事没被量到。 */
const DESIGN_SYSTEM_PROMPT = `${DESIGN_SYSTEM_WORKSPACE_PROMPT_PREFIX}
Use the files in this project as the design system source for future projects.
Expected output:
- A clear DESIGN.md with all generated rules.`;

const t = ((key: string) => key) as never;

function renderUserMessage(content: string): HTMLElement {
  return render(
    <UserMessageImpl
      message={{ id: 'm1', role: 'user', content, createdAt: Date.UTC(2026, 8, 2) } as never}
      projectId="p1"
      t={t}
      appliedContextItems={[]}
    />,
  ).container;
}

function card(): HTMLElement {
  const el = renderUserMessage(DESIGN_SYSTEM_PROMPT).querySelector(
    '[data-testid="design-system-generation-status"]',
  );
  if (!el) throw new Error('设计系统状态卡没渲染出来');
  return el as HTMLElement;
}

function pick(root: Element, selector: string): Element {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`卡片里找不到 ${selector} —— 结构变了,这条断言已经名存实亡`);
  return el;
}

/* ══ ① 防真空 ══════════════════════════════════════════════════════════ */

describe('① 防真空 —— 先证明这把尺子读得出非默认值', () => {
  it('接缝搬进来了:量尺解得开 --chat-*,不是原样读回', () => {
    const measured = CSS.resolved(card());
    expect(measured['background-color'], '样式链没盖到卡面').not.toBe(UNSET);
    expect(measured['background-color'], '接缝没搬进来 —— var() 原样读回,下面的比较都不成立')
      .not.toMatch(/var\(/);
  });

  it('量颜色的这把尺分得出 #121212 和 #353535 —— 两个非默认值,不是同一个读数', () => {
    const root = card();
    const surface = CSS.resolved(root)['background-color'];
    const plate = CSS.resolved(pick(root, '[data-testid="design-system-generation-status-icon"]'))[
      'background-color'
    ];
    expect(surface).toBe(D_SURFACE);
    expect(plate).toBe(D_ICON_PLATE);
    expect(surface, '卡面和图标底读成同一个值 —— 尺子分不出深浅,四轴全是假的').not.toBe(plate);
  });

  it('量字号的这把尺同样分得出 13 和 12', () => {
    const root = card();
    const title = CSS.resolved(pick(root, 'strong'))['font-size'];
    const detail = CSS.resolved(pick(root, '[data-testid="design-system-generation-status-copy"] > span'))[
      'font-size'
    ];
    expect(title).toBe(D_TITLE_SIZE);
    expect(detail).toBe(D_DETAIL_SIZE);
    expect(title).not.toBe(detail);
  });
});

/* ══ ② 结构与文案 ══════════════════════════════════════════════════════ */

describe('② 结构 —— icon + copy(strong + span)', () => {
  it('长 prompt 换成卡片,内部结构逐层对稿', () => {
    const root = card();
    const icon = pick(root, '[data-testid="design-system-generation-status-icon"]');
    const copy = pick(root, '[data-testid="design-system-generation-status-copy"]');

    // 稿子:图标格子是装饰性的,不进辅助技术的可访问名称(design-qa.md「关键实现」)
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    const svg = pick(icon, 'svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('fill'), '调色盘是实心字形,上色靠 fill').toBe('currentColor');
    expect(svg.getAttribute('stroke-width'), '实心字形不该带描边基线').toBeNull();
    // 稿子那枚 `xmlns` 是建成品从独立 svg 内联进来的残留,React 内联不需要
    expect(svg.getAttribute('xmlns'), '不要抄稿子的 xmlns').toBeNull();

    expect(copy.children.length).toBe(2);
    expect(copy.children[0]?.tagName).toBe('STRONG');
    expect(copy.children[1]?.tagName).toBe('SPAN');
  });

  it('两句文案走 i18n key,原始长 prompt 一个字都不出现在页面上', () => {
    const root = card();
    expect(pick(root, 'strong').textContent).toBe('chat.designSystemStatus.title');
    expect(
      pick(root, '[data-testid="design-system-generation-status-copy"] > span').textContent,
    ).toBe('chat.designSystemStatus.description');
    expect(root.closest('[data-testid="user-message"]')?.textContent).not.toContain(
      DESIGN_SYSTEM_WORKSPACE_PROMPT_PREFIX,
    );
  });

  it('英文原文逐字就是稿子那两句', () => {
    const en = read('src/i18n/locales/en.ts');
    expect(en).toContain(`'chat.designSystemStatus.title': '${D_TITLE}'`);
    expect(en).toContain(`'chat.designSystemStatus.description': '${D_DETAIL}'`);
  });
});

/* ══ ③ 四轴逐值 ════════════════════════════════════════════════════════ */

describe('③ 四轴 —— 逐值对稿 729fa43ce7', () => {
  it('卡面:底 #121212、字白、内距 9/11', () => {
    const measured = CSS.resolved(card());
    expect(measured['background-color']).toBe(D_SURFACE);
    expect(measured['color']).toBe(D_INK);
    expect(measured['padding-top']).toBe(`${D_PAD_BLOCK}px`);
    expect(measured['padding-bottom']).toBe(`${D_PAD_BLOCK}px`);
    expect(measured['padding-left']).toBe(D_PAD_INLINE);
    expect(measured['padding-right']).toBe(D_PAD_INLINE);
  });

  /**
   * 圆角是这张卡上**唯一一处刻意不对稿**的轴,所以单独一条,把偏差摆在明面上。
   *
   *   稿子   `components.css:347`  `border-radius: 14px 14px 4px 14px`(字面量)
   *   产品   `--chat-radius-lg` / `--chat-radius-sm` → **12 / 12 / 4 / 12**
   *
   * 产品的形状刻度是 2/4/8/12/16,**没有 14 这一档**;照抄稿子就得只为这一张卡
   * 写死一个刻度外的数,而紧挨着它的用户气泡(`.bub`)走的正是 12/12/4/12。
   *
   * 授权来源:用户 2026-09-02 亲自答复。当时把「稿子写 14、我们的刻度只有 12」
   * 这个取舍原样问上去,原话回的是「**先用 token 吧**」。
   * (这段最早写的时候只见到 CSS 里那句转述、没见到原文,所以标了「未核实」;
   *  现在补上出处 —— 它是用户的直接答复,不是 agent 之间的转述。)
   * 所以这里断言的是「产品当前选定的形」,
   * 同时把稿子的 14 原样记在下面 —— 哪天裁决被推翻,改的是 `SHIPPED` 那一行,
   * 而不是让人重新去稿子里考古 14 是从哪来的。
   *
   * 稿子那 14 究竟是设计有意区分还是漏了 token,**至今没有结论**,
   * 按 `components/chat/AGENTS.md` §6 属于要回写待决表的稿内矛盾,不在代码里默默选一个。
   */
  it('圆角走产品刻度(12/12/4/12),刻意不跟稿子的字面 14 —— 见用例注释', () => {
    /** 稿子的字面值,留档用,不是当前期望值 */
    const DRAFT = '14px 14px 4px 14px';
    /** 产品选定的形:`--radius-xlarge` / `--radius-medium` */
    const SHIPPED = '12px 12px 4px 12px';
    expect(SHIPPED, '稿子和产品这一轴本来就不同,相等了说明有人悄悄改回去了').not.toBe(DRAFT);
    expect(CSS.resolved(card())['border-radius']).toBe(SHIPPED);
  });

  it('标题:13px / 600 / 白', () => {
    const measured = CSS.resolved(pick(card(), 'strong'));
    expect(measured['font-size']).toBe(D_TITLE_SIZE);
    expect(measured['font-weight']).toBe(D_TITLE_WEIGHT);
    expect(measured['line-height']).toBe(D_TITLE_LH);
    // 稿子的 strong 不自己写颜色,继承卡面的白
    expect(CSS.resolved(card())['color']).toBe(D_INK);
  });

  it('说明:12px / #bdbdbd,而且不自己写字重(留给面板基线的 500)', () => {
    const root = card();
    const detail = pick(root, '[data-testid="design-system-generation-status-copy"] > span');
    const measured = CSS.resolved(detail);
    expect(measured['font-size']).toBe(D_DETAIL_SIZE);
    expect(measured['line-height']).toBe(D_DETAIL_LH);
    expect(measured['color']).toBe(D_DETAIL_INK);

    /* ⚠️ 字重是**继承**下来的,量尺只算「盖在这个元素上的规则」,所以直接读
       `font-weight` 会是 `<unset>` —— 那是「没人写在它身上」,不是「没有值」。
       稿子的事实恰恰就是「这一条一个字重都不写」,所以判据换成两半:
         ① 没有任何规则给说明写字重(写了就是偏离稿子);
         ② 它将要继承到的那一档,在接缝层里是 500。
       防真空:同一把 `declaring` 在标题上必须找得到字重,否则「找不到」是尺子坏了。 */
    expect(
      CSS.declaring(pick(root, 'strong'), 'font-weight').length,
      'declaring 在标题上都找不到字重 —— 尺子坏了,下面那条零命中是假的',
    ).toBeGreaterThan(0);
    expect(
      CSS.declaring(detail, 'font-weight').map((r) => r.selector),
      '说明自己写了字重 —— 稿子这一条一个字重都不写',
    ).toEqual([]);
    for (const which of ['light', 'dark'] as const) {
      expect(
        /(?:^|[;\s])font-weight\s*:\s*500/.test(seamScope(which)),
        `${which} 作用域的面板排版基线不是 500 —— 说明会继承到别的档`,
      ).toBe(true);
    }
  });

  it('图标:28px 底板 / #353535,里面的 svg 16×16 且跟着白字走', () => {
    const root = card();
    const plate = CSS.resolved(pick(root, '[data-testid="design-system-generation-status-icon"]'));
    expect(plate['width']).toBe(D_PLATE);
    expect(plate['height']).toBe(D_PLATE);
    expect(plate['background-color']).toBe(D_ICON_PLATE);
    expect(plate['color']).toBe(D_INK);
    // 稿子 `border-radius: var(--radius)` = --radius-large = 8px
    expect(plate['border-radius']).toBe('8px');

    const glyph = CSS.resolved(pick(root, '[data-testid="design-system-generation-status-icon"] > svg'));
    expect(glyph['width']).toBe(D_GLYPH);
    expect(glyph['height']).toBe(D_GLYPH);
  });
});

/* ══ ④ 宽度 —— 280 钉在组件自己身上 ═══════════════════════════════════ */

describe('④ 宽度 —— design-qa 量的是 280 × 67.98,不是组件那条 320', () => {
  it('算出来就是 min(280px, 100%)', () => {
    expect(CSS.resolved(card())['width']).toBe(D_WIDTH);
  });

  it('不许把 320 那条留在组件上 —— 留着就是随时会漂回去', () => {
    const cardRule = blocks(STATUS_CSS).find((b) => b.selector === '.card');
    expect(cardRule, 'UserStatusCard.module.css 里找不到 .card 规则').toBeTruthy();
    expect(cardRule!.body, '320 是陈列页格子外的上限,产品里会让说明变一行').not.toMatch(/320px/);
  });

  it('盒模型对得上 design-qa 的 67.98px:18 内距 + 15.6 标题 + 2 缝 + 32.4 两行说明', () => {
    const root = card();
    const title = CSS.resolved(pick(root, 'strong'));
    const detail = CSS.resolved(
      pick(root, '[data-testid="design-system-generation-status-copy"] > span'),
    );
    const copyRule = blocks(STATUS_CSS).find((b) => b.selector === '.copy');
    expect(copyRule, '找不到 .copy 规则').toBeTruthy();
    // `gap` 不在量尺白名单里(名单外的属性静默读回 <unset>),所以这一轴读 CSS 文本
    const gap = Number(/(?:^|;)\s*gap:\s*([\d.]+)px/.exec(copyRule!.body)?.[1]);
    expect(gap, '.copy 的 gap 读不出来').toBe(D_COPY_GAP);

    const px = (v: string): number => Number(v.replace('px', ''));
    const height =
      2 * D_PAD_BLOCK +
      px(title['font-size']!) * Number(title['line-height']) +
      gap +
      px(detail['font-size']!) * Number(detail['line-height']) * 2;
    expect(height, '和设计肉眼验收的两行形态对不上').toBeCloseTo(D_QA_HEIGHT, 1);
  });
});

/* ══ ⑤ 反向对照 ════════════════════════════════════════════════════════ */

describe('⑤ 反向对照', () => {
  it('普通用户消息没被改成这张卡 —— 只有命中那个 prompt 的才变', () => {
    const container = renderUserMessage('把导出按钮做大一点');
    expect(container.querySelector('[data-testid="design-system-generation-status"]')).toBeNull();
    // 气泡还在,而且正文原样
    const bubble = container.querySelector('.user-bubble');
    expect(bubble, '普通消息的气泡不见了').not.toBeNull();
    expect(bubble!.textContent).toContain('把导出按钮做大一点');
    // 反过来:命中的那条确实**没有**气泡
    cleanup();
    expect(card().closest('[data-testid="user-message"]')!.querySelector('.user-bubble')).toBeNull();
  });

  it('卡片仍在用户消息那一列里 —— 右对齐没被改掉', () => {
    const root = card();
    const msg = root.closest('[data-testid="user-message"]');
    expect(msg, '卡片跑出了用户消息壳').not.toBeNull();
    const stack = root.closest('.msg-stack');
    expect(stack, '卡片没坐在 .msg-stack 里 —— 右边界那两条上限管不到它').not.toBeNull();

    /* 右对齐是 chat.css 上两条 `align-items: flex-end` 给的(`.msg.user` /
       `.msg.user .msg-stack`)。`align-items` 不在量尺白名单里,所以这里问的是
       「那两条规则还匹配得到卡片的祖先吗」,而不是读一个恒为 <unset> 的值。 */
    const aligners = CSS.rules.filter(
      (r) => /(?:^|;)\s*align-items:\s*flex-end/.test(r.body) && msg!.matches(r.selector.split(',')[0]!.trim()),
    );
    expect(aligners.length, '没有任何 flex-end 规则匹配到用户消息壳 —— 这条对照是空的')
      .toBeGreaterThan(0);
    const stackAligners = CSS.rules.filter(
      (r) => /(?:^|;)\s*align-items:\s*flex-end/.test(r.body) && stack!.matches(r.selector.split(',')[0]!.trim()),
    );
    expect(stackAligners.length).toBeGreaterThan(0);
    // 防真空:同一把探针对一条不存在的声明必须一个都找不到
    expect(CSS.rules.filter((r) => /align-items:\s*flex-nowhere/.test(r.body)).length).toBe(0);
  });

  it('四枚接缝变量在亮暗两个作用域都解得出值', () => {
    const SEAM_VARS = [
      '--chat-status-card-surface',
      '--chat-status-card-ink',
      '--chat-status-card-icon-plate',
      '--chat-status-card-detail-ink',
    ] as const;
    const declares = (body: string, name: string): boolean =>
      new RegExp(`(^|[;\\s])${name}\\s*:`).test(body);

    // 防真空:这把尺子读得出「定义过」也读得出「没定义」
    expect(declares(seamScope('light'), '--chat-radius-lg')).toBe(true);
    expect(declares(seamScope('light'), '--chat-status-card-nonexistent')).toBe(false);

    for (const which of ['light', 'dark'] as const) {
      const body = seamScope(which);
      for (const name of SEAM_VARS) {
        expect(declares(body, name), `${which} 作用域缺 ${name} —— 那一侧会读回空串`).toBe(true);
        const value = new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(body)?.[1]?.trim();
        expect(value, `${name} 在 ${which} 作用域取不到值`).toBeTruthy();
      }
    }

    /* 稿子整份 `src/` 里这四枚字面各只声明了一次,**没有任何暗色覆盖**
       (`components.css` 的五处 `[data-theme="dark"]` 全是别的东西)。
       按接缝约定亮暗同值,不自己发明暗色。 */
    const light = seamScope('light');
    const dark = seamScope('dark');
    for (const name of SEAM_VARS) {
      const pickVal = (body: string): string =>
        new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(body)![1]!.trim();
      expect(pickVal(dark), `${name} 的暗色值是自己发明的 —— 稿子没给暗色覆盖`).toBe(pickVal(light));
    }
    expect(pickSeam(light, '--chat-status-card-surface')).toBe(D_SURFACE);
    expect(pickSeam(light, '--chat-status-card-ink')).toBe(D_INK);
    expect(pickSeam(light, '--chat-status-card-icon-plate')).toBe(D_ICON_PLATE);
    expect(pickSeam(light, '--chat-status-card-detail-ink')).toBe(D_DETAIL_INK);
  });

  it('组件 CSS Module 里没有硬编码色值 —— 只认 --chat-* 接缝(chat/AGENTS.md §2)', () => {
    const body = decomment(STATUS_CSS);
    // 防真空:同一把尺子在接缝层里必须找得到色值(那一层允许写字面)
    expect(/#[0-9a-fA-F]{3,8}\b/.test(decomment(SEAM_CSS))).toBe(true);
    expect(body.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], '组件里出现了硬编码色值').toEqual([]);
    expect(body, '组件不许写主题分支').not.toMatch(/data-theme/);
  });
});

function pickSeam(body: string, name: string): string {
  return new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(body)![1]!.trim();
}

/* ══ ⑥ i18n —— 19 个 locale 一个不少(遍历,不手数)══════════════════ */

describe('⑥ i18n', () => {
  const LOCALES_DIR = resolve(WEB, 'src/i18n/locales');
  const files = readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.ts'));
  const NEW_KEYS = ['chat.designSystemStatus.title', 'chat.designSystemStatus.description'] as const;

  it('防真空:扫描器确实读到了 19 份 locale,而且分得出「有」和「没有」', () => {
    expect(files.length, 'locale 文件数不对').toBe(19);
    const hasKey = (text: string, key: string): boolean =>
      new RegExp(`["']${key.replace(/\./g, '\\.')}["']\\s*:`).test(text);
    const en = readFileSync(resolve(LOCALES_DIR, 'en.ts'), 'utf-8');
    expect(hasKey(en, 'chat.record.done'), '连既有的键都扫不到 —— 尺子坏了').toBe(true);
    expect(hasKey(en, 'chat.designSystemStatus.nonexistent')).toBe(false);
  });

  it('两个新键在 19 份 locale 里都有,而且没有留 TODO 占位', () => {
    const missing: string[] = [];
    const placeholder: string[] = [];
    for (const file of files) {
      const text = readFileSync(resolve(LOCALES_DIR, file), 'utf-8');
      for (const key of NEW_KEYS) {
        const m = new RegExp(`["']${key.replace(/\./g, '\\.')}["']\\s*:\\s*(.+)`).exec(text);
        if (!m) {
          missing.push(`${file} → ${key}`);
          continue;
        }
        if (/TODO|FIXME|待翻译/i.test(m[1] ?? '')) placeholder.push(`${file} → ${key}`);
      }
    }
    expect(missing, '缺翻译').toEqual([]);
    expect(placeholder, '留了占位').toEqual([]);
  });

  it('两个新键都在 types.ts 的 Dict 里 —— 少了会过不了 typecheck', () => {
    const types = read('src/i18n/types.ts');
    for (const key of NEW_KEYS) {
      expect(types, `types.ts 里缺 ${key}`).toContain(`'${key}': string;`);
    }
  });

  it('旧那枚菜单文案的键没被顺手删掉 —— 菜单项和首轮会话标题还在用它', () => {
    // `DesignFilesPanel.tsx`(菜单项)/ `ProjectView.tsx`(首轮会话标题兜底)
    const menu = read('src/components/DesignFilesPanel.tsx');
    const project = read('src/components/ProjectView.tsx');
    expect(menu).toContain('designFiles.createDesignSystemFromProject');
    expect(project).toContain('designFiles.createDesignSystemFromProject');
    expect(read('src/i18n/types.ts')).toContain("'designFiles.createDesignSystemFromProject': string;");
  });
});
