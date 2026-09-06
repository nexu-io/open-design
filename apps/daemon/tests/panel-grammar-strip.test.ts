import assert from 'node:assert/strict';
import { test } from 'vitest';

import {
  createPanelGrammarStripper,
  strippingConsumedTheWholeFrame,
} from '../src/panel-grammar-strip.js';

/**
 * 红测:评审剧场的通信语法**永远不许进可见正文**。
 *
 * 用户在真实客户端里连着撞到四次 `<CRITIQUE_RUN>` / `<PANELIST role="Critic" score="9.0">`
 * / `<ROUND_END …/>` 原样打在回答里。总闸已经关掉(`critique/rollout.ts`),但那只挡住
 * 「我们主动注入」这一条路 —— 注入源至今没查清,所以可见文本路径上必须有兜底。
 *
 * 同时要满足用户的另一条硬要求:**不能先闪出半截 `<PANEL` 再突然消失**。
 */
function make() {
  const s = createPanelGrammarStripper();
  return s;
}

test('整块协议被吃掉,只留下人话', () => {
  const s = make();
  const out = s.strip('<CRITIQUE_RUN>\n<ROUND index="1">\n<PANELIST role="Designer">已完成初稿。</PANELIST>\n</ROUND>\n</CRITIQUE_RUN>\n收工。');
  assert.equal(out.includes('<CRITIQUE_RUN>'), false);
  assert.equal(out.includes('<PANELIST'), false);
  assert.equal(out.includes('</ROUND>'), false);
  assert.equal(out.includes('已完成初稿。'), true);
  assert.equal(out.includes('收工。'), true);
});

test('自闭合的 ROUND_END 也吃掉', () => {
  const s = make();
  assert.equal(s.strip('<ROUND_END decision="revise" composite="8.88"/>后续。').trim(), '后续。');
});

/**
 * 样本逐字取自真实录制 `.od/runs/81e03cea-…/events.jsonl` 的一条 `text_delta`。
 *
 * 之前这条测试写的是 `<MUSTFIX>`(没有下划线)—— 那个拼法在真实数据里
 * **一次都没出现过**,它是照着 `CRITIQUE_INLINE_TAGS` 里的笔误写的,
 * 于是测试和实现一起错,红不起来。真实语法是 `MUST_FIX`:
 * prompt 在 `src/prompts/panel.ts`,解析器在 `src/critique/parsers/v1.ts`
 * (`MUST_FIX_RE`),fixtures 也全是 `MUST_FIX`。
 */
const REAL_DELTA = '<PANELIST role="Critic" score="8.4"><MUST_FIX id="R1-C1">移除标题与引语的强制换行，避免窄屏孤行。</MUST_FIX></PANELIST>';

test('MUST_FIX / RESOLVED 这类内联标记只脱壳,留住里面的话', () => {
  const s = make();
  const out = s.strip(REAL_DELTA);
  assert.equal(out.includes('<MUST_FIX'), false);
  assert.equal(out.includes('</MUST_FIX'), false);
  // 属性碎片也不许剩
  assert.equal(out.includes('id="R1-C1"'), false);
  assert.equal(out.includes('移除标题与引语的强制换行'), true);
});

test('MUST_FIX 被流式切成两半:既不闪半截,也要剥干净', () => {
  const s = make();
  // 切在标签名中间 —— 下划线正好落在第二片里
  const first = s.strip('先说一句。<MUST');
  assert.equal(first, '先说一句。');
  assert.equal(first.includes('<MUST'), false);

  const second = s.strip('_FIX id="R1-C1">移除强制换行。</MUST_FIX>收工。');
  assert.equal(second.includes('<MUST_FIX'), false);
  assert.equal(second.includes('MUST'), false);
  assert.equal(second.includes('移除强制换行。'), true);
  assert.equal(second.includes('收工。'), true);
  assert.equal(s.flush(), '');
});

test('被流式切成两半:半截标签一个字都不许露出来', () => {
  const s = make();
  assert.equal(s.strip('先说一句。<PANE'), '先说一句。');
  assert.equal(s.strip('LIST role="Critic">很好。</PANELIST>'), '很好。');
  assert.equal(s.flush(), '');
});

/*
 * 正面对照 —— 防的是「凡是尖括号一律删掉」这种糊弄式修法。
 * 少了这一条,把 TAG_RE 换成 `/<[^>]*>/g` 也能让上面那几条变绿。
 */
test('长得像但不是的东西不动它', () => {
  const s = make();
  const text = '这是 <PANELISTS> 和 <ROUNDABOUT> 还有 <MUST_FIXED> 以及普通的 <div>。'
    + '正文里裸写 MUST_FIX 这个词(没有尖括号)也要留着,还有 a<b、5 < 7。';
  assert.equal(s.strip(text), text);
  assert.equal(s.flush(), '');
});

test('flush 会把攒着的半截原样吐出来 —— 不吞用户的字', () => {
  const s = make();
  // 只扣住那个可能是标记开头的 `<`,它前面的字立刻放行(不必要的憋住也是一种闪)
  assert.equal(s.strip('结尾就一个 <'), '结尾就一个 ');
  assert.equal(s.flush(), '<');
});

test('攒着的半截最终不是标记时,原样接回去', () => {
  const s = make();
  assert.equal(s.strip('看这个 <PANE'), '看这个 ');
  // 下一帧证明它不是标记
  assert.equal(s.strip('L 是什么?'), '<PANEL 是什么?');
  assert.equal(s.flush(), '');
});

/**
 * 现场逐字取自用户 2026-09-02 的 codex run(W17)。
 *
 * 这一段是**第五次**复发的原件。前四次的兜底之所以没拦住,是因为所有测试都只把
 * 标记切在**标签名**里(`<PANE` / `<MUST`),而 codex 的出厂传输是 app-server
 * (`defs/codex.ts` 的 `codexTransportPreference`,不设 `OD_CODEX_TRANSPORT` 即是它),
 * 它按 **token** 推 `item/agentMessage/delta` —— 边界会落在**属性中间**。
 *
 * 认这条现场的抓手:漏出来的**全是带属性的开标签,一个 `</PANELIST>` 都没有**。
 * 闭合标签没属性,切在名字里能被扣住;带属性的一进属性就撒手了。
 */
const REAL_LEAK = [
  '<ROUND index="1">',
  '<PANELIST role="Designer">',
  "I'm using the Kami Parchment Document skill to shape a responsive layout.",
  '</PANELIST>',
  '<PANELIST role="Accessibility" score="7.9">',
  'Touch targets, focus rings, dialog labels, and contrast are strong.',
  '</PANELIST>',
  '<ROUND_END decision="revise" composite="8.3" openMustFix="3"/>',
  '收工:文件已写好。',
].join('\n');

/** 按 token 粒度切片 —— app-server 的真实形态,不是构造出来的坏运气 */
function tokenChunks(text: string, size: number): string[] {
  return text.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g')) ?? [];
}

function stripAll(chunks: readonly string[]): string {
  const s = make();
  let out = '';
  for (const c of chunks) out += s.strip(c);
  return out + s.flush();
}

test('逐 token 切片:带属性的标记一个都不许露出来(W17 现场原件)', () => {
  // 8 是随手取的 token 粒度;下面那条对 1..24 全扫一遍,证明不是挑出来的巧合
  const out = stripAll(tokenChunks(REAL_LEAK, 8));
  assert.equal(out.includes('<ROUND'), false);
  assert.equal(out.includes('<PANELIST'), false);
  assert.equal(out.includes('<ROUND_END'), false);
  // 属性碎片也不许剩
  assert.equal(out.includes('role='), false);
  assert.equal(out.includes('composite='), false);
  assert.equal(out.includes('openMustFix='), false);
  // 人话一个字都不能少
  assert.equal(out.includes('Kami Parchment Document'), true);
  assert.equal(out.includes('Touch targets, focus rings'), true);
  assert.equal(out.includes('收工:文件已写好。'), true);
});

test('切片粒度从 1 到 24 全扫:没有一种切法能漏出标记', () => {
  for (let size = 1; size <= 24; size++) {
    const out = stripAll(tokenChunks(REAL_LEAK, size));
    assert.equal(out.includes('<ROUND'), false, `size=${size} 漏了 <ROUND`);
    assert.equal(out.includes('<PANELIST'), false, `size=${size} 漏了 <PANELIST`);
    assert.equal(out.includes('收工:文件已写好。'), true, `size=${size} 吞了正文`);
  }
});

test('最小复现:切在属性中间', () => {
  assert.equal(stripAll(['<ROUND ind', 'ex="1">正文']), '正文');
  assert.equal(stripAll(['<PANELIST ', 'role="Critic" score="8.1">很好。</PANELIST>']), '很好。');
  assert.equal(stripAll(['<ROUND_END dec', 'ision="revise"/>收尾。']), '收尾。');
});

/*
 * 反向对照 —— 防的是「见 `<` 就一路憋到 `>`」这种糊弄式修法。
 * 名字不是标记时必须**立刻**放行,憋住本身就是一种闪。
 */
test('不是标记的尖括号:该放行就放行,不许憋住', () => {
  assert.equal(stripAll(['<PANELISTS role="x">留着']), '<PANELISTS role="x">留着');
  assert.equal(stripAll(['<div class="a">正文</div>']), '<div class="a">正文</div>');
  assert.equal(stripAll(['5 < 7 且 a', '<b 都要留着']), '5 < 7 且 a<b 都要留着');
});

test('属性长到离谱时放行,不许把正文永远吞掉', () => {
  const monster = `<PANELIST ${'x'.repeat(400)}="1">`;
  const out = stripAll([monster, '后面的正文。']);
  // 超过 MAX_HOLD 就放行(fail-open)—— 宁可漏一个畸形标记,也不许吞用户的字
  assert.equal(out.includes('后面的正文。'), true);
});

/*
 * W102(2026-09-03):「**原本就空**」和「**剥完变空**」必须分得开。
 *
 * 分不开的后果不是少剥一点标记,而是**整个 claude 家族的思考帧被 100% 丢掉** ——
 * 它的思考帧正文出厂就是空串(真 CLI 实测两个模型各一轮),
 * `strip('')` 也返回空串,写成 `if (!visible)` 两者就是同一件事。
 */
test('W102 · 上游本来就是空串 —— 不算被剥掉,照发', () => {
  const s = make();
  // claude 的真实形态:content_block_delta 的 delta.thinking 就是 ''
  assert.equal(strippingConsumedTheWholeFrame('', s.strip('')), false);
});

test('W102 · 送了字符、剥完一个不剩 —— 整帧扔掉', () => {
  const s = make();
  const raw = '<PANELIST role="Critic" score="8.1">';
  assert.equal(strippingConsumedTheWholeFrame(raw, s.strip(raw)), true);
});

test('W102 · 半截标记被攒在缓冲里也算整帧被吃掉', () => {
  const s = make();
  const raw = '<PANELIST role=';
  assert.equal(s.strip(raw), '');
  assert.equal(strippingConsumedTheWholeFrame(raw, ''), true);
});

test('W102 · 正常思考正文、纯空白都不算被吃掉', () => {
  const s = make();
  assert.equal(strippingConsumedTheWholeFrame('在想第二步。', s.strip('在想第二步。')), false);
  // 空白不是"没有字符":换行照样是模型写下来的东西,不许当标记扔
  assert.equal(strippingConsumedTheWholeFrame('\n', s.strip('\n')), false);
});
