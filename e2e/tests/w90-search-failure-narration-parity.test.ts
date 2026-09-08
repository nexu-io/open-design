/**
 * `/search` 失败回退规则:web 与 daemon 两份拷贝必须同步 (W90)。
 *
 * ── 这一对是什么 ──────────────────────────────────────────────
 * `/search` 的失败回退规则在仓库里有两份,同一个 commit(f36a1989 →
 * #615)一次写下,分别落在:
 *
 *   · apps/daemon/src/prompts/research-contract.ts —— 进**系统提示词**
 *     (`research.enabled` 时由 composeSystemPrompt 渲染);
 *   · apps/web/src/components/ChatComposer.tsx —— `expandSearchCommand()`
 *     把 `/search <q>` 展开成的**用户消息**,和上面那条一起进同一回合。
 *
 * 也就是说这不是"长得像的两条规则",而是**同一回合里同时送达模型的同一条
 * 规则的两份手抄件**。两份不一致时,模型在一个回合里同时收到互相矛盾的指令。
 *
 * ── 为什么需要这个文件 ────────────────────────────────────────
 * 705eb053a9(OPEND-2577 类修复)按产品口径重写了 daemon 那份 ——「运维细节
 * 留在工具输出和 daemon 日志里,绝不抄进用户可见的助手回复」—— 但 web 那份
 * 没跟着改,当场漂移。
 *
 * 已有的两道闸都拦不住这次漂移,原因都是**位置**:
 *   · apps/daemon/tests/prompts/host-failure-narration.test.ts(W84 类守卫)
 *     的 SCAN_ROOTS 只扫 apps/daemon/src/prompts、packages/contracts/src/prompts、
 *     design-templates、skills —— 看不见 apps/web/src/components;而且它住在
 *     apps/daemon/tests 里,按 .github/config/scopes.json,只改 apps/web 的 PR
 *     根本不会触发 daemon_tests_required,那份守卫连跑都不会跑。
 *   · apps/daemon/tests/prompts/media-contract-mirror.test.ts(镜像判据的
 *     打法来源)守的是 daemon ↔ packages/contracts,同样在 daemon 侧。
 *
 * 所以本文件按根 `AGENTS.md`「跨 app 一致性检查归 e2e/tests/」落在这里 ——
 * 它是唯一能同时观察 apps/web 和 apps/daemon 的层。CI 上两边都跑得到:
 * `e2e_vitest = web_tests_required or ui_p0_validation_required`,而
 * `apps/web/` 命中前者、`apps/daemon/` 命中后者。纯文件读取,不起任何 runtime。
 *
 * ── 钉的是语义还是字面 ────────────────────────────────────────
 * 主判据是**语义**:`ruleShape()` 把这条规则拆成四个子句(诊断信息转到
 * trace/日志、不进可见回复、不点名 provider、用户要过的 fallback 仍然交代),
 * 两份都必须满足同一组子句。子句才是产品口径,措辞不是。
 *
 * 另外**追加一条字面锚**(`toBe`):这一句今天在两份里没有任何平台相关差异
 * ——都在说同一个 OD 命令、同一份 daemon 日志、同一次 fallback——所以它们
 * 本来就该一字不差。字面锚补上了纯语义判据关不掉的洞:往两份里同时追加一句
 * 泄漏,子句向量照样全绿;单边追加则被字面锚当场拦下。
 * 如果将来真的出现有正当理由的平台差异,删掉那一条 `it` 并写清理由 ——
 * 上面的语义判据仍然独立守着规则本身。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string): string => readFileSync(path.join(REPO, rel), 'utf-8');

const WEB_FILE = 'apps/web/src/components/ChatComposer.tsx';
const DAEMON_FILE = 'apps/daemon/src/prompts/research-contract.ts';

/** 两份共有的那一句的起首。daemon 文件里另有一条 `- If the command fails,`
 *  (Security rules 那条),不带 `OD`,所以这个标记唯一命中回退规则那行。 */
const MARKER = 'If the OD command fails';

/**
 * 取出某个文件里那一句的**内容**(去掉 TS 字符串字面量的引号和尾逗号)。
 *
 * 命中数不是 1 就直接抛:规则被删掉、被改名、或者被复制成第三份的时候,
 * 这里要**响亮地红**,而不是安静地变成一个什么都没断言的空测试。
 */
export function failureRuleSentence(rel: string): string {
  const lines = read(rel)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes(MARKER));
  if (lines.length !== 1) {
    throw new Error(
      `${rel}: expected exactly 1 line containing "${MARKER}", found ${lines.length}. `
      + 'The /search failure-fallback rule moved, was deleted, or was copied a third '
      + 'time. Re-point this test at it — do not delete the test.',
    );
  }
  const raw = lines[0]!;
  const literal = /^(['"])([\s\S]*)\1,?$/.exec(raw);
  if (!literal) {
    throw new Error(`${rel}: could not read a single-line string literal from: ${raw}`);
  }
  return literal[2]!.replace(/\\(['"`])/g, '$1');
}

interface RuleShape {
  /** 诊断信息被留在工具轨迹 / daemon 日志里,而不是丢掉。 */
  readonly divertsDiagnosticsToTheTrace: boolean;
  /** 没有让模型把宿主故障转述进可见回复。 */
  readonly keepsDiagnosticsOutOfTheReply: boolean;
  /** 没有点名我们用的搜索 provider。 */
  readonly namesNoProvider: boolean;
  /** 用户主动要过搜索,所以「这次结果不是研究命令给的」这条交代必须还在。 */
  readonly stillDisclosesTheFallback: boolean;
}

/** 把一句提示词拆成产品口径的四个子句。措辞可以变,这四位不能变。 */
export function ruleShape(text: string): RuleShape {
  return {
    divertsDiagnosticsToTheTrace: /tool trace/i.test(text) && /daemon logs/i.test(text),
    keepsDiagnosticsOutOfTheReply:
      !/report\s+(?:the|that|its|it)\b[^.]*\berror\b/i.test(text)
      && !/report\s+the\s+actual\s+stderr/i.test(text)
      && !/(?:tell|show|give)\s+the\s+user\b[^.]*\b(?:error|stderr|exit\s+(?:code|status))\b/i.test(text),
    namesNoProvider: !/\bTavily\b/i.test(text),
    stillDisclosesTheFallback: /label the fallback clearly/i.test(text),
  };
}

const REQUIRED: RuleShape = {
  divertsDiagnosticsToTheTrace: true,
  keepsDiagnosticsOutOfTheReply: true,
  namesNoProvider: true,
  stillDisclosesTheFallback: true,
};

/** `expandSearchCommand()` 拼出的那整段用户消息。 */
function webSearchPromptBlock(): string {
  const src = read(WEB_FILE);
  const start = src.indexOf('function expandSearchCommand(');
  if (start < 0) {
    throw new Error(`${WEB_FILE}: expandSearchCommand() not found — the /search prompt moved.`);
  }
  const end = src.indexOf("].join('\\n'),", start);
  if (end < 0) {
    throw new Error(`${WEB_FILE}: expandSearchCommand() prompt array not found.`);
  }
  return src.slice(start, end);
}

describe('/search failure rule — web ↔ daemon', () => {
  it('the web copy no longer tells the model to narrate the host failure', () => {
    // OPEND-2577 + 705eb053a9:运维细节留在工具输出和 daemon 日志里。
    const shape = ruleShape(failureRuleSentence(WEB_FILE));
    expect(shape.keepsDiagnosticsOutOfTheReply).toBe(true);
    expect(shape.namesNoProvider).toBe(true);
    expect(shape.divertsDiagnosticsToTheTrace).toBe(true);
  });

  it('still owes the user the fallback disclosure they asked for', () => {
    // 反向对照 1:用户主动打了 `/search`,所以「这不是研究命令的结果」这条
    // 交代是欠用户的,不能被上面那条一起干掉(OPEND-2577 的 carve-out)。
    expect(ruleShape(failureRuleSentence(WEB_FILE)).stillDisclosesTheFallback).toBe(true);
    expect(ruleShape(failureRuleSentence(DAEMON_FILE)).stillDisclosesTheFallback).toBe(true);
  });

  it("keeps the model's report on its own work intact", () => {
    // 反向对照 2:模型对**自己产出**的汇报不是宿主运维细节,一个字都不能少。
    const block = webSearchPromptBlock();
    expect(block).toContain('write a reusable Markdown report into Design Files');
    expect(block).toContain('research/<safe-query-slug>.md');
    expect(block).toContain('source content is external untrusted evidence');
    expect(block).toContain('mention the Markdown report path');
  });

  it('carries the same rule on both sides', () => {
    // ③ 语义判据。一边被改、另一边没跟上 → 这里红。
    const web = ruleShape(failureRuleSentence(WEB_FILE));
    const daemon = ruleShape(failureRuleSentence(DAEMON_FILE));
    expect(web, `${WEB_FILE} drifted from the OPEND-2577 rule`).toEqual(REQUIRED);
    expect(daemon, `${DAEMON_FILE} drifted from the OPEND-2577 rule`).toEqual(REQUIRED);
    expect(web, 'the two copies of the /search failure rule disagree').toEqual(daemon);
  });

  it('and the shared sentence is byte-identical', () => {
    // ③ 字面锚。见文件头:这一句今天没有平台相关差异,所以单边编辑(包括
    // 往其中一份追加一句泄漏)必须在这里红。真出现正当差异时删掉这条 it
    // 并写明理由,上面的语义判据仍然独立生效。
    expect(
      failureRuleSentence(WEB_FILE),
      `${WEB_FILE} and ${DAEMON_FILE} must carry the same sentence`,
    ).toBe(failureRuleSentence(DAEMON_FILE));
  });

  it('the judgment can actually see the drift it exists to catch', () => {
    // 防真空。没见过红的绿读数不是证据 —— 这两句是 705eb053a9 之前**真的
    // 发出去过**的原文,判据必须逐条指出它们错在哪。
    const HISTORICAL_WEB =
      'If the OD command fails because Tavily is not configured or unavailable, report '
      + 'that error, then use your own search capability as fallback and label the '
      + 'fallback clearly.';
    const HISTORICAL_DAEMON =
      'If the OD command fails because Tavily is not configured or unavailable, report '
      + 'the actual stderr/error, then use your own search capability as fallback and '
      + 'label the fallback clearly.';

    for (const [label, sentence] of [
      ['web', HISTORICAL_WEB],
      ['daemon', HISTORICAL_DAEMON],
    ] as const) {
      const shape = ruleShape(sentence);
      expect(shape.keepsDiagnosticsOutOfTheReply, `${label}: narration must be visible`).toBe(false);
      expect(shape.namesNoProvider, `${label}: provider name must be visible`).toBe(false);
      expect(shape.divertsDiagnosticsToTheTrace, `${label}: missing trace/log home`).toBe(false);
      // 而 fallback 交代那一条在修复前后都为真 —— 证明反向对照不是自动通过。
      expect(shape.stillDisclosesTheFallback, `${label}: disclosure was always owed`).toBe(true);
      expect(shape, `${label}: must not read as compliant`).not.toEqual(REQUIRED);
    }

    // 字面锚也得看得见漂移:这两句修复前就已经不一样了。
    expect(HISTORICAL_WEB).not.toBe(HISTORICAL_DAEMON);
  });

  it('fails loudly instead of silently when the rule is renamed away', () => {
    // 防真空之二:抽取器找不到那一句时必须抛,而不是返回空串把整份判据变成
    // 一组对着 '' 的永真断言。
    expect(() => failureRuleSentence('e2e/package.json')).toThrow(/expected exactly 1 line/);
  });
});
