/**
 * 「澄清卡每题副标题」整条链路下线 —— 前端停画之后,**提示词也不再要求模型写**。
 *
 * ── 工单与裁决 ────────────────────────────────────────────────
 *
 * OPEND-2707:澄清卡不该显示每题副标题。分诊(2026-09-07)指出这里有前提冲突,
 * 给了产品两条路:①只改渲染(提示词仍要模型写 `help`,写了没人看);
 * ②渲染 + 提示词链路一起改。①已合并 —— `QuestionForm.tsx` 不再画 `q.help`,
 * `composio.css` 的 `.qf-help` 规则一并删掉。
 *
 * 用户 2026-09-08 当面拍板走②:「改彻底,提示词也改」。本文件守的就是②那一半。
 *
 * ── 这个测试能证明什么、不能证明什么 ──────────────────────────
 *
 * **能证明**:七条授权路径的提示词文本里,再没有任何一处把 `help` 当成一道题
 * 可以带的字段 —— 既不在表单契约里点它的名,也不在宿主自己写的表单里塞一条,
 * 也不在本地化清单里把它列成一种要翻译的控件文案。少改一条路就红 —— 这一族
 * 事故的形状正是「六份手抄件改漏一份」(见 `question-form-type-parity.test.ts`
 * 的抬头),而 `help` 恰好散在其中三份里。
 *
 * ⚠️ 断言跑在 `readAsModelSees()` 还原过的文本上,不是源码字节。理由与
 * `question-form-visual-style-retired.test.ts` 同源:提示词住在 TS 模板字符串里,
 * 一个反引号在源码里是 `\` + 反引号两个字节,直接拿 /`x`/ 搜源码永远搜不到,
 * 守卫会在缺陷真的还在的整个期间恒绿。
 *
 * **不能证明**:模型**不会**自己给某道题加一个 `help`。解析器仍然认这个字段
 * (见最后一条用例),它只是不再被渲染 —— 那是刻意留的休眠件安全网,不是漏网。
 *
 * 本文件按根 `AGENTS.md` 落在 `e2e/tests/` —— 它同时观察 apps/daemon、
 * packages/contracts、plugins 与 apps/web 四处,是跨包一致性检查。
 * 纯文件读取,不起任何 runtime。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** **模型读到的形态**,不是源码字节。理由见文件抬头。 */
const readAsModelSees = (rel: string): string =>
  readFileSync(path.join(REPO, rel), 'utf-8')
    .replace(/\\`/g, '`')
    .replace(/\\\$\{/g, '${');

const read = readAsModelSees;

/** 同一份文本,再把行内代码的反引号也去掉 —— 给「按短语找」的断言用。 */
const readProse = (rel: string): string => readAsModelSees(rel).replace(/`/g, '');

/**
 * 七条**会被模型读到**的授权路径,与
 * `question-form-visual-style-retired.test.ts` 逐条对应。两边共用同一份路径认知:
 * 那边守「设计风格那一项撤干净没有」,这边守「每题副标题撤干净没有」。
 *
 * 审计当天(2026-09-08)真正带货的只有第 3、5 两条(宿主自写的 ElevenLabs 选音色题)
 * 和 core-slim 的表单契约那一句;其余四条本来就干净。它们仍然全部入列 —— 这份
 * 清单的价值在于「以后谁往任何一条路上写回去都会红」,不是「今天哪几条有货」。
 */
const PROMPT_PATHS: { rel: string; reachable: string }[] = [
  { rel: 'apps/daemon/src/prompts/core-slim.ts', reachable: '默认设计会话(slim 是默认)' },
  { rel: 'plugins/_official/atoms/discovery-question-form/SKILL.md', reachable: '插件 / OD Next' },
  { rel: 'apps/daemon/src/prompts/system.ts', reachable: 'ask 模式 / 媒体面 / classic' },
  { rel: 'apps/daemon/src/prompts/discovery.ts', reachable: '仅 OD_PROMPT_CORE=classic' },
  { rel: 'packages/contracts/src/prompts/system.ts', reachable: '当前无运行时消费者(镜像)' },
  { rel: 'packages/contracts/src/prompts/discovery.ts', reachable: '当前无运行时消费者(镜像)' },
  {
    rel: 'plugins/_official/atoms/direction-picker/SKILL.md',
    reachable: 'od-default / od-next-strategy / od-new-generation / od-tune-collab / od-plugin-authoring 的 plan 阶段',
  },
];

describe('澄清卡每题副标题已从提示词整条链路下线', () => {
  it('七条路径都还在,没有被悄悄挪走', () => {
    for (const { rel } of PROMPT_PATHS) {
      expect(() => read(rel), `${rel} 不见了 —— 挪动位置要同时更新本测试`).not.toThrow();
    }
  });

  it('没有一条路径再往一道题上写 `help` 这个字段', () => {
    /*
     * 宿主自己写的那一条(ElevenLabs 选音色题的
     * `help: 'Select a voice description; …'`)是全仓唯一的生产者,而且它整份
     * JSON 会被 `JSON.stringify` 进系统提示词 —— 模型每次读到都等于看了一份
     * 「一道题可以长这样」的范例。撤发问,就得连这份范例一起撤,否则模型照抄。
     *
     * 断的是**键位**而不是那句具体文案:换一句话照样是同一个缺陷。
     */
    for (const { rel, reachable } of PROMPT_PATHS) {
      expect(read(rel), `${rel}(${reachable})的表单里还带着 help 这个键`)
        .not.toMatch(/(^|[\s{,(])"?help"?\s*:/m);
    }
  });

  it('没有一条路径再向模型点名 `help` 这个字段', () => {
    /*
     * 表单契约那一句(core-slim「put necessary context in the title or the
     * individual question labels/help instead」)不摆键位,却在**指路**:
     * 它明说「上下文可以放进 help」。前端已经不画了,放进去就是写了丢掉 ——
     * 比不写更糟,因为模型以为自己交代过了。
     *
     * 两种形态各守一条:
     *  · 行内代码点名(\`help\`);
     *  · 散文里把它并进斜杠列表(labels/help)—— 这一路更阴,连反引号都没有,
     *    只用 grep 找 \`help\` 会整句漏过去。
     *
     * ⚠️ **给后来者**:本文件读的是**源码字节**,分不清一句话在模板字符串里
     * (模型读得到)还是在 JSDoc 里(模型读不到)。所以这七个文件里连**注释**
     * 也不要写反引号包住的 help —— 想提这个字段就写「help 字段」。
     * 这不是洁癖:换成会解析注释的判据,就要冒「正则多吃一段真提示词、
     * 守卫从此恒绿」的风险,而这一族缺陷的历史恰恰就是恒绿(见抬头)。
     * 宁可让写注释的人绕一下,也不要一个看不见东西的守卫。
     */
    for (const { rel, reachable } of PROMPT_PATHS) {
      expect(read(rel), `${rel}(${reachable})还在向模型点名 help 字段`)
        .not.toMatch(/`help`/);
      expect(readProse(rel), `${rel}(${reachable})还把 help 列成上下文的去处`)
        .not.toMatch(/labels?\s*\/\s*help\b/i);
    }
  });

  it('本地化清单里也不再把每题副标题列成一种要翻译的控件文案', () => {
    /*
     * UI locale override 那一句原本枚举「titles, question labels, placeholders,
     * helper text, and option labels」。副标题不画之后,"helper text" 就成了
     * 第三个入口:它不点 `help` 的名、也不摆键位,却在告诉模型「一道题有一段
     * helper text」。题面撤了、本地化清单还列着,模型照样会造一段出来。
     */
    for (const { rel, reachable } of PROMPT_PATHS) {
      expect(readProse(rel), `${rel}(${reachable})的本地化清单里还列着 helper text`)
        .not.toMatch(/helper text/i);
    }
  });

  it('解析器**仍然**认得 `help` —— 休眠件的安全网不许一起拆掉', () => {
    /*
     * 这一条从一开始就是绿的,它防的是**改过头**:有人看到「提示词不写了、
     * 宿主也不写了」,顺手把字段从解析器里也删掉。
     *
     * 字段今天的真实状态要说清楚,别拿想当然的理由撑着:`mapRawQuestion` 把
     * `qo.help` 读进 `FormQuestion.help`,然后**没有任何人再读它** —— 渲染层
     * 不画(OPEND-2707 ①),`formatFormAnswers` 也不带它。它是**纯休眠**的,
     * 不是「留着还有个用处」。
     *
     * 那为什么还留:
     *  · 删掉 `help?: string` 会让 `QuestionForm.no-question-subtitle.test.tsx`
     *    和 `QuestionForm.test.tsx` 编译不过 —— 而前者正是「副标题不再渲染」这条
     *    不变量的唯一正面证据。为了清一个不占运行时成本的字段,把守它的测试一起
     *    删掉,是拿证据换整洁;
     *  · 提示词撤了不等于线上不会再来:缓存的旧提示词、别的客户端版本、模型自己
     *    记住的旧格式,都还可能发来一道带 `help` 的题。解析器继续容忍这个键,
     *    这类表单的解析形状才不会因为本次下线而改变;
     *  · 产品对同类休眠件的口径是「后续可能要找回」。
     *
     * 先例:`specs/current/chat-panel-decisions-sheet.md`「六个 qf.visual* 键
     * **一个不删**」—— 唯一消费者不可达,但删键会让休眠件编译不过,
     * 等于把「留着随时能找回」变成谎话。同一条理由在这里逐字成立。
     */
    const src = read('apps/web/src/artifacts/question-form.ts');
    expect(src, '删掉 FormQuestion.help 会让「副标题不渲染」那两个测试编译不过')
      .toMatch(/help\?:\s*string;/);
    expect(src, '解析器不再容忍 help 这个键 —— 旧格式表单的解析形状被这次下线改掉了')
      .toMatch(/qo\.help/);
  });
});
