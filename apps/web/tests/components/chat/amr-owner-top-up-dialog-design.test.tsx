// @vitest-environment jsdom
/**
 * 「找所有者充值」弹窗要**长成产品稿那张卡**。
 *
 * 权威源:产品 2026-09-07 给的 `topup-reminder2.html`。它不是截图,是一份可跑的
 * 页面 —— 下面每一个数都是在真 Chrome 里 `getComputedStyle` 量出来的,不是照着
 * 图估的,也不是 diff CSS 文本猜的(只 diff 源码会漏掉层叠反转,这个仓库栽过)。
 *
 * ## 稿子里量到、我们身上没有的那几件
 *
 * | 项 | 稿子实测 | 改之前我们实测 |
 * |---|---|---|
 * | 插画横幅 | 480×205.71,`cloud-signin-aurora.jpg`(1680×720) | **整个不存在** |
 * | 横幅出血 | `margin:-36px -24px 24px` 正好抵掉卡片 `padding:36px 24px 24px` | — |
 * | 卡片宽 | `min(480px, calc(100vw - 32px))` | `max-width:340px` |
 * | 标题 | 18px / 600 / 居中,是张卡的主标题 | 12px / 600 / 左对齐,压在一条带分隔线的标题栏里 |
 * | 正文 | 13.5px / 400 / 居中 / 下留 18px | 12px / 继承 500 / 左对齐 / 下留 0 |
 * | 「知道了」 | 整宽、40px 高的胶囊 | 58×20,贴在右下角 |
 * | 遮罩 | `#202020 42%` + `blur(4px)` | `#202020 26%`,不模糊 |
 *
 * ## 这把尺子准不准(量法自检)
 *
 * jsdom **不做 `var()` 代入** —— 这是 `amr-owner-top-up-dialog-seam.test.tsx`
 * 头注里那条已经证明过的事:接缝之内 `background` 照样读成 `rgba(0,0,0,0)`。
 * 所以凡是走 `var(--chat-*)` 的那几档(字号、颜色、圆角、遮罩那 42%)在这里
 * **量不出来**,钉在它们身上的断言会是假绿。
 *
 * 于是这份文件只钉 **jsdom 真读得出来的那半边**:
 *   · DOM 结构与属性(横幅那张 `<img>` 的 `src` / `alt` / 固有宽高)
 *   · **字面**声明(`margin` / `padding` / `text-align` / `font-weight` /
 *     `width` / `min-height` / `backdrop-filter` / `overflow`)
 *
 * 另外半边(18px / 13.5px / #fafafa / 42% 这些走变量的)由**真 Chrome 实测**
 * 兜住,不在这里假装量得到。这份文件对它们只保证一件事:它们消费的每一枚
 * `--chat-*` 在接缝里**都解析得出值** —— 解析不出来就是 OPEND-2722 那个现场
 * (声明整条作废,画面不画,而且不报错)。
 *
 * 下面第一组 calibration 先把「哪些读得出、哪些读不出」就地证一遍,再往下断言
 * 才有意义。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { I18nProvider } from '../../../src/i18n';
import { ChatRoot } from '../../../src/components/chat/ChatRoot';
import { AmrOwnerTopUpDialog } from '../../../src/components/chat/AmrOwnerTopUpDialog';
import chatRootStyles from '../../../src/components/chat/ChatRoot.module.css';
import dialogStyles from '../../../src/components/chat/AmrOwnerTopUpDialog.module.css';
import buttonStyles from '../../../../../packages/components/src/button.module.css';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../../src');
const COMPONENTS_SRC = resolve(HERE, '../../../../../packages/components/src');

/** 和 seam 那份同一个做法:把源码里的本地类名换成 vitest 编译出来的那一份。 */
function localize(cssText: string, styles: Record<string, string>): string {
  return cssText.replace(/\.([A-Za-z_][A-Za-z0-9_-]*)/g, (whole, name: string) => {
    const mapped = styles[name];
    return mapped ? `.${mapped}` : whole;
  });
}

const seamCss = localize(
  readFileSync(resolve(SRC, 'components/chat/ChatRoot.module.css'), 'utf8'),
  chatRootStyles as unknown as Record<string, string>,
);
const buttonCss = localize(
  readFileSync(resolve(COMPONENTS_SRC, 'button.module.css'), 'utf8'),
  buttonStyles as unknown as Record<string, string>,
);
const dialogCssSource = readFileSync(
  resolve(SRC, 'components/chat/AmrOwnerTopUpDialog.module.css'),
  'utf8',
);
const dialogCss = localize(
  dialogCssSource,
  dialogStyles as unknown as Record<string, string>,
);

/**
 * 弹窗**整份**样式表消费的 `--chat-*`,从源码里读出来,不是手抄的清单。
 *
 * seam 那份只扫 `.overlay` / `.modal` 两个块(它管的是「portal 出去之后接缝还在
 * 不在」)。这份扫全文件 —— 横幅、标题、正文、按钮上新加的变量同样会静静地
 * 解析成空串,而且同样不报错。
 */
function allChatVarsConsumed(): string[] {
  return [
    ...new Set(
      [...dialogCssSource.matchAll(/var\(\s*(--chat-[a-z0-9-]+)/g)].map((m) => m[1]!),
    ),
  ].sort();
}

let styleEl: HTMLStyleElement;

beforeEach(() => {
  window.localStorage.clear();
  // 产品稿是中文原件,判据钉在中文上。
  window.localStorage.setItem('open-design:locale', 'zh-CN');
  window.localStorage.setItem('open-design:locale-source', 'manual');
  styleEl = document.createElement('style');
  // 顺序照产品里的层叠:先接缝,再 Button primitive,最后弹窗自己的 Module。
  styleEl.textContent = `${seamCss}\n${buttonCss}\n${dialogCss}`;
  document.head.appendChild(styleEl);
});

afterEach(() => {
  cleanup();
  styleEl.remove();
  window.localStorage.clear();
});

/** 产品里的形态:接缝之内渲染、portal 到 `<body>`(两个调用点都是这个)。 */
function renderDialog(props: { ownerName?: string | null } = {}) {
  render(
    <I18nProvider>
      <ChatRoot>
        <AmrOwnerTopUpDialog onClose={() => {}} {...props} />
      </ChatRoot>
    </I18nProvider>,
  );
  const overlay = screen.getByTestId('amr-balance-owner-dialog');
  const modal = screen.getByRole('dialog') as HTMLElement;
  return { overlay, modal };
}

describe('先证明这把尺子能照出缺陷', () => {
  it('样式表真的灌进去了 —— 灌不进去下面全是空转', () => {
    const probe = document.createElement('div');
    probe.className = (dialogStyles as unknown as Record<string, string>).overlay!;
    document.body.appendChild(probe);
    expect(getComputedStyle(probe).position).toBe('fixed');
    probe.remove();
  });

  it('字面声明读得出来,走 var() 的读不出来 —— 断言只能钉在前者身上', () => {
    const probe = document.createElement('style');
    probe.textContent = `
      .ownerdlg-literal { margin: -36px -24px 24px; text-align: center; backdrop-filter: blur(4px); }
      .ownerdlg-viadep  { font-size: var(--chat-t-mini); }
    `;
    document.head.appendChild(probe);
    const seam = document.createElement('div');
    seam.className = (chatRootStyles as unknown as Record<string, string>).vars!;
    const literal = document.createElement('div');
    literal.className = 'ownerdlg-literal';
    const viaVar = document.createElement('div');
    viaVar.className = 'ownerdlg-viadep';
    seam.append(literal, viaVar);
    document.body.appendChild(seam);

    // 读得出来的那半边
    expect(getComputedStyle(literal).marginTop).toBe('-36px');
    expect(getComputedStyle(literal).textAlign).toBe('center');
    expect(getComputedStyle(literal).backdropFilter).toBe('blur(4px)');
    // 读不出来的那半边:变量本身在接缝里有值,`font-size` 却拿不到代入结果
    expect(getComputedStyle(seam).getPropertyValue('--chat-t-mini').trim()).not.toBe('');
    expect(getComputedStyle(viaVar).fontSize).not.toBe('12px');

    seam.remove();
    probe.remove();
  });

  it('「变量解析得出值」这条查得动 —— 编一个不存在的变量名,它必须读成空串', () => {
    const seam = document.createElement('div');
    seam.className = (chatRootStyles as unknown as Record<string, string>).vars!;
    document.body.appendChild(seam);
    const computed = getComputedStyle(seam);
    expect(computed.getPropertyValue('--chat-bg').trim()).not.toBe('');
    expect(computed.getPropertyValue('--chat-does-not-exist').trim()).toBe('');
    seam.remove();
  });
});

describe('插画横幅', () => {
  it('弹窗里有那张插画', () => {
    const { modal } = renderDialog();
    const banner = modal.querySelector('img');
    expect(
      banner,
      '产品稿顶上那块抽象画整个不在 —— 卡片从标题栏就开始了',
    ).not.toBeNull();
  });

  it('用的是现成那张 cloud-signin-aurora.jpg,不是新素材', () => {
    const { modal } = renderDialog();
    const banner = modal.querySelector('img')!;
    // 产品稿的 `.media-panel img` 直接指向仓库里这个路径,和 `AmrBalanceDialog`
    // 那张是同一份文件 —— 不需要从稿子里抠新素材。
    expect(banner.getAttribute('src')).toBe('/upgrade/cloud-signin-aurora.jpg');
  });

  it('是装饰图:空 alt,不进无障碍树', () => {
    const { modal } = renderDialog();
    const banner = modal.querySelector('img')!;
    expect(banner.getAttribute('alt')).toBe('');
  });

  it('带固有宽高,加载时不跳版', () => {
    const { modal } = renderDialog();
    const banner = modal.querySelector('img')!;
    // 稿子实测 480×205.71 —— 高度是 480 ÷ (1680/720) 算出来的,没有裁切。
    expect(banner.getAttribute('width')).toBe('1680');
    expect(banner.getAttribute('height')).toBe('720');
  });

  it('出血到卡片边缘:负外边距正好抵掉卡片内距', () => {
    const { modal } = renderDialog();
    const banner = modal.querySelector('img')!.parentElement!;
    const card = getComputedStyle(modal);
    const media = getComputedStyle(banner);
    // 稿子实测:横幅的 rect 和卡片的 rect 左上角重合、宽度相等(480 = 480)。
    // 在 jsdom 里没有布局,所以钉住产生那个结果的那条不变量本身。
    expect(card.paddingTop).toBe('36px');
    expect(card.paddingLeft).toBe('24px');
    expect(card.paddingRight).toBe('24px');
    expect(media.marginTop).toBe('-36px');
    expect(media.marginLeft).toBe('-24px');
    expect(media.marginRight).toBe('-24px');
    // 圆角由卡片裁,横幅自己不重复画一遍
    expect(card.overflow).toBe('hidden');
  });
});

describe('卡片本体', () => {
  it('是 480 那一档,不是 340', () => {
    const { modal } = renderDialog();
    expect(
      getComputedStyle(modal).maxWidth,
      '稿子实测 480 宽;340 那一档是 SupportDialog 的小弹窗骨架',
    ).toBe('480px');
  });

  it('内距是 36 / 24 / 24 —— 横幅的负外边距按这三个数抵', () => {
    const { modal } = renderDialog();
    const card = getComputedStyle(modal);
    expect(card.paddingTop).toBe('36px');
    expect(card.paddingBottom).toBe('24px');
  });
});

describe('标题', () => {
  it('是这张卡的主标题,不是标题栏里的一行小字', () => {
    renderDialog();
    expect(
      screen.getByRole('heading', { name: '请联系团队所有者充值' }),
      '稿子里标题坐在插画下面、18px 居中;我们把它塞进了一条 12px 的标题栏',
    ).toBeTruthy();
  });

  it('居中、600', () => {
    renderDialog();
    const title = screen.getByRole('heading', { name: '请联系团队所有者充值' });
    const computed = getComputedStyle(title);
    expect(computed.textAlign).toBe('center');
    expect(computed.fontWeight).toBe('600');
  });
});

describe('正文', () => {
  it('居中、400,下面留 18px 到按钮', () => {
    renderDialog();
    const message = screen.getByText(
      '当前仅团队所有者可以为团队充值，请联系团队所有者完成充值后再继续使用。',
    );
    const computed = getComputedStyle(message);
    expect(computed.textAlign).toBe('center');
    expect(computed.fontWeight).toBe('400');
    expect(computed.marginBottom).toBe('18px');
  });

  it('Owner 名字加粗成一档,和普通正文分得开', () => {
    renderDialog({ ownerName: '张三' });
    // 加粗的是名字本身;两边那对「」是句子的标点,留在正文里(稿子里那个位置
    // 压根没有括号,所以「括号算不算名字的一部分」没有稿面依据,不自行发挥)。
    const emphasised = screen.getByText('张三');
    // 稿子实测:`.owner-name { font-weight: 700 }`,正文是 400 —— 差整整三档。
    expect(getComputedStyle(emphasised).fontWeight).toBe('700');
  });
});

describe('「知道了」', () => {
  it('是整宽 40px 的胶囊,不是贴在右下角的小按钮', () => {
    renderDialog();
    const cta = screen.getByTestId('amr-balance-owner-dismiss');
    const computed = getComputedStyle(cta);
    // 稿子实测 432×40(432 = 480 − 24×2 内距),我们实测 58×20 且靠右。
    expect(computed.width).toBe('100%');
    expect(computed.height).toBe('40px');
  });
});

describe('遮罩', () => {
  it('压得更实、还糊一层', () => {
    const { overlay } = renderDialog();
    const computed = getComputedStyle(overlay);
    // 稿子实测 `rgba(32,32,32,0.42)` + `blur(4px)`;我们是 26%、不糊。
    // 那 42% 走 `var(--chat-text-strong)`,jsdom 代入不了 —— 由真 Chrome 兜住,
    // 这里只钉 jsdom 读得出来的这两条。
    expect(computed.backdropFilter).toBe('blur(4px)');
    expect(computed.padding).toBe('16px');
  });
});

describe('新加的样式没有把接缝捅漏', () => {
  it('整份样式表消费的每一枚 --chat-* 都解析得出值', () => {
    const { overlay } = renderDialog();
    const computed = getComputedStyle(overlay);
    const consumed = allChatVarsConsumed();
    expect(consumed.length, '一枚都没扫到 —— 正则失配了,下面是空转').toBeGreaterThan(0);
    const empty = consumed.filter((name) => computed.getPropertyValue(name).trim() === '');
    expect(
      empty,
      '这些 --chat-* 在接缝里没有定义,整条声明会作废 —— 画面不画,而且不报错',
    ).toEqual([]);
  });
});
