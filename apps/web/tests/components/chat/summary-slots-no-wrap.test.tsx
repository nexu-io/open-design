// @vitest-environment jsdom
/**
 * OPEND-2548:**侧栏窄下来的时候,耗时不许换行。**
 *
 * 用户看到的是「1m 59s」被拆成两行 —— 一个时长被折成两截,读的人得先把它拼回去,
 * 而且那一行的高度会跟着跳一格。
 *
 * 折叠头是**三个独立槽位**:标题 / 耗时 / 箭头。窄下来时只能让标题槽收缩,
 * 另外两个是完整信息,少一个字符就变成别的意思:
 *   标题  `flex: 0 1 auto` + `min-width: 0` + 溢出省略  —— 唯一会让位的
 *   耗时  `flex: none` + `white-space: nowrap`          —— 不缩不换
 *   箭头  `flex: none`                                   —— 不许被标题挤掉
 *
 * `min-width: 0` 是关键的一条:flex 子项默认 `min-width: auto`,内容有多宽就撑多宽,
 * 于是标题根本不让位,挤压全落到后面两个槽上。
 *
 * 这里同时钉住**结构**:耗时和箭头必须是 summary 的直接子代、和标题槽平级 ——
 * 一旦被塞进标题槽里,上面三条写得再对也没用。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import type { ExecutionShell as Shell, ShellItem } from '../../../src/runtime/chat/contract';

afterEach(cleanup);

const CSS = readFileSync(
  resolve(__dirname, '../../../src/components/chat/primitives/record.module.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

function declsOf(selector: string): string {
  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const one of (m[1] ?? '').split(',')) {
      if (one.replace(/\s+/g, ' ').trim() === selector) return (m[2] ?? '').replace(/\s+/g, ' ').trim();
    }
  }
  return '';
}

describe('OPEND-2548 折叠头的三个槽位', () => {
  it('耗时槽不缩、不换行', () => {
    const meta = declsOf('.meta');
    expect(meta, '找不到 .meta 规则').not.toBe('');
    expect(meta).toMatch(/flex: none/);
    expect(meta).toMatch(/white-space: nowrap/);
  });

  it('只有标题槽让位:`min-width: 0` + 溢出省略', () => {
    const slot = declsOf('.summaryContent');
    expect(slot, '找不到 .summaryContent 规则').not.toBe('');
    expect(slot).toMatch(/flex: 0 1 auto/);
    // flex 子项默认 min-width: auto,不写这条标题根本不让位
    expect(slot).toMatch(/min-width: 0/);
    expect(slot).toMatch(/overflow: hidden/);
    expect(declsOf('.summaryContent > .name')).toMatch(/text-overflow: ellipsis/);
  });

  it('箭头槽不许被标题挤掉', () => {
    expect(declsOf('.chev')).toMatch(/flex: none/);
  });

  it('结构:耗时和箭头和标题槽平级,不在标题槽里', () => {
    const shell = {
      kind: 'shell', id: 'shell-1', seq: 0, status: 'done', segments: [],
      thinking: false, stopped: false, elapsedMs: 119_000, quietMs: null,
      items: [{
        kind: 'tool', id: 't1', tool: 'read',
        title: '一个长到足以把耗时挤出去的步骤标题,窄侧栏下必须由它让位',
        name: 'Read', rawTitle: false, file: null, delta: null, hits: null,
        pattern: null, elapsedMs: 119_000, failed: false, failReason: null,
        command: 'ls -la', terminal: 'out',
      } as ShellItem],
    } as unknown as Shell;
    const { container } = render(
      <I18nProvider initial="zh-CN">
        <ExecutionShell shell={shell} deferCollapsedBodies={false} />
      </I18nProvider>,
    );
    const summary = container.querySelector('details[class*="flat"] > summary');
    expect(summary).not.toBeNull();
    const slot = summary!.querySelector(':scope > [data-testid="chat-foldable-summary-content"]');
    const elapsed = summary!.querySelector(':scope > [data-testid="chat-foldable-elapsed"]');
    const chev = summary!.querySelector(':scope > [data-testid="chat-foldable-toggle"]');
    expect(slot).not.toBeNull();
    expect(elapsed).not.toBeNull();
    expect(chev).not.toBeNull();
    // 正向对照:耗时真的画出来了,而且是完整的一段(「1m 59s」不是「1m」)
    expect(elapsed!.textContent).toBe('1m 59s');
    // 反向对照:它们没有被裹进标题槽
    expect(slot!.querySelector('[data-testid="chat-foldable-elapsed"]')).toBeNull();
    expect(slot!.querySelector('[data-testid="chat-foldable-toggle"]')).toBeNull();
  });
});
