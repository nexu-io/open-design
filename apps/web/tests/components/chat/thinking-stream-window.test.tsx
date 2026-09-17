// @vitest-environment jsdom
/**
 * 思考正文**和外面的普通正文一样**:自然高度、随内容长,不裁剪、不自动滚、不渐隐。
 *
 * ⚠️ 这条**推翻了设计稿**(2026-09-02 产品 + 设计线下裁决)。稿子的
 * `thinking-stream.css` / `.js` 画的是一扇 96px 定高、自己往上走、上下渐隐的窗;
 * 用户原话:
 *   「先不要这个滚动的了,这里文本就和外面普通文本一样有个流式的效果就行,
 *     不要这个滚动效果了,**滚动太慢了,也很难看清**」
 * 「很难看清」指的就是那两道渐隐 —— 窗口上下各 32px 把首尾两行淡到读不出来,
 * 而那两行恰恰是刚落下的字。
 *
 * ⚠️ **被推翻的只有三样:定高、慢速分步滚、渐隐遮罩。** 这三件事我一度混成一件,
 * 来回绕了两轮,所以在这里逐条写死:
 *   高度   ✗ 定高(短内容也撑满一屏)         ✓ `max-height` —— 短内容完全不限高
 *   滚动   ✗ 一步一停的慢速分步滚(「太慢了」)✓ 贴底跟随,但**一次到底**,正常速度
 *   遮罩   ✗ 上下渐隐(用户:「很难看清」)    ✓ 一律没有
 * 用户 2026-09-02 的两句原话分别管后两行:「但我记得 thinking 下面文本不是有最大高度吗?
 * 就跟那个 thinking 完成后的展示那样,有最大高度」;「thinking 要自动跟随的,agent 一边写
 * 一边滚,但是用户如果手动滚动到上面…不能自动跟随滚动了」。
 *
 * 限高**复用**「想完了」那一档现成的 `.body.scroll`(`max-height: 96px; overflow-y: auto`),
 * 不另写一份 —— 两处说的是同一件事(「够看但不占屏」),同一件事不该有两套机制。
 *
 * 跟随那四态(跟随 / 上滚逃逸 / 滚回底部恢复 / 折叠再展开恢复)在
 * `thinking-follow.test.tsx` 里钉,这个文件只管**容器形态**。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import record from '../../../src/components/chat/primitives/record.module.css';
import type { ExecutionShell as Shell, ShellItem } from '../../../src/runtime/chat/contract';

afterEach(cleanup);

const SRC = resolve(__dirname, '../../../src/components/chat');
/* 注释里有成对的花括号(这份文件到处引用稿子的规则原文),不先剥掉就切不开规则 */
const CSS = readFileSync(resolve(SRC, 'primitives/record.module.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** 取出一条规则的声明块。选择器按「逗号段完全相等」匹配 */
function declsOf(selector: string): string {
  for (const block of CSS.split('}')) {
    const [head, body] = block.split('{');
    if (head == null || body == null) continue;
    const parts = head.split(',').map((s) => s.replace(/\s+/g, ' ').trim());
    if (parts.includes(selector)) return body;
  }
  return '';
}

const think = (text: string): ShellItem => ({ kind: 'text', text, thinking: true });
function shellOf(items: ShellItem[], over: Partial<Shell> = {}): Shell {
  return {
    kind: 'shell', seq: 0, status: 'done', items, segments: [],
    thinking: false, stopped: false, elapsedMs: null, quietMs: null, ...over,
  } as Shell;
}
const show = (shell: Shell): ReactElement => (
  <I18nProvider initial="zh-CN"><ExecutionShell shell={shell} /></I18nProvider>
);
const thoughtsBody = (root: HTMLElement): HTMLElement | null =>
  root.querySelector('details[class*="thoughts"] > div[class*="body"]');
/** 跑完的壳是收起的,里面的思考格要等壳开了才挂上来 —— 两步,顺序不能并成一次查询 */
const openShellThenThoughts = (root: HTMLElement): void => {
  const shell = root.querySelector('details[class*="flat"] > summary');
  if (shell) fireEvent.click(shell);
  const thoughts = root.querySelector('details[class*="thoughts"] > summary');
  if (thoughts) fireEvent.click(thoughts);
};

const LONG = Array.from({ length: 14 }, (_, i) => `第 ${i + 1} 段推理。`).join('\n\n');

describe('还在想的那一格:一只灰底容器,里面是普通正文', () => {
  it('推理直接躺在灰底上,中间没有滚动视口那一层', () => {
    const { container } = render(show(shellOf([think(LONG)], { status: 'running', thinking: true })));
    const body = thoughtsBody(container);
    // 正向对照:这一格真渲染了(少了它,下面的结构断言在组件没画时也会「通过」)
    expect(body?.textContent).toContain('第 14 段推理');
    expect(body?.className).toMatch(/stream/);

    // 反:那层视口没了
    expect(body!.querySelector('[data-testid="thinking-stream-viewport"]')).toBeNull();
    // 正:推理是灰底容器的直接孩子
    const markdown = body!.querySelector('[data-testid="thinking-markdown"]');
    expect(markdown).not.toBeNull();
    expect(markdown!.parentElement).toBe(body);
  });

  it('流式效果还在,而且走的是普通正文那一套', () => {
    const { container } = render(show(shellOf([think('一段推理。')], { status: 'running', thinking: true })));
    // `useCharReveal` 把逐字 span 铺在 `ThinkingMarkdown` 的根上;和普通正文同一只 hook
    const markdown = container.querySelector('[data-testid="thinking-markdown"]');
    expect(markdown).not.toBeNull();
    expect(markdown!.textContent).toContain('一段推理');
  });

  it('灰底容器留着:圆角 + 四边留白 + 上下气口', () => {
    const decls = declsOf('.stream');
    expect(decls, '找不到 .stream 规则').not.toBe('');
    expect(decls).toMatch(/background:/);
    expect(decls).toMatch(/border-radius:/);
    expect(decls).toMatch(/padding: var\(--stream-pad\)/);
    expect(decls).toMatch(/margin-block: var\(--stream-gap\)/);
  });

  it('不定高、不裁剪、不遮罩', () => {
    const decls = declsOf('.stream');
    // 定高是被推翻的那一档:短内容也撑满一屏
    expect(decls).not.toMatch(/(^|[^-])height:/);
    expect(decls).not.toMatch(/overflow: hidden/);
    expect(decls).not.toMatch(/mask-image/);
    // 中间那层视口的规则也不该再有
    expect(declsOf('.streamViewport')).toBe('');
    // 整份样式表里不许再留下那两道渐隐
    expect(CSS).not.toMatch(/--stream-fade/);
  });

  it('限高走「想完了」那一档现成的那套,不另写一份', () => {
    /*
     * jsdom 不做布局,`scrollHeight` / `clientHeight` 恒为 0,「短内容不出滚动条」
     * 在这一层量不出来。能钉的是**机制**:用 `max-height` 而不是 `height` ——
     * 这正是「短的时候完全不限高、长了才截住」的 CSS 语义本身。
     * 真实几何要在 Chrome 里量。
     */
    const { container } = render(show(shellOf([think(LONG)], { status: 'running', thinking: true })));
    const body = thoughtsBody(container);
    expect(body?.textContent).toContain('第 14 段推理');
    // 灰底容器 + 限高,两个类挂在同一只 body 上
    expect(body?.className).toMatch(/stream/);
    expect(body?.className).toMatch(/scroll/);

    const cap = declsOf('.fold .body.scroll');
    expect(cap, '找不到 .fold .body.scroll 规则').not.toBe('');
    expect(cap).toMatch(/max-height: 96px/);
    expect(cap).toMatch(/overflow-y: auto/);
    // 同一件事只能有一套机制:限高不许在 `.stream` 上再写一遍
    expect(declsOf('.stream')).not.toMatch(/max-height/);
  });

  it('推理正文的字重是 400,而且那条规则真能落到它身上', () => {
    /*
     * 稿子 `thinking-stream.css:81`:
     *   `.fold.mod-flat > .body.mod-stream > .stream-viewport > .think
     *      { padding: 0; font-weight: 400; color: var(--stream-ink) }`
     * 我们当初只搬了颜色,**字重没搬**。旧基线的正文是 400,继承下来恰好蒙对;
     * W8 把面板基线换成 500 之后,思考正文跟着变重 —— 这是一次真回归。
     *
     * ⚠️ 但光把 `font-weight: 400` 加在 `.stream > .think` 上**没有用**:
     * 那一格的正文是 `ThinkingMarkdown` 渲染的,它的 `.think` 来自**另一个 CSS Module**
     * (`ThinkingMarkdown.module.css`),和 `record.module.css` 的 `.think` 是两个不同的
     * 哈希类名。所以规则必须按「流窗里的那一层」来选,而不是按 `.think` 选。
     *
     * 特异性也不能只求命中:`ThinkingMarkdown.module.css` 里那条 `.think` 是 (0,1,0),
     * 打平就要按两个 module 谁先进 bundle 判 —— 那是「今天碰巧对」。要严格压过它。
     */
    const rule = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .map((m) => ({ sel: (m[1] ?? '').replace(/\s+/g, ' ').trim(), body: (m[2] ?? '').replace(/\s+/g, ' ').trim() }))
      /*
       * ⚠️ 2026-09-02:选择器从「流窗里那一层」(`.body.stream > *`)收成
       * 「**思考那一格**的 body 里那一层」(`.thoughts > .body > *`)——
       * 想完了那一态也共用同一只灰底容器之后,两态必须走同一条规则,
       * 否则字重会在「想完」那一刻跳一档。
       */
      .find((r) => /\.thoughts\s*>\s*\.body\s*>\s*\*/.test(r.sel) && /font-weight:\s*400/.test(r.body));
    expect(rule, '找不到给流窗正文定字重的规则').toBeTruthy();
    const classCount = (rule!.sel.match(/\.[A-Za-z0-9_-]+|:[a-z-]+/g) ?? []).length;
    expect(classCount, '必须严格压过 ThinkingMarkdown 那条 (0,1,0) 的 .think').toBeGreaterThan(1);
  });

  it('结构对照:流窗那一层的直接孩子就是推理正文本身', () => {
    // `> *` 能不能落到正文上,取决于正文是不是这一层的**直接**孩子
    const { container } = render(show(shellOf([think(LONG)], { status: 'running', thinking: true })));
    const body = thoughtsBody(container);
    const markdown = body!.querySelector('[data-testid="thinking-markdown"]');
    expect(markdown).not.toBeNull();
    expect(markdown!.parentElement).toBe(body);
    // 反向对照:它的类名**不是** record 那份 `.think` —— 这正是按 `.think` 选会落空的原因
    const recordThink = record.think;
    expect(typeof recordThink).toBe('string');
    expect(recordThink!.length).toBeGreaterThan(0);
    expect(markdown!.className).not.toContain(recordThink!);
  });

  it('那只慢速分步滚的窗整个删掉了,写滚动位置的路径只剩跟随那一条', () => {
    // 被推翻的那一版(rAF 分步 + 缓动 + 定高窗)不许以任何形式留着
    expect(existsSync(resolve(SRC, 'primitives/useThinkingStream.ts'))).toBe(false);
    /*
     * 「替用户滚」现在**只允许**存在于 `useThinkingFollow` 一处。渲染层散落的
     * `scrollTop` 写入是上一版的形态,散回去就等于又有了第二套判据。
     */
    for (const file of ['ExecutionShell.tsx', 'ThinkingMarkdown.tsx', 'useCharReveal.ts']) {
      const src = readFileSync(resolve(SRC, file), 'utf8');
      expect(src, file).not.toMatch(/useThinkingStream/);
      expect(src, file).not.toMatch(/\.scrollTop\s*=/);
      expect(src, file).not.toMatch(/scrollIntoView|scrollBy|scrollTo\(/);
    }
  });

  it('反向对照:想完了那一档仍然是「点开来读」的限高滚动,不受这条裁决影响', () => {
    const { container } = render(show(shellOf([think(LONG)], { status: 'done' })));
    openShellThenThoughts(container);
    const body = thoughtsBody(container);
    expect(body?.textContent).toContain('第 14 段推理');
    expect(body?.className).toMatch(/scroll/);
    expect(body?.className).not.toMatch(/stream/);
  });
});
