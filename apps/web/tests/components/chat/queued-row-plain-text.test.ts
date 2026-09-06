/**
 * 发送队列里每一条**只显示纯文本**。
 *
 * 用户裁决(2026-08-27):
 *   「1 workspace context 干掉不要了」
 *   「不要这些东西了,发送队列就只有纯文本吧?」
 *
 * 删掉的是 `QueuedSendMetaChips` 整排 —— 它会把这条排队消息携带的东西列成小标签:
 * 附件数、标记数、插件 / 技能 / MCP / 连接器 / 上下文条目。那排 chip
 * **设计稿里没有**(两份稿子搜 `workspace context` 都是 0 处),是我们自己加的,
 * 而且把内部字段名 `ctx.workspaceItems` 当成了用户文案。
 *
 * ⚠️ 删的是**显示**,不是**携带**:排队消息仍然带着这些东西,编辑取回时要一起
 * 还原(见 `queued-edit-dequeue.test.tsx`)。所以下面有正向对照,断言队列行
 * 其余部分都还在 —— 免得「把整行删了」也能让这条通过。
 *
 * 判据钉在源码与样式表上:这是一次**删除**,没有可断言的渲染结果;
 * 而且仓库里没有现成能喂 `queuedSends` 的 ChatPane harness,
 * 硬搭一个反而会把断言埋在一堆假 props 里。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = (p: string): string => readFileSync(resolve(__dirname, '../../../src', p), 'utf8');

const chatPane = src('components/ChatPane.tsx');
const chatCss = src('styles/chat.css');
const dictTypes = src('i18n/types.ts');

describe('发送队列只显示纯文本', () => {
  it('那排 chip 的组件没了', () => {
    expect(chatPane).not.toMatch(/QueuedSendMetaChips/);
  });

  it('chip 的类名在组件和样式表里都不再出现', () => {
    expect(chatPane).not.toMatch(/chat-queued-send-chip/);
    expect(chatCss).not.toMatch(/chat-queued-send-chip/);
  });

  it('为它加的那批文案 key 一并清掉,不留死键', () => {
    expect(dictTypes).not.toMatch(/queuedChip/);
  });

  it('队列行其余部分都还在 —— 别把整行删了', () => {
    for (const cls of [
      'chat-queued-send-row',
      'chat-queued-send-main',
      'chat-queued-send-index',
      'chat-queued-send-actions',
    ]) {
      expect(chatPane, `${cls} 应仍在组件里`).toMatch(new RegExp(cls));
      expect(chatCss, `${cls} 应仍在样式表里`).toMatch(new RegExp(cls.replace(/-/g, '\\-')));
    }
  });

  it('携带能力本身没被动 —— 编辑取回仍要还原这些东西', () => {
    /* `restoreQueuedSendToComposer` 是编辑取回那条路。它把**整个 `item.meta`**
       交给 `restoreDraft`,插件 / 技能 / MCP / 连接器 / 上下文条目都在里面 ——
       所以判据是「原样传 meta」,不是「读到某个具体子字段」。
       第一版断言写成找 `meta.context` 字面量,那是 chip 自己的读法,
       删掉 chip 之后自然找不到,和携带能力在不在无关。 */
    expect(chatPane).toMatch(/restoreQueuedSendToComposer/);
    expect(chatPane).toMatch(/meta:\s*item\.meta/);
  });
});
