import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { Button } from '@open-design/components';
import styles from './ShareButton.module.css';

export type ShareButtonVariant = 'primary' | 'soft' | 'soft-error' | 'dark-sm';

export interface ShareButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: ShareButtonVariant;
  /**
   * `primary` only. Two of the four call sites this replaces hover
   * differently: `signInPrimaryAction` lightens on hover, ShareTab's own
   * `copyButton` deliberately does not ("the generic Button hover must not
   * wash the canvas's dark fill to white" — its hover target is itself).
   * Defaults to the lightening behavior; pass `false` to keep the flat one.
   */
  hoverLighten?: boolean;
  /**
   * `primary` only. While `aria-busy`+`disabled`, render a fully transparent
   * fill instead of the solid busy color, so a `<progress>` bar rendered
   * underneath (ShareProgressButton's upload variant) shows through. Used
   * only for ShareTab's real-percent upload state (S2); the reopen-busy
   * state (K4) has no progress number and keeps the solid fill.
   */
  transparentWhenBusy?: boolean;
  /**
   * `soft`/`soft-error` only. CommentSyncBanner's retry buttons dim to 60%
   * opacity while disabled (mid-retry POST); ShareTab's `updateButton` and
   * the sign-in-to-update action never declared that and fall back to the
   * shared `Button`'s own disabled treatment instead. Kept as an opt-in so
   * consolidating the two shapes doesn't add dimming neither had before.
   */
  dimDisabled?: boolean;
}

const VARIANT_CLASS: Record<ShareButtonVariant, string | undefined> = {
  primary: styles.primary,
  soft: styles.soft,
  'soft-error': `${styles.soft} ${styles.softError}`,
  'dark-sm': styles.darkSm,
};

/**
 * Shared share-panel button (2026 refactor: item 1). Replaces
 * `ShareTab.module.css`'s `.copyButton`/`.updateButton`, `CommentSyncBanner`'s
 * `.retry`/`.retryError`, and `AfterExportShareGuide`'s `.start` — four
 * independently hand-rolled near-duplicates (O4/O5) that had drifted apart in
 * their overrides. `ShareSignInButton` (OD-2) also renders the `primary`/
 * `soft` variants for the real sign-in button. Values come from
 * `../../styles/share-tokens.css`, not literals.
 */
export const ShareButton = forwardRef<HTMLButtonElement, ShareButtonProps>(function ShareButton(
  { variant, hoverLighten = true, transparentWhenBusy = false, dimDisabled = false, className, ...props },
  ref,
) {
  const modifiers = [
    VARIANT_CLASS[variant],
    variant === 'primary' && !hoverLighten ? styles.noHoverLighten : null,
    variant === 'primary' && transparentWhenBusy ? styles.transparentBusy : null,
    (variant === 'soft' || variant === 'soft-error') && dimDisabled ? styles.dimDisabled : null,
    className,
  ].filter(Boolean);
  return <Button ref={ref} className={modifiers.join(' ')} {...props} />;
});
