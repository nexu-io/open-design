import type { StallForkNotice as StallForkNoticeData } from './types';
import styles from './StallForkNotice.module.css';

/**
 * 「新开会话继续」后的来源标识：告诉用户上下文从哪来、带了什么。
 * 渲染在新会话 chat-log 顶部（R8 新开会话动作的落地展示）。
 */
export function StallForkNotice({ notice }: { notice: StallForkNoticeData }) {
  return (
    <div className={styles.notice}>
      <span aria-hidden>⤴</span>
      <p>
        本会话从原会话继续，已携带{notice.carriedSummary}。
        {notice.onBackToOrigin ? (
          <button type="button" onClick={notice.onBackToOrigin}>
            查看原会话
          </button>
        ) : null}
      </p>
    </div>
  );
}
