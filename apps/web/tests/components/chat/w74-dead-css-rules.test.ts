/**
 * 两条**没有任何 DOM 会命中**的全局规则(已删)—— 删之前先把「它是死的」钉住。
 *
 * 打法照搬 `queue-dead-rules.test.tsx`:不靠读代码判死,而是把「类名从哪来」这件事
 * 落成可执行的判据 —— 扫遍 `src/` 下每一个 `.ts` / `.tsx`,类名可能从任何一个文件里
 * 直接写出、拼出来、或者经 CSS Module 的驼峰形式发出去,一个形态都不放过。
 *
 * ⚠️ **防真空**:同一把尺子必须在几个**确定活着**的类名上命中(见 `LIVE`)。
 * 少了这一节,「零命中」可以靠「扫描器本身坏了 / 根本没读到文件」通过 ——
 * 那是一条永真的断言,比没有测试更糟。
 *
 * ── ① `.assistant-stats` ─────────────────────────────────────────────
 * `styles/viewer/routines.css` 的 `.app .assistant-footer .assistant-stats`
 * (12px / `--text-muted`)是一条**覆盖**规则,压的是 `styles/viewer/composio.css`
 * 里的同名基规则。两条都活不了:`.assistant-footer` 这个壳**是**真在渲染的
 * (`AssistantMessage.tsx` / `ProjectCreationPendingView.tsx`,见下面的正面对照),
 * 可它里面从来没有挂过 `assistant-stats` 的孩子 —— 壳在、孩子不在,
 * 所以后代选择器永远配不上。
 *
 * 只删了 `routines.css` 那条**覆盖**。基规则在 `composio.css`,那份文件这一轮
 * 归另一组(W73)改,不越界动它 —— 它同样是死的,已单独上报。
 *
 * ── ② `.run-error__desc` / `.run-error__details` ─────────────────────
 * `styles/chat.css`。运行失败卡在 `38aa03bff4`(feat(chat): rebuild the chat panel
 * against the delivered design)那次重写里换成了 CSS Module:今天画这张卡的是
 * `components/chat/RunErrorCard.tsx`,用的是 `styles.description` 这类**哈希后**的
 * 类名 + `data-testid="chat-run-error-description"`,BEM 那一套全局类名一个都不再上 DOM。
 *
 * ⚠️ **同一族的 `.run-error__description` 故意留着,没删。** 它在 `src/` 里同样零命中,
 * 但 `e2e/ui/project-management-flows.test.ts:2383` 还拿 `page.locator('.run-error__description')`
 * 当断言锚点 —— 那条 e2e 是上面那次重写的漏网之鱼(选择器没跟着迁到 `data-testid`)。
 * 归属和修法要先有人拍板,所以这一轮不动它,也不在这里钉「零命中」。
 * (Playwright 的 locator 认的是 DOM 上的 class,不认样式表里有没有这条规则,
 *  所以删掉它旁边这两条对那个 e2e 没有任何影响。)
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(HERE, '../../..');
const SRC = resolve(WEB, 'src');

/** `src/` 下所有 TS / TSX —— 类名可能从任何一个文件里拼出来。 */
function everySource(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) everySource(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const SOURCES = everySource(SRC).map((path) => ({ path, text: readFileSync(path, 'utf-8') }));

/**
 * 一个类名的**全部产地**:直接字符串 / 模板拼接里的字面片段,加上 CSS Module
 * 发出去时的驼峰形式(`run-error__desc` → `runErrorDesc`,`.doc .nm` 这类
 * 后代选择器则逐段查)。命中就返回文件名,方便红的时候一眼看见是谁在用。
 */
function producersOf(token: string): string[] {
  const camel = token.replace(/[-_]+([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  const needles = [token, camel];
  return SOURCES
    .filter(({ text }) => needles.some((n) => text.includes(n)))
    .map(({ path }) => path.slice(WEB.length + 1));
}

/* ── 正面对照:这把尺子确实能找到东西 ──────────────────────────────── */
const LIVE = [
  /* `.assistant-footer` 这个壳是活的 —— 死的只是它那个从不存在的 `stats` 孩子 */
  'assistant-footer',
  /* 文档产物卡:`FileOpsSummary.tsx` 真在渲染,还有两份测试钉着 */
  'artifact-card-doc-name',
  /* 运行失败卡今天真正在用的钩子 */
  'chat-run-error-description',
] as const;

/* ── 判定为死的类名 ────────────────────────────────────────────────── */
const DEAD = ['assistant-stats', 'run-error__desc', 'run-error__details'] as const;

const read = (p: string): string => readFileSync(resolve(WEB, p), 'utf-8');

describe('W74:删掉的全局规则确实没有 DOM 会命中', () => {
  it('防真空:同一把尺子在确定活着的类名上必须命中', () => {
    expect(SOURCES.length, '一个源文件都没扫到 —— 尺子坏了,下面的零命中全是假的').toBeGreaterThan(200);
    for (const token of LIVE) {
      expect(producersOf(token), `\`${token}\` 扫不到产地 —— 扫描器坏了`).not.toHaveLength(0);
    }
  });

  it('这几个类名在 src/ 里零命中:没有任何 tsx 会把它挂上 DOM', () => {
    for (const token of DEAD) {
      expect(producersOf(token), `\`${token}\` 又有人在用了,别当死代码删`).toHaveLength(0);
    }
  });

  /**
   * 查的是**规则声明**(`.名字 {`),不是这个词在文件里出现过没有 —— 删掉的位置各自
   * 留了一段说明,里面照旧写着这几个名字。拿裸词查会把说明本身当成「还没删」。
   */
  it('规则本身也从各自的样式表里清掉了', () => {
    expect(read('src/styles/viewer/routines.css')).not.toContain('.assistant-stats {');
    const chat = read('src/styles/chat.css');
    expect(chat).not.toContain('.run-error__desc {');
    expect(chat).not.toContain('.run-error__details {');
    /* 同族里**故意留着**的那一条(见文件头):它还被一条 e2e 当锚点,没人拍板前不动 */
    expect(chat, '`.run-error__description` 被顺手删了 —— 它归属未定,见文件头').toContain('.run-error__description {');
  });
});
