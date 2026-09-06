/**
 * `<question-form>` 提示词的**类型清单与控件选择规则**在所有授权路径上必须一致。
 *
 * ── 为什么需要这个测试 ────────────────────────────────────────
 * 历史事故:往旧策略的提示词里加了规则,新策略那条路没加,结果 `direction-cards`
 * 和三行「下一步」建议在新策略下整个失效。根因是**同一份规则有六份手抄件**,
 * 而没有任何一个测试把它们绑在一起 —— 改其中一份,全套测试照样绿。
 *
 * 审计(2026-09-02)确认:
 *  · 六份清单彼此独立,句式三种,连最后一项前的连接词都不一样(none / and / or);
 *  · 唯一的机器可读事实源是 web 的 `QuestionType` 联合类型,但没有任何提示词引用它;
 *  · 真正被模型读到的是 `core-slim.ts`(默认设计会话)和那份 bundled atom
 *    `SKILL.md`(插件 / OD Next 会话)—— 而这两份之间恰恰没有任何对照测试;
 *  · `core-slim.test.ts` 只断言 18 个值里的 3 个,`select` 不在其中。
 *
 * 所以这里守的是**集合相等**,不是「某几个关键字在不在」:任何一条路增删一个
 * 类型、或漏掉控件选择规则,都会红。
 *
 * 本文件按根 `AGENTS.md` 落在 `e2e/tests/` —— 它要同时观察 apps/daemon、
 * packages/contracts、plugins 和 apps/web 四处,是跨包一致性检查。
 * 纯文件读取,不起任何 runtime。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string): string => readFileSync(path.join(REPO, rel), 'utf-8');

/** 六份手抄件。`reachable` 记的是审计当天的实际可达性,注释用,不参与断言。 */
const PROMPT_PATHS: { rel: string; reachable: string }[] = [
  { rel: 'apps/daemon/src/prompts/core-slim.ts', reachable: '默认设计会话(slim 是默认)' },
  { rel: 'plugins/_official/atoms/discovery-question-form/SKILL.md', reachable: '插件 / OD Next' },
  { rel: 'apps/daemon/src/prompts/system.ts', reachable: 'ask 模式 / 媒体面 / classic' },
  { rel: 'apps/daemon/src/prompts/discovery.ts', reachable: '仅 OD_PROMPT_CORE=classic' },
  { rel: 'packages/contracts/src/prompts/system.ts', reachable: '当前无运行时消费者(镜像)' },
  { rel: 'packages/contracts/src/prompts/discovery.ts', reachable: '当前无运行时消费者(镜像)' },
];

/** 事实源:web 渲染器认得的那些类型。提示词不能承诺渲染器做不到的事。 */
function supportedTypes(): Set<string> {
  const src = read('apps/web/src/artifacts/question-form.ts');
  const union = /export type QuestionType =([\s\S]*?);/.exec(src);
  if (!union) throw new Error('QuestionType union not found');
  return new Set([...union[1]!.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]!));
}

/**
 * 抽出一份提示词里的类型清单。
 *
 * 定位靠 `datetime-local` —— 它只在类型清单里出现,是这几份文件的判别标记。
 * 抽出来的候选词要**和渲染器的联合类型取交集**:这几份提示词的类型清单旁边就
 * 挨着 `options` / `cards` / `label` / `required` 这些字段名,它们同样是反引号包着的,
 * 靠行窗口分不开。取交集之后问的正是我们要问的那件事 ——
 * 「这条路承诺了哪些**类型**」。
 */
function typeListIn(rel: string, supported: ReadonlySet<string>): Set<string> {
  const src = read(rel);
  const lines = src.split('\n');
  // SKILL.md 的清单折成三行,而 `datetime-local` 落在**第二行** —— 前后都放宽一行
  const start = lines.findIndex((candidate) => candidate.includes('datetime-local'));
  if (start === -1) throw new Error(`no type list found in ${rel}`);
  const window = lines.slice(Math.max(0, start - 1), start + 3).join(' ');
  const found = [...window.matchAll(/`\\?`?([a-z-]+)\\?`?`/g)].map((m) => m[1]!);
  return new Set(found.filter((token) => supported.has(token)));
}

/**
 * 反引号包住的一个标识符。`core-slim.ts` 是**模板字面量**,里面的反引号在源码里
 * 写成 `\``,而 `system.ts` 是普通双引号字符串、`SKILL.md` 是裸 markdown ——
 * 三种写法在源码里长得不一样。这条正则容忍那个转义反斜杠:我们要问的是
 * 「这条规则写没写」,不是「它用哪种字符串语法写的」。
 */
const ticked = (name: string): RegExp => new RegExp('\\\\?`' + name + '\\\\?`');

describe('question-form 提示词跨路径一致性', () => {
  it('六条路径都还在,没有被悄悄挪走', () => {
    for (const { rel } of PROMPT_PATHS) {
      expect(() => read(rel), `${rel} 不见了 —— 挪动位置要同时更新本测试`).not.toThrow();
      expect(read(rel), `${rel} 里没有 question-form 授权段`).toMatch(/question-form/);
    }
  });

  it('六条路径都完整枚举了渲染器支持的每一个类型', () => {
    const supported = supportedTypes();
    expect(supported.size, '联合类型抽空了 —— 抽取逻辑坏了,不是提示词的问题')
      .toBeGreaterThan(10);

    for (const { rel } of PROMPT_PATHS) {
      /*
       * 断言的是**和事实源相等**,不是「和第一条路相等」。
       * 拿其中一条当基准,六条一起漏掉同一个类型时会集体绿 —— 那正是这一族
       * 事故的形状(六份手抄件一起过时)。渲染器新增一个类型,六条必须都学会。
       */
      expect([...typeListIn(rel, supported)].sort(), `${rel} 的类型清单和渲染器对不上`)
        .toEqual([...supported].sort());
    }
  });

  it('六条路径都写了 radio / select 的选择判据(按数量)', () => {
    for (const { rel } of PROMPT_PATHS) {
      const src = read(rel);
      /*
       * 判据是**选项数量**(2026-09-02 第二版):单选且选项少用 radio,
       * 单选且选项多用 select,多选永远是竖排列表。
       * 第一版按「需不需要比较」分,已作废 —— 别再写回去。
       */
      expect(src, `${rel} 没有说什么时候用 select`).toMatch(/by option count/i);
    }
  });

  it('六条路径都写了「一题最多 6–7 个选项」的上限', () => {
    for (const { rel } of PROMPT_PATHS) {
      // 这条必须在**通用**的表单规则里。discovery 那条 "Hard cap: 5 questions"
      // 只管开场简报,中途追问的表单不受它管 —— 那正是选项失控的入口。
      expect(read(rel), `${rel} 没有给单题选项数上限`).toMatch(/6-7 options/i);
    }
  });

  it('六条路径都写了「说人话、不要黑话」', () => {
    for (const { rel } of PROMPT_PATHS) {
      expect(read(rel), `${rel} 没有禁黑话`).toMatch(/jargon/i);
    }
  });

  it('六条路径都给了选项文案长度的**具体**指引,不是「简短」这种形容词', () => {
    for (const { rel } of PROMPT_PATHS) {
      const src = read(rel);
      // 模糊的形容词模型执行不了,必须是一个数
      expect(src, `${rel} 没给具体字数`).toMatch(/~?40 characters/i);
      expect(src, `${rel} 没说长解释该放哪`).toMatch(ticked('description'));
    }
  });

  it('六条路径都教了 group / trailingLabel 这两个新字段', () => {
    for (const { rel } of PROMPT_PATHS) {
      const src = read(rel);
      expect(src, `${rel} 没教 \`group\``).toMatch(ticked('group'));
      expect(src, `${rel} 没教 \`trailingLabel\``).toMatch(ticked('trailingLabel'));
    }
  });
});
