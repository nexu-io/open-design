/**
 * 「换一批」的那一批 —— 从整份目录里每次取出 6 张。
 *
 * ## 产品口径(2026-08-27)
 *
 *   「点击换一批时,顺序从 22 个里每次挑 6 个出来」
 *   「但如果用户选中了一个,那要保留选中的这个,不能把用户选中的给轮换出去了,
 *     不然无法取消选择了」
 *   「点击右上角展开成列表按钮时,只展开这次的 6 个」
 *
 * 这三句合起来只描述**一个**东西:一批 6 张的牌面。叠放态在它上面翻,
 * 网格态把它整批铺开,「换一批」换掉它里面**没被选中**的那些。
 *
 * ## 为什么「选中的不许被轮换走」是硬约束,不是体贴
 *
 * 叠放态里**只有最前面那张**能点(稿子:「勾选圈只在最前面那张给」)。一张被选中的卡
 * 如果被轮换出这一批,它就再也不在这一沓里 —— 用户看得见自己选了两项(题干写着
 * 「最多选 2 项」),却再也找不到那张卡把它取消掉,于是这道题**卡死**。
 * 所以「保留」不是为了顺手,是为了这道题还能改答案。
 *
 * ## 为什么槽位要稳定,而不是把选中的顶到队首
 *
 * 顶到队首在叠放态里看不出来(能点的本来就只有最前面那张),但网格态是 6 张平铺 ——
 * 在网格里点第 5 张,它会当场跳到第 1 格,整排跟着重排。用户没要求这个位移。
 * 「保留」就按字面来:占住它原来的槽,「换一批」只填别的槽。
 */
import { describe, expect, it } from 'vitest';
import {
  VISUAL_STYLE_BATCH_SIZE,
  resolveVisualStyleBatch,
  rotateVisualStyleBatch,
} from '../../src/runtime/visual-style-deck';

/** 一份 22 张的假目录 —— 产品口径里那个「22 个」。 */
const CATALOG = Array.from({ length: 22 }, (_, i) => `s${String(i).padStart(2, '0')}`);

describe('一批的大小', () => {
  it('产品口径就是 4(2026-09-04 从 6 改的)', () => {
    /*
     * ⚠️ 6 → 4(产品口述 2026-09-04)。原来是 08-27 的裁决「点击换一批时,顺序从
     * 22 个里每次挑 6 个出来」;OPEND-2584 报「稿子 4 张、产品 6 张」之后产品改口:
     * 「VISUAL_STYLE_BATCH_SIZE 先改成 4 吧」。
     *
     * 这一条不是"照稿子改"—— `specs/current/chat-panel-feedback.md` 里有条更早的
     * 裁决说得很死:「稿子里的数据是模拟的…不能因为稿子是 4 张就不做『看全部』」,
     * 而且点名的就是这张卡。所以 4 是产品重新选的数,不是稿子推导出来的。
     * 「换一批」照旧存在(下面那几条钉着),只是一批少两张。
     */
    expect(VISUAL_STYLE_BATCH_SIZE).toBe(4);
  });

  it('首屏那一批按目录顺序取前 4 张', () => {
    expect(resolveVisualStyleBatch({ all: CATALOG, current: null, keep: [] })).toEqual([
      's00', 's01', 's02', 's03',
    ]);
  });

  it('目录不够一批时就全给出来,不补空位', () => {
    const short = ['a', 'b', 'c'];
    expect(resolveVisualStyleBatch({ all: short, current: null, keep: [] })).toEqual(short);
  });
});

describe('换一批', () => {
  it('真的换掉了 —— 整批全是新的,而且张数不变', () => {
    const first = resolveVisualStyleBatch({ all: CATALOG, current: null, keep: [] });
    const next = rotateVisualStyleBatch({ all: CATALOG, current: first, keep: [], cursor: 0 });

    expect(next.batch).toHaveLength(VISUAL_STYLE_BATCH_SIZE);
    expect(next.batch).not.toEqual(first);
    // 「换一批」不是「洗牌」:一张都不许和上一批重合,否则「换」这个字是假的
    expect(next.batch.filter((v) => first.includes(v))).toEqual([]);
  });

  /*
   * ⚠️ 一批从 6 改成 4 之后,「绕回开头」需要的点击次数跟着变了:22 张目录,
   * 每批 4 张 → 要 6 批(24 张)才盖满,也就是首屏之后再点 5 下。
   * 这个数是从目录长度和批量算出来的,不是抄来的常数 —— 目录再变时按同一条算式改。
   */
  it('顺着目录往下走,连点五下才绕回开头', () => {
    let batch = resolveVisualStyleBatch({ all: CATALOG, current: null, keep: [] });
    let cursor = 0;
    const seen: string[] = [...batch];
    for (let i = 0; i < 5; i += 1) {
      const next = rotateVisualStyleBatch({ all: CATALOG, current: batch, keep: [], cursor });
      batch = next.batch;
      cursor = next.cursor;
      seen.push(...batch);
    }
    // 22 张目录,6 批 × 4 = 24 —— 前 22 张各出现一次,最后两张是绕回来的重复
    expect(new Set(seen.slice(0, 22)).size).toBe(22);
  });
});

describe('选中的那张不许被轮换出去', () => {
  it('换一批之后它还在,而且还在原来的槽位上', () => {
    const first = resolveVisualStyleBatch({ all: CATALOG, current: null, keep: [] });
    const keep = [first[2]!]; // 第 3 张被选中(一批 4 张,所以这是倒数第二个槽)
    const next = rotateVisualStyleBatch({ all: CATALOG, current: first, keep, cursor: 0 });

    expect(next.batch).toHaveLength(VISUAL_STYLE_BATCH_SIZE);
    expect(next.batch).toContain(keep[0]);
    expect(next.batch[2]).toBe(keep[0]);
  });

  /** 负面那半的配对正面:钉住的只有那一张,别的**照换不误**。 */
  it('别的五个槽照换 —— 「保留」不是「整批不动」', () => {
    const first = resolveVisualStyleBatch({ all: CATALOG, current: null, keep: [] });
    const keep = [first[2]!];
    const next = rotateVisualStyleBatch({ all: CATALOG, current: first, keep, cursor: 0 });

    const unchanged = next.batch.filter((v, i) => v === first[i]);
    expect(unchanged).toEqual(keep);
  });

  it('连续换很多批,选中的那张一直都在', () => {
    let batch = resolveVisualStyleBatch({ all: CATALOG, current: null, keep: [] });
    const keep = [batch[0]!];
    let cursor = 0;
    for (let i = 0; i < 10; i += 1) {
      const next = rotateVisualStyleBatch({ all: CATALOG, current: batch, keep, cursor });
      batch = next.batch;
      cursor = next.cursor;
      expect(batch).toContain(keep[0]);
    }
  });

  it('选满两张时两张都留住,剩下的槽还在换', () => {
    const first = resolveVisualStyleBatch({ all: CATALOG, current: null, keep: [] });
    // 一批 4 张(2026-09-04 从 6 改的),所以取首尾两个槽而不是 1 / 4
    const keep = [first[1]!, first[3]!];
    const next = rotateVisualStyleBatch({ all: CATALOG, current: first, keep, cursor: 0 });

    expect(next.batch[1]).toBe(keep[0]);
    expect(next.batch[3]).toBe(keep[1]);
    // 留住 2 张 → 还剩 (4 - 2) 个槽该换掉;数字从批量算,别写死
    expect(next.batch.filter((v, i) => v !== first[i]))
      .toHaveLength(VISUAL_STYLE_BATCH_SIZE - keep.length);
  });

  /**
   * 「随机」是从**整份目录**里抽的(见 `pickRandomStyle`),抽中的那张很可能不在
   * 这一批里。它必须被拉进来 —— 不然用户刚抽中一张,它却不在牌面上,既看不见也取消不掉。
   */
  it('选中了一张不在这一批里的卡,它会被拉进这一批', () => {
    const first = resolveVisualStyleBatch({ all: CATALOG, current: null, keep: [] });
    const outsider = CATALOG[15]!;
    expect(first).not.toContain(outsider);

    const repaired = resolveVisualStyleBatch({ all: CATALOG, current: first, keep: [outsider] });
    expect(repaired).toContain(outsider);
    expect(repaired).toHaveLength(VISUAL_STYLE_BATCH_SIZE);
  });
});

describe('目录换了(切换产物类型)时自愈', () => {
  it('上一批里已经不在目录中的值被丢掉,并补满一批', () => {
    // 一批 4 张:两张已下架 + 两张还在,补完仍是 4 张且认得的留在原槽
    const stale = ['gone-1', 'gone-2', 's03', 's04'];
    const batch = resolveVisualStyleBatch({ all: CATALOG, current: stale, keep: [] });

    expect(batch).toHaveLength(VISUAL_STYLE_BATCH_SIZE);
    expect(batch.every((v) => CATALOG.includes(v))).toBe(true);
    expect(new Set(batch).size).toBe(VISUAL_STYLE_BATCH_SIZE);
    // 还认得的那几张留在自己的槽位上
    expect(batch[2]).toBe('s03');
    expect(batch[3]).toBe('s04');
  });

  it('一批里永远没有重复', () => {
    let batch = resolveVisualStyleBatch({ all: CATALOG, current: null, keep: [] });
    let cursor = 0;
    for (let i = 0; i < 12; i += 1) {
      const next = rotateVisualStyleBatch({ all: CATALOG, current: batch, keep: [batch[0]!], cursor });
      batch = next.batch;
      cursor = next.cursor;
      expect(new Set(batch).size).toBe(batch.length);
    }
  });
});
