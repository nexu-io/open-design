/**
 * 应用层**全屏遮罩**的层级 —— `components/chat/` 之外的那一半。
 *
 * ## 和 `components/chat/chat-overlay-layer.test.ts` 怎么分的
 *
 * 按**目录**切,一个文件只属于一条守护,不重叠也不留缝:
 *
 *   · `apps/web/src/components/chat/**`  —— 归 `chat-overlay-layer.test.ts`
 *   · 其余 `apps/web/src/**` + `packages/components/src/**` —— 归这里
 *
 * 这条守护会主动断言「扫到的文件里没有一个在 `components/chat/` 下」,所以哪天
 * 有人把范围放宽、两边开始互相断言同一个文件,这里立刻红。
 *
 * 判据是**同一把尺子**(见下面 §「什么算全屏遮罩」),但**断言不同**,这点必须写清楚:
 *
 *   · chat 那边只有两张同族弹窗,所以它可以要求「这一族只许有一个档」;
 *   · 这边是全应用 30+ 张遮罩,档位**本来就该分层** —— 嵌套确认框要压过它被
 *     从哪张模态里打开的那一张,`UpdateDialog` 要压过 `MessageCenter`,
 *     `FigmaHelpModal`(1600)是从 `FigmaImportModal`(1000)里点开的。
 *     照抄「只许一个档」会把这些**正确**的分层判成错。
 *
 * 所以这边守的是**地板**(所有遮罩都必须压过同屏 chrome),外加**本批 6 处的
 * 档位表**(我这次拍的板不许悄悄漂)。地板之上谁压谁,是各自的分层决定。
 *
 * ## 真机量到的层号
 *
 *   右上角 star / 额度胶囊  `.entry-top-right-cluster`  **z = 150**
 *
 * 这 150 在样式表里**查不到**:`.entry-top-right-cluster` 自己没写 `z-index`,
 * 它 portal 进 `.workspace-tabs-chrome`(z=120)的 `.app-chrome-actions` 里,
 * 150 是那个层叠上下文的实测值。它是**二手数值**(来自 chat 那条守护的头注,
 * 由 `elementFromPoint` 逐点探出),这里不复述出处,只标明:改它要重新量,
 * 别去 grep。
 *
 * 另外两个参照层是**能 grep 的**,所以这里去文件里读,不写死:
 *   `.workspace-tabs-chrome.app-chrome-header` (`styles/shell.css`)
 *   `.chat-composer-fixed-layer`               (`styles/chat.css`)
 * 读而不写死的理由:写死的常数会在别人调整 chrome 时静静地留在旧值上,
 * 于是守护看起来还在跑,实际上量的是一个已经不存在的地板。
 *
 * ## 什么算「全屏遮罩」(判据本身)
 *
 * 四条**同时**满足才收进来:
 *
 *   1. `position: fixed`  —— 脱离文档流,钉在视口上
 *   2. 铺满视口           —— `inset: 0`,或 top/right/bottom/left 四条都是 0
 *   3. 画了一层底         —— 有 `background` / `background-color`,且不是
 *                            `none` / `transparent`
 *   4. 自己接得住点击      —— 不是 `pointer-events: none`
 *
 * 第 3 条和 chat 那条一致:铺满但透明的是「点外面关掉」的接盘层,它的职责就是
 * 待在别的东西**下面**。
 *
 * ## 共享原语身上还压着一条同名的全局类
 *
 * `Dialog` 给遮罩同时挂了两个类:CSS Module 的 `styles.backdrop`,和字面量
 * `'modal-backdrop'`。而 `styles/workspace/mention-home.css` 里有一条全局
 * `.modal-backdrop { z-index: 1700 }`。两者都是 (0,1,0),谁赢由**文档顺序**决定,
 * 不是由数字大小决定 —— 所以「原语写了 100」和「实际算出来是几」不是同一件事。
 *
 * 本地 `.next` 产物里量过:首屏 `<head>` 只挂 4 个全局 chunk,而
 * `.dialog_backdrop{…z-index:100…}` 落在一个**按需加载**的 chunk 里(那个 chunk
 * 里一条 `modal-backdrop` 都没有),后到者排在后面 → 原语那条赢。旁证是三个消费者
 * (`AmrArtifactUpgradeDialog` 1700 / `DeepSeekV4FlashCampaign` 1700 /
 * `GoPlanSunsetDialog` 1800)各自在自己的 `backdropClassName` 上写了 z-index:
 * 要是全局那条 1700 本来就赢,这三处全是废笔。
 *
 * 这是**推断**,不是 `getComputedStyle` 量出来的 —— 打包器的注入顺序真要确认,
 * 只有真机能确认。所以下面留了一条断言:不管谁赢,**两条都必须过地板**。
 *
 * 第 4 条是这边多出来的,因为这边扫得到 `styles/app-wash.css` 的 `body::before`
 * —— 它 `position: fixed; inset: 0` 且画了 `var(--app-wash)`,前三条全中,但它
 * 是**装饰背景**,`z-index: -1` 且 `pointer-events: none`。遮罩许的诺是「我后面
 * 的东西被压暗了、**点不动了**」;许了这个诺就必须自己接住点击。装饰层不接,
 * 所以它本来就不在这一族里。少了第 4 条,这条守护第一次跑就会去要求把整张
 * 应用底纹抬到 150 以上 —— 那是错的。
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, '../../../..');
const WEB_SRC = resolve(REPO, 'apps/web/src');
const COMPONENTS_SRC = resolve(REPO, 'packages/components/src');

/** chat 那条守护的地盘;这里必须一个文件都不碰 */
const CHAT_DIR = resolve(WEB_SRC, 'components/chat');

/**
 * 真机 `elementFromPoint` 探到的右上角那簇的层号。样式表里查不到,见头注。
 * 二手数值:它来自 `components/chat/chat-overlay-layer.test.ts` 的头注,
 * 不是这条守护自己量的。
 */
const TOP_RIGHT_CHROME_Z = 150;

// ---------------------------------------------------------------- CSS 读取

interface StyleRule {
  /** 相对仓库根的路径,失败信息里直接能定位 */
  file: string;
  selector: string;
  /** 声明块;嵌套子块已被抠掉,免得子块的声明被当成本块的 */
  decls: string;
}

const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * 花括号配对的规则切分。必须配对而不是 `split('}')` —— 这个范围里
 * `tasks.css` / `drawer.css` / `home-hero.css` 全都有 `@media`,按 `}` 硬切
 * 会把条件组的头当成选择器,断言从此空转。
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
      out.push({
        file,
        selector: prelude.replace(/\s+/g, ' '),
        decls: body.replace(/\{[^{}]*\}/g, ' '),
      });
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

/** 本条守护的扫描范围:web 的 src(去掉 chat)+ 共享原语包 */
function inScopeCssFiles(): string[] {
  return [...cssFilesUnder(WEB_SRC), ...cssFilesUnder(COMPONENTS_SRC)].filter(
    (file) => !file.startsWith(`${CHAT_DIR}/`),
  );
}

const RULES: StyleRule[] = (() => {
  const rules: StyleRule[] = [];
  for (const file of inScopeCssFiles()) {
    parseRules(stripComments(readFileSync(file, 'utf8')), relative(REPO, file), rules);
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

/** 自己接得住点击 —— 装饰层不接,见头注第 4 条 */
function catchesPointer(decls: string): boolean {
  return decl(decls, 'pointer-events') !== 'none';
}

/** 头注 §「什么算全屏遮罩」的四条,合起来就是这个函数 */
function isFullscreenScrim(rule: StyleRule): boolean {
  return (
    decl(rule.decls, 'position') === 'fixed' &&
    coversViewport(rule.decls) &&
    paintsScrim(rule.decls) &&
    catchesPointer(rule.decls)
  );
}

const SCRIMS = RULES.filter(isFullscreenScrim);

/**
 * z-index 的字面数值。
 *
 * 读的是 **CSS 文本里的整数**,不是 `getComputedStyle` —— jsdom 不做 `var()`
 * 替换、也不跑层叠,拿它量出来的 z 是个假绿判据(拿到 `''` 也一样「通过」)。
 * 不是字面数字(比如走了 token)就返回 `null`,由下面第一条断言接住。
 */
function zIndexOf(decls: string): number | null {
  const v = decl(decls, 'z-index');
  return v !== null && /^-?\d+$/.test(v) ? Number(v) : null;
}

// ------------------------------------------------ 能 grep 的两个参照层

function ruleIn(relPath: string, selector: string): StyleRule | undefined {
  const rules: StyleRule[] = [];
  parseRules(stripComments(readFileSync(resolve(REPO, relPath), 'utf8')), relPath, rules);
  return rules.find((r) => r.selector.split(',').some((s) => s.trim() === selector));
}

function referenceZ(relPath: string, selector: string): number {
  const rule = ruleIn(relPath, selector);
  expect(rule, `${relPath} 里找不到 ${selector} —— 选择器改名了,地板会算错`).toBeTruthy();
  const z = zIndexOf(rule!.decls);
  expect(z, `${relPath} ${selector} 没有字面 z-index`).not.toBeNull();
  return z!;
}

const TABS_CHROME_Z = referenceZ('apps/web/src/styles/shell.css', '.workspace-tabs-chrome.app-chrome-header');
const COMPOSER_LAYER_Z = referenceZ('apps/web/src/styles/chat.css', '.chat-composer-fixed-layer');

/** 同屏 chrome 的地板:三者取最高 */
const CHROME_FLOOR = Math.max(TOP_RIGHT_CHROME_Z, TABS_CHROME_Z, COMPOSER_LAYER_Z);

// ================================================================ 量法自检
//
// 先证明这把尺子在**修复之前**就能把错的读成错的。少了这一组,下面全绿也
// 可能只是尺子什么都没量到。

describe('先证明这把尺子能照出缺陷', () => {
  /**
   * 一份合成语料,覆盖本范围真实存在的每一种形态 —— 本批那 6 处的**修复前**
   * 原值(60 / 80 / 100)各一条,外加四种必须被排除掉的。
   */
  const FIXTURE = `
    .marketplaceBackdrop { position: fixed; inset: 0; z-index: 60;
      background: color-mix(in srgb, #000 28%, transparent); }
    .confirmBackdrop { position: fixed; inset: 0; z-index: 80; background: var(--scrim-tint); }
    .sharedPrimitive { position: fixed; inset: 0; z-index: 100;
      background: color-mix(in srgb, #202020 42%, transparent); }
    .oldSchool { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 7;
      background: rgba(0, 0, 0, 0.3); }
    .appWash { position: fixed; inset: 0; z-index: -1; pointer-events: none;
      background: var(--app-wash); }
    .clickCatcher { position: fixed; inset: 0; z-index: 40; background: transparent; }
    .inPanelDrawer { position: absolute; inset: 0; z-index: 6;
      background: color-mix(in srgb, var(--bg) 24%, transparent); }
    .anchoredMenu { position: absolute; bottom: calc(100% + 7px); z-index: 140; background: var(--bg-panel); }
    @media (max-width: 600px) { .scrimInMedia { position: fixed; inset: 0; z-index: 3; background: #000; } }
  `;
  const fixtureRules: StyleRule[] = [];
  parseRules(stripComments(FIXTURE), 'fixture.css', fixtureRules);

  it('规则切分认得 @media —— 认不出来的话条件组里的遮罩会被漏掉', () => {
    expect(fixtureRules.map((r) => r.selector)).toEqual([
      '.marketplaceBackdrop',
      '.confirmBackdrop',
      '.sharedPrimitive',
      '.oldSchool',
      '.appWash',
      '.clickCatcher',
      '.inPanelDrawer',
      '.anchoredMenu',
      '.scrimInMedia',
    ]);
  });

  it('判据只挑出全屏遮罩 —— 装饰底纹 / 接盘层 / 面板内抽屉 / 锚定菜单都不在内', () => {
    expect(fixtureRules.filter(isFullscreenScrim).map((r) => r.selector)).toEqual([
      '.marketplaceBackdrop',
      '.confirmBackdrop',
      '.sharedPrimitive',
      '.oldSchool',
      '.scrimInMedia',
    ]);
  });

  it('装饰底纹被排除的理由是「不接点击」,不是别的三条 —— 反向确认', () => {
    const wash = fixtureRules.find((r) => r.selector === '.appWash')!;
    expect(decl(wash.decls, 'position')).toBe('fixed');
    expect(coversViewport(wash.decls)).toBe(true);
    expect(paintsScrim(wash.decls)).toBe(true);
    // 前三条全中,只栽在第四条
    expect(catchesPointer(wash.decls)).toBe(false);
  });

  it('读得出那三个错的数 —— 60 / 80 / 100,正是本批修复前的现场值', () => {
    const read = (sel: string) =>
      zIndexOf(fixtureRules.find((r) => r.selector === sel)!.decls);
    expect(read('.marketplaceBackdrop')).toBe(60);
    expect(read('.confirmBackdrop')).toBe(80);
    expect(read('.sharedPrimitive')).toBe(100);
    // 而且这三个读数确实过不了地板:尺子有刻度,不是恒真
    for (const z of [60, 80, 100]) expect(z).toBeLessThan(CHROME_FLOOR);
  });

  it('两个能 grep 的参照层都拿得到,而且地板确实由那 150 定 —— 拿不到就说明选择器改名了', () => {
    expect(TABS_CHROME_Z).toBeGreaterThan(0);
    expect(COMPOSER_LAYER_Z).toBeGreaterThan(0);
    expect(CHROME_FLOOR).toBe(TOP_RIGHT_CHROME_Z);
  });

  it('扫到了东西,而且一个 chat 的文件都没碰', () => {
    // 空集合会让下面的 for 循环一条断言都不跑 —— 那是最坏的一种「全绿」
    expect(SCRIMS.length).toBeGreaterThan(20);
    const trespass = SCRIMS.filter((s) => s.file.includes('apps/web/src/components/chat/'));
    expect(
      trespass.map((s) => `${s.file} ${s.selector}`),
      'chat 目录归 chat-overlay-layer.test.ts 守;两边都断言同一个文件,' +
        '改一个数字会在两处红,下一个人只会把其中一条删掉',
    ).toEqual([]);
    // 反向:chat 目录里确实有遮罩(不是因为那边没东西才「没重叠」)
    expect(cssFilesUnder(CHAT_DIR).length).toBeGreaterThan(0);
  });
});

// ================================================================ 守护本体:地板

describe('应用层全屏遮罩的地板', () => {
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

      it(`压得住同屏 chrome(地板 ${CHROME_FLOOR})`, () => {
        expect(
          zIndexOf(scrim.decls)!,
          `${where} 排在同屏 chrome 之下 —— 遮罩上会漏出那一块照常亮着。` +
            `地板 = max(右上角那簇 ${TOP_RIGHT_CHROME_Z}(真机量的), ` +
            `.workspace-tabs-chrome ${TABS_CHROME_Z}, ` +
            `.chat-composer-fixed-layer ${COMPOSER_LAYER_Z})`,
        ).toBeGreaterThan(CHROME_FLOOR);
      });
    });
  }
});

// ================================================================ 守护本体:本批的档位

/**
 * 本批 6 处各自抬到哪一档,以及**为什么是那一档**。
 *
 * 地板之上谁压谁是分层决定,不是自由值 —— 所以这张表把这次拍的板钉住:
 * 改任何一个数字都要先改这张表,顺带写下新的理由。
 */
describe('本批 6 处的档位', () => {
  /**
   * 「应用模态」档 = 1000。
   *
   * 这个数**不是我挑的** —— 应用里已经有五张 `.backdrop` 稳稳落在 1000,
   * 它们就是这一档的定义:一张占住整屏的模态,同屏对手只有 shell chrome
   * (`.workspace-tabs-chrome` 120 / 右上角那簇 150)和页面内的局部抬升
   * (`.project-search-backdrop` 400、home hero 卡片 ≤ 40),不需要压过另一张模态。
   */
  const APP_MODAL_TIER = 1000;

  const APP_MODAL_ANCHORS = [
    'apps/web/src/components/BrandPickerModal.module.css',
    'apps/web/src/components/FigmaImportModal.module.css',
    'apps/web/src/components/LibraryPreviewModal.module.css',
    'apps/web/src/components/LibraryUploadModal.module.css',
    'apps/web/src/components/NewBrandModal.module.css',
  ];

  it(`「应用模态」档确实是 ${APP_MODAL_TIER} —— 由既有的五张模态定义,不是这次挑的数`, () => {
    for (const file of APP_MODAL_ANCHORS) {
      const rule = ruleIn(file, '.backdrop');
      expect(rule, `${file} 里找不到 .backdrop —— 锚点没了,这一档就成了空口数字`).toBeTruthy();
      expect(zIndexOf(rule!.decls), `${file} .backdrop`).toBe(APP_MODAL_TIER);
    }
  });

  const RULED: { file: string; selector: string; z: number; why: string }[] = [
    {
      file: 'apps/web/src/styles/home/plugin-marketplace-demo.css',
      selector: '.plugin-marketplace__modal-backdrop',
      z: APP_MODAL_TIER,
      why: '插件市场「新建插件」面板。整屏模态,同屏只有 shell chrome —— 应用模态档',
    },
    {
      file: 'apps/web/src/styles/home/home-hero.css',
      selector: '.home-hero-confirm__backdrop',
      z: APP_MODAL_TIER,
      why:
        'home hero 的「替换附件?」确认。它走 <Dialog includeChromeClassName={false}>,' +
        '所以只有这一条规则说了算;同屏对手是 hero 卡片的局部抬升(9 / 40)—— 应用模态档',
    },
    {
      file: 'apps/web/src/styles/home/tasks.css',
      selector: '.automation-modal-backdrop',
      z: APP_MODAL_TIER,
      why: '自动化「新建」模态。Automations 页的整屏模态 —— 应用模态档',
    },
    {
      file: 'apps/web/src/styles/home/plugins-view.css',
      selector: '.plugins-import-modal__backdrop',
      z: APP_MODAL_TIER,
      why: '插件导入模态。Plugins 页的整屏模态 —— 应用模态档',
    },
    {
      file: 'apps/web/src/styles/workspace/drawer.css',
      selector: '.connector-drawer-backdrop',
      z: APP_MODAL_TIER,
      why:
        '连接器详情抽屉的**独立形态**。今天 ConnectorsBrowser 一律渲染在 ' +
        '`.connectors-panel-embedded` 里,所以生效的是下面那条面板内变体;' +
        '这条 fixed 规则是「抽屉独立挂载」的契约,给它一个正确的档 —— 应用模态档',
    },
    {
      file: 'packages/components/src/dialog.module.css',
      selector: '.backdrop',
      z: 1500,
      why:
        '共享 Dialog 原语。**不在**应用模态档,因为它没有自己的屏:它既从 EntryShell ' +
        '渲染,也从 ProjectView(聊天输入框那一屏)渲染,还会**嵌在别的模态里**' +
        '(NewProjectPanel 的删除确认长在 `.new-project-modal-backdrop` 920 之内,' +
        '在原来的 100 上它压在自己父模态的遮罩底下)。一个通用原语的地板必须覆盖这些的并集',
    },
  ];

  for (const { file, selector, z, why } of RULED) {
    it(`${file} ${selector} → ${z} —— ${why}`, () => {
      const rule = ruleIn(file, selector);
      expect(rule, `${file} 里找不到 ${selector} —— 改名或删了,这条档位说明已经过期`).toBeTruthy();
      expect(isFullscreenScrim(rule!), `${file} ${selector} 不再满足全屏遮罩判据`).toBe(true);
      expect(zIndexOf(rule!.decls)).toBe(z);
    });
  }

  /**
   * 共享原语为什么正好是 1500,而不是「比 1000 高一点」的随手数字。
   *
   * `AmrBalanceDialog`(有账单权限)和 `AmrOwnerTopUpDialog`(没有账单权限)是
   * **同一个余额闸门的两个分支** —— 在 `EntryShell.tsx` 和 `ProjectView.tsx` 里
   * 它们是同一个三元表达式的两条腿,同一处渲染,只按权限分叉。后者已经落在
   * 1500;前者不带 `backdropClassName`,吃的就是这个原语的遮罩。
   * 同一个闸门的两条腿不能差两档 —— 那样同一件事会因为「你是谁」而长得不一样。
   *
   * 这是一次**单向读取**:这条守护读 chat 那边的数,chat 那条不读这边。
   * 哪天 chat 那边挪了 1500,这里红 —— 那正是要的:另一条腿得跟着挪。
   */
  /**
   * `Dialog` 的遮罩身上同时挂着 CSS Module 的 `.backdrop` 和字面量
   * `.modal-backdrop`(见头注)。两条同特异度,谁赢看打包器的注入顺序 ——
   * 那不是这条守护量得出来的。所以这里守的不是「谁赢」,而是**赢家一定过地板**:
   * 只要两条都在地板之上,顺序怎么翻都不会漏出 chrome。
   */
  it('原语和它身上那条全局 .modal-backdrop 都过地板 —— 谁赢都不漏', () => {
    const primitive = ruleIn('packages/components/src/dialog.module.css', '.backdrop');
    const globalTwin = ruleIn('apps/web/src/styles/workspace/mention-home.css', '.modal-backdrop');
    expect(globalTwin, 'mention-home.css 的 .modal-backdrop 没了 —— 这条共存说明已经过期').toBeTruthy();
    expect(zIndexOf(primitive!.decls)!).toBeGreaterThan(CHROME_FLOOR);
    expect(zIndexOf(globalTwin!.decls)!).toBeGreaterThan(CHROME_FLOOR);
    // 反向:`Dialog` 确实还在挂那个字面量类,不然这条共存是空谈
    const dialogTsx = readFileSync(resolve(REPO, 'packages/components/src/dialog.tsx'), 'utf8');
    expect(dialogTsx).toContain("'modal-backdrop'");
  });

  it('共享原语和余额闸门的另一条腿同档 —— 同一个闸门不许因为「你是谁」而分层', () => {
    const sibling = ruleIn(
      'apps/web/src/components/chat/AmrOwnerTopUpDialog.module.css',
      '.overlay',
    );
    expect(sibling, 'AmrOwnerTopUpDialog 的 .overlay 没了 —— 这条档位理由已经过期').toBeTruthy();
    const primitive = ruleIn('packages/components/src/dialog.module.css', '.backdrop');
    expect(zIndexOf(primitive!.decls)).toBe(zIndexOf(sibling!.decls));
  });
});

// ================================================================ 排除项

/**
 * 判据取窄的代价是「有东西被排除」,那就把排除**钉住**:哪天有人把判据放宽,
 * 这些各有各层位契约的层被拖进来,这里立刻红。
 */
describe('排除项是有意的', () => {
  const excluded = [
    {
      file: 'apps/web/src/styles/app-wash.css',
      selector: 'body::before',
      why:
        '应用底纹:position: fixed + inset: 0 + 画了底,前三条全中,但它 ' +
        'pointer-events: none、z-index: -1 —— 是装饰背景,不是遮罩。' +
        '它没许「后面点不动了」那个诺,所以不归这一族管',
    },
    {
      file: 'apps/web/src/styles/workspace/drawer.css',
      selector: '.connectors-panel-embedded .connector-drawer-backdrop',
      why:
        '**故意压低**的那一个:面板内形态,position: absolute、z-index: 6,' +
        '按注释是「so it does not stack above the settings modal」。' +
        '它不是 fixed,所以抬上面那条独立形态碰不到它 —— 但这条排除要钉住,' +
        '免得哪天有人「顺手统一」把它也抬上去,连接器抽屉会盖住设置弹窗自己',
    },
  ];

  for (const { file, selector, why } of excluded) {
    it(`${file} ${selector} 不在守护范围内 —— ${why}`, () => {
      const rule = ruleIn(file, selector);
      expect(rule, `${file} 里找不到 ${selector} —— 改名或删了,这条排除说明已经过期`).toBeTruthy();
      expect(isFullscreenScrim(rule!)).toBe(false);
    });
  }
});
