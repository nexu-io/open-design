/**
 * 「设计风格选择题」整题下线 —— 从**提示词源头**断掉,不是在渲染层拦。
 *
 * ── 产品裁决(2026-09-07,逐字)────────────────────────────────
 *
 *   「选中态就是当前切换到的那个效果,或者你能否把提示词里让 agent 感知到
 *     question-form 能出设计风格的那些提示词下掉?**不问了**,这些代码先讲提示词
 *     干掉,组件代码注释,后续可能要找回」
 *
 * 也就是说:**模型不再被告知它可以出设计风格题**。渲染那一路(`VisualStylePicker`
 * / `VisualDirectionStack` / `visual-style-catalog` / `visual-style-deck`)**原地留着
 * 当休眠件**,产品明说「后续可能要找回」—— 所以本文件断言的是**提示词**,
 * 不是「渲染器不认这个类型」。两者的分工写在 `RETIRED_FROM_PROMPTS` 那条注释里。
 *
 * ── 这个测试能证明什么、不能证明什么 ──────────────────────────
 *
 * **能证明**:七条授权路径的提示词文本里,再没有任何一处向模型**提供**
 * `direction-cards` 这个类型、教它 host 目录的用法、或在示例简报里摆一道
 * 视觉风格题。少改一条路就红 —— 这一族事故的形状正是「六份手抄件改漏一份」
 * (见 `question-form-type-parity.test.ts` 的抬头)。
 *
 * **不能证明**:模型**不会**自己开一道问视觉风格的题。它完全可以自造一道
 * `{ id: "tone", type: "radio", options: ["极简", "编辑感", …] }` —— 那是模型的
 * 自由发挥,提示词管不住,只有真机长期观察能说话。本文件守的是「我们没教它」,
 * 不是「它学不会」。
 *
 * **也不能证明**:线上缓存的旧提示词、或别的客户端版本发来的旧表单。那种输入
 * 由休眠的渲染路径兜底,钉在
 * `apps/web/tests/components/question-form-direction-cards-dead-end.test.tsx`。
 *
 * 本文件按根 `AGENTS.md` 落在 `e2e/tests/` —— 它同时观察 apps/daemon、
 * packages/contracts 与 plugins 三处,是跨包一致性检查。纯文件读取,不起 runtime。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string): string => readFileSync(path.join(REPO, rel), 'utf-8');

/**
 * 七条**会被模型读到**的授权路径。
 *
 * 前六条和 `question-form-type-parity.test.ts` 的 `PROMPT_PATHS` 逐条对应 ——
 * 那边守「类型清单齐不齐」,这边守「设计风格那一项撤干净没有」,两边共用同一份
 * 路径认知,少一条都会让这次下线漏出一个口子。
 *
 * 第七条是 `direction-picker` atom:它**不在** parity 那份清单里,却是这次下线
 * 真正的大头 —— 它被 `od-default`(默认设计路由)、`od-next-strategy`、
 * `od-new-generation`、`od-tune-collab`、`od-plugin-authoring` 五个官方场景挂在
 * `plan` 阶段,整段 SKILL.md 会被 `renderActiveStageBlock` 拼进系统提示词
 * (`apps/daemon/tests/prompts/core-slim.test.ts` 那条用例就是在断言这件事)。
 * 只改前六条、留着这一条,默认路由照旧会告诉模型「你可以出设计风格卡」。
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

describe('设计风格选择题已从提示词整题下线', () => {
  it('七条路径都还在,没有被悄悄挪走', () => {
    for (const { rel } of PROMPT_PATHS) {
      expect(() => read(rel), `${rel} 不见了 —— 挪动位置要同时更新本测试`).not.toThrow();
    }
  });

  it('没有一条路径再向模型提供 `direction-cards` 这个类型', () => {
    for (const { rel, reachable } of PROMPT_PATHS) {
      /*
       * 连**否定句**也不许留(「不要发 direction-cards」这种)。
       * 一句「不要用 X」同时也在告诉模型「有个 X 可以用」—— 产品要的是
       * 「不问了」,不是「问之前先想想」。这条对着裁决那句「让 agent 感知到
       * question-form 能出设计风格的那些提示词下掉」,感知本身就是要撤的东西。
       */
      expect(read(rel), `${rel}(${reachable})还在提 direction-cards`)
        .not.toMatch(/direction-cards/);
    }
  });

  it('没有一条路径再教 host 自带的视觉风格目录怎么用', () => {
    for (const { rel } of PROMPT_PATHS) {
      const src = read(rel);
      expect(src, `${rel} 还在教 host 风格目录`).not.toMatch(/visual-style catalog/i);
      expect(src, `${rel} 还在教 host 风格目录`).not.toMatch(/visual style catalog/i);
      expect(src, `${rel} 还在承诺 host 会给预览图`).not.toMatch(/preview (images|assets)/i);
    }
  });

  it('开场简报的示例表单里不再摆一道视觉风格题', () => {
    /*
     * `tone` 是第二个入口,而且比 `direction-cards` 更隐蔽:它长得像一道普通单选,
     * 渲染时却被 `QuestionForm.tsx` 的 `asksVisualDirection`(`q.id === 'tone'`)
     * 认走,换成整份风格目录。示例表单里摆着它,等于每一轮开场都在教模型问这道题。
     */
    for (const rel of [
      'apps/daemon/src/prompts/discovery.ts',
      'packages/contracts/src/prompts/discovery.ts',
    ]) {
      const src = read(rel);
      expect(src, `${rel} 的示例简报还带着 tone 那道题`).not.toMatch(/"id":\s*"tone"/);
      expect(src, `${rel} 还在别处点名 tone 这道题`).not.toMatch(/`tone`/);
    }
  });

  it('渲染器**仍然**认得 direction-cards —— 休眠件的安全网不许一起拆掉', () => {
    /*
     * 这一条从一开始就是绿的,它防的是**改过头**:有人顺手把类型从渲染器里也删掉。
     * 提示词撤了不等于线上不会再来 —— 缓存的旧提示词、别的客户端版本、模型自己
     * 记住的旧格式都可能发来 `direction-cards`。渲染路径必须继续认它,
     * 否则那道题会变成一块什么都没有的空白。产品原话也是「后续可能要找回」。
     */
    const src = read('apps/web/src/artifacts/question-form.ts');
    const union = /export type QuestionType =([\s\S]*?);/.exec(src);
    expect(union, 'QuestionType 联合类型抽不出来 —— 抽取逻辑坏了').toBeTruthy();
    expect(union![1], '渲染器把 direction-cards 也删了 —— 休眠件失去安全网')
      .toMatch(/'direction-cards'/);
  });
});
