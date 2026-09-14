/**
 * 工具行 / 壳头上的那几个数字怎么写。
 *
 * 一条硬规矩(踩坑:界面上出过「0.0s」):**拿不到就不显示,不估算、不编数**。
 * codex 的 `tool_use` 在 `item.completed` 才发出,和 `tool_result` 同时到达,
 * 算出来的耗时是 0 —— 那不是「跑得快」,是「不知道」(规格 §2.2b / W10)。
 */

/** 调用与结果同批到达时算出来的差值,不是真耗时 */
export const UNKNOWN_ELAPSED_BELOW_MS = 100;

/** 工具行、任务步骤:0.4s / 18.2s / 1m 12s */
export function formatElapsed(ms: number | null | undefined): string | null {
  if (ms == null || !(ms >= 0)) return null;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

/**
 * 执行记录头上的耗时:比工具行粗一档 —— 31s / 1m 12s;
 * 10s 以内保留一位小数;不足 1s 当未知(壳刚出现的那一瞬不显示「0s」)。
 */
export function formatShellElapsed(ms: number | null | undefined): string | null {
  if (ms == null || !(ms >= 1000)) return null;
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

/**
 * 思考行上那个 token 估算值:`950` / `1k` / `3.3k`。
 *
 * 门槛压在 **1000**,和这个仓库里另外三份 k 缩写一致:满一千才收,`950` 照写原数。
 * 收的时候**四舍五入**(`3278` → `3.3k`),不截断 —— `ChatPane` 那份
 * `compactCount` 走的是 `Math.floor`,同一个数会写成 `3.2k`,差一位读起来像少想了。
 *
 * **没有 M 档,是有意的。** 这个数是**单个 thinking 块**的累计估算,上限由模型的
 * thinking 预算兜着(claude 最大 64k 量级),百万级永远到不了 —— 写一档到不了的
 * 分支就是死码,而死码会让下一个人以为它被验证过。
 *
 * 为什么不复用现成的三份:`compactCount`(`ChatPane.tsx`)截断且没有有限性守卫;
 * `formatStars` / `formatDiscordPresenceCount` 数学对,但一个住在 GitHub star 钩子里、
 * 一个住在 Discord 在线数钩子里,名字和归属都不是这件事。执行记录上的数字怎么写,
 * 这个文件是唯一出处(`formatElapsed` / `formatShellElapsed` 都在这儿),
 * 新的一枚就该落在同一处,而不是从别的域里借一个名字。
 *
 * 拿不到就返回 `null`,与本文件开头那条硬规矩同一条:不估算、不编数。
 */
export function formatThinkingTokens(count: number | null | undefined): string | null {
  if (count == null || !Number.isFinite(count) || count <= 0) return null;
  if (count < 1000) return String(Math.round(count));
  return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`;
}

/** 音频产物另一套写法(组件 24):分钟不补零、秒补两位 */
export function formatDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 决定产物卡形态:只有 html 有「发布」(D28) */
export type ArtifactKind = 'html' | 'image' | 'video' | 'audio' | 'doc';

export function artifactKind(path: string): ArtifactKind {
  const p = String(path ?? '').toLowerCase();
  if (/\.html?$/.test(p)) return 'html';
  if (/\.(png|jpe?g|gif|webp|avif|svg)$/.test(p)) return 'image';
  if (/\.(mp4|webm|mov)$/.test(p)) return 'video';
  if (/\.(mp3|wav|m4a|ogg)$/.test(p)) return 'audio';
  return 'doc';
}

/** 主产物的判据(与 daemon `primaryArtifactChangeForRun` 认的后缀一致);md / csv 不是主产物 */
export function isArtifactPath(path: string): boolean {
  return artifactKind(path) !== 'doc';
}

export interface DiffStat { added: number; removed: number }

/** 非负整数才算数:NaN / 负数 / 字符串都当没给 */
function countedLines(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * 改动量:多数 agent 把原料放在入参里(Write 的 `content`、Edit 的新旧串),自己数行。
 * 数不出来就返回 null —— 那一行改显示耗时,而不是显示 `+0 -0`。
 *
 * 例外是 codex:它的 app-server 线缆在文件变更旁边直接带补丁,补丁大的有两万多字符,
 * 塞进事件流会让每条消息的落盘体积暴涨。所以 daemon 在
 * `runtimes/json-event-stream.ts` 里当场数完就把补丁丢掉,只把两个数字放进
 * `od_diff_stat`。这里认这个字段,算法和下面两支是同一套(见那边的注释),
 * 不是第二套统计口径。带了就优先用:数过的 agent 比这里拿半截入参再数一遍准。
 */
export function diffStat(toolName: string, input: unknown): DiffStat | null {
  const name = String(toolName ?? '').toLowerCase();
  const rec = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const carried = rec.od_diff_stat;
  if (carried && typeof carried === 'object') {
    const added = countedLines((carried as Record<string, unknown>).added);
    const removed = countedLines((carried as Record<string, unknown>).removed);
    if (added != null && removed != null) return { added, removed };
    return null;
  }
  if ((name === 'write' || name === 'write_file') && typeof rec.content === 'string') {
    return { added: rec.content.split('\n').length, removed: 0 };
  }
  if (name === 'edit' && typeof rec.old_string === 'string') {
    const next = typeof rec.new_string === 'string' ? rec.new_string : '';
    return { added: next.split('\n').length, removed: rec.old_string.split('\n').length };
  }
  return null;
}

export const basename = (p: string): string =>
  String(p ?? '').replace(/^['"]|['"]$/g, '').split(/[\\/]/).pop() ?? '';

/**
 * 长文件名的省略 —— **后缀永远可见**,省的是主名。
 *
 * 稿子第 4 格那一行在源文件里就是截好的:
 * `设置页-会员中心-商品卡对齐稿-第三轮评审-f….png`(43 字 → 28 字,后缀完整)。
 * 由此定下预算 28:后缀 4 + 省略号 1 + 主名 23。
 *
 * 为什么不靠 CSS `text-overflow`:文件名包在 `<button><code>` 里,对 flex 收缩来说
 * 是**一个原子块** —— 要么整块放下,要么整块被省略号顶掉,于是行里只剩一个「…」,
 * 后缀没了,同一行的耗时还被推到行尾。截在字符串上才截得准。
 *
 * 也不按像素量:量宽度要读布局、会随字体和容器抖,而且没法在纯函数里测。
 * 字符预算是确定的,和稿子那一行对得上就够。
 */
export function elideFileName(name: string, max = 28): string {
  const raw = String(name ?? '');
  if (raw.length <= max) return raw;
  // 前导点是隐藏文件的一部分,不是后缀分隔符(`.gitignore` 整体是主名)
  const dot = raw.lastIndexOf('.');
  const ext = dot > 0 ? raw.slice(dot) : '';
  // 后缀本身就长得离谱时(多半根本不是后缀)不给它留位置,否则主名会被挤成零
  const keepExt = ext.length > 0 && ext.length <= 8 ? ext : '';
  const head = Math.max(1, max - keepExt.length - 1);
  return `${raw.slice(0, head)}…${keepExt}`;
}
