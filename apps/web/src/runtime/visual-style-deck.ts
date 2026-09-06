/**
 * 视觉方向那一沓的**牌面** —— 每次露面的是目录里的哪 6 张。
 *
 * 产品口径(2026-08-27,逐字):
 *
 *   「点击换一批时,顺序从 22 个里每次挑 6 个出来」
 *   「但如果用户选中了一个,那要保留选中的这个,不能把用户选中的给轮换出去了,
 *     不然无法取消选择了」
 *   「然后点击右上角展开成列表按钮时,只展开这次的 6 个」
 *
 * 这三句描述的是**同一个**东西:一批 6 张。叠放态在它上面翻,网格态把它整批铺开,
 * 「换一批」换掉它里面没被选中的那些。
 *
 * ## 它替换掉了什么
 *
 * 2026-08-26 的裁决是「整份目录进一沓」:25 张全塞进这一沓,「换一批」把整个数组
 * 转过去。那一版有个走不通的地方 —— 叠放态**只有最前面那张能点**(稿子:
 * 「勾选圈只在最前面那张给……画一个点不到的控件是骗人」),而「换一批」会把
 * 已经选中的那张转到看不见的位置。用户于是看得见自己选了两项(题干写着
 * 「最多选 2 项」),却再也找不到那张卡把它取消掉,这道题就此**改不了答案**。
 * 产品第二句说的正是这个。
 *
 * ## 为什么槽位要稳定
 *
 * 「保留」按字面实现:选中的那张占住它**原来的槽**,「换一批」只填别的槽。
 * 另一条路是把选中的顶到队首 —— 在叠放态里看不出来(能点的本来就只有最前面那张),
 * 但网格态是 6 张平铺:在网格里点第 5 张,它会当场跳到第 1 格、整排跟着重排。
 * 那个位移没人要过。
 *
 * ## 这个模块不碰 DOM
 *
 * 按 `components/chat/AGENTS.md` §1 的判断顺序:不碰 DOM、可纯函数测试 → 进 `runtime/`。
 * 组件那边只负责把 `keep`(当前选中的值)和 `cursor` 递进来。
 */

/**
 * 一批 4 张 —— 产品口径(2026-09-04 从 6 改的)。
 *
 * 原来是 6,依据是 08-27 的裁决「点击换一批时,顺序从 22 个里每次挑 6 个出来」。
 * OPEND-2584 报「稿子画 4 张、产品出 6 张」之后产品改口:「先改成 4 吧」。
 *
 * ⚠️ **这不是"照稿子改"**,别这么理解也别这么传。`chat-panel-feedback.md` 里有条
 * 更早、更硬的裁决,而且点名的就是这张卡:「设计稿里的数据是模拟的…**不能因为
 * 稿子是 4 张就不做「看全部」**」。所以 4 是产品重新选的一个数,不是从稿子推出来的
 * 规格 —— 「换一批」照旧存在,只是一批少两张。
 */
export const VISUAL_STYLE_BATCH_SIZE = 4;

interface BatchInput {
  /** 整份目录的值,按目录顺序。 */
  all: readonly string[];
  /** 上一批的牌面。首屏给 `null`。 */
  current: readonly string[] | null;
  /** 【不许被轮换走】的那些 —— 也就是用户已经选中的值。 */
  keep: readonly string[];
  size?: number;
  /** 下一次从目录的第几张开始补。 */
  cursor?: number;
}

/**
 * 把一份可能已经过时的牌面**修回**一批合法的 6 张。
 *
 * 每次渲染都跑一遍,所以组件那边存的 `current` 只是个**提示**,不是真相:
 *  · 目录换了(切换产物类型)→ 认不出来的值直接丢掉,空出来的槽从目录头上补;
 *  · 「随机」从整份目录里抽中了一张不在牌面上的 → 把它**拉进来**,
 *    不然用户刚抽中一张,它却不在牌面上,既看不见也取消不掉。
 */
export function resolveVisualStyleBatch({
  all,
  current,
  keep,
  size = VISUAL_STYLE_BATCH_SIZE,
}: BatchInput): string[] {
  const known = new Set(all);
  if (all.length <= size) return [...all];

  const slots: (string | null)[] = Array.from({ length: size }, (_, i) => {
    const value = current?.[i];
    return value !== undefined && known.has(value) ? value : null;
  });
  dedupe(slots);
  pullIn(slots, keep, known);
  fill(slots, all, 0);
  return slots as string[];
}

/**
 * 换一批:留下 `keep` 占着的槽,其余的槽从 `cursor` 起按目录顺序重新填。
 *
 * 填的时候**跳过上一批出现过的值** —— 「换」这个字要求这一批和上一批不重合,
 * 光靠 `cursor` 往前走是不够的:被钉住的槽会让 `cursor` 和槽位数对不齐,
 * 几轮之后就会填回刚换掉的那几张。
 */
export function rotateVisualStyleBatch({
  all,
  current,
  keep,
  cursor = 0,
  size = VISUAL_STYLE_BATCH_SIZE,
}: BatchInput): { batch: string[]; cursor: number } {
  const known = new Set(all);
  if (all.length <= size) return { batch: [...all], cursor };

  const kept = new Set(keep.filter((v) => known.has(v)));
  const previous = new Set((current ?? []).filter((v) => known.has(v)));

  const slots: (string | null)[] = Array.from({ length: size }, (_, i) => {
    const value = current?.[i];
    return value !== undefined && kept.has(value) ? value : null;
  });
  dedupe(slots);
  pullIn(slots, keep, known);
  const nextCursor = fill(slots, all, cursor, previous);
  return { batch: slots as string[], cursor: nextCursor };
}

/** 同一个值只许占一个槽 —— 后面那个让位。 */
function dedupe(slots: (string | null)[]): void {
  const seen = new Set<string>();
  for (let i = 0; i < slots.length; i += 1) {
    const value = slots[i];
    // `noUncheckedIndexedAccess`:索引读出来还带着 `undefined`,`!== null` narrow 不掉
    if (value == null) continue;
    if (seen.has(value)) slots[i] = null;
    else seen.add(value);
  }
}

/** 把还没上牌面的 `keep` 塞进来,挤掉一个没被钉住的槽(从后往前挤)。 */
function pullIn(slots: (string | null)[], keep: readonly string[], known: Set<string>): void {
  const present = new Set(slots.filter((v): v is string => v != null));
  const kept = new Set(keep.filter((v) => known.has(v)));
  for (const value of kept) {
    if (present.has(value)) continue;
    let at = slots.indexOf(null);
    if (at === -1) {
      for (let i = slots.length - 1; i >= 0; i -= 1) {
        const occupant = slots[i];
        if (occupant != null && !kept.has(occupant)) {
          at = i;
          break;
        }
      }
    }
    if (at === -1) return; // 钉住的比槽还多:轮不到它,交给上限逻辑去挡
    const evicted = slots[at];
    if (evicted != null) present.delete(evicted);
    slots[at] = value;
    present.add(value);
  }
}

/**
 * 把空槽从 `from` 起按目录顺序补满,返回下一次该从哪张开始。
 * `avoid` 里的值这一轮不用(「换一批」用它把上一批整个躲开)。
 */
function fill(
  slots: (string | null)[],
  all: readonly string[],
  from: number,
  avoid: ReadonlySet<string> = new Set(),
): number {
  const present = new Set(slots.filter((v): v is string => v != null));
  let cursor = ((from % all.length) + all.length) % all.length;
  let scanned = 0;
  /* 目录可能不够「既躲开上一批又填满」(比如 22 张里钉了 2 张、上一批占了 6 张),
     所以躲不开时退而求其次:第二轮只保证不重复。 */
  for (const skipPrevious of [true, false]) {
    for (let i = 0; i < slots.length; i += 1) {
      if (slots[i] !== null) continue;
      scanned = 0;
      while (scanned < all.length) {
        const candidate = all[cursor]!;
        cursor = (cursor + 1) % all.length;
        scanned += 1;
        if (present.has(candidate)) continue;
        if (skipPrevious && avoid.has(candidate)) continue;
        slots[i] = candidate;
        present.add(candidate);
        break;
      }
    }
    if (!slots.includes(null)) break;
  }
  return cursor;
}
