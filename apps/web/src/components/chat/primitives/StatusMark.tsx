/**
 * 「这一条成没成」的记号。只标单条记录,不承载整轮状态 —— 整轮状态在壳头的状态词上。
 *
 * 四种画法是**同一个圆**的四种样子(设计稿把它统一过一次):
 *   过了   一整张图(--chat-tick-img,盘绿勾挖空)—— 不是 svg,这样深浅主题不用各挑勾色
 *   跑砸   红叉
 *   在跑   转起来的球(`Orb`,上游 thinking-orbs 的引擎,D8 装包不内联)
 *   没开始 一圈虚线
 *   被打断 一圈实线,同一档中性灰(OPEND-2626)
 */
import type { ReactElement } from 'react';
import { useT } from '../../../i18n';
import type { StatusMarkProps } from './contract';
import { Orb } from './Orb';
import styles from './record.module.css';

export function StatusMark({ status, index }: StatusMarkProps): ReactElement {
  const t = useT();
  // 计划里还没跑的步骤用序号占那一格:此刻它唯一的身份就是「第几条」
  if (index != null && status === 'pending') {
    return <span className={styles.step}>{index}</span>;
  }

  if (status === 'ok') {
    // 图当底,里面不放东西 —— 勾是图的一部分
    return <span className={`${styles.mark} ${styles.ok}`} aria-label={t('chat.record.done')} role="img" />;
  }

  if (status === 'fail') {
    return (
      <span className={`${styles.mark} ${styles.fail}`} aria-label={t('chat.record.failed')} role="img">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 10.5858L9.17157 7.75736L7.75736 9.17157L10.5858 12L7.75736 14.8284L9.17157 16.2426L12 13.4142L14.8284 16.2426L16.2426 14.8284L13.4142 12L16.2426 9.17157L14.8284 7.75736L12 10.5858Z" />
        </svg>
      </span>
    );
  }

  if (status === 'running') {
    // 步骤级的「正在跑」用 solving 那一档(轮次级的用 connecting,在壳头上)
    /*
     * 稿子这一档是**纯 CSS 的自转绿球**(`.mk.is-run`),不是 thinking-orbs 的散点画布 ——
     * 散点那一档是**壳头**用的(connecting / composing)。用户 2026-08-26 真机指认。
     * `.sheen` / `.rim` 是稿子里那两层子元素,高光和内缘各占一层。
     */
    return (
      <span className={`${styles.mark} ${styles.run}`} role="img" aria-label={t('chat.record.running')}>
        <i className={styles.sheen} aria-hidden />
        <i className={styles.rim} aria-hidden />
      </span>
    );
  }

  if (status === 'skip') {
    // D16:取消沿用完成态 —— 设计稿另有红叉态,产品选了完成态
    return <span className={`${styles.mark} ${styles.ok}`} aria-label={t('chat.record.canceled')} role="img" />;
  }

  /**
   * **没跑完就结束了的那一条**(OPEND-2626)。
   *
   * 这一档原来落回下面的 `pending`,于是它和「从没开始过」共用同一枚虚线圈、
   * 共用同一个名字 `chat.record.pending`(en "Not started")。用户报的
   * 「三个计划步骤全部显示 Not started」就是这个:一轮跑到一半被停,屏幕上
   * 读出来像一步都没开始过。
   *
   * 名字用 `chat.record.unfinished`(en "Unfinished"),**不是**「已取消」——
   * `stopped` 有两个来源,判据在 `build-turn-blocks` 的 `closeRunningSegments`:
   *   ① 轮次被用户停掉;
   *   ② 轮次正常跑完,但 agent 收尾时没再发一次清单(succeeded 也会走到这里)。
   * ② 那一档没有任何人取消过它,写「已取消」就是编一个没发生过的事实
   * (`w85-orb-mark-say-term.test.tsx` 的「防真空」那一格钉着这条)。
   * 「没跑完、不知道成没成」是这两种来源共同为真的唯一说法,和
   * `closeRunningSegments` 的原话逐字一致。
   *
   * 颜色仍是中性灰 —— 那条裁决没变,「红要留给真的错误」;变的只有虚线换实线,
   * 好让「起过步」和「没起过步」在同一枚圈上分得开。
   * 不借 `skip` 那一档:那是 D16 的**作废**(agent 自己重新规划把它换掉了),
   * 产品给它选的是完成态的绿勾,拿来盖在没跑完的活上就是替 agent 说了它没说过的话。
   */
  if (status === 'stopped') {
    return (
      <span
        className={`${styles.mark} ${styles.stopped}`}
        aria-label={t('chat.record.unfinished')}
        role="img"
      />
    );
  }

  return <span className={`${styles.mark} ${styles.pending}`} aria-label={t('chat.record.pending')} role="img" />;
}
