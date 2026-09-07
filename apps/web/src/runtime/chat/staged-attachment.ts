/**
 * 待发送附件托盘的纯数据规则(设计稿组件 21,第 60–64 格)。
 *
 * 托盘里同时躺着两种东西:**已经传上去的**(有 `path`,能跟着这条消息发出去)和
 * **还在传 / 传失败的**(只有本地 `File`,发不出去)。稿子把它们画成同一张卡,
 * 只靠叠加物区分状态 —— 所以这里的活就是把两条列表并成一排卡片,
 * 顺序按用户当初挑文件的顺序,而不是「谁先传完谁在前」。
 *
 * 这一层**不碰 DOM、不碰 fetch**:合并规则可以脱离 jsdom 直接单测,
 * 组件那边只负责把上传结果喂进来。
 */

/** 与 `providers/registry.ts` 的 `looksLikeImage()` 同一份名单。 */
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;

/**
 * 本地文件先猜一次「有没有画面」,好在上传的那几秒就把方卡摆出来。
 *
 * 只是**乐观占位**:真正的 `kind` 以服务端回来的那份为准(同名不同内容、
 * 服务端改名都可能让结论变),所以这里猜错的代价只有几秒钟的卡片形状。
 * 先认 MIME(拖进来的截图常常没有扩展名),再退回扩展名。
 */
export function looksLikeImageName(name: string, mimeType?: string | null): boolean {
  if (typeof mimeType === 'string' && mimeType.startsWith('image/')) return true;
  return IMAGE_EXT.test(String(name ?? ''));
}

/** 上传中 / 上传失败的那张占位卡。只有本地信息,没有 `path`。 */
export interface PendingUpload {
  /** 稳定 key。**不能用文件名** —— 同名文件能一次选两个(不同目录拖进来)。 */
  id: string;
  name: string;
  kind: 'image' | 'file';
  size?: number;
  /** 用户挑文件时的序号,决定它排在托盘的第几位 */
  order: number;
  state: 'uploading' | 'failed';
  /** `URL.createObjectURL` 出来的本地缩略图;拿不到就没有 */
  previewUrl?: string | null;
}

export interface StagedAttachmentInput {
  path: string;
  name: string;
  kind: 'image' | 'file';
  size?: number;
  order?: number;
}

export interface StagedAttachmentCard {
  key: string;
  name: string;
  kind: 'image' | 'file';
  size?: number;
  order: number;
  state: 'ready' | 'uploading' | 'failed';
  /** `ready` 才有;它是「这张卡能不能跟着发出去」的唯一判据 */
  path?: string;
  previewUrl?: string | null;
  /** `uploading` / `failed` 才有:重试和移除要按它找回本地 `File` */
  pendingId?: string;
}

/**
 * 把「已上传」和「在传 / 传失败」并成一排卡。
 *
 * 排序按 `order`(用户挑文件的顺序),**不按完成先后**:并发上传时先传完的
 * 那张会插到前面去,一排卡在几秒内自己重排一遍,人会以为自己点错了。
 * `order` 缺席的老数据退回数组位置,和 `ChatAttachment.order` 的约定一致。
 */
export function buildStagedAttachmentCards(
  staged: readonly StagedAttachmentInput[],
  pending: readonly PendingUpload[],
): StagedAttachmentCard[] {
  const cards: Array<StagedAttachmentCard & { seq: number }> = [];
  staged.forEach((item, index) => {
    cards.push({
      seq: index,
      key: `staged:${item.path}`,
      name: item.name,
      kind: item.kind,
      ...(item.size != null ? { size: item.size } : {}),
      order: item.order ?? index,
      state: 'ready',
      path: item.path,
    });
  });
  pending.forEach((item, index) => {
    cards.push({
      seq: staged.length + index,
      key: `pending:${item.id}`,
      name: item.name,
      kind: item.kind,
      ...(item.size != null ? { size: item.size } : {}),
      order: item.order,
      state: item.state,
      ...(item.previewUrl ? { previewUrl: item.previewUrl } : {}),
      pendingId: item.id,
    });
  });
  // `order` 撞车时靠 `seq` 兜底,保证排序是稳定的 —— 不稳的话每次 render
  // 都可能换一次相对位置,而 React 的 key 没变,看起来就是卡片自己在跳。
  cards.sort((a, b) => (a.order - b.order) || (a.seq - b.seq));
  return cards.map(({ seq: _seq, ...card }) => card);
}

/**
 * 一次挑了 N 个文件,同时开几路上传。
 *
 * 逐文件上传是稿子要的(每张卡各自转、各自失败、各自重试),但一路一路排队传
 * 会让第 6 个文件干等前面五个 —— 原来那版一次 12 个打包发,快是快在这儿。
 * 4 是折中:并发够高,又不至于把一次拖进来的几十张图同时压给 daemon。
 */
export const STAGED_UPLOAD_CONCURRENCY = 4;

/**
 * 有序地跑一批任务,同时最多 `limit` 个在飞。返回值与输入**同序**,
 * 这样调用方不必再按完成顺序把结果对回去。
 */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  const width = Math.max(1, Math.floor(limit));
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (index >= items.length || item === undefined) return;
      out[index] = await run(item, index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, items.length) }, worker));
  return out;
}
