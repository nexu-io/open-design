/**
 * 组件 22 · 重连(84 格状态矩阵第 82–84 格)。
 *
 * 一条**状态**,不是一张卡 —— 设计稿把这三态全部去了框(`.tool:has(.orb)` /
 * `:has(.wifi)` 覆盖掉 `.tool` 的边与底):「它随时会自己消失,而且刻意不该抢注意力。
 * 套上边框和底色,它就成了和输入框并列的第二个块,等于把『别管它』说成了『看这里』。」
 * 形状三态一致,只有失败那格把图标转红。
 *
 * 三态:
 *   82 · 重连中    球 + 会扫光的「正在重新连接 2/5」+ ⌄
 *   83 · 最后一次  同上,只有计数走到 5/5 —— **不是独立形态**,不换任何样式
 *   84 · 重连失败  红 wifi-off + 「连接失败」+「重新连接」按钮,自动重连到此为止
 *
 * 恢复后**整行消失,不留「已恢复」**(cmp-ops 原话)。所以 `attempt <= 0` 时返回 null,
 * 调用方可以直接把 `DaemonReconnectState` 铺进来,不必自己判要不要挂载。
 *
 * 扫光复用 `primitives/record.module.css` 的 `.shimmer`:设计稿把「思考中 / 进行中 /
 * 正在重新连接」定义为同一条动画(「三处同款同号」),各自复制一份就等于把它分了叉。
 * 这里只**读**那个 Module,不往里加东西(见 components/chat/AGENTS.md §1b)。
 */
import type { ReactElement } from 'react';
import { Button } from '@open-design/components';
import { useT } from '../../i18n';
import type { ChatSelfHealReason } from '../../runtime/chat/reconnect-state';
import { ChevronIcon } from './primitives/icons';
import { Orb } from './primitives/Orb';
import record from './primitives/record.module.css';
import styles from './Reconnect.module.css';

export interface ReconnectProps {
  /**
   * 第几次。显示时夹进 `[1, max]` —— 传输层的重连预算会被 keepalive 空转续上
   * (见 `providers/daemon.ts` 的 `DaemonReconnectState`),读数可能大过预算,
   * 但屏幕上不该出现「7/5」。
   *
   * `<= 0` = 此刻没在掉线,整行不渲染。
   */
  attempt: number;
  /**
   * 共几次。取**当前这条读数自己的**预算:传输层是 `DaemonReconnectState.max`
   * (5),自动重试是那一轮的 `retry_max_attempts`(今天是 1)。两个预算不会混,
   * 因为一行只说一件事 —— 见 `reason`。
   */
  max: number;
  /**
   * 这一行在说哪一件「系统在自救」。默认是传输层重连(组件 22 的原义)。
   *
   * 为什么同一个组件说两件事:交付稿 4058 写死了「断线由 22 · 重连全程接管……
   * 再单立一个模块只会多出第三个说法」。用户体感里「线在重连」和「这一轮在重跑」
   * 是同一件事,形态也该一样。换掉的只有那句话 —— 重跑一轮时连接是通的,
   * 说「正在重新连接」既不准确,又会把「线真的断了」这句话说漏。
   */
  reason?: ChatSelfHealReason;
  /** 次数用尽:停止自动重连,交回给人(22-3)。 */
  exhausted?: boolean;
  /** 「重新连接」按下去做什么。不传就不出那颗按钮。 */
  onReconnect?: () => void;
  /**
   * 点 ⌄ 看断在哪(接口 / 超时 / 服务端)。
   *
   * **不传就不出这颗箭头,这是默认**:今天的传输层把 fetch 抛错、流提前关、
   * 只收到 keepalive 全走同一条路径,分不出断因(盘点 §2 第 82 格)。
   * 摆一颗点开什么都没有的箭头,比不摆更糟。等断因分类补上再从调用方接进来。
   */
  onShowDetail?: () => void;
}

export function Reconnect({
  attempt,
  max,
  exhausted = false,
  reason = 'transport',
  onReconnect,
  onShowDetail,
}: ReconnectProps): ReactElement | null {
  const t = useT();

  if (exhausted) {
    return (
      <div className={styles.row} data-testid="chat-reconnect">
        <WifiOffIcon />
        <span className={styles.name}>{t('chat.edge.reconnectFailed')}</span>
        {onReconnect
          ? (
            <Button variant="secondary" size="sm" onClick={onReconnect}>
              {t('chat.edge.reconnectCta')}
            </Button>
          )
          : null}
      </div>
    );
  }

  if (attempt <= 0) return null;

  const shown = Math.min(Math.max(attempt, 1), max);
  /*
   * 预算只有一次时不写分数。
   *
   * 「1/1」读起来像倒计时,而且一个信息都没给:一共就一次,而这一次正在用掉。
   * 设计稿那句「正在重试 1/2」预设的是两次预算,可 daemon 今天给的是一次
   * (`apps/daemon/src/run-retry-policy.ts` 的
   * `DEFAULT_SAFE_RUN_RETRY_MAX_ATTEMPTS = 1`,自建仓以来没变过;放宽到 2 是
   * `specs/current/run-error-catalog.md` 的 Q-11,**还没裁**)。
   *
   * 写成条件而不是写死「自动重试不显示分数」:预算真的放宽到 2 之后,同一段代码
   * 自动开始显示「1/2」,不用等谁想起来再改一次。传输层的 5 不受影响。
   */
  const showCount = max > 1;

  return (
    <div className={styles.row} data-testid="chat-reconnect">
      {/* 不给标签:紧挨着的就是那句话,读屏念一遍就够 */}
      <Orb state="searching" box={24} className={styles.orb} />
      <span className={styles.name}>
        <span className={record.shimmer}>
          {t(reason === 'agent-retry' ? 'chat.edge.retrying' : 'chat.edge.reconnecting')}
          {showCount ? <span className={styles.count}>{shown}/{max}</span> : null}
        </span>
      </span>
      {onShowDetail
        ? (
          /* 稿子 `729fa43ce7` 的 `src/body-components.html:324`:
             `<button class="ch mod-tip-e" aria-label="查看详情" data-tip="查看详情">`
             —— 纯图标按钮在稿子里一律带可见提示,原因见 `src/components.css:2677-2686`。
             `mod-tip-e`(气泡右缘对齐)不照搬:产品的气泡是 body portal,不会被
             overflow 容器裁掉,方位交给 `TooltipLayer` 的视口 clamp。 */
          <button
            type="button"
            className={`${styles.detail} od-tooltip`}
            aria-label={t('chat.edge.reconnectDetail')}
            data-tooltip={t('chat.edge.reconnectDetail')}
            onClick={onShowDetail}
          >
            <ChevronIcon />
          </button>
        )
        : null}
    </div>
  );
}

/**
 * 断线那一枚是**实心**图标,不是三条弧的线稿 —— 路径逐字取自设计稿第 84 格
 * (`svg.wifi.mod-off`),不重描。斜杠几乎占满 `0 0 24 24`,所以给它自己一档
 * 正方形 14px:框就是墨,套上线稿那档 17×14 会被拉扁。
 */
function WifiOffIcon(): ReactElement {
  return (
    <svg className={styles.wifi} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.0001 18C12.7144 18 13.3704 18.2497 13.8856 18.6665L12.0001 21L10.1145 18.6665C10.6297 18.2497 11.2857 18 12.0001 18ZM2.80766 1.39343L20.4853 19.0711L19.0711 20.4853L13.8913 15.3042C13.2967 15.1069 12.6609 15 12.0001 15C10.5719 15 9.26024 15.499 8.22998 16.3322L6.97363 14.7759C8.24961 13.7442 9.84925 13.0969 11.5964 13.01L9.00025 10.414C7.55273 10.8234 6.22651 11.5217 5.0878 12.4426L3.83099 10.8868C4.89946 10.0226 6.10763 9.32438 7.41633 8.83118L5.13168 6.5451C3.98878 7.08913 2.92058 7.76472 1.94666 8.55228L0.689453 6.99674C1.60358 6.25747 2.59156 5.60589 3.64058 5.05479L1.39345 2.80765L2.80766 1.39343ZM14.5004 10.2854L12.2165 8.00243L12 8C15.0947 8 17.9369 9.08141 20.1693 10.8869L18.9123 12.4426C17.6438 11.4167 16.1427 10.6672 14.5004 10.2854ZM12.0001 3.00003C16.2849 3.00003 20.22 4.49719 23.3109 6.99691L22.0534 8.55228C19.3061 6.33062 15.8085 5.00003 12.0001 5.00003C11.122 5.00003 10.2604 5.07077 9.42075 5.20685L7.72455 3.51088C9.09498 3.17702 10.5268 3.00003 12.0001 3.00003Z" />
    </svg>
  );
}
