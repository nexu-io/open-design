import { type MouseEvent, type ReactNode, useState } from 'react';
import { Icon, type IconName } from '../Icon';

export type ChatSurfaceTone = 'neutral' | 'running' | 'done' | 'error' | 'warning' | 'awaiting';

export interface ChatSurfaceStatus {
  label: string;
  tone?: ChatSurfaceTone;
  hideLabel?: boolean;
}

export const CHAT_DISCLOSURE_TOGGLE_EVENT = 'open-design:chat-disclosure-toggle';

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
      {trailing ? <span className="chat-surface-trailing">{trailing}</span> : null}
      {typeof disclosureOpen === 'boolean' ? (
        <span className="chat-surface-chevron" aria-hidden>
          <Icon name={disclosureOpen ? 'chevron-down' : 'chevron-right'} size={11} />
        </span>
      ) : null}
    </div>
  );
}

export function ChatSurfaceStatus({ status }: { status: ChatSurfaceStatus }) {
  const tone = status.tone ?? 'neutral';
  if (status.hideLabel) return null;
  const legacyTone =
    tone === 'done' ? 'ok' : tone === 'running' ? 'running' : tone === 'error' ? 'error' : tone;
  return (
    <span className={`chat-surface-status op-status op-status-${legacyTone} is-${tone}`}>
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
  open: controlledOpen,
  onOpenChange,
  className = '',
  tone = 'neutral',
  testId,
  toggleTestId,
  children,
}: {
  title: ReactNode;
  icon?: IconName;
  iconNode?: ReactNode;
  iconLabel?: string;
  meta?: ReactNode;
  status?: ChatSurfaceStatus | null;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  tone?: ChatSurfaceTone;
  testId?: string;
  toggleTestId?: string;
  children: ReactNode;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const toggleOpen = (event: MouseEvent<HTMLButtonElement>) => {
    const nextOpen = !open;
    event.currentTarget.dispatchEvent(
      new CustomEvent(CHAT_DISCLOSURE_TOGGLE_EVENT, {
        bubbles: true,
        detail: { open: nextOpen },
      }),
    );
    setOpen(nextOpen);
  };
  return (
    <ChatSurface
      className={`chat-disclosure${className ? ` ${className}` : ''}`}
      tone={tone}
      testId={testId}
    >
      <button
        type="button"
        className="chat-disclosure-toggle"
        aria-expanded={open}
        data-testid={toggleTestId}
        onClick={toggleOpen}
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
      <div className={`accordion-collapsible${open ? ' open' : ''}`} aria-hidden={!open}>
        <div className="accordion-collapsible-inner">
          <div className="chat-disclosure-body">{children}</div>
        </div>
      </div>
    </ChatSurface>
  );
}
