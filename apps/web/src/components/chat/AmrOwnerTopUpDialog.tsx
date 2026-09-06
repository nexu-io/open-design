/**
 * 「找所有者充值」弹窗 —— 余额耗尽 × **没有账单权限的成员**那两组
 * (产品文档「四、升级情况」的第 2 / 4 行,规格 `run-error-catalog.md` §6.V)。
 *
 * 它同时是 §6.Y 那条死胡同的出口。在此之前,这类成员看到的是
 * `AmrBalanceDialog`,而那张弹窗的主按钮取自 `workspaceUpgradeUrl` ——
 * 该函数对没有 `canManageBilling` 的成员返回 `null`,于是三元落空,
 * **弹窗上只剩一颗「暂不需要」**:既不能升级,也没有「通知管理员」,
 * 任务就那么 park 在队列里。
 *
 * ⚠️ **2026-09-06 产品裁决(T56):这一档回到单出口。** 原来那颗「复制请求」
 * (一键复制一句可以直接发给所有者的话)整颗删除,产品原话「不要保留,严格按
 * 产品稿,不要私自发挥」。代价是明确的:§6.Y 那条「必须给出一条前进的路」的
 * 硬要求不再由这张弹窗满足 —— 现在它只说明「该找谁」,不再替你把话写好。
 * 产品知情。原来那份是**有授权的临时文案**(§6.V「文案由研发拟,产品复核」),
 * 这次是正式文案替换临时文案,不是推翻设计。
 *
 * 文案两个变体(T57,产品已批,一个字都不许改):
 *   拿得到 Owner 名字 → 「…请联系「{name}」完成充值后再继续使用。」
 *   拿不到           → 「…请联系团队所有者完成充值后再继续使用。」
 * 只有插值那一处不同,其余逐字相同。
 */
import { useEffect, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';
import { Icon } from '../Icon';
import { useT } from '../../i18n';
import styles from './AmrOwnerTopUpDialog.module.css';

export interface AmrOwnerTopUpDialogProps {
  /** 关掉:任务留在队列里,和今天的「暂不需要」一样。 */
  onClose: () => void;
  /**
   * 工作区所有者的显示名。
   *
   * **今天恒为空。** 契约里唯一的 owner 名是 `CollabProject.ownerDisplayName`
   * —— 项目级,而且它自己的注释逐字写着 "STUB: the real name source is B's
   * member roster";`WorkspaceCollabContext` 上没有工作区 owner 名。所以这里
   * 留出参数、由文案分支兜住,后端补上名字来源之后接上即可自动生效,不用再改
   * 一次文案。
   */
  ownerName?: string | null;
  /** 测试与陈列页用:不走 portal,就地渲染。 */
  inline?: boolean;
}

export function AmrOwnerTopUpDialog({
  onClose,
  ownerName,
  inline,
}: AmrOwnerTopUpDialogProps): ReactElement | null {
  const t = useT();
  const name = ownerName?.trim();
  const message = name
    ? t('chat.amrBalanceOwner.message', { name })
    : t('chat.amrBalanceOwner.messageNoOwnerName');

  useEffect(() => {
    if (inline) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inline, onClose]);

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
          <p className={styles.message}>{message}</p>
          <div className={styles.actions}>
            <Button
              type="button"
              variant="primary"
              size="sm"
              data-testid="amr-balance-owner-dismiss"
              onClick={onClose}
            >
              {t('chat.amrBalanceOwner.dismissCta')}
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
