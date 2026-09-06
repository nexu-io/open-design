/**
 * 「找所有者充值」弹窗 —— 余额耗尽 × **没有账单权限的团队成员**那两组
 * (规格 `specs/current/run-error-catalog.md` §6.V 的第 2 / 4 行)。
 *
 * 它同时是 §6.Y 那条死胡同的出口。在此之前,这类成员看到的是
 * `AmrBalanceDialog`,而那张弹窗的主按钮取自 `workspaceUpgradeUrl` ——
 * 该函数对没有 `canManageBilling` 的成员返回 `null`,于是三元落空,
 * **弹窗上只剩一颗「暂不需要」**:既不能升级,也没有「通知管理员」,
 * 任务就那么 park 在队列里。
 *
 * 所以这张弹窗的硬要求只有一条:**必须给出一条前进的路**。
 * 它不外跳(账单动作 B 会拒),而是把「该说什么、该找谁」交到成员手上 ——
 * 一键复制一句可以直接发给所有者的话。
 *
 * 文案由研发拟、产品复核(§6.V 原话);「找管理员 + 复制请求」是 §7 Q-04
 * 列出的候选之一,不是这里新发明的规则。
 */
import { useEffect, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';
import { Icon } from '../Icon';
import { useT } from '../../i18n';
import styles from './AmrOwnerTopUpDialog.module.css';

export interface AmrOwnerTopUpDialogProps {
  /** 关掉:任务留在队列里,和今天的「暂不需要」一样,只是不再是唯一选项。 */
  onClose: () => void;
  /** 测试与陈列页用:不走 portal,就地渲染。 */
  inline?: boolean;
}

/** 「已复制」提示挂多久后回到原样。 */
const COPIED_HINT_MS = 2_000;

export function AmrOwnerTopUpDialog({
  onClose,
  inline,
}: AmrOwnerTopUpDialogProps): ReactElement | null {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const requestText = t('chat.amrBalanceOwner.requestTemplate');

  useEffect(() => {
    if (inline) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inline, onClose]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_HINT_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyRequest = () => {
    // 复制失败也把提示打出来:那句话就摆在弹窗里,人照样可以自己选中复制,
    // 没必要为一次剪贴板权限失败把这条路也说成走不通。
    void navigator.clipboard?.writeText?.(requestText).catch(() => undefined);
    setCopied(true);
  };

  const dialog = (
    <div
      className={inline ? `${styles.overlay} ${styles.overlayInline}` : styles.overlay}
      data-testid="amr-balance-owner-dialog"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal={!inline}
        aria-label={t('chat.amrBalanceOwner.title')}
      >
        <div className={styles.head}>
          <b>{t('chat.amrBalanceOwner.title')}</b>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className={styles.body}>
          <p className={styles.message}>{t('chat.amrBalanceOwner.message')}</p>
          <p className={styles.request}>{requestText}</p>
          <div className={styles.actions}>
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t('chat.amrBalanceOwner.dismissCta')}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              data-testid="amr-balance-owner-copy"
              onClick={copyRequest}
            >
              {copied
                ? t('chat.amrBalanceOwner.copiedCta')
                : t('chat.amrBalanceOwner.copyCta')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  if (inline) return dialog;
  if (typeof document === 'undefined') return null;
  return createPortal(dialog, document.body);
}
