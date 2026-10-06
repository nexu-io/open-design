/**
 * 一组**只读**的 `<style>` 夹具:整个测试文件共用一份解析好的层叠,
 * 每条用例开跑前确认它还是注入时那一份。
 *
 * ── 为什么要共用 ────────────────────────────────────────────────────
 * 把整份 `index.css`(约 1.7 MB、上万条规则)交给 jsdom 解析是纯 CPU 活:空闲的本机
 * 就要上千毫秒,CI 抢核时翻几倍。每条用例各自注入一次,解析就算进了用例自己的
 * 5 秒超时,断言没错也会被判超时。用例只**读**层叠(`getComputedStyle` / CSSOM),
 * 不改表,所以同一个文件注入一次就够。
 *
 * ── 在哪儿注入 ──────────────────────────────────────────────────────
 * 在测试文件的**模块顶层**调 `injectStyleSheets()`,不放进 `beforeAll`。
 * 顶层代码跑在 vitest 的收集阶段,那里没有计时;`beforeAll` 仍受 `hookTimeout`
 * 约束,机器足够忙的时候照样会超时 —— 那就只是把同一个问题从用例挪到了钩子上。
 * 计时的阶段里只剩渲染和读值,都是毫秒级。
 *
 * ── 共用的代价,以及怎么守住 ────────────────────────────────────────
 * 某条用例要是删了、改了这些表,后面的用例量到的就不是真实层叠,而且很多断言在
 * 「没有样式」时恰好是绿的(比如「停着的时候不动」)。所以在 `beforeEach` 里调
 * `assertIntact()`:元素还挂在文档里、文本没换、解析出的规则条数没变。
 * 这几项都不触发重新解析,开销可以忽略。
 */

export interface StyleSheetFixture {
  /** 每张表都还在文档里,文本和注入时一致,规则条数也没变;否则抛错并说明是哪一张。 */
  assertIntact(): void;
  /** 从文档里拆掉这组表(`afterAll` 里调)。 */
  remove(): void;
}

export function injectStyleSheets(texts: readonly string[], doc: Document = document): StyleSheetFixture {
  const entries = texts.map((text, index) => {
    const style = doc.createElement('style');
    style.textContent = text;
    style.dataset.odTestSheet = String(index);
    doc.head.appendChild(style);
    return { style, text, ruleCount: ruleCountOf(style) };
  });
  // jsdom 第一次 `getComputedStyle` 时才给每条规则解析「选择器主体」,缓存在规则对象上
  // (上万条规则就是上万次选择器解析)。这份缓存跟着表走,算夹具的一部分:对根元素先算一次,
  // 把它也留在不计时的注入阶段。只影响耗时,不改变任何计算值。
  doc.defaultView?.getComputedStyle(doc.documentElement);

  return {
    assertIntact() {
      for (const [index, { style, text, ruleCount }] of entries.entries()) {
        const problem = !style.isConnected
          ? 'is no longer in the document'
          : style.textContent !== text
            ? 'had its text replaced'
            : ruleCountOf(style) !== ruleCount
              ? `now has ${ruleCountOf(style)} rules instead of ${ruleCount}`
              : null;
        if (problem != null) {
          throw new Error(
            `Shared style sheet #${index} ${problem}; an earlier test mutated the read-only cascade fixture.`,
          );
        }
      }
    },
    remove() {
      for (const { style } of entries) {
        style.remove();
      }
    },
  };
}

function ruleCountOf(style: HTMLStyleElement): number {
  return style.sheet?.cssRules.length ?? -1;
}
