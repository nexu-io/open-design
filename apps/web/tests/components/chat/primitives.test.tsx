// @vitest-environment jsdom
/**
 * L1 原子的行为验收。这一层不比像素,比的是**结构与规则**:
 * 该出的元素出了没有、不该出的有没有漏出来、点了会不会动。
 * 像素对齐靠陈列页逐格比对(§11),不在单测里做。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider, type Locale } from '../../../src/i18n';
import { Foldable } from '../../../src/components/chat/primitives/Foldable';
import { StatusMark } from '../../../src/components/chat/primitives/StatusMark';
import { UpgradeCard } from '../../../src/components/chat/UpgradeCard';
import { ToolRow } from '../../../src/components/chat/primitives/ToolRow';
import { SayText } from '../../../src/components/chat/primitives/SayText';
import { FileButton } from '../../../src/components/chat/primitives/FileButton';
import { ImageRow } from '../../../src/components/chat/primitives/ImageRow';
import type { ImageRow as ImageRowData, ToolRow as ToolRowData } from '../../../src/runtime/chat/contract';

// 每个用例后清掉 DOM —— 仓库里的组件测试都显式 cleanup(不清会串味,断言会捞到上一条的元素)
afterEach(() => { cleanup(); });

/**
 * 断言用的是设计稿的中文原文,所以显式挂 zh-CN(不挂 provider 时 useT 回落英文)。
 * rerender 也要带同一层包裹 —— 否则整棵树被换掉、组件重新挂载,
 * 测的就不是「父层重渲染」而是「重新创建」,折叠态当然会回到初值。
 */
function render(ui: ReactElement, initial: Locale = 'zh-CN') {
  const wrap = (node: ReactElement) => <I18nProvider initial={initial}>{node}</I18nProvider>;
  const result = rtlRender(wrap(ui));
  return { ...result, rerender: (next: ReactElement) => result.rerender(wrap(next)) };
}

function row(over: Partial<ToolRowData> = {}): ToolRowData {
  return {
    kind: 'tool',
    id: 't1',
    tool: 'read',
    name: 'Read',
    title: '读取规格',
    rawTitle: false,
    /* 没回来的调用才是 pending —— 这几份 fixture 造的都是**已经回来**的行 */
    pending: false,
    file: null,
    pattern: null,
    hits: null,
    delta: null,
    elapsedMs: null,
    failed: false,
    failReason: null,
    command: null,
    terminal: null,
    ...over,
  };
}

describe('Foldable', () => {
  it('有内容时给箭头,点开能展开', () => {
    render(<Foldable summary={<span>已完成</span>}><p>里面</p></Foldable>);
    const details = document.querySelector('details');
    expect(details).not.toBeNull();
    expect(details?.querySelector('svg')).not.toBeNull();
    expect(details?.open).toBe(false);
    fireEvent.click(screen.getByText('已完成'));
    expect(document.querySelector('details')?.open).toBe(true);
  });

  it('不可展开时不出箭头、也打不开(D35:本轮没有内容的 todo)', () => {
    render(
      <Foldable summary={<span>抽出商品卡</span>} expandable={false}>
        <p>不该出现</p>
      </Foldable>,
    );
    const details = document.querySelector('details') as HTMLDetailsElement;
    expect(details.querySelector('svg')).toBeNull();
    expect(screen.queryByText('不该出现')).toBeNull();
    details.open = true;
    fireEvent(details, new Event('toggle'));
    expect(details.open).toBe(false);
  });

  it('完全没有内容时同样不出箭头(空态,D21)', () => {
    render(<Foldable summary={<span>进行中</span>} variant="flat" />);
    expect(document.querySelector('details svg')).toBeNull();
  });

  it('用户手点开之后,父层重渲染不会把它拨回去', () => {
    const { rerender } = render(<Foldable summary={<span>头</span>}><p>内容</p></Foldable>);
    fireEvent.click(screen.getByText('头'));
    expect(document.querySelector('details')?.open).toBe(true);
    rerender(<Foldable summary={<span>头</span>}><p>内容</p></Foldable>);
    expect(document.querySelector('details')?.open).toBe(true);
  });

  it('可延迟的历史正文在首次展开前不挂 DOM，展开一次后收起仍保留', () => {
    render(
      <Foldable summary={<span>已完成</span>} deferBody>
        <p>很长的历史正文</p>
      </Foldable>,
    );
    expect(screen.queryByText('很长的历史正文')).toBeNull();

    fireEvent.click(screen.getByText('已完成'));
    expect(screen.getByText('很长的历史正文')).toBeTruthy();

    fireEvent.click(screen.getByText('已完成'));
    expect(document.querySelector('details')?.open).toBe(false);
    expect(screen.getByText('很长的历史正文')).toBeTruthy();
  });

  it('耗时排在箭头左边', () => {
    render(<Foldable summary={<span>已完成</span>} elapsed="1m 12s"><p>x</p></Foldable>);
    const summary = document.querySelector('summary') as HTMLElement;
    const kids = [...summary.children].map((c) => c.textContent);
    expect(kids).toEqual(['已完成', '1m 12s', '']);
  });

  it('窄侧栏下标题单独收缩，耗时和箭头仍保留独立槽位', () => {
    render(
      <div style={{ width: 180 }}>
        <Foldable
          summary={<span>一次性编写完整中文报告内容与 Kami 羊皮纸版式</span>}
          elapsed="1m 46s"
        >
          <p>x</p>
        </Foldable>
      </div>,
    );

    const summary = document.querySelector('summary') as HTMLElement;
    const title = screen.getByTestId('chat-foldable-summary-content');
    const elapsed = screen.getByTestId('chat-foldable-elapsed');
    const toggle = screen.getByTestId('chat-foldable-toggle');

    expect(title.textContent).toContain('一次性编写完整中文报告内容');
    expect([...summary.children]).toEqual([title, elapsed, toggle]);
  });
});

describe('StatusMark', () => {
  it('读屏状态跟随界面语言,不写死中文', () => {
    render(
      <>
        <StatusMark status="ok" />
        <StatusMark status="fail" />
        <StatusMark status="running" />
        <StatusMark status="skip" />
        <StatusMark status="pending" />
      </>,
      'fr',
    );
    expect(screen.getByLabelText('Terminé')).toBeTruthy();
    expect(screen.getByLabelText('Échec')).toBeTruthy();
    expect(screen.getByLabelText('En cours')).toBeTruthy();
    expect(screen.getByLabelText('Annulé')).toBeTruthy();
    expect(screen.getByLabelText('Non commencé')).toBeTruthy();
  });

  it('过了那枚勾是一张图,里面不塞 svg', () => {
    render(<StatusMark status="ok" />);
    const mark = screen.getByLabelText('已完成');
    expect(mark.querySelector('svg')).toBeNull();
  });

  it('跑砸了画叉', () => {
    render(<StatusMark status="fail" />);
    expect(screen.getByLabelText('失败').querySelector('svg')).not.toBeNull();
  });

  /*
   * 2026-08-26 用户真机指认:步骤级「正在跑」那颗是稿子的**纯 CSS 自转绿球**
   * (`.mk.is-run` + `.sheen` / `.rim` 两层),不是 thinking-orbs 的散点画布 ——
   * 散点那一档是**壳头**用的(connecting / composing)。
   */
  it('在跑的那颗是稿子的 CSS 绿球:两层子元素 + 读屏念得到', () => {
    render(<StatusMark status="running" />);
    const orb = screen.getByLabelText('进行中');
    expect(orb.tagName).toBe('SPAN');
    expect(orb.className).toMatch(/run/);
    // 高光与内缘各占一层
    expect(orb.querySelectorAll('i')).toHaveLength(2);
    // 不该再挂画布
    expect(orb.querySelector('canvas')).toBeNull();
  });

  it('计划里还没跑的步骤用序号占那一格', () => {
    render(<StatusMark status="pending" index={3} />);
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('取消沿用完成态,不画红叉(D16 是产品选的)', () => {
    render(<StatusMark status="skip" />);
    expect(screen.getByLabelText('已取消').querySelector('svg')).toBeNull();
  });
});

describe('ToolRow', () => {
  /*
   * 产品 2026-08-27 把这一档撤了:「这些文件不要变成可点击的.. 因为读的不一定是
   * 我们项目文件夹下的文件....」。规则与理由在 `runtime/chat/record-file-open.ts`,
   * 成对的验收在 `tests/components/chat/record-read-not-clickable.test.tsx`。
   * 这里留一条,是因为原来的断言正好写在这个位置,别让它悄悄消失。
   */
  it('读文件:动词 + 文件名,但文件名**不是**可点的按钮', () => {
    const onOpen = vi.fn();
    render(<ToolRow row={row({ tool: 'read', file: { path: '/a/规格.md', label: '规格.md' } })} onOpenFile={onOpen} />);
    expect(screen.getByText('规格.md')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '打开 规格.md' })).toBeNull();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('写文件:项目里的那一个仍然可点', () => {
    const onOpen = vi.fn();
    render(
      <ToolRow
        row={row({ tool: 'write', name: 'Write', file: { path: 'card.html', label: 'card.html' } })}
        onOpenFile={onOpen}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '打开 card.html' }));
    expect(onOpen).toHaveBeenCalledWith('card.html');
  });

  it('写文件显示改动量,不显示耗时(设计稿:两者二选一)', () => {
    render(<ToolRow row={row({ tool: 'write', file: { path: 'card.html', label: 'card.html' }, delta: { added: 86, removed: 0 }, elapsedMs: 1300 })} />);
    expect(screen.getByText('+86')).toBeTruthy();
    expect(screen.queryByText('1.3s')).toBeNull();
  });

  it('搜索显示命中数而不是耗时', () => {
    render(<ToolRow row={row({ tool: 'search', pattern: 'gap', hits: 2, elapsedMs: 400 })} />);
    expect(screen.getByText('2 处')).toBeTruthy();
    expect(screen.queryByText('0.4s')).toBeNull();
  });

  it('没有人话标题的命令走「执行 <命令>」单行(S8)', () => {
    render(<ToolRow row={row({ tool: 'exec', command: 'ls -la', title: 'ls -la', rawTitle: true })} />);
    expect(screen.getByText('执行')).toBeTruthy();
    expect(screen.getByText('ls -la')).toBeTruthy();
  });

  it('已识别的 shell 动作不回落成「执行」', () => {
    const { unmount } = render(<ToolRow row={row({ tool: 'read', command: 'wc -l a.html b.html', title: 'wc -l a.html b.html', rawTitle: true })} />);
    expect(screen.getByText('读取')).toBeTruthy();
    expect(screen.queryByText('执行')).toBeNull();
    unmount();
    render(<ToolRow row={row({ tool: 'delete', command: 'rm -f a.html b.html', title: 'rm -f a.html b.html', rawTitle: true })} />);
    expect(screen.getByText('删除')).toBeTruthy();
    expect(screen.queryByText('执行')).toBeNull();
  });

  it('失败行两种写法:有原因跟在名字后面,没原因给「失败」', () => {
    const { unmount } = render(<ToolRow row={row({ tool: 'write', failed: true, file: { path: 'dist/x', label: 'x' }, failReason: '目录只读' })} />);
    expect(screen.getByText(/目录只读/)).toBeTruthy();
    unmount();
    render(<ToolRow row={row({ tool: 'write', failed: true, file: { path: 'dist/x', label: 'x' } })} />);
    expect(screen.getByText('失败')).toBeTruthy();
  });

  it('元工具不硬归类,按工具名原样显示(T4 的默认)', () => {
    render(<ToolRow row={row({ tool: 'other', name: 'ToolSearch', title: 'select:TodoWrite' })} />);
    expect(screen.getByText(/ToolSearch/)).toBeTruthy();
  });

  it('拿不到耗时就不显示 —— 不出「0.0s」', () => {
    render(<ToolRow row={row({ tool: 'exec', title: '构建', elapsedMs: null })} />);
    expect(screen.queryByText(/0\.0s/)).toBeNull();
  });
});

describe('SayText / FileButton', () => {
  it('文件打开标签跟随界面语言', () => {
    render(<FileButton path="/x/card.html" label="card.html" onOpen={() => {}} />, 'fr');
    expect(screen.getByRole('button', { name: 'Ouvrir card.html' })).toBeTruthy();
  });

  it('空白文字不成段(claude 的 thinking 全是空串)', () => {
    const { container } = render(<SayText text="   " />);
    expect(container.querySelector('p')).toBeNull();
  });

  it('能打开时:可读标签指向打开动作', () => {
    render(<FileButton path="/x/card.html" label="card.html" onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: '打开 card.html' })).toBeTruthy();
  });

  /* 没有 `onOpen` = 打不开,那就别长成按钮:原来照样吐一颗不挂 onClick 的 `<button>`,
     键盘 Tab 得到、读屏念「打开 X」,按下去什么都不发生 —— 那句标签本身是假的。 */
  it('打不开时:退回纯文本,既不可聚焦也不念「打开」', () => {
    const { container } = render(<FileButton path="/x/card.html" label="card.html" />);
    expect(screen.getByText('card.html')).toBeTruthy();
    expect(container.querySelector('button')).toBeNull();
    expect(screen.queryByLabelText('打开 card.html')).toBeNull();
  });
});

describe('UpgradeCard', () => {
  it('升级按钮复用设置页的本地化文案', () => {
    render(<UpgradeCard balanceUsd={1.2} onUpgrade={() => {}} />, 'fr');
    expect(screen.getByRole('button', { name: 'Mettre à niveau' })).toBeTruthy();
  });
});

/* ── 组件 11:跑命令的折叠块 ─────────────────────────────── */

describe('命令折叠块(组件 11)', () => {
  const cmd = (over: Partial<ToolRowData> = {}) => row({
    tool: 'exec',
    name: 'Bash',
    title: '构建产物,看能不能跑通',
    rawTitle: false,
    command: 'npm run build',
    terminal: '✓ built in 8.42s · dist/ 已更新',
    elapsedMs: 8420,
    ...over,
  });

  it('有人话标题就折起来:标题在外,命令与输出在里面', () => {
    render(<ToolRow row={cmd()} />);
    expect(screen.getByText('构建产物,看能不能跑通')).toBeTruthy();
    expect(screen.queryByText('npm run build')).toBeNull();
    fireEvent.click(screen.getByText('构建产物,看能不能跑通'));
    expect(screen.getByText('npm run build')).toBeTruthy();
    expect(screen.getByText('8.4s')).toBeTruthy();
  });

  it('成功默认收起 —— 标题那一行已经说了跑没跑通', () => {
    render(<ToolRow row={cmd()} />);
    expect(document.querySelector('details')?.open).toBe(false);
  });

  it('失败默认展开 —— 报错原文是这时候唯一要读的东西', () => {
    render(<ToolRow row={cmd({ failed: true, terminal: '✗ Could not resolve "./ProductCard"' })} />);
    expect(document.querySelector('details')?.open).toBe(true);
    expect(screen.getByText('失败')).toBeTruthy();
  });

  it('输出行按行首符号分绿红,认不出来的按普通行画', () => {
    render(<ToolRow row={cmd({ terminal: '✓ 成功那行\n普通那行\n✗ 失败那行' })} />);
    fireEvent.click(screen.getByText('构建产物,看能不能跑通'));
    const cls = (t: string) => screen.getByText(t).className;
    expect(cls('✓ 成功那行')).toMatch(/ok/);
    expect(cls('✗ 失败那行')).toMatch(/er/);
    expect(cls('普通那行')).toBe('');
  });

  /*
   * ⚠️ **S8「没有人话标题的命令不折叠」已被产品推翻**(2026-09-03,口述):
   *   「(AMR 那种没标题的命令行)AMR 要的吧?统一一下?并且要支持流式?」
   * 两种命令行统一成同一个形态。这一条原来断言的是 `details` 为 null,现在改成
   * 断言统一后的形态:仍然是稿子 `:909` 的「执行 + 等宽命令」,但它是折叠块的
   * summary,展开能看见输出。判据与理由全在 `w132-raw-command-fold.test.tsx`。
   */
  it('没有人话标题的命令也折叠 —— 摘要仍是「执行 <命令>」(产品 2026-09-03 统一形态)', () => {
    render(<ToolRow row={cmd({ title: 'npm run build', rawTitle: true })} />);
    const fold = document.querySelector('details');
    expect(fold, '统一之后这一支也是折叠块').not.toBeNull();
    expect(screen.getByText('执行')).toBeTruthy();
    expect(fold?.querySelector('summary')?.querySelector('code')?.textContent).toBe('npm run build');
  });
});

/* ── 组件 12:生图 ─────────────────────────────────────── */

describe('生图行(组件 12)', () => {
  const img = (over: Partial<ImageRowData> = {}): ImageRowData => ({
    kind: 'image',
    id: 'g1',
    surface: 'image',
    total: 4,
    done: 4,
    failed: 0,
    thumbs: ['a.png', 'b.png', 'c.png', 'd.png'],
    pending: false,
    elapsedMs: 2600,
    ...over,
  });

  it('全出完、没失败:收成一行 + 小缩略图条', () => {
    render(<ImageRow row={img()} />);
    expect(screen.getByText(/生成配套插图 · 4 张/)).toBeTruthy();
    expect(document.querySelectorAll('[class*="strip"] button')).toHaveLength(4);
    expect(document.querySelector('[class*="imgs"]')).toBeNull();
    expect(screen.getByText('2.6s')).toBeTruthy();
  });

  /**
   * ⚠️ 「还在出」这个前提 2026-09-02 起要**显式声明**(OPEND-2419 的 #2,`6780cf578f`)。
   *
   * 这条用例原来只给 `pending: true` 就等着看球。`row.pending` 说的是「还有格子没回来」,
   * 不是「还在生成」—— 取消 / 跑挂之后那几张确实没回来,老写法于是留下一颗停不下来的球。
   * 现在画哪一档由**轮次状态**定(`running`),和 `ToolRow` 同一个字段、同一条判据;
   * 宿主那一头 `ExecutionShell` 一直是传的。所以夹具要把「这一轮还活着」说出来。
   *
   * 默认 `false` 是**保命档**,不是省略写法:拿不到上下文时宁可画中性灰。
   * 下面那条反向对照钉的就是这一档 —— 少了它,`ImageRow` 退回无条件转圈也照样绿。
   */
  it('还在出(轮次还活着):球 + 计数 + 一排大格,出了的填上、没出的留位', () => {
    render(<ImageRow row={img({ done: 2, thumbs: ['a.png', 'b.png'], pending: true, elapsedMs: null })} running />);
    expect(screen.getByText('2/4')).toBeTruthy();
    const running = screen.getByRole('img', { name: '进行中' });
    expect(running.className).toMatch(/run/);
    expect(document.querySelector('[data-orb]')).toBeNull();
    const shots = [...document.querySelectorAll('[class*="imgs"] > *')];
    expect(shots).toHaveLength(4);
    expect(shots.filter((s) => s.className.includes('load'))).toHaveLength(2);
    expect(document.querySelector('[class*="strip"]')).toBeNull();   // 没出完不收行
  });

  it('反向对照:同一份夹具不说「还活着」就不转圈,退成中性灰', () => {
    render(<ImageRow row={img({ done: 2, thumbs: ['a.png', 'b.png'], pending: true, elapsedMs: null })} />);
    // 格子照旧摆着 —— 不是整行没渲染,只是标记换了一档
    expect(screen.getByText('2/4')).toBeTruthy();
    expect(document.querySelectorAll('[data-image-cell]')).toHaveLength(4);
    expect(screen.queryByRole('img', { name: '进行中' })).toBeNull();
    const mark = screen.getByRole('img', { name: '未开始' });
    expect(mark.className).not.toMatch(/run/);
    // 也不冒充成功 / 失败:绿勾是假成功,红叉是假错误
    expect(mark.className).not.toMatch(/ok/);
    expect(mark.className).not.toMatch(/fail/);
  });

  it('逐张状态保持 task 顺序,完成格显示真实缩略图', () => {
    const onRetry = vi.fn();
    render(
      <ImageRow
        row={img({
          done: 1,
          failed: 1,
          pending: true,
          thumbs: ['first.png'],
          cells: [
            { taskId: 'one', status: 'done', path: 'first.png' },
            { taskId: 'two', status: 'failed' },
            { taskId: 'three', status: 'pending' },
            { status: 'pending' },
          ],
        })}
        onRetry={onRetry}
        imageSrc={(path) => `/raw/${path}`}
      />,
    );
    expect(document.querySelector('img')?.getAttribute('src')).toBe('/raw/first.png');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ kind: 'image' }), 1);
  });

  it('出完了有失败:不收行,失败那格给「重试」', () => {
    const onRetry = vi.fn();
    render(<ImageRow row={img({ done: 3, failed: 1, thumbs: ['a.png', 'b.png', 'c.png'] })} onRetry={onRetry} />);
    expect(screen.getByText('3/4')).toBeTruthy();
    expect(document.querySelector('[class*="strip"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /重试/ }));
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ kind: 'image' }), 3);
  });

  /*
   * 产品 2026-09-02 把「不能点」那一态定成了**另一样东西**:错误图标 +「失败」,
   * 不是一枚灰掉的「重试」。原来这里断言的是「『重试』两个字还在,只是点不动」——
   * 那正是被推翻的那一版(长得像按钮却没反应,人会读成界面卡了)。
   * 两态的完整判据在 `image-fail-cell-two-states.test.tsx`。
   */
  it('没给重试回调就不摆按钮,换成一条状态说明 —— 死按钮比没按钮更糟', () => {
    render(<ImageRow row={img({ done: 3, failed: 1, thumbs: ['a.png', 'b.png', 'c.png'] })} />);
    expect(screen.queryByRole('button', { name: /重试/ })).toBeNull();
    expect(screen.queryByText('重试')).toBeNull();
    expect(screen.getByText('失败')).toBeTruthy();
  });
});

describe('SayText 分段', () => {
  it('空行分段 —— 几段推理不能粘成一坨', () => {
    render(<SayText text={'第一段。\n\n第二段。\n\n第三段。'} />);
    const ps = [...document.querySelectorAll('p')];
    expect(ps).toHaveLength(3);
    expect(ps[1]?.textContent).toBe('第二段。');
  });

  it('单个段落照旧一个 p', () => {
    render(<SayText text={'就一段。\n换行不算分段。'} />);
    expect(document.querySelectorAll('p')).toHaveLength(1);
  });
});
