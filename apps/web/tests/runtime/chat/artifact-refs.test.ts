/**
 * `artifactRefs` 的读取端收敛器 —— 会话产物的版本身份进入 Web 的唯一入口。
 *
 * 产品裁决(`specs/current/chat-artifact-versioning-design.md` §3.2 / §4 / §8,
 * 以及 2026-09-02 的两处口径更正):
 *
 * | 产物 | 卡面 | 点击 |
 * | --- | --- | --- |
 * | HTML / 原型 / slide / 文档 | 当轮**静态首屏截图** | 工作区**最新版本** |
 * | 图片 | 当轮**不可变真图快照** | 工作区**最新版本** |
 *
 * 点击那一列 2026-09-02 由用户统一过:「html 和图片都是,产物缩略是快照,但跳过去
 * 产物永远指向最新的」。**两种类型同一条规则**,没有例外 —— 所以这一层再也不交
 * 任何「点击目标」出去,只交卡面用的 URL。
 *
 * 这一层守两条:
 *
 *  1. **只信 `ready`。** pending / failed / legacy_unavailable 一律不交 URL,
 *     让卡走降级支(HTML → live iframe 显示最新;图片 → 当前同名文件)。
 *     交一个还没写完的快照 URL 出去,卡面就是一张碎图 —— 比降级更糟。
 *  2. **用哪个 URL 由 daemon 宣布的 policy 决定,不由 Web 猜后缀。**
 *     Web 再猜一遍等于把语义抄第二份,两份迟早分叉。
 */

import { describe, expect, it } from 'vitest';

import { indexArtifactRefs, messageArtifactRefs } from '../../../src/runtime/chat/artifact-refs';

const htmlRef = (over: Record<string, unknown> = {}) => ({
  id: 'ref-1',
  label: 'landing.html',
  kind: 'html',
  displayPolicy: 'latest_with_static_preview',
  workspaceArtifactId: 'wa-1',
  snapshotId: 'snap-html-1',
  thumbnailUrl: '/api/projects/p1/chat-artifact-snapshots/snap-html-1/thumbnail',
  snapshotState: 'ready',
  ...over,
});

const imageRef = (over: Record<string, unknown> = {}) => ({
  id: 'ref-2',
  label: 'hero.png',
  kind: 'image',
  displayPolicy: 'immutable_snapshot',
  /*
   * 故意留着这个**已作废**的字段:线上还会有宣布 `openPolicy:'snapshot'` 的
   * daemon / 旧消息。留着它,下面那条断言测的才是「读取端无论如何都不交点击
   * 目标」,而不是「我把字段从夹具里删了所以分支没走到」。
   */
  openPolicy: 'snapshot',
  workspaceArtifactId: 'wa-2',
  snapshotId: 'snap-img-1',
  snapshotUrl: '/api/projects/p1/chat-artifact-snapshots/snap-img-1/content',
  snapshotState: 'ready',
  ...over,
});

describe('indexArtifactRefs · HTML 系', () => {
  it('交出静态首屏截图作为卡面,但不交快照身份 —— 点击仍然走最新', () => {
    const index = indexArtifactRefs([htmlRef()]);
    expect(index.get('landing.html')).toEqual({
      coverUrl: '/api/projects/p1/chat-artifact-snapshots/snap-html-1/thumbnail',
    });
    /*
     * 哪怕这条 ref 自己带着 snapshotId,也不许交出去:点击永远打开最新。
     * 交出去,卡就会去开那张历史图 —— 正是用户 2026-09-02 否掉的行为。
     */
    expect(index.get('landing.html')).not.toHaveProperty('snapshotId');
    expect(index.get('landing.html')).not.toHaveProperty('snapshotUrl');
  });
});

describe('indexArtifactRefs · 图片', () => {
  /*
   * 正向:交出的**只有卡面那张图**。
   *
   * 用整对象比较,不用 `not.toHaveProperty` —— 这一层的历史教训是「加一个可选字段
   * 会让否定式断言恒真」。整对象比较里多出任何一个键都会红。
   */
  it('只交出卡面用的快照 URL,不交任何点击目标', () => {
    const index = indexArtifactRefs([imageRef()]);
    expect(index.get('hero.png')).toEqual({
      snapshotUrl: '/api/projects/p1/chat-artifact-snapshots/snap-img-1/content',
    });
  });

  /*
   * 反向护栏:**卡面仍然是快照**。
   *
   * 拆「点击开快照」那条线时最容易顺手把这半边一起拆掉 —— 那就把裁决的另一半
   * (「产物缩略是快照」)也弄坏了,而且是静悄悄地坏:卡面会开始跟着 latest 漂。
   */
  it('同名图片被后一轮覆盖时,两条消息的卡面各自认自己那张', () => {
    const first = indexArtifactRefs([imageRef()]);
    const second = indexArtifactRefs([
      imageRef({
        id: 'ref-3',
        snapshotId: 'snap-img-2',
        snapshotUrl: '/api/projects/p1/chat-artifact-snapshots/snap-img-2/content',
      }),
    ]);
    expect(first.get('hero.png')?.snapshotUrl).toBe(
      '/api/projects/p1/chat-artifact-snapshots/snap-img-1/content',
    );
    expect(second.get('hero.png')?.snapshotUrl).toBe(
      '/api/projects/p1/chat-artifact-snapshots/snap-img-2/content',
    );
  });
});

describe('indexArtifactRefs · 只信 ready', () => {
  for (const state of ['pending', 'failed', 'legacy_unavailable', undefined]) {
    it(`snapshotState=${String(state)} 时一个 URL 都不交(卡去走降级支)`, () => {
      const index = indexArtifactRefs([
        htmlRef({ snapshotState: state }),
        imageRef({ snapshotState: state }),
      ]);
      expect(index.has('landing.html')).toBe(false);
      expect(index.has('hero.png')).toBe(false);
    });
  }
});

describe('indexArtifactRefs · 输入不可信', () => {
  it('不是数组 / 空 / 垃圾条目都收成空索引,不抛', () => {
    for (const input of [undefined, null, {}, 'refs', 0, [null, 7, 'x', {}]]) {
      expect(indexArtifactRefs(input).size).toBe(0);
    }
  });

  it('缺 label 的条目配不上任何一张卡,直接丢掉', () => {
    expect(indexArtifactRefs([htmlRef({ label: '' })]).size).toBe(0);
    expect(indexArtifactRefs([htmlRef({ label: undefined })]).size).toBe(0);
  });

  it('policy 认得但 URL 是空串时不记账 —— 空 src 的 <img> 是一张碎图', () => {
    expect(indexArtifactRefs([htmlRef({ thumbnailUrl: '' })]).size).toBe(0);
    expect(indexArtifactRefs([imageRef({ snapshotUrl: '' })]).size).toBe(0);
  });

  it('policy 不认识时不猜后缀', () => {
    // `.html` 摆在眼前也不许自作主张当成静态封面:权威在 daemon 宣布的 policy。
    expect(indexArtifactRefs([htmlRef({ displayPolicy: 'something_new' })]).size).toBe(0);
  });
});

describe('messageArtifactRefs', () => {
  it('从消息上取字段,消息形状不对时给 undefined', () => {
    expect(messageArtifactRefs({ artifactRefs: [1, 2] })).toEqual([1, 2]);
    expect(messageArtifactRefs({})).toBeUndefined();
    expect(messageArtifactRefs(null)).toBeUndefined();
    expect(messageArtifactRefs('nope')).toBeUndefined();
  });
});
