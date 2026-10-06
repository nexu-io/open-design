/*
 * 从一条助手回复「新开会话」出来的新会话叫什么。
 *
 * 2026-09-03 产品裁决:不再叫「{原标题} 分叉」,改成在源标题后面接一个自增编号
 * 「{原标题} (n)」,n 从 1 起。裁决同时定死了两件事:
 *
 *   * **不迁移老会话**。已经叫「商品列表页 分叉」的照旧叫这个名字,它的新会话是
 *     「商品列表页 分叉 (1)」—— 老标题整个当基名,「分叉」两个字不剥。线上会长期
 *     并存两种命名。
 *   * **已有的编号要剥掉重算**。从「商品列表页 (1)」再开一个是「商品列表页 (2)」,
 *     不是「商品列表页 (1) (1)」。
 *
 * 编号在**一个项目**内唯一 —— 这是产品已有的会话分组范围(`listConversations` 就是
 * 按 project_id 取的,侧栏也按项目分组),不是新发明的口径。
 */

/**
 * 「我们自己发得出来的编号」的形状:一个半角空格 + 半角括号 + 1~3 位、无前导零的正整数。
 *
 * 「我们加的编号」和「用户名字里碰巧有的括号数字」在文本上没有干净的分界 —— 唯一
 * 站得住的判据就是**我们自己只发这一种形状**。于是年份形态的「方案 (2024)」(四位)、
 * 全角括号的「方案 (2)」、带前导零的「方案 (01)」都不会被误当成编号:它们进来是什么样,
 * 就整个当基名带走。代价写在这儿备查:真有人把会话命名成「预算 (3)」,再从它新开一个
 * 会拿到「预算 (4)」而不是「预算 (3) (1)」。
 */
const OUR_NUMBER_SUFFIX = / \((\d{1,3})\)$/;

interface NumberedTitle {
  /** 去掉编号之后的基名,末尾不带空白。 */
  base: string;
  n: number;
}

/** 认出一个标题是不是「基名 + 我们加的编号」;不是就返回 null。 */
function splitOurNumbering(title: string): NumberedTitle | null {
  const match = OUR_NUMBER_SUFFIX.exec(title);
  if (!match) return null;
  const digits = match[1];
  if (!digits) return null;
  // 前导零(`(01)`)不是我们发得出来的形状。
  if (digits.length > 1 && digits.startsWith('0')) return null;
  // `(0)` 同理 —— 编号从 1 起,我们发不出 0。(`\d{1,3}` 解出来必然是 0..999 的整数,
  // 所以这里只需要挡下界。)
  const n = Number(digits);
  if (n < 1) return null;
  // 多余空白(`商品列表页  (1)`)同样不是我们发得出来的形状 —— 正则会咬住**第二个**
  // 空格,基名末尾就剩一个空格。不挡住它,一个用户手起的标题会被悄悄剥掉一截。
  // (基名不可能为空:两个调用点传进来的都是 trim 过的非空标题,`(1)` 前面没有空格
  // 也就匹配不上。)
  const base = title.slice(0, match.index);
  if (base !== base.trimEnd()) return null;
  return { base, n };
}

/**
 * 源会话标题 + 这个项目里已有的全部标题 → 新会话该叫什么。源会话没有标题就返回
 * `null`(无名会话的新会话照旧无名,不硬造一个)。
 *
 * 空档不回填:已有 (1) 和 (3) 时下一个是 (4),不是 (2)。回填会让刚被删掉的那个名字
 * 原地复活,在侧栏里看起来像「删除没生效」;取 max+1 之后编号单调递增,永远指向
 * 「这是第几次从这条会话开新的」。
 */
export function nextForkedConversationTitle(
  sourceTitle: string | null | undefined,
  existingTitles: Iterable<string | null | undefined>,
): string | null {
  const source = (sourceTitle ?? '').trim();
  if (!source) return null;
  const base = splitOurNumbering(source)?.base ?? source;
  let highest = 0;
  for (const raw of existingTitles) {
    const title = (raw ?? '').trim();
    if (!title) continue;
    const numbered = splitOurNumbering(title);
    if (!numbered || numbered.base !== base) continue;
    if (numbered.n > highest) highest = numbered.n;
  }
  return `${base} (${highest + 1})`;
}
