import type { ReactElement } from 'react';

/**
 * Filled discuss-line glyph (Demo #8113), sized like the other chat-head
 * icons. Lives in its own module because two surfaces draw it: ChatPane's
 * conversation-history trigger, and the optimistic creation frame's inert
 * footprint of that trigger (OPEND-3334), which must be the same pixels.
 */
export function ChatHistoryGlyph(): ReactElement {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
      <path d="M14 22.5L11.2 19H6C5.44772 19 5 18.5523 5 18V7.10256C5 6.55028 5.44772 6.10256 6 6.10256H22C22.5523 6.10256 23 6.55028 23 7.10256V18C23 18.5523 22.5523 19 22 19H16.8L14 22.5ZM15.8387 17H21V8.10256H7V17H11.2H12.1613L14 19.2984L15.8387 17ZM2 2H19V4H3V15H1V3C1 2.44772 1.44772 2 2 2Z" />
    </svg>
  );
}
