/**
 * chat 面板里**全屏遮罩类浮层**的层级 —— 一条按目录扫描的守护,不是钉死某个文件。
 *
 * ## 这条守护为什么要一般化
 *
 * 它的前身是 `support-dialog-layer.test.ts`,只读 `SupportDialog.module.css` 一个文件。
 * 于是 `AmrOwnerTopUpDialog`(OPEND-2722,团队成员额度不足时「找所有者充值」)
 * 带着 `z-index: 40` 从头到尾没人拦 —— 和 `SupportDialog` 2026-08-27 被报的
 * **逐字同一个缺陷**:弹窗画得出来,但输入框和右上角那簇从遮罩里穿出来照常亮着。
 * 一个守护只守一个文件,下一个新建的弹窗照样漏。所以这里改成按目录发现。
 *
 * ## 真机量到的层号(`elementFromPoint` 逐点探)
 *
 *   右上角 star / 额度胶囊  `.entry-top-right-cluster`   **z = 150**
 *   输入框固定层            `.chat-composer-fixed-layer` **z = 45**
 *
 * 右上角那 150 在样式表里**查不到** —— `.entry-top-right-cluster` 自己没写
 * `z-index`,150 是它所在层叠上下文的实测值。所以这条判据只能是真机常数,
 * 出处就是这里,别去 grep。
 *
 * ## 档位判据:和同侪模态对齐,不自立一个新数字
 *
 * 聊天区另一个真模态 `.staged-preview-modal` 是 1200,`SupportDialog` 落在 1500。
 * 判据写成「不低于同侪模态那一档」而不是「等于某个数」:写死一个 151 之类
 * 刚好够用的数字,会在下一个人抬高某层 chrome 时再坏一次。
 *
 * ## 什么算「全屏遮罩」(判据本身)
 *
 * 一条规则必须**同时**满足三件事才被收进来:
 *
 *   1. `position: fixed`     —— 脱离文档流,钉在视口上
 *   2. 铺满视口              —— `inset: 0`,或 top/right/bottom/left 四条都是 0
 *   3. 画了一层底            —— 有 `background` / `background-color`,且不是
 *                               `none` / `transparent`
 *
 * 第 3 条是这条判据的重心。铺满视口但**透明**的层是「点外面关掉」用的接盘层,
 * 它的工作本来就是待在别的东西**下面**(例:`.composer-toolbox-standalone-backdrop`
 * 是 `background: transparent`、z = 89)。而画了底的那层是在对用户**许诺**
 * ——「我后面的东西都被压暗了、点不动了」。许了这个诺却排在同屏 chrome 下面,
 * 就是用户看到的「遮罩漏了两个洞」。所以只有许了诺的那类被管。
 *
 * 判据刻意取窄:宁可只罩住确定的那几个,也不要用一条模糊判据把锚定菜单、
 * 选区浮条、卡内装饰层拖进来 —— 那些各有各的层位契约,被这条守护误伤只会
 * 让下一个人把守护删掉。本目录当前被**排除**的那些,以及排除的理由,
 * 在下面 `排除项是有意的` 那一组里逐条钉住了。
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SRC = resolve(__dirname, '../../../src');
const CHAT_DIR = resolve(SRC, 'components/chat');

/** 真机 `elementFromPoint` 探到的右上角那簇的层号。样式表里查不到,见头注。 */
const TOP_RIGHT_CHROME_Z = 150;

// ---------------------------------------------------------------- CSS 读取

interface StyleRule {
  /** 相对 `src/` 的路径,失败信息里直接能定位 */
  file: string;
  selector: string;
  /** 声明块;嵌套子块已被抠掉,免得子块的声明被当成本块的 */
  decls: string;
}

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * 花括号配对的规则切分。必须配对而不是 `split('}')` —— 本目录里
 * `QuotedRefs` / `AudioArtifact` / `RunErrorCard` / `record` 都有 `@media`,
 * 按 `}` 硬切会把条件组的头当成选择器,断言从此空转。
 */
function parseRules(css: string, file: string, out: StyleRule[]): void {
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) break;
    const prelude = css.slice(i, open).trim();
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') depth -= 1;
      j += 1;
    }
    const body = css.slice(open + 1, j - 1);
    if (prelude.startsWith('@')) {
      // 条件组:里面还是普通规则,钻进去。`@keyframes` / `@font-face` 不是。
      if (/^@(?:media|supports|container|layer|scope)\b/.test(prelude)) {
        parseRules(body, file, out);
      }
    } else if (prelude !== '') {
      out.push({ file, selector: prelude.replace(/\s+/g, ' '), decls: body.replace(/\{[^{}]*\}/g, ' ') });
    }
    i = j;
  }
}

function cssFilesUnder(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...cssFilesUnder(full));
    else if (entry.name.endsWith('.css')) found.push(full);
  }
  return found.sort();
}

const CHAT_RULES: StyleRule[] = (() => {
  const rules: StyleRule[] = [];
  for (const file of cssFilesUnder(CHAT_DIR)) {
    parseRules(stripComments(readFileSync(file, 'utf8')), relative(SRC, file), rules);
  }
  return rules;
})();

// ---------------------------------------------------------------- 判据

/** 取一条声明的值;取不到返回 `null` */
function decl(decls: string, prop: string): string | null {
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'i');
  const m = re.exec(decls);
  return m?.[1] !== undefined ? m[1].trim() : null;
}

/** 铺满视口:`inset: 0`,或者四条边各自归零的老写法 */
function coversViewport(decls: string): boolean {
  const inset = decl(decls, 'inset');
  if (inset !== null && /^0(?:px|%)?$/.test(inset)) return true;
  return (['top', 'right', 'bottom', 'left'] as const).every((side) => {
    const v = decl(decls, side);
    return v !== null && /^0(?:px|%)?$/.test(v);
  });
}

/** 画了一层看得见的底(不是接盘用的透明层) */
function paintsScrim(decls: string): boolean {
  const bg = decl(decls, 'background') ?? decl(decls, 'background-color');
  if (bg === null) return false;
  return !/^(?:none|transparent|initial|unset)$/i.test(bg);
}

/** 头注 §「什么算全屏遮罩」的三条,合起来就是这个函数 */
function isFullscreenScrim(rule: StyleRule): boolean {
  return (
    decl(rule.decls, 'position') === 'fixed' && coversViewport(rule.decls) && paintsScrim(rule.decls)
  );
}

const SCRIMS = CHAT_RULES.filter(isFullscreenScrim);

/** z-index 的字面数值;不是字面数字(比如走了 token)就返回 `null` */
function zIndexOf(decls: string): number | null {
  const v = decl(decls, 'z-index');
  return v !== null && /^-?\d+$/.test(v) ? Number(v) : null;
}

// ------------------------------------------------ 参照层(chat.css 里的同屏邻居)

const CHAT_CSS = stripComments(readFileSync(resolve(SRC, 'styles/chat.css'), 'utf8'));

function globalZ(selector: string): number | null {
  const rule = (() => {
    const rules: StyleRule[] = [];
    parseRules(CHAT_CSS, 'styles/chat.css', rules);
    return rules.find((r) => r.selector.split(',').some((s) => s.trim() === selector));
  })();
  return rule ? zIndexOf(rule.decls) : null;
}

// ================================================================ 量法自检
//
// 先证明这把尺子在**修复之前**就能把错的读成错的。少了这一组,下面全绿也
// 可能只是尺子什么都没量到。

describe('先证明这把尺子能照出缺陷', () => {
  /**
   * 一份合成语料,四种形态各一条 —— 覆盖本目录真实存在的每一种排除理由。
   * 尺子必须只挑出第一条,并且把它的 40 原样读出来。
   */
  const FIXTURE = `
    .scrimTooLow { position: fixed; inset: 0; z-index: 40;
      background: color-mix(in srgb, var(--chat-text-strong) 26%, transparent); }
    .scrimOldSchool { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 7;
      background: rgba(0, 0, 0, 0.3); }
    .clickCatcher { position: fixed; inset: 0; z-index: 89; background: transparent; }
    .floatingBar { display: block; position: fixed; z-index: 6; background: var(--chat-overlay-glass); }
    .anchoredPop { position: absolute; bottom: calc(100% + 7px); z-index: 7; background: var(--chat-bg); }
    .inlineForm { position: static; inset: auto; z-index: auto; border-radius: 8px; }
    @media (max-width: 600px) { .scrimInMedia { position: fixed; inset: 0; z-index: 3; background: #000; } }
  `;
  const fixtureRules: StyleRule[] = [];
  parseRules(stripComments(FIXTURE), 'fixture.css', fixtureRules);

  it('规则切分认得 @media —— 认不出来的话条件组里的遮罩会被漏掉', () => {
    expect(fixtureRules.map((r) => r.selector)).toEqual([
      '.scrimTooLow',
      '.scrimOldSchool',
      '.clickCatcher',
      '.floatingBar',
      '.anchoredPop',
      '.inlineForm',
      '.scrimInMedia',
    ]);
  });

  it('判据只挑出全屏遮罩 —— 接盘层 / 浮条 / 锚定气泡 / 就地形态都不在内', () => {
    expect(fixtureRules.filter(isFullscreenScrim).map((r) => r.selector)).toEqual([
      '.scrimTooLow',
      '.scrimOldSchool',
      '.scrimInMedia',
    ]);
  });

  it('读得出那个错的数 —— 40,正是缺陷现场那个值', () => {
    const bad = fixtureRules.find((r) => r.selector === '.scrimTooLow')!;
    expect(zIndexOf(bad.decls)).toBe(40);
    // 而且这个读数确实过不了下面那三道:尺子有刻度,不是恒真
    expect(zIndexOf(bad.decls)!).toBeLessThan(TOP_RIGHT_CHROME_Z);
  });

  it('三个参照层都拿得到 —— 拿不到就说明选择器改名了,断言会空转', () => {
    expect(globalZ('.chat-composer-fixed-layer')).not.toBeNull();
    expect(globalZ('.staged-preview-modal')).not.toBeNull();
  });

  it('目录扫到了东西,而且扫到的正是那两张真模态', () => {
    // 空集合会让下面的 for 循环一条断言都不跑 —— 那是最坏的一种「全绿」
    expect(SCRIMS.length).toBeGreaterThan(0);
    expect(new Set(SCRIMS.map((r) => r.file))).toEqual(
      new Set([
        'components/chat/SupportDialog.module.css',
        'components/chat/AmrOwnerTopUpDialog.module.css',
      ]),
    );
  });
});

// ================================================================ 守护本体

describe('chat 全屏遮罩的层级', () => {
  const composerZ = globalZ('.chat-composer-fixed-layer');
  const peerModalZ = globalZ('.staged-preview-modal');

  for (const scrim of SCRIMS) {
    const where = `${scrim.file} ${scrim.selector}`;

    describe(where, () => {
      it('写了字面 z-index —— 遮罩必须自报档位', () => {
        expect(
          zIndexOf(scrim.decls),
          `${where} 没有字面 z-index。改走 token 是可以的,但这条守护得先学会解析它,` +
            '否则它会静静地不再守任何东西',
        ).not.toBeNull();
      });

      it('压得住输入框那个固定层', () => {
        expect(
          zIndexOf(scrim.decls)!,
          `${where} 排在 .chat-composer-fixed-layer(z=${composerZ})之下 —— 输入框会从遮罩里穿出来`,
        ).toBeGreaterThan(composerZ!);
      });

      it(`压得住右上角那排 chrome(真机量到 z = ${TOP_RIGHT_CHROME_Z})`, () => {
        expect(
          zIndexOf(scrim.decls)!,
          `${where} 排在右上角 star / 额度胶囊之下 —— 遮罩上会漏出那一块照常亮着`,
        ).toBeGreaterThan(TOP_RIGHT_CHROME_Z);
      });

      it('和同侪模态同一档 —— 不自立一个刚好够用的数字', () => {
        expect(
          zIndexOf(scrim.decls)!,
          `${where} 低于同侪模态 .staged-preview-modal(z=${peerModalZ})。` +
            '刚好够用的数字会在下一个人抬高某层 chrome 时再坏一次',
        ).toBeGreaterThanOrEqual(peerModalZ!);
      });
    });
  }

  it('这一族内部不许各挑各的数 —— 分档要有人拍板,不能悄悄漂移', () => {
    const tiers = new Map<number, string[]>();
    for (const s of SCRIMS) {
      const z = zIndexOf(s.decls);
      if (z === null) continue;
      tiers.set(z, [...(tiers.get(z) ?? []), `${s.file} ${s.selector}`]);
    }
    expect(
      [...tiers.keys()].sort((a, b) => a - b),
      `chat 的全屏遮罩落在了不同档:${JSON.stringify([...tiers], null, 2)}。` +
        '真要让某张弹窗压在另一张之上,那是一次有意的分层决定 —— 改这条用例并写下理由,' +
        '别让数字自己漂',
    ).toHaveLength(1);
  });
});

// ================================================================ 排除项

/**
 * 判据取窄的代价是「有东西被排除」,那就把排除**钉住**:哪天有人把判据放宽,
 * 这些各有各层位契约的浮层被拖进来,这里立刻红。
 */
describe('排除项是有意的', () => {
  const excluded = [
    {
      file: 'components/chat/QuoteBar.module.css',
      selector: '.bar',
      why: '选区浮条:虽是 position: fixed,但按选区矩形定位、不铺满视口。z=6 抄自设计源,抬了会盖住它自己要贴的那段文字',
    },
    {
      file: 'components/chat/QuotedRefs.module.css',
      selector: '.pop',
      why: '锚定气泡:position: absolute,活在自己的层叠上下文里,和视口层无关',
    },
    {
      file: 'components/chat/AnchoredMenuShell.module.css',
      selector: '.anchored',
      why: '锚定菜单包裹盒:走 --z-menu 这条另一份层位契约,而且它 pointer-events: none、不画底',
    },
    {
      file: 'components/chat/UpgradeCard.module.css',
      selector: '.up::after',
      why: '卡内装饰辉光:position: absolute 且 z-index: -1,压在卡片自己的底色之上、内容之下,根本不是浮层',
    },
    {
      file: 'components/chat/SupportDialog.module.css',
      selector: '.overlayInline',
      why: '就地形态:position: static,躺在文档流里给陈列页看的。抬它会盖住陈列页别的格子',
    },
    {
      file: 'components/chat/AmrOwnerTopUpDialog.module.css',
      selector: '.overlayInline',
      why: '同上',
    },
  ];

  for (const { file, selector, why } of excluded) {
    it(`${file} ${selector} 不在守护范围内 —— ${why}`, () => {
      const rule = CHAT_RULES.find(
        (r) => r.file === file && r.selector.split(',').some((s) => s.trim() === selector),
      );
      expect(rule, `${file} 里找不到 ${selector} —— 改名或删了,这条排除说明已经过期`).toBeTruthy();
      expect(isFullscreenScrim(rule!)).toBe(false);
    });
  }

  it('就地形态一律 z-index: auto —— 它躺在文档流里,抬了会盖住旁边的格子', () => {
    const inlines = CHAT_RULES.filter((r) => /Inline\b/.test(r.selector));
    expect(inlines.length, '一个 *Inline 形态都没扫到 —— 选择器改名了,这条断言会空转').toBeGreaterThan(0);
    for (const rule of inlines) {
      expect(decl(rule.decls, 'z-index'), `${rule.file} ${rule.selector}`).toBe('auto');
    }
  });
});
