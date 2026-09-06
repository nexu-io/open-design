// @vitest-environment jsdom
/**
 * 排队条上两条**永远不生效**的规则(已删)—— 删之前先把「它是死的」钉住,
 * 删之后这份文件原样再跑一遍仍然全绿,那就是它是死的的证据。
 *
 * 这份文件的用例**删掉那两条规则之后仍然全绿**,这正是它要说的话:
 * 规则在与不在,屏幕上一模一样。所以它不是「守住某个效果」,而是
 * 「守住『这里没有那个效果』」—— 真有人哪天想把高亮 / 遮罩做出来,
 * 会在这里红,提醒他连同触发条件一起补齐。
 *
 * ── ① 队列首行高亮 `.chat-queued-send-row-active` ──────────────────
 * `styles/chat.css:2377` 曾写着
 *   .chat-queued-send-row-active { border-color: …; background: color-mix(…); }
 * 死因是层叠:同一份文件靠后的 `styles/chat.css:3587`
 *   .chat-queued-send-row { … border: 0; border-radius: 0; background: none; … }
 * 特异性同为 (0,0,1,0)、位置在后 —— `border` / `background` 两条简写把
 * `-active` 那两条**逐条**盖掉。实测层叠链(共享量尺的 `declaring()`):
 *   #408 .chat-queued-send-row  →  #409 .chat-queued-send-row-active  →  #553 .chat-queued-send-row
 * 三条同为 (0,0,1,0),赢的是最后那条,读回 `transparent`。
 *
 * **规则和类名今天都已经删掉了**(2026-09-02)。原来这里写的是「类名留着,等设计定」——
 * 稿子已经把这件事答了:`361b78253e:docs/design/chat-panel/src/components.css:2898`
 *   `.queue .q:first-child { border-top: none; }`
 * 这是 `.queue .q:first-child` 在整份稿子里**唯一**的一条规则 —— 首行只少一道上边线,
 * 不换底色、不换描边。所以按 1:1 对齐,类名也没有留着的理由,它已经从 `src/` 里清干净。
 * 逐值对稿的断言在 `queue-draft-alignment.test.tsx`。
 *
 * 这一节因此留下来当**反向护栏**:哪天有人把首行高亮重新做出来,得先让新规则赢过
 * 后置那条 (0,0,1,0),而不是像上次那样加一条被静默压掉的声明。
 *
 * ── ② 滚动遮罩 `.chat-queued-send-list.is-scrollable` ───────────────
 * `styles/chat.css:2324`。`is-scrollable` 这个类在整个 `src/` 里**只有一处**
 * 会被挂上,挂的是 `.chat-log` 那个 className 数组(`ChatPane.tsx`),不是队列;
 * 队列那个 `<div>` 的 className 是一个**没有任何条件的字符串常量**。
 * 两边合起来 → 这个复合选择器永远配不上任何元素。
 *
 * 稿子那边同样没有:`.queue` 全部声明只有 `max-height: 122px; overflow-y: auto`
 * (同一份 css:2889),没有遮罩;`mask-image` 在整份稿子里只出现在对号图标上。
 *
 * ── 为什么不靠「读代码判死」 ────────────────────────────────────────
 * 读代码判死已经错过一次(以为整条规则永不匹配,实测是宽容匹配)。所以两条都
 * 落到可执行的判据上:①用共享量尺按真表算层叠、②按真实 DOM 与源码里
 * className 的**全部产地**核对,并且各自先证明量法看得见东西。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import chatRootStyles from '../../../src/components/chat/ChatRoot.module.css';
import { createResolver, hashed } from '../../helpers/chat-mirror-cascade';

afterEach(cleanup);

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '../../..');
const read = (p: string): string => readFileSync(resolve(WEB, p), 'utf-8');

const CHAT_PANE_TSX = read('src/components/ChatPane.tsx');

/** `src/` 下所有 TS / TSX 源码 —— 类名可能从任何一个文件里拼出来。 */
function everySource(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) everySource(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const TARGETS = ['background-color', 'border-top-color', 'padding-right'] as const;

/** 产品 `index.css` 的导入顺序(只取够得着排队条的那几张)。 */
const CSS = createResolver(
  [
    read('src/styles/tokens.css'),
    read('src/styles/base.css'),
    readFileSync(resolve(WEB, '../../packages/components/src/styles.css'), 'utf-8'),
    read('src/styles/primitives.css'),
    read('src/styles/chat.css'),
    hashed(
      read('src/components/chat/ChatRoot.module.css'),
      chatRootStyles as unknown as Record<string, string>,
    ),
  ],
  [read('src/styles/tokens.css'), read('src/styles/base.css')],
  TARGETS,
);

/**
 * 排队条的真实结构(`ChatPane.tsx`):
 *   .chat-queued-send-strip > .chat-queued-send-list > .chat-queued-send-row
 *
 * `-active` 这里是**手工挂上去的**(产品已经不挂了)—— 它要问的是
 * 「就算有人把这个类挂回来,屏幕上会不会多出一档高亮」,答案必须是不会。
 */
function stage(): { plain: Element; active: Element; list: Element } {
  const { container } = render(
    <div className="pane" data-chat-root="">
      <div className="chat-queued-send-strip">
        <div className="chat-queued-send-list" data-t="list">
          <div className="chat-queued-send-row chat-queued-send-row-active" data-t="active" />
          <div className="chat-queued-send-row" data-t="plain" />
        </div>
      </div>
    </div>,
  );
  const pick = (t: string) => {
    const el = container.querySelector(`[data-t="${t}"]`);
    if (!el) throw new Error(`夹具里没有 ${t}`);
    return el;
  };
  return { plain: pick('plain'), active: pick('active'), list: pick('list') };
}

/** 稿子时代那条高亮**想要**的底色,解出来的字面值(用来证明「相等」不是空过)。 */
const INTENDED_HIGHLIGHT = 'color-mix(in srgb, #ededed 82%, transparent)';

describe('排队条 · 首行高亮那条规则是死的', () => {
  it('先证明这把尺子按「同特异性看后置」判 —— 正是杀死那条规则的那条规矩', () => {
    const { plain, list } = stage();
    // `.chat-queued-send-row` 被写了两遍:2354 那条 `padding: 2px 4px`,
    // 3587 那条 `padding: 7px 10px`。两条同为 (0,0,1,0),后置的赢 → 右内距 10px。
    // 尺子若按「先到先得」判,这里会读回 4px,那底下几条就全是假绿。
    expect(
      CSS.resolved(plain)['padding-right'],
      '读回 4px 说明尺子按前置判 —— 那它也看不见 -active 是怎么被压掉的',
    ).toBe('10px');
    // 同一份夹具里两个元素读出不同的值 —— 尺子不是在返回常量
    expect(CSS.resolved(list)['padding-right']).toBe('0px');
  });

  it('类名已经从整棵 src/ 树里清掉了 —— 稿子首行没有高亮', () => {
    // 稿子 `components.css:2898` 的 `.queue .q:first-child { border-top: none }` 是首行
    // 唯一的处理。规则删了、类名也删了,`src/` 里不该再有任何一处产出这个类名。
    const producers: string[] = [];
    for (const file of everySource(resolve(WEB, 'src'))) {
      if (readFileSync(file, 'utf-8').includes('chat-queued-send-row-active')) {
        producers.push(file.slice(resolve(WEB, 'src').length + 1));
      }
    }
    expect(producers).toEqual([]);
    // 校准:同一把「找产地」的量法在一个**还活着**的队列类名上找得到东西
    const alive: string[] = [];
    for (const file of everySource(resolve(WEB, 'src'))) {
      if (readFileSync(file, 'utf-8').includes('chat-queued-send-row-dragging')) {
        alive.push(file.slice(resolve(WEB, 'src').length + 1));
      }
    }
    expect(alive).toContain('components/ChatPane.tsx');
  });

  it('挂上 -active 和不挂,底色一模一样(而且都是 transparent)', () => {
    const { plain, active } = stage();
    expect(
      CSS.resolved(active)['background-color'],
      '首行高亮如果真生效了,这两个读数应该不同 —— 现在它被后面同特异性的 ' +
        '`.chat-queued-send-row { background: none }` 逐条盖掉了',
    ).toBe(CSS.resolved(plain)['background-color']);
    // 钉具体值,不只钉「相等」:两边一起变成别的颜色时「相等」还是绿的
    expect(CSS.resolved(active)['background-color']).toBe('transparent');
  });

  it('挂上 -active 和不挂,描边颜色也一模一样(都还是 currentcolor)', () => {
    const { plain, active } = stage();
    expect(CSS.resolved(active)['border-top-color']).toBe(
      CSS.resolved(plain)['border-top-color'],
    );
    expect(CSS.resolved(active)['border-top-color']).toBe('currentcolor');
  });

  it('「一模一样」不是空过:那条规则想要的底色本来就是另一个颜色', () => {
    const { plain } = stage();
    expect(CSS.resolved(plain)['background-color']).not.toBe(INTENDED_HIGHLIGHT);
  });
});

describe('排队条 · 滚动遮罩那条规则永远配不上', () => {
  /** `src/` **整棵树**里每一处会产出 `is-scrollable` 这个类名的地方。 */
  const producers: Array<{ file: string; no: number }> = [];
  for (const file of everySource(resolve(WEB, 'src'))) {
    readFileSync(file, 'utf-8')
      .split('\n')
      .forEach((line, i) => {
        if (line.includes('is-scrollable')) {
          producers.push({ file: file.slice(resolve(WEB, 'src').length + 1), no: i + 1 });
        }
      });
  }

  it('先证明这把「找产地」的量法真的找得到东西,而且全树只有一处', () => {
    // 只钉**文件**不钉行号:行号会被同一份文件里任何无关改动推走,那种红没有信息量。
    expect(
      producers.map((x) => x.file),
      "`src/` 里 'is-scrollable' 的产地不止一处(或一处都没有)—— 下面那条「只挂在 chat-log 上」就不成立了",
    ).toEqual(['components/ChatPane.tsx']);
  });

  it('唯一那处挂的是 .chat-log,不是队列', () => {
    // 这一处落在 `.chat-log` 那个 className 数组里 —— 同一个数组的第一项就是 'chat-log'
    const around = CHAT_PANE_TSX.split('\n')
      .slice(producers[0]!.no - 5, producers[0]!.no + 3)
      .join('\n');
    expect(around).toContain("'chat-log'");
    expect(around).not.toContain('chat-queued-send-list');
  });

  it('队列那个 <div> 的 className 是常量,不带任何条件', () => {
    expect(CHAT_PANE_TSX).toContain('<div className="chat-queued-send-list">');
    // 没有第二种写法把这个类拼出来
    const occurrences = CHAT_PANE_TSX.split('chat-queued-send-list').length - 1;
    expect(occurrences, '队列的 className 出现了不止一处 —— 上面那条常量断言不够了').toBe(1);
  });

  it('真实 DOM 里队列身上没有这个类', () => {
    const { list } = stage();
    expect(list.classList.contains('is-scrollable')).toBe(false);
    // 校准:查询本身不是瞎的 —— 手工挂上去就查得到
    list.classList.add('is-scrollable');
    expect(list.matches('.chat-queued-send-list.is-scrollable')).toBe(true);
    list.classList.remove('is-scrollable');
  });

  it('挂不挂这个类,内距读数都一样 —— 因为它根本挂不上', () => {
    const { list } = stage();
    expect(CSS.resolved(list)['padding-right']).toBe('0px');
  });
});
