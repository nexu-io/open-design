/**
 * 升级卡(设计稿组件 18 · 第 75 / 76 格)。
 *
 * **流水里的一张卡,不是弹窗**:余额 + 一颗 Upgrade + 一句「为什么现在告诉你」。
 * 走 D4「不阻塞」的取向 —— 它不挡发送,只是把话说清楚。
 *
 * 出现时机由用户 2026-08-26 裁决:**一轮跑完之后**(规格 D58)。
 * 产品原有的 `AmrLowBalanceDialog` 是居中硬阻断弹窗,两者不是一个东西,
 * 那个的去留另记(见规格 T40)。
 *
 * 两档由余额本身决定,没有第三档:
 *   余额 > 0 但撑不住下一轮   暖橙数字 +「余额可能撑不完下一个任务 —— 中途用尽会停在半成品上」
 *   余额 = 0                 红数字   +「现在无法开始新任务」
 *
 * ## 版式(PR #7170 改版)
 *
 * 卡分上下两段,中间压一条细线:
 *
 *   卡头   剩余额度 $3.20            ——「事实」
 *   ────────────────────────────
 *   底排   为什么现在告诉你   [升级]  ——「所以呢 / 那我能做什么」
 *
 * CTA 从卡头搬到了底排,**和它对应的那句话同行**。旧版式里说明句被挤在按钮下方
 * 另起一段,眼睛得在「按钮」和「按钮的理由」之间来回跳一次;搬到同一排之后,
 * 一句话一个出口,读完即可动手。两档共用这一副版式,只有金额的颜色和那句话不同。
 *
 * CTA 点下去**去哪由身份 × 订阅决定**,不在这个组件里:落点由宿主通过 `onUpgrade`
 * 传进来(`ProjectView.handleAmrBalanceCardUpgrade` → `amrBalanceUpgradeIntent`)。
 * 这张卡只负责把出口画出来 —— 四种身份共用同一颗按钮、同一句文案,
 * 差别全在按下去之后落在哪个面上。
 */
import type { ReactElement } from 'react';
import { Button } from '@open-design/components';
import { useT } from '../../i18n';
import styles from './UpgradeCard.module.css';

export interface UpgradeCardProps {
  /** 钱包余额(美元)。来自 `AmrWalletSnapshot.balanceUsd` */
  balanceUsd: number;
  onUpgrade?: () => void;
}

/**
 * 稿子那枚闪光(两颗星,一大一小),路径逐字取自交付稿。
 *
 * 尺寸跟着按钮一起从卡头那一档(13px)长到底排那一档:稿子
 * `.up .up-bottom .btn svg { width: 20px; height: 20px }`。属性和 CSS 都写一遍 ——
 * 属性管的是没有样式表时的固有尺寸,CSS 那条才是层叠里作数的那个。
 */
function SparkIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden width="20" height="20">
      <path d="M10.6144 17.7956 11.492 15.7854C12.2731 13.9966 13.6789 12.5726 15.4325 11.7942L17.8482 10.7219C18.6162 10.381 18.6162 9.26368 17.8482 8.92277L15.5079 7.88394C13.7092 7.08552 12.2782 5.60881 11.5105 3.75894L10.6215 1.61673C10.2916.821765 9.19319.821767 8.8633 1.61673L7.97427 3.75892C7.20657 5.60881 5.77553 7.08552 3.97685 7.88394L1.63658 8.92277C.868537 9.26368.868536 10.381 1.63658 10.7219L4.0523 11.7942C5.80589 12.5726 7.21171 13.9966 7.99275 15.7854L8.8704 17.7956C9.20776 18.5682 10.277 18.5682 10.6144 17.7956ZM19.4014 22.6899 19.6482 22.1242C20.0882 21.1156 20.8807 20.3125 21.8695 19.8732L22.6299 19.5353C23.0412 19.3526 23.0412 18.7549 22.6299 18.5722L21.9121 18.2532C20.8978 17.8026 20.0911 16.9698 19.6586 15.9269L19.4052 15.3156C19.2285 14.8896 18.6395 14.8896 18.4628 15.3156L18.2094 15.9269C17.777 16.9698 16.9703 17.8026 15.956 18.2532L15.2381 18.5722C14.8269 18.7549 14.8269 19.3526 15.2381 19.5353L15.9985 19.8732C16.9874 20.3125 17.7798 21.1156 18.2198 22.1242L18.4667 22.6899C18.6473 23.104 19.2207 23.104 19.4014 22.6899Z" />
    </svg>
  );
}

/** 余额按美元两位小数写,和稿子的 `$3.20` / `$0.00` 一致 */
export function formatBalanceUsd(balanceUsd: number): string {
  const safe = Number.isFinite(balanceUsd) ? Math.max(0, balanceUsd) : 0;
  return `$${safe.toFixed(2)}`;
}

export function UpgradeCard({ balanceUsd, onUpgrade }: UpgradeCardProps): ReactElement {
  const t = useT();
  const out = !(balanceUsd > 0);
  return (
    <div className={styles.up} data-testid="chat-upgrade-card" data-out={out ? 'true' : 'false'}>
      {/* 卡头只报事实。稿子 `.up .h`:底下压一条细线,右侧留出 48px 给那枚辉光。 */}
      <div className={styles.head}>
        <span className={`${styles.amount}${out ? ` ${styles.out}` : ''}`}>
          <span>
            {t('chat.upgrade.balance')} <b>{formatBalanceUsd(balanceUsd)}</b>
          </span>
        </span>
      </div>
      {/* 底排:说明句在左、出口在右,窄卡时由 flex-wrap 自己折成两行。
          按钮不再是 `size="sm"` —— 稿子把它从卡头那枚方块换成了底排 44px 的
          触达档(`.up .up-bottom .btn`),尺寸在 Module 里对着祖先链写死。 */}
      <div className={styles.bottom}>
        <p className={styles.why}>{out ? t('chat.upgrade.whyOut') : t('chat.upgrade.whyLow')}</p>
        <Button
          type="button"
          variant="primary"
          className={styles.cta}
          onClick={onUpgrade}
          disabled={!onUpgrade}
        >
          <SparkIcon />
          {t('settings.amrUpgrade')}
        </Button>
      </div>
    </div>
  );
}
