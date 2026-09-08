/**
 * 组件 20 · 暂停任务(84 格状态矩阵第 81 格)。
 *
 * 一行灰字,句首一枚跟正文同色的暂停符,**没有卡、没有按钮、没有第二句**。
 * cmp-ops 把边界写得很死:
 *
 *   1. 无操作 —— 只有这一句话。
 *   2. 不摊剩余步骤 —— 「是你自己按的暂停,剩几步、分别叫什么,上面那段执行记录
 *      本来就写着」(规格 D5:手动暂停只给一行文案,不显示剩余步数)。
 *   3. 断线不走这一行 —— 那由组件 22 · 重连全程接管。掉线时调用方渲染 `Reconnect`,
 *      不渲染这一行;两者不同时出现是调用方的接线约束,不在本组件里判。
 *
 * 这是一份「任务真的处于 paused 状态」的展示形态,不是 run 终态。用户按下停止后
 * 得到的 `runStatus: canceled` / `cancelOrigin: user_stop` 已由 AssistantMessage footer
 * 报「已手动停止」,不能再拿来驱动本组件,否则 live 与历史回放都会重复报一次。
 * 调用方必须先拿到独立的 paused-task 领域事实,再挂载本组件。
 *
 * 图标跟正文同色,不另染:「这一行报的是『停住了』这个事实,不是一条要人处理的告警;
 * 染色会把它抬成一条状态提示。」(设计稿 2769 附近原文)
 */
import type { ReactElement } from 'react';
import { useT } from '../../i18n';
import styles from './PauseLine.module.css';

export function PauseLine(): ReactElement {
  const t = useT();

  return (
    <div className={styles.line} data-testid="chat-pause-line">
      <PauseIcon />
      {t('chat.edge.paused')}
    </div>
  );
}

/**
 * 句首那枚暂停符。路径逐字取自设计稿第 81 格(`.stopline > svg`),不重描。
 * 走 `currentColor`,继承这一行的 `--chat-text-muted`。
 */
function PauseIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM9 9V15H11V9H9ZM13 9V15H15V9H13Z" />
    </svg>
  );
}
