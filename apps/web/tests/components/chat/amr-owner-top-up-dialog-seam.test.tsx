// @vitest-environment jsdom
/**
 * 「找所有者充值」弹窗必须**自带 `--chat-*` 接缝**(Plane OPEND-2722)。
 *
 * ## 现场
 *
 * 用户报「团队成员额度不足时未正常弹出联系 owner 充值或升级的提示」。弹窗其实
 * **弹出来了** —— 它只是整个透明:遮罩、卡片底色、投影、圆角全部解析失败,
 * 文字裸浮在页面上,看起来像什么都没发生。
 *
 * 机制和 `SupportDialog` 2026-08-27 那次逐字相同:这张弹窗走
 * `createPortal(dialog, document.body)`,而 CSS 自定义属性按 **DOM 树**继承,
 * `--chat-*` 只在 `[data-chat-root]` 那棵子树里声明(`ChatRoot.module.css`)——
 * portal 出去就落在接缝之外。于是
 *
 *   .overlay { background: color-mix(in srgb, var(--chat-text-strong) 26%, transparent) }
 *   .modal   { background: var(--chat-bg); box-shadow: var(--chat-shadow-lg);
 *              border-radius: var(--chat-radius-lg) }
 *
 * 里每一枚变量都解析成**空串**,整条声明作废。`ChatRoot.tsx` 的注释逐字预言过:
 * 「脱离它,`--chat-*` 变量全部落空,组件会退化成无色无字号的裸结构 ——
 * **而且不报错**」。
 *
 * ## 判据为什么不是「按 testid 断言存在」
 *
 * 现有 `ProjectView.amr-balance-branches.test.tsx` 就是按
 * `getByTestId('amr-balance-owner-dialog')` 断言的 —— 弹窗**确实在 DOM 里**,
 * 那条断言从头到尾是绿的,这个缺陷就是这么潜伏下来的。所以这里改成量
 * **计算样式**:把两份真实样式表灌进文档,在弹窗自己那两个元素上问
 * `getComputedStyle`,看它消费的那几枚 `--chat-*` 到底解析出什么。
 *
 * ## 这把尺子准不准
 *
 * jsdom 不做 `var()` 代入(整份文件下面那条 calibration 里实测:seam 之内
 * `background` 照样是 `rgba(0, 0, 0, 0)`),所以**不能**去量
 * `backgroundColor !== transparent` —— 那个读数在修好之后也不会变,是假绿。
 * 但 jsdom **确实按 DOM 树继承自定义属性**:接缝之内 `getPropertyValue('--chat-bg')`
 * 拿得到值,接缝之外拿到的是空串 —— 正是真机上量到的那个读数
 * (`support-dialog-seam.test.tsx` 头注:「`--chat-bg` 解析出来是**空串**」)。
 * 下面第一组 calibration 先把这件事就地证明一遍,再往下断言才有意义。
 *
 * ⚠️ 真机上「底色到底画没画出来」只有浏览器能确认,jsdom 到此为止。
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

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../../src');

/**
 * 把 Module 源码里的本地类名换成 vitest 编译出来的那一份(`vars` → `_vars_bfdc57`),
 * 这样灌进文档的样式表才和渲染出来的 `class` 对得上。
 *
 * 只匹配 `.` 后面跟【字母或下划线】的形式 —— `rgba(0,0,0,.35)` / `0.88` 这类
 * 数值里的点不会被误伤。
 */
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
const dialogCss = localize(
  readFileSync(resolve(SRC, 'components/chat/AmrOwnerTopUpDialog.module.css'), 'utf8'),
  dialogStyles as unknown as Record<string, string>,
);

/**
 * 弹窗自己那两个元素**实际消费**的 `--chat-*`,从
 * `AmrOwnerTopUpDialog.module.css` 的 `.overlay` / `.modal` 两个块里读出来,
 * 不是手抄的清单 —— 手抄的清单会在样式改了之后静静地量错东西。
 */
function varsConsumedBy(selector: string): string[] {
  const i = dialogCss.indexOf(`.${(dialogStyles as unknown as Record<string, string>)[selector]}`);
  if (i < 0) throw new Error(`选择器 .${selector} 没找到 —— 改名了,断言会空转`);
  const block = dialogCss.slice(i, dialogCss.indexOf('}', i));
  return [...new Set([...block.matchAll(/var\(\s*(--chat-[a-z0-9-]+)/g)].map((m) => m[1]!))];
}

let styleEl: HTMLStyleElement;

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('open-design:locale', 'zh-CN');
  window.localStorage.setItem('open-design:locale-source', 'manual');
  styleEl = document.createElement('style');
  styleEl.textContent = `${seamCss}\n${dialogCss}`;
  document.head.appendChild(styleEl);
});

afterEach(() => {
  cleanup();
  styleEl.remove();
  window.localStorage.clear();
});

/**
 * 产品里的形态:页面上有那唯一一层接缝,弹窗从接缝**之内**渲染 ——
 * 但它 portal 到 `<body>`,于是 DOM 树上仍然在接缝之外。
 * 两个调用点(`ProjectView` / `EntryShell`)都是这个形态。
 */
function renderPortalled() {
  render(
    <I18nProvider>
      <ChatRoot>
        <AmrOwnerTopUpDialog onClose={() => {}} />
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
    // 不带变量的字面声明活着,证明选择器匹配上了
    expect(getComputedStyle(probe).position).toBe('fixed');
    probe.remove();
  });

  it('接缝之内量得到值,接缝之外量到的是空串 —— 真机上那个读数', () => {
    const seam = document.createElement('div');
    seam.className = (chatRootStyles as unknown as Record<string, string>).vars!;
    const inside = document.createElement('div');
    seam.appendChild(inside);
    const outside = document.createElement('div');
    document.body.append(seam, outside);

    expect(getComputedStyle(inside).getPropertyValue('--chat-bg')).not.toBe('');
    expect(getComputedStyle(outside).getPropertyValue('--chat-bg')).toBe('');

    seam.remove();
    outside.remove();
  });

  it('量 background 是量不出来的 —— jsdom 不做 var() 代入,那个读数会假绿', () => {
    const seam = document.createElement('div');
    seam.className = (chatRootStyles as unknown as Record<string, string>).vars!;
    const modal = document.createElement('div');
    modal.className = (dialogStyles as unknown as Record<string, string>).modal!;
    seam.appendChild(modal);
    document.body.appendChild(seam);
    // 接缝之内、变量解析得出来,`background` 照样是透明的 —— 所以判据不能钉在它身上
    expect(getComputedStyle(modal).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    seam.remove();
  });

  it('弹窗确实消费 --chat-*,而且确实 portal 出去', () => {
    expect(varsConsumedBy('overlay')).toContain('--chat-text-strong');
    expect(varsConsumedBy('modal').length).toBeGreaterThan(0);
    const source = readFileSync(resolve(SRC, 'components/chat/AmrOwnerTopUpDialog.tsx'), 'utf8');
    expect(source).toMatch(/createPortal\(dialog, document\.body\)/);
  });
});

describe('浮层形态:弹窗自己那两个元素上,--chat-* 都解析得出值', () => {
  it('遮罩消费的每一枚变量都不是空串', () => {
    const { overlay } = renderPortalled();
    const computed = getComputedStyle(overlay);
    const empty = varsConsumedBy('overlay').filter(
      (name) => computed.getPropertyValue(name).trim() === '',
    );
    expect(
      empty,
      '遮罩挂在 <body> 下、落在接缝之外,这些 --chat-* 解析成空串,' +
        'background: color-mix(… var(--chat-text-strong) …) 整条作废 —— 遮罩不画,而且不报错',
    ).toEqual([]);
  });

  it('卡片消费的每一枚变量都不是空串', () => {
    const { modal } = renderPortalled();
    const computed = getComputedStyle(modal);
    const empty = varsConsumedBy('modal').filter(
      (name) => computed.getPropertyValue(name).trim() === '',
    );
    expect(
      empty,
      '卡片的 background / box-shadow / border-radius 全部取自这些变量 —— ' +
        '空串就是「文字裸浮在页面上」那个现场',
    ).toEqual([]);
  });

  it('排版基线也一起带过来了 —— 接缝上那三条不是变量,漏了同样看不出来', () => {
    const { overlay } = renderPortalled();
    expect(getComputedStyle(overlay).fontWeight).toBe('500');
  });
});

/**
 * 两个调用点(`ProjectView` 聊天页 / `EntryShell` 首页)都必须落在**浮层形态**上。
 *
 * 接缝挂在「不是 `inline`」那一支 —— 哪天有人在调用点补一个 `inline`
 * 想「就地渲染」,弹窗会退回没有接缝的那条路,而上面那些断言查的是组件本身,
 * 照样全绿。这里把两个调用点各钉一遍。
 */
describe('两个调用点都走浮层形态', () => {
  const callSites = [
    { file: 'components/ProjectView.tsx', label: '聊天页' },
    { file: 'components/EntryShell.tsx', label: '首页' },
  ];

  for (const { file, label } of callSites) {
    it(`${label}(${file})渲染的是带接缝的那一支`, () => {
      const src = readFileSync(resolve(SRC, file), 'utf8');
      const at = src.indexOf('<AmrOwnerTopUpDialog');
      expect(at, `${file} 里找不到调用点 —— 挪走了,断言会空转`).toBeGreaterThan(0);
      const tag = src.slice(at, src.indexOf('/>', at) + 2);
      expect(
        tag,
        `${file} 的调用点传了 inline —— 那一支不挂接缝,--chat-* 会重新落空`,
      ).not.toMatch(/\binline\b/);
      // 只有一个调用点,别漏掉第二处
      expect(src.indexOf('<AmrOwnerTopUpDialog', at + 1)).toBe(-1);
    });
  }
});

describe('就地形态没被这条改坏', () => {
  it('陈列页那一格本来就在接缝之内,不重复挂一层', () => {
    render(
      <I18nProvider>
        <ChatRoot>
          <AmrOwnerTopUpDialog inline onClose={() => {}} />
        </ChatRoot>
      </I18nProvider>,
    );
    const overlay = screen.getByTestId('amr-balance-owner-dialog');
    expect(overlay.hasAttribute('data-chat-root')).toBe(false);
    // 它渲染在包裹层里,变量照样继承得到
    expect(getComputedStyle(overlay).getPropertyValue('--chat-bg')).not.toBe('');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
});
