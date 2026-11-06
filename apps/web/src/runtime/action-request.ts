// 分享 / 导出请求信号的「只消费一次」记录 —— **跨组件重挂有效**。
//
// `shareRequest` / `downloadRequest` 是 `ProjectView` 的状态,带一个 `nonce`,
// 设上之后**再也不清空**(全仓只有 `setShareRequest({...})`,没有一处置 null)。
// `FileViewer` 原来用组件内的 `useRef` 记「这个 nonce 消费过了」,而 ref 随组件
// 一起死:切标签页、切文件、工作区重挂,`FileViewer` 一卸载一重挂,ref 归零,
// 父组件里那个旧 nonce 就被当成新请求**重放一次**,菜单自己弹出来。
//
// 用户 2026-08-27:「这个弹窗动不动自己弹出来... 感觉这里重新显示会有 bug」。
//
// 同一个坑 `runtime/slide-nav.ts` 已经踩过并修好,它的 docblock 逐字描述了这件
// 事。这里是同一个解法用在分享/导出上:把「已消费」记在**组件外面**。
//
// 按 `${kind}:${projectId}:${fileName}` 记,于是:分享和导出各自独立;不同文件
// 互不干扰;用户再点一次会拿到新的 `Date.now()` nonce,照常打开。
const consumedActionNonces = new Map<string, number>();

export type ActionRequestKind = 'share' | 'download';

export function actionRequestKey(
  kind: ActionRequestKind,
  projectId: string,
  fileName: string,
): string {
  return `${kind}:${projectId}:${fileName}`;
}

/**
 * 每个 (key, nonce) 组合**只返回一次 true**,并把它记为已消费。
 * 已经消费过的 nonce 返回 false —— 包括组件重挂之后,这正是它存在的理由。
 */
export function shouldConsumeActionRequest(key: string, nonce: number): boolean {
  if (consumedActionNonces.get(key) === nonce) return false;
  consumedActionNonces.set(key, nonce);
  return true;
}

/** 测试缝:清掉所有消费记录。 */
export function resetConsumedActionRequestsForTests(): void {
  consumedActionNonces.clear();
}
