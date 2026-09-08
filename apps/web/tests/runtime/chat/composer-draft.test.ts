// @vitest-environment jsdom
/**
 * 草稿落盘规则的判据。这一层是纯函数 + localStorage,不碰 React ——
 * 「存坏了会怎样」「太大了会怎样」在这里判得最便宜。
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  DRAFT_MAX_EXTRAS_CHARS,
  DRAFT_MAX_QUOTES,
  DRAFT_MAX_QUOTE_CHARS,
  clearComposerDraftExtras,
  composerDraftExtrasKey,
  loadComposerDraftExtras,
  sanitizeComposerDraftExtras,
  saveComposerDraftExtras,
  serializeComposerDraftExtras,
  type ComposerDraftExtras,
} from '../../../src/runtime/chat/composer-draft';

const KEY = 'od:chat-composer:draft:p1:c1';

function extras(patch: Partial<ComposerDraftExtras> = {}): ComposerDraftExtras {
  return {
    attachments: [],
    commentAttachments: [],
    quotes: [],
    context: { skillIds: [], mcpServerIds: [], connectorIds: [], workspaceItems: [] },
    ...patch,
  };
}

afterEach(() => {
  window.localStorage.clear();
});

describe('composer draft extras · 存取', () => {
  it('存了就能原样读回来', () => {
    saveComposerDraftExtras(KEY, extras({
      attachments: [{ path: 'a.png', name: 'a.png', kind: 'image', order: 0 }],
      quotes: [{ id: 'q1', text: '商品卡已经抽成共享组件', messageId: 'm1' }],
      context: { skillIds: ['deck'], mcpServerIds: [], connectorIds: [], workspaceItems: [] },
    }));

    const back = loadComposerDraftExtras(KEY);
    expect(back.attachments).toEqual([{ path: 'a.png', name: 'a.png', kind: 'image', order: 0 }]);
    expect(back.quotes).toEqual([{ id: 'q1', text: '商品卡已经抽成共享组件', messageId: 'm1' }]);
    expect(back.context.skillIds).toEqual(['deck']);
  });

  it('从没存过的 key 什么都读不出来(而不是读出上一份)', () => {
    saveComposerDraftExtras(KEY, extras({ quotes: [{ id: 'q1', text: '存过的', messageId: 'm1' }] }));

    const other = loadComposerDraftExtras('od:chat-composer:draft:p1:c2');
    expect(other.quotes).toEqual([]);
    expect(other.attachments).toEqual([]);
    expect(loadComposerDraftExtras(undefined).quotes).toEqual([]);
  });

  it('空负载不落盘 —— 存过再清空,key 要消失', () => {
    saveComposerDraftExtras(KEY, extras({ quotes: [{ id: 'q1', text: '先存一条', messageId: 'm1' }] }));
    expect(window.localStorage.getItem(composerDraftExtrasKey(KEY))).toBeTruthy();

    saveComposerDraftExtras(KEY, extras());
    expect(window.localStorage.getItem(composerDraftExtrasKey(KEY))).toBeNull();
  });

  it('clear 只清 extras,正文那把 key 不动', () => {
    window.localStorage.setItem(KEY, '正文还在');
    saveComposerDraftExtras(KEY, extras({ quotes: [{ id: 'q1', text: '一条', messageId: 'm1' }] }));

    clearComposerDraftExtras(KEY);
    expect(window.localStorage.getItem(composerDraftExtrasKey(KEY))).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBe('正文还在');
  });
});

describe('composer draft extras · 坏数据只丢不抛', () => {
  it('整段 JSON 坏掉 → 当作没存过,不抛', () => {
    window.localStorage.setItem(composerDraftExtrasKey(KEY), '{这不是 JSON');
    expect(() => loadComposerDraftExtras(KEY)).not.toThrow();
    expect(loadComposerDraftExtras(KEY).quotes).toEqual([]);
  });

  it('顶层不是对象(null / 数组 / 字符串)也不抛', () => {
    for (const junk of ['null', '[1,2,3]', '"just a string"', '42']) {
      window.localStorage.setItem(composerDraftExtrasKey(KEY), junk);
      expect(() => loadComposerDraftExtras(KEY)).not.toThrow();
      expect(loadComposerDraftExtras(KEY).attachments).toEqual([]);
    }
  });

  it('单条不合格只丢那一条,好的照样回来', () => {
    window.localStorage.setItem(composerDraftExtrasKey(KEY), JSON.stringify({
      attachments: [
        { name: '没有 path.png', kind: 'image' },
        null,
        'a string',
        { path: 'good.png', name: 'good.png', kind: 'image' },
      ],
      quotes: [
        { id: 'q0', text: '   ', messageId: 'm1' },
        { id: 'q1', text: '留下来的这条', messageId: 'm1' },
      ],
      context: {
        skillIds: ['deck', 42, null, ''],
        mcpServerIds: 'not-an-array',
        connectorIds: undefined,
        workspaceItems: [{ label: '没有 id' }, { id: 'w1', kind: 'tab', label: '好的' }],
      },
    }));

    const back = loadComposerDraftExtras(KEY);
    expect(back.attachments.map((a) => a.path)).toEqual(['good.png']);
    expect(back.quotes.map((q) => q.text)).toEqual(['留下来的这条']);
    expect(back.context.skillIds).toEqual(['deck']);
    expect(back.context.mcpServerIds).toEqual([]);
    expect(back.context.connectorIds).toEqual([]);
    expect(back.context.workspaceItems.map((w) => w.id)).toEqual(['w1']);
  });

  it('缺 kind 的附件退回 file,不是被丢掉', () => {
    window.localStorage.setItem(composerDraftExtrasKey(KEY), JSON.stringify({
      attachments: [{ path: 'x.txt', name: 'x.txt' }],
    }));
    expect(loadComposerDraftExtras(KEY).attachments).toEqual([
      { path: 'x.txt', name: 'x.txt', kind: 'file' },
    ]);
  });
});

describe('composer draft extras · 上界', () => {
  it('引用条数封顶', () => {
    const many = Array.from({ length: DRAFT_MAX_QUOTES + 10 }, (_, i) => ({
      id: `q${i}`, text: `第 ${i} 段`, messageId: 'm1',
    }));
    expect(sanitizeComposerDraftExtras({ quotes: many }).quotes).toHaveLength(DRAFT_MAX_QUOTES);
  });

  it('单条引用超长掐断', () => {
    const long = 'x'.repeat(DRAFT_MAX_QUOTE_CHARS + 500);
    const [quote] = sanitizeComposerDraftExtras({ quotes: [{ id: 'q', text: long, messageId: 'm' }] }).quotes;
    expect(quote?.text).toHaveLength(DRAFT_MAX_QUOTE_CHARS);
  });

  it('序列化超上界时按「先丢标注、再丢附件」的顺序减重', () => {
    // 一条标注就把额度撑爆 —— htmlHint 是页面片段,现实里确实能这么大。
    const fat = 'y'.repeat(DRAFT_MAX_EXTRAS_CHARS);
    const encoded = serializeComposerDraftExtras(extras({
      commentAttachments: [{
        id: 'c1', order: 0, filePath: 'index.html', elementId: 'e1', selector: '#e1',
        label: 'L', comment: 'C', currentText: 'T',
        pagePosition: { x: 0, y: 0 }, htmlHint: fat,
      } as never],
      quotes: [{ id: 'q1', text: '这条要活下来', messageId: 'm1' }],
    }));

    expect(encoded).toBeTruthy();
    const parsed = JSON.parse(encoded as string);
    expect(parsed.commentAttachments).toEqual([]);
    expect(parsed.quotes.map((q: { text: string }) => q.text)).toEqual(['这条要活下来']);
    expect((encoded as string).length).toBeLessThanOrEqual(DRAFT_MAX_EXTRAS_CHARS);
  });

  it('减到最后还是超,就一个字都不写', () => {
    // 附件路径本身撑爆额度:丢完标注、丢完附件之后就空了,空负载不落盘。
    const huge = Array.from({ length: 40 }, (_, i) => ({
      path: `${'p'.repeat(4000)}-${i}.png`, name: `${i}.png`, kind: 'image' as const,
    }));
    expect(serializeComposerDraftExtras(extras({ attachments: huge }))).toBeNull();

    saveComposerDraftExtras(KEY, extras({ attachments: huge }));
    expect(window.localStorage.getItem(composerDraftExtrasKey(KEY))).toBeNull();
  });

  it('存下去的东西一定在上界之内(存的那一侧也过同一套判据)', () => {
    saveComposerDraftExtras(KEY, extras({
      quotes: Array.from({ length: 100 }, (_, i) => ({
        id: `q${i}`, text: 'z'.repeat(5000), messageId: 'm1',
      })),
    }));
    const raw = window.localStorage.getItem(composerDraftExtrasKey(KEY)) ?? '';
    expect(raw.length).toBeLessThanOrEqual(DRAFT_MAX_EXTRAS_CHARS);
    expect(JSON.parse(raw).quotes).toHaveLength(DRAFT_MAX_QUOTES);
  });
});
