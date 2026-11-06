/**
 * 用户消息附件卡的纯数据规则(设计稿组件 2,第 52–59 格)。
 *
 * 这里只放**不碰 DOM** 的那一半:体积怎么写、文件名从哪儿切、时间怎么写。
 * 需要量像素的那一半(可用宽度、是否被截断)留在组件里,靠注入 `measure` 反过来
 * 喂给这里的纯函数 —— 这样切法本身可以不启 jsdom 直接单测。
 */

/* ── 体积:12 KB / 4 KB(#56)────────────────────────────────────────
 * 拿不到就返回 null。**不要**回落成 `0 B` 或 `—`:那是编数,
 * 而「这个文件多大」在附件卡上本来就是可以缺席的信息(AGENTS §3)。 */
export function formatAttachmentSize(bytes: number | null | undefined): string | null {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.max(1, Math.round(kb))} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/* ── 主名 / 后缀(#56)──────────────────────────────────────────────
 * 后缀**永不参与截断**:整串一起截会从尾巴吃起,
 * 「商品卡组件规格说明终稿.md」先变成「商品卡组件规格说明终…」——
 * 截掉的正好是唯一能说明它是什么的那几个字符。 */
export function splitFileName(name: string): { base: string; ext: string } {
  const raw = String(name ?? '');
  const dot = raw.lastIndexOf('.');
  // 开头的点是隐藏文件(`.gitignore`),不是后缀;没有点就整串都是主名。
  if (dot <= 0 || dot === raw.length - 1) return { base: raw, ext: '' };
  return { base: raw.slice(0, dot), ext: raw.slice(dot) };
}

/**
 * 末尾要保住的那「一个词」(#59)。
 *
 * 稿子的规则原话:中文留最后 2–3 字,拉丁留最后一个单词,`-v3` 这种版本尾巴
 * 算作一个词。三条按这个顺序试:
 *   `跨端适配检查清单-v3`           → `-v3`
 *   `Q3-marketing-plan-final`      → `final`
 *   `商品卡组件规格说明终稿-第三轮评审后` → `评审后`
 */
export function fileNameTail(base: string): string {
  const raw = String(base ?? '');
  // 尾巴不能吃掉半个名字。`截屏-2026-08-17-15.18.32` 这种名字整条尾巴都能被当成
  // 「版本号」,留下来就没有头段了 —— 而头段才是「这是哪个东西」。
  // 超过预算的候选直接退到下一条规则。
  const cap = Math.max(3, Math.min(8, Math.floor(raw.length / 3)));
  const version = /[-_](?:v|V)?\d+(?:[.\-]\d+)*$/.exec(raw);
  if (version && version[0].length <= cap) return version[0];
  const latin = /[A-Za-z0-9]+$/.exec(raw);
  if (latin && latin[0].length >= 2 && latin[0].length <= cap) return latin[0];
  return raw.slice(-3);
}

export const NAME_ELLIPSIS = '…';

/**
 * 中间省略(#59)。`text-overflow` 只认两端,所以这一段必须自己算。
 *
 * `maxWidth` 是**行宽倒推**出来的可用像素(行宽 − 内边距 − 图标 − gap − 后缀宽),
 * 由调用方量好传进来 —— 关键是它**不能拿被截短之后的名字再去量**:
 * 名字一短容器跟着变窄,下次量到的就是缩过的值,只会越截越短、永远长不回去
 * (稿子 `budgetFor()` 记的那个棘轮)。组件侧靠给文本列 `flex:1` 把宽度钉成常量。
 *
 * 量不到宽度(SSR / jsdom / 拿不到 canvas)时**原样返回**,交给 CSS 的
 * `overflow:hidden` 兜底 —— 宁可不截,不要截错。
 */
export function middleTruncateFileName(
  base: string,
  maxWidth: number,
  measure: ((text: string) => number) | null | undefined,
): string {
  const raw = String(base ?? '');
  if (!measure || !(maxWidth > 0)) return raw;
  if (measure(raw) <= maxWidth) return raw;

  const tail = fileNameTail(raw);
  // 尾巴已经等于整串了,截了也换不来任何空间。
  if (tail.length >= raw.length) return raw;

  const suffix = NAME_ELLIPSIS + tail;
  if (measure(suffix) > maxWidth) return suffix;

  // 头段二分:取「放得下的最长的那一版」。头段永远不与尾巴重叠。
  let lo = 0;
  let hi = raw.length - tail.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(raw.slice(0, mid) + suffix) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return raw.slice(0, lo) + suffix;
}

/* ── 发送时间:14:31(#50 / #51)────────────────────────────────────
 * 走 24 小时制的本地时间,不走 locale —— 稿子写死的就是 `14:31` 这个形状,
 * 换成 `2:31 PM` 会把那一行撑宽、和右缘对不齐。 */
export function formatMessageClock(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
