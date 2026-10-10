/**
 * 会话产物的**版本身份**:把 daemon 投影在消息上的 `artifactRefs` 收成产物卡能用的形状。
 *
 * 产品裁决(会话栏产物版本语义,`specs/current/chat-artifact-versioning-design.md`
 * §3.2 / §4 / §8):
 *
 * | 产物 | 卡面 | 点击 |
 * | --- | --- | --- |
 * | HTML / 原型 / slide / 文档 | **当轮的静态首屏截图**(冻结,不跟 latest 漂) | 工作区**最新版本** |
 * | 图片 | 当轮的**不可变真图快照**(冻结) | 工作区**最新版本** |
 *
 * 点击那一列 2026-09-02 由用户统一:「html 和图片都是,产物缩略是快照,但跳过去
 * 产物永远指向最新的」。**两种类型同一条规则,没有例外。**
 *
 * 卡面和点击因此是**故意不一致**的 —— 卡面回答「那一轮产出了什么」,点击回答
 * 「现在是什么」。这不是待修的 bug。
 *
 * 于是这个模块**只交卡面用的 URL,不交任何点击目标**。点击目标是宿主自己的事:
 * 它拿文件名去开工作区最新那一份。曾经这里还会在 `openPolicy==='snapshot'` 时
 * 把 `snapshotId` 交出去当点击目标,那条链路一路传到宿主才被「只收一个参数」
 * 悄悄丢掉 —— 看起来像个待接的 bug,接上去正好做出用户否掉的行为。整条拆掉,
 * 「点开永远最新」才是有意为之而不是意外。
 *
 * ── 拿不到快照的时候 ────────────────────────────────────────────────────
 * 旧会话、截图失败、desktop renderer 不在、配额满,都会没有当轮快照。这时候:
 *
 *  · HTML 系 → 卡面**降级成 live iframe 显示最新 html**(`FileOpsSummary` 那一支);
 *  · 图片   → 卡面**显示当前同名文件**。
 *
 * 两条都**不出占位、不写「不可用 / 失败」**。产品原话:「不允许退回不就一个错误
 * 文案显示在上面了?这感觉更奇怪呢」。
 *
 * 因此这个模块只做一件事:**只有 `ready` 的快照才交出 URL**。`pending` /
 * `failed` / `legacy_unavailable` 一律交空,让卡自己走降级支 —— 把一个还没好的
 * 快照 URL 交出去,卡面会是一张碎图,那比降级更糟。
 *
 * ── 为什么类型定在 web 而不是 contracts ──────────────────────────────────
 * 线上 DTO(`ChatArtifactRef`)属于 `packages/contracts`,和 daemon 侧同一批次落地,
 * 由 daemon 那条线拥有。这里定义的是**读取端的收敛器**:它接 `unknown`,因为在
 * contracts 落地之前 `ChatMessage` 上还没有这个字段,而落地之后旧客户端/旧消息
 * 里也仍然可能没有它。等 contracts 的类型可用,把下面 `ChatArtifactRefLike` 换成
 * `import type { ChatArtifactRef }` 即可,收敛逻辑本身不变 —— 它守的是
 * 「只信 ready」这条语义,不是类型形状。
 */

/**
 * 卡面要画的那张图 —— **只有卡面**。
 *
 * 这里没有、也不该有「点击目标」:点击一律是工作区最新文件,宿主拿文件名就够了。
 */
export interface ArtifactRefTargets {
  /**
   * 当轮**静态首屏截图**的 URL(HTML / 原型 / slide / 文档)。
   * 卡面读它;拿不到就降级 live iframe 显示最新。
   */
  coverUrl?: string;
  /** 当轮**不可变真图快照**的 URL(图片)。卡面读它、导出也导它 —— 但点击不开它。 */
  snapshotUrl?: string;
}

/**
 * `packages/contracts` 里 `ChatArtifactRef` 的读取端镜像(设计文档 §3.2)。
 * 全部字段可选:这是从 `unknown` 收敛出来的东西,不是写入端契约。
 */
interface ChatArtifactRefLike {
  label?: unknown;
  displayPolicy?: unknown;
  thumbnailUrl?: unknown;
  snapshotUrl?: unknown;
  snapshotState?: unknown;
}

/*
 * 读取端**刻意不认** `openPolicy` / `snapshotId`。
 *
 * 线上仍然会有宣布 `openPolicy:'snapshot'` 的旧 daemon 和旧消息 —— 收下来当数据
 * 无所谓,但它一个字都不该影响点击去哪。不在这里给它留一个字段名,就没人能顺手
 * 把它接回去。
 */

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

/**
 * 从一条消息上取 `artifactRefs`。
 *
 * 单独一个函数,是为了让调用点(`AssistantMessage`)不必写 `as unknown as {...}`:
 * 这个字段在 contracts 落地前不在 `ChatMessage` 的类型里,落地后旧消息也可能没有。
 */
export function messageArtifactRefs(message: unknown): unknown {
  if (!message || typeof message !== 'object') return undefined;
  return (message as { artifactRefs?: unknown }).artifactRefs;
}

/**
 * 把 refs 收成 `label -> targets` 的索引。
 *
 * `label` 就是产物卡的 `name`(项目相对路径),两边用同一个键 —— 卡片是按名字去重的
 * (`FileOpsSummary` 的 `rawCardItems`),索引也必须按名字,否则同一份产物会配不上。
 */
export function indexArtifactRefs(input: unknown): Map<string, ArtifactRefTargets> {
  const index = new Map<string, ArtifactRefTargets>();
  if (!Array.isArray(input)) return index;

  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const ref = raw as ChatArtifactRefLike;
    const label = text(ref.label);
    if (!label) continue;

    /*
     * **只信 ready**。pending 的快照还没写完,failed / legacy_unavailable 的
     * 压根不存在 —— 三种情况交出去的 URL 都会变成卡面上的一张碎图,而降级支
     * (live iframe / 当前文件)本来就是一张正常卡面。
     */
    if (ref.snapshotState !== 'ready') continue;

    const targets: ArtifactRefTargets = {};

    /*
     * 用哪个 URL 由 **daemon 宣布的 policy** 决定,不由 Web 猜后缀:同一个
     * `.html` 既可能是「latest + 静态封面」,也可能(未来)是别的语义,权威在
     * 产出侧。Web 猜一遍等于把语义抄了第二份。
     */
    if (ref.displayPolicy === 'latest_with_static_preview') {
      const coverUrl = text(ref.thumbnailUrl);
      if (coverUrl) targets.coverUrl = coverUrl;
    } else if (ref.displayPolicy === 'immutable_snapshot') {
      const snapshotUrl = text(ref.snapshotUrl);
      if (snapshotUrl) targets.snapshotUrl = snapshotUrl;
    }

    if (Object.keys(targets).length > 0) index.set(label, targets);
  }

  return index;
}
