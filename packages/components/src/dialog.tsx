import {
  useEffect,
  type ComponentPropsWithoutRef,
  type FormEventHandler,
  type MouseEvent,
  type ReactNode,
} from 'react';

import { joinClassNames } from './class-names';
import styles from './dialog.module.css';

type DialogTag = 'div' | 'form';

type DialogLayout = 'default' | 'sectioned';

export interface DialogProps {
  children: ReactNode;
  onClose?: () => void;
  className?: string;
  backdropClassName?: string;
  includeChromeClassName?: boolean;
  id?: string;
  role?: 'dialog' | 'alertdialog';
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  layout?: DialogLayout;
  as?: DialogTag;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  [key: `data-${string}`]: string | number | undefined;
}

type DialogSectionProps = ComponentPropsWithoutRef<'div'>;

type DialogHeadingProps = ComponentPropsWithoutRef<'h2'>;

type DialogDescriptionProps = ComponentPropsWithoutRef<'p'>;

export function Dialog({
  children,
  onClose,
  className,
  backdropClassName,
  includeChromeClassName = true,
  id,
  role = 'dialog',
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  closeOnBackdrop = true,
  closeOnEscape = false,
  layout = 'default',
  as = 'div',
  onSubmit,
  ...dataAttributes
}: DialogProps) {
  useEffect(() => {
    if (!onClose || !closeOnEscape) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose?.();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [closeOnEscape, onClose]);

  const sharedProps = {
    id,
    className: joinClassNames(
      includeChromeClassName ? styles.dialog : undefined,
      includeChromeClassName && layout === 'sectioned' ? styles.dialogSectioned : undefined,
      includeChromeClassName ? 'modal' : undefined,
      className,
    ),
    onClick: (event: MouseEvent<HTMLElement>) => event.stopPropagation(),
    role,
    'aria-modal': 'true' as const,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': ariaDescribedBy,
    ...dataAttributes,
  };

  return (
    <div
      className={joinClassNames(
        includeChromeClassName ? styles.backdrop : undefined,
        includeChromeClassName ? 'modal-backdrop' : undefined,
        backdropClassName,
      )}
      onClick={closeOnBackdrop ? onClose : undefined}
      role="presentation"
    >
      {as === 'form' ? (
        <form {...sharedProps} onSubmit={onSubmit}>
          {children}
        </form>
      ) : (
        <div {...sharedProps}>{children}</div>
      )}
    </div>
  );
}

export function DialogHeader({ className, ...props }: DialogSectionProps) {
  return <div className={joinClassNames(styles.header, className)} {...props} />;
}

export function DialogBody({ className, ...props }: DialogSectionProps) {
  return <div className={joinClassNames(styles.body, className)} {...props} />;
}

export function DialogFooter({ className, ...props }: DialogSectionProps) {
  return <div className={joinClassNames(styles.footer, className)} {...props} />;
}

export function DialogTitle({ className, ...props }: DialogHeadingProps) {
  return <h2 className={joinClassNames(styles.title, className)} {...props} />;
}

export function DialogDescription({ className, ...props }: DialogDescriptionProps) {
  return <p className={joinClassNames(styles.description, className)} {...props} />;
}
