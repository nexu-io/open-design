/**
 * 联系支持弹窗必须**压在所有应用层之上**。
 *
 * 用户 2026-08-27 两次报同一件事:「你这个弹窗怎么没背景.. 跟背后都融到一块去了」
 * (那次是 token 作用域,已修),以及「右上角两个好像也在蒙层之上」。
 *
 * 真机用 `elementFromPoint` 逐点探到的层号:
 *   右上角 star / 额度胶囊  `.entry-top-right-cluster`  **z = 150**
 *   输入框固定层            `.chat-composer-fixed-layer` **z = 45**
 *   弹窗蒙层                `SupportDialog` overlay       **z = 40**   ← 最低
 * 于是蒙层压不住这两处:输入框和右上角照常亮着,像蒙层漏了两个洞。
 *
 * 判据不写死数字比大小,而是**和同侪模态对齐**:`.staged-preview-modal`(聊天区
 * 另一个真模态)用的是 1500,那一档就是这个仓库的模态层。写死一个 151 之类的
 * 数字只会在下一个人抬高某个 chrome 时再坏一次。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string): string => readFileSync(resolve(__dirname, '../../../src', p), 'utf8');

/** 取某个选择器块里声明的 z-index */
function zIndexOf(css: string, selector: string): number | null {
  const i = css.indexOf(selector);
  if (i < 0) return null;
  const block = css.slice(i, css.indexOf('}', i));
  const m = /z-index:\s*(\d+)/.exec(block);
  return m ? Number(m[1]) : null;
}

describe('联系支持弹窗的层级', () => {
  const chat = read('styles/chat.css');
  const dialog = read('components/chat/SupportDialog.module.css');

  it('拿得到三个参照层 —— 拿不到就说明选择器改名了,断言会空转', () => {
    expect(zIndexOf(chat, '.chat-composer-fixed-layer')).not.toBeNull();
    expect(zIndexOf(chat, '.staged-preview-modal')).not.toBeNull();
    expect(zIndexOf(dialog, '.overlay')).not.toBeNull();
  });

  it('压得住输入框那个固定层', () => {
    expect(zIndexOf(dialog, '.overlay')!).toBeGreaterThan(zIndexOf(chat, '.chat-composer-fixed-layer')!);
  });

  it('压得住右上角那排 chrome(真机量到 z = 150)', () => {
    expect(zIndexOf(dialog, '.overlay')!).toBeGreaterThan(150);
  });

  it('和同侪模态同一档 —— 不自立一个新数字', () => {
    expect(zIndexOf(dialog, '.overlay')!).toBeGreaterThanOrEqual(zIndexOf(chat, '.staged-preview-modal')!);
  });

  it('就地形态不许跟着抬 —— 它躺在文档流里,抬了会盖住陈列页别的格子', () => {
    const i = dialog.indexOf('.overlayInline');
    const block = dialog.slice(i, dialog.indexOf('}', i));
    expect(block).toMatch(/z-index:\s*auto/);
  });
});
