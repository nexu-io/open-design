import type { ReactNode, Ref } from 'react';

interface NavButtonProps {
  active?: boolean;
  ariaLabel: string;
  label: string;
  iconOnly?: boolean;
  onClick: () => void;
  disabled?: boolean;
  testId?: string;
  /** Rail items that own a popup surface expose the button so the surface can
   *  return focus here on close, and advertise the popup's kind + open state. */
  buttonRef?: Ref<HTMLButtonElement>;
  ariaHasPopup?: 'dialog' | 'menu';
  ariaExpanded?: boolean;
  title?: string;
  children: ReactNode;
}
// The workspace column renders labels inline. Icon-only destinations use the
// shared tooltip layer, while aria-label keeps them named for AT.
export function NavButton({
  active,
  ariaLabel,
  label,
  iconOnly = false,
  onClick,
  disabled,
  testId,
  buttonRef,
  ariaHasPopup,
  ariaExpanded,
  title,
  children,
}: NavButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`entry-nav-rail__btn${active ? ' is-active' : ''}${title ? ' od-tooltip' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      aria-haspopup={ariaHasPopup}
      aria-expanded={ariaHasPopup ? Boolean(ariaExpanded) : undefined}
      title={title}
      data-tooltip={title}
      data-tooltip-placement={title ? 'right' : undefined}
      data-tooltip-tone={title && iconOnly ? 'inverse' : undefined}
      {...(testId ? { 'data-testid': testId } : {})}
    >
      <span className="entry-nav-rail__btn-icon" aria-hidden>{children}</span>
      {!iconOnly && <span className="entry-nav-rail__btn-label">{label}</span>}
    </button>
  );
}
