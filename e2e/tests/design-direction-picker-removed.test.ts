/**
 * 「设计风格选择」这条路**整条删除** —— 不是下线、不是休眠、不是加一句禁令。
 *
 * ── 产品裁决(2026-09-08,逐字)────────────────────────────────
 *
 *   「od-next-strategy 的 plan 阶段确实挂着 direction-picker? 那你为啥不直接干掉?
 *     还额外加一个不许问.. 有病吗.. **都删掉啊**」
 *
 * 这条裁决**推翻**了 2026-09-07 的 T69。T69 当天的做法是「提示词撤干净 + 渲染层
 * 原地留着当休眠件当安全网」,配套的守卫是
 * `question-form-visual-style-retired.test.ts`(守提示词撤干净)和
 * `question-form-type-parity.test.ts` 的 `DORMANT_TYPES`(守两侧故意不相等)。
 * 现在产品要的是**整条路不存在**,所以那两份守卫的判据同时失效:
 * 前者被本文件取代,后者的判据变回**集合相等**。
 *
 * ── 这个测试守的是什么 ────────────────────────────────────────
 *
 * **不变量**:仓库里不存在任何「让用户挑设计风格」的实现或接线。逐层守:
 *
 *  1. atom 本体不存在(`plugins/_official/atoms/direction-picker/`);
 *  2. 没有任何场景 / 流水线契约 / daemon 花名册还挂着它 —— 挂着就等于
 *     `renderActiveStageBlock` 会去加载一个不存在的 atom;
 *  3. 渲染器不再认 `direction-cards` 这个类型,host 视觉目录整个不存在;
 *  4. 提示词侧**发问**那半边(`renderDirectionFormBody`)不存在。
 *
 * ⚠️ **不守**的东西,别顺手加进来:方向**库**(`DESIGN_DIRECTIONS` /
 * `renderDirectionSpecBlock` / `renderDirectionIndexBlock` / `od tools directions`)
 * **是活的**。它是 agent **自己推断**方向时绑定调色板的事实源,和「问用户」
 * 无关 —— `core-slim.ts` 里那条「never infer colors or fonts from the name alone」
 * 就靠它。删了它 agent 会开始瞎编颜色。
 *
 * 本文件按根 `AGENTS.md` 落在 `e2e/tests/` —— 同时观察 apps/daemon、apps/web、
 * packages/contracts 与 plugins 四处,是跨包一致性检查。纯文件读取,不起 runtime。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const abs = (rel: string): string => path.join(REPO, rel);
const read = (rel: string): string => readFileSync(abs(rel), 'utf-8');

/**
 * 提示词住在 TS 模板字符串里,一个反引号在源码里是 `\` + `` ` `` 两个字节。
 * 直接拿 /`x`/ 搜源码永远搜不到 —— 这个盲区让 T69 的上一版守卫恒绿过。
 * 所以断言一律跑在**还原成模型读到的样子**之后的文本上。
 */
const readAsModelSees = (rel: string): string =>
  read(rel)
    .replace(/\\`/g, '`')
    .replace(/\\\$\{/g, '${');

/** 行内代码的反引号也去掉,给「按短语找」的断言用。 */
const readProse = (rel: string): string => readAsModelSees(rel).replace(/`/g, '');

/**
 * 每一处**把这个能力接出去**的地方。
 *
 * ⚠️ 判据是 `/direction[- ]pickers?/i` + 中文的「方向选择」,**不是**光找
 * `direction-picker` 这个 id。第一版只找 id,于是漏掉了两类真实绑定点:
 *
 *  · `apps/daemon/src/plugins/scaffold.ts` —— `od plugin scaffold` 生成的
 *    `SKILL.md` 正文里写着「Plan + direction picker.」(**空格**,不是连字符)。
 *    这是活路径:每个新脚手架出来的插件都会带着这句话,教作者去用一个不存在的能力。
 *  · `docs/plugins-spec{,.zh-CN}.md` —— **当前插件契约**(不是历史排期),
 *    它向插件作者承诺 UI 会渲染 direction picker、并把「方向选择」列进
 *    长程任务的标准阶段和 GenUI 的人机介入场景。
 *
 * 所以这份清单守的是「**这个能力还有没有被承诺出去**」,而不是「某个字符串还在不在」。
 *
 * ⚠️ 方向**库**用的词是 direction / directions,**不受这条正则影响** —— 只有
 * 「picker / 选择」那层意思被禁。这是有意的:库是活的,选择器才是删掉的那个。
 */
const PICKER_PROMISE = /direction[- ]pickers?|direction picking|方向选择/i;

const BINDING_SITES: { rel: string; what: string }[] = [
  { rel: 'plugins/_official/scenarios/od-default/open-design.json', what: 'plan 阶段' },
  { rel: 'plugins/_official/scenarios/od-new-generation/open-design.json', what: 'plan 阶段' },
  { rel: 'plugins/_official/scenarios/od-next-strategy/open-design.json', what: 'plan 阶段' },
  { rel: 'plugins/_official/scenarios/od-plugin-authoring/open-design.json', what: 'plan 阶段' },
  { rel: 'plugins/_official/scenarios/od-design-refine/open-design.json', what: 'direction 阶段' },
  { rel: 'plugins/_official/scenarios/od-tune-collab/open-design.json', what: 'direction 阶段' },
  { rel: 'plugins/_official/scenarios/od-new-generation/SKILL.md', what: '流水线示例' },
  { rel: 'plugins/_official/scenarios/od-tune-collab/SKILL.md', what: '流水线示例' },
  { rel: 'apps/daemon/src/plugins/atoms.ts', what: 'daemon atom 花名册' },
  { rel: 'apps/daemon/src/plugins/strategy-recipe.ts', what: 'OD Next 必需 atom 集' },
  { rel: 'apps/daemon/src/plugins/scaffold.ts', what: '`od plugin scaffold` 生成的 SKILL.md 正文' },
  { rel: 'packages/contracts/src/prompts/od-next-strategy.ts', what: 'OD Next 阶段契约' },
  { rel: 'plugins/registry/official/open-design-marketplace.json', what: '官方 registry' },
  { rel: 'docs/plugins-spec.md', what: '插件契约(当前,非历史)向作者承诺的公开面' },
  { rel: 'docs/plugins-spec.zh-CN.md', what: '插件契约中文镜像' },
  { rel: 'plugins/spec/SPEC.md', what: '面向贡献者的紧凑契约' },
  { rel: 'plugins/spec/SPEC.zh-CN.md', what: '面向贡献者的紧凑契约中文镜像' },
];

/** 提示词里**发问**那半边曾经出现的每一条路。 */
const PROMPT_PATHS: { rel: string; reachable: string }[] = [
  { rel: 'apps/daemon/src/prompts/core-slim.ts', reachable: '默认设计会话(slim 是默认)' },
  { rel: 'plugins/_official/atoms/discovery-question-form/SKILL.md', reachable: '插件 / OD Next' },
  { rel: 'apps/daemon/src/prompts/system.ts', reachable: 'ask 模式 / 媒体面 / classic' },
  { rel: 'apps/daemon/src/prompts/discovery.ts', reachable: '仅 OD_PROMPT_CORE=classic' },
  { rel: 'packages/contracts/src/prompts/system.ts', reachable: '当前无运行时消费者(镜像)' },
  { rel: 'packages/contracts/src/prompts/discovery.ts', reachable: '当前无运行时消费者(镜像)' },
];

describe('设计风格选择整条路已删除', () => {
  it('direction-picker atom 本体不存在', () => {
    expect(
      existsSync(abs('plugins/_official/atoms/direction-picker')),
      'direction-picker atom 目录还在',
    ).toBe(false);
  });

  it('没有任何场景 / 契约 / 花名册 / 脚手架 / 文档还承诺这个能力', () => {
    for (const { rel, what } of BINDING_SITES) {
      expect(existsSync(abs(rel)), `${rel} 不见了 —— 挪动位置要同时更新本测试`).toBe(true);
      expect(read(rel), `${rel} 的${what}还挂着 direction picker`).not.toMatch(PICKER_PROMISE);
    }
  });

  it('这条判据真的分得出「选择器」和「方向库」', () => {
    /*
     * 防真空:上一条全绿也可能是因为正则根本匹配不上东西。这里拿两组静态样本
     * 洗一遍 —— 该红的红、该放行的放行 —— 否则「都没匹配到」和「判据坏了」
     * 从读数上分不开。
     */
    for (const banned of [
      '2. Plan + direction picker.',
      'the UI can show direction pickers',
      'discovery → direction picking → generation',
      '`direction-picker`',
      'UI 可以展示 direction picker',
      'discovery → 方向选择 → 生成',
    ]) {
      expect(PICKER_PROMISE.test(banned), `本该被拦住:${banned}`).toBe(true);
    }
    for (const allowed of [
      'Direction library — infer and bind by default',
      'choose the best match for the brief',
      'od tools directions --id <id>',
      'Preferred direction: shorter / sharper / more playful',
      '方向库是 agent 自己推断之后绑定调色板的事实源',
    ]) {
      expect(PICKER_PROMISE.test(allowed), `本不该被拦住:${allowed}`).toBe(false);
    }
  });

  it('渲染器不再认 direction-cards 这个 question 类型', () => {
    const src = read('apps/web/src/artifacts/question-form.ts');
    const union = /export type QuestionType =([\s\S]*?);/.exec(src);
    expect(union, 'QuestionType 联合类型抽不出来 —— 抽取逻辑坏了').toBeTruthy();
    expect(union![1], '渲染器还认 direction-cards').not.toMatch(/direction-cards/);
    /* 别名入口也要一起走:normalizeType 里 `directions` / `cards` / `direction`
       四个别名任何一个留着,旧表单都还能把这个类型走回来。 */
    expect(src, 'question-form.ts 里还有 direction-cards 的解析/再发路径').not.toMatch(
      /direction-cards/,
    );
    expect(src, 'DirectionCard 这个卡片载荷类型还在').not.toMatch(/DirectionCard/);
  });

  it('host 视觉风格目录整个不存在', () => {
    for (const rel of [
      'apps/web/src/runtime/visual-style-catalog.ts',
      'apps/web/src/runtime/visual-style-deck.ts',
    ]) {
      expect(existsSync(abs(rel)), `${rel} 还在`).toBe(false);
    }
  });

  it('QuestionForm / AssistantMessage 里没有残留的选风格控件', () => {
    const questionForm = read('apps/web/src/components/QuestionForm.tsx');
    for (const symbol of [
      'VisualStylePicker',
      'VisualDirectionStack',
      'VisualDirectionCardView',
      'VisualStylePreview',
      'DirectionCardsPicker',
      'visualStyleContext',
    ]) {
      expect(questionForm, `QuestionForm.tsx 里还留着 ${symbol}`).not.toMatch(symbol);
    }
    expect(
      read('apps/web/src/components/AssistantMessage.tsx'),
      'AssistantMessage.tsx 还在往下传 visualStyleContext',
    ).not.toMatch(/visualStyleContext/);
  });

  it('十份 README 的「已交付」清单不再把选择器算作已交付的能力', () => {
    /*
     * README 的 Roadmap 是 `- [x]` 已交付清单,不是有日期的历史记录 —— 上面躺着
     * 一个已经不存在的能力,就是对外说了假话。
     *
     * ⚠️ 这里**不能**复用 `PICKER_PROMISE`:那条正则只认得英文和中文,而这句话在
     * 十个 locale 里各有各的译法(`sélecteur à 5 directions` / `5 方向ピッカー` /
     * `выбор из 5 направлений` …),七个 locale 它一个都看不见。拿它守这里会绿得
     * 很好看却什么都没守住。所以改成**逐 locale 的显式短语清单**,并且下面先
     * 自检每个文件都还在 —— 名单里躺着一个早就改名的文件,这条守卫就成了空洞。
     */
    const PICKER_PHRASES: { rel: string; phrase: string }[] = [
      { rel: 'README.md', phrase: '5-direction picker' },
      { rel: 'docs/i18n/README.th.md', phrase: '5-direction picker' },
      { rel: 'docs/i18n/README.ar.md', phrase: 'مُنتقي 5 اتجاهات' },
      { rel: 'docs/i18n/README.es.md', phrase: 'selector de 5 direcciones' },
      { rel: 'docs/i18n/README.fr.md', phrase: 'sélecteur à 5 directions' },
      { rel: 'docs/i18n/README.ja-JP.md', phrase: '5 方向ピッカー' },
      { rel: 'docs/i18n/README.ru.md', phrase: 'выбор из 5 направлений' },
      { rel: 'docs/i18n/README.uk.md', phrase: 'селектор 5 напрямів' },
      { rel: 'docs/i18n/README.zh-CN.md', phrase: '5 方向选择器' },
      { rel: 'docs/i18n/README.zh-TW.md', phrase: '5 方向選擇器' },
    ];
    for (const { rel, phrase } of PICKER_PHRASES) {
      expect(existsSync(abs(rel)), `${rel} 不见了 —— 挪动位置要同时更新本清单`).toBe(true);
      expect(read(rel), `${rel} 的已交付清单还写着选择器`).not.toContain(phrase);
    }
    /* 反向:方向**库**本身仍然是已交付的能力,别顺手把它也划掉 */
    expect(read('README.md')).toContain('5 visual directions');
  });

  it('提示词侧发问那半边(renderDirectionFormBody)不存在', () => {
    for (const rel of [
      'apps/daemon/src/prompts/directions.ts',
      'packages/contracts/src/prompts/directions.ts',
    ]) {
      expect(read(rel), `${rel} 还留着 renderDirectionFormBody`).not.toMatch(
        /renderDirectionFormBody/,
      );
    }
  });

  it('没有一条提示词路径还向模型提供 direction-cards / host 风格目录 / tone 那道题', () => {
    for (const { rel, reachable } of PROMPT_PATHS) {
      const src = readAsModelSees(rel);
      const prose = readProse(rel);
      expect(src, `${rel}(${reachable})还在提 direction-cards`).not.toMatch(/direction-cards/);
      expect(prose, `${rel} 还在教 host 风格目录`).not.toMatch(/visual[- ]style catalog/i);
      expect(src, `${rel} 的示例简报还带着 tone 那道题`).not.toMatch(/"id":\s*"tone"/);
      expect(src, `${rel} 还在别处点名 tone 这道题`).not.toMatch(/`tone`/);
      expect(prose, `${rel} 的澄清优先级里还列着视觉风格`).not.toMatch(/brand or visual style/i);
    }
  });

  it('方向**库**还活着 —— 这是 agent 自己推断方向的事实源,不许一起删', () => {
    /*
     * 反向守卫:防「删过头」。方向库和「问用户」是两件事 —— 它是 agent 自己
     * 推断出方向之后,拿来绑定 CSS `:root` 的那份规格。删了它,agent 只能从
     * 方向名字瞎编颜色,而 `core-slim.ts` 恰恰明令禁止这件事。
     */
    const directions = read('apps/daemon/src/prompts/directions.ts');
    expect(directions, '方向库被删了').toMatch(/DESIGN_DIRECTIONS/);
    expect(directions, 'renderDirectionSpecBlock 被删了').toMatch(/renderDirectionSpecBlock/);
    expect(directions, 'renderDirectionIndexBlock 被删了').toMatch(/renderDirectionIndexBlock/);
    expect(directions, 'formatDirectionSpecText 被删了 —— od tools directions 会坏').toMatch(
      /formatDirectionSpecText/,
    );
    expect(read('apps/daemon/src/cli.ts'), 'od tools directions 子命令被删了').toMatch(
      /'tools' && argv\[1\] === 'directions'/,
    );
    expect(
      readAsModelSees('apps/daemon/src/prompts/core-slim.ts'),
      'core-slim 不再教 agent 去拉方向规格 —— 它会开始瞎编颜色',
    ).toMatch(/tools directions --id/);
  });
});
