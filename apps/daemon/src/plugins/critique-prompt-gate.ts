/**
 * 评审剧场 atom 的**提示词注入门**。
 *
 * ── 为什么需要它 ──
 *
 * 评审剧场有**两个入口**,而 2026-08-26 下线时(`CRITIQUE_THEATER_RETIRED`,
 * commit `52131c2cf6`)只关了其中一个:
 *
 *   1. **协议注入** —— `prompts/system.ts` 的 `renderPanelPrompt`,由
 *      `isCritiqueEnabled()`(`critique/rollout.ts`)把关。**这条关掉了。**
 *   2. **atom body 注入** —— 默认 scenario 的 `critique` 阶段声明
 *      `atoms: ['critique-theater']`(`plugins/_official/scenarios/` 下的
 *      `od-default` 与 `od-new-generation`;`ensure-core-stages.ts` 还会给
 *      缺它的 pipeline 补上),于是
 *      `loadAtomBodies` → `renderActiveStageBlocks` 把那个 atom 的 SKILL.md 正文
 *      原样内联进系统提示词,标题叫 `## Active stage: critique`。
 *      **这条从来没有人关。** 两条路在代码上没有任何关联,
 *      `isCritiqueEnabled()` 只被第 1 条消费。
 *
 * 后果不是"多一段没用的提示词",而是**互相矛盾的一段**:atom 的 SKILL.md 写着
 * "Follow the daemon-injected tagged protocol exactly",而那份协议已经被闸关掉、
 * 永远不会注入。模型看见一个"active stage"叫 critique-theater、被要求严格遵守一份
 * 它拿不到的协议,于是**照着 SKILL.md 的英文散文把线格式现编出来**,原样打进聊天正文。
 * 用户连着撞到五次。
 *
 * ── 这个模块钉住的不变式 ──
 *
 *   **协议注入了,body 才注入。** 两者同生同死,由同一个判据决定。
 *
 * 所以门收的是 `critiqueEnabled` —— 调用方传的就是 server.ts 里那个
 * `critiqueShouldRun`(它已经把 rollout 闸、brand/skill 齐备、非媒体面、
 * plain adapter 全算进去了,正是"协议会不会注入"的答案)。这里**不自己重算**一遍
 * 判据:重算就是第三个入口,下一次下线又会漏掉一个。
 *
 * ── 给下一个要下线某个功能的人 ──
 *
 * 这次的教训不是谁写错了代码,是「一个功能有两个入口,下线时只关了一个」。
 * 下线前先把**所有**把这个功能的文本送进提示词的路径找齐 —— 提示词渲染器、
 * atom / skill 的 SKILL.md、scenario 的 stage 声明、strategy recipe 的
 * stage contract —— 再逐条接到同一个判据上。
 *
 * 纯模块:不碰 fs / SQLite / 网络 / 环境变量。
 */

/** atom 目录名,也是 `installed_plugins` 里的 id(按小写查) */
export const CRITIQUE_THEATER_ATOM_ID = 'critique-theater';

export interface CritiquePromptGateOptions {
  /**
   * 这一轮**会不会真的注入评审剧场协议**。
   *
   * 传 server.ts 的 `critiqueShouldRun`,不要传 `isCritiqueEnabled()` 的裸结果 ——
   * 后者没算 adapter / 媒体面,协议在那些情况下同样不会注入。
   */
  critiqueEnabled: boolean;
}

/**
 * 过滤一个 stage 的 atom 列表,去掉这一轮**不该把 body 送进提示词**的那些。
 *
 * 只在协议不注入时摘掉 `critique-theater`;其余 atom 一个不动,顺序不变。
 * 没有可摘的就返回**同一个数组引用** —— 绝大多数 stage 走的是这条路,不必拷贝。
 */
export function atomsForPrompt(
  atomIds: ReadonlyArray<string>,
  opts: CritiquePromptGateOptions,
): ReadonlyArray<string> {
  if (opts.critiqueEnabled) return atomIds;
  // `loadAtomBodies` 用 `id.toLowerCase()` 查表,这里跟它同口径,
  // 免得 manifest 里写成 `Critique-Theater` 就从门缝里溜过去。
  const drop = atomIds.some((id) => id.toLowerCase() === CRITIQUE_THEATER_ATOM_ID);
  if (!drop) return atomIds;
  return atomIds.filter((id) => id.toLowerCase() !== CRITIQUE_THEATER_ATOM_ID);
}
