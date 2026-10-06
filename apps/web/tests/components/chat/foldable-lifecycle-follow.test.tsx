// @vitest-environment jsdom
/**
 * W24:**`Foldable` 要分得清「这个展开是自动的」还是「用户自己掀的」。**
 *
 * 现场:一条 `in_progress` 的 todo 因为在跑而自动展开;状态翻成 `completed` 时
 * `TodoRow` 的 key(`todo-${content}-${index}`)一个字都没变 —— 同一个组件实例、
 * 同一份 `selfOpen`,于是那一步**跑完之后还摊着**。用户回头看一张已完成的记录,
 * 看到的是「最后干的那一步是摊开的,其余全收着」。
 *
 * `defaultOpen` 修不了这件事:它只是初始值,状态翻面时没人再看它一眼。
 * 外壳那一层(`ExecutionShell` 的 `lifecycleOpen` / `userToggled`)早就有这个语义,
 * 这一轮把它**下沉**成 `Foldable` 的一个可选 prop `lifecycleOpen`。
 *
 * 产品拍的是方案 B:
 *   · 自动展开(因为在跑)→ 跑完:**自动收起**
 *   · 用户手动展开过    → 跑完:**保持展开**
 *   · 用户手动收起过    → 后续生命周期变化:**保持收起**
 *
 * ⚠️ OPEND-2557 的坑在这一层同样会重演:`<details>` 的 `toggle` 事件**不区分是谁掀的**。
 * React 把 `open` 写回 DOM 时浏览器照样派发一次 —— 那个**回声**如果被当成「用户点过」,
 * 自动跟随会在整轮开始的第一帧就被永久禁用(表现:跑完永远不收)。
 * 判据必须和 `ExecutionShell` 那套**逐字一致**:比对值。受控/自控方写回去的那一次,
 * `next` 必然等于我们此刻的状态;用户点的那一次 DOM 先自己翻面,`next` 必然相反。
 *
 * jsdom 不保证按浏览器时序派发 `toggle`,所以下面沿用
 * `shell-collapse-on-finish.test.tsx` 的做法:回声**显式派发**。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render as rtlRender } from '@testing-library/react';
import type { ReactElement } from 'react';
import { Foldable } from '../../../src/components/chat/primitives/Foldable';

afterEach(cleanup);

function render(ui: ReactElement) {
  const result = rtlRender(ui);
  return { ...result, rerender: (next: ReactElement) => result.rerender(next) };
}

const fold = (): HTMLDetailsElement => {
  const el = document.querySelector<HTMLDetailsElement>('details');
  if (!el) throw new Error('Foldable 没渲染出来');
  return el;
};

const summaryOf = (el: HTMLDetailsElement): HTMLElement => {
  const s = el.querySelector<HTMLElement>('summary');
  if (!s) throw new Error('summary 没渲染出来');
  return s;
};

/** 浏览器在 `open` 属性被写回时派发的那一次 —— 不是用户点的 */
const echoToggle = (el: HTMLDetailsElement): void => {
  fireEvent(el, new Event('toggle', { bubbles: false }));
};

/** 真人点标题行:DOM 先自己翻面,浏览器随后才派发 toggle */
const clickSummary = (el: HTMLDetailsElement): void => {
  fireEvent.click(summaryOf(el));
  echoToggle(el);
};

/** 一条 todo 抽屉的最小复刻:key 不变,只有生命周期在翻面 */
const step = (open: boolean): ReactElement => (
  <Foldable summary={<span>抽出商品卡</span>} lifecycleOpen={open}>
    <p>这一步干的活</p>
  </Foldable>
);

describe('Foldable 生命周期跟随(可选接入)', () => {
  it('在跑的时候自动摊开', () => {
    render(step(true));
    expect(fold().open).toBe(true);
  });

  it('自动展开的那一条,跑完自己收起 —— 中间的回声 toggle 不算用户点过', () => {
    const { rerender } = render(step(true));
    expect(fold().open).toBe(true);

    // 抽屉一开着,浏览器就会为「open 属性被写上」派发一次 toggle。
    // 这一次必须**不算**用户操作,否则后面的收起会被自己屏蔽掉(OPEND-2557)。
    echoToggle(fold());

    rerender(step(false));
    expect(fold().open).toBe(false);
  });

  it('用户手动展开过的,跑完不许替他收走', () => {
    // 一条还没轮到的步骤:自动态是收着的
    const { rerender } = render(step(false));
    expect(fold().open).toBe(false);

    clickSummary(fold());
    expect(fold().open).toBe(true);

    // 轮到它跑,再跑完 —— 两次生命周期翻面都不许动用户掀开的这一下
    rerender(step(true));
    expect(fold().open).toBe(true);
    echoToggle(fold());
    rerender(step(false));
    expect(fold().open).toBe(true);
  });

  it('用户手动收起一条正在跑的,跑完保持收起', () => {
    const { rerender } = render(step(true));
    expect(fold().open).toBe(true);
    echoToggle(fold());

    clickSummary(fold());
    expect(fold().open, '用户点了收起').toBe(false);

    rerender(step(false));
    expect(fold().open).toBe(false);
  });

  it('用户按回去的也算手动:开→关→开之后,生命周期照样拨不动它', () => {
    const { rerender } = render(step(true));
    echoToggle(fold());

    clickSummary(fold());   // 收
    expect(fold().open).toBe(false);
    clickSummary(fold());   // 又开
    expect(fold().open).toBe(true);

    rerender(step(false));
    expect(fold().open, '手动动过之后就该一直听用户的').toBe(true);
  });

  /*
   * 这一条钉的是「当前值要从 **ref** 读,不能从闭包读」。
   * `handleToggle` 是 memo 过的(deps 里没有折叠态),闭包里那份 `selfOpen` 永远停在
   * 首帧。挂载时收着、后来才被生命周期摊开的这条路上,闭包会说「我现在是收着的」,
   * 于是那声开的回声被判成用户点开 —— 自动跟随当场失效。
   */
  it('先收后开的那条:摊开时的回声同样不算用户点过(判据必须读 ref,不是闭包)', () => {
    const { rerender } = render(step(false));
    expect(fold().open).toBe(false);
    echoToggle(fold());

    rerender(step(true));
    expect(fold().open, '轮到它跑,自动摊开').toBe(true);
    echoToggle(fold());

    rerender(step(false));
    expect(fold().open, '跑完该自己收起').toBe(false);
  });

  it('连着来两次回声也不会被误判成用户点过', () => {
    const { rerender } = render(step(true));
    const el = fold();
    echoToggle(el);
    echoToggle(el);
    echoToggle(el);
    rerender(step(false));
    expect(fold().open).toBe(false);
  });
});

describe('Foldable 默认行为(没接生命周期的调用点)', () => {
  const plain = (defaultOpen: boolean): ReactElement => (
    <Foldable summary={<span>执行命令</span>} defaultOpen={defaultOpen}>
      <p>终端输出</p>
    </Foldable>
  );

  it('不传 lifecycleOpen 时,defaultOpen 仍然只是初始值,父层改它拨不动折叠态', () => {
    const { rerender } = render(plain(true));
    expect(fold().open).toBe(true);
    echoToggle(fold());
    rerender(plain(false));
    expect(fold().open, 'defaultOpen 从来只在挂载时看一眼').toBe(true);
  });

  it('不传 lifecycleOpen 时,收起的那条被父层改成 defaultOpen 也不会自己弹开', () => {
    const { rerender } = render(plain(false));
    expect(fold().open).toBe(false);
    rerender(plain(true));
    expect(fold().open).toBe(false);
  });

  it('不传 lifecycleOpen 时,用户点开之后父层重渲染不会把它拨回去', () => {
    const { rerender } = render(plain(false));
    clickSummary(fold());
    expect(fold().open).toBe(true);
    rerender(plain(false));
    expect(fold().open).toBe(true);
  });
});

describe('Foldable 生命周期跟随 · 与既有 prop 的关系', () => {
  it('受控的 open 仍然说了算 —— 壳那一层自己记着,轮不到 lifecycleOpen 插手', () => {
    const controlled = (open: boolean): ReactElement => (
      <Foldable summary={<span>壳头</span>} open={open} lifecycleOpen={!open}>
        <p>壳里</p>
      </Foldable>
    );
    const { rerender } = render(controlled(true));
    expect(fold().open).toBe(true);
    rerender(controlled(false));
    expect(fold().open).toBe(false);
  });

  it('不可展开的那一条,lifecycleOpen 也掀不开它(D35)', () => {
    render(
      <Foldable summary={<span>跨轮召回</span>} expandable={false} lifecycleOpen>
        <p>不该出现</p>
      </Foldable>,
    );
    expect(fold().open).toBe(false);
    expect(document.body.textContent).not.toContain('不该出现');
  });

  it('lifecycleOpen 开着时,deferBody 的正文首帧就挂上', () => {
    render(
      <Foldable summary={<span>在跑</span>} lifecycleOpen deferBody>
        <p>这一步干的活</p>
      </Foldable>,
    );
    expect(document.body.textContent).toContain('这一步干的活');
  });

  /*
   * 「摊开」必须是**首帧就成立的事实**,不能先画一帧收着的再让 effect 弹开 ——
   * `useEffect` 排在绘制之后,那样真机上每条 todo 轮到自己时都会闪一下,
   * 而且 `.fold` 那条展开过渡会平白播一次。
   *
   * jsdom 看不见「帧」,但看得见**渲染次数**:首帧就对 = 挂载只渲染一次;
   * 靠 effect 补 = 挂载后还要再被 effect 拨一轮。所以这里数的是渲染次数。
   */
  it('自动摊开是首帧的事实,不是 effect 事后补的', () => {
    /*
     * 判据:`open` 这个属性有没有在**挂进 DOM 之后**被改过。
     * 首帧就摊开 = 元素带着 `open` 出生,进树之后一次属性变更都没有;
     * 靠 effect 事后补 = 先挂一个收着的进去,再被改成开 —— 那就是真机上闪的那一下,
     * 而且 `.fold` 的展开过渡会平白播一次。
     * (`useEffect` 排在绘制之后,jsdom 看不见「帧」,但看得见这次属性变更。)
     */
    const { container, rerender } = rtlRender(<div />);
    const mo = new MutationObserver(() => {});
    mo.observe(container, { subtree: true, attributes: true, attributeFilter: ['open'] });

    rerender(
      <Foldable summary={<span>在跑</span>} lifecycleOpen>
        <p>这一步干的活</p>
      </Foldable>,
    );
    const attrChanges = mo.takeRecords().filter((r) => r.type === 'attributes');
    mo.disconnect();

    expect(fold().open).toBe(true);
    expect(
      attrChanges.map((r) => r.attributeName),
      '进了 DOM 之后不该再被拨一次 open —— 那就是先画一帧收着的',
    ).toEqual([]);
  });
});
