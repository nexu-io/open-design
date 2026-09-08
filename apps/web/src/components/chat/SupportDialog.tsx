/**
 * 联系支持弹窗(设计稿组件 19 · 第 80 格)。
 *
 * 一个居中的小弹窗:标题一行 + 几行渠道,每行「图标 + 名字 + 一颗『加入』」。
 * 报错卡上那颗「联系支持」点开的就是它。
 *
 * 归属说明:它**不属于 chat**(设置 / 帮助菜单也要能进),所以只在这里落一个通用实现,
 * 由调用方决定挂在哪。渠道也由调用方给 —— 这一层不硬编任何社群地址。
 */
import { useEffect, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@open-design/components';
import { Icon } from '../Icon';
import { useT } from '../../i18n';
import { chatSeam } from './ChatRoot';
import styles from './SupportDialog.module.css';

export interface SupportChannel {
  id: string;
  name: string;
  href: string;
  icon: ReactElement;
}

export interface SupportDialogProps {
  channels: SupportChannel[];
  onClose: () => void;
  /** 测试与陈列页用:不走 portal,就地渲染 */
  inline?: boolean;
}

export function SupportDialog({ channels, onClose, inline }: SupportDialogProps): ReactElement | null {
  const t = useT();
  useEffect(() => {
    if (inline) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inline, onClose]);

  /*
   * 浮层形态自己带上 `--chat-*` 接缝。
   *
   * 它走 portal 挂到 `<body>` 下,而自定义属性按 **DOM 树**继承 —— 于是它落在
   * 页面上那个接缝之外,`background` / `box-shadow` / 遮罩的 `color-mix()`
   * 全部解析失败,弹窗整个透明、和背后的页面糊在一起(2026-08-27 真机量到
   * `--chat-bg` 是空串)。`ChatRoot.tsx` 的注释早写过这条:脱离接缝
   * 「组件会退化成无色无字号的裸结构 —— **而且不报错**」。
   *
   * 就地形态(陈列页那一格)本来就渲染在接缝之内,再挂一层是多余的,也会让
   * 陈列页多出一个 `data-chat-root`,把按这个属性数接缝的回归测试搅乱。
   */
  const seam = inline ? null : chatSeam();
  const dialog = (
    <div
      className={
        inline
          ? `${styles.overlay} ${styles.overlayInline}`
          : `${styles.overlay} ${seam?.className ?? ''}`.trim()
      }
      {...(seam ? { 'data-chat-root': seam['data-chat-root'] } : {})}
      data-testid="chat-support-dialog"
      // 点遮罩关掉;点弹窗本身不关
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.modal} role="dialog" aria-modal={!inline} aria-label={t('chat.support.title')}>
        <div className={styles.head}>
          <b>{t('chat.support.title')}</b>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t('common.close')}>
            <Icon name="close" size={14} />
          </button>
        </div>
        <div className={styles.body}>
          {channels.map((channel) => (
            <div className={styles.channel} key={channel.id} data-support-channel={channel.id}>
              <span className={styles.channelIcon}>{channel.icon}</span>
              <span className={styles.channelName}>{channel.name}</span>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => window.open(channel.href, '_blank', 'noopener,noreferrer')}
              >
                {t('chat.support.join')}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (inline) return dialog;
  if (typeof document === 'undefined') return null;
  return createPortal(dialog, document.body);
}
