/**
 * 产物卡的缩略图必须在**桌面视口**里渲染,然后整体缩小 —— 不是在一个卡片大小的
 * 小视口里重新排版。
 *
 * 2026-08-28 用户截图:同一个文件,聊天里的产物卡排成了移动版(底部一条
 * 「文稿 / 写作 / 边注 / 预览」标签栏),右边 FileViewer 里的真实预览是桌面三栏。
 * 两边差得像两个页面。
 *
 * 真因不是「没缩放」——`.artifact-card-frame` 一直有 `transform: scale(...)`——
 * 而是**缩放基准是相对的**:`width: 250%` + `scale(0.4)`,iframe 的视口 = 卡片
 * 宽度 × 2.5。聊天栏里一行两张卡,单卡约 215px,于是 iframe 视口只有约 540px,
 * 被页面自己的响应式断点判成手机。**是重排,不是缩小。**
 *
 * 修法与首页项目网格(`styles/home/recent-projects.css` 的
 * `.recent-projects__thumb-iframe`)一致:iframe 用**固定的桌面像素视口**,再用
 * 容器查询把它按卡片宽度缩下来。两处必须是同一套写法,别再各写各的数字。
 *
 * 这一条是**文本 + 算术**检查,守的是「基准是固定桌面宽度」这条不变量,防止有人
 * 改回相对百分比。「画出来到底是三栏还是标签栏」只有真排版量得出 —— 那一步走真实
 * Chrome(记录见 PR),不在这儿冒充。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(here, '../../src', rel), 'utf8');

/** 注释里会写别处的数字(比如 250% 那段历史),先剥掉再匹配。 */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

const tools = withoutComments(read('styles/viewer/tools.css'));
const recentProjects = withoutComments(read('styles/home/recent-projects.css'));

/**
 * 同一个选择器可能出现在多条规则里(分组选择器、后面再补一条覆盖)。逐条按源码
 * 顺序合并声明,后写的赢 —— 只看第一条会读到被覆盖掉的旧值。
 */
function rule(css: string, selector: string): string {
  const declarations = new Map<string, string>();
  let found = false;
  for (const match of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const selectorSource = match[1];
    const declarationSource = match[2];
    if (selectorSource === undefined || declarationSource === undefined) continue;
    const selectors = selectorSource.split(',').map((one) => one.trim());
    if (!selectors.includes(selector)) continue;
    found = true;
    for (const declaration of declarationSource.split(';')) {
      const colon = declaration.indexOf(':');
      if (colon < 0) continue;
      declarations.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim());
    }
  }
  expect(found, `找不到 ${selector} 的规则`).toBe(true);
  return [...declarations].map(([property, value]) => `${property}: ${value};`).join('\n');
}

/** 一个 iframe 缩略图要「桌面渲染 + 百分比缩小」,需要的三件东西。 */
function desktopScaledFrame(css: string, frameSelector: string) {
  const body = rule(css, frameSelector);
  const width = /(^|;)\s*width:\s*(\d+)px/.exec(body);
  const height = /(^|;)\s*height:\s*(\d+)px/.exec(body);
  const scale = /transform:\s*scale\(\s*calc\(\s*100cqw\s*\/\s*(\d+)px/.exec(body);
  return {
    body,
    width: width ? Number(width[2]) : null,
    height: height ? Number(height[2]) : null,
    scaleDivisor: scale ? Number(scale[1]) : null,
  };
}

/**
 * 「桌面」的下限。常见的响应式断点最高一档是 1280 / 1200 / 1024 / 768;取 1280
 * 作门槛,保证缩略图和右边那块真实预览落在**同一个断点桶**里。
 */
const DESKTOP_VIEWPORT_FLOOR = 1280;

describe('产物卡缩略图的渲染视口', () => {
  it('缩放基准是固定的桌面像素宽,不是卡片宽度的百分比', () => {
    const frame = desktopScaledFrame(tools, '.artifact-card-frame');
    // 反向:出事那次的形态就是一条百分比宽 —— 它一定要消失,否则「桌面视口」
    // 是假的(视口跟着卡片走,卡片小视口就小)。
    expect(
      /(^|;)\s*width:\s*[\d.]+%/.test(frame.body),
      '.artifact-card-frame 还在用百分比宽度:iframe 视口仍然跟着卡片走,页面照旧按手机排版',
    ).toBe(false);
    expect(frame.width, '.artifact-card-frame 没有固定的 px 宽度').not.toBeNull();
    if (frame.width === null) throw new Error('.artifact-card-frame 没有固定的 px 宽度');
    expect(frame.width).toBeGreaterThanOrEqual(DESKTOP_VIEWPORT_FLOOR);
  });

  it('缩小走容器查询,除数就是那个固定宽度 —— 两个数不许各写各的', () => {
    const frame = desktopScaledFrame(tools, '.artifact-card-frame');
    expect(frame.scaleDivisor, '.artifact-card-frame 的 transform 不是 scale(calc(100cqw / <宽>px ...))').not.toBeNull();
    expect(frame.scaleDivisor).toBe(frame.width);
    expect(frame.body).toContain('transform-origin');
  });

  it('固定视口的宽高比 = 卡面的宽高比,所以按宽度缩放两个方向都正好铺满', () => {
    const thumb = rule(tools, '.artifact-card-thumb');
    const ratio = /aspect-ratio:\s*(\d+)\s*\/\s*(\d+)/.exec(thumb);
    expect(ratio, '.artifact-card-thumb 没有 aspect-ratio').toBeTruthy();
    const [w, h] = [Number(ratio![1]), Number(ratio![2])];
    const frame = desktopScaledFrame(tools, '.artifact-card-frame');
    expect(frame.height, '.artifact-card-frame 没有固定的 px 高度').not.toBeNull();
    // 比例对不上就会露底或裁掉一条:按宽缩放后高度必须正好等于卡面高度。
    if (frame.width === null) throw new Error('.artifact-card-frame 没有固定的 px 宽度');
    expect(frame.height).toBe(Math.round((frame.width * h) / w));
  });

  it('cqw 的容器就是卡面本身 —— 少了这行,100cqw 会回落到视口', () => {
    /*
     * 祖先链上没有容器时,`cqw` 按规范回落到小视口。2026-08-28 在 1600px 窗口
     * 实测:去掉这一行,`.artifact-card-frame` 的 scale 从 0.140 变成 1.111,
     * 1440px 的页面在一张 202px 的卡里铺成 1600px 宽 —— 整个卡面只剩左上角。
     */
    expect(rule(tools, '.artifact-card-thumb')).toContain('container-type: inline-size');
  });

  it('和首页项目网格是同一套写法(那边是 16/9 的 1280x720)', () => {
    const home = desktopScaledFrame(recentProjects, '.recent-projects__thumb-iframe');
    expect(home.width).not.toBeNull();
    expect(home.scaleDivisor).toBe(home.width);
    if (home.width === null) throw new Error('.recent-projects__thumb-iframe 没有固定的 px 宽度');
    expect(home.width).toBeGreaterThanOrEqual(DESKTOP_VIEWPORT_FLOOR);
  });
});
