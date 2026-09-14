import { describe, it, expect } from 'vitest';

import {
  artifactDeliveryRole,
  pickPrimaryArtifacts,
} from '../src/api/artifact-focus-marker';
import { buildArtifactFocusTelemetry } from '../src/analytics/artifact-focus';
import type { RunFinishedProps } from '../src/analytics/events/result-events';

/**
 * 兜底挑主产物 —— 「不声明就一张卡都没有」被推翻之后剩下的那条判据。
 *
 * 背景(W10 从两台机器的诊断包里量的真实声明率):
 *
 *   | 轮次形态                | 样本 | 声明率 |
 *   |------------------------|-----:|-------:|
 *   | 新建文件                |   4  |  100%  |
 *   | 只改已有文件            |   8  |   25%  |
 *   | 合并「只改不建」        |   9  |   22%  |
 *
 * 所以「不声明 = 不出卡」在真机上等于「大部分只改文件的轮次一张卡都没有」,
 * 也就是 OPEND-2550 的现场。产品裁决(方案 C):兜底,但只端主产物 ——
 * 一个页面 + 它的样式表 + 脚本 + 十几张图,是**一个**交付物,报页面就行。
 *
 * ⚠️ 这条判据只看**本轮写过的文件**。明确不做「改了 app.js 就去找引用它的
 * index.html」:那要读本轮之外的文件,而宿主契约明确禁止把卡指向本轮没产出的
 * 文件(见 artifact-focus-marker.ts 的 "never point a card at a file the turn
 * did not produce")。这个场景到底有多常见,靠 `wrote_only_dependencies` 埋点
 * 去量,而不是先建。
 */

function f(name: string) {
  return { name, path: name };
}

describe('artifactDeliveryRole — 一个文件在这一轮交付里是什么角色', () => {
  it('页面 / 文档是交付物', () => {
    for (const name of [
      'index.html',
      'site/index.htm',
      'report.md',
      'notes.mdx',
      'brief.pdf',
      'deck.pptx',
      'spec.docx',
      'readme.txt',
    ]) {
      expect(artifactDeliveryRole(name), name).toBe('deliverable');
    }
  });

  it('图片 / 视频 / 音频是 media', () => {
    for (const name of [
      'hero.png',
      'bg.jpg',
      'shot.jpeg',
      'anim.gif',
      'photo.webp',
      'clip.mp4',
      'take.mov',
      'voice.mp3',
    ]) {
      expect(artifactDeliveryRole(name), name).toBe('media');
    }
  });

  /* 产品原话点名的那四类:`.js` `.css` `.svg` `.json` 这类依赖文件不出卡。 */
  it('脚本 / 样式 / svg / 数据 / 字体是依赖', () => {
    for (const name of [
      'app.js',
      'main.mjs',
      'index.tsx',
      'styles.css',
      'theme.scss',
      'logo.svg',
      'data.json',
      'bundle.js.map',
      'Inter.woff2',
      'favicon.ico',
    ]) {
      expect(artifactDeliveryRole(name), name).toBe('dependency');
    }
  });

  /*
   * 认不出来的扩展名往「交付物」倒,不往「依赖」倒:兜底的失败方向必须是
   * 「多显示一张卡」,不能是「悄悄把用户的东西藏起来」。
   */
  it('认不出的扩展名当交付物,而不是当依赖藏掉', () => {
    expect(artifactDeliveryRole('thing.xyz')).toBe('deliverable');
    expect(artifactDeliveryRole('Makefile')).toBe('deliverable');
  });

  it('大小写和路径前缀都不影响判定', () => {
    expect(artifactDeliveryRole('SITE/Index.HTML')).toBe('deliverable');
    expect(artifactDeliveryRole('./assets/App.JS')).toBe('dependency');
  });
});

describe('pickPrimaryArtifacts — 兜底时端哪几个', () => {
  /** 产品原话里那一堆「杂七杂八」:一个 html + js + css + 一堆图片 */
  const website = [
    f('index.html'),
    f('styles.css'),
    f('app.js'),
    f('hero.png'),
    f('logo.svg'),
    f('bg.jpg'),
  ];

  it('有页面时,只端页面 —— 样式表 / 脚本 / 配图全不出卡', () => {
    expect(pickPrimaryArtifacts(website).map((file) => file.name)).toEqual(['index.html']);
  });

  it('两个真交付物就端两个,顺序照原样', () => {
    expect(
      pickPrimaryArtifacts([f('index.html'), f('app.js'), f('report.md')]).map((x) => x.name),
    ).toEqual(['index.html', 'report.md']);
  });

  /*
   * 反面:图片是候选,不是永远的配角。一轮只生成了三张图,那三张图就是交付物。
   * 少了这条,把实现写成「只留 html」也能让上面几条全绿。
   */
  it('这一轮只出图 —— 那图就是交付物', () => {
    expect(
      pickPrimaryArtifacts([f('a.png'), f('b.png'), f('sprite.svg')]).map((x) => x.name),
    ).toEqual(['a.png', 'b.png']);
  });

  /*
   * 「改了 app.js 就去找引用它的 index.html」明确不做:本轮没写过的文件不进卡。
   * 全是依赖 → 一张卡都不出,并由埋点把这个形态的频次量出来。
   */
  it('全是依赖文件 —— 一张卡都不出,不去本轮之外找宿主页面', () => {
    expect(pickPrimaryArtifacts([f('app.js'), f('styles.css')])).toEqual([]);
  });

  it('空清单进,空清单出', () => {
    expect(pickPrimaryArtifacts([])).toEqual([]);
  });
});

describe('buildArtifactFocusTelemetry — 声明率埋点', () => {
  const website = ['index.html', 'styles.css', 'app.js', 'hero.png'];

  it('发了 show —— 记声明,兜底没跑', () => {
    expect(
      buildArtifactFocusTelemetry({ declared: ['index.html'], writtenPaths: website }),
    ).toEqual({
      declared_artifact_focus: true,
      declared_count: 1,
      fallback_picked_count: 0,
      wrote_only_dependencies: false,
    });
  });

  it('没发 show —— 记兜底挑出了几个', () => {
    expect(buildArtifactFocusTelemetry({ writtenPaths: website })).toEqual({
      declared_artifact_focus: false,
      declared_count: 0,
      fallback_picked_count: 1,
      wrote_only_dependencies: false,
    });
  });

  /*
   * 产品明确要的那个字段:用来判断「改了 js 要显示 html」到底有多常见。
   * 长期是 0 就不用为它改安全边界;不低再来开那个口子。
   */
  it('本轮只写了依赖文件 —— wrote_only_dependencies 为真,兜底挑出 0 个', () => {
    expect(
      buildArtifactFocusTelemetry({ writtenPaths: ['app.js', 'styles.css', 'data.json'] }),
    ).toEqual({
      declared_artifact_focus: false,
      declared_count: 0,
      fallback_picked_count: 0,
      wrote_only_dependencies: true,
    });
  });

  it('这一轮什么都没写 —— 不算「只写了依赖」', () => {
    expect(buildArtifactFocusTelemetry({ writtenPaths: [] })).toEqual({
      declared_artifact_focus: false,
      declared_count: 0,
      fallback_picked_count: 0,
      wrote_only_dependencies: false,
    });
  });

  /*
   * 「声明了」的判据是**能用的路径**,不是「发过标记」:`show="../../etc/passwd"`
   * 会被路径边界整条丢掉,那一轮实际走的是兜底,埋点必须照实记。
   */
  it('声明里全是不可用路径 —— 记成没声明,并按兜底计数', () => {
    expect(
      buildArtifactFocusTelemetry({ declared: ['../../etc/passwd', '  '], writtenPaths: website }),
    ).toEqual({
      declared_artifact_focus: false,
      declared_count: 0,
      fallback_picked_count: 1,
      wrote_only_dependencies: false,
    });
  });

  it('重复声明同一个文件只算一次', () => {
    const out = buildArtifactFocusTelemetry({
      declared: ['index.html', 'index.html'],
      writtenPaths: website,
    });
    expect(out.declared_count).toBe(1);
  });

  it('两个入参都缺 —— 四个字段都是安全默认值', () => {
    expect(buildArtifactFocusTelemetry({})).toEqual({
      declared_artifact_focus: false,
      declared_count: 0,
      fallback_picked_count: 0,
      wrote_only_dependencies: false,
    });
  });

  /*
   * 字段名必须和 `RunFinishedProps` 上的声明一字不差 —— 拼错一个字段,PostHog
   * 那边就是永远为空的一列,而没有任何一条运行期断言看得见。这条的红只在
   * typecheck 下才显形(vitest 只做转译不做类型检查),所以它是 `pnpm typecheck`
   * 的哨兵,不是运行期的。
   */
  it('四个字段名和 run_finished 契约对得上', () => {
    const telemetry = buildArtifactFocusTelemetry({
      declared: ['index.html'],
      writtenPaths: ['index.html'],
    });
    const onRunFinished: Pick<
      RunFinishedProps,
      | 'declared_artifact_focus'
      | 'declared_count'
      | 'fallback_picked_count'
      | 'wrote_only_dependencies'
    > = telemetry;
    expect(Object.keys(onRunFinished).sort()).toEqual([
      'declared_artifact_focus',
      'declared_count',
      'fallback_picked_count',
      'wrote_only_dependencies',
    ]);
  });
});
