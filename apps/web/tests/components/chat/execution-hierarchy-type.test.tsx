// @vitest-environment jsdom
/**
 * 执行记录里的**三档轻重**(PR #7170 的 `components.css`)。
 *
 * 稿子这一版把执行块的排版重排了一遍,原文三条:
 *   「执行计划和步骤标题统一为 13px / 500,进行中、已完成及展开/收起共用。」
 *   「步骤间的小结用 12px;开头说明保留 13px。」
 *   「开头说明沿用正文深色:浅色主题 --text-strong 为 #202020。」
 *
 * 也就是同一只壳里现在有三档:
 *   开场白    13px / 500 / 深色  —— Agent 说给你听的一整段话,要读得下来
 *   步骤标题  13px / 500 / 深色  —— 链上的节点,眼睛顺着往下扫的落点
 *   小结      13px / 400 / 深色  —— 围着节点说的注脚,靠**字重**退一档
 *   耗时      12px / 500 / 深色  —— 跟着标题同色,靠**字号**退一档
 * 之前是「步骤 600、开场白退成 muted」,主次正好反过来:一整段话被压暗、
 * 一行标题被加粗,读起来是标题在喊、正文在退。
 *
 * ⚠️ **2026-09-02 第二次翻向:「注脚退到静音灰」整条掉头。**
 * 上面第三、四档原来是 `12px / 静音灰 #a3a3a3`,依据是当时的稿子。设计当天下午推的
 * `104fc5c5dc`(`origin/design/chat-cards-surface`,现头 `361b78253e`)把整族拉回
 * 正文深色:`.fold.mod-flat { --progress-detail-ink: var(--text-strong) }`
 * (components.css:1066),小结同时从 `--t-mini` 改成 `--t-body` + `font-weight: 400`
 * (components.css:1071-1076)。产品认了这个方向,用户原话:
 * 「我看了下字的颜色啥的,没问题,就按他设计稿对齐,是我们之前讨论的结果」。
 *
 * **所以这一族现在四档同色**,分档全靠字号和字重 —— 下面两条断言的**反向锚**
 * 因此比正向值更要紧:掉回 `#a3a3a3` / `--chat-t-mini` 必须当场红。
 * 整族深色的完整判据(含「终端块**不**跟着翻」)在
 * `record-progress-ink-latest-spec.test.tsx`。
 *
 * ⚠️ **这一族最容易改错的地方是「同一段文字有四种形态」**:它可能是壳的开场白、
 * 两步之间的小结、某条 todo 里的说明,或者干脆是一行工具调用。规则只能靠**位置**
 * 区分它们,所以这个文件分两半:
 *   前半 钉规则文本与它们之间的层叠关系(CSS Module 在 jsdom 里不参与层叠,
 *        只有把规则读出来比才照得出「祖先掉了导致层叠翻转」这类事故 ——
 *        同一副打法见 `record-cascade.test.ts` / `sandwiched-prose-rail.test.ts`)
 *   后半 拿**真实 trace**过一遍,确认规则挂的那几个位置在真数据里真的存在。
 *        只写合成 DOM 的话,规则可能一条都没命中而测试照样绿。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement } from 'react';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell as Shell } from '../../../src/runtime/chat/contract';
import claudeShop from '../../fixtures/chat/claude-shop.turn0.json';
import codexTodo from '../../fixtures/chat/codex-todo.turn0.json';

afterEach(cleanup);

const CSS = readFileSync(
  resolve(__dirname, '../../../src/components/chat/primitives/record.module.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * 只切**顶层**逗号。`:is(.fold, .tool)` 里的逗号是参数分隔,一刀切下去会把一支
 * 选择器劈成两条假的(`sandwiched-prose-rail.test.tsx` 的注释记过同一个坑)。
 */
function splitTopLevel(head: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = '';
  for (const ch of head) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(buf); buf = ''; continue; }
    buf += ch;
  }
  out.push(buf);
  return out;
}

/** 一条规则的声明块 */
function declsOf(selector: string): string {
  for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const one of splitTopLevel(m[1] ?? '')) {
      if (one.replace(/\s+/g, ' ').trim() === selector) return (m[2] ?? '').replace(/\s+/g, ' ').trim();
    }
  }
  return '';
}

const STEP_SUMMARY = '.fold.flat > .body.stack > .fold > summary';
const OPENING = '.fold.flat > .body.stack > .think';
const OPENING_WITH_STEPS = '.fold.flat > .body.stack:has(> .fold) > .think';
/*
 * ⚠️ 2026-09-02 去掉了 `:not(.hasTodo)`。那个排除本意是「开场白贴左」,可开场白靠
 * `~` 的前驱判据天然出局,它真正挡掉的是**中间那几句小结** —— 而 `hasTodo` 又把
 * `kind === 'plan'` 一起算进去,于是只要这一轮出过执行计划,整条规则就失配。
 * 判据回到结构位置,理由与红证见 `sandwiched-prose-rail.test.tsx` 与
 * `record-ink-layers.test.tsx`(后者用真层叠在两种壳上各量一次)。
 */
const INTERLUDE =
  '.fold.flat > .body.stack > .stepRow ~ .think:has(~ .stepRow)';

describe('执行记录的三档轻重', () => {
  it('步骤标题是 13px / 500,不再是继承来的 12px / 600', () => {
    const decls = declsOf(STEP_SUMMARY);
    expect(decls, `找不到规则 ${STEP_SUMMARY}`).not.toBe('');
    expect(decls).toMatch(/font-size: var\(--chat-t-body\)/);
    expect(decls).toMatch(/font-weight: 500/);
    expect(decls).not.toMatch(/font-weight: 600/);
  });

  /**
   * ~~原名「耗时退到静音灰,和标题拉开一档」~~ —— **2026-09-02 翻掉**(见文件头)。
   * 耗时现在**和标题同色**,拉开的那一档换成了字号(标题 13px / 耗时 12px)。
   * 规则挂点、`font-weight: 500`、「一枚 token 只有一个出处」这三件事一个字没变,
   * 换的只是那枚 token 的值。
   */
  it('耗时跟着标题同色,靠字号而不是墨色退一档', () => {
    const decls = declsOf(`${STEP_SUMMARY} .meta`);
    expect(decls, `找不到规则 ${STEP_SUMMARY} .meta`).not.toBe('');
    expect(decls).toMatch(/color: var\(--chat-progress-detail-ink\)/);
    expect(decls).toMatch(/font-weight: 500/);
    /*
     * 这枚墨色是这一族共用的。**两个所有者各声明一次**(2026-09-02):
     * 扁平壳 `.fold.flat`,以及工具行 `.tool` —— 工具行不保证住在壳里
     * (稿子在 `.tool` 一族里写的也是字面量,不是 `var()`),挂不到就没颜色。
     * 值仍然只有一个出处:整份样式表里这枚 token 只被赋值一次。
     */
    expect(CSS).toMatch(/\.fold\.flat,\s*\.tool\s*\{[^{}]*--chat-progress-detail-ink: var\(--chat-text-strong\)/);
    // 反向锚:掉回静音灰就是把 `104fc5c5dc` 那次掉头撤了,必须当场红
    expect(CSS).not.toMatch(/--chat-progress-detail-ink:\s*#a3a3a3/);
    // 值只许有一个出处 —— 两个所有者共用**一条**声明,不是各抄一个字面量
    expect([...CSS.matchAll(/--chat-progress-detail-ink:/g)]).toHaveLength(1);
  });

  it('开场白留在正文深色 + 13px —— 它是一整段话,不是标注', () => {
    expect(declsOf(OPENING)).toMatch(/font-size: var\(--chat-t-body\)/);
    const withSteps = declsOf(OPENING_WITH_STEPS);
    expect(withSteps, `找不到规则 ${OPENING_WITH_STEPS}`).not.toBe('');
    expect(withSteps).toMatch(/color: var\(--chat-text-strong\)/);
    // 这一条原来把开场白压成 muted,主次正好反了
    expect(withSteps).not.toMatch(/--chat-text-muted/);
  });

  /**
   * ~~原名「两步之间的小结退到 12px 静音,连里面的行内代码一起」~~ ——
   * **2026-09-02 翻掉**(见文件头)。稿子 1071-1076 现在的原话是:
   * 「步骤间的小结与正文同为 13px,但降到常规字重,避免盖过步骤标题」。
   * 所以退的那一档从「字号 + 墨色」换成了**字重**;`code` 那条跟着接管的写法没变
   * (`.think code` 自带 `--chat-text-strong`,不接管的话一段 400 里会留下几个 500 的块)。
   */
  it('两步之间的小结:13px / 400,靠字重退一档,连里面的行内代码一起', () => {
    const decls = declsOf(INTERLUDE);
    expect(decls, `找不到规则 ${INTERLUDE}`).not.toBe('');
    expect(decls).toMatch(/font-size: var\(--chat-t-body\)/);
    expect(decls).toMatch(/font-weight: 400/);
    expect(decls).toMatch(/color: var\(--chat-progress-detail-ink\)/);
    // 反向锚:掉回 12px 就是把那次掉头撤了
    expect(decls).not.toMatch(/font-size: var\(--chat-t-mini\)/);
    expect(declsOf(`${INTERLUDE} code`)).toMatch(/color: inherit/);
  });

  it('小结那条比开场白那条**更特指** —— 否则 400 会被盖回 500', () => {
    /*
     * 两条都命中同一段 `.think`,分档全靠特异性。数的是(类 + 伪类 + 属性)那一档:
     * `:is()` / `:has()` 在真浏览器里按参数里最重的一支算,这里两条的参数都是纯类,
     * 所以逐个数就够用了 —— 要的是「严格大于」,平手会退化成按源码顺序判。
     *
     * ⚠️ 这条**没有**被 2026-09-02 那次掉头作废,只是被它守的属性换了:
     * 原来两条差的是字号(13 vs 12),现在两档同字号同色,差的是**字重**
     * (开场白继承 500 / 小结显式 400)和 22px 缩进。特异性平手的话,
     * 小结会连缩进一起丢掉 —— 那正是这条要拦的事故形态。
     */
    const weigh = (s: string): number =>
      (s.match(/\.[A-Za-z0-9_-]+|\[[^\]]+\]|:[a-z-]+/g) ?? []).length;
    expect(weigh(INTERLUDE)).toBeGreaterThan(weigh(OPENING));
  });
});

describe('真实 trace:规则挂的那几个位置确实存在', () => {
  const shellOf = (fixture: { runStatus?: string; events: unknown[] }): Shell => {
    const blocks = buildTurnBlocks({
      events: fixture.events as PersistedAgentEvent[],
      runStatus: fixture.runStatus as 'succeeded' | 'failed' | 'canceled' | 'running' | undefined,
    });
    const shell = blocks.find((b): b is Shell => b.kind === 'shell');
    if (!shell) throw new Error('这份 trace 没有执行壳');
    return shell;
  };
  const show = (shell: Shell): ReactElement => (
    <I18nProvider initial="zh-CN">
      <ExecutionShell shell={shell} deferCollapsedBodies={false} />
    </I18nProvider>
  );
  const shellBody = (root: HTMLElement): HTMLElement => {
    for (const d of Array.from(root.querySelectorAll('details'))) d.open = true;
    const body = root.querySelector<HTMLElement>('details[class*="flat"] > div[class*="body"]');
    if (!body) throw new Error('壳 body 没渲染出来');
    return body;
  };

  it('claude 的真实一轮:开场白是壳 body 的直接子代,后面跟着工具行', () => {
    const { container } = render(show(shellOf(claudeShop)));
    const body = shellBody(container);
    const kids = Array.from(body.children);
    // 开场白 = 壳 body 的第一个 `.think`
    const first = kids[0];
    expect(first, '壳 body 是空的').toBeTruthy();
    expect(first!.className).toMatch(/think/);
    // 后面确实还有别的行 —— 否则「开场白 / 步骤」这组关系根本不成立
    expect(kids.length).toBeGreaterThan(1);
    expect(kids.slice(1).some((el) => /tool/.test(el.className) || el.tagName === 'DETAILS')).toBe(true);
  });

  it('codex 的真实一轮:开场白和可折叠步骤同时在,`:has(> .fold)` 那条真会命中', () => {
    const { container } = render(show(shellOf(codexTodo)));
    const body = shellBody(container);
    const kids = Array.from(body.children);
    expect(kids.some((el) => /think/.test(el.className))).toBe(true);
    // `:has(> .fold)` 要求壳 body **直接**挂着一个 details.fold
    expect(body.querySelector(':scope > details')).not.toBeNull();
    // 步骤标题这一档就是 `> .fold > summary`,耗时挂在它里面
    expect(body.querySelector(':scope > details > summary')).not.toBeNull();
    expect(container.querySelector('[data-testid="chat-foldable-elapsed"]')).not.toBeNull();
  });

  /*
   * 「夹在两步中间的小结」在现有六份 trace 里一次都没出现(逐份数过:claude 那轮
   * 正文只有开头一段,codex / amr 那几轮的正文都落在 todo 里)。所以这一档的 DOM 形态
   * 由 `sandwiched-prose-rail.test.tsx` 用合成壳钉,这里只钉规则本身(上半场那条),
   * **不假装真数据里有**。哪天补进一份带小结的 trace,把它加到这里。
   */
});
