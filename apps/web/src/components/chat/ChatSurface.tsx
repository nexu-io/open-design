import { type ReactNode, useState } from 'react';
import { Icon, type IconName } from '../Icon';

export type ChatSurfaceTone = 'neutral' | 'running' | 'done' | 'error' | 'warning' | 'awaiting';

export interface ChatSurfaceStatus {
  label: string;
  tone?: ChatSurfaceTone;
}

export interface ChatSurfaceHeaderProps {
  icon?: IconName;
  iconNode?: ReactNode;
  iconLabel?: string;
  title: ReactNode;
  meta?: ReactNode;
  status?: ChatSurfaceStatus | null;
  trailing?: ReactNode;
  disclosureOpen?: boolean;
}

export function ChatSurface({
  children,
  className = '',
  tone = 'neutral',
  testId,
}: {
  children: ReactNode;
  className?: string;
  tone?: ChatSurfaceTone;
  testId?: string;
}) {
  return (
    <div
      className={`chat-surface is-${tone}${className ? ` ${className}` : ''}`}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

export function ChatSurfaceHeader({
  icon,
  iconNode,
  iconLabel,
  title,
  meta,
  status,
  trailing,
  disclosureOpen,
}: ChatSurfaceHeaderProps) {
  return (
    <div className="chat-surface-head">
      {icon || iconNode ? (
        <span className="chat-surface-icon" aria-label={iconLabel} aria-hidden={iconLabel ? undefined : true}>
          {icon ? <Icon name={icon} size={13} /> : iconNode}
        </span>
      ) : null}
      <span className="chat-surface-title">{title}</span>
      {meta ? <span className="chat-surface-meta">{meta}</span> : null}
      {status ? <ChatSurfaceStatus status={status} /> : null}
      {trailing}
      {typeof disclosureOpen === 'boolean' ? (
        <span className="chat-surface-chevron" aria-hidden>
          <Icon name={disclosureOpen ? 'chevron-down' : 'chevron-right'} size={11} />
        </span>
      ) : null}
    </div>
  );
}

export function ChatSurfaceStatus({ status }: { status: ChatSurfaceStatus }) {
  return (
    <span className={`chat-surface-status is-${status.tone ?? 'neutral'}`}>
      {status.label}
    </span>
  );
}

export function ChatDisclosure({
  title,
  icon,
  iconNode,
  iconLabel,
  meta,
  status,
  defaultOpen = false,
  className = '',
  tone = 'neutral',
  children,
}: {
  title: ReactNode;
  icon?: IconName;
  iconNode?: ReactNode;
  iconLabel?: string;
  meta?: ReactNode;
  status?: ChatSurfaceStatus | null;
  defaultOpen?: boolean;
  className?: string;
  tone?: ChatSurfaceTone;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <ChatSurface className={`chat-disclosure${className ? ` ${className}` : ''}`} tone={tone}>
      <button
        type="button"
        className="chat-disclosure-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <ChatSurfaceHeader
          icon={icon}
          iconNode={iconNode}
          iconLabel={iconLabel}
          title={title}
          meta={meta}
          status={status}
          disclosureOpen={open}
        />
      </button>
      <div className={`accordion-collapsible${open ? ' open' : ''}`}>
        <div className="accordion-collapsible-inner">
          <div className="chat-disclosure-body">{children}</div>
        </div>
      </div>
    </ChatSurface>
  );
}
