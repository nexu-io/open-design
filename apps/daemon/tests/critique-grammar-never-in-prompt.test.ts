/**
 * 防第六次的那把锁(W17,2026-09-02)。
 *
 * 评审剧场的通信语法泄漏进聊天正文,到这一次是**第五次复发**。前四次都在补显示层的
 * 剥离器,而真正的源头一直开着:**一个功能有两个入口,下线时只关了一个。**
 *
 *   2026-06-21  #4454  `critique-theater` 的 atom + SKILL.md + 进默认 stage 列表,一起进来
 *   2026-07-18  #5829  「Do not emit prose outside the envelope」写进 SKILL.md
 *   2026-08-26  52131c2cf6  总闸关掉(`CRITIQUE_THEATER_RETIRED`)—— 只关了协议注入
 *                           (`renderPanelPrompt`),**没关 atom 那条路**
 *
 * 两条路在代码上没有任何关联,`isCritiqueEnabled()` 只被其中一处消费。于是:
 * `plugins/_official/atoms/critique-theater/SKILL.md` 的正文照旧被
 * `loadAtomBodies` → `renderActiveStageBlocks` 原样内联进系统提示词,标题叫
 * `## Active stage: critique`。模型被告知「Follow the daemon-injected tagged
 * protocol exactly」,却**永远拿不到那份协议**(它被闸关掉了)—— 于是它照着
 * SKILL.md 的英文散文**把语法现编了出来**。
 *
 * 编出来的东西和真协议逐项对不上,这正是"现编"的铁证:
 *   真协议 `<ROUND n="1">`            现场 `<ROUND index="1">`
 *   真协议 `role="designer"`/`a11y`   现场 `role="Designer"`/`"Accessibility"`
 *   真协议 `must_fix="K"`             现场 `openMustFix="3"`
 *   真协议 `<ROUND_END …>…</ROUND_END>` 现场自闭合 `<ROUND_END …/>`
 * 每一个属性名都能在 SKILL.md 的散文里找到出处。
 *
 * ── 这个文件为什么长这样 ──
 *
 * `critique-composer.test.ts` 早就断言过「关掉时不含 `<CRITIQUE_RUN`」。它一直是绿的,
 * 五次复发一次都没照出来 —— 因为它只喂 `renderPanelPrompt` 那条路,**不喂
 * `activeStageBlocks`**。等于证明了门是关的,而窗户开着。
 *
 * 所以这里断言的是**最终组装出来的系统提示词文本**,而且喂进去的是磁盘上**真实的**
 * scenario pipeline + 真实的 SKILL.md。判据不绑任何一条代码路径:将来任何新入口
 * 把这套语法塞回提示词,这里都会红。
 *
 * 禁用词表是**写死的字面量**,不复用 `CRITIQUE_GRAMMAR_TAGS` —— 复用等于拿实现当判据,
 * 实现漏了哪个标签,测试就跟着漏哪个。这个坑上一轮已经踩过一次(`MUSTFIX` 少了下划线)。
 */
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { renderActiveStageBlocks } from '@open-design/contracts';
import { composeSystemPrompt } from '../src/prompts/system.js';
import { atomsForPrompt, CRITIQUE_THEATER_ATOM_ID } from '../src/plugins/critique-prompt-gate.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * 一个都不许出现在系统提示词里。
 *
 * 前四条是线格式本身;最后一条是**收尾文案消失**的根因 —— 用户报「Done 8m 17s,
 * 回合外面一行文案都没有」,因为模型被这句话明确要求不许在 envelope 外写散文。
 */
const FORBIDDEN = [
  'CRITIQUE_RUN',
  'PANELIST',
  'ROUND_END',
  'MUST_FIX',
  'Do not emit prose outside the envelope',
] as const;

function assertNoTheaterGrammar(text: string, what: string): void {
  for (const needle of FORBIDDEN) {
    expect(text, `${what} 里出现了剧场语法:${needle}`).not.toContain(needle);
  }
}

/** 和 `loadAtomBodies` 同口径地剥掉 frontmatter —— 这里直接读盘,不经过 SQLite */
function stripFrontmatter(raw: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(raw);
  return (m ? raw.slice(m[0].length) : raw).trim();
}

/**
 * 读不到就当空 —— 和 `loadAtomBodies` 同口径(它对查不到的 atom 是 `continue`)。
 * pipeline 里有几个 atom(`file-write` / `live-artifact` / `media-*`)还没有自己的
 * SKILL.md 目录,那是正常状态,不是夹具坏了。
 */
async function readAtomBody(atomId: string): Promise<string> {
  const file = path.join(REPO_ROOT, 'plugins/_official/atoms', atomId, 'SKILL.md');
  try {
    return stripFrontmatter(await fsp.readFile(file, 'utf8'));
  } catch {
    return '';
  }
}

async function readScenarioStages(
  scenario: string,
): Promise<Array<{ id: string; atoms: string[] }>> {
  const file = path.join(REPO_ROOT, 'plugins/_official/scenarios', scenario, 'open-design.json');
  const manifest = JSON.parse(await fsp.readFile(file, 'utf8'));
  return manifest?.od?.pipeline?.stages ?? [];
}

/**
 * 复刻 `server.ts` 里 `activeStageBlocks` 的构建,唯一的区别是 atom body 直接读盘。
 * `critiqueEnabled` 就是 server 那边的 `critiqueShouldRun`。
 */
async function buildActiveStageBlocks(
  scenario: string,
  opts: { critiqueEnabled: boolean },
): Promise<string[]> {
  const stages = await readScenarioStages(scenario);
  expect(stages.length, `${scenario} 的 pipeline 读空了,夹具坏了`).toBeGreaterThan(0);
  const stageViews = [];
  for (const stage of stages) {
    const atoms = atomsForPrompt(stage.atoms ?? [], opts);
    const bodies = [];
    for (const atomId of atoms) {
      bodies.push({ atomId, body: await readAtomBody(atomId) });
    }
    stageViews.push({ stageId: stage.id, bodies });
  }
  return renderActiveStageBlocks(stageViews);
}

describe('评审剧场语法永远不许进系统提示词', () => {
  // 默认 scenario 覆盖了几乎每一次设计生成 run —— 用户中招的就是这条路
  for (const scenario of ['od-default', 'od-new-generation']) {
    it(`${scenario}:闸关着时,组装出来的系统提示词里一个剧场标签都没有`, async () => {
      const activeStageBlocks = await buildActiveStageBlocks(scenario, {
        critiqueEnabled: false,
      });
      // 先自证夹具是活的:块必须真的建出来了,否则这条断言什么都没测
      expect(activeStageBlocks.length).toBeGreaterThan(0);

      const prompt = composeSystemPrompt({ activeStageBlocks });
      assertNoTheaterGrammar(prompt, `${scenario} 的系统提示词`);
    });

    it(`${scenario}:闸关着时,critique-theater 的 body 压根不进 Active stage 块`, async () => {
      const blocks = await buildActiveStageBlocks(scenario, { critiqueEnabled: false });
      expect(blocks.join('\n')).not.toContain(CRITIQUE_THEATER_ATOM_ID);
    });
  }

  /*
   * 闸开着的那一半也要钉住。
   *
   * 规矩是「**协议注入了,body 才注入**」—— 两者必须同生同死。上一次出事正是因为
   * 它们能各走各的:body 在、协议不在,模型只好现编。
   */
  it('闸开着时 body 照常注入 —— 这个门不是「永远关闭」,是「跟着协议走」', async () => {
    const blocks = await buildActiveStageBlocks('od-new-generation', {
      critiqueEnabled: true,
    });
    expect(blocks.join('\n')).toContain(CRITIQUE_THEATER_ATOM_ID);
  });
});

describe('atomsForPrompt', () => {
  it('闸关着:摘掉 critique-theater,其它 atom 一个不动、顺序不变', () => {
    expect(
      atomsForPrompt(['todo-write', CRITIQUE_THEATER_ATOM_ID, 'file-write'], {
        critiqueEnabled: false,
      }),
    ).toEqual(['todo-write', 'file-write']);
  });

  it('闸开着:原样返回', () => {
    const atoms = ['todo-write', CRITIQUE_THEATER_ATOM_ID];
    expect(atomsForPrompt(atoms, { critiqueEnabled: true })).toEqual(atoms);
  });

  it('大小写不敏感 —— atom id 在 loadAtomBodies 里是按小写查的', () => {
    expect(atomsForPrompt(['Critique-Theater'], { critiqueEnabled: false })).toEqual([]);
  });

  it('没有 critique-theater 时返回同一个数组引用,不做无谓的拷贝', () => {
    const atoms = ['todo-write', 'file-write'];
    expect(atomsForPrompt(atoms, { critiqueEnabled: false })).toBe(atoms);
  });
});

describe('critique-theater 的 SKILL.md 本身', () => {
  /*
   * 第二道锁,和上面那条互相独立。
   *
   * 上面那条挡的是「body 进了提示词」;这条挡的是「body 里写着线格式」。任何一条单独
   * 成立都能拦住这次的事故 —— 但两条都要有:将来谁重新打开这个 stage(那是合法操作),
   * 只剩这一条在守着。
   */
  it('正文里不许拼出线格式,也不许有那句「不许写散文」', async () => {
    assertNoTheaterGrammar(
      await readAtomBody(CRITIQUE_THEATER_ATOM_ID),
      'critique-theater 的 SKILL.md',
    );
  });

  it('但它仍然要说清楚这一阶段要干什么 —— 不是把文件掏空', async () => {
    const body = await readAtomBody(CRITIQUE_THEATER_ATOM_ID);
    expect(body.length).toBeGreaterThan(200);
    expect(body).toMatch(/accessib/i);
  });
});
