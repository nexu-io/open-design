// @vitest-environment jsdom
/**
 * 「新建」和「改写」是**两枚不同的图标**,不再共用一支铅笔。
 *
 * ## 稿子怎么说的 / 稿子实际长什么样
 *
 * 设计在 `e8726686ae` 换掉了建成品里的字形、`b51302425b` 补齐了源文件,
 * 两个 commit 的标题都在说别的事(「underline tool references」/「sync icon source」),
 * 所以**只能看真实效果、不能信说明**:PR #7170 头 `729fa43ce7` 的
 * `docs/design/chat-panel/src/body-components.html:909` 里,
 * 四处「新建」行的 `.ti` 全部是 `fill="currentColor"` 的**实心节点字形**,
 * 而同一行里唯一一处「改写」仍然是 `fill="none" stroke="currentColor"` 的铅笔。
 *
 *     $ git show 729fa43ce7:docs/design/chat-panel/src/body-components.html \
 *         | grep -o 'M2\.5 7C2\.5 9\.48528' | wc -l   → 4   （新建）
 *         | grep -o 'M17 3a2\.83'          | wc -l   → 1   （改写）
 *
 * 建成品 `docs/design/chat-panel-next.html:5214` 是同样的 4 : 1。
 *
 * 这枚字形**不是设计还在犹豫的半成品**:上一版稿子 `361b78253e` 里四处「新建」
 * 就已经有一处是它了(`settings.html` 那一行),计数是 1 新 : 4 铅笔;到
 * `729fa43ce7` 变成 4 新 : 1 铅笔 —— 少掉的三支铅笔正好是剩下那三处「新建」。
 * 所以 `b51302425b` 的「sync」是补齐,不是改设计。
 *
 * 我们这边 `toolIcon` 一直是 `case 'write': case 'edit': return <WriteIcon />`,
 * 两格共用铅笔 —— 「新建」这一格和稿子对不上。
 *
 * ## 为什么把 `d` 抄成常量,而不是在测试里去读稿子
 *
 * `docs/design/chat-panel-next.html` 在本分支上不存在(worktree 里只剩
 * `docs/design/chat-mirror`),读不到。仓库既有的做法就是把交付件那条 `d`
 * 逐字节抄成常量、把出处写在注释里 —— 见
 * `image-fail-cell-two-states.test.tsx` 的 `ERROR_WARNING_LINE_D`。
 */
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';

import { toolIcon } from '../../../src/components/chat/primitives/icons';

/**
 * 稿子 `729fa43ce7:docs/design/chat-panel/src/body-components.html:909` 里
 * 「新建」那四格的 `d`,逐字节原文(四处完全相同,去重后只剩这一条,863 字符)。
 * 建成品 `docs/design/chat-panel-next.html:5214` 同字节。
 */
const DESIGN_CREATE_D =
  'M2.5 7C2.5 9.48528 4.51472 11.5 7 11.5C9.48528 11.5 11.5 9.48528 11.5 7C11.5 4.51472 9.48528 2.5 7 2.5C4.51472 2.5 2.5 4.51472 2.5 7ZM2.5 17C2.5 19.4853 4.51472 21.5 7 21.5C9.48528 21.5 11.5 19.4853 11.5 17C11.5 14.5147 9.48528 12.5 7 12.5C4.51472 12.5 2.5 14.5147 2.5 17ZM12.5 17C12.5 19.4853 14.5147 21.5 17 21.5C19.4853 21.5 21.5 19.4853 21.5 17C21.5 14.5147 19.4853 12.5 17 12.5C14.5147 12.5 12.5 14.5147 12.5 17ZM9.5 7C9.5 8.38071 8.38071 9.5 7 9.5C5.61929 9.5 4.5 8.38071 4.5 7C4.5 5.61929 5.61929 4.5 7 4.5C8.38071 4.5 9.5 5.61929 9.5 7ZM9.5 17C9.5 18.3807 8.38071 19.5 7 19.5C5.61929 19.5 4.5 18.3807 4.5 17C4.5 15.6193 5.61929 14.5 7 14.5C8.38071 14.5 9.5 15.6193 9.5 17ZM19.5 17C19.5 18.3807 18.3807 19.5 17 19.5C15.6193 19.5 14.5 18.3807 14.5 17C14.5 15.6193 15.6193 14.5 17 14.5C18.3807 14.5 19.5 15.6193 19.5 17ZM16 11V8H13V6H16V3H18V6H21V8H18V11H16Z';

/** 同一份稿子里「改写」那一格的 `d`,逐字节原文。设计**没有**动它。 */
const DESIGN_PENCIL_D = 'M17 3a2.83 2.83 0 014 4L7.5 20.5 2 22l1.5-5.5L17 3z';

afterEach(cleanup);

/** 把一枚图标渲染出来,取它**所有** `<path>` 的 `d`(顺序保留)。 */
function pathData(node: ReactElement): string[] {
  const { container } = render(<span>{node}</span>);
  return [...container.querySelectorAll('path')].map((p) => p.getAttribute('d') ?? '');
}

describe('新建 / 改写 分家(W72)', () => {
  /* ── 防真空 ────────────────────────────────────────────────
     先证明这套量法**读得出** `d`。如果 `pathData` 拿到的是空数组或空串,
     下面「write 的 d 等于稿子」那条就算实现没做也可能因为两边都取到
     `undefined` 而误绿 —— 所以拿一枚**没被这次改动碰过**的图标先立标尺。 */
  it('防真空 · 量法读得出 `d` —— 改写那格现在就是稿子里那支铅笔', () => {
    const pencil = pathData(toolIcon('edit'));
    expect(pencil, '改写那格没有渲染出 path,后面比 `d` 的判据全是空的').toHaveLength(1);
    expect(pencil[0], '`d` 是空的,量法读不到路径数据').toBeTruthy();
    expect(pencil[0]).toBe(DESIGN_PENCIL_D);
  });

  it('正向 · 新建那格的 `d` 和稿子 729fa43ce7 逐字节相同', () => {
    const create = pathData(toolIcon('write'));
    expect(create, '新建那格应当只有一条路径(稿子就是一条)').toHaveLength(1);
    expect(create[0]).toBe(DESIGN_CREATE_D);
  });

  it('反向对照 · 改写没跟着换 —— 两格必须是不同的字形', () => {
    const create = pathData(toolIcon('write'));
    cleanup();
    const pencil = pathData(toolIcon('edit'));
    // 只断言「等于稿子的新字形」是不够的:把 write 和 edit 一起换成新字形也能全绿,
    // 而稿子里改写**明确还是铅笔**(同一行 4 : 1)。
    expect(create[0]).not.toBe(pencil[0]);
    expect(pencil[0], '改写被一起换掉了,稿子里它还是铅笔').toBe(DESIGN_PENCIL_D);
    expect(create[0], '新建没换成稿子的实心字形').toBe(DESIGN_CREATE_D);
  });

  it('新建那枚走填充,不带描边几何 —— 描边那套走不了实心字形', () => {
    const { container } = render(<span>{toolIcon('write')}</span>);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('fill'), '实心字形必须自己上色').toBe('currentColor');
    expect(svg!.getAttribute('stroke'), '实心字形不该带 stroke').toBeNull();
    // 带 stroke-width 却不描边是死属性;真正危险的是反过来 —— 有 stroke 没 width
    // 会掉回浏览器默认的 1 用户单位。两头都堵住。
    expect(svg!.getAttribute('stroke-width'), '实心字形不该带 stroke-width').toBeNull();
    expect(svg!.getAttribute('viewBox'), '视框要和同族其它图标一致').toBe('0 0 24 24');
    /* 稿子那枚带 `xmlns` —— 那是建成品从独立 svg 文件内联进来的残留,不是设计意图。
       内联到 HTML 文档里的 svg 不需要它。这条挡的是「照着稿子整段粘过来」。 */
    expect(svg!.getAttribute('xmlns'), '把建成品的 xmlns 残留一起抄进来了').toBeNull();
  });
});
