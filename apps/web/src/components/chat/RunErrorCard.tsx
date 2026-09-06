/**
 * 报错卡(设计稿组件 19 · 第 78 / 79 格)。
 *
 * **呈现层**:白卡 + 一行红标题 + 一段说明 + 靠右一排动作。
 * 「该出哪几颗按钮」是策略,不在这里 —— 那要看这一轮是授权失败、余额不够、
 * 还是本地环境跑不动,判断留在 `ChatPane`,按钮以 `actions` 传进来。
 *
 * 抽成组件之前它是 `ChatPane.tsx` 里 200 多行内联 JSX:样式没法集中对齐,
 * 陈列页也照不出来。这两件事都是抽出来才解决的。
 */
import { Button } from '@open-design/components';
import type { ComponentProps, PropsWithChildren, ReactElement, ReactNode } from 'react';
import styles from './RunErrorCard.module.css';

export interface RunErrorCardActionProps
  extends Omit<ComponentProps<typeof Button>, 'size' | 'variant'> {
  variant?: 'primary' | 'secondary';
}

/**
 * 报错卡动作的唯一壳。交互仍由共享 `Button` 提供；这里固定稿子这一排的
 * `mod-sm` 尺寸与 primary / secondary 视觉，避免调用方各自拼按钮。
 */
export function RunErrorCardAction({
  className,
  variant = 'secondary',
  ...props
}: RunErrorCardActionProps): ReactElement {
  const actionClassName = [
    styles.action,
    variant === 'primary' ? styles.primaryAction : styles.secondaryAction,
    className,
  ].filter(Boolean).join(' ');

  return (
    <Button
      {...props}
      className={actionClassName}
      variant={variant}
      size="sm"
      data-run-error-action={variant}
    />
  );
}

/**
 * Keep one recovery choice and its retry action together when the card wraps.
 * The outer footer still decides whether the group fits on the first line;
 * once it does not, both buttons move as one unit instead of leaving Retry
 * stranded on a line by itself.
 */
export function RunErrorCardActionGroup({ children }: PropsWithChildren): ReactElement {
  return <div className={styles.actionGroup}>{children}</div>;
}

export interface RunErrorCardProps {
  title: string;
  /** 一句人话:出了什么事、影响到哪 —— 稿子这一行走 `--text-muted`,不跟着标题变红 */
  description: ReactNode;
  /** 靠右那一排动作。顺序由调用方定(稿子:次要动作在左,主动作在最右) */
  actions?: ReactNode;
  /** 展开的诊断信息等附加内容,接在说明之后 */
  children?: ReactNode;
  /**
   * 保留 `data-user-action-card` 这个**测试与 e2e 的稳定钩子**。
   *
   * 这张卡从 `UserActionCard` 换过来时,形态变了(说明不再藏在折叠里),
   * 但「页面上有没有一张运行恢复卡」这个判据不该跟着改名 ——
   * 那会连带动 `e2e/lib/playwright/chat.ts` 和一批 web 测试,
   * 而它们要断言的东西一点没变。
   */
  dataKind?: string;
}

/**
 * 稿子标题前那一枚:**实心八边形 + 感叹号**(路径逐字节取自交付稿)。
 * 原来这里放的是三角警告 —— 形状不同,红色的重量也不一样:
 * 八边形是「停」,三角是「注意」,这一行说的是任务已经失败,不是提醒。
 */
function AlertIcon(): ReactElement {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.5 2.5L23 12L17.5 21.5H6.5L1 12L6.5 2.5H17.5ZM11 15V17H13V15H11ZM11 7V13H13V7H11Z" />
    </svg>
  );
}

export function RunErrorCard({ title, description, actions, children, dataKind }: RunErrorCardProps): ReactElement {
  return (
    <div
      className={styles.card}
      data-testid="chat-run-error-card"
      {...(dataKind ? { 'data-user-action-card': dataKind } : {})}
    >
      <div className={styles.title}>
        <AlertIcon />
        {title}
      </div>
      {/* `data-testid` 是稳定钩子:测试要能只看「给用户的那句话」,
          不被下面折叠着的诊断原文串味 —— E2 钉的正是这两者不许混。 */}
      <div className={styles.description} data-testid="chat-run-error-description">
        {description}
      </div>
      {children}
      {actions ? (
        /* `data-user-action-footer` 同样是保留下来的稳定钩子:测试与 e2e 用它
           定位「恢复动作那一排」,换组件不该让它们改选择器 */
        <div
          className={styles.ops}
          {...(dataKind ? { 'data-user-action-footer': 'true' } : {})}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}
