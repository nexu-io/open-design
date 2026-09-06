/**
 * 接缝层的圆角别名必须**配齐**,而且亮暗两个作用域各写一份。
 *
 * ## 这一条要挡的是什么
 *
 * `ChatRoot.module.css` 是 chat 面板的接缝层:稿子的每一个 token 在这里换成
 * 产品自己的 token,组件只认 `--chat-*` 这一层。约定写在那份文件里 ——
 * 「接缝的约定是每条声明在亮暗两个作用域都要写,即使暂时同值」。
 *
 * 圆角这一族出过一个**不会报错的洞**:组件写的是
 *
 *   border-radius: var(--chat-radius-2xl, var(--radius-2xl));
 *
 * 别名没定义时,`var()` 静静地走 fallback,画出来的圆角和定义了别名一模一样 ——
 * **一个像素都不差,所以任何量计算值的测试都照不出来**。代价是接缝被绕过去了:
 * 哪天要把 chat 面板的 2xl 和全站的 2xl 分开(接缝层存在的全部理由),
 * 改接缝层不会生效,得挨个去改组件。
 *
 * 洞还在扩大:吃 fallback 的消费方已经从 2 个涨到 3 个
 * (`RunErrorCard` / `UpgradeCard` / `SupportDialog`)。
 *
 * ## 判据
 *
 * 不量像素(量不出来,见上),量的是**接缝契约**本身:
 *   ① `src/**\/*.css` 里被消费的每一个 `--chat-radius-*`,
 *   ② 在接缝的**亮色**作用域里有定义,
 *   ③ 在接缝的**暗色**作用域里也有定义 —— 只补一处就是暗色下继续吃 fallback。
 *
 * 第 ① 步先断言消费方非空:消费方被删光时这份检查会退化成一句空话,
 * 那种绿是假的。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../../src');
const SEAM_PATH = resolve(SRC, 'components/chat/ChatRoot.module.css');

const decomment = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const SEAM = decomment(readFileSync(SEAM_PATH, 'utf-8'));
const TOKENS_CSS = decomment(readFileSync(resolve(SRC, 'styles/tokens.css'), 'utf-8'));

/**
 * 稿子那一档圆角的**字面值** —— 验收判据是「算出来的和稿子逐字节相同」,
 * 不是「用了某支 token」。出处
 * `361b78253e:docs/design/chat-panel/src/tokens.css`(稿子 tokens 三版 md5 相同):
 *   :114  --radius-2xlarge: 16px;
 *   :125  --radius-2xl: var(--radius-2xlarge);
 */
const DESIGN_RADIUS_2XL = '16px';

/** 顶层规则:`选择器 { 声明 }`。接缝层没有嵌套,所以这一刀够用。 */
function blocks(css: string): Array<{ selector: string; body: string }> {
  return Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g)).map((m) => ({
    selector: (m[1] ?? '').trim().replace(/\s+/g, ' '),
    body: m[2] ?? '',
  }));
}

const SEAM_BLOCKS = blocks(SEAM);

function scope(what: 'light' | 'dark'): string {
  const hit = SEAM_BLOCKS.find((b) =>
    what === 'dark'
      ? b.selector.includes("data-theme='dark'")
      : b.selector.startsWith('.vars,') && !b.selector.includes('data-theme'),
  );
  if (!hit) throw new Error(`接缝层里找不到${what === 'dark' ? '暗' : '亮'}色作用域那条规则`);
  return hit.body;
}

const LIGHT = scope('light');
const DARK = scope('dark');

const declares = (body: string, name: string) =>
  new RegExp(`(^|[;\\s])${name}\\s*:`).test(body);

/** `src` 下所有样式表 —— 全局的和 CSS Module 的都算,消费方两边都有。 */
function everyStylesheet(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) everyStylesheet(full, out);
    else if (entry.name.endsWith('.css')) out.push(full);
  }
  return out;
}

/** 被消费的 `--chat-radius-*` → 消费它的文件(相对 `src`)。 */
const consumers = new Map<string, string[]>();
for (const file of everyStylesheet(SRC)) {
  if (file === SEAM_PATH) continue;
  const css = decomment(readFileSync(file, 'utf-8'));
  for (const m of css.matchAll(/var\(\s*(--chat-radius-[\w-]+)/g)) {
    const list = consumers.get(m[1]!) ?? [];
    list.push(file.slice(SRC.length + 1));
    consumers.set(m[1]!, list);
  }
}

/** 亮色 `:root` 的 token 表,够解一层 `var()` 链。 */
function rootTokens(): Map<string, string> {
  const out = new Map<string, string>();
  const root = /:root\s*\{([\s\S]*?)\}/.exec(TOKENS_CSS);
  for (const decl of (root?.[1] ?? '').split(';')) {
    const m = /^\s*(--[\w-]+)\s*:\s*([\s\S]+)$/.exec(decl);
    if (m) out.set(m[1]!, m[2]!.trim());
  }
  return out;
}

function deref(value: string, map: Map<string, string>, depth = 0): string {
  if (depth > 8) return value;
  return value.replace(/var\(\s*(--[\w-]+)\s*\)/g, (whole, name: string) => {
    const hit = map.get(name);
    return hit != null ? deref(hit, map, depth + 1) : whole;
  });
}

describe('接缝层 · 圆角别名', () => {
  it('先证明这把尺子看得见「没定义」', () => {
    // 定义过的读得出来,没定义的读不出来 —— 两边都验,免得正则写成恒真/恒假
    expect(declares(LIGHT, '--chat-radius-lg')).toBe(true);
    expect(declares(DARK, '--chat-radius-lg')).toBe(true);
    expect(declares(LIGHT, '--chat-radius-lg-nonexistent')).toBe(false);
    // 前缀不能算数:`--chat-radius` 是另一个别名,不该把 `--chat-radius-2xl` 认成它
    expect(declares(LIGHT, '--chat-radius')).toBe(true);
  });

  it('确实有组件在消费圆角别名(不是拿一张空表冒充绿)', () => {
    expect(consumers.size).toBeGreaterThan(0);
    expect([...consumers.keys()]).toContain('--chat-radius-2xl');
  });

  it('每个被消费的圆角别名都在亮色作用域有定义', () => {
    const missing = [...consumers.entries()]
      .filter(([name]) => !declares(LIGHT, name))
      .map(([name, files]) => `${name}(消费方:${files.join(', ')})`);
    expect(missing, '别名没定义时 var() 会静静走 fallback —— 画面一样,接缝被绕过去了').toEqual(
      [],
    );
  });

  it('每个被消费的圆角别名在暗色作用域也有定义', () => {
    const missing = [...consumers.entries()]
      .filter(([name]) => !declares(DARK, name))
      .map(([name, files]) => `${name}(消费方:${files.join(', ')})`);
    expect(missing, '只补亮色那一处,暗色下就继续吃 fallback').toEqual([]);
  });

  it('别名的值和消费方的 fallback 同源 —— 补上别名不改画面', () => {
    for (const body of [LIGHT, DARK]) {
      expect(body).toMatch(/--chat-radius-2xl:\s*var\(--radius-2xl\)/);
    }
  });

  it('两个作用域解出来都逐字节等于稿子的 16px', () => {
    const map = rootTokens();
    // 先证明这把解析器解得动一条已知的 var 链(不然下面两条可能是空过)
    expect(deref('var(--radius-2xl)', map), '连 --radius-2xl 都解不出来,解析器没对准').toBe(
      DESIGN_RADIUS_2XL,
    );
    for (const [name, body] of [['亮色', LIGHT], ['暗色', DARK]] as const) {
      const decl = new RegExp('--chat-radius-2xl:\\s*([^;]+);').exec(body);
      expect(decl, `${name}作用域里没有 --chat-radius-2xl`).not.toBeNull();
      expect(deref(decl![1]!.trim(), map), `${name}作用域解出来的圆角和稿子对不上`).toBe(
        DESIGN_RADIUS_2XL,
      );
    }
  });
});
